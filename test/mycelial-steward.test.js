// Unit tests for MycelialSteward adapter
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mycelialSteward } from '../server/adapters/mycelial-steward.js';

// Helper to create starter payload
function createStarterPayload() {
  return {
    timestamp: Date.now(),
    players: [
      { id: 'p1', name: 'Alice', inventory: { moss: 5 }, messageCount: 2 }
    ],
    stockpile: { moss: 10, cedar: 5, resin: 2, spores: 0, charms: 0 },
    activeQuest: {
      id: 'quest1',
      name: 'Gather for Winter',
      recipe: { moss: 20, cedar: 10 },
      percent: 45
    },
    activeVote: {
      id: 'vote1',
      topic: 'Where to build?',
      options: ['North', 'South'],
      tally: { 'p1': 'North' },
      closesAt: Date.now() + 60000,
      status: 'OPEN'
    },
    openOffers: [],
    memoryStones: [
      { id: 's1', title: 'First Stone', text: 'The beginning.', tags: ['origin'] }
    ],
    recentActions: [],
    journalQueue: [
      { id: 'j1', playerId: 'p1', text: 'A wonderful day', timestamp: Date.now() - (6 * 60 * 1000) }
    ],
    context: {
      messagesSincePulse: 2,
      timeSincePulse: 15000,
      activeWarnings: [],
      priorQuestPercent: 45
    }
  };
}

describe('MycelialSteward - Test Vectors', () => {
  
  // Test Vector 1: Vote Quorum Close
  it('should close vote when quorum reached (≥50% players)', async () => {
    const input = {
      timestamp: Date.now(),
      state: {
        players: [
          { id: 'p1', name: 'Alice', inventory: {}, messageCount: 0 },
          { id: 'p2', name: 'Bob', inventory: {}, messageCount: 0 },
          { id: 'p3', name: 'Carol', inventory: {}, messageCount: 0 },
          { id: 'p4', name: 'Dave', inventory: {}, messageCount: 0 }
        ],
        activeVote: {
          id: 'vote1',
          topic: 'Where to build?',
          options: ['North', 'South', 'East'],
          tally: {
            'p1': 'North',
            'p2': 'North',
            'p3': 'South'
          },
          closesAt: Date.now() + 60000,
          status: 'OPEN'
        },
        stockpile: { moss: 0, cedar: 0, resin: 0, spores: 0, charms: 0 },
        activeQuest: null,
        openOffers: [],
        memoryStones: [],
        recentActions: [],
        journalQueue: []
      },
      context: {
        messagesSincePulse: 0,
        timeSincePulse: 0,
        activeWarnings: []
      }
    };

    const patch = await mycelialSteward.orchestrate(input);
    
    // Quorum: 3/4 players voted = 75% >= 50%
    assert.strictEqual(patch.vote.close, true, 'Vote should close with quorum');
    assert.ok(patch.vote.decisionCard, 'Should have decision card');
    assert.strictEqual(patch.vote.decisionCard.winner, 'North');
    assert.strictEqual(patch.vote.decisionCard.topic, 'Where to build?');
  });

  // Test Vector 2: Quest Percent Calculation
  it('should calculate quest progress correctly', async () => {
    const input = {
      timestamp: Date.now(),
      state: {
        players: [],
        stockpile: { moss: 15, cedar: 5, resin: 2, spores: 0, charms: 0 },
        activeQuest: {
          id: 'quest1',
          name: 'Gather for Winter',
          recipe: { moss: 30, cedar: 10, resin: 5 },
          percent: 0
        },
        activeVote: null,
        openOffers: [],
        memoryStones: [],
        recentActions: [],
        journalQueue: []
      },
      context: {
        messagesSincePulse: 0,
        timeSincePulse: 0,
        activeWarnings: []
      }
    };

    const patch = await mycelialSteward.orchestrate(input);
    
    // Total required: 30 + 10 + 5 = 45
    // Have: min(15,30) + min(5,10) + min(2,5) = 15 + 5 + 2 = 22
    // Percent: 22/45 * 100 = 48.88... = 48%
    assert.strictEqual(patch.resources.questPercentDelta, 48);
  });

  // Test Vector 3: Trade Consent (Stale Offer Cancellation)
  it('should cancel stale trade offers (>1 hour)', async () => {
    const oneHourAgo = Date.now() - (61 * 60 * 1000);
    const recent = Date.now() - (30 * 60 * 1000);

    const input = {
      timestamp: Date.now(),
      state: {
        players: [],
        stockpile: { moss: 0, cedar: 0, resin: 0, spores: 0, charms: 0 },
        activeQuest: null,
        activeVote: null,
        openOffers: [
          { id: 'offer1', fromPlayer: 'p1', give: { item: 'moss', qty: 5 }, want: { item: 'cedar', qty: 2 }, createdAt: oneHourAgo },
          { id: 'offer2', fromPlayer: 'p2', give: { item: 'cedar', qty: 3 }, want: { item: 'resin', qty: 1 }, createdAt: recent }
        ],
        memoryStones: [],
        recentActions: [],
        journalQueue: []
      },
      context: {
        messagesSincePulse: 0,
        timeSincePulse: 0,
        activeWarnings: []
      }
    };

    const patch = await mycelialSteward.orchestrate(input);
    
    assert.strictEqual(patch.trades.cancel.length, 1);
    assert.ok(patch.trades.cancel.includes('offer1'));
    assert.ok(!patch.trades.cancel.includes('offer2'));
  });

  // Test Vector 4: Archivist Cap (>12 stones)
  it('should prune stones when exceeding 12', async () => {
    const stones = [];
    for (let i = 0; i < 15; i++) {
      stones.push({
        id: `stone${i}`,
        title: `Stone ${i}`,
        text: `Text ${i}`,
        tags: []
      });
    }

    const input = {
      timestamp: Date.now(),
      state: {
        players: [],
        stockpile: { moss: 0, cedar: 0, resin: 0, spores: 0, charms: 0 },
        activeQuest: null,
        activeVote: null,
        openOffers: [],
        memoryStones: stones,
        recentActions: [],
        journalQueue: []
      },
      context: {
        messagesSincePulse: 0,
        timeSincePulse: 0,
        activeWarnings: []
      }
    };

    const patch = await mycelialSteward.orchestrate(input);
    
    // Should prune oldest stone when >12
    assert.ok(patch.archive.pruneStones.length > 0);
    assert.strictEqual(patch.archive.pruneStones[0], 'stone0');
  });

  // Test Vector 5: Cadence Burst (Rapid Messages)
  it('should trigger Elder on message burst', async () => {
    const payload = {
      timestamp: Date.now(),
      players: [
        { id: 'p1', name: 'Alice', inventory: {}, messageCount: 12 }
      ],
      stockpile: { moss: 0, cedar: 0, resin: 0, spores: 0, charms: 0 },
      activeQuest: null,
      activeVote: null,
      openOffers: [],
      memoryStones: [],
      recentActions: [],
      journalQueue: [],
      context: {
        messagesSincePulse: 6, // Exceeds threshold of 5
        timeSincePulse: 10000,
        activeWarnings: []
      }
    };

    const patch = await mycelialSteward.sendTick(payload);
    
    // Should trigger Elder due to message threshold
    assert.strictEqual(patch.cadence.shouldElderSpeak, true);
    assert.strictEqual(patch.cadence.triggerReason, 'message_threshold');
    
    // Should also warn player for rapid messages
    assert.ok(patch.safety.warnings.length > 0);
    assert.strictEqual(patch.safety.warnings[0].playerId, 'p1');
    assert.strictEqual(patch.safety.warnings[0].reason, 'rapid_messages');
  });
});

describe('MycelialSteward - Validation & Normalization', () => {
  
  it('should extract JSON from text+JSON response', () => {
    const response = `Here's the analysis:
{
  "trades": {"resolve": [], "cancel": ["offer1"]},
  "vote": {"close": true},
  "resources": {"stockpileDeltas": {}, "questPercentDelta": 0},
  "archive": {"promoteJournals": [], "pruneStones": [], "newStones": []},
  "safety": {"warnings": [], "calmDown": []},
  "cadence": {"shouldElderSpeak": false}
}
Done!`;

    const normalized = mycelialSteward.validateAndNormalize(response);
    
    assert.ok(normalized.trades);
    assert.strictEqual(normalized.vote.close, true);
    assert.deepStrictEqual(normalized.trades.cancel, ['offer1']);
  });

  it('should fill missing fields with safe defaults', () => {
    const partial = {
      trades: { resolve: ['offer1'] },
      vote: { close: true }
      // Missing: resources, archive, safety, cadence
    };

    const normalized = mycelialSteward.validateAndNormalize(partial);
    
    assert.deepStrictEqual(normalized.trades.resolve, ['offer1']);
    assert.deepStrictEqual(normalized.trades.cancel, []);
    assert.strictEqual(normalized.vote.close, true);
    assert.deepStrictEqual(normalized.resources.stockpileDeltas, {});
    assert.strictEqual(normalized.resources.questPercentDelta, 0);
    assert.deepStrictEqual(normalized.archive.promoteJournals, []);
    assert.deepStrictEqual(normalized.safety.warnings, []);
    assert.strictEqual(normalized.cadence.shouldElderSpeak, false);
  });

  it('should handle completely invalid response', () => {
    const invalid = "This is not JSON at all!";
    const normalized = mycelialSteward.validateAndNormalize(invalid);
    
    // Should return all empty/false defaults
    assert.deepStrictEqual(normalized.trades.resolve, []);
    assert.deepStrictEqual(normalized.trades.cancel, []);
    assert.strictEqual(normalized.vote.close, false);
    assert.strictEqual(normalized.cadence.shouldElderSpeak, false);
  });
});

describe('MycelialSteward - Status', () => {
  
  it('should return status with mode and health', () => {
    const status = mycelialSteward.getStatus();
    
    assert.ok(status.mode === 'MOCK' || status.mode === 'LIVE');
    assert.strictEqual(typeof status.healthy, 'boolean');
    if (status.last_error) {
      assert.strictEqual(typeof status.last_error, 'string');
    }
  });
});

describe('MycelialSteward - State Trimming', () => {
  
  it('should trim state for API efficiency', () => {
    const fullState = {
      players: Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`,
        name: `Player${i}`,
        inventory: { moss: i },
        messageCount: i,
        extraField: 'should be removed'
      })),
      stockpile: { moss: 100, cedar: 50, resin: 25, spores: 10, charms: 5 },
      activeQuest: { id: 'q1', name: 'Test Quest' },
      activeVote: null,
      openOffers: Array.from({ length: 20 }, (_, i) => ({ id: `offer${i}`, createdAt: Date.now() })),
      memoryStones: [],
      recentActions: Array.from({ length: 50 }, (_, i) => ({ id: `action${i}` })),
      journalQueue: [],
      messagesSincePulse: 3,
      lastPulseTime: Date.now() - 15000,
      activeWarnings: []
    };

    const trimmed = mycelialSteward.trimState(fullState);
    
    assert.ok(trimmed.timestamp);
    assert.strictEqual(trimmed.state.players.length, 20);
    assert.ok(!trimmed.state.players[0].extraField);
    assert.ok(trimmed.state.players[0].inventory);
    assert.strictEqual(trimmed.state.openOffers.length, 10); // Limited to 10
    assert.strictEqual(trimmed.state.recentActions.length, 20); // Limited to 20
    assert.ok(trimmed.context.messagesSincePulse >= 0);
    assert.ok(trimmed.context.timeSincePulse >= 0);
  });
});

describe('MycelialSteward - New Requirements Tests', () => {
  
  // Test 1: Starter payload assertions
  it('should handle starter payload correctly', async () => {
    const payload = createStarterPayload();
    // Add two more players so 1/3 votes is clearly below 50% quorum
    payload.players.push({ id: 'p2', name: 'Bob', inventory: {}, messageCount: 0 });
    payload.players.push({ id: 'p3', name: 'Carol', inventory: {}, messageCount: 0 });
    
    const patch = await mycelialSteward.sendTick(payload);
    
    // Assert patch shape has all required keys
    assert.ok('cadence' in patch, 'Should have cadence key');
    assert.ok('vote' in patch, 'Should have vote key');
    assert.ok('resources' in patch, 'Should have resources key');
    assert.ok('trades' in patch, 'Should have trades key');
    assert.ok('archive' in patch, 'Should have archive key');
    assert.ok('safety' in patch, 'Should have safety key');
    
    // Vote should stay OPEN (1/3 voted = 33% < 50% quorum)
    assert.strictEqual(patch.vote.close, false, 'Vote should remain OPEN');
    
    // Quest resources calculated from current stockpile
    // Recipe: moss:20, cedar:10 = 30 total. Have: 10+5=15 = 50%. Was at 45%, so delta is 5%
    assert.strictEqual(patch.resources.questPercentDelta, 5, 'Quest should progress to 50%');
    
    // Archive should promote old journal (>5 min old)
    assert.ok(patch.archive.promoteJournals.length > 0, 'Should promote old journal');
    assert.strictEqual(patch.archive.promoteJournals[0], 'j1');
  });

  // Test 2: Quorum close scenario
  it('should close vote when quorum is reached', async () => {
    const payload = createStarterPayload();
    // Add more players and votes to reach quorum
    payload.players = [
      { id: 'p1', name: 'Alice', inventory: {}, messageCount: 0 },
      { id: 'p2', name: 'Bob', inventory: {}, messageCount: 0 },
      { id: 'p3', name: 'Carol', inventory: {}, messageCount: 0 }
    ];
    payload.activeVote.tally = {
      'p1': 'North',
      'p2': 'North'
    };
    
    const patch = await mycelialSteward.sendTick(payload);
    
    // Quorum: 2/3 = 66.6% >= 50%
    assert.strictEqual(patch.vote.close, true, 'Vote should close with quorum');
    assert.ok(patch.vote.decisionCard, 'Should generate decision card');
    assert.strictEqual(patch.vote.decisionCard.winner, 'North');
  });

  // Test 3: Quest 50% threshold
  it('should detect quest 50% threshold crossing', async () => {
    const payload = createStarterPayload();
    // Set stockpile to push quest to exactly 50%
    // Recipe: moss:20, cedar:10 = 30 total
    // For 50%: need 15 total
    // Currently at 45%: 13.5 items (moss:10, cedar:5 = 15 items = 50%)
    payload.stockpile = { moss: 10, cedar: 5, resin: 0, spores: 0, charms: 0 };
    payload.activeQuest.percent = 45;
    payload.context.priorQuestPercent = 45;
    
    const patch = await mycelialSteward.sendTick(payload);
    
    // Should calculate new percent
    // Total: moss:10 (min(10,20)) + cedar:5 (min(5,10)) = 15
    // Percent: 15/30 * 100 = 50%
    // Delta: 50 - 45 = 5
    assert.ok(patch.resources.questPercentDelta >= 5, 'Should show progress toward 50%');
  });

  // Test 4: Malformed Letta response → no-op patch
  it('should return no-op patch for malformed response', () => {
    const malformed = "This is not valid JSON {broken";
    const patch = mycelialSteward.validatePatchShape(malformed);
    
    // Should return safe no-op patch
    assert.strictEqual(patch.cadence.shouldElderSpeak, false);
    assert.deepStrictEqual(patch.trades.resolve, []);
    assert.deepStrictEqual(patch.trades.cancel, []);
    assert.strictEqual(patch.vote.close, false);
    assert.deepStrictEqual(patch.resources.stockpileDeltas, {});
    assert.strictEqual(patch.resources.questPercentDelta, 0);
  });

  // Test 5: Missing keys in response → no-op patch
  it('should return no-op patch for response missing required keys', () => {
    const incomplete = {
      trades: { resolve: [], cancel: [] },
      vote: { close: false }
      // Missing: resources, archive, safety, cadence
    };
    
    const patch = mycelialSteward.validatePatchShape(incomplete);
    
    // Should return safe no-op patch
    assert.strictEqual(patch.cadence.shouldElderSpeak, false);
    assert.ok('resources' in patch);
    assert.ok('archive' in patch);
    assert.ok('safety' in patch);
  });

  // Test 6: Valid response with all keys
  it('should validate and normalize complete response', () => {
    const validResponse = {
      trades: { resolve: ['offer1'], cancel: [] },
      vote: { close: true, decisionCard: { topic: 'test', winner: 'A' } },
      resources: { stockpileDeltas: { moss: 5 }, questPercentDelta: 10 },
      archive: { promoteJournals: ['j1'], pruneStones: [], newStones: [] },
      safety: { warnings: [], calmDown: [] },
      cadence: { shouldElderSpeak: true, triggerReason: 'test' }
    };
    
    const patch = mycelialSteward.validatePatchShape(validResponse);
    
    // Should preserve all values
    assert.deepStrictEqual(patch.trades.resolve, ['offer1']);
    assert.strictEqual(patch.vote.close, true);
    assert.strictEqual(patch.resources.questPercentDelta, 10);
    assert.deepStrictEqual(patch.archive.promoteJournals, ['j1']);
    assert.strictEqual(patch.cadence.shouldElderSpeak, true);
    assert.strictEqual(patch.cadence.triggerReason, 'test');
  });

  // Test 7: getNoOpPatch returns safe defaults
  it('should return safe no-op patch', () => {
    const noOp = mycelialSteward.getNoOpPatch();
    
    assert.deepStrictEqual(noOp.trades.resolve, []);
    assert.deepStrictEqual(noOp.trades.cancel, []);
    assert.strictEqual(noOp.vote.close, false);
    assert.strictEqual(noOp.vote.decisionCard, null);
    assert.deepStrictEqual(noOp.resources.stockpileDeltas, {});
    assert.strictEqual(noOp.resources.questPercentDelta, 0);
    assert.deepStrictEqual(noOp.archive.promoteJournals, []);
    assert.deepStrictEqual(noOp.archive.pruneStones, []);
    assert.deepStrictEqual(noOp.archive.newStones, []);
    assert.deepStrictEqual(noOp.safety.warnings, []);
    assert.deepStrictEqual(noOp.safety.calmDown, []);
    assert.strictEqual(noOp.cadence.shouldElderSpeak, false);
    assert.strictEqual(noOp.cadence.triggerReason, null);
  });
});
