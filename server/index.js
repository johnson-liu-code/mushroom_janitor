// Main server: HTTP + WebSocket
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
        letta: lettaAdapter.getStatus()
      },
      state: adminTools.getStateSummary()
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

// Periodic tasks
setInterval(() => {
  // Check vote expiry
  lamellaTallykeeper.checkVoteExpiry();
  
  // Clean stale offers
  sporocarpBroker.cleanStaleOffers();
  
  // Update quest progress
  rhizomorphQuartermaster.updateQuestProgress();
}, 10000); // Every 10 seconds

// Start server
server.listen(PORT, () => {
  console.log(`🍄 Mushroom Village server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🤖 LLM Mode: ${janitorAdapter.getStatus().active}`);
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
