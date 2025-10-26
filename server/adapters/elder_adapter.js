/**
 * Provider-Agnostic Elder Adapter
 * 
 * Handles communication with various LLM providers to generate
 * Elder NPC responses. Normalizes all provider outputs to a
 * consistent ElderOutput shape.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';
import { getNPCConfig } from './npc_registry.js';

dotenv.config();

// Custom error for unimplemented features
class NotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

// Adapter state
const adapterState = {
  provider: process.env.ELDER_PROVIDER || 'mock',
  healthy: true,
  lastError: null,
  requestCount: 0
};

/**
 * Load system prompt from file
 * @param {string} promptPath - Path to prompt file
 * @returns {string} Prompt content
 */
function loadSystemPrompt(promptPath) {
  try {
    const fullPath = resolve(promptPath);
    return readFileSync(fullPath, 'utf-8');
  } catch (error) {
    console.warn(`Failed to load system prompt from ${promptPath}, using fallback`);
    return 'You are Elder Mycel, a wise guide for the village. Speak gently and end with "Next:" followed by a suggestion.';
  }
}

/**
 * Synthesize ElderOutput structure from plain text response
 * @param {string} text - Raw response text
 * @param {Object} input - Original ElderInput for context
 * @returns {Object} ElderOutput
 */
function synthesizeOutput(text, input) {
  const output = {
    referenced_stones: [],
    acknowledged_users: [],
    nudge: 'Next: Contribute one needed item.',
    message_text: text
  };

  // Extract referenced stones by fuzzy matching titles
  if (input.canon_stones) {
    for (const stone of input.canon_stones) {
      if (text.toLowerCase().includes(stone.title.toLowerCase())) {
        output.referenced_stones.push(stone.title);
      }
    }
  }

  // Extract acknowledged users by matching @names in message summaries
  if (input.last_messages_summary) {
    const userPattern = /@(\w+)/g;
    for (const summary of input.last_messages_summary) {
      const matches = summary.matchAll(userPattern);
      for (const match of matches) {
        const username = match[1];
        if (text.includes(username) && !output.acknowledged_users.includes(username)) {
          output.acknowledged_users.push(username);
        }
      }
    }
  }

  // Extract "Next:" line if present, otherwise use default
  const nextMatch = text.match(/Next:\s*(.+)/i);
  if (nextMatch) {
    output.nudge = `Next: ${nextMatch[1].trim()}`;
  }

  // Ensure message_text ends with nudge line
  if (!text.trim().match(/Next:/i)) {
    output.message_text = text.trim() + '\n\n' + output.nudge;
  }

  return output;
}

/**
 * Mock provider - deterministic responses
 */
async function mockProvider(input, systemPrompt) {
  const questName = input.now?.quest?.name || 'None';
  const questPercent = input.now?.quest?.percent || 0;
  
  let message = 'The village moves by gentle steps.';
  
  if (input.mode === 'CALL_RESPONSE' && input.question) {
    message = `I hear your question: "${input.question}". The answer lies in the patterns we weave together.`;
  } else if (questPercent > 0) {
    message = `The quest "${questName}" progresses at ${questPercent}%. Each contribution strengthens our foundation.`;
  }

  return {
    referenced_stones: [],
    acknowledged_users: [],
    nudge: 'Next: Contribute one needed item.',
    message_text: message + '\n\nNext: Contribute one needed item.'
  };
}

/**
 * Claude provider via Anthropic API
 */
async function claudeProvider(input, systemPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Build user message from input
  const userMessage = buildUserMessage(input);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.content[0].text;

    return synthesizeOutput(text, input);
  } catch (error) {
    console.error('Claude provider error:', error);
    throw error;
  }
}

/**
 * Gemini provider via Google AI API
 */
async function geminiProvider(input, systemPrompt) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const userMessage = buildUserMessage(input);
  const model = process.env.GEMINI_MODEL || 'gemini-pro';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt + '\n\n' + userMessage }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.7
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    return synthesizeOutput(text, input);
  } catch (error) {
    console.error('Gemini provider error:', error);
    throw error;
  }
}

/**
 * OpenAI provider via OpenAI API
 */
async function openaiProvider(input, systemPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const userMessage = buildUserMessage(input);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;

    return synthesizeOutput(text, input);
  } catch (error) {
    console.error('OpenAI provider error:', error);
    throw error;
  }
}

/**
 * Janitor provider (future relay support)
 */
async function janitorProvider(input, systemPrompt) {
  const relayUrl = process.env.JANITOR_RELAY_URL;
  if (!relayUrl) {
    throw new NotImplementedError('JANITOR_RELAY_URL not configured');
  }

  // Future implementation would call the relay
  throw new NotImplementedError('Janitor relay not yet implemented');
}

/**
 * Build user message from ElderInput
 */
function buildUserMessage(input) {
  const parts = [];

  parts.push(`MODE: ${input.mode}`);

  if (input.question) {
    parts.push(`QUESTION: ${input.question}`);
  }

  if (input.canon_stones && input.canon_stones.length > 0) {
    parts.push('\nMEMORY STONES:');
    input.canon_stones.forEach(stone => {
      parts.push(`- ${stone.title}: ${stone.one_sentence}`);
    });
  }

  if (input.now) {
    parts.push('\nCURRENT STATE:');
    if (input.now.quest) {
      parts.push(`Quest: ${input.now.quest.name} (${input.now.quest.percent}%)`);
      if (input.now.quest.needs.length > 0) {
        parts.push(`Needs: ${input.now.quest.needs.join(', ')}`);
      }
    }
    if (input.now.vote) {
      parts.push(`Vote: ${input.now.vote.topic}`);
      parts.push(`Options: ${input.now.vote.options.join(', ')}`);
      if (input.now.vote.leading) {
        parts.push(`Leading: ${input.now.vote.leading}`);
      }
    }
    if (input.now.stockpile) {
      const items = Object.entries(input.now.stockpile)
        .filter(([_, count]) => count > 0)
        .map(([item, count]) => `${item}:${count}`)
        .join(', ');
      if (items) {
        parts.push(`Stockpile: ${items}`);
      }
    }
  }

  if (input.top_recent_actions && input.top_recent_actions.length > 0) {
    parts.push('\nRECENT ACTIONS:');
    input.top_recent_actions.forEach(action => {
      parts.push(`- ${action}`);
    });
  }

  if (input.last_messages_summary && input.last_messages_summary.length > 0) {
    parts.push('\nRECENT MESSAGES:');
    input.last_messages_summary.forEach(msg => {
      parts.push(`- ${msg}`);
    });
  }

  if (input.safety_notes) {
    parts.push(`\nSAFETY NOTES: ${input.safety_notes}`);
  }

  return parts.join('\n');
}

/**
 * Main entry point: speak as an NPC
 * 
 * @param {string} npcId - NPC identifier (e.g., 'elder_mycel')
 * @param {Object} input - ElderInput object
 * @returns {Promise<Object>} ElderOutput object
 */
export async function speakNPC(npcId, input) {
  const npcConfig = getNPCConfig(npcId);
  if (!npcConfig) {
    throw new Error(`NPC "${npcId}" not found in registry`);
  }

  const provider = npcConfig.provider;
  const systemPrompt = loadSystemPrompt(npcConfig.promptPath);

  adapterState.requestCount++;

  try {
    let output;

    switch (provider) {
      case 'mock':
        output = await mockProvider(input, systemPrompt);
        break;
      case 'claude':
        output = await claudeProvider(input, systemPrompt);
        break;
      case 'gemini':
        output = await geminiProvider(input, systemPrompt);
        break;
      case 'openai':
        output = await openaiProvider(input, systemPrompt);
        break;
      case 'janitor':
        output = await janitorProvider(input, systemPrompt);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    // Validate output
    if (!output.message_text) {
      throw new Error('Provider returned empty message_text');
    }
    if (!output.nudge || !output.nudge.startsWith('Next:')) {
      throw new Error('Provider returned invalid nudge');
    }

    adapterState.healthy = true;
    adapterState.lastError = null;

    return output;
  } catch (error) {
    adapterState.healthy = false;
    adapterState.lastError = error.message;

    // If it's a NotImplementedError, fall back to mock
    if (error instanceof NotImplementedError) {
      console.warn(`${provider} not implemented, falling back to mock`);
      return mockProvider(input, systemPrompt);
    }

    throw error;
  }
}

/**
 * Get adapter status
 * @returns {Object} Status object
 */
export function getStatus() {
  return {
    provider: adapterState.provider,
    healthy: adapterState.healthy,
    lastError: adapterState.lastError,
    requestCount: adapterState.requestCount
  };
}
