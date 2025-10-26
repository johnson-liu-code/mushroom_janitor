// Letta SDK Client Factory
import { LettaClient } from "@letta-ai/letta-client";

/**
 * Create and configure a Letta client instance
 * @returns {LettaClient} Configured Letta client
 * @throws {Error} If LETTA_API_KEY is missing
 */
export function getLettaClient() {
  const token = process.env.LETTA_API_KEY;
  const baseUrl = process.env.LETTA_BASE_URL || "https://api.letta.com";
  
  if (!token) {
    throw new Error("Missing LETTA_API_KEY environment variable");
  }
  
  return new LettaClient({ token, baseUrl });
}

/**
 * Get agent ID from environment
 * @returns {string} Agent ID
 * @throws {Error} If LETTA_AGENT_ID is missing
 */
export function getLettaAgentId() {
  const agentId = process.env.LETTA_AGENT_ID;
  
  if (!agentId) {
    throw new Error("Missing LETTA_AGENT_ID environment variable");
  }
  
  return agentId;
}
