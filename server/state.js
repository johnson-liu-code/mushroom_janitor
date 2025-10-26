// In-memory state store for Mushroom Village
import { createMemoryStone, QuestStatus, VoteStatus, TradeStatus } from './types.js';

class GameState {
  constructor() {
    // Three rings model
    this.canonRing = []; // Memory Stones (max 12)
    this.nowRing = {
      activeQuest: null,
      activeVote: null,
      topRecentActions: []
    };
    this.scratchRing = []; // Last N actions with TTL

    // Entities
    this.players = new Map(); // playerId -> Player
    this.offers = new Map();  // offerId -> Offer
    this.quests = [];
    this.votes = [];

    // Stockpile
    this.stockpile = {
      moss: 0,
      cedar: 0,
      resin: 0,
      spores: 0,
      charms: 0
    };

    // Cadence tracking
    this.messagesSinceLastPulse = 0;
    this.lastPulseTime = Date.now();
    this.elderLastSpoke = Date.now();

    // Message history (in-memory)
    this.messages = [];

    // Initialize with seed data
    this._seedInitialStones();
  }

  _seedInitialStones() {
    this.canonRing = [
      createMemoryStone('stone1', 'The First Spore', 'When the first spore landed, Elder Mycel awoke beneath the moss.', ['origin', 'elder']),
      createMemoryStone('stone2', 'The Cedar Grove', 'Three ancient cedars mark the village heart.', ['location', 'cedar']),
      createMemoryStone('stone3', 'The Gift of Resin', 'Resin flows when cedars sense harmony.', ['resource', 'magic'])
    ];
  }

  // Player management
  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  addPlayer(player) {
    this.players.set(player.id, player);
  }

  updatePlayerInventory(playerId, item, amount) {
    const player = this.players.get(playerId);
    if (player && player.inventory.hasOwnProperty(item)) {
      player.inventory[item] = Math.max(0, player.inventory[item] + amount);
      return true;
    }
    return false;
  }

  // Memory Stones (Canon Ring)
  getMemoryStones() {
    return [...this.canonRing];
  }

  addMemoryStone(stone) {
    if (this.canonRing.length >= 12) {
      // Remove oldest or least relevant
      this.canonRing.shift();
    }
    this.canonRing.push(stone);
  }

  // Scratch Ring
  addScratchAction(action) {
    this.scratchRing.push(action);
    // Clean up expired actions
    const now = Date.now();
    this.scratchRing = this.scratchRing.filter(a => a.expiresAt > now);
    
    // Keep only last N actions
    const maxActions = parseInt(process.env.SCRATCH_MAX_ACTIONS || '20');
    if (this.scratchRing.length > maxActions) {
      this.scratchRing = this.scratchRing.slice(-maxActions);
    }
  }

  getScratchActions() {
    const now = Date.now();
    this.scratchRing = this.scratchRing.filter(a => a.expiresAt > now);
    return [...this.scratchRing];
  }

  // Now Ring - Recent Actions
  addRecentAction(action) {
    this.nowRing.topRecentActions.unshift(action);
    this.nowRing.topRecentActions = this.nowRing.topRecentActions.slice(0, 10);
  }

  // Quest management
  setActiveQuest(quest) {
    this.nowRing.activeQuest = quest;
    this.quests.push(quest);
  }

  updateQuestProgress() {
    if (!this.nowRing.activeQuest) return null;
    
    const quest = this.nowRing.activeQuest;
    
    // Calculate bottleneck percentage (minimum ratio across all required resources)
    const ratios = [];
    for (const [item, required] of Object.entries(quest.recipe)) {
      if (required > 0) {
        const have = this.stockpile[item] || 0;
        ratios.push(have / required);
      }
    }
    
    // Use minimum ratio (bottleneck resource determines progress)
    const minRatio = ratios.length > 0 ? Math.min(...ratios) : 0;
    quest.percent = Math.floor(100 * Math.min(minRatio, 1.0));
    
    if (quest.percent >= 100) {
      quest.status = QuestStatus.COMPLETED;
    }

    return quest;
  }

  // Vote management
  setActiveVote(vote) {
    // Initialize tally as { optionName: count } format
    if (!vote.tally) {
      vote.tally = {};
      vote.options.forEach(opt => vote.tally[opt] = 0);
    }
    if (!vote.votedPlayers) {
      vote.votedPlayers = new Set();
    }
    this.nowRing.activeVote = vote;
    this.votes.push(vote);
  }

  castVote(playerId, option) {
    const vote = this.nowRing.activeVote;
    if (!vote || vote.status !== VoteStatus.OPEN) {
      return false;
    }

    if (!vote.options.includes(option)) {
      return false;
    }

    // Check if player already voted
    if (vote.votedPlayers.has(playerId)) {
      return false;
    }

    // Increment option count
    if (!vote.tally[option]) {
      vote.tally[option] = 0;
    }
    vote.tally[option]++;
    
    // Track that player voted
    vote.votedPlayers.add(playerId);
    
    return true;
  }

  closeVote() {
    if (!this.nowRing.activeVote) return null;
    
    const vote = this.nowRing.activeVote;
    vote.status = VoteStatus.CLOSED;

    // Tally already in correct format { optionName: count }
    return { vote, results: vote.tally };
  }

  // Trade management
  createOffer(offer) {
    this.offers.set(offer.id, offer);
    return offer;
  }

  getOffer(offerId) {
    return this.offers.get(offerId);
  }

  getOpenOffers() {
    return Array.from(this.offers.values())
      .filter(o => o.status === TradeStatus.OPEN);
  }

  acceptOffer(offerId, acceptingPlayerId) {
    const offer = this.offers.get(offerId);
    if (!offer || offer.status !== TradeStatus.OPEN) {
      return { success: false, reason: 'Offer not available' };
    }

    const fromPlayer = this.players.get(offer.fromPlayer);
    const toPlayer = this.players.get(acceptingPlayerId);

    if (!fromPlayer || !toPlayer) {
      return { success: false, reason: 'Player not found' };
    }

    // Check if fromPlayer has the items
    if (fromPlayer.inventory[offer.give.item] < offer.give.qty) {
      return { success: false, reason: 'Offerer lacks resources' };
    }

    // Check if acceptingPlayer has the items
    if (toPlayer.inventory[offer.want.item] < offer.want.qty) {
      return { success: false, reason: 'Accepter lacks resources' };
    }

    // Execute trade atomically
    fromPlayer.inventory[offer.give.item] -= offer.give.qty;
    fromPlayer.inventory[offer.want.item] += offer.want.qty;
    toPlayer.inventory[offer.want.item] -= offer.want.qty;
    toPlayer.inventory[offer.give.item] += offer.give.qty;

    offer.status = TradeStatus.COMPLETED;
    offer.acceptedBy = acceptingPlayerId;
    offer.completedAt = Date.now();

    return { success: true, offer };
  }

  // Stockpile management
  addToStockpile(item, amount) {
    if (this.stockpile.hasOwnProperty(item)) {
      this.stockpile[item] += amount;
      return true;
    }
    return false;
  }

  // Cadence tracking
  incrementMessageCount() {
    this.messagesSinceLastPulse++;
  }

  resetPulseCounter() {
    this.messagesSinceLastPulse = 0;
    this.lastPulseTime = Date.now();
  }

  shouldTriggerPulse() {
    const messageThreshold = parseInt(process.env.CADENCE_MESSAGE_THRESHOLD || '5');
    const timeThreshold = parseInt(process.env.CADENCE_TIME_THRESHOLD || '30') * 1000;
    const now = Date.now();

    return (
      this.messagesSinceLastPulse >= messageThreshold ||
      (now - this.lastPulseTime) >= timeThreshold
    );
  }

  // Export state
  exportChronicle() {
    return {
      canonRing: this.canonRing,
      nowRing: this.nowRing,
      players: Array.from(this.players.values()),
      stockpile: this.stockpile,
      quests: this.quests,
      votes: this.votes,
      offers: Array.from(this.offers.values()),
      timestamp: Date.now()
    };
  }

  // Get condensed context for Elder
  getElderContext(recentMessages = []) {
    const stones = this.canonRing.slice(-3); // Last 3 stones
    const recentActions = this.getScratchActions().slice(-5); // Last 5 scratch actions
    
    return {
      memoryStones: stones,
      activeQuest: this.nowRing.activeQuest,
      activeVote: this.nowRing.activeVote,
      stockpile: this.stockpile,
      recentActions,
      recentMessages: recentMessages.slice(-5)
    };
  }
}

// Singleton instance
export const gameState = new GameState();
