// MycelialSteward - Unified Letta adapter for all backstage agents
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getLettaClient, getLettaAgentId } from './letta_client.js';
import normalizeLettaPatch from './letta_normalizer.js';

/**
 * Unified Input Schema:
 * {
 *   timestamp: number,
 *   state: {
 *     players: [{id, name, inventory, messageCount}],
 *     stockpile: {moss, cedar, resin, spores, charms},
 *     activeQuest: {id, name, recipe, percent} | null,
 *     activeVote: {id, topic, options, tally, closesAt, status} | null,
 *     openOffers: [{id, fromPlayer, give, want}],
 *     memoryStones: [{id, title, text, tags}],
 *     recentActions: [{playerId, action, text, timestamp}],
 *     journalQueue: [{id, playerId, text, timestamp}],
 *     batchedMessages: [{user, text, timestamp, intent}]
 *   },
 *   context: {
 *     messagesSincePulse: number,
 *     timeSincePulse: number,
 *     activeWarnings: [{playerId, count}]
 *   }
 * }
 * 
 * Unified Output Schema (Patch):
 * {
 *   trades: {
 *     resolve: [offerId],
 *     cancel: [offerId]
 *   },
 *   vote: {
 *     close: boolean,
 *     decisionCard?: {topic, winner, summary, narrative}
 *   },
 *   resources: {
 *     stockpileDeltas: {item: delta},
 *     questPercentDelta: number
 *   },
 *   archive: {
 *     promoteJournals: [journalId],
 *     pruneStones: [stoneId],
 *     newStones: [{title, text, tags}]
 *   },
 *   safety: {
 *     warnings: [{playerId, reason, action: "warn"|"block"}],
 *     calmDown: [playerId]
 *   },
 *   cadence: {
 *     shouldElderSpeak: boolean,
 *     triggerReason?: string
 *   },
 *   elder_instructions: {
 *     should_speak: boolean,
 *     mode: "broadcast" | "dm",
 *     target_user_id: string | null,
 *     tone: "encouraging" | "warning" | "celebratory" | "reflective" | "neutral",
 *     context_summary: string,
 *     referenced_messages: [userId],
 *     conversation_thread: string
 *   }
 * }
 */

/**
 * Compute Letta mode at call time based on environment
 */
function computeLettaMode() {
  const llm = (process.env.LLM_MODE || '').trim().toUpperCase();
  const hasKey = !!process.env.LETTA_API_KEY;
  
  if (llm === 'LIVE' && hasKey) {
    return { mode: 'LIVE', reason: null };
  }
  if (llm !== 'LIVE') {
    return { mode: 'MOCK', reason: "LLM_MODE!='LIVE'" };
  }
  return { mode: 'MOCK', reason: 'missing LETTA_API_KEY' };
}

class MycelialSteward {
  constructor() {
    this.apiKey = process.env.LETTA_API_KEY;
    this.baseUrl = process.env.LETTA_BASE_URL || 'https://api.letta.ai/v1';
    
    this.healthy = true;
    this.lastError = null;
    this.lastRequestId = null;
    this.systemPrompt = this.loadSystemPrompt();
    
    // Ring buffer for last LIVE request/response
    this.lastRequest = null;
    this.lastResponsePreview = null;
    this.lastRun = null;
  }

  loadSystemPrompt() {
    try {
      const promptPath = resolve('./prompts/mycelial_steward.txt');
      return readFileSync(promptPath, 'utf-8');
    } catch (error) {
      console.warn('Could not load MycelialSteward prompt, using default');
      return this.getDefaultPrompt();
    }
  }

  getDefaultPrompt() {
    return `You are the Mycelial Steward, coordinating all backstage village operations.
Analyze the current state and return a JSON patch with necessary actions.
Always return valid JSON matching the output schema.`;
  }

  /**
   * Send tick to Letta API and return patch
   * @param {Object} state - Unified state payload
   * @returns {Promise<Object>} Normalized patch output
   */
  async sendTick(state) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.lastRequestId = requestId;

    // Compute mode at call time
    const { mode, reason } = computeLettaMode();

    if (mode === 'LIVE' && this.apiKey) {
      try {
        console.log(`[MycelialSteward:${requestId}] Sending tick to Letta API`);
        const result = await this.callLettaAPI(state, requestId);
        this.healthy = true;
        this.lastError = null;
        const patch = this.validatePatchShape(result);
        console.log(`[MycelialSteward:${requestId}] Success - cadence: ${patch.cadence.shouldElderSpeak}, vote: ${patch.vote.close}`);
        return patch;
      } catch (error) {
        console.error(`[MycelialSteward:${requestId}] Error - ${error.message}, falling back to MOCK`);
        this.healthy = false;
        this.lastError = error.message;
        return this.mockOrchestrate({ state, context: state.context || {} });
      }
    }

    console.log(`[MycelialSteward:${requestId}] MOCK mode${reason ? ` (${reason})` : ''}`);
    return this.mockOrchestrate({ state, context: state.context || {} });
  }

  /**
   * Main orchestration method (backwards compatible)
   * @param {Object} input - Unified input state
   * @returns {Promise<Object>} Normalized patch output
   */
  async orchestrate(input) {
    return this.sendTick(input.state || input);
  }

  /**
   * Wait for run completion by polling
   */
  async waitForRunCompletion(client, runId, { timeoutMs = 20000, pollMs = 500 } = {}) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const run = await client.runs.retrieve(runId);
        const status = run.status;
        
        if (['completed', 'failed', 'cancelled', 'expired'].includes(status)) {
          return { status, run };
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollMs));
      } catch (err) {
        console.warn(`[MycelialSteward] Error polling run ${runId}: ${err.message}`);
        return { status: 'error', run: null };
      }
    }
    
    return { status: 'timeout', run: null };
  }

  /**
   * Extract text from message content parts
   */
  extractTextFromMessageContent(contentParts) {
    if (typeof contentParts === 'string') {
      return contentParts;
    }
    
    if (Array.isArray(contentParts)) {
      const textParts = [];
      for (const part of contentParts) {
        // Handle various text formats
        if (typeof part === 'string') {
          textParts.push(part);
        } else if (part.type === 'text' && part.text) {
          textParts.push(part.text);
        } else if (part.type === 'output_text' && part.text) {
          textParts.push(part.text);
        } else if (part.text) {
          textParts.push(part.text);
        }
      }
      return textParts.length > 0 ? textParts.join('\n') : null;
    }
    
    return null;
  }

  /**
   * Strip code fences from text if present
   * Returns { text, wasFenced }
   */
  stripCodeFences(text) {
    if (!text) return { text: '', wasFenced: false };
    
    const trimmed = text.trim();
    
    // Check if starts with ``` (code fence)
    if (trimmed.startsWith('```')) {
      // Find first newline (end of language hint line)
      const firstNewline = trimmed.indexOf('\n');
      if (firstNewline === -1) return { text: trimmed, wasFenced: false };
      
      // Find closing ```
      const closingFence = trimmed.lastIndexOf('```');
      if (closingFence > firstNewline) {
        // Extract content between fences
        const content = trimmed.substring(firstNewline + 1, closingFence).trim();
        return { text: content, wasFenced: true };
      }
    }
    
    return { text: trimmed, wasFenced: false };
  }

  /**
   * Try to extract JSON from text robustly
   * Returns { json, wasFenced } or null
   */
  tryExtractJson(text) {
    if (!text) return null;
    
    // Strip code fences if present
    const { text: cleanText, wasFenced } = this.stripCodeFences(text);
    
    // Try direct parse first
    try {
      return { json: JSON.parse(cleanText), wasFenced };
    } catch (e) {
      // Try extracting between first { and last }
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonSubstr = cleanText.substring(firstBrace, lastBrace + 1);
        try {
          return { json: JSON.parse(jsonSubstr), wasFenced };
        } catch (e2) {
          return null;
        }
      }
    }
    
    return null;
  }

  /**
   * Call Letta API via SDK with robust error handling and run polling
   */
  async callLettaAPI(input, requestId) {
    try {
      // Get agent ID - will throw if missing
      const agentId = getLettaAgentId();
      
      // Get SDK client - will throw if missing API key
      const client = getLettaClient();
      
      // Build request body EXACTLY as Letta requires
      const body = {
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Return ONLY a single JSON object per the schema you were configured with. No prose." 
              },
              { 
                type: "text", 
                text: JSON.stringify(input) 
              }
            ]
          }
        ]
      };
      
      // Store last request preview (first 300 chars)
      const bodyStr = JSON.stringify(body);
      this.lastRequest = {
        agentId,
        bodyPreview: bodyStr.substring(0, 300)
      };
      
      // Call SDK to send message
      console.log(`[MycelialSteward:${requestId}] Calling agents.messages.create`);
      const response = await client.agents.messages.create(agentId, body);
      
      // Attempt to extract assistant text in priority order
      let assistantText = null;
      
      // a) res.message?.content
      if (response.message?.content) {
        assistantText = this.extractTextFromMessageContent(response.message.content);
        if (assistantText) {
          console.log(`[MycelialSteward:${requestId}] Found assistant text in response.message.content`);
        }
      }
      
      // b) res.messages?.filter(m => m.role==='assistant').pop()?.content
      if (!assistantText && response.messages && response.messages.length > 0) {
        const assistantMsgs = response.messages.filter(m => m.role === 'assistant');
        if (assistantMsgs.length > 0) {
          assistantText = this.extractTextFromMessageContent(assistantMsgs[assistantMsgs.length - 1].content);
          if (assistantText) {
            console.log(`[MycelialSteward:${requestId}] Found assistant text in response.messages`);
          }
        }
      }
      
      // c) res.messages?.filter(m => m.messageType==='assistant_message').pop()?.content
      if (!assistantText && response.messages && response.messages.length > 0) {
        const assistantMsgs = response.messages.filter(m => m.messageType === 'assistant_message');
        if (assistantMsgs.length > 0) {
          assistantText = this.extractTextFromMessageContent(assistantMsgs[assistantMsgs.length - 1].content);
          if (assistantText) {
            console.log(`[MycelialSteward:${requestId}] Found assistant text in messageType==='assistant_message'`);
          }
        }
      }
      
      // If no assistant text found and res.runId exists, poll for run completion
      if (!assistantText && response.runId) {
        console.log(`[MycelialSteward:${requestId}] No assistant text in immediate response, polling run ${response.runId}`);
        
        const { status, run } = await this.waitForRunCompletion(client, response.runId);
        this.lastRun = { runId: response.runId, polledStatus: status };
        
        if (status === 'completed' && run) {
          console.log(`[MycelialSteward:${requestId}] Run completed, fetching messages`);
          
          // Fetch run messages
          try {
            const runMessages = await client.runs.messages.list(response.runId);
            
            if (runMessages && runMessages.length > 0) {
              // Find last assistant message
              for (let i = runMessages.length - 1; i >= 0; i--) {
                const msg = runMessages[i];
                if (msg.role === 'assistant' || msg.messageType === 'assistant_message') {
                  assistantText = this.extractTextFromMessageContent(msg.content);
                  if (assistantText) {
                    console.log(`[MycelialSteward:${requestId}] Found assistant text in run messages`);
                    break;
                  }
                }
              }
            }
          } catch (msgErr) {
            console.warn(`[MycelialSteward:${requestId}] Error fetching run messages: ${msgErr.message}`);
          }
        } else {
          console.warn(`[MycelialSteward:${requestId}] Run polling failed with status: ${status}`);
        }
      }
      
      // Store response preview
      if (assistantText) {
        this.lastResponsePreview = assistantText.substring(0, 400);
      } else {
        // Build summary of what we saw
        const msgTypes = response.messages?.map(m => m.role || m.messageType).join(', ') || 'none';
        this.lastResponsePreview = `messages[${response.messages?.length || 0}] types: ${msgTypes}${response.runId ? `, runId: ${response.runId}` : ''}`;
      }
      
      // If still no assistant text, return no-op
      if (!assistantText) {
        this.lastError = "no assistant content".substring(0, 200);
        this.healthy = false;
        console.warn(`[MycelialSteward:${requestId}] No assistant content found, returning no-op patch`);
        return this.getNoOpPatch();
      }
      
      // Try to extract JSON
      const extractResult = this.tryExtractJson(assistantText);
      
      if (!extractResult) {
        this.lastError = "assistant content not JSON".substring(0, 200);
        this.healthy = false;
        console.warn(`[MycelialSteward:${requestId}] Assistant content not valid JSON, returning no-op patch`);
        return this.getNoOpPatch();
      }
      
      // Update response preview to indicate if fenced
      if (extractResult.wasFenced) {
        this.lastResponsePreview = `[fenced] ${assistantText.substring(0, 380)}`;
      }
      
      // Success!
      this.healthy = true;
      this.lastError = null;
      return extractResult.json;
      
    } catch (err) {
      // Capture error details with truncation
      let errorDetails = String(err);
      if (err.body) {
        const bodyStr = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
        errorDetails = bodyStr.substring(0, 200);
      } else if (err.message) {
        errorDetails = err.message.substring(0, 200);
      }
      
      this.lastError = errorDetails;
      this.healthy = false;
      
      // Robust error formatting based on error type
      if (err.name === 'LettaError' || err.constructor.name === 'LettaError') {
        console.error(`[MycelialSteward:${requestId}] LettaError`, {
          status: err.statusCode || err.status,
          message: err.message,
          body: err.body
        });
      } else if (err.message && (err.message.includes('LETTA_API_KEY') || err.message.includes('LETTA_AGENT_ID'))) {
        // Configuration error
        console.error(`[MycelialSteward:${requestId}] ConfigError`, {
          message: err.message
        });
      } else {
        // Network or other error
        console.error(`[MycelialSteward:${requestId}] NetworkError`, {
          message: String(err)
        });
      }
      throw err;
    }
  }

  /**
   * Normalize Letta patch with exact transformation rules and alternate key support
   */
  normalizeLettaPatch(response, serverContext = {}) {
    try {
      // Try to parse if string
      let parsed = response;
      if (typeof response === 'string') {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn('[MycelialSteward] No JSON found in response');
          return this.getNoOpPatch();
        }
        parsed = JSON.parse(jsonMatch[0]);
      }

      const normalized = {};

      // 1. CADENCE: Handle special quest threshold reasons
      let cadenceReason = parsed.cadence?.trigger_reason || parsed.cadence?.triggerReason || parsed.cadence?.reason || null;
      let questThresholdValue = null;
      
      // Map quest_percent_crossed_XX to "quest_threshold"
      if (cadenceReason && cadenceReason.startsWith('quest_percent_crossed_')) {
        const match = cadenceReason.match(/quest_percent_crossed_(\d+)/);
        if (match) {
          questThresholdValue = parseInt(match[1], 10);
          cadenceReason = 'quest_threshold';
        }
      }
      
      normalized.cadence = {
        shouldElderSpeak: parsed.cadence?.mode ? true : Boolean(parsed.cadence?.should_elder_speak || parsed.cadence?.shouldElderSpeak),
        triggerReason: cadenceReason,
        mode: parsed.cadence?.mode || null,
        question: serverContext.question || parsed.cadence?.question || null
      };

      // 2. VOTE: Handle "tallies" → "tally" rename; status "ACTIVE"→"OPEN"
      const voteData = parsed.vote || {};
      const tally = voteData.tally || voteData.tallies || {};
      
      normalized.vote = {
        status: voteData.status === 'ACTIVE' ? 'OPEN' : (voteData.status || null),
        close: Boolean(voteData.close),
        tally,
        winner: voteData.winner || null,
        close_reason: voteData.close_reason || voteData.closeReason || null,
        decisionCard: voteData.decisionCard || voteData.decision_card || null
      };

      // 3. RESOURCES: Handle misspellings, needs object → array, threshold_crossed coercion
      const resourcesData = parsed.resources || {};
      
      // Handle needs: always coerce to array of {item, qty}
      const needs = resourcesData.needs || {};
      const needsArray = Array.isArray(needs) ? needs : 
        Object.entries(needs).map(([item, qty]) => ({ item, qty }));

      // Handle threshold_crossed with various key names and types
      let thresholdInfo = { threshold_crossed: false, crossed_at: null };
      
      // Try various key names for threshold (handle misspellings)
      const tc = resourcesData.threshold_crossed ?? 
                 resourcesData.thresholdCrossed ?? 
                 resourcesData.threshold_cross ?? 
                 resourcesData.threshold;
      
      if (typeof tc === 'number') {
        thresholdInfo = { threshold_crossed: true, crossed_at: tc };
      } else if (tc === true) {
        thresholdInfo = { threshold_crossed: true, crossed_at: resourcesData.crossed_at || questThresholdValue || Date.now() };
      } else if (tc === false) {
        thresholdInfo = { threshold_crossed: false, crossed_at: null };
      }
      
      // If cadence had quest_percent_crossed_XX, set threshold info
      if (questThresholdValue !== null && !thresholdInfo.threshold_crossed) {
        thresholdInfo = { threshold_crossed: true, crossed_at: questThresholdValue };
      }

      normalized.resources = {
        needs: needsArray,
        threshold_crossed: thresholdInfo.threshold_crossed,
        crossed_at: thresholdInfo.crossed_at,
        stockpileDeltas: resourcesData.stockpileDeltas || resourcesData.stockpile_deltas || {},
        questPercentDelta: Number(resourcesData.questPercentDelta || resourcesData.quest_percent_delta || 0)
      };

      // 4. TRADES: resolutions with status "COMPLETED" → actions; "FAILED" → empty + log
      const resolutions = parsed.trades?.resolutions || [];
      const actions = [];
      
      for (const res of resolutions) {
        if (res.status === 'COMPLETED') {
          actions.push({
            type: 'RESOLVE',
            id: res.id || res.offer_id,
            from: res.from || res.fromPlayer,
            to: res.to || res.toPlayer
          });
        } else if (res.status === 'FAILED') {
          console.log(`[MycelialSteward] Trade ${res.id} failed: ${res.reason || 'unknown'}`);
        }
      }

      normalized.trades = {
        actions,
        resolve: parsed.trades?.resolve || [],
        cancel: Array.isArray(parsed.trades?.cancel) ? parsed.trades.cancel : []
      };

      // 5. ARCHIVE: promote → promote_ids + new_stones; prune → prune_ids; ensure merge_pairs
      normalized.archive = {
        promote_ids: Array.isArray(parsed.archive?.promote) ? parsed.archive.promote : 
                     (Array.isArray(parsed.archive?.promote_ids) ? parsed.archive.promote_ids : 
                      (Array.isArray(parsed.archive?.promoteJournals) ? parsed.archive.promoteJournals : [])),
        prune_ids: Array.isArray(parsed.archive?.prune) ? parsed.archive.prune :
                   (Array.isArray(parsed.archive?.prune_ids) ? parsed.archive.prune_ids :
                    (Array.isArray(parsed.archive?.pruneStones) ? parsed.archive.pruneStones : [])),
        new_stones: Array.isArray(parsed.archive?.new_stones) ? parsed.archive.new_stones :
                    (Array.isArray(parsed.archive?.newStones) ? parsed.archive.newStones : []),
        merge_pairs: Array.isArray(parsed.archive?.merge_pairs) ? parsed.archive.merge_pairs : []
      };

      // 6. SAFETY: alerts→flags; notes→notes_for_elder (empty string→null)
      normalized.safety = {
        flags: Array.isArray(parsed.safety?.alerts) ? parsed.safety.alerts :
               (Array.isArray(parsed.safety?.flags) ? parsed.safety.flags :
                (Array.isArray(parsed.safety?.warnings) ? parsed.safety.warnings : [])),
        notes_for_elder: (parsed.safety?.notes || parsed.safety?.notes_for_elder || '') === '' ? 
                         null : (parsed.safety?.notes || parsed.safety?.notes_for_elder || null),
        warnings: Array.isArray(parsed.safety?.warnings) ? parsed.safety.warnings : [],
        calmDown: Array.isArray(parsed.safety?.calmDown) ? parsed.safety.calmDown : []
      };

      // 7. ELDER_INSTRUCTIONS: New orchestration field
      const elderInst = parsed.elder_instructions || {};
      normalized.elder_instructions = {
        should_speak: Boolean(elderInst.should_speak),
        mode: elderInst.mode === 'dm' ? 'dm' : 'broadcast',
        target_user_id: elderInst.target_user_id || null,
        tone: ['encouraging', 'warning', 'celebratory', 'reflective', 'neutral'].includes(elderInst.tone) 
          ? elderInst.tone : 'neutral',
        context_summary: elderInst.context_summary || '',
        referenced_messages: Array.isArray(elderInst.referenced_messages) ? elderInst.referenced_messages : [],
        conversation_thread: elderInst.conversation_thread || ''
      };

    // 8. ELDER_MESSAGE: Complete Elder response from Letta (NEW)
      const elderMsg = parsed.elder_message || null;
      if (elderMsg) {
        normalized.elder_message = {
          text: elderMsg.text || '',
          nudge: elderMsg.nudge || null,
          referenced_stones: Array.isArray(elderMsg.referenced_stones) ? elderMsg.referenced_stones : [],
          acknowledged_users: Array.isArray(elderMsg.acknowledged_users) ? elderMsg.acknowledged_users : []
        };
      } else {
        normalized.elder_message = null;
      }

      // 9. NPC_MESSAGE: NPC speaks (Letta orchestration)
      const npcMsg = parsed.npc_message || null;
      if (npcMsg) {
        normalized.npc_message = {
          npc: npcMsg.npc || 'Elder Mycel',
          text: npcMsg.text || '',
          should_npc_speak: Boolean(npcMsg.should_npc_speak)
        };
      } else {
        normalized.npc_message = null;
      }

      return normalized;
    } catch (error) {
      console.error('[MycelialSteward] Normalization error:', error.message);
      return this.getNoOpPatch();
    }
  }

  /**
   * Validate patch shape and return no-op if malformed (legacy method)
   */
  validatePatchShape(response, serverContext) {
    return this.normalizeLettaPatch(response, serverContext);
  }

  /**
   * Get a safe no-op patch (no changes, Elder doesn't speak)
   */
  getNoOpPatch() {
    return {
      trades: { actions: [], resolve: [], cancel: [] },
      vote: { status: null, close: false, tally: {}, winner: null, close_reason: null, decisionCard: null },
      resources: { needs: [], threshold_crossed: false, crossed_at: null, stockpileDeltas: {}, questPercentDelta: 0 },
      archive: { promote_ids: [], prune_ids: [], new_stones: [], merge_pairs: [] },
      safety: { flags: [], notes_for_elder: null, warnings: [], calmDown: [] },
      cadence: { shouldElderSpeak: false, triggerReason: null, mode: null, question: null },
      elder_instructions: {
        should_speak: false,
        mode: 'broadcast',
        target_user_id: null,
        tone: 'neutral',
        context_summary: '',
        referenced_messages: [],
        conversation_thread: ''
      },
      elder_message: null,
      npc_message: null
    };
  }

  /**
   * Build Elder input bundle for Janitor API
   */
    buildElderInputBundle(gameState, patch, recentMessages = []) {
    // Simply return the payload for Letta
    // Letta will build its own prompts
    return {
        ...gameState,
        patch,
        messages: recentMessages.slice(-20)  // Last 20 for context
    };
    }

  /**
   * Get leading vote option
   */
  _getLeadingVoteOption(vote) {
    if (!vote || !vote.tally || Object.keys(vote.tally).length === 0) {
      return null;
    }

    const counts = {};
    vote.options.forEach(opt => counts[opt] = 0);
    Object.values(vote.tally).forEach(opt => {
      if (counts.hasOwnProperty(opt)) counts[opt]++;
    });

    return Object.entries(counts).reduce((a, b) => a[1] >= b[1] ? a : b)[0];
  }

  /**
   * Get fallback Elder message
   */
  getFallbackElderMessage() {
    const messages = [
      "The mycelium stirs with quiet purpose. Next: Contribute one needed item.",
      "Patience, as roots deepen slowly. Next: Contribute one needed item.",
      "The grove awaits your offerings. Next: Contribute one needed item."
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Mock orchestration with deterministic logic
   */
  mockOrchestrate(input) {
    const patch = {
      trades: { resolve: [], cancel: [] },
      vote: { close: false, decisionCard: null },
      resources: { stockpileDeltas: {}, questPercentDelta: 0 },
      archive: { promoteJournals: [], pruneStones: [], newStones: [] },
      safety: { warnings: [], calmDown: [] },
      cadence: { shouldElderSpeak: false, triggerReason: null },
      elder_instructions: {
        should_speak: false,
        mode: 'broadcast',
        target_user_id: null,
        tone: 'neutral',
        context_summary: '',
        referenced_messages: [],
        conversation_thread: ''
      },
      elder_message: null
    };

    const { state, context } = input;

    // 1. TRADES: Auto-cancel stale offers (>1 hour)
    const now = Date.now();
    for (const offer of state.openOffers) {
      if (now - offer.createdAt > 60 * 60 * 1000) {
        patch.trades.cancel.push(offer.id);
      }
    }

    // 2. VOTE: Close if past deadline or quorum reached
    if (state.activeVote && state.activeVote.status === 'OPEN') {
      const voteCount = Object.keys(state.activeVote.tally).length;
      const playerCount = state.players.length;
      const quorumReached = voteCount >= Math.ceil(playerCount * 0.5);
      const timeExpired = now >= state.activeVote.closesAt;

      if (quorumReached || timeExpired) {
        patch.vote.close = true;
        
        // Generate decision card
        const results = {};
        state.activeVote.options.forEach(opt => results[opt] = 0);
        Object.values(state.activeVote.tally).forEach(opt => {
          if (results.hasOwnProperty(opt)) results[opt]++;
        });
        
        const winner = Object.entries(results).reduce((a, b) => a[1] > b[1] ? a : b)[0];
        
        patch.vote.decisionCard = {
          topic: state.activeVote.topic,
          winner,
          summary: `The village chose "${winner}" with ${results[winner]} votes.`,
          narrative: `After deliberation, "${winner}" shall be our path.`
        };
      }
    }

    // 3. RESOURCES: Calculate quest progress
    if (state.activeQuest) {
      let totalRequired = 0;
      let totalHave = 0;
      for (const [item, qty] of Object.entries(state.activeQuest.recipe)) {
        totalRequired += qty;
        totalHave += Math.min(state.stockpile[item] || 0, qty);
      }
      const newPercent = totalRequired > 0 ? Math.floor((totalHave / totalRequired) * 100) : 0;
      patch.resources.questPercentDelta = newPercent - (state.activeQuest.percent || 0);
    }

    // 4. ARCHIVE: Promote old journals, prune if >12 stones
    for (const journal of state.journalQueue) {
      const age = now - journal.timestamp;
      if (age > 5 * 60 * 1000) { // 5 minutes old
        patch.archive.promoteJournals.push(journal.id);
      }
    }

    if (state.memoryStones.length > 12) {
      // Prune oldest
      patch.archive.pruneStones.push(state.memoryStones[0].id);
    }

    // 5. SAFETY: Check for rapid-fire messages
    for (const player of state.players) {
      if (player.messageCount > 10) {
        const warning = context.activeWarnings.find(w => w.playerId === player.id);
        if (!warning || warning.count < 3) {
          patch.safety.warnings.push({
            playerId: player.id,
            reason: 'rapid_messages',
            action: 'warn'
          });
        }
      }
    }

    // 6. CADENCE: Trigger Elder on pulse or high activity
    if (context.messagesSincePulse >= 5 || context.timeSincePulse >= 30000) {
      patch.cadence.shouldElderSpeak = true;
      patch.cadence.triggerReason = context.messagesSincePulse >= 5 ? 'message_threshold' : 'time_threshold';
    }

    // 7. ELDER_INSTRUCTIONS: Analyze batched messages if present
    const batchedMessages = state.batchedMessages || [];
    if (batchedMessages.length > 0) {
      // Extract user names from messages
      const userIds = [...new Set(batchedMessages.map(m => m.user))];
      
      // Simple context summary
      const messageCount = batchedMessages.length;
      const summary = `${messageCount} recent message${messageCount > 1 ? 's' : ''} from ${userIds.length} player${userIds.length > 1 ? 's' : ''}`;
      
      // Detect if anyone is asking Elder questions
      const questionsToElder = batchedMessages.filter(m => 
        m.text && (m.text.toLowerCase().includes('elder') || m.text.includes('?'))
      );
      
      if (questionsToElder.length > 0) {
        patch.elder_instructions.should_speak = true;
        patch.elder_instructions.mode = 'broadcast';
        patch.elder_instructions.tone = 'encouraging';
        patch.elder_instructions.context_summary = `Players asking questions: ${questionsToElder.map(m => m.text.substring(0, 50)).join('; ')}`;
        patch.elder_instructions.referenced_messages = questionsToElder.map(m => m.user);
        patch.elder_instructions.conversation_thread = 'questions';
      } else if (patch.cadence.shouldElderSpeak) {
        patch.elder_instructions.should_speak = true;
        patch.elder_instructions.context_summary = summary;
        patch.elder_instructions.referenced_messages = userIds.slice(0, 2); // Acknowledge up to 2 users
        patch.elder_instructions.conversation_thread = 'general';
      }
    } else if (patch.cadence.shouldElderSpeak) {
      // No messages, but cadence says Elder should speak
      patch.elder_instructions.should_speak = true;
      patch.elder_instructions.context_summary = 'Routine pulse check-in';
      patch.elder_instructions.conversation_thread = 'pulse';
    }

    return patch;
  }

  /**
   * Get adapter status
   */
  getStatus() {
    // Compute mode at call time
    const { mode, reason } = computeLettaMode();
    
    const status = {
      mode,
      healthy: this.healthy,
      last_error: this.lastError
    };
    
    // Include reason when in MOCK mode
    if (mode === 'MOCK' && reason) {
      status.reason = reason;
    }
    
    return status;
  }

  /**
   * Trim state for API call (reduce payload size)
   */
  trimState(fullState) {
    return {
      timestamp: Date.now(),
      state: {
        players: fullState.players.map(p => ({
          id: p.id,
          name: p.name,
          inventory: p.inventory,
          messageCount: p.messageCount || 0
        })),
        stockpile: fullState.stockpile,
        activeQuest: fullState.activeQuest,
        activeVote: fullState.activeVote,
        openOffers: fullState.openOffers.slice(0, 10), // Limit to 10 most recent
        memoryStones: fullState.memoryStones,
        recentActions: fullState.recentActions.slice(0, 20),
        journalQueue: fullState.journalQueue || []
      },
      context: {
        messagesSincePulse: fullState.messagesSincePulse || 0,
        timeSincePulse: Date.now() - (fullState.lastPulseTime || Date.now()),
        activeWarnings: fullState.activeWarnings || []
      }
    };
  }
}

// Singleton instance
export const mycelialSteward = new MycelialSteward();
