/**
 * CLI smoke test for Elder adapter
 * 
 * Tests the Elder NPC with a minimal input and validates the response format.
 */

import 'dotenv/config';
import { speakNPC } from '../server/adapters/elder_adapter.js';

async function main() {
  console.log('🧪 Elder Smoke Test');
  console.log('==================\n');

  // Build minimal ElderInput
  const input = {
    mode: "CALL_RESPONSE",
    canon_stones: [
      { title: "Festival of Spores", one_sentence: "Small gifts multiply under patient hands." },
      { title: "Bridge of Listening", one_sentence: "Decisions bind best when all are heard." }
    ],
    now: {
      quest: { name: "Bridge Across the Brook", percent: 50, needs: ["cedar", "resin"] },
      vote: { topic: "Bridge material", options: ["Moss Rope", "Cedar Plank"], leading: null },
      stockpile: { moss: 3, cedar: 2, resin: 1, spores: 0 }
    },
    top_recent_actions: ["@Lina asked about rope safety", "@Rowan attempted a trade"],
    last_messages_summary: ["Direct question about moss rope in rain", "Vote 1–1 tie"],
    safety_notes: null,
    question: "Is moss rope safe in rain?"
  };

  console.log('Input:');
  console.log(`  Mode: ${input.mode}`);
  console.log(`  Question: ${input.question}`);
  console.log(`  Quest: ${input.now.quest.name} (${input.now.quest.percent}%)`);
  console.log(`  Vote: ${input.now.vote.topic}\n`);

  try {
    // Call Elder
    const out = await speakNPC("elder_mycel", input);

    // Validate
    if (!out.message_text) {
      console.error('❌ ERROR: out.message_text is missing');
      process.exit(1);
    }

    if (!out.nudge || !out.nudge.startsWith('Next:')) {
      console.error('❌ ERROR: out.nudge does not start with "Next:"');
      console.error(`   Got: ${out.nudge}`);
      process.exit(1);
    }

    // Print compact output
    const firstLines = out.message_text.split('\n').slice(0, 3).join(' ');
    console.log('[Elder]', firstLines, '//', out.nudge);

    console.log('\n✅ Smoke test passed');
    console.log(`   Referenced stones: ${out.referenced_stones.length}`);
    console.log(`   Acknowledged users: ${out.acknowledged_users.length}`);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
