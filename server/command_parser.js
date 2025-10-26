// Command parser for user input
// Forgiving, case-insensitive parser for village commands

const VALID_ITEMS = ['moss', 'cedar', 'resin', 'spores'];

/**
 * Parse quantity from text like "x3", "×3", or "3"
 */
function parseQuantity(text) {
  if (!text) return 1;
  
  // Match x3, ×3, or bare number
  const match = text.match(/[x×]?(\d+)/i);
  if (match) {
    const qty = parseInt(match[1], 10);
    return Math.max(1, Math.min(9, qty)); // Clamp to 1..9
  }
  
  return 1;
}

/**
 * Canonicalize item name (case-insensitive, handle plurals)
 */
function canonicalizeItem(text) {
  if (!text) return null;
  
  const normalized = text.toLowerCase().trim();
  
  // Handle plurals
  const singular = normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
  
  // Find matching item
  for (const item of VALID_ITEMS) {
    if (item === singular || item === normalized) {
      return item;
    }
  }
  
  return null;
}

/**
 * Parse command from user text
 * Returns { cmd, args } or { cmd: 'chat', text }
 */
export function parseCommand(text) {
  if (!text || typeof text !== 'string') {
    return { cmd: 'chat', text: '' };
  }
  
  const trimmed = text.trim();
  
  // Check if it's a command (starts with /)
  if (!trimmed.startsWith('/')) {
    return { cmd: 'chat', text: trimmed };
  }
  
  // Remove leading / and normalize whitespace
  const commandText = trimmed.slice(1).replace(/\s+/g, ' ').trim();
  const parts = commandText.split(' ');
  const verb = parts[0].toLowerCase();
  
  // /gather <item> [xN]
  if (verb === 'gather') {
    if (parts.length < 2) {
      return { cmd: 'invalid', error: 'Usage: /gather <item> [xN]' };
    }
    
    const item = canonicalizeItem(parts[1]);
    if (!item) {
      return { cmd: 'invalid', error: `Invalid item. Use: ${VALID_ITEMS.join(', ')}` };
    }
    
    const qty = parts.length > 2 ? parseQuantity(parts[2]) : 1;
    
    return { cmd: 'gather', args: { item, qty } };
  }
  
  // /donate <item> xN
  if (verb === 'donate') {
    if (parts.length < 3) {
      return { cmd: 'invalid', error: 'Usage: /donate <item> xN' };
    }
    
    const item = canonicalizeItem(parts[1]);
    if (!item) {
      return { cmd: 'invalid', error: `Invalid item. Use: ${VALID_ITEMS.join(', ')}` };
    }
    
    const qty = parseQuantity(parts[2]);
    
    return { cmd: 'donate', args: { item, qty } };
  }
  
  // /offer <give> xG for <want> xW
  if (verb === 'offer') {
    // Find "for" keyword
    const forIndex = parts.findIndex(p => p.toLowerCase() === 'for');
    if (forIndex === -1 || forIndex < 2 || parts.length < forIndex + 2) {
      return { cmd: 'invalid', error: 'Usage: /offer <item> xN for <item> xN' };
    }
    
    const giveItem = canonicalizeItem(parts[1]);
    const giveQty = parseQuantity(parts[2]);
    const wantItem = canonicalizeItem(parts[forIndex + 1]);
    const wantQty = parts.length > forIndex + 2 ? parseQuantity(parts[forIndex + 2]) : 1;
    
    if (!giveItem || !wantItem) {
      return { cmd: 'invalid', error: `Invalid items. Use: ${VALID_ITEMS.join(', ')}` };
    }
    
    return {
      cmd: 'offer',
      args: {
        give: { item: giveItem, qty: giveQty },
        want: { item: wantItem, qty: wantQty }
      }
    };
  }
  
  // /accept <offerId>
  if (verb === 'accept') {
    if (parts.length < 2) {
      return { cmd: 'invalid', error: 'Usage: /accept <offerId>' };
    }
    
    const offerId = parts[1];
    
    return { cmd: 'accept', args: { offerId } };
  }
  
  // /vote <option text>
  if (verb === 'vote') {
    if (parts.length < 2) {
      return { cmd: 'invalid', error: 'Usage: /vote <option>' };
    }
    
    // Join remaining parts as the option text
    const option = parts.slice(1).join(' ');
    
    return { cmd: 'vote', args: { option } };
  }
  
  // /journal <sentence>
  if (verb === 'journal') {
    if (parts.length < 2) {
      return { cmd: 'invalid', error: 'Usage: /journal <text>' };
    }
    
    // Join remaining parts as the journal text
    const journalText = parts.slice(1).join(' ');
    
    return { cmd: 'journal', args: { text: journalText } };
  }
  
  // Unknown command
  return { cmd: 'invalid', error: `Unknown command: /${verb}` };
}
