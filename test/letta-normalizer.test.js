// Unit tests for Letta Normalizer
import { describe, it } from 'node:test';
import assert from 'node:assert';
import normalizeLettaPatch from '../server/adapters/letta_normalizer.js';

describe('Letta Normalizer - Complete Payload', () => {
  
  it('should normalize complete Letta response with all fields', () => {
    const raw = {
      cadence: {
        mode: 'CALL_RESPONSE',
        reason: 'user_question',
        cooldown_s: 30
      },
      vote: {
        status: 'ACTIVE',
        tally: { 'p1': 'North', 'p2': 'South' },
        winner: 'North',
        close_reason: 'quorum'
      },
      resources: {
        quest_percent: 45,
        needs: { moss: 5, cedar: 3 },
        threshold_crossed: 50
      },
      trades: {
        resolutions: [
          { status: 'COMPLETED', id: 'trade1', from: 'p1', to: 'p2' },
          { status: 'FAILED', id: 'trade2', reason: 'insufficient' }
        ]
      },
      archive: {
        promote: ['j1', 'j2'],
        prune: ['s1'],
        new_stones: [{ title: 'New Stone', text: 'A moment', tags: ['event'] }],
        merge_pairs: []
      },
      safety: {
        alerts: ['spam_warning'],
        rate_limits: [{ player: 'p1', cooldown_s: 60 }],
        notes: 'Player p1 needs attention'
      }
    };

    const tickContext = {
      distilledQuestion: 'What should I do next?',
      journalsById: {
        'j1': { id: 'j1', text: 'A wonderful day in the village' },
        'j2': { id: 'j2', text: 'The cedars whisper secrets' }
      }
    };

    const normalized = normalizeLettaPatch(raw, tickContext);

    // Cadence
    assert.strictEqual(normalized.cadence.should_elder_speak, true);
    assert.strictEqual(normalized.cadence.mode, 'CALL_RESPONSE');
    assert.strictEqual(normalized.cadence.reason, 'user_question');
    assert.strictEqual(normalized.cadence.cooldown_s, 30);
    assert.strictEqual(normalized.cadence.question, 'What should I do next?');

    // Vote
    assert.strictEqual(normalized.vote.status, 'OPEN');
    assert.deepStrictEqual(normalized.vote.tally, { 'p1': 'North', 'p2': 'South' });
    assert.strictEqual(normalized.vote.winner, 'North');
    assert.strictEqual(normalized.vote.close_reason, 'QUORUM');

    // Resources
    assert.strictEqual(normalized.resources.quest_percent, 45);
    assert.strictEqual(normalized.resources.needs.length, 2);
    assert.ok(normalized.resources.needs.some(n => n.item === 'moss' && n.qty === 5));
    assert.ok(normalized.resources.needs.some(n => n.item === 'cedar' && n.qty === 3));
    assert.strictEqual(normalized.resources.threshold_crossed, true);
    assert.strictEqual(normalized.resources.crossed_at, 50);

    // Trades
    assert.strictEqual(normalized.trades.actions.length, 1);
    assert.strictEqual(normalized.trades.actions[0].type, 'RESOLVE');
    assert.strictEqual(normalized.trades.actions[0].id, 'trade1');
    assert.strictEqual(normalized.trades.actions[0].from, 'p1');
    assert.strictEqual(normalized.trades.actions[0].to, 'p2');

    // Archive
    assert.deepStrictEqual(normalized.archive.promote_ids, ['j1', 'j2']);
    assert.deepStrictEqual(normalized.archive.prune_ids, ['s1']);
    assert.strictEqual(normalized.archive.new_stones.length, 1);
    assert.strictEqual(normalized.archive.new_stones[0].title, 'New Stone');
    assert.deepStrictEqual(normalized.archive.merge_pairs, []);

    // Safety
    assert.deepStrictEqual(normalized.safety.flags, ['spam_warning']);
    assert.strictEqual(normalized.safety.rate_limits.length, 1);
    assert.strictEqual(normalized.safety.rate_limits[0].player, 'p1');
    assert.strictEqual(normalized.safety.rate_limits[0].cooldown_s, 60);
    assert.strictEqual(normalized.safety.notes_for_elder, 'Player p1 needs attention');
  });
});

describe('Letta Normalizer - Cadence', () => {
  
  it('should set should_elder_speak to true when mode is present', () => {
    const raw = {
      cadence: { mode: 'PULSE' }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.cadence.should_elder_speak, true);
    assert.strictEqual(normalized.cadence.mode, 'PULSE');
  });

  it('should use distilledQuestion from tickContext', () => {
    const raw = {
      cadence: { mode: 'CALL_RESPONSE' }
    };
    const normalized = normalizeLettaPatch(raw, { distilledQuestion: 'Help me?' });
    assert.strictEqual(normalized.cadence.question, 'Help me?');
  });

  it('should fallback to null question when not provided', () => {
    const raw = {
      cadence: { mode: 'PULSE' }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.cadence.question, null);
  });
});

describe('Letta Normalizer - Vote', () => {
  
  it('should map ACTIVE status to OPEN', () => {
    const raw = {
      vote: { status: 'ACTIVE' }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.vote.status, 'OPEN');
  });

  it('should normalize close_reason to enum values', () => {
    const raw1 = { vote: { close_reason: 'timer' } };
    const normalized1 = normalizeLettaPatch(raw1);
    assert.strictEqual(normalized1.vote.close_reason, 'TIMER');

    const raw2 = { vote: { close_reason: 'quorum' } };
    const normalized2 = normalizeLettaPatch(raw2);
    assert.strictEqual(normalized2.vote.close_reason, 'QUORUM');
  });

  it('should accept tally or tallies field', () => {
    const raw = {
      vote: { tallies: { 'p1': 'A', 'p2': 'B' } }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.deepStrictEqual(normalized.vote.tally, { 'p1': 'A', 'p2': 'B' });
  });
});

describe('Letta Normalizer - Resources', () => {
  
  it('should convert needs object to array', () => {
    const raw = {
      resources: {
        needs: { moss: 10, cedar: 5 }
      }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.ok(Array.isArray(normalized.resources.needs));
    assert.strictEqual(normalized.resources.needs.length, 2);
    assert.ok(normalized.resources.needs.some(n => n.item === 'moss' && n.qty === 10));
  });

  it('should keep needs array as is', () => {
    const raw = {
      resources: {
        needs: [{ item: 'moss', qty: 10 }]
      }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.deepStrictEqual(normalized.resources.needs, [{ item: 'moss', qty: 10 }]);
  });

  it('should convert threshold number to boolean + crossed_at', () => {
    const raw = {
      resources: { threshold_crossed: 75 }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.resources.threshold_crossed, true);
    assert.strictEqual(normalized.resources.crossed_at, 75);
  });

  it('should handle threshold boolean true with crossed_at', () => {
    const raw = {
      resources: { threshold_crossed: true, crossed_at: 1234567890 }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.resources.threshold_crossed, true);
    assert.strictEqual(normalized.resources.crossed_at, 1234567890);
  });

  it('should handle threshold boolean false', () => {
    const raw = {
      resources: { threshold_crossed: false }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.resources.threshold_crossed, false);
    assert.strictEqual(normalized.resources.crossed_at, null);
  });
});

describe('Letta Normalizer - Trades', () => {
  
  it('should create actions only for COMPLETED resolutions', () => {
    const raw = {
      trades: {
        resolutions: [
          { status: 'COMPLETED', id: 'trade1', from: 'p1', to: 'p2' },
          { status: 'COMPLETED', id: 'trade2', from: 'p2', to: 'p3' },
          { status: 'FAILED', id: 'trade3', reason: 'insufficient' }
        ]
      }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.trades.actions.length, 2);
    assert.strictEqual(normalized.trades.actions[0].type, 'RESOLVE');
    assert.strictEqual(normalized.trades.actions[1].type, 'RESOLVE');
  });

  it('should return empty actions for only FAILED resolutions', () => {
    const raw = {
      trades: {
        resolutions: [
          { status: 'FAILED', id: 'trade1', reason: 'player_offline' }
        ]
      }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.deepStrictEqual(normalized.trades.actions, []);
  });
});

describe('Letta Normalizer - Archive', () => {
  
  it('should map promote to promote_ids', () => {
    const raw = {
      archive: { promote: ['j1', 'j2', 'j3'] }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.deepStrictEqual(normalized.archive.promote_ids, ['j1', 'j2', 'j3']);
  });

  it('should map prune to prune_ids', () => {
    const raw = {
      archive: { prune: ['s1', 's2'] }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.deepStrictEqual(normalized.archive.prune_ids, ['s1', 's2']);
  });

  it('should fill stone text from journalsById', () => {
    const raw = {
      archive: {
        new_stones: [
          { journal_id: 'j1', title: 'A Memory', tags: ['event'] }
        ]
      }
    };
    const tickContext = {
      journalsById: {
        'j1': { id: 'j1', text: 'This is the journal text' }
      }
    };
    const normalized = normalizeLettaPatch(raw, tickContext);
    assert.strictEqual(normalized.archive.new_stones[0].text, 'This is the journal text');
  });

  it('should use ellipsis when journal not found', () => {
    const raw = {
      archive: {
        new_stones: [
          { journal_id: 'j999', title: 'Missing', tags: [] }
        ]
      }
    };
    const normalized = normalizeLettaPatch(raw, { journalsById: {} });
    assert.strictEqual(normalized.archive.new_stones[0].text, '…');
  });

  it('should always have merge_pairs array', () => {
    const raw = { archive: {} };
    const normalized = normalizeLettaPatch(raw);
    assert.ok(Array.isArray(normalized.archive.merge_pairs));
  });
});

describe('Letta Normalizer - Safety', () => {
  
  it('should map alerts to flags', () => {
    const raw = {
      safety: { alerts: ['spam', 'toxicity'] }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.deepStrictEqual(normalized.safety.flags, ['spam', 'toxicity']);
  });

  it('should convert empty notes to null', () => {
    const raw = {
      safety: { notes: '' }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.safety.notes_for_elder, null);
  });

  it('should preserve non-empty notes', () => {
    const raw = {
      safety: { notes: 'Important safety note' }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.safety.notes_for_elder, 'Important safety note');
  });

  it('should parse rate_limits correctly', () => {
    const raw = {
      safety: {
        rate_limits: [
          { player: 'p1', cooldown_s: 30 },
          { player: 'p2', cooldown_s: 60 }
        ]
      }
    };
    const normalized = normalizeLettaPatch(raw);
    assert.strictEqual(normalized.safety.rate_limits.length, 2);
    assert.strictEqual(normalized.safety.rate_limits[0].player, 'p1');
    assert.strictEqual(normalized.safety.rate_limits[0].cooldown_s, 30);
  });

  it('should ensure rate_limits array when missing', () => {
    const raw = { safety: {} };
    const normalized = normalizeLettaPatch(raw);
    assert.deepStrictEqual(normalized.safety.rate_limits, []);
  });
});

describe('Letta Normalizer - Edge Cases', () => {
  
  it('should handle malformed JSON string', () => {
    const raw = 'This is not valid JSON {broken';
    const normalized = normalizeLettaPatch(raw);
    
    // Should return safe defaults
    assert.strictEqual(normalized.cadence.should_elder_speak, false);
    assert.deepStrictEqual(normalized.trades.actions, []);
    assert.strictEqual(normalized.vote.status, null);
  });

  it('should extract JSON from text+JSON mix', () => {
    const raw = 'Here is the analysis: {"cadence":{"mode":"PULSE"},"vote":{},"resources":{},"trades":{},"archive":{},"safety":{}} Done!';
    const normalized = normalizeLettaPatch(raw);
    
    assert.strictEqual(normalized.cadence.should_elder_speak, true);
    assert.strictEqual(normalized.cadence.mode, 'PULSE');
  });

  it('should return safe skeleton for completely empty object', () => {
    const raw = {};
    const normalized = normalizeLettaPatch(raw);
    
    assert.ok('cadence' in normalized);
    assert.ok('vote' in normalized);
    assert.ok('resources' in normalized);
    assert.ok('trades' in normalized);
    assert.ok('archive' in normalized);
    assert.ok('safety' in normalized);
  });

  it('should coerce wrong types to safe defaults', () => {
    const raw = {
      cadence: { cooldown_s: 'not_a_number' },
      resources: { quest_percent: 'invalid' },
      safety: { flags: 'not_an_array' }
    };
    const normalized = normalizeLettaPatch(raw);
    
    assert.strictEqual(normalized.cadence.cooldown_s, 0);
    assert.strictEqual(normalized.resources.quest_percent, 0);
    assert.deepStrictEqual(normalized.safety.flags, []);
  });
});
