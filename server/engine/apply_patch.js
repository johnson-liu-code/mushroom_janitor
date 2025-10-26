/**
 * Apply Patch Engine
 * 
 * Applies normalized Letta patches to game state in a specific order with exact behaviors.
 * Order: TRADES → VOTE → RESOURCES → ARCHIVE → SAFETY
 */

import { TradeStatus, VoteStatus, createMemoryStone } from '../types.js';

/**
 * Apply a normalized patch to game state
 * 
 * @param {Object} state - Game state instance
 * @param {Object} patch - Normalized patch from normalizeLettaPatch
 * @param {Object} options - Options
 * @param {Object} options.log - Logger instance (with warn method)
 * @returns {Object} Summary of applied changes
 */
export function applyPatch(state, patch, { log }) {
  const summary = {
    tick: Date.now(),
    tradesResolved: 0,
    tradesFailed: 0,
    voteStatus: null,
    questPercent: null,
    stonesCount: null
  };

  // 1. TRADES - process RESOLVE actions
  if (patch.trades?.actions) {
    for (const action of patch.trades.actions) {
      if (action.type !== 'RESOLVE') continue;

      const { id, from, to } = action;
      const offer = state.getOffer(id);

      // Validation checks
      if (!offer) {
        log.warn(`trade ${id} skipped: offer not found`);
        summary.tradesFailed++;
        continue;
      }

      if (offer.status !== TradeStatus.OPEN) {
        log.warn(`trade ${id} skipped: offer not OPEN (status: ${offer.status})`);
        summary.tradesFailed++;
        continue;
      }

      if (offer.fromPlayer !== from) {
        log.warn(`trade ${id} skipped: from player mismatch (expected: ${offer.fromPlayer}, got: ${from})`);
        summary.tradesFailed++;
        continue;
      }

      if (from === to) {
        log.warn(`trade ${id} skipped: cannot trade with self`);
        summary.tradesFailed++;
        continue;
      }

      const fromPlayer = state.getPlayer(from);
      const toPlayer = state.getPlayer(to);

      if (!fromPlayer) {
        log.warn(`trade ${id} skipped: from player ${from} not found`);
        summary.tradesFailed++;
        continue;
      }

      if (!toPlayer) {
        log.warn(`trade ${id} skipped: to player ${to} not found`);
        summary.tradesFailed++;
        continue;
      }

      // Check inventory capacity
      if (fromPlayer.inventory[offer.give.item] < offer.give.qty) {
        log.warn(`trade ${id} skipped: from player lacks ${offer.give.item} (has: ${fromPlayer.inventory[offer.give.item]}, needs: ${offer.give.qty})`);
        summary.tradesFailed++;
        continue;
      }

      if (toPlayer.inventory[offer.want.item] < offer.want.qty) {
        log.warn(`trade ${id} skipped: to player lacks ${offer.want.item} (has: ${toPlayer.inventory[offer.want.item]}, needs: ${offer.want.qty})`);
        summary.tradesFailed++;
        continue;
      }

      // Execute trade atomically (NOT stockpile)
      fromPlayer.inventory[offer.give.item] -= offer.give.qty;
      fromPlayer.inventory[offer.want.item] += offer.want.qty;
      toPlayer.inventory[offer.want.item] -= offer.want.qty;
      toPlayer.inventory[offer.give.item] += offer.give.qty;

      // Mark offer as CLOSED
      offer.status = TradeStatus.COMPLETED;
      offer.acceptedBy = to;
      offer.completedAt = Date.now();

      // Push system note
      const fromName = fromPlayer.name || from;
      const toName = toPlayer.name || to;
      state.addRecentAction({
        type: 'system_note',
        text: `Trade ${id} resolved: ${fromName}→${toName}`
      });

      summary.tradesResolved++;
    }
  }

  // 2. VOTE - overwrite tally, handle closure
  if (patch.vote?.tally) {
    const activeVote = state.nowRing.activeVote;
    
    if (activeVote) {
      // Overwrite tally with patch data
      activeVote.tally = { ...patch.vote.tally };

      // Handle closure
      if (patch.vote.status === 'CLOSED') {
        activeVote.status = VoteStatus.CLOSED;
        activeVote.winner = patch.vote.winner;
        activeVote.close_reason = patch.vote.close_reason;
        activeVote.closedAt = Date.now();
        
        // Clear "can vote" affordances
        activeVote.canVote = false;
        
        summary.voteStatus = 'CLOSED';
      } else if (patch.vote.status === 'OPEN') {
        activeVote.status = VoteStatus.OPEN;
        activeVote.canVote = true;
        summary.voteStatus = 'OPEN';
      }
    }
  }

  // 3. RESOURCES - update quest progress
  if (patch.resources) {
    const activeQuest = state.nowRing.activeQuest;
    
    if (activeQuest && typeof patch.resources.quest_percent === 'number') {
      activeQuest.percent = patch.resources.quest_percent;
      summary.questPercent = patch.resources.quest_percent;
    }

    // Set quest needs
    if (patch.resources.needs && Array.isArray(patch.resources.needs)) {
      if (activeQuest) {
        activeQuest.needs = patch.resources.needs;
      } else {
        // Store in state if no active quest
        state.quest = state.quest || {};
        state.quest.needs = patch.resources.needs;
      }
    }

    // Handle threshold crossing
    if (patch.resources.threshold_crossed === true && patch.resources.crossed_at) {
      if (activeQuest) {
        activeQuest.lastThresholdAt = patch.resources.crossed_at;
      } else {
        state.quest = state.quest || {};
        state.quest.lastThresholdAt = patch.resources.crossed_at;
      }
    }
  }

  // 4. ARCHIVE - promote, prune, merge stones
  if (patch.archive) {
    const stonesBefore = state.canonRing.length;

    // Promote journals to stones
    const promoteIds = patch.archive.promote_ids || [];
    const newStones = patch.archive.new_stones || [];
    for (let i = 0; i < promoteIds.length; i++) {
      const journalId = promoteIds[i];
      const newStone = newStones[i];
      
      if (newStone) {
        const stoneId = `stone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const stone = createMemoryStone(
          stoneId,
          newStone.title,
          newStone.text,
          newStone.tags || []
        );
        state.canonRing.push(stone);
      }
    }

    // Apply prune deletions
    const pruneIds = patch.archive.prune_ids || [];
    for (const pruneId of pruneIds) {
      const index = state.canonRing.findIndex(s => s.id === pruneId);
      if (index !== -1) {
        state.canonRing.splice(index, 1);
      }
    }

    // Apply merge pairs
    const mergePairs = patch.archive.merge_pairs || [];
    for (const mergePair of mergePairs) {
      if (mergePair.length >= 4) {
        const [id1, id2, title, text] = mergePair;
        
        // Remove both stones
        const idx1 = state.canonRing.findIndex(s => s.id === id1);
        const idx2 = state.canonRing.findIndex(s => s.id === id2);
        
        if (idx1 !== -1) state.canonRing.splice(idx1, 1);
        if (idx2 !== -1) {
          // Adjust index if id1 was before id2
          const adjustedIdx2 = idx1 !== -1 && idx1 < idx2 ? idx2 - 1 : idx2;
          state.canonRing.splice(adjustedIdx2, 1);
        }
        
        // Add merged stone
        const mergedId = `stone_merged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const mergedStone = createMemoryStone(mergedId, title, text, ['merged']);
        state.canonRing.push(mergedStone);
      }
    }

    // Enforce cap ≤ 12 stones by removing oldest extras
    while (state.canonRing.length > 12) {
      state.canonRing.shift();
    }

    summary.stonesCount = state.canonRing.length;
  }

  // 5. SAFETY - store flags, rate limits, notes
  if (patch.safety) {
    // Store flags
    if (patch.safety.flags && Array.isArray(patch.safety.flags)) {
      state.safetyFlags = patch.safety.flags;
    }

    // Write soft rate_limits (create cooldownUntil timestamps)
    if (patch.safety.rate_limits && Array.isArray(patch.safety.rate_limits)) {
      for (const limit of patch.safety.rate_limits) {
        const player = state.getPlayer(limit.player);
        if (player && typeof limit.cooldown_s === 'number') {
          player.cooldownUntil = Date.now() + (limit.cooldown_s * 1000);
        }
      }
    }

    // Store notes for elder
    if (patch.safety.notes_for_elder !== undefined) {
      state.notesForElder = patch.safety.notes_for_elder;
    }
  }

  // After apply: update prior_quest_percent
  if (state.nowRing.activeQuest) {
    state.prior_quest_percent = state.nowRing.activeQuest.percent;
  } else {
    state.prior_quest_percent = patch.resources?.quest_percent || 0;
  }

  // Rebuild top_recent_actions (max 5)
  if (!state.nowRing.topRecentActions) {
    state.nowRing.topRecentActions = [];
  }
  state.nowRing.topRecentActions = state.nowRing.topRecentActions.slice(0, 5);

  // Rebuild last_messages_summary (max 8)
  if (state.lastMessagesSummary) {
    if (Array.isArray(state.lastMessagesSummary)) {
      state.lastMessagesSummary = state.lastMessagesSummary.slice(0, 8);
    }
  }

  // Log one compact line
  const actions = summary.tradesResolved;
  const vote = summary.voteStatus || (state.nowRing.activeVote?.status || 'none');
  const quest = summary.questPercent !== null ? summary.questPercent : (state.nowRing.activeQuest?.percent || 0);
  const stones = summary.stonesCount !== null ? summary.stonesCount : state.canonRing.length;

  log.info?.(`tick=${summary.tick} actions=${actions} vote=${vote} quest=${quest} stones=${stones}`);

  return summary;
}
