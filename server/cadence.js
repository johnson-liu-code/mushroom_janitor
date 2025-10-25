// Cadence engine for Elder Mycel timing and triggers
import { gameState } from './state.js';
import { TriggerType } from './types.js';
import { mentionsElder } from './intents.js';

class CadenceEngine {
  constructor() {
    this.messageHistory = [];
    this.maxHistory = 50;
  }

  // Add a message to history
  addMessage(message) {
    this.messageHistory.push({
      ...message,
      timestamp: Date.now()
    });

    // Keep only last N messages
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistory);
    }

    // Increment message count for pulse tracking
    gameState.incrementMessageCount();
  }

  // Determine if Elder should speak
  shouldElderSpeak(message) {
    const triggers = [];

    // 1. Call-and-response: Direct @mention or question to Elder
    if (this.isCallResponse(message)) {
      triggers.push({
        type: TriggerType.CALL_RESPONSE,
        reason: 'Elder was mentioned or asked a question',
        priority: 1
      });
    }

    // 2. Pulse: After M messages or T seconds
    if (gameState.shouldTriggerPulse()) {
      triggers.push({
        type: TriggerType.PULSE,
        reason: 'Pulse threshold reached',
        priority: 2
      });
    }

    // 3. Event: Important game events
    const eventTrigger = this.checkEventTriggers();
    if (eventTrigger) {
      triggers.push(eventTrigger);
    }

    // Return highest priority trigger
    if (triggers.length > 0) {
      triggers.sort((a, b) => a.priority - b.priority);
      return triggers[0];
    }

    return null;
  }

  // Check if message is a call-response trigger
  isCallResponse(message) {
    if (!message || !message.text) return false;
    
    // Check for @elder mention
    if (mentionsElder(message.text)) {
      return true;
    }

    // Check for questions directed at Elder
    const questionPatterns = [
      /elder.*\?/i,
      /what.*think/i,
      /should.*we/i,
      /can.*you/i
    ];

    return questionPatterns.some(pattern => pattern.test(message.text));
  }

  // Check for event-based triggers
  checkEventTriggers() {
    const now = Date.now();

    // Vote closing soon
    const vote = gameState.nowRing.activeVote;
    if (vote && vote.status === 'OPEN') {
      const timeToClose = vote.closesAt - now;
      if (timeToClose > 0 && timeToClose < 60000) { // Last minute
        return {
          type: TriggerType.EVENT,
          reason: 'Vote closing soon',
          priority: 1,
          data: { vote }
        };
      }
    }

    // Quest threshold reached
    const quest = gameState.nowRing.activeQuest;
    if (quest && quest.status === 'ACTIVE') {
      const thresholds = [25, 50, 75, 100];
      for (const threshold of thresholds) {
        if (quest.percent >= threshold && !quest[`spoke_at_${threshold}`]) {
          quest[`spoke_at_${threshold}`] = true;
          return {
            type: TriggerType.EVENT,
            reason: `Quest reached ${threshold}%`,
            priority: 1,
            data: { quest, threshold }
          };
        }
      }
    }

    return null;
  }

  // Get recent messages for context
  getRecentMessages(count = 5) {
    return this.messageHistory.slice(-count);
  }

  // Generate Elder context
  getElderContext() {
    const recentMessages = this.getRecentMessages();
    return gameState.getElderContext(recentMessages);
  }

  // Reset pulse counter after Elder speaks
  onElderSpoke() {
    gameState.resetPulseCounter();
    gameState.elderLastSpoke = Date.now();
  }

  // Get time since Elder last spoke
  getTimeSinceElderSpoke() {
    return Date.now() - gameState.elderLastSpoke;
  }

  // Generate cadence summary for Elder
  generateCadenceSummary(trigger) {
    const summary = {
      trigger: trigger.type,
      reason: trigger.reason,
      messagesSincePulse: gameState.messagesSinceLastPulse,
      timeSinceLastPulse: Math.floor((Date.now() - gameState.lastPulseTime) / 1000),
      timeSinceElderSpoke: Math.floor(this.getTimeSinceElderSpoke() / 1000),
      recentActivity: this.summarizeRecentActivity()
    };

    return summary;
  }

  // Summarize recent activity
  summarizeRecentActivity() {
    const recent = this.getRecentMessages(10);
    const summary = {
      totalMessages: recent.length,
      uniquePlayers: new Set(recent.map(m => m.from)).size,
      intentTypes: {},
      hasQuestions: false
    };

    for (const msg of recent) {
      if (msg.intent && msg.intent.type) {
        summary.intentTypes[msg.intent.type] = 
          (summary.intentTypes[msg.intent.type] || 0) + 1;
      }
      if (msg.text && msg.text.includes('?')) {
        summary.hasQuestions = true;
      }
    }

    return summary;
  }
}

// Singleton instance
export const cadenceEngine = new CadenceEngine();
