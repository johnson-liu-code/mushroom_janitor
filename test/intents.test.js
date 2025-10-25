// Basic unit tests for intent parsing
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseIntent, validateIntent, mentionsElder } from '../server/intents.js';
import { IntentType } from '../server/types.js';

describe('Intent Parser', () => {
  
  it('should parse gather command', () => {
    const intent = parseIntent('/gather moss');
    assert.strictEqual(intent.type, IntentType.GATHER);
    assert.strictEqual(intent.params.item, 'moss');
    assert.strictEqual(intent.confidence, 1.0);
  });

  it('should parse natural language gather', () => {
    const intent = parseIntent('I want to gather some cedar');
    assert.strictEqual(intent.type, IntentType.GATHER);
    assert.strictEqual(intent.params.item, 'cedar');
    assert.strictEqual(intent.confidence, 0.8);
  });

  it('should parse gift command', () => {
    const intent = parseIntent('/gift @alice moss x5');
    assert.strictEqual(intent.type, IntentType.GIFT);
    assert.strictEqual(intent.params.targetPlayer, 'alice');
    assert.strictEqual(intent.params.item, 'moss');
    assert.strictEqual(intent.params.quantity, 5);
  });

  it('should parse donate command', () => {
    const intent = parseIntent('/donate cedar x10');
    assert.strictEqual(intent.type, IntentType.DONATE);
    assert.strictEqual(intent.params.item, 'cedar');
    assert.strictEqual(intent.params.quantity, 10);
  });

  it('should parse vote command', () => {
    const intent = parseIntent('/vote option1');
    assert.strictEqual(intent.type, IntentType.VOTE);
    assert.strictEqual(intent.params.option, 'option1');
  });

  it('should parse journal command', () => {
    const intent = parseIntent('/journal A wonderful day');
    assert.strictEqual(intent.type, IntentType.JOURNAL);
    assert.strictEqual(intent.params.text, 'A wonderful day');
  });

  it('should parse trade offer command', () => {
    const intent = parseIntent('/offer give moss x3 for cedar x1');
    assert.strictEqual(intent.type, IntentType.OFFER);
    assert.strictEqual(intent.params.give.item, 'moss');
    assert.strictEqual(intent.params.give.qty, 3);
    assert.strictEqual(intent.params.want.item, 'cedar');
    assert.strictEqual(intent.params.want.qty, 1);
  });

  it('should default to chat for unknown input', () => {
    const intent = parseIntent('Hello everyone!');
    assert.strictEqual(intent.type, IntentType.CHAT);
    assert.strictEqual(intent.params.text, 'Hello everyone!');
  });

  it('should validate correct gather intent', () => {
    const intent = { type: IntentType.GATHER, params: { item: 'moss' } };
    assert.strictEqual(validateIntent(intent), true);
  });

  it('should invalidate gather with invalid item', () => {
    const intent = { type: IntentType.GATHER, params: { item: 'gold' } };
    assert.strictEqual(validateIntent(intent), false);
  });

  it('should detect Elder mentions', () => {
    assert.strictEqual(mentionsElder('@elder help'), true);
    assert.strictEqual(mentionsElder('Hey Elder Mycel'), true);
    assert.strictEqual(mentionsElder('elder, what should I do?'), true);
    assert.strictEqual(mentionsElder('Hello everyone'), false);
  });
});

describe('Intent Validation', () => {
  
  it('should validate gift with positive quantity', () => {
    const intent = {
      type: IntentType.GIFT,
      params: { targetPlayer: 'bob', item: 'moss', quantity: 5 }
    };
    assert.strictEqual(validateIntent(intent), true);
  });

  it('should reject gift with zero quantity', () => {
    const intent = {
      type: IntentType.GIFT,
      params: { targetPlayer: 'bob', item: 'moss', quantity: 0 }
    };
    assert.strictEqual(validateIntent(intent), false);
  });

  it('should accept any chat message', () => {
    const intent = { type: IntentType.CHAT, params: { text: 'anything' } };
    assert.strictEqual(validateIntent(intent), true);
  });
});
