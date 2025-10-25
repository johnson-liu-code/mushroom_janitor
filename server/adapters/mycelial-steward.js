// MycelialSteward - Unified Letta adapter for all backstage agents
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

class MycelialSteward {
  constructor() {
    this.mode = process.env.LLM_MODE || 'MOCK';
    this.apiKey = process.env.LETTA_API_KEY;
    this.healthy = true;
    this.lastError = null;
    this.systemPrompt = this.loadSystemPrompt();
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
   * Main orchestration method
   * @param {Object} input - Unified input state
   * @returns {Promise<Object>} Normalized patch output
   */
  async orchestrate(input) {
    if (this.mode === 'LIVE' && this.apiKey) {
      try {
        const result = await this.callLettaAPI(input);
        this.healthy = true;
        this.lastError = null;
        return this.validateAndNormalize(result);
      } catch (error) {
        console.error('Letta API error, falling back to MOCK:', error);
        this.healthy = false;
        this.lastError = error.message;
        return this.mockOrchestrate(input);
      }
    }

    return this.mockOrchestrate(input);
  }

  /**
   * Call Letta API with unified input
   */
  async callLettaAPI(input) {
    const endpoint = 'https://api.letta.ai/v1/agents/execute';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        agent: 'mycelial-steward',
        system_prompt: this.systemPrompt,
        input
      })
    });

    if (!response.ok) {
      throw new Error(`Letta API error: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
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
    return {
      mode: this.mode === 'LIVE' && this.apiKey ? 'LIVE' : 'MOCK',
      healthy: this.healthy,
      last_error: this.lastError
    };
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
