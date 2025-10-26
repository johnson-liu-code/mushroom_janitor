/**
 * Build Elder Input Bundle
 * 
 * Constructs a compact, normalized input object for the Elder NPC
 * from game state, cadence information, and recent summaries.
 */

/**
 * Build Elder input from state and context
 * 
 * @param {Object} state - Game state instance
 * @param {Object} cadence - Cadence info from patch (mode, reason, question)
 * @param {Object} summaries - { top_recent_actions, last_messages_summary, safety_notes, elder_instructions }
 * @returns {Object} ElderInput object
 */
export function buildElderInput(state, cadence, summaries) {
  // Canon stones - map to {title, one_sentence}
  const canonStones = (state.canonRing || []).map(stone => ({
    title: stone.title,
    one_sentence: stone.text.split('.')[0] + '.' // First sentence
  }));

  // Quest info
  const activeQuest = state.nowRing?.activeQuest;
  const quest = activeQuest ? {
    name: activeQuest.name,
    percent: activeQuest.percent || 0,
    needs: (activeQuest.needs || []).map(n => n.item) // Names only
  } : {
    name: 'None',
    percent: 0,
    needs: []
  };

  // Vote info with leading option
  const activeVote = state.nowRing?.activeVote;
  let vote = null;
  if (activeVote) {
    // Compute leading option from tally
    let leading = null;
    if (activeVote.tally && typeof activeVote.tally === 'object') {
      const tallyCounts = {};
      Object.values(activeVote.tally).forEach(option => {
        tallyCounts[option] = (tallyCounts[option] || 0) + 1;
      });
      
      const maxCount = Math.max(...Object.values(tallyCounts));
      const leaders = Object.keys(tallyCounts).filter(opt => tallyCounts[opt] === maxCount);
      
      // Only set leading if there's a clear winner (no tie)
      if (leaders.length === 1) {
        leading = leaders[0];
      }
    }
    
    vote = {
      topic: activeVote.topic,
      options: activeVote.options || [],
      leading
    };
  }

  // Stockpile
  const stockpile = {
    moss: state.stockpile?.moss || 0,
    cedar: state.stockpile?.cedar || 0,
    resin: state.stockpile?.resin || 0,
    spores: state.stockpile?.spores || 0
  };

  // Top recent actions (≤5, trimmed, no duplicates)
  let topRecentActions = summaries.top_recent_actions || state.nowRing?.topRecentActions || [];
  if (Array.isArray(topRecentActions)) {
    topRecentActions = topRecentActions
      .slice(0, 5)
      .map(a => {
        if (typeof a === 'string') return a.trim();
        if (typeof a === 'object' && a.text) return a.text.trim();
        return String(a).trim();
      })
      .filter((v, i, arr) => v && arr.indexOf(v) === i); // Remove duplicates
  } else {
    topRecentActions = [];
  }

  // Last messages summary (≤8, trimmed, no duplicates)
  let lastMessagesSummary = summaries.last_messages_summary || state.lastMessagesSummary || [];
  if (Array.isArray(lastMessagesSummary)) {
    lastMessagesSummary = lastMessagesSummary
      .slice(0, 8)
      .map(m => {
        if (typeof m === 'string') return m.trim();
        if (typeof m === 'object' && m.text) return m.text.trim();
        return String(m).trim();
      })
      .filter((v, i, arr) => v && arr.indexOf(v) === i); // Remove duplicates
  } else {
    lastMessagesSummary = [];
  }

  // Mode
  const mode = cadence.mode || 'PULSE';

  // Question (only if CALL_RESPONSE mode)
  const question = mode === 'CALL_RESPONSE' ? (cadence.question || null) : null;

  // Safety notes
  const safetyNotes = summaries.safety_notes || null;

  // Elder instructions from Letta (conversation context)
  const elderInstructions = summaries.elder_instructions || {};
  const tone = elderInstructions.tone || 'neutral';
  const contextSummary = elderInstructions.context_summary || '';
  const referencedMessages = elderInstructions.referenced_messages || [];
  const conversationThread = elderInstructions.conversation_thread || '';

  return {
    mode,
    canon_stones: canonStones,
    now: {
      quest,
      vote,
      stockpile
    },
    top_recent_actions: topRecentActions,
    last_messages_summary: lastMessagesSummary,
    safety_notes: safetyNotes,
    question,
    // NEW: Rich conversation context from Letta
    conversation_context: {
      tone,
      summary: contextSummary,
      thread: conversationThread,
      acknowledge_users: referencedMessages
    }
  };
}
