/**
 * NPC Registry
 * 
 * Central configuration for all NPCs in the system.
 * Each NPC has a provider and prompt path.
 */

import dotenv from 'dotenv';
dotenv.config();

export const NPCS = {
  elder_mycel: {
    provider: process.env.ELDER_PROVIDER || 'mock',
    promptPath: process.env.ELDER_SYSTEM_PROMPT_PATH || './prompts/elder_voice_charter.txt'
  }
  // Future NPCs can be added here with their own providers and prompts
};

/**
 * Get NPC configuration
 * @param {string} npcId - The NPC identifier
 * @returns {Object|null} NPC config or null if not found
 */
export function getNPCConfig(npcId) {
  return NPCS[npcId] || null;
}
