// State change detection for conditional tick processing
// Compares previous vs current state to identify meaningful changes

/**
 * Detect meaningful state changes
 * @param {Object} prevState - Previous state snapshot
 * @param {Object} currState - Current state snapshot
 * @returns {Object} Changes detected
 */
export function detectStateChanges(prevState, currState) {
  const changes = {
    newMessages: 0,
    questMilestones: [],
    voteChanges: {},
    elderSilenceDuration: 0,
    hasSignificantChanges: false,
    details: []
  };

  // 1. Detect new player messages
  const prevMessageCount = prevState?.messageCount || 0;
  const currMessageCount = currState?.messageCount || 0;
  changes.newMessages = currMessageCount - prevMessageCount;
  
  if (changes.newMessages > 0) {
    changes.hasSignificantChanges = true;
    changes.details.push(`${changes.newMessages} new message(s)`);
  }

  // 2. Detect quest milestone crossings (25%, 50%, 75%, 100%)
  const prevQuestPercent = prevState?.activeQuest?.percent || 0;
  const currQuestPercent = currState?.activeQuest?.percent || 0;
  
  if (currQuestPercent !== prevQuestPercent) {
    const milestones = [25, 50, 75, 100];
    
    for (const milestone of milestones) {
      // Check if we crossed this milestone
      if (prevQuestPercent < milestone && currQuestPercent >= milestone) {
        changes.questMilestones.push(milestone);
        changes.hasSignificantChanges = true;
        changes.details.push(`Quest reached ${milestone}%`);
      }
    }
  }

  // 3. Detect vote status changes
  const prevVoteStatus = prevState?.activeVote?.status || null;
  const currVoteStatus = currState?.activeVote?.status || null;
  const prevVoteId = prevState?.activeVote?.id || null;
  const currVoteId = currState?.activeVote?.id || null;
  
  // New vote opened
  if (!prevVoteId && currVoteId) {
    changes.voteChanges.opened = true;
    changes.hasSignificantChanges = true;
    changes.details.push('Vote opened');
  }
  
  // Vote closed
  if (prevVoteStatus === 'OPEN' && currVoteStatus === 'CLOSED') {
    changes.voteChanges.closed = true;
    changes.hasSignificantChanges = true;
    changes.details.push('Vote closed');
  }
  
  // Vote tally changed (same vote, still open, but votes cast)
  if (prevVoteId === currVoteId && prevVoteStatus === 'OPEN' && currVoteStatus === 'OPEN') {
    const prevTally = prevState?.activeVote?.tally || {};
    const currTally = currState?.activeVote?.tally || {};
    
    // Compare total votes
    const prevTotal = Object.values(prevTally).reduce((sum, count) => sum + count, 0);
    const currTotal = Object.values(currTally).reduce((sum, count) => sum + count, 0);
    
    if (currTotal > prevTotal) {
      changes.voteChanges.tallyUpdated = true;
      changes.voteChanges.newVotes = currTotal - prevTotal;
      changes.hasSignificantChanges = true;
      changes.details.push(`${currTotal - prevTotal} new vote(s) cast`);
    }
  }

  // 4. Check Elder silence duration
  const currElderLastSpoke = currState?.elderLastSpoke || Date.now();
  changes.elderSilenceDuration = Math.floor((Date.now() - currElderLastSpoke) / 1000);
  
  // Elder pulse threshold (30 seconds by default)
  const pulseThreshold = parseInt(process.env.CADENCE_TIME_THRESHOLD || '30');
  if (changes.elderSilenceDuration >= pulseThreshold) {
    changes.hasSignificantChanges = true;
    changes.details.push(`Elder silent for ${changes.elderSilenceDuration}s (>${pulseThreshold}s threshold)`);
  }

  return changes;
}

/**
 * Create a lightweight state snapshot for comparison
 * @param {GameState} gameState - Current game state
 * @returns {Object} State snapshot
 */
export function createStateSnapshot(gameState) {
  return {
    timestamp: Date.now(),
    messageCount: gameState.messages.length,
    activeQuest: gameState.nowRing.activeQuest ? {
      id: gameState.nowRing.activeQuest.id,
      percent: gameState.nowRing.activeQuest.percent || 0,
      status: gameState.nowRing.activeQuest.status
    } : null,
    activeVote: gameState.nowRing.activeVote ? {
      id: gameState.nowRing.activeVote.id,
      status: gameState.nowRing.activeVote.status,
      tally: { ...gameState.nowRing.activeVote.tally }
    } : null,
    elderLastSpoke: gameState.elderLastSpoke || Date.now(),
    stockpile: { ...gameState.stockpile }
  };
}

/**
 * Determine if state changes warrant calling the Steward
 * @param {Object} changes - Changes detected by detectStateChanges
 * @returns {boolean} Should process tick
 */
export function shouldProcessTick(changes) {
  return changes.hasSignificantChanges;
}
