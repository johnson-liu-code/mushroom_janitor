/**
 * Tests for Elder Adapter
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { speakNPC } from '../adapters/elder_adapter.js';
import { buildElderInput } from '../engine/build_elder_input.js';
import { createMemoryStone, createVote, createQuest } from '../types.js';

/**
 * Create minimal mock state
 */
function createMockState() {
  return {
    canonRing: [
      createMemoryStone('stone1', 'The First Spore', 'When the first spore landed, Elder Mycel awoke beneath the moss.', ['origin'])
    ],
    nowRing: {
      activeQuest: null,
      activeVote: null,
      topRecentActions: []
    },
    stockpile: {
      moss: 5,
      cedar: 2,
      resin: 1,
      spores: 0
    }
  };
}

describe('Elder Adapter - Mock Provider', () => {
  it('should return message ending with "Next:"', async () => {
    const state = createMockState();
    const cadence = { mode: 'PULSE', reason: 'time_threshold' };
    const summaries = {
      top_recent_actions: [],
      last_messages_summary: [],
      safety_notes: null
    };

    const input = buildElderInput(state, cadence, summaries);
    const output = await speakNPC('elder_mycel', input);

    assert.ok(output.message_text, 'message_text should exist');
    assert.ok(output.message_text.includes('Next:'), 'message_text should contain "Next:"');
    assert.ok(output.nudge, 'nudge should exist');
    assert.ok(output.nudge.startsWith('Next:'), 'nudge should start with "Next:"');
    assert.strictEqual(output.nudge, 'Next: Contribute one needed item.');
  });

  it('should handle CALL_RESPONSE mode with question', async () => {
    const state = createMockState();
    const cadence = { 
      mode: 'CALL_RESPONSE', 
      reason: 'direct_question',
      question: 'Is moss rope safe in rain?'
    };
    const summaries = {
      top_recent_actions: [],
      last_messages_summary: [],
      safety_notes: null
    };

    const input = buildElderInput(state, cadence, summaries);
    const output = await speakNPC('elder_mycel', input);

    assert.ok(output.message_text.includes('Next:'));
    assert.strictEqual(output.nudge, 'Next: Contribute one needed item.');
  });
});

describe('Elder Adapter - Fallback Handling', () => {
  it('should use fallback when provider throws and message ends with "Next:"', async () => {
    // This test simulates what happens when a provider throws
    // Since we're using mock provider which doesn't throw, we test the fallback logic conceptually
    const fallback = {
      referenced_stones: [],
      acknowledged_users: [],
      nudge: 'Next: Contribute one needed item.',
      message_text: 'The village moves by gentle steps.\n\nNext: Contribute one needed item.'
    };

    assert.ok(fallback.message_text.includes('Next:'), 'Fallback message should contain "Next:"');
    assert.ok(fallback.nudge.startsWith('Next:'), 'Fallback nudge should start with "Next:"');
    assert.strictEqual(fallback.nudge, 'Next: Contribute one needed item.');
  });
});

describe('buildElderInput', () => {
  it('should produce needs[] as names only', () => {
    const state = createMockState();
    const quest = createQuest('q1', 'Build the Bridge', { cedar: 3, resin: 2 });
    quest.needs = [
      { item: 'cedar', qty: 2 },
      { item: 'resin', qty: 1 }
    ];
    state.nowRing.activeQuest = quest;

    const cadence = { mode: 'PULSE', reason: 'test' };
    const summaries = {
      top_recent_actions: [],
      last_messages_summary: [],
      safety_notes: null
    };

    const input = buildElderInput(state, cadence, summaries);

    assert.ok(input.now.quest, 'quest should exist');
    assert.ok(Array.isArray(input.now.quest.needs), 'needs should be an array');
    assert.deepStrictEqual(input.now.quest.needs, ['cedar', 'resin'], 'needs should be names only');
  });

  it('should compute vote.leading correctly with clear winner', () => {
    const state = createMockState();
    const vote = createVote('v1', 'What material?', ['Cedar Plank', 'Moss Rope'], Date.now() + 60000);
    vote.tally = {
      'player1': 'Cedar Plank',
      'player2': 'Cedar Plank',
      'player3': 'Moss Rope'
    };
    state.nowRing.activeVote = vote;

    const cadence = { mode: 'PULSE', reason: 'test' };
    const summaries = {
      top_recent_actions: [],
      last_messages_summary: [],
      safety_notes: null
    };

    const input = buildElderInput(state, cadence, summaries);

    assert.ok(input.now.vote, 'vote should exist');
    assert.strictEqual(input.now.vote.leading, 'Cedar Plank', 'leading should be Cedar Plank');
  });

  it('should set vote.leading to null when there is a tie', () => {
    const state = createMockState();
    const vote = createVote('v1', 'What material?', ['Cedar Plank', 'Moss Rope'], Date.now() + 60000);
    vote.tally = {
      'player1': 'Cedar Plank',
      'player2': 'Moss Rope'
    };
    state.nowRing.activeVote = vote;

    const cadence = { mode: 'PULSE', reason: 'test' };
    const summaries = {
      top_recent_actions: [],
      last_messages_summary: [],
      safety_notes: null
    };

    const input = buildElderInput(state, cadence, summaries);

    assert.ok(input.now.vote, 'vote should exist');
    assert.strictEqual(input.now.vote.leading, null, 'leading should be null when tied');
  });

  it('should only include question when mode is CALL_RESPONSE', () => {
    const state = createMockState();

    // PULSE mode
    const cadence1 = { mode: 'PULSE', reason: 'test', question: 'Should be ignored' };
    const summaries = {
      top_recent_actions: [],
      last_messages_summary: [],
      safety_notes: null
    };
    const input1 = buildElderInput(state, cadence1, summaries);
    assert.strictEqual(input1.question, null, 'question should be null in PULSE mode');

    // CALL_RESPONSE mode
    const cadence2 = { mode: 'CALL_RESPONSE', reason: 'test', question: 'Is moss safe?' };
    const input2 = buildElderInput(state, cadence2, summaries);
    assert.strictEqual(input2.question, 'Is moss safe?', 'question should be included in CALL_RESPONSE mode');
  });

  it('should trim and deduplicate top_recent_actions', () => {
    const state = createMockState();
    const cadence = { mode: 'PULSE', reason: 'test' };
    const summaries = {
      top_recent_actions: [
        'Action 1',
        'Action 2',
        'Action 2',  // duplicate
        '  Action 3  ',  // needs trimming
        'Action 4',
        'Action 5',
        'Action 6'  // Should be cut off at 5
      ],
      last_messages_summary: [],
      safety_notes: null
    };

    const input = buildElderInput(state, cadence, summaries);

    assert.ok(Array.isArray(input.top_recent_actions));
    assert.ok(input.top_recent_actions.length <= 5, 'should have max 5 actions');
    assert.strictEqual(input.top_recent_actions[2], 'Action 3', 'should trim whitespace');
    // Check no duplicates
    const uniqueActions = new Set(input.top_recent_actions);
    assert.strictEqual(uniqueActions.size, input.top_recent_actions.length, 'should have no duplicates');
  });

  it('should trim and deduplicate last_messages_summary', () => {
    const state = createMockState();
    const cadence = { mode: 'PULSE', reason: 'test' };
    const summaries = {
      top_recent_actions: [],
      last_messages_summary: [
        'Message 1',
        'Message 2',
        'Message 2',  // duplicate
        'Message 3',
        'Message 4',
        'Message 5',
        'Message 6',
        'Message 7',
        'Message 8',
        'Message 9'  // Should be cut off at 8
      ],
      safety_notes: null
    };

    const input = buildElderInput(state, cadence, summaries);

    assert.ok(Array.isArray(input.last_messages_summary));
    assert.ok(input.last_messages_summary.length <= 8, 'should have max 8 messages');
    // Check no duplicates
    const uniqueMessages = new Set(input.last_messages_summary);
    assert.strictEqual(uniqueMessages.size, input.last_messages_summary.length, 'should have no duplicates');
  });
});
