// Main server: HTTP + WebSocket
import 'dotenv/config';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

// Import game modules
import { gameState } from './state.js';
import { MessageType, IntentType, createPlayer, createScratchAction, createMessage } from './types.js';
import { parseIntent, validateIntent } from './intents.js';
import { mycelialConductor } from './agents/conductor.js';
import { lichenArchivist } from './agents/archivist.js';
import { lamellaTallykeeper } from './agents/tallykeeper.js';
import { rhizomorphQuartermaster } from './agents/quartermaster.js';
import { saproprobeWarden } from './agents/warden.js';
import { sporocarpBroker } from './agents/broker.js';
import { adminTools } from './admin.js';
import { janitorAdapter } from './adapters/janitor.js';
import { lettaAdapter } from './adapters/letta.js';
import { mycelialSteward } from './adapters/mycelial-steward.js';
import normalizeLettaPatch from './adapters/letta_normalizer.js';
import { applyPatch } from './engine/apply_patch.js';
import { buildElderInput } from './engine/build_elder_input.js';
import { speakNPC, getStatus as getElderStatus } from './adapters/elder_adapter.js';
import { parseCommand } from './command_parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// HTTP Server
const server = createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: Date.now(),
      adapters: {
        janitor: janitorAdapter.getStatus(),
        letta: lettaAdapter.getStatus(),
        mycelialSteward: mycelialSteward.getStatus()
      },
      state: adminTools.getStateSummary()
    }));
    return;
  }

  // Status endpoint with detailed adapter info
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now()
      },
      adapters: {
        letta: mycelialSteward.getStatus(),
        janitor: janitorAdapter.getStatus(),
        elder: getElderStatus()
      },
      game: {
        players: gameState.players.size,
        memoryStones: gameState.canonRing.length,
        activeQuest: gameState.nowRing.activeQuest?.name || null,
        activeVote: gameState.nowRing.activeVote?.topic || null
      }
    }));
    return;
  }

  // Debug endpoint: GET /debug/env
  if (req.url === '/debug/env') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      LLM_MODE: process.env.LLM_MODE || null,
      LETTA_API_KEY: process.env.LETTA_API_KEY ? `****${process.env.LETTA_API_KEY.slice(-4)}` : null,
      LETTA_BASE_URL: process.env.LETTA_BASE_URL || 'https://api.letta.com',
      LETTA_AGENT_ID: process.env.LETTA_AGENT_ID || null,
      ELDER_PROVIDER: process.env.ELDER_PROVIDER || null,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `****${process.env.ANTHROPIC_API_KEY.slice(-4)}` : null
    }));
    return;
  }

  // Debug endpoint: GET /debug/letta-ping
  if (req.url === '/debug/letta-ping') {
    const pingLetta = async () => {
      try {
        const { getLettaClient, getLettaAgentId } = await import('./adapters/letta_client.js');
        
        // Get agent ID - will throw if missing
        const agentId = getLettaAgentId();
        
        // Get SDK client - will throw if missing API key
        const client = getLettaClient();
        
        // Try to retrieve agent info (lighter than sending a message)
        await client.agents.retrieve(agentId);
        
        return { ok: true };
      } catch (err) {
        // Return error info without exposing sensitive data
        const errorResponse = {
          ok: false,
          error: err.message
        };
        
        // Add status code if available
        if (err.statusCode || err.status) {
          errorResponse.status = err.statusCode || err.status;
        }
        
        return errorResponse;
      }
    };

    pingLetta()
      .then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      })
      .catch(error => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      });
    return;
  }

  // Debug endpoint: GET /debug/letta-last
  if (req.url === '/debug/letta-last') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      lastRequest: mycelialSteward.lastRequest,
      lastResponsePreview: mycelialSteward.lastResponsePreview,
      lastRun: mycelialSteward.lastRun
    }));
    return;
  }

  // Debug endpoint: GET /debug/last-elder
  if (req.url === '/debug/last-elder') {
    const lastElder = gameState.messages
      .filter(m => m.type === 'ELDER_SAY')
      .slice(-1)[0] || null;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: lastElder
    }));
    return;
  }

  // Debug endpoint: POST /debug/run-tick
  if (req.url === '/debug/run-tick' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : getDefaultTestPayload();
        const result = await runDebugTick(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Debug endpoint: GET /debug/routes
  if (req.url === '/debug/routes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { method: 'POST', path: '/api/chat' },
      { method: 'GET', path: '/api/feed' },
      { method: 'GET', path: '/api/state' },
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/status' },
      { method: 'GET', path: '/debug/env' },
      { method: 'GET', path: '/debug/letta-ping' },
      { method: 'GET', path: '/debug/letta-last' },
      { method: 'GET', path: '/debug/last-elder' },
      { method: 'POST', path: '/debug/run-tick' },
      { method: 'GET', path: '/debug/routes' }
    ]));
    return;
  }

  // API endpoint: POST /api/chat
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const result = await handleChatCommand(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
    return;
  }

  // API endpoint: GET /api/feed
  if (req.url.startsWith('/api/feed')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    
    const messages = gameState.messages.slice(-Math.min(limit, 100));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages }));
    return;
  }

  // API endpoint: GET /api/state
  if (req.url === '/api/state') {
    const quest = gameState.nowRing.activeQuest;
    const vote = gameState.nowRing.activeVote;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      players: gameState.players.size,
      stockpile: gameState.stockpile,
      quest: quest ? {
        name: quest.name,
        percent: quest.percent || 0,
        needs: quest.needs || []
      } : null,
      vote: vote ? {
        topic: vote.topic,
        tally: vote.tally || {},
        status: vote.status
      } : null,
      stones: gameState.canonRing.map(s => s.title)
    }));
    return;
  }

  // Serve frontend
  if (req.url === '/' || req.url === '/index.html') {
    try {
      const html = readFileSync(resolve(__dirname, '../web/index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (error) {
      res.writeHead(500);
      res.end('Error loading frontend');
    }
    return;
  }

  // Serve CSS
  if (req.url === '/style.css') {
    try {
      const css = readFileSync(resolve(__dirname, '../web/style.css'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(css);
    } catch (error) {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // Serve JavaScript
  if (req.url === '/app.js') {
    try {
      const js = readFileSync(resolve(__dirname, '../web/app.js'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(js);
    } catch (error) {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

// WebSocket Server
const wss = new WebSocketServer({ server });

// Track connected clients
const clients = new Map(); // ws -> { playerId, playerName }

// Broadcast to all clients
function broadcast(message, excludeWs = null) {
  const data = JSON.stringify(message);
  for (const [ws, client] of clients.entries()) {
    if (ws !== excludeWs && ws.readyState === 1) { // OPEN
      ws.send(data);
    }
  }
}

// Send to specific client
function sendToClient(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');

  // Generate temporary player ID
  const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  clients.set(ws, { playerId, playerName: null });

  // Send welcome message
  sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
    text: 'Welcome to Mushroom Village! Please introduce yourself.',
    timestamp: Date.now()
  }));

  // Send current state
  sendToClient(ws, createMessage(MessageType.STATE_UPDATE, {
    stones: gameState.getMemoryStones(),
    quest: rhizomorphQuartermaster.getQuestStatus(),
    vote: lamellaTallykeeper.getVoteStatus(),
    stockpile: gameState.stockpile,
    trades: sporocarpBroker.getOpenOffers()
  }));

  // Handle messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleClientMessage(ws, message);
    } catch (error) {
      console.error('Message handling error:', error);
      sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
        text: 'Error processing message',
        error: error.message
      }));
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    const client = clients.get(ws);
    console.log(`Player disconnected: ${client?.playerName || client?.playerId}`);
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle incoming client messages
async function handleClientMessage(ws, message) {
  const client = clients.get(ws);
  if (!client) return;

  // Handle player registration
  if (message.type === 'REGISTER') {
    const playerName = message.name || `Visitor${Math.floor(Math.random() * 1000)}`;
    client.playerName = playerName;

    // Create or get player
    let player = gameState.getPlayer(client.playerId);
    if (!player) {
      player = createPlayer(client.playerId, playerName);
      gameState.addPlayer(player);
    }

    sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
      text: `Welcome, ${playerName}! You are now part of the village.`,
      playerId: client.playerId,
      player
    }));

    broadcast(createMessage(MessageType.SYSTEM_NOTE, {
      text: `${playerName} has joined the village.`
    }), ws);

    return;
  }

  // Ensure player is registered
  if (!client.playerName) {
    sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
      text: 'Please register first by sending your name.'
    }));
    return;
  }

  // Handle user chat
  if (message.type === 'USER_CHAT') {
    await handleUserChat(ws, client, message.text);
    return;
  }

  // Handle admin commands
  if (message.type === 'ADMIN_COMMAND') {
    await handleAdminCommand(ws, client, message);
    return;
  }
}

// Handle user chat messages
async function handleUserChat(ws, client, text) {
  if (!text || typeof text !== 'string') return;

  // Safety check via Warden
  const safetyResult = saproprobeWarden.processSafetyCheck(client.playerId, { text });
  
  if (!safetyResult.allowed) {
    sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
      text: safetyResult.reason,
      type: 'warning'
    }));
    return;
  }

  if (safetyResult.warning) {
    sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
      text: safetyResult.warning,
      type: 'warning'
    }));
  }

  // Parse intent
  const intent = parseIntent(text);
  const valid = validateIntent(intent);

  if (!valid && intent.type !== IntentType.CHAT) {
    sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
      text: 'Invalid command. Try /gather moss, /vote option, etc.',
      type: 'error'
    }));
    return;
  }

  // Broadcast user message
  broadcast(createMessage(MessageType.USER_CHAT, {
    playerId: client.playerId,
    playerName: client.playerName,
    text,
    intent: intent.type,
    timestamp: Date.now()
  }));

  // Execute intent
  await executeIntent(ws, client, intent);

  // Check if Elder should respond
  const elderResponse = await mycelialConductor.processMessage({ text, intent }, client.playerId);
  
  if (elderResponse) {
    broadcast(createMessage(MessageType.ELDER_SAY, {
      text: elderResponse.text,
      trigger: elderResponse.trigger,
      timestamp: elderResponse.timestamp
    }));
  }
}

// Execute player intent
async function executeIntent(ws, client, intent) {
  const player = gameState.getPlayer(client.playerId);
  
  switch (intent.type) {
    case IntentType.GATHER: {
      const { item } = intent.params;
      const amount = Math.floor(Math.random() * 3) + 1; // 1-3 items
      
      gameState.updatePlayerInventory(client.playerId, item, amount);
      
      const action = createScratchAction(client.playerId, 'gather', `Gathered ${amount} ${item}`);
      gameState.addScratchAction(action);
      gameState.addRecentAction({ player: client.playerName, action: 'gather', item, amount });
      
      sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
        text: `You gathered ${amount} ${item}. Total: ${player.inventory[item]}`,
        type: 'success',
        inventory: player.inventory
      }));
      break;
    }

    case IntentType.GIFT: {
      const { targetPlayer, item, quantity } = intent.params;
      
      if (player.inventory[item] < quantity) {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: `You don't have enough ${item}. You have: ${player.inventory[item]}`,
          type: 'error'
        }));
        return;
      }

      // Find target player
      let target = null;
      for (const [pid, p] of gameState.players.entries()) {
        if (p.name.toLowerCase() === targetPlayer.toLowerCase()) {
          target = { id: pid, player: p };
          break;
        }
      }

      if (!target) {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: `Player "${targetPlayer}" not found.`,
          type: 'error'
        }));
        return;
      }

      gameState.updatePlayerInventory(client.playerId, item, -quantity);
      gameState.updatePlayerInventory(target.id, item, quantity);

      sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
        text: `You gifted ${quantity} ${item} to ${target.player.name}.`,
        type: 'success'
      }));

      broadcast(createMessage(MessageType.SYSTEM_NOTE, {
        text: `${client.playerName} gifted ${quantity} ${item} to ${target.player.name}.`
      }));
      break;
    }

    case IntentType.DONATE: {
      const result = rhizomorphQuartermaster.processDonation(
        client.playerId,
        intent.params.item,
        intent.params.quantity
      );

      if (result.success) {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: `You donated ${result.quantity} ${result.item} to the stockpile.`,
          type: 'success'
        }));

        broadcast(createMessage(MessageType.QUEST_STATUS, {
          quest: rhizomorphQuartermaster.getQuestStatus(),
          stockpile: gameState.stockpile
        }));
      } else {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: result.reason,
          type: 'error'
        }));
      }
      break;
    }

    case IntentType.OFFER: {
      const result = sporocarpBroker.createOffer(client.playerId, intent.params.give, intent.params.want);

      if (result.success) {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: `Trade offer posted: Give ${result.offer.give.qty} ${result.offer.give.item} for ${result.offer.want.qty} ${result.offer.want.item}`,
          type: 'success'
        }));

        broadcast(createMessage(MessageType.TRADE_STATUS, {
          offers: sporocarpBroker.getOpenOffers()
        }));
      } else {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: result.reason,
          type: 'error'
        }));
      }
      break;
    }

    case IntentType.ACCEPT: {
      const result = sporocarpBroker.acceptOffer(intent.params.offerId, client.playerId);

      if (result.success) {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: result.summary,
          type: 'success'
        }));

        broadcast(createMessage(MessageType.TRADE_STATUS, {
          offers: sporocarpBroker.getOpenOffers()
        }));
      } else {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: result.reason,
          type: 'error'
        }));
      }
      break;
    }

    case IntentType.VOTE: {
      const result = lamellaTallykeeper.castVote(client.playerId, intent.params.option);

      if (result.success) {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: `You voted for: ${intent.params.option}`,
          type: 'success'
        }));

        broadcast(createMessage(MessageType.VOTE_STATUS, {
          vote: lamellaTallykeeper.getVoteStatus()
        }));
      } else {
        sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
          text: result.reason,
          type: 'error'
        }));
      }
      break;
    }

    case IntentType.JOURNAL: {
      const entry = lichenArchivist.addJournal(client.playerId, intent.params.text);
      
      sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
        text: 'Your journal entry has been recorded.',
        type: 'success'
      }));
      break;
    }
  }
}

// Handle admin commands
async function handleAdminCommand(ws, client, message) {
  // Simple admin verification (in production, use proper auth)
  if (!message.passcode || !adminTools.verifyAdmin(message.passcode)) {
    sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
      text: 'Access denied',
      type: 'error'
    }));
    return;
  }

  const result = await adminTools[message.command](message.args);
  
  sendToClient(ws, createMessage(MessageType.SYSTEM_NOTE, {
    text: `Admin command executed: ${message.command}`,
    result,
    type: 'admin'
  }));

  // Broadcast state update
  broadcast(createMessage(MessageType.STATE_UPDATE, {
    stones: gameState.getMemoryStones(),
    quest: rhizomorphQuartermaster.getQuestStatus(),
    vote: lamellaTallykeeper.getVoteStatus(),
    stockpile: gameState.stockpile,
    trades: sporocarpBroker.getOpenOffers()
  }));
}

// Server tick orchestration with MycelialSteward
async function serverTick() {
  const tickId = `tick_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  
  try {
    // Build unified payload with prior quest percent
    const priorQuestPercent = gameState.nowRing.activeQuest?.percent || 0;
    
    const payload = {
      timestamp: Date.now(),
      players: Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        inventory: p.inventory,
        messageCount: p.messageCount || 0
      })),
      stockpile: gameState.stockpile,
      activeQuest: gameState.nowRing.activeQuest,
      activeVote: gameState.nowRing.activeVote,
      openOffers: sporocarpBroker.getOpenOffers(),
      memoryStones: gameState.getMemoryStones(),
      recentActions: gameState.nowRing.topRecentActions,
      journalQueue: lichenArchivist.getPendingJournals(),
      context: {
        messagesSincePulse: gameState.messagesSinceLastPulse,
        timeSincePulse: Date.now() - gameState.lastPulseTime,
        activeWarnings: Array.from(saproprobeWarden.warnings.entries()).map(([playerId, count]) => ({
          playerId,
          count
        })),
        priorQuestPercent
      }
    };

    console.log(`[${tickId}] Starting server tick - stones: ${payload.memoryStones.length}, players: ${payload.players.length}`);

    // Call sendTick to get raw patch
    const rawPatch = await mycelialSteward.sendTick(payload);

    // Build tick context for normalizer
    const tickContext = {
      distilledQuestion: null,
      journalsById: {}
    };
    
    // Build journals lookup map
    const pendingJournals = lichenArchivist.getPendingJournals();
    for (const journal of pendingJournals) {
      tickContext.journalsById[journal.id] = journal;
    }

    // Normalize patch
    const patch = normalizeLettaPatch(rawPatch, tickContext);

    // Apply patch to state
    const log = {
      warn: (msg) => console.warn(`[${tickId}] ${msg}`),
      info: (msg) => console.log(`[${tickId}] ${msg}`)
    };
    
    applyPatch(gameState, patch, { log });

    // Broadcast state updates after patch application
    broadcast(createMessage(MessageType.STATE_UPDATE, {
      stones: gameState.getMemoryStones(),
      quest: rhizomorphQuartermaster.getQuestStatus(),
      vote: lamellaTallykeeper.getVoteStatus(),
      stockpile: gameState.stockpile,
      trades: sporocarpBroker.getOpenOffers()
    }));

    // CADENCE: Trigger Elder if needed
    if (patch.cadence.shouldElderSpeak || patch.cadence.should_elder_speak) {
      const requestId = `elder_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      console.log(`[${tickId}] Cadence triggered: ${patch.cadence.triggerReason || patch.cadence.trigger_reason}`);
      console.log(`[Elder:${requestId}] Building Elder input bundle`);
      
      // Build Elder input
      const elderInput = buildElderInput(gameState, patch.cadence, {
        top_recent_actions: gameState.nowRing.topRecentActions,
        last_messages_summary: gameState.lastMessagesSummary || [],
        safety_notes: patch.safety?.notes_for_elder || null
      });

      try {
        const elderOutput = await speakNPC('elder_mycel', elderInput);
        
        // Validate + sanitize nudge
        let nudge = 'Next: Contribute one needed item.';
        if (elderOutput?.nudge && elderOutput.nudge.startsWith('Next:')) {
          nudge = elderOutput.nudge;
        }
        
        // Validate + sanitize text - ensure it ends with "Next:" line
        let text = elderOutput?.message_text || 'The village moves by gentle steps.';
        if (!text.includes('Next:')) {
          text = `${text}\n\n${nudge}`;
        }

        // Store telemetry
        gameState.resetPulseCounter();
        gameState.elderLastSpoke = Date.now();
        if (!gameState.elderTelemetry) {
          gameState.elderTelemetry = [];
        }
        gameState.elderTelemetry.push({
          timestamp: Date.now(),
          referenced_stones: elderOutput.referenced_stones,
          acknowledged_users: elderOutput.acknowledged_users,
          nudge
        });

        // Push into message history
        gameState.messages.push({
          type: 'ELDER_SAY',
          text,
          nudge,
          at: Date.now()
        });

        // Broadcast Elder message
        broadcast(createMessage(MessageType.ELDER_SAY, {
          text,
          trigger: patch.cadence.triggerReason || patch.cadence.trigger_reason || 'pulse',
          timestamp: Date.now()
        }));

        console.log(`[Elder:${requestId}] Success - Elder spoke`);
      } catch (error) {
        console.error(`[Elder:${requestId}] Error - ${error.message}`);
        
        // Fallback message
        const fallbackText = 'The village moves by gentle steps.\n\nNext: Contribute one needed item.';
        const fallbackNudge = 'Next: Contribute one needed item.';
        
        // Push into message history
        gameState.messages.push({
          type: 'ELDER_SAY',
          text: fallbackText,
          nudge: fallbackNudge,
          at: Date.now()
        });

        broadcast(createMessage(MessageType.ELDER_SAY, {
          text: fallbackText,
          trigger: 'fallback',
          timestamp: Date.now()
        }));

        console.log(`[Elder:${requestId}] Fallback message used`);
      }
    }

  } catch (error) {
    console.error(`[${tickId}] Server tick error:`, error);
    // Continue operation even if tick fails
  }
}

/**
 * Handle chat command from API
 */
async function handleChatCommand(data) {
  const { user, text } = data;
  
  // Validate inputs
  if (!user || !text || typeof user !== 'string' || typeof text !== 'string') {
    return { ok: false, error: 'Invalid input: user and text required' };
  }
  
  const trimmedUser = user.trim();
  const trimmedText = text.trim();
  
  if (!trimmedUser || !trimmedText) {
    return { ok: false, error: 'User and text cannot be empty' };
  }
  
  // Ensure player exists in state
  let player = gameState.getPlayer(trimmedUser);
  if (!player) {
    player = createPlayer(trimmedUser, trimmedUser);
    gameState.addPlayer(player);
  }
  
  // Parse command
  const parsed = parseCommand(trimmedText);
  
  // Handle invalid commands
  if (parsed.cmd === 'invalid') {
    return { ok: false, error: parsed.error };
  }
  
  // Apply immediate state mutations
  try {
    switch (parsed.cmd) {
      case 'gather': {
        const { item, qty } = parsed.args;
        gameState.updatePlayerInventory(trimmedUser, item, qty);
        break;
      }
      
      case 'donate': {
        const { item, qty } = parsed.args;
        const available = player.inventory[item] || 0;
        const actualQty = Math.min(qty, available);
        
        if (actualQty > 0) {
          gameState.updatePlayerInventory(trimmedUser, item, -actualQty);
          gameState.stockpile[item] = (gameState.stockpile[item] || 0) + actualQty;
        }
        break;
      }
      
      case 'offer': {
        const { give, want } = parsed.args;
        const offerId = `o${Date.now()}`;
        
        if (!gameState.nowRing.tradeBoard) {
          gameState.nowRing.tradeBoard = { offers: [], events: [] };
        }
        
        gameState.nowRing.tradeBoard.offers.push({
          id: offerId,
          from: trimmedUser,
          give,
          want,
          status: 'OPEN',
          createdAt: Date.now()
        });
        break;
      }
      
      case 'accept': {
        const { offerId } = parsed.args;
        
        if (!gameState.nowRing.tradeBoard) {
          gameState.nowRing.tradeBoard = { offers: [], events: [] };
        }
        
        gameState.nowRing.tradeBoard.events.push({
          type: 'accept',
          id: offerId,
          by: trimmedUser,
          at: Date.now()
        });
        break;
      }
      
      case 'vote': {
        const { option } = parsed.args;
        
        if (gameState.nowRing.activeVote) {
          if (!gameState.nowRing.activeVote.tally) {
            gameState.nowRing.activeVote.tally = {};
          }
          gameState.nowRing.activeVote.tally[trimmedUser] = option;
        }
        break;
      }
      
      case 'journal': {
        const { text: journalText } = parsed.args;
        const journalId = `j${Date.now()}`;
        
        lichenArchivist.addJournal(trimmedUser, journalText);
        break;
      }
      
      case 'chat':
        // No immediate mutation for plain chat
        break;
    }
  } catch (mutationError) {
    return { ok: false, error: `State mutation failed: ${mutationError.message}` };
  }
  
  // Append USER message to history
  gameState.messages.push({
    type: 'USER',
    user: trimmedUser,
    text: trimmedText,
    at: Date.now()
  });
  
  // Build tick payload from current state
  const payload = {
    timestamp: Date.now(),
    players: Array.from(gameState.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      inventory: p.inventory,
      messageCount: p.messageCount || 0
    })),
    stockpile: gameState.stockpile,
    activeQuest: gameState.nowRing.activeQuest,
    activeVote: gameState.nowRing.activeVote,
    openOffers: gameState.nowRing.tradeBoard?.offers || [],
    memoryStones: gameState.getMemoryStones(),
    recentActions: gameState.nowRing.topRecentActions || [],
    journalQueue: lichenArchivist.getPendingJournals(),
    context: {
      messagesSincePulse: gameState.messagesSinceLastPulse || 0,
      timeSincePulse: Date.now() - (gameState.lastPulseTime || Date.now()),
      activeWarnings: [],
      priorQuestPercent: gameState.nowRing.activeQuest?.percent || 0
    }
  };
  
  // Call Letta (LIVE if configured)
  const rawPatch = await mycelialSteward.sendTick(payload);
  
  // Build tick context for normalizer
  const tickContext = {
    distilledQuestion: parsed.cmd === 'chat' ? trimmedText : null,
    journalsById: {}
  };
  
  const pendingJournals = lichenArchivist.getPendingJournals();
  for (const journal of pendingJournals) {
    tickContext.journalsById[journal.id] = journal;
  }
  
  // Normalize patch
  const patch = normalizeLettaPatch(rawPatch, tickContext);
  
  // Apply patch to state
  const log = {
    warn: (msg) => console.warn(`[API:chat] ${msg}`),
    info: (msg) => console.log(`[API:chat] ${msg}`)
  };
  
  applyPatch(gameState, patch, { log });
  
  // Trigger Elder if needed
  if (patch.cadence?.shouldElderSpeak || patch.cadence?.should_elder_speak) {
    const elderInput = buildElderInput(gameState, patch.cadence, {
      top_recent_actions: gameState.nowRing.topRecentActions || [],
      last_messages_summary: gameState.messages.slice(-8).map(m => ({
        user: m.user || 'system',
        text: m.text,
        at: m.at
      })),
      safety_notes: patch.safety?.notes_for_elder || null
    });
    
    try {
      const elderOutput = await speakNPC('elder_mycel', elderInput);
      
      // Validate nudge
      let nudge = 'Next: Contribute one needed item.';
      if (elderOutput?.nudge && elderOutput.nudge.startsWith('Next:')) {
        nudge = elderOutput.nudge;
      }
      
      // Validate text
      let elderText = elderOutput?.message_text || 'The village moves by gentle steps.';
      if (!elderText.includes('Next:')) {
        elderText = `${elderText}\n\n${nudge}`;
      }
      
      // Push ELDER_SAY into messages
      gameState.messages.push({
        type: 'ELDER_SAY',
        text: elderText,
        nudge,
        at: Date.now()
      });
      
      // Increment elder request count
      const elderStatus = getElderStatus();
      if (!elderStatus.requestCount) {
        elderStatus.requestCount = 1;
      } else {
        elderStatus.requestCount++;
      }
      
    } catch (elderError) {
      console.warn(`[API:chat] Elder error: ${elderError.message}`);
      // Don't fail the whole request if Elder fails
    }
  }
  
  // Build response
  const quest = gameState.nowRing.activeQuest;
  const vote = gameState.nowRing.activeVote;
  const lastElder = gameState.messages.filter(m => m.type === 'ELDER_SAY').slice(-1)[0] || null;
  
  return {
    ok: true,
    state: {
      quest: quest ? {
        percent: quest.percent || 0,
        needs: quest.needs || []
      } : null,
      vote: vote ? {
        topic: vote.topic,
        tally: vote.tally || {},
        status: vote.status
      } : null,
      stockpile: gameState.stockpile
    },
    elder: lastElder
  };
}

/**
 * Get default test payload for debug endpoint
 */
function getDefaultTestPayload() {
  return {
    timestamp: Date.now(),
    players: [
      { id: 'lina', name: 'Lina', inventory: { moss: 2, cedar: 1, resin: 0, spores: 0, charms: 0 }, messageCount: 1 },
      { id: 'rowan', name: 'Rowan', inventory: { moss: 1, cedar: 2, resin: 1, spores: 0, charms: 0 }, messageCount: 1 }
    ],
    stockpile: { moss: 3, cedar: 2, resin: 1, spores: 0, charms: 0 },
    activeQuest: {
      id: 'q1',
      name: 'Bridge Across the Brook',
      recipe: { cedar: 3, resin: 2 },
      percent: 40
    },
    activeVote: {
      id: 'v1',
      topic: 'Bridge material',
      options: ['Moss Rope', 'Cedar Plank'],
      tally: { 'lina': 'Moss Rope', 'rowan': 'Cedar Plank' },
      closesAt: Date.now() + 60000,
      status: 'OPEN'
    },
    openOffers: [],
    memoryStones: gameState.getMemoryStones(),
    recentActions: [{ text: '@Lina asked about rope safety' }, { text: '@Rowan attempted a trade' }],
    journalQueue: [{ id: 'j12', playerId: 'lina', text: 'The brook teaches balance.', timestamp: Date.now() - 6000000 }],
    context: {
      messagesSincePulse: 2,
      timeSincePulse: 15000,
      activeWarnings: [],
      priorQuestPercent: 40
    }
  };
}

/**
 * Run debug tick - full loop: Letta → normalize → applyPatch → Elder
 */
async function runDebugTick(payload) {
  const tickId = `debug_${Date.now()}`;
  
  try {
    // Call Letta (LIVE if configured)
    const rawPatch = await mycelialSteward.sendTick(payload);

    // Build tick context for normalizer
    const tickContext = {
      distilledQuestion: 'Is moss rope safe in rain?',
      journalsById: {}
    };
    
    if (payload.journalQueue) {
      for (const journal of payload.journalQueue) {
        tickContext.journalsById[journal.id] = journal;
      }
    }

    // Normalize patch
    const patch = normalizeLettaPatch(rawPatch, tickContext);

    // Apply patch to state
    const log = {
      warn: (msg) => console.warn(`[${tickId}] ${msg}`),
      info: (msg) => console.log(`[${tickId}] ${msg}`)
    };
    
    applyPatch(gameState, patch, { log });

    // Call Elder if cadence says to
    let elderMessage = null;
    if (patch.cadence?.shouldElderSpeak || patch.cadence?.should_elder_speak) {
      const elderInput = buildElderInput(gameState, patch.cadence, {
        top_recent_actions: payload.recentActions?.map(a => a.text || String(a)) || [],
        last_messages_summary: ['Direct question about moss rope in rain', 'Vote 1–1 tie'],
        safety_notes: patch.safety?.notes_for_elder || null
      });

      try {
        const out = await speakNPC('elder_mycel', elderInput);
        
        // Validate + sanitize nudge
        let nudge = 'Next: Contribute one needed item.';
        if (out?.nudge && out.nudge.startsWith('Next:')) {
          nudge = out.nudge;
        }
        
        // Validate + sanitize text - ensure it ends with "Next:" line
        let text = out?.message_text || 'The village moves by gentle steps.';
        if (!text.includes('Next:')) {
          text = `${text}\n\n${nudge}`;
        }
        
        // Push into message history
        elderMessage = {
          type: 'ELDER_SAY',
          text,
          nudge,
          at: Date.now()
        };
        gameState.messages.push(elderMessage);
        
      } catch (error) {
        console.error(`[${tickId}] Elder error: ${error.message}`);
        // Fallback
        elderMessage = {
          type: 'ELDER_SAY',
          text: 'The village moves by gentle steps.\n\nNext: Contribute one needed item.',
          nudge: 'Next: Contribute one needed item.',
          at: Date.now()
        };
        gameState.messages.push(elderMessage);
      }
    }

    // Build response
    return {
      tickApplied: true,
      cadence: patch.cadence,
      vote: gameState.nowRing.activeVote,
      quest: {
        percent: gameState.nowRing.activeQuest?.percent || 0,
        needs: gameState.nowRing.activeQuest?.needs || []
      },
      trades: {
        open: gameState.getOpenOffers().length
      },
      stones: gameState.canonRing.map(s => s.title),
      elder: elderMessage
    };
  } catch (error) {
    console.error(`[${tickId}] Error:`, error);
    throw error;
  }
}

// Run server tick every 10 seconds
setInterval(serverTick, 10000);

// Start server
server.listen(PORT, () => {
  console.log(`🍄 Mushroom Village server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  
  // Log LLM Mode and API key status
  const llmMode = process.env.LLM_MODE || 'MOCK';
  const lettaKey = process.env.LETTA_API_KEY;
  const lettaKeyMasked = lettaKey ? `****${lettaKey.slice(-4)}` : 'not set';
  
  console.log(`🔧 LLM_MODE: ${llmMode}`);
  console.log(`🔑 LETTA_API_KEY: ${lettaKeyMasked}`);
  
  const stewardStatus = mycelialSteward.getStatus();
  console.log(`🍄 MycelialSteward: ${stewardStatus.mode}${stewardStatus.reason ? ` (${stewardStatus.reason})` : ''}`);
  
  const elderStatus = getElderStatus();
  console.log(`👴 Elder Provider: ${elderStatus.provider}`);
  
  console.log('');
  
  // Setup demo scenario
  adminTools.setupDemoScenario();
  console.log('✅ Demo scenario loaded');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
