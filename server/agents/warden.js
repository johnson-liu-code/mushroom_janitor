// Saproprobe Warden: Safety checks and rate limiting
import { gameState } from '../state.js';
import { lettaAdapter } from '../adapters/letta.js';

class SaproprobeWarden {
  constructor() {
    this.name = 'Saproprobe Warden';
    this.rateLimits = new Map(); // playerId -> { count, resetAt }
    this.warnings = new Map(); // playerId -> warning count
    this.adminList = new Set(['admin']); // Admin IDs never get rate limited
  }

  // Check if player should be rate limited
  checkRateLimit(playerId) {
    // Admins bypass rate limits
    if (this.adminList.has(playerId)) {
      return { allowed: true };
    }

    const now = Date.now();
    const limit = this.rateLimits.get(playerId);

    // Initialize or reset if expired
    if (!limit || now >= limit.resetAt) {
      this.rateLimits.set(playerId, {
        count: 1,
        resetAt: now + 60000 // 1 minute window
      });
      return { allowed: true };
    }

    // Increment count
    limit.count++;

    // Soft limit: 10 messages per minute
    const softLimit = 10;
    const hardLimit = 20;

    if (limit.count > hardLimit) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded. Please wait a moment.',
        severity: 'hard'
      };
    }

    if (limit.count > softLimit) {
      this.issueWarning(playerId, 'rate_limit');
      return {
        allowed: true,
        warning: 'You are sending messages quickly. Please slow down.',
        severity: 'soft'
      };
    }

    return { allowed: true };
  }

  // Issue warning to player
  issueWarning(playerId, reason) {
    const warnings = this.warnings.get(playerId) || 0;
    this.warnings.set(playerId, warnings + 1);

    return {
      playerId,
      reason,
      count: warnings + 1
    };
  }

  // Basic safety checks on message content
  checkMessageSafety(message) {
    if (!message || !message.text) {
      return { safe: true };
    }

    const text = message.text.toLowerCase();
    const flags = [];

    // Check for excessive caps
    const capsRatio = (message.text.match(/[A-Z]/g) || []).length / message.text.length;
    if (capsRatio > 0.7 && message.text.length > 10) {
      flags.push('excessive_caps');
    }

    // Check for spam patterns
    const repeatedChar = /(.)\1{10,}/;
    if (repeatedChar.test(message.text)) {
      flags.push('character_spam');
    }

    // Check for very long messages
    if (message.text.length > 500) {
      flags.push('message_too_long');
    }

    // Basic profanity check (simple word list)
    const profanityList = ['badword1', 'badword2']; // Placeholder
    for (const word of profanityList) {
      if (text.includes(word)) {
        flags.push('profanity');
        break;
      }
    }

    if (flags.length > 0) {
      return {
        safe: false,
        flags,
        action: flags.includes('profanity') ? 'block' : 'warn'
      };
    }

    return { safe: true };
  }

  // Generate summary for Elder (human-readable)
  async generateSummaryForElder() {
    const now = Date.now();
    const activeWarnings = [];
    const recentRateLimits = [];

    // Check for players with warnings
    for (const [playerId, count] of this.warnings.entries()) {
      if (count >= 3) {
        const player = gameState.getPlayer(playerId);
        activeWarnings.push({
          player: player?.name || playerId,
          warnings: count
        });
      }
    }

    // Check for recently rate-limited players
    for (const [playerId, limit] of this.rateLimits.entries()) {
      if (limit.count > 10 && limit.resetAt > now) {
        const player = gameState.getPlayer(playerId);
        recentRateLimits.push({
          player: player?.name || playerId,
          count: limit.count
        });
      }
    }

    try {
      // Use Letta to create narrative summary
      const summary = await lettaAdapter.generateWardenSummary({
        activeWarnings,
        recentRateLimits
      });
      return summary;
    } catch (error) {
      console.error('Warden summary error:', error);
      return this.generateSimpleSummary(activeWarnings, recentRateLimits);
    }
  }

  // Simple fallback summary
  generateSimpleSummary(activeWarnings, recentRateLimits) {
    const parts = [];

    if (activeWarnings.length > 0) {
      const names = activeWarnings.map(w => w.player).join(', ');
      parts.push(`${names} showing overactive behavior`);
    }

    if (recentRateLimits.length > 0) {
      parts.push(`${recentRateLimits.length} rate limit event(s)`);
    }

    if (parts.length === 0) {
      return 'Village atmosphere is calm.';
    }

    return parts.join('. ') + '.';
  }

  // Add admin to bypass list
  addAdmin(playerId) {
    this.adminList.add(playerId);
  }

  // Remove admin from bypass list
  removeAdmin(playerId) {
    this.adminList.delete(playerId);
  }

  // Clear warnings for a player
  clearWarnings(playerId) {
    this.warnings.delete(playerId);
  }

  // Get player warning status
  getPlayerStatus(playerId) {
    const warnings = this.warnings.get(playerId) || 0;
    const rateLimit = this.rateLimits.get(playerId);
    const isAdmin = this.adminList.has(playerId);

    return {
      playerId,
      warnings,
      isAdmin,
      rateLimit: rateLimit ? {
        count: rateLimit.count,
        resetsIn: Math.max(0, rateLimit.resetAt - Date.now())
      } : null
    };
  }

  // Process safety check with rate limit
  processSafetyCheck(playerId, message) {
    // Check rate limit
    const rateLimitCheck = this.checkRateLimit(playerId);
    if (!rateLimitCheck.allowed) {
      return {
        allowed: false,
        reason: rateLimitCheck.reason,
        type: 'rate_limit'
      };
    }

    // Check message safety
    const safetyCheck = this.checkMessageSafety(message);
    if (!safetyCheck.safe) {
      if (safetyCheck.action === 'block') {
        return {
          allowed: false,
          reason: 'Message blocked for safety reasons',
          type: 'safety',
          flags: safetyCheck.flags
        };
      } else {
        // Warn but allow
        this.issueWarning(playerId, 'safety_warning');
        return {
          allowed: true,
          warning: 'Please keep messages appropriate',
          type: 'safety_warning',
          flags: safetyCheck.flags
        };
      }
    }

    // Check for soft limit warning
    if (rateLimitCheck.warning) {
      return {
        allowed: true,
        warning: rateLimitCheck.warning,
        type: 'rate_limit_warning'
      };
    }

    return { allowed: true };
  }
}

// Singleton instance
export const saproprobeWarden = new SaproprobeWarden();
