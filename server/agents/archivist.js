// Lichen Archivist: Manages Memory Stones
import { gameState } from '../state.js';
import { createMemoryStone } from '../types.js';
import { lettaAdapter } from '../adapters/letta.js';

class LichenArchivist {
  constructor() {
    this.name = 'Lichen Archivist';
    this.journalQueue = [];
    this.autoPromote = false; // Manual toggle for auto-promotion
  }

  // Add journal entry to queue
  addJournal(playerId, text) {
    const entry = {
      id: `journal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId,
      text,
      timestamp: Date.now(),
      promoted: false
    };

    this.journalQueue.push(entry);
    return entry;
  }

  // Get pending journals
  getPendingJournals() {
    return this.journalQueue.filter(j => !j.promoted);
  }

  // Promote journal to Memory Stone
  async promoteToStone(journalId, title = null, tags = []) {
    const journal = this.journalQueue.find(j => j.id === journalId);
    if (!journal) {
      return { success: false, reason: 'Journal not found' };
    }

    if (journal.promoted) {
      return { success: false, reason: 'Already promoted' };
    }

    try {
      // Use Letta to refine the stone if needed
      let stoneTitle = title;
      let stoneText = journal.text;

      if (!title && this.autoPromote) {
        const refined = await lettaAdapter.refineJournalToStone(journal.text);
        stoneTitle = refined.title;
        stoneText = refined.text;
        tags = refined.tags;
      } else if (!title) {
        // Simple extraction
        stoneTitle = this.extractTitle(journal.text);
      }

      // Create Memory Stone
      const stone = createMemoryStone(
        `stone_${Date.now()}`,
        stoneTitle,
        stoneText,
        tags
      );

      // Add to canon ring (will auto-prune if >12)
      gameState.addMemoryStone(stone);

      // Mark journal as promoted
      journal.promoted = true;
      journal.promotedAt = Date.now();
      journal.stoneId = stone.id;

      return { success: true, stone };
    } catch (error) {
      console.error('Archivist promotion error:', error);
      return { success: false, reason: error.message };
    }
  }

  // Extract simple title from text
  extractTitle(text) {
    // Take first 5-7 words or up to first period
    const words = text.split(/\s+/);
    let title = words.slice(0, Math.min(7, words.length)).join(' ');
    
    // Truncate at first period if exists
    const periodIndex = title.indexOf('.');
    if (periodIndex > 0) {
      title = title.substring(0, periodIndex);
    }

    return title.length > 50 ? title.substring(0, 47) + '...' : title;
  }

  // Auto-promote journals based on criteria
  async autoPromoteJournals() {
    if (!this.autoPromote) return;

    const pending = this.getPendingJournals();
    const stones = gameState.getMemoryStones();

    // Don't auto-promote if we're at capacity
    if (stones.length >= 12) {
      return;
    }

    // Simple heuristic: promote journals older than 5 minutes
    const now = Date.now();
    const threshold = 5 * 60 * 1000;

    for (const journal of pending) {
      if (now - journal.timestamp > threshold) {
        await this.promoteToStone(journal.id);
      }
    }
  }

  // Prune/merge stones when >12
  pruneStones() {
    const stones = gameState.getMemoryStones();
    if (stones.length <= 12) return;

    // Simple strategy: remove oldest stones beyond 12
    // In a real system, Letta would help merge similar stones
    while (gameState.canonRing.length > 12) {
      gameState.canonRing.shift();
    }
  }

  // Get summary for Elder
  getStoneSummary() {
    const stones = gameState.getMemoryStones();
    return {
      count: stones.length,
      recent: stones.slice(-3),
      tags: this.getAllTags()
    };
  }

  // Get all unique tags
  getAllTags() {
    const stones = gameState.getMemoryStones();
    const tagSet = new Set();
    stones.forEach(stone => {
      stone.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet);
  }

  // Toggle auto-promote mode
  setAutoPromote(enabled) {
    this.autoPromote = enabled;
    return this.autoPromote;
  }
}

// Singleton instance
export const lichenArchivist = new LichenArchivist();
