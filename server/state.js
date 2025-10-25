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
    let totalRequired = 0;
    let totalHave = 0;

    for (const [item, qty] of Object.entries(quest.recipe)) {
      totalRequired += qty;
      totalHave += Math.min(this.stockpile[item] || 0, qty);
    }

    quest.percent = totalRequired > 0 ? Math.floor((totalHave / totalRequired) * 100) : 0;
    
    if (quest.percent >= 100) {
      quest.status = QuestStatus.COMPLETED;
    }

    return quest;
  }

  // Vote management
  setActiveVote(vote) {
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

    vote.tally[playerId] = option;
    return true;
  }

  closeVote() {
    if (!this.nowRing.activeVote) return null;
    
    const vote = this.nowRing.activeVote;
    vote.status = VoteStatus.CLOSED;

    // Count results
    const results = {};
    vote.options.forEach(opt => results[opt] = 0);
    Object.values(vote.tally).forEach(opt => {
      if (results.hasOwnProperty(opt)) {
        results[opt]++;
      }
    });

    return { vote, results };
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
