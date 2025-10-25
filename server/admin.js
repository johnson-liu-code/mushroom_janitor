// Admin utilities for managing game state
import { gameState } from './state.js';
import { createMemoryStone, createQuest, createVote } from './types.js';
import { rhizomorphQuartermaster } from './agents/quartermaster.js';
import { lamellaTallykeeper } from './agents/tallykeeper.js';
import { lichenArchivist } from './agents/archivist.js';

class AdminTools {
  constructor() {
    this.adminPasscode = process.env.ADMIN_PASSCODE || 'mushroom123';
  }

  // Verify admin access
  verifyAdmin(passcode) {
    return passcode === this.adminPasscode;
  }

  // Seed initial Memory Stones
  seedMemoryStones() {
    const stones = [
      createMemoryStone('stone1', 'The First Spore', 'When the first spore landed, Elder Mycel awoke beneath the moss.', ['origin', 'elder']),
      createMemoryStone('stone2', 'The Cedar Grove', 'Three ancient cedars mark the village heart.', ['location', 'cedar']),
      createMemoryStone('stone3', 'The Gift of Resin', 'Resin flows when cedars sense harmony.', ['resource', 'magic']),
      createMemoryStone('stone4', 'First Harvest', 'Our ancestors gathered moss to build the first shelter.', ['history', 'community']),
      createMemoryStone('stone5', 'The Great Storm', 'Lightning struck the Elder Cedar but it stood firm.', ['event', 'resilience'])
    ];

    gameState.canonRing = stones;
    return { success: true, count: stones.length };
  }

  // Start a quest
  startQuest(name, recipe) {
    const quest = rhizomorphQuartermaster.startQuest(name, recipe);
    return { success: true, quest };
  }

  // Complete current quest
  completeQuest() {
    const quest = rhizomorphQuartermaster.completeQuest();
    return { success: true, quest };
  }

  // Open a vote
  openVote(topic, options, durationMinutes = 5) {
    const vote = lamellaTallykeeper.openVote(topic, options, durationMinutes);
    return { success: true, vote };
  }

  // Close current vote
  async closeVote() {
    const result = await lamellaTallykeeper.closeVote();
    return { success: true, result };
  }

  // Add resources to stockpile
  addToStockpile(item, quantity) {
    const success = gameState.addToStockpile(item, quantity);
    return { success, stockpile: gameState.stockpile };
  }

  // Give resources to player
  givePlayerResources(playerId, item, quantity) {
    const success = gameState.updatePlayerInventory(playerId, item, quantity);
    if (success) {
      const player = gameState.getPlayer(playerId);
      return { success: true, player };
    }
    return { success: false, reason: 'Failed to update inventory' };
  }

  // Create Memory Stone
  addMemoryStone(title, text, tags = []) {
    const stone = createMemoryStone(
      `stone_${Date.now()}`,
      title,
      text,
      tags
    );
    gameState.addMemoryStone(stone);
    return { success: true, stone };
  }

  // Toggle archivist auto-promote
  toggleAutoPromote(enabled) {
    lichenArchivist.setAutoPromote(enabled);
    return { success: true, autoPromote: enabled };
  }

  // Get game state summary
  getStateSummary() {
    return {
      players: gameState.players.size,
      memoryStones: gameState.canonRing.length,
      activeQuest: gameState.nowRing.activeQuest?.name || null,
      activeVote: gameState.nowRing.activeVote?.topic || null,
      stockpile: gameState.stockpile,
      openOffers: gameState.getOpenOffers().length,
      scratchActions: gameState.scratchRing.length
    };
  }

  // Reset game state (dangerous!)
  resetGameState() {
    gameState.canonRing = [];
    gameState.nowRing = {
      activeQuest: null,
      activeVote: null,
      topRecentActions: []
    };
    gameState.scratchRing = [];
    gameState.players.clear();
    gameState.offers.clear();
    gameState.quests = [];
    gameState.votes = [];
    gameState.stockpile = {
      moss: 0,
      cedar: 0,
      resin: 0,
      spores: 0,
      charms: 0
    };

    // Re-seed initial stones
    this.seedMemoryStones();

    return { success: true, message: 'Game state reset' };
  }

  // Export full chronicle
  exportChronicle() {
    return gameState.exportChronicle();
  }

  // Example admin commands for demo
  setupDemoScenario() {
    // Add some resources to stockpile
    this.addToStockpile('moss', 15);
    this.addToStockpile('cedar', 8);
    this.addToStockpile('resin', 3);

    // Start a quest
    this.startQuest('Gather for Winter', {
      moss: 30,
      cedar: 15,
      resin: 10
    });

    // Open a vote
    this.openVote('Where should we build the new shelter?', [
      'By the ancient cedar',
      'Near the moss grove',
      'Beside the stream'
    ], 10);

    return {
      success: true,
      message: 'Demo scenario ready',
      state: this.getStateSummary()
    };
  }
}

// Singleton instance
export const adminTools = new AdminTools();

// Command-line interface helper
export function executeAdminCommand(command, args = {}) {
  switch (command) {
    case 'seed-stones':
      return adminTools.seedMemoryStones();
    
    case 'start-quest':
      return adminTools.startQuest(args.name, args.recipe);
    
    case 'open-vote':
      return adminTools.openVote(args.topic, args.options, args.duration);
    
    case 'add-stockpile':
      return adminTools.addToStockpile(args.item, args.quantity);
    
    case 'reset':
      return adminTools.resetGameState();
    
    case 'demo':
      return adminTools.setupDemoScenario();
    
    case 'export':
      return adminTools.exportChronicle();
    
    case 'summary':
      return adminTools.getStateSummary();
    
    default:
      return { success: false, error: 'Unknown command' };
  }
}
