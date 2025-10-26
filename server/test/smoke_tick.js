/**
 * Smoke test for tick application
 * 
 * Loads fixture, creates minimal mock state, runs applyPatch,
 * and prints a one-line summary.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { applyPatch } from '../engine/apply_patch.js';
import { createPlayer, createVote, createQuest, createMemoryStone } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create minimal mock state
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

// Mock logger
const log = {
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`)
};

// Load fixture
const fixturePath = resolve(__dirname, 'fixtures/letta_response.json');
const fixtureData = readFileSync(fixturePath, 'utf-8');
const patch = JSON.parse(fixtureData);

// Create mock state with active quest and vote
const state = createMockState();

const quest = createQuest('q1', 'Build the Bridge', { cedar: 3, resin: 2 });
state.nowRing.activeQuest = quest;

const vote = createVote('v1', 'What material?', ['Cedar Plank', 'Moss Rope'], Date.now() + 60000);
state.nowRing.activeVote = vote;

// Run applyPatch
const summary = applyPatch(state, patch, { log });

// Print one-line summary
const tick = 1; // Mock tick number
const actions = summary.tradesResolved;
const voteStatus = state.nowRing.activeVote?.status || 'none';
const questPercent = state.nowRing.activeQuest?.percent || 0;
const stones = state.canonRing.length;

console.log(`tick=${tick} actions=${actions} vote=${voteStatus} quest=${questPercent} stones=${stones}`);
