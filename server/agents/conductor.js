// Mycelial Conductor: Cadence engine coordinator
import { cadenceEngine } from '../cadence.js';
import { janitorAdapter } from '../adapters/janitor.js';
import { gameState } from '../state.js';

class MycelialConductor {
  constructor() {
    this.name = 'Mycelial Conductor';
  }

  // Process incoming message and determine Elder response
  async processMessage(message, playerId) {
    // Add message to cadence history
    cadenceEngine.addMessage({
      ...message,
      from: playerId
    });

    // Check if Elder should speak
    const trigger = cadenceEngine.shouldElderSpeak(message);
    
    if (trigger) {
      return await this.orchestrateElderResponse(trigger, message, playerId);
    }

    return null;
  }

  // Orchestrate Elder's response
  async orchestrateElderResponse(trigger, message, playerId) {
    try {
      // Get context for Elder
      const context = cadenceEngine.getElderContext();
      const cadenceSummary = cadenceEngine.generateCadenceSummary(trigger);

      // Get player name
      const player = gameState.getPlayer(playerId);
      const playerName = player ? player.name : 'Visitor';

      // Build Elder prompt with context
      const elderPrompt = this.buildElderPrompt(context, cadenceSummary, message, playerName);

      // Call Elder Mycel (via Janitor AI adapter)
      const elderResponse = await janitorAdapter.generateResponse(elderPrompt, context);

      // Mark that Elder spoke
      cadenceEngine.onElderSpoke();

      return {
        text: elderResponse,
        trigger: trigger.type,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Conductor error:', error);
      return {
        text: this.getFallbackResponse(trigger.type),
        trigger: trigger.type,
        timestamp: Date.now(),
        error: true
      };
    }
  }

  // Build prompt for Elder with full context
  buildElderPrompt(context, cadenceSummary, message, playerName) {
    const parts = [];

    // Trigger context
    parts.push(`TRIGGER: ${cadenceSummary.trigger} - ${cadenceSummary.reason}`);

    // Memory Stones (reference 0-2)
    if (context.memoryStones && context.memoryStones.length > 0) {
      parts.push('\nMEMORY STONES:');
      context.memoryStones.forEach(stone => {
        parts.push(`- ${stone.title}: ${stone.text}`);
      });
    }

    // Active Quest
    if (context.activeQuest) {
      parts.push(`\nACTIVE QUEST: ${context.activeQuest.name} (${context.activeQuest.percent}% complete)`);
    }

    // Active Vote
    if (context.activeVote && context.activeVote.status === 'OPEN') {
      const votes = Object.keys(context.activeVote.tally).length;
      parts.push(`\nACTIVE VOTE: ${context.activeVote.topic} (${votes} votes)`);
    }

    // Stockpile
    parts.push(`\nSTOCKPILE: moss:${context.stockpile.moss} cedar:${context.stockpile.cedar} resin:${context.stockpile.resin} spores:${context.stockpile.spores}`);

    // Recent messages
    if (context.recentMessages && context.recentMessages.length > 0) {
      parts.push('\nRECENT ACTIVITY:');
      context.recentMessages.forEach(msg => {
        const speaker = msg.from || 'Unknown';
        parts.push(`- ${speaker}: ${msg.text || msg.action || 'action'}`);
      });
    }

    // Current message
    if (message && message.text) {
      parts.push(`\nCURRENT MESSAGE from ${playerName}: ${message.text}`);
    }

    return parts.join('\n');
  }

  // Fallback responses when Elder AI is unavailable
  getFallbackResponse(triggerType) {
    const responses = {
      CALL_RESPONSE: "The mycelium stirs beneath your feet. Elder Mycel listens.",
      PULSE: "The spores drift on the breeze. Gather what you can.",
      EVENT: "The cedars whisper. Something changes in the grove."
    };

    return responses[triggerType] || "The forest breathes. All is connected.";
  }

  // Check if periodic pulse is needed (called by timer)
  checkPeriodicPulse() {
    if (gameState.shouldTriggerPulse()) {
      return {
        type: 'PULSE',
        reason: 'Periodic pulse threshold reached',
        priority: 2
      };
    }
    return null;
  }
}

// Singleton instance
export const mycelialConductor = new MycelialConductor();
