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
 *     journalQueue: [{id, playerId, text, timestamp}]
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
   * Robust assistant text extraction from Letta SDK response
   */
  extractAssistantText(res) {
    // Helper to concatenate text parts
    const concatTextParts = (content) => {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .filter(part => part.type === 'text' && part.text)
          .map(part => part.text)
          .join('\n');
      }
      return null;
    };
    
    // Try different response structures in order
    // 1) res.message?.content
    if (res.message?.content) {
      const text = concatTextParts(res.message.content);
      if (text) return text;
    }
    
    // 2) res.messages?.[res.messages.length-1]?.content (last message)
    if (res.messages && res.messages.length > 0) {
      // Find last assistant message
      for (let i = res.messages.length - 1; i >= 0; i--) {
        const msg = res.messages[i];
        if (msg.role === 'assistant') {
          const text = concatTextParts(msg.content);
          if (text) return text;
        }
      }
    }
    
    // 3) res.assistant_message?.content
    if (res.assistant_message?.content) {
      const text = concatTextParts(res.assistant_message.content);
      if (text) return text;
    }
    
    // 4) res.data?.[0]?.message?.content
    if (res.data && res.data.length > 0 && res.data[0].message?.content) {
      const text = concatTextParts(res.data[0].message.content);
      if (text) return text;
    }
    
    // 5) res.run?.messages with assistant filter
    if (res.run?.messages) {
      const assistantMsgs = res.run.messages.filter(m => m.role === 'assistant');
      if (assistantMsgs.length > 0) {
        const text = concatTextParts(assistantMsgs[assistantMsgs.length - 1].content);
        if (text) return text;
      }
    }
    
    return null;
  }

  /**
   * Call Letta API via SDK with robust error handling
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
      const response = await client.agents.messages.create(agentId, body);
      
      // Store raw response preview (first 400 chars for debugging)
      const responsePreview = JSON.stringify(response).substring(0, 400);
      
      // Extract assistant text using robust helper
      const resultContent = this.extractAssistantText(response);
      
      // Store last response preview
      this.lastResponsePreview = resultContent ? resultContent.substring(0, 400) : responsePreview;
      
      if (!resultContent) {
        this.lastError = "no assistant content";
        console.warn(`[MycelialSteward:${requestId}] No assistant content in response, returning no-op patch`);
        return this.getNoOpPatch();
      }
      
      // Parse JSON robustly
      // 1) First try direct JSON.parse
      try {
        const parsed = JSON.parse(resultContent);
        return parsed;
      } catch (parseError) {
        // 2) Try to extract JSON by finding first { and last }
        console.warn(`[MycelialSteward:${requestId}] Failed direct parse: ${parseError.message}, trying substring extraction`);
        
        const firstBrace = resultContent.indexOf('{');
        const lastBrace = resultContent.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonSubstr = resultContent.substring(firstBrace, lastBrace + 1);
          try {
            const parsed = JSON.parse(jsonSubstr);
            return parsed;
          } catch (e) {
            this.lastError = "assistant content not JSON";
            console.warn(`[MycelialSteward:${requestId}] Failed substring parse, returning no-op patch`);
            return this.getNoOpPatch();
          }
        }
        
        this.lastError = "assistant content not JSON";
        console.warn(`[MycelialSteward:${requestId}] No valid JSON found, returning no-op patch`);
        return this.getNoOpPatch();
      }
    } catch (err) {
      // Capture error details with truncation
      let errorDetails = String(err);
      if (err.body) {
        const bodyStr = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
        errorDetails = bodyStr.substring(0, 500);
      } else if (err.message) {
        errorDetails = err.message.substring(0, 500);
      }
      
      this.lastError = errorDetails;
      
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
   * Normalize Letta patch with exact transformation rules
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

      // 1. CADENCE: add should_elder_speak if mode present; pass through question
      normalized.cadence = {
        shouldElderSpeak: parsed.cadence?.mode ? true : Boolean(parsed.cadence?.should_elder_speak || parsed.cadence?.shouldElderSpeak),
        triggerReason: parsed.cadence?.trigger_reason || parsed.cadence?.triggerReason || null,
        mode: parsed.cadence?.mode || null,
        question: serverContext.question || parsed.cadence?.question || null
      };

      // 2. VOTE: status "ACTIVE"→"OPEN"; ensure required fields
      normalized.vote = {
        status: parsed.vote?.status === 'ACTIVE' ? 'OPEN' : (parsed.vote?.status || null),
        close: Boolean(parsed.vote?.close),
        tally: parsed.vote?.tally || {},
        winner: parsed.vote?.winner || null,
        close_reason: parsed.vote?.close_reason || parsed.vote?.closeReason || null,
        decisionCard: parsed.vote?.decisionCard || parsed.vote?.decision_card || null
      };

      // 3. RESOURCES: needs object → array; threshold_crossed number → {threshold_crossed:bool, crossed_at:N}
      const needs = parsed.resources?.needs || {};
      const needsArray = Array.isArray(needs) ? needs : 
        Object.entries(needs).map(([item, qty]) => ({ item, qty }));

      let thresholdInfo = { threshold_crossed: false, crossed_at: null };
      const tc = parsed.resources?.threshold_crossed;
      if (typeof tc === 'number') {
        thresholdInfo = { threshold_crossed: true, crossed_at: tc };
      } else if (tc === true) {
        thresholdInfo = { threshold_crossed: true, crossed_at: parsed.resources?.crossed_at || Date.now() };
      } else if (tc === false) {
        thresholdInfo = { threshold_crossed: false, crossed_at: null };
      }

      normalized.resources = {
        needs: needsArray,
        threshold_crossed: thresholdInfo.threshold_crossed,
        crossed_at: thresholdInfo.crossed_at,
        stockpileDeltas: parsed.resources?.stockpileDeltas || parsed.resources?.stockpile_deltas || {},
        questPercentDelta: Number(parsed.resources?.questPercentDelta || parsed.resources?.quest_percent_delta || 0)
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
      cadence: { shouldElderSpeak: false, triggerReason: null, mode: null, question: null }
    };
  }

  /**
   * Build Elder input bundle for Janitor API
   */
  buildElderInputBundle(gameState, patch, recentMessages = []) {
    // Canon stones (≤12)
    const canon_stones = gameState.getMemoryStones().slice(0, 12);

    // Now ring
    const quest = gameState.nowRing.activeQuest;
    const vote = gameState.nowRing.activeVote;
    
    const now = {
      quest: quest ? {
        name: quest.name,
        percent: quest.percent || 0,
        needs: patch.resources.needs
      } : null,
      vote: vote ? {
        topic: vote.topic,
        options: vote.options,
        leading: this._getLeadingVoteOption(vote)
      } : null,
      stockpile: gameState.stockpile
    };

    // Top recent actions (≤5)
    const top_recent_actions = gameState.nowRing.topRecentActions.slice(0, 5);

    // Last messages summary (≤8)
    const last_messages_summary = recentMessages.slice(-8).map(m => ({
      player: m.playerName || m.from,
      text: m.text,
      timestamp: m.timestamp
    }));

    // Safety notes
    const safety_notes = patch.safety.notes_for_elder;

    // Question if CALL_RESPONSE
    const question = patch.cadence.mode === 'CALL_RESPONSE' ? patch.cadence.question : null;

    return {
      canon_stones,
      now,
      top_recent_actions,
      last_messages_summary,
      safety_notes,
      question
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
   * Validate and normalize the response
   * Extracts JSON from text+JSON, fills missing fields with safe defaults
   */
  validateAndNormalize(response) {
    let parsed = response;

    // If response is a string, try to extract JSON
    if (typeof response === 'string') {
      // Try to find JSON in the string
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn('Failed to parse JSON from response, using empty patch');
          parsed = {};
        }
      } else {
        parsed = {};
      }
    }

    // Apply safe defaults for missing fields
    return {
      trades: {
        resolve: parsed.trades?.resolve || [],
        cancel: parsed.trades?.cancel || []
      },
      vote: {
        close: parsed.vote?.close || false,
        decisionCard: parsed.vote?.decisionCard || null
      },
      resources: {
        stockpileDeltas: parsed.resources?.stockpileDeltas || {},
        questPercentDelta: parsed.resources?.questPercentDelta || 0
      },
      archive: {
        promoteJournals: parsed.archive?.promoteJournals || [],
        pruneStones: parsed.archive?.pruneStones || [],
        newStones: parsed.archive?.newStones || []
      },
      safety: {
        warnings: parsed.safety?.warnings || [],
        calmDown: parsed.safety?.calmDown || []
      },
      cadence: {
        shouldElderSpeak: parsed.cadence?.shouldElderSpeak || false,
        triggerReason: parsed.cadence?.triggerReason || null
      }
    };
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
      cadence: { shouldElderSpeak: false, triggerReason: null }
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
