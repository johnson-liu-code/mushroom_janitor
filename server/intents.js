// Intent parsing for natural language and commands
import { IntentType, Resources } from './types.js';

// Command patterns
const COMMAND_PATTERNS = {
  gather: /^\/gather\s+(\w+)$/i,
  gift: /^\/gift\s+@?(\w+)\s+(\w+)\s+x?(\d+)$/i,
  donate: /^\/donate\s+(\w+)\s+x?(\d+)$/i,
  offer: /^\/offer\s+give\s+(\w+)\s*x?(\d+)\s+for\s+(\w+)\s*x?(\d+)$/i,
  accept: /^\/accept\s+(\w+)$/i,
  vote: /^\/vote\s+(.+)$/i,
  journal: /^\/journal\s+(.+)$/i
};

// Natural language patterns
const NL_PATTERNS = {
  gather: [
    /(?:gather|collect|get|find)\s+(?:some\s+)?(\w+)/i,
    /(?:i|i'd)\s+like\s+to\s+(?:gather|collect|get)\s+(?:some\s+)?(\w+)/i,
    /(?:go|going)\s+(?:gather|collect|get)\s+(?:some\s+)?(\w+)/i
  ],
  gift: [
    /(?:give|gift|send)\s+@?(\w+)\s+(\d+)\s+(\w+)/i,
    /(?:give|gift|send)\s+(\d+)\s+(\w+)\s+to\s+@?(\w+)/i
  ],
  donate: [
    /(?:donate|contribute)\s+(\d+)\s+(\w+)/i,
    /(?:add|put)\s+(\d+)\s+(\w+)\s+(?:to|in)\s+(?:the\s+)?stockpile/i
  ],
  vote: [
    /(?:i\s+)?vote\s+(?:for\s+)?(.+)/i,
    /(?:my\s+)?choice\s+is\s+(.+)/i
  ]
};

// Resource validation
function isValidResource(resource) {
  return Object.values(Resources).includes(resource.toLowerCase());
}

// Parse command-style input
function parseCommand(text) {
  text = text.trim();

  // /gather <item>
  let match = text.match(COMMAND_PATTERNS.gather);
  if (match) {
    const item = match[1].toLowerCase();
    if (isValidResource(item)) {
      return {
        type: IntentType.GATHER,
        params: { item },
        confidence: 1.0
      };
    }
  }

  // /gift @user <item> x<count>
  match = text.match(COMMAND_PATTERNS.gift);
  if (match) {
    const [, targetPlayer, item, quantity] = match;
    if (isValidResource(item.toLowerCase())) {
      return {
        type: IntentType.GIFT,
        params: {
          targetPlayer,
          item: item.toLowerCase(),
          quantity: parseInt(quantity)
        },
        confidence: 1.0
      };
    }
  }

  // /donate <item> x<count>
  match = text.match(COMMAND_PATTERNS.donate);
  if (match) {
    const [, item, quantity] = match;
    if (isValidResource(item.toLowerCase())) {
      return {
        type: IntentType.DONATE,
        params: {
          item: item.toLowerCase(),
          quantity: parseInt(quantity)
        },
        confidence: 1.0
      };
    }
  }

  // /offer give <item>x<count> for <item>x<count>
  match = text.match(COMMAND_PATTERNS.offer);
  if (match) {
    const [, giveItem, giveQty, wantItem, wantQty] = match;
    if (isValidResource(giveItem.toLowerCase()) && isValidResource(wantItem.toLowerCase())) {
      return {
        type: IntentType.OFFER,
        params: {
          give: { item: giveItem.toLowerCase(), qty: parseInt(giveQty) },
          want: { item: wantItem.toLowerCase(), qty: parseInt(wantQty) }
        },
        confidence: 1.0
      };
    }
  }

  // /accept <offerId>
  match = text.match(COMMAND_PATTERNS.accept);
  if (match) {
    return {
      type: IntentType.ACCEPT,
      params: { offerId: match[1] },
      confidence: 1.0
    };
  }

  // /vote <option>
  match = text.match(COMMAND_PATTERNS.vote);
  if (match) {
    return {
      type: IntentType.VOTE,
      params: { option: match[1].trim() },
      confidence: 1.0
    };
  }

  // /journal <text>
  match = text.match(COMMAND_PATTERNS.journal);
  if (match) {
    return {
      type: IntentType.JOURNAL,
      params: { text: match[1].trim() },
      confidence: 1.0
    };
  }

  return null;
}

// Parse natural language input
function parseNaturalLanguage(text) {
  text = text.trim();

  // Try gather patterns
  for (const pattern of NL_PATTERNS.gather) {
    const match = text.match(pattern);
    if (match) {
      const item = match[1].toLowerCase();
      if (isValidResource(item)) {
        return {
          type: IntentType.GATHER,
          params: { item },
          confidence: 0.8
        };
      }
    }
  }

  // Try gift patterns
  for (const pattern of NL_PATTERNS.gift) {
    const match = text.match(pattern);
    if (match) {
      // Pattern 1: give @user 5 moss
      if (match.length === 4) {
        const [, targetPlayer, quantity, item] = match;
        if (isValidResource(item.toLowerCase())) {
          return {
            type: IntentType.GIFT,
            params: {
              targetPlayer,
              item: item.toLowerCase(),
              quantity: parseInt(quantity)
            },
            confidence: 0.7
          };
        }
      }
      // Pattern 2: give 5 moss to @user
      if (match.length === 4) {
        const [, quantity, item, targetPlayer] = match;
        if (isValidResource(item.toLowerCase())) {
          return {
            type: IntentType.GIFT,
            params: {
              targetPlayer,
              item: item.toLowerCase(),
              quantity: parseInt(quantity)
            },
            confidence: 0.7
          };
        }
      }
    }
  }

  // Try donate patterns
  for (const pattern of NL_PATTERNS.donate) {
    const match = text.match(pattern);
    if (match) {
      const [, quantity, item] = match;
      if (isValidResource(item.toLowerCase())) {
        return {
          type: IntentType.DONATE,
          params: {
            item: item.toLowerCase(),
            quantity: parseInt(quantity)
          },
          confidence: 0.7
        };
      }
    }
  }

  // Try vote patterns
  for (const pattern of NL_PATTERNS.vote) {
    const match = text.match(pattern);
    if (match) {
      return {
        type: IntentType.VOTE,
        params: { option: match[1].trim() },
        confidence: 0.6
      };
    }
  }

  return null;
}

// Check if message mentions Elder
export function mentionsElder(text) {
  const elderPatterns = [
    /@elder/i,
    /elder\s+mycel/i,
    /hey\s+elder/i,
    /elder[,!?]/i
  ];
  
  return elderPatterns.some(pattern => pattern.test(text));
}

// Main parsing function
export function parseIntent(text) {
  if (!text || typeof text !== 'string') {
    return {
      type: IntentType.UNKNOWN,
      params: {},
      confidence: 0
    };
  }

  // Try command parsing first (higher confidence)
  const commandIntent = parseCommand(text);
  if (commandIntent) {
    return commandIntent;
  }

  // Try natural language parsing
  const nlIntent = parseNaturalLanguage(text);
  if (nlIntent) {
    return nlIntent;
  }

  // Default to chat
  return {
    type: IntentType.CHAT,
    params: { text },
    confidence: 1.0
  };
}

// Validate intent parameters
export function validateIntent(intent) {
  switch (intent.type) {
    case IntentType.GATHER:
      return intent.params.item && isValidResource(intent.params.item);
    
    case IntentType.GIFT:
      return intent.params.targetPlayer && 
             intent.params.item && 
             isValidResource(intent.params.item) &&
             intent.params.quantity > 0;
    
    case IntentType.DONATE:
      return intent.params.item && 
             isValidResource(intent.params.item) &&
             intent.params.quantity > 0;
    
    case IntentType.OFFER:
      return intent.params.give && 
             intent.params.want &&
             isValidResource(intent.params.give.item) &&
             isValidResource(intent.params.want.item) &&
             intent.params.give.qty > 0 &&
             intent.params.want.qty > 0;
    
    case IntentType.ACCEPT:
      return intent.params.offerId;
    
    case IntentType.VOTE:
      return intent.params.option;
    
    case IntentType.JOURNAL:
      return intent.params.text;
    
    case IntentType.CHAT:
      return true;
    
    default:
      return false;
  }
}
