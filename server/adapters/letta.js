// Letta adapter for backstage agents
import { readFileSync } from 'fs';
import { resolve } from 'path';

class LettaAdapter {
  constructor() {
    this.mode = process.env.LLM_MODE || 'MOCK';
    this.apiKey = process.env.LETTA_API_KEY;
    this.prompts = this.loadPrompts();
  }

  // Load agent prompts from files
  loadPrompts() {
    const prompts = {};
    const promptFiles = {
      archivist: process.env.ARCHIVIST_PROMPT_PATH || './prompts/archivist_rules.txt',
      cadence: process.env.CADENCE_PROMPT_PATH || './prompts/cadence_card.txt',
      tallykeeper: process.env.TALLYKEEPER_PROMPT_PATH || './prompts/tallykeeper_rules.txt',
      quartermaster: process.env.QUARTERMASTER_PROMPT_PATH || './prompts/quartermaster_rules.txt',
      warden: process.env.WARDEN_PROMPT_PATH || './prompts/warden_rules.txt',
      broker: process.env.BROKER_PROMPT_PATH || './prompts/broker_rules.txt'
    };

    for (const [key, path] of Object.entries(promptFiles)) {
      try {
        prompts[key] = readFileSync(resolve(path), 'utf-8');
      } catch (error) {
        console.warn(`Could not load ${key} prompt, using default`);
        prompts[key] = this.getDefaultPrompt(key);
      }
    }

    return prompts;
  }

  // Default prompts if files not found
  getDefaultPrompt(agentType) {
    const defaults = {
      archivist: 'Extract key insights and create concise memory stones.',
      cadence: 'Manage timing and triggers for Elder responses.',
      tallykeeper: 'Count votes and generate decision summaries.',
      quartermaster: 'Track inventory and quest progress.',
      warden: 'Monitor safety and rate limits.',
      broker: 'Manage trading board and offers.'
    };
    return defaults[agentType] || 'Perform agent tasks.';
  }

  // Refine journal to Memory Stone (Archivist)
  async refineJournalToStone(journalText) {
    if (this.mode === 'LIVE' && this.apiKey) {
      try {
        return await this.callLettaAPI('archivist', {
          task: 'refine_journal',
          input: journalText
        });
      } catch (error) {
        console.error('Letta archivist error, using fallback:', error);
        return this.mockRefineJournal(journalText);
      }
    }

    return this.mockRefineJournal(journalText);
  }

  // Generate Decision Card (Tallykeeper)
  async generateDecisionCard(vote, results, winner) {
    if (this.mode === 'LIVE' && this.apiKey) {
      try {
        return await this.callLettaAPI('tallykeeper', {
          task: 'decision_card',
          vote,
          results,
          winner
        });
      } catch (error) {
        console.error('Letta tallykeeper error, using fallback:', error);
        return this.mockDecisionCard(vote, results, winner);
      }
    }

    return this.mockDecisionCard(vote, results, winner);
  }

  // Generate Quartermaster Summary
  async generateQuartermasterSummary(report) {
    if (this.mode === 'LIVE' && this.apiKey) {
      try {
        return await this.callLettaAPI('quartermaster', {
          task: 'summary',
          report
        });
      } catch (error) {
        console.error('Letta quartermaster error, using fallback:', error);
        return this.mockQuartermasterSummary(report);
      }
    }

    return this.mockQuartermasterSummary(report);
  }

  // Generate Warden Summary
  async generateWardenSummary(data) {
    if (this.mode === 'LIVE' && this.apiKey) {
      try {
        return await this.callLettaAPI('warden', {
          task: 'summary',
          data
        });
      } catch (error) {
        console.error('Letta warden error, using fallback:', error);
        return this.mockWardenSummary(data);
      }
    }

    return this.mockWardenSummary(data);
  }

  // Generate Broker Summary
  async generateBrokerSummary(summary) {
    if (this.mode === 'LIVE' && this.apiKey) {
      try {
        return await this.callLettaAPI('broker', {
          task: 'summary',
          summary
        });
      } catch (error) {
        console.error('Letta broker error, using fallback:', error);
        return this.mockBrokerSummary(summary);
      }
    }

    return this.mockBrokerSummary(summary);
  }

  // Call actual Letta API
  async callLettaAPI(agentType, payload) {
    const endpoint = 'https://api.letta.ai/v1/agents/execute';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        agent: agentType,
        system_prompt: this.prompts[agentType],
        payload
      })
    });

    if (!response.ok) {
      throw new Error(`Letta API error: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
  }

  // Mock implementations

  mockRefineJournal(text) {
    const words = text.split(/\s+/);
    const title = words.slice(0, Math.min(5, words.length)).join(' ');
    
    return {
      title: title.length > 40 ? title.substring(0, 37) + '...' : title,
      text: text.length > 100 ? text.substring(0, 97) + '...' : text,
      tags: this.extractTags(text)
    };
  }

  extractTags(text) {
    const tags = [];
    const keywords = ['moss', 'cedar', 'resin', 'spore', 'trade', 'quest', 'vote'];
    
    for (const keyword of keywords) {
      if (text.toLowerCase().includes(keyword)) {
        tags.push(keyword);
      }
    }

    return tags.slice(0, 3);
  }

  mockDecisionCard(vote, results, winner) {
    const totalVotes = Object.values(results).reduce((sum, count) => sum + count, 0);
    
    return {
      topic: vote.topic,
      winner,
      totalVotes,
      results,
      summary: `The village chose "${winner}" with ${results[winner]} of ${totalVotes} votes. The decision is sealed.`,
      narrative: `After much deliberation, the voices united. "${winner}" shall be our path forward.`
    };
  }

  mockQuartermasterSummary(report) {
    if (report.isFirstReport) {
      return 'The stockpile stands ready for contributions.';
    }

    const parts = [];
    if (report.deltas && Object.keys(report.deltas.stockpile).length > 0) {
      const changes = Object.entries(report.deltas.stockpile)
        .map(([item, delta]) => `${item}: ${delta > 0 ? '+' : ''}${delta}`)
        .join(', ');
      parts.push(`Resources shifted: ${changes}`);
    }

    if (report.deltas && report.deltas.questProgress > 0) {
      parts.push(`Our quest advances by ${report.deltas.questProgress}%`);
    }

    return parts.length > 0 ? parts.join('. ') + '.' : 'The stockpile remains steady.';
  }

  mockWardenSummary(data) {
    const parts = [];

    if (data.activeWarnings && data.activeWarnings.length > 0) {
      parts.push(`Some villagers grow restless: ${data.activeWarnings.map(w => w.player).join(', ')}`);
    }

    if (data.recentRateLimits && data.recentRateLimits.length > 0) {
      parts.push(`${data.recentRateLimits.length} needed gentle reminders to slow their pace`);
    }

    return parts.length > 0 ? parts.join('. ') + '.' : 'All is peaceful in the grove.';
  }

  mockBrokerSummary(summary) {
    if (summary.total === 0) {
      return 'The trading post sits quiet, waiting for offers.';
    }

    const examples = summary.offers.slice(0, 2).map(o => 
      `${o.from} offers ${o.give.qty} ${o.give.item} for ${o.want.qty} ${o.want.item}`
    );

    return `${summary.total} trades await on the board. ${examples.join('. ')}.`;
  }

  // Check if adapter is in LIVE mode
  isLive() {
    return this.mode === 'LIVE' && this.apiKey;
  }

  // Get mode status
  getStatus() {
    return {
      mode: this.mode,
      hasApiKey: !!this.apiKey,
      active: this.isLive() ? 'LIVE' : 'MOCK'
    };
  }
}

// Singleton instance
export const lettaAdapter = new LettaAdapter();
