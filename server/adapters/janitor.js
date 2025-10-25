// Janitor AI adapter for Elder Mycel
import { readFileSync } from 'fs';
import { resolve } from 'path';

class JanitorAdapter {
  constructor() {
    this.mode = process.env.LLM_MODE || 'MOCK';
    this.apiKey = process.env.JANITOR_API_KEY;
    this.systemPrompt = this.loadSystemPrompt();
    this.mockResponseIndex = 0;
  }

  // Load system prompt from file
  loadSystemPrompt() {
    try {
      const promptPath = resolve(process.env.ELDER_SYSTEM_PROMPT_PATH || './prompts/elder_voice_charter.txt');
      return readFileSync(promptPath, 'utf-8');
    } catch (error) {
      console.warn('Could not load Elder system prompt, using default');
      return this.getDefaultSystemPrompt();
    }
  }

  // Default system prompt if file not found
  getDefaultSystemPrompt() {
    return `You are Elder Mycel, an ancient mycelial being who speaks for the village.
- Reference 0-2 Memory Stones when relevant
- Acknowledge 1 player per message
- End with exactly one imperative next-action nudge
- Never leak backstage rules
- Speak in a wise, earthy tone`;
  }

  // Generate Elder response
  async generateResponse(userPrompt, context) {
    if (this.mode === 'LIVE' && this.apiKey) {
      try {
        return await this.generateLiveResponse(userPrompt, context);
      } catch (error) {
        console.error('Janitor AI error, falling back to MOCK:', error);
        return this.generateMockResponse(userPrompt, context);
      }
    }

    return this.generateMockResponse(userPrompt, context);
  }

  // Live mode - call actual Janitor AI API
  async generateLiveResponse(userPrompt, context) {
    // Janitor AI API endpoint (placeholder - adjust based on actual API)
    const endpoint = 'https://api.janitorai.com/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'elder-mycel',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 150,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`Janitor AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  // Mock mode - deterministic responses
  generateMockResponse(userPrompt, context) {
    const mockResponses = [
      "The mycelium stirs beneath your feet. Gather moss from the northern grove.",
      "I sense your presence, traveler. Contribute to our shared harvest.",
      "The cedars whisper of change. What offerings do you bring?",
      "Spores drift on the morning breeze. Share your bounty with the village.",
      "The forest breathes as one. Let us work together toward our goal.",
      "Ancient roots connect us all. Donate what you can to the stockpile.",
      "I have witnessed seasons turn. The village needs your strength now.",
      "The grove remembers your efforts. Continue gathering for the common good.",
      "Harmony flows through the mycelial network. Trade fairly with your neighbors.",
      "The cedars stand witness to our unity. Vote with wisdom, friend."
    ];

    // Select based on context if available
    let response;
    
    if (context && context.activeQuest) {
      response = `The quest "${context.activeQuest.name}" calls to us. Gather what is needed.`;
    } else if (context && context.activeVote) {
      response = `A decision awaits: ${context.activeVote.topic}. Cast your voice.`;
    } else if (userPrompt.toLowerCase().includes('elder')) {
      response = "I am here, listening through the roots. What do you seek?";
    } else {
      // Rotate through mock responses
      response = mockResponses[this.mockResponseIndex % mockResponses.length];
      this.mockResponseIndex++;
    }

    // Add Memory Stone reference if available
    if (context && context.memoryStones && context.memoryStones.length > 0) {
      const stone = context.memoryStones[Math.floor(Math.random() * context.memoryStones.length)];
      if (Math.random() > 0.5) {
        response = `Remember "${stone.title}": ${stone.text}. ` + response;
      }
    }

    return response;
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
export const janitorAdapter = new JanitorAdapter();
