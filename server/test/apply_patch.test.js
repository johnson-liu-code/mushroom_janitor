/**
 * Tests for apply_patch engine
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { applyPatch } from '../engine/apply_patch.js';
import { TradeStatus, VoteStatus, QuestStatus, createPlayer, createOffer, createVote, createQuest, createMemoryStone } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create a minimal mock state for testing
 */
function createMockState() {
  const players = new Map();
  const offers = new Map();
  
  const state = {
    players,
    offers,
    canonRing: [
      createMemoryStone('stone1', 'First Stone', 'The beginning.', ['origin']),
      createMemoryStone('stone2', 'Second Stone', 'The middle.', ['wisdom'])
    ],
    nowRing: {
      activeQuest: null,
      activeVote: null,
      topRecentActions: []
    },
    quest: {},
    
    // Methods
    getPlayer: (id) => players.get(id),
    addPlayer: (player) => players.set(player.id, player),
    getOffer: (id) => offers.get(id),
    createOffer: (offer) => offers.set(offer.id, offer),
    addRecentAction: (action) => {
      state.nowRing.topRecentActions.unshift(action);
      state.nowRing.topRecentActions = state.nowRing.topRecentActions.slice(0, 10);
    }
  };
  
  return state;
}

/**
 * Create a mock logger that captures warnings
 */
function createMockLogger() {
  const warnings = [];
  return {
    warn: (msg) => warnings.push(msg),
    info: (msg) => {}, // Silent
    warnings
  };
}

describe('applyPatch', () => {
  let fixture;
  
  beforeEach(() => {
    // Load fixture
    const fixturePath = resolve(__dirname, 'fixtures/letta_response.json');
    const fixtureData = readFileSync(fixturePath, 'utf-8');
    fixture = JSON.parse(fixtureData);
  });

  it('should handle trade failure - offer not found', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    // Create players with inventory
    const mira = createPlayer('mira', 'Mira');
    mira.inventory.moss = 5;
    const rowan = createPlayer('rowan', 'Rowan');
    rowan.inventory.cedar = 3;
    state.addPlayer(mira);
    state.addPlayer(rowan);
    
    // Patch with trade action for non-existent offer
    const patch = {
      trades: {
        actions: [{
          type: 'RESOLVE',
          id: 'o999',
          from: 'mira',
          to: 'rowan'
        }]
      },
      vote: { tally: {} },
      resources: {},
      archive: {},
      safety: {}
    };
    
    const summary = applyPatch(state, patch, { log });
    
    // Verify inventories unchanged
    assert.strictEqual(mira.inventory.moss, 5);
    assert.strictEqual(rowan.inventory.cedar, 3);
    
    // Verify warning logged
    assert.strictEqual(log.warnings.length, 1);
    assert.match(log.warnings[0], /trade o999 skipped: offer not found/);
    
    // Verify summary
    assert.strictEqual(summary.tradesFailed, 1);
    assert.strictEqual(summary.tradesResolved, 0);
  });

  it('should handle trade failure - offer not OPEN', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    const mira = createPlayer('mira', 'Mira');
    mira.inventory.moss = 5;
    const rowan = createPlayer('rowan', 'Rowan');
    rowan.inventory.cedar = 3;
    state.addPlayer(mira);
    state.addPlayer(rowan);
    
    // Create completed offer
    const offer = createOffer('o1', 'mira', { item: 'moss', qty: 2 }, { item: 'cedar', qty: 1 });
    offer.status = TradeStatus.COMPLETED;
    state.createOffer(offer);
    
    const patch = {
      trades: {
        actions: [{
          type: 'RESOLVE',
          id: 'o1',
          from: 'mira',
          to: 'rowan'
        }]
      },
      vote: { tally: {} },
      resources: {},
      archive: {},
      safety: {}
    };
    
    applyPatch(state, patch, { log });
    
    // Verify inventories unchanged
    assert.strictEqual(mira.inventory.moss, 5);
    assert.strictEqual(rowan.inventory.cedar, 3);
    
    // Verify offer still COMPLETED
    assert.strictEqual(offer.status, TradeStatus.COMPLETED);
    
    // Verify warning logged
    assert.strictEqual(log.warnings.length, 1);
    assert.match(log.warnings[0], /trade o1 skipped: offer not OPEN/);
  });

  it('should handle trade failure - insufficient inventory', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    const mira = createPlayer('mira', 'Mira');
    mira.inventory.moss = 1; // Not enough
    const rowan = createPlayer('rowan', 'Rowan');
    rowan.inventory.cedar = 3;
    state.addPlayer(mira);
    state.addPlayer(rowan);
    
    const offer = createOffer('o1', 'mira', { item: 'moss', qty: 2 }, { item: 'cedar', qty: 1 });
    offer.status = TradeStatus.OPEN;
    state.createOffer(offer);
    
    const patch = {
      trades: {
        actions: [{
          type: 'RESOLVE',
          id: 'o1',
          from: 'mira',
          to: 'rowan'
        }]
      },
      vote: { tally: {} },
      resources: {},
      archive: {},
      safety: {}
    };
    
    applyPatch(state, patch, { log });
    
    // Verify inventories unchanged
    assert.strictEqual(mira.inventory.moss, 1);
    assert.strictEqual(rowan.inventory.cedar, 3);
    
    // Verify offer still OPEN
    assert.strictEqual(offer.status, TradeStatus.OPEN);
    
    // Verify warning logged
    assert.strictEqual(log.warnings.length, 1);
    assert.match(log.warnings[0], /trade o1 skipped: from player lacks moss/);
  });

  it('should handle vote open - tally matches input, status remains OPEN', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    // Create active vote
    const vote = createVote('v1', 'What material?', ['Cedar Plank', 'Moss Rope'], Date.now() + 60000);
    state.nowRing.activeVote = vote;
    
    applyPatch(state, fixture, { log });
    
    // Verify tally matches input
    assert.deepStrictEqual(vote.tally, {
      'Cedar Plank': 1,
      'Moss Rope': 1
    });
    
    // Verify status remains OPEN
    assert.strictEqual(vote.status, VoteStatus.OPEN);
    assert.strictEqual(vote.canVote, true);
  });

  it('should handle resources - quest percent, needs, threshold', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    // Create active quest
    const quest = createQuest('q1', 'Build the Bridge', { cedar: 3, resin: 2 });
    state.nowRing.activeQuest = quest;
    
    applyPatch(state, fixture, { log });
    
    // Verify quest percent set to 50
    assert.strictEqual(quest.percent, 50);
    
    // Verify needs contains cedar×2 and resin×1
    assert.deepStrictEqual(quest.needs, [
      { item: 'cedar', qty: 2 },
      { item: 'resin', qty: 1 }
    ]);
    
    // Verify lastThresholdAt=50
    assert.strictEqual(quest.lastThresholdAt, 50);
  });

  it('should handle archive - new stone appears, total stones ≤ 12', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    const stonesBefore = state.canonRing.length;
    
    applyPatch(state, fixture, { log });
    
    // Verify a new stone titled "The Brook's Balance" appears
    const newStone = state.canonRing.find(s => s.title === "The Brook's Balance");
    assert.ok(newStone, 'New stone should exist');
    assert.strictEqual(newStone.text, 'The brook teaches balance.');
    assert.deepStrictEqual(newStone.tags, ['wisdom', 'quest']);
    
    // Verify total stones ≤ 12
    assert.ok(state.canonRing.length <= 12);
    assert.strictEqual(state.canonRing.length, stonesBefore + 1);
  });

  it('should enforce 12 stone cap by removing oldest', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    // Fill canonRing with 12 stones
    state.canonRing = [];
    for (let i = 0; i < 12; i++) {
      state.canonRing.push(createMemoryStone(`old${i}`, `Old ${i}`, `Text ${i}`, []));
    }
    
    const oldestId = state.canonRing[0].id;
    
    // Apply patch that adds one more stone
    applyPatch(state, fixture, { log });
    
    // Verify total is still 12
    assert.strictEqual(state.canonRing.length, 12);
    
    // Verify oldest was removed
    assert.ok(!state.canonRing.find(s => s.id === oldestId));
    
    // Verify new stone exists
    assert.ok(state.canonRing.find(s => s.title === "The Brook's Balance"));
  });

  it('should handle full fixture without errors', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    // Setup active quest and vote
    const quest = createQuest('q1', 'Build the Bridge', { cedar: 3, resin: 2 });
    state.nowRing.activeQuest = quest;
    
    const vote = createVote('v1', 'What material?', ['Cedar Plank', 'Moss Rope'], Date.now() + 60000);
    state.nowRing.activeVote = vote;
    
    const summary = applyPatch(state, fixture, { log });
    
    // Verify no errors
    assert.strictEqual(log.warnings.length, 0);
    
    // Verify summary
    assert.strictEqual(summary.tradesResolved, 0);
    assert.strictEqual(summary.tradesFailed, 0);
    assert.strictEqual(summary.voteStatus, 'OPEN');
    assert.strictEqual(summary.questPercent, 50);
    assert.strictEqual(summary.stonesCount, 3); // 2 initial + 1 promoted
  });

  it('should handle safety - rate limits with cooldownUntil', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    const mira = createPlayer('mira', 'Mira');
    state.addPlayer(mira);
    
    const patch = {
      trades: { actions: [] },
      vote: { tally: {} },
      resources: {},
      archive: {},
      safety: {
        flags: ['spam_detected'],
        rate_limits: [
          { player: 'mira', cooldown_s: 30 }
        ],
        notes_for_elder: 'User exhibited rapid-fire messages'
      }
    };
    
    const beforeTime = Date.now();
    applyPatch(state, patch, { log });
    const afterTime = Date.now();
    
    // Verify cooldownUntil is set
    assert.ok(mira.cooldownUntil);
    assert.ok(mira.cooldownUntil >= beforeTime + 30000);
    assert.ok(mira.cooldownUntil <= afterTime + 30000);
    
    // Verify flags stored
    assert.deepStrictEqual(state.safetyFlags, ['spam_detected']);
    
    // Verify notes stored
    assert.strictEqual(state.notesForElder, 'User exhibited rapid-fire messages');
  });

  it('should update prior_quest_percent after apply', () => {
    const state = createMockState();
    const log = createMockLogger();
    
    const quest = createQuest('q1', 'Build the Bridge', { cedar: 3, resin: 2 });
    state.nowRing.activeQuest = quest;
    
    applyPatch(state, fixture, { log });
    
    // Verify prior_quest_percent is set
    assert.strictEqual(state.prior_quest_percent, 50);
  });
});
