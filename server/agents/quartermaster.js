// Rhizomorph Quartermaster: Manages inventory, stockpile, and quests
import { gameState } from '../state.js';
import { createQuest, QuestStatus } from '../types.js';
import { lettaAdapter } from '../adapters/letta.js';

class RhizomorphQuartermaster {
  constructor() {
    this.name = 'Rhizomorph Quartermaster';
    this.lastSnapshot = null;
  }

  // Start a new quest
  startQuest(name, recipe) {
    // Complete any existing quest first
    if (gameState.nowRing.activeQuest && gameState.nowRing.activeQuest.status === QuestStatus.ACTIVE) {
      this.completeQuest();
    }

    const quest = createQuest(
      `quest_${Date.now()}`,
      name,
      recipe
    );

    gameState.setActiveQuest(quest);
    this.updateQuestProgress();
    
    return quest;
  }

  // Update quest progress
  updateQuestProgress() {
    const quest = gameState.updateQuestProgress();
    return quest;
  }

  // Complete current quest
  completeQuest() {
    const quest = gameState.nowRing.activeQuest;
    if (!quest) return null;

    quest.status = QuestStatus.COMPLETED;
    quest.completedAt = Date.now();

    // Deduct resources from stockpile
    if (quest.percent >= 100) {
      for (const [item, qty] of Object.entries(quest.recipe)) {
        gameState.stockpile[item] = Math.max(0, gameState.stockpile[item] - qty);
      }
    }

    return quest;
  }

  // Get quest status
  getQuestStatus() {
    const quest = gameState.nowRing.activeQuest;
    if (!quest) return null;

    return {
      id: quest.id,
      name: quest.name,
      recipe: quest.recipe,
      percent: quest.percent,
      status: quest.status,
      stockpile: gameState.stockpile
    };
  }

  // Generate compact delta report since last pulse
  generateDeltaReport() {
    const current = {
      stockpile: { ...gameState.stockpile },
      quest: gameState.nowRing.activeQuest ? {
        name: gameState.nowRing.activeQuest.name,
        percent: gameState.nowRing.activeQuest.percent
      } : null,
      playerInventories: this.getPlayerInventorySummary()
    };

    if (!this.lastSnapshot) {
      this.lastSnapshot = current;
      return {
        isFirstReport: true,
        current
      };
    }

    // Calculate deltas
    const deltas = {
      stockpile: {},
      questProgress: 0,
      playerChanges: []
    };

    // Stockpile deltas
    for (const [item, qty] of Object.entries(current.stockpile)) {
      const diff = qty - (this.lastSnapshot.stockpile[item] || 0);
      if (diff !== 0) {
        deltas.stockpile[item] = diff;
      }
    }

    // Quest progress delta
    if (current.quest && this.lastSnapshot.quest && 
        current.quest.name === this.lastSnapshot.quest.name) {
      deltas.questProgress = current.quest.percent - this.lastSnapshot.quest.percent;
    }

    this.lastSnapshot = current;

    return {
      isFirstReport: false,
      deltas,
      current
    };
  }

  // Get player inventory summary
  getPlayerInventorySummary() {
    const summary = {};
    for (const [playerId, player] of gameState.players.entries()) {
      const total = Object.values(player.inventory).reduce((sum, qty) => sum + qty, 0);
      if (total > 0) {
        summary[player.name] = total;
      }
    }
    return summary;
  }

  // Process donation to stockpile
  processDonation(playerId, item, quantity) {
    const player = gameState.getPlayer(playerId);
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }

    if (!player.inventory.hasOwnProperty(item)) {
      return { success: false, reason: 'Invalid item' };
    }

    if (player.inventory[item] < quantity) {
      return { success: false, reason: 'Insufficient inventory' };
    }

    // Transfer from player to stockpile
    player.inventory[item] -= quantity;
    gameState.addToStockpile(item, quantity);

    // Update quest progress
    this.updateQuestProgress();

    return {
      success: true,
      player: player.name,
      item,
      quantity,
      newStockpile: gameState.stockpile[item],
      questProgress: gameState.nowRing.activeQuest?.percent
    };
  }

  // Generate summary for Elder
  async generateSummaryForElder() {
    const report = this.generateDeltaReport();
    
    try {
      // Use Letta to create narrative summary
      const narrative = await lettaAdapter.generateQuartermasterSummary(report);
      return narrative;
    } catch (error) {
      console.error('Quartermaster summary error:', error);
      return this.generateSimpleSummary(report);
    }
  }

  // Simple fallback summary
  generateSimpleSummary(report) {
    const parts = [];

    if (report.isFirstReport) {
      parts.push('Stockpile initialized.');
    } else {
      const { deltas } = report;
      
      if (Object.keys(deltas.stockpile).length > 0) {
        const changes = Object.entries(deltas.stockpile)
          .map(([item, delta]) => `${item} ${delta > 0 ? '+' : ''}${delta}`)
          .join(', ');
        parts.push(`Stockpile: ${changes}`);
      }

      if (deltas.questProgress > 0) {
        parts.push(`Quest progress: +${deltas.questProgress}%`);
      }
    }

    if (parts.length === 0) {
      return 'No changes to report.';
    }

    return parts.join('. ');
  }

  // Check quest thresholds for events
  checkQuestThresholds() {
    const quest = gameState.nowRing.activeQuest;
    if (!quest || quest.status !== QuestStatus.ACTIVE) {
      return null;
    }

    const thresholds = [25, 50, 75, 100];
    for (const threshold of thresholds) {
      if (quest.percent >= threshold && !quest[`threshold_${threshold}_reached`]) {
        quest[`threshold_${threshold}_reached`] = true;
        return { threshold, quest };
      }
    }

    return null;
  }
}

// Singleton instance
export const rhizomorphQuartermaster = new RhizomorphQuartermaster();
