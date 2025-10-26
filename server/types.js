// Type definitions and constants for Mushroom Village

// Message types for WebSocket communication
export const MessageType = {
  USER_CHAT: 'USER_CHAT',
  SYSTEM_NOTE: 'SYSTEM_NOTE',
  INTENT: 'INTENT',
  ELDER_SAY: 'ELDER_SAY',
  ELDER_DM: 'ELDER_DM',  // Private message from Elder to specific player
  VOTE_STATUS: 'VOTE_STATUS',
  QUEST_STATUS: 'QUEST_STATUS',
  QUEST_COMPLETED: 'QUEST_COMPLETED',
  TRADE_STATUS: 'TRADE_STATUS',
  CHRONICLE_EXPORT: 'CHRONICLE_EXPORT',
  STATE_UPDATE: 'STATE_UPDATE'
};

// Intent types
export const IntentType = {
  GATHER: 'GATHER',
  GIFT: 'GIFT',
  DONATE: 'DONATE',
  OFFER: 'OFFER',
  ACCEPT: 'ACCEPT',
  VOTE: 'VOTE',
  JOURNAL: 'JOURNAL',
  CHAT: 'CHAT',
  UNKNOWN: 'UNKNOWN'
};

// Resource types
export const Resources = {
  MOSS: 'moss',
  CEDAR: 'cedar',
  RESIN: 'resin',
  SPORES: 'spores',
  CHARMS: 'charms'
};

// Trade status
export const TradeStatus = {
  OPEN: 'OPEN',
  ACCEPTED: 'ACCEPTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

// Vote status
export const VoteStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED'
};

// Quest status
export const QuestStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED'
};

// Elder Mycel trigger types
export const TriggerType = {
  CALL_RESPONSE: 'CALL_RESPONSE', // Direct question or @mention
  PULSE: 'PULSE',                 // After M messages or T seconds
  EVENT: 'EVENT'                  // Vote close, quest threshold, safety flag
};

// Agent types
export const AgentType = {
  CONDUCTOR: 'CONDUCTOR',
  ARCHIVIST: 'ARCHIVIST',
  TALLYKEEPER: 'TALLYKEEPER',
  QUARTERMASTER: 'QUARTERMASTER',
  WARDEN: 'WARDEN',
  BROKER: 'BROKER'
};

// Entity factories
export function createPlayer(id, name) {
  return {
    id,
    name,
    inventory: {
      moss: 0,
      cedar: 0,
      resin: 0,
      spores: 0,
      charms: 0
    },
    titles: [],
    lastAction: Date.now(),
    messageCount: 0
  };
}

export function createMemoryStone(id, title, text, tags = []) {
  return {
    id,
    title,
    text,
    tags,
    createdAt: Date.now()
  };
}

export function createQuest(id, name, recipe) {
  return {
    id,
    name,
    recipe,
    percent: 0,
    status: QuestStatus.ACTIVE,
    createdAt: Date.now()
  };
}

export function createVote(id, topic, options, closesAt) {
  return {
    id,
    topic,
    options,
    tally: {},
    closesAt,
    status: VoteStatus.OPEN,
    createdAt: Date.now()
  };
}

export function createOffer(id, fromPlayer, give, want) {
  return {
    id,
    fromPlayer,
    give,
    want,
    status: TradeStatus.OPEN,
    createdAt: Date.now()
  };
}

export function createScratchAction(playerId, action, text) {
  return {
    playerId,
    action,
    text,
    timestamp: Date.now(),
    expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes TTL
  };
}

export function createMessage(type, data, from = 'system') {
  return {
    type,
    data,
    from,
    timestamp: Date.now()
  };
}
