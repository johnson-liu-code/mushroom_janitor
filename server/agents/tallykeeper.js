// Lamella Tallykeeper: Manages voting
import { gameState } from '../state.js';
import { createVote, VoteStatus } from '../types.js';
import { lettaAdapter } from '../adapters/letta.js';

class LamellaTallykeeper {
  constructor() {
    this.name = 'Lamella Tallykeeper';
  }

  // Open a new vote
  openVote(topic, options, durationMinutes = 5) {
    // Close any existing vote first
    if (gameState.nowRing.activeVote && gameState.nowRing.activeVote.status === VoteStatus.OPEN) {
      this.closeVote();
    }

    const closesAt = Date.now() + (durationMinutes * 60 * 1000);
    const vote = createVote(
      `vote_${Date.now()}`,
      topic,
      options,
      closesAt
    );

    gameState.setActiveVote(vote);
    return vote;
  }

  // Cast a vote
  castVote(playerId, option) {
    const vote = gameState.nowRing.activeVote;
    
    if (!vote) {
      return { success: false, reason: 'No active vote' };
    }

    if (vote.status !== VoteStatus.OPEN) {
      return { success: false, reason: 'Vote is closed' };
    }

    if (!vote.options.includes(option)) {
      return { success: false, reason: 'Invalid option' };
    }

    const success = gameState.castVote(playerId, option);
    
    if (success) {
      return { success: true, vote };
    } else {
      return { success: false, reason: 'Failed to cast vote' };
    }
  }

  // Close current vote and generate Decision Card
  async closeVote() {
    const result = gameState.closeVote();
    
    if (!result) {
      return null;
    }

    const { vote, results } = result;

    // Find winner
    let winner = null;
    let maxVotes = 0;
    for (const [option, count] of Object.entries(results)) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = option;
      }
    }

    // Generate Decision Card
    const decisionCard = await this.generateDecisionCard(vote, results, winner);

    return {
      vote,
      results,
      winner,
      decisionCard
    };
  }

  // Generate Decision Card for Elder
  async generateDecisionCard(vote, results, winner) {
    try {
      // Use Letta to generate a narrative Decision Card
      const card = await lettaAdapter.generateDecisionCard(vote, results, winner);
      return card;
    } catch (error) {
      console.error('Tallykeeper Decision Card error:', error);
      // Fallback to simple card
      return this.generateSimpleDecisionCard(vote, results, winner);
    }
  }

  // Simple fallback Decision Card
  generateSimpleDecisionCard(vote, results, winner) {
    const totalVotes = Object.values(results).reduce((sum, count) => sum + count, 0);
    
    return {
      topic: vote.topic,
      winner,
      totalVotes,
      results,
      summary: `The village has spoken: "${winner}" with ${results[winner]} votes.`
    };
  }

  // Check if vote should close
  checkVoteExpiry() {
    const vote = gameState.nowRing.activeVote;
    
    if (!vote || vote.status !== VoteStatus.OPEN) {
      return null;
    }

    const now = Date.now();
    if (now >= vote.closesAt) {
      return this.closeVote();
    }

    return null;
  }

  // Get vote status
  getVoteStatus() {
    const vote = gameState.nowRing.activeVote;
    
    if (!vote) {
      return null;
    }

    const totalVotes = Object.keys(vote.tally).length;
    const results = {};
    
    vote.options.forEach(opt => results[opt] = 0);
    Object.values(vote.tally).forEach(opt => {
      if (results.hasOwnProperty(opt)) {
        results[opt]++;
      }
    });

    return {
      id: vote.id,
      topic: vote.topic,
      options: vote.options,
      status: vote.status,
      totalVotes,
      results,
      closesAt: vote.closesAt,
      timeRemaining: Math.max(0, vote.closesAt - Date.now())
    };
  }

  // Normalize vote option (fuzzy matching)
  normalizeOption(input, options) {
    const normalized = input.toLowerCase().trim();
    
    // Exact match
    for (const option of options) {
      if (option.toLowerCase() === normalized) {
        return option;
      }
    }

    // Prefix match
    for (const option of options) {
      if (option.toLowerCase().startsWith(normalized)) {
        return option;
      }
    }

    // Contains match
    for (const option of options) {
      if (option.toLowerCase().includes(normalized)) {
        return option;
      }
    }

    return null;
  }
}

// Singleton instance
export const lamellaTallykeeper = new LamellaTallykeeper();
