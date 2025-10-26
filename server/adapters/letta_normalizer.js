/**
 * Letta Patch Normalizer
 * 
 * Transforms raw Letta API responses into a consistent, normalized patch format
 * with safe defaults and type coercion.
 */

/**
 * Normalize a raw Letta patch response
 * 
 * @param {any} raw - Raw response from Letta API
 * @param {Object} tickContext - Server-side context
 * @param {string|null} [tickContext.distilledQuestion] - Distilled question for CALL_RESPONSE mode
 * @param {Record<string, {id: string, text: string}>} [tickContext.journalsById] - Journal lookup map
 * @returns {Object} Normalized patch with all seven sections
 */
export default function normalizeLettaPatch(raw, tickContext = {}) {
  // Start with safe skeleton - all sections present with defaults
  const normalized = {
    cadence: {
      should_elder_speak: false,
      mode: null,
      reason: null,
      cooldown_s: 0,
      question: null
    },
    vote: {
      status: null,
      tally: {},
      winner: null,
      close_reason: null
    },
    resources: {
      quest_percent: 0,
      needs: [],
      threshold_crossed: false,
      crossed_at: null
    },
    trades: {
      actions: []
    },
    archive: {
      promote_ids: [],
      new_stones: [],
      prune_ids: [],
      merge_pairs: []
    },
    safety: {
      flags: [],
      rate_limits: [],
      notes_for_elder: null
    },
    elder_message: null,
    locations: []
  };

  // Parse raw if string
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        return normalized; // Return safe defaults
      }
    } catch (e) {
      return normalized; // Return safe defaults
    }
  }

  // 1. CADENCE
  // If mode exists → should_elder_speak = true
  // Copy mode, reason, cooldown_s; question from tickContext
  if (parsed.cadence) {
    const c = parsed.cadence;
    normalized.cadence.should_elder_speak = c.mode ? true : Boolean(c.should_elder_speak || c.shouldElderSpeak);
    normalized.cadence.mode = c.mode || null;
    normalized.cadence.reason = c.reason || c.trigger_reason || c.triggerReason || null;
    const cooldown = Number(c.cooldown_s || c.cooldownS || 0);
    normalized.cadence.cooldown_s = isNaN(cooldown) ? 0 : cooldown;
    normalized.cadence.question = tickContext.distilledQuestion ?? (c.question || null);
  }

  // 2. VOTE
  // Map status: "ACTIVE" → "OPEN"
  // Ensure winner & close_reason (null when absent)
  // Accept tally or tallies (rename to tally)
  if (parsed.vote) {
    const v = parsed.vote;
    normalized.vote.status = v.status === 'ACTIVE' ? 'OPEN' : (v.status || null);
    normalized.vote.tally = v.tally || v.tallies || {};
    normalized.vote.winner = v.winner || null;
    
    // Normalize close_reason to enum values
    const closeReason = v.close_reason || v.closeReason;
    if (closeReason === 'TIMER' || closeReason === 'QUORUM') {
      normalized.vote.close_reason = closeReason;
    } else if (closeReason === 'timer') {
      normalized.vote.close_reason = 'TIMER';
    } else if (closeReason === 'quorum') {
      normalized.vote.close_reason = 'QUORUM';
    } else {
      normalized.vote.close_reason = null;
    }
  }

  // 3. RESOURCES
  // Copy quest_percent
  // If needs is object {cedar:2} → array [{item:"cedar", qty:2}]
  // If threshold_crossed is number N (25/50/75/100) → {threshold_crossed:true, crossed_at:N}
  // If boolean, keep boolean and set crossed_at accordingly or null
  if (parsed.resources) {
    const r = parsed.resources;
    
    // Quest percent
    const questPercent = Number(r.quest_percent || r.questPercent || 0);
    normalized.resources.quest_percent = isNaN(questPercent) ? 0 : questPercent;
    
    // Needs: object → array
    const needs = r.needs || {};
    if (Array.isArray(needs)) {
      normalized.resources.needs = needs.map(n => ({
        item: String(n.item || ''),
        qty: Number(n.qty || 0)
      }));
    } else if (typeof needs === 'object') {
      normalized.resources.needs = Object.entries(needs).map(([item, qty]) => ({
        item: String(item),
        qty: Number(qty)
      }));
    }
    
    // Threshold crossed: number → boolean + crossed_at
    const tc = r.threshold_crossed;
    if (typeof tc === 'number') {
      // Number N → {threshold_crossed: true, crossed_at: N}
      normalized.resources.threshold_crossed = true;
      normalized.resources.crossed_at = tc;
    } else if (tc === true) {
      // Boolean true → check for crossed_at or use null
      normalized.resources.threshold_crossed = true;
      normalized.resources.crossed_at = r.crossed_at || null;
    } else if (tc === false) {
      // Boolean false → no crossed_at
      normalized.resources.threshold_crossed = false;
      normalized.resources.crossed_at = null;
    }
  }

  // 4. TRADES
  // If resolutions exists, include only status:"COMPLETED" → actions [{type:"RESOLVE", id, from, to}]
  // If only FAILED, return actions:[]
  if (parsed.trades) {
    const t = parsed.trades;
    const resolutions = t.resolutions || [];
    
    for (const res of resolutions) {
      if (res.status === 'COMPLETED') {
        normalized.trades.actions.push({
          type: 'RESOLVE',
          id: res.id || res.offer_id,
          from: res.from || res.fromPlayer,
          to: res.to || res.toPlayer
        });
      }
      // FAILED resolutions are silently ignored (no action created)
    }
  }

  // 5. ARCHIVE
  // promote → promote_ids + new_stones (with text lookup from tickContext.journalsById)
  // prune → prune_ids
  // Ensure merge_pairs:[] always present
  if (parsed.archive) {
    const a = parsed.archive;
    
    // Promote IDs
    const promoteIds = a.promote || a.promote_ids || a.promoteJournals || [];
    normalized.archive.promote_ids = Array.isArray(promoteIds) ? promoteIds : [];
    
    // New stones - fill text from journalsById if available
    const newStones = a.new_stones || a.newStones || [];
    normalized.archive.new_stones = (Array.isArray(newStones) ? newStones : []).map(stone => {
      // If stone has a journal_id, try to get text from tickContext
      let text = stone.text || '';
      if (stone.journal_id && tickContext.journalsById) {
        const journal = tickContext.journalsById[stone.journal_id];
        text = journal?.text || text || '…';
      }
      
      return {
        title: String(stone.title || ''),
        text: String(text),
        tags: Array.isArray(stone.tags) ? stone.tags.map(String) : []
      };
    });
    
    // Prune IDs
    const pruneIds = a.prune || a.prune_ids || a.pruneStones || [];
    normalized.archive.prune_ids = Array.isArray(pruneIds) ? pruneIds : [];
    
    // Merge pairs - always array of [id1, id2, title, text]
    const mergePairs = a.merge_pairs || [];
    normalized.archive.merge_pairs = Array.isArray(mergePairs) ? mergePairs : [];
  }

  // 6. SAFETY
  // alerts → flags
  // notes → notes_for_elder (empty string → null)
  // Ensure rate_limits:[] when missing
  if (parsed.safety) {
    const s = parsed.safety;
    
    // Flags
    const flags = s.alerts || s.flags || s.warnings || [];
    normalized.safety.flags = Array.isArray(flags) ? flags.map(String) : [];
    
    // Rate limits
    const rateLimits = s.rate_limits || s.rateLimits || [];
    normalized.safety.rate_limits = (Array.isArray(rateLimits) ? rateLimits : []).map(rl => ({
      player: String(rl.player || rl.playerId || ''),
      cooldown_s: Number(rl.cooldown_s || rl.cooldownS || 0)
    }));
    
    // Notes for Elder (empty string → null)
    const notes = s.notes || s.notes_for_elder || s.notesForElder || '';
    normalized.safety.notes_for_elder = notes === '' ? null : (notes || null);
  }

  // 7. ELDER_MESSAGE
  // Letta now handles all Elder orchestration and returns complete elder_message
  if (parsed.elder_message) {
    const em = parsed.elder_message;
    normalized.elder_message = {
      text: String(em.text || ''),
      nudge: String(em.nudge || ''),
      referenced_stones: Array.isArray(em.referenced_stones) ? em.referenced_stones.map(String) : [],
      acknowledged_users: Array.isArray(em.acknowledged_users) ? em.acknowledged_users.map(String) : []
    };
  }

  // 8. LOCATIONS (for village map)
  // Letta can optionally provide new village locations
  if (parsed.locations && Array.isArray(parsed.locations)) {
    normalized.locations = parsed.locations.map(loc => ({
      name: String(loc.name || ''),
      x: Number(loc.x || 0),
      y: Number(loc.y || 0),
      type: String(loc.type || 'custom'),
      icon: String(loc.icon || '📍')
    }));
  }

  return normalized;
}
