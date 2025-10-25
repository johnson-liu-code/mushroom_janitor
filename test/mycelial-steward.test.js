// Unit tests for MycelialSteward adapter
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mycelialSteward } from '../server/adapters/mycelial-steward.js';

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
    const input = {
      timestamp: Date.now(),
      state: {
        players: [
          { id: 'p1', name: 'Alice', inventory: {}, messageCount: 12 }
        ],
        stockpile: { moss: 0, cedar: 0, resin: 0, spores: 0, charms: 0 },
        activeQuest: null,
        activeVote: null,
        openOffers: [],
        memoryStones: [],
        recentActions: [],
        journalQueue: []
      },
      context: {
        messagesSincePulse: 6, // Exceeds threshold of 5
        timeSincePulse: 10000,
        activeWarnings: []
      }
    };

    const patch = await mycelialSteward.orchestrate(input);
    
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
      openOffers: Array.from({ length: 20 }, (_, i) => ({ id: `offer${i}` })),
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
