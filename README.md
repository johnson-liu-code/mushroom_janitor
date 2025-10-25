# Mushroom Village

A minimal, demo-ready multiplayer chat app where Elder Mycel (an NPC) interacts with multiple users, and backstage agents manage logistics.

## Quick Start (Mock Mode)

```bash
# Install dependencies
npm install

# Run in development mode (with mock LLM)
npm run dev

# Open browser to http://localhost:3000
```

## Features

- **Elder Mycel**: NPC that responds to users via Janitor AI (or mock mode)
- **Logistics Agents**: Six Letta-powered agents managing backstage operations
- **Game Mechanics**: Gathering, trading, voting, quests, and memory stones
- **Real-time Updates**: WebSocket-based communication
- **Offline Demo**: Full mock mode when API keys are absent

## Project Structure

```
mushroom_janitor/
├── server/              # Backend server
│   ├── index.js        # HTTP + WebSocket server
│   ├── state.js        # In-memory state store
│   ├── intents.js      # Intent parsing
│   ├── cadence.js      # Elder scheduling
│   ├── admin.js        # Admin utilities
│   ├── types.js        # Type definitions
│   ├── agents/         # Backstage agents
│   └── adapters/       # API integrations
├── web/                # Frontend
│   ├── index.html      # Main page
│   ├── app.js          # Client logic
│   ├── ui/             # UI components
│   └── style.css       # Styling
├── prompts/            # System prompts
└── test/               # Unit tests
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Server
PORT=3000
NODE_ENV=development

# Mock mode (default)
LLM_MODE=MOCK

# Live mode (requires API keys)
# LLM_MODE=LIVE
# JANITOR_API_KEY=your_janitor_api_key
# LETTA_API_KEY=your_letta_api_key

# Prompt paths
ELDER_SYSTEM_PROMPT_PATH=./prompts/elder_voice_charter.txt
ARCHIVIST_PROMPT_PATH=./prompts/archivist_rules.txt
CADENCE_PROMPT_PATH=./prompts/cadence_card.txt
TALLYKEEPER_PROMPT_PATH=./prompts/tallykeeper_rules.txt
QUARTERMASTER_PROMPT_PATH=./prompts/quartermaster_rules.txt
WARDEN_PROMPT_PATH=./prompts/warden_rules.txt
BROKER_PROMPT_PATH=./prompts/broker_rules.txt

# Cadence settings
CADENCE_MESSAGE_THRESHOLD=5
CADENCE_TIME_THRESHOLD=30
```

## Running Locally

### Mock Mode (No API Keys Required)

```bash
npm install
npm run dev
```

Visit http://localhost:3000

### Live Mode (Requires API Keys)

1. Get API keys:
   - Janitor AI: https://janitorai.com
   - Letta: https://letta.ai

2. Update `.env`:
   ```bash
   LLM_MODE=LIVE
   JANITOR_API_KEY=your_key_here
   LETTA_API_KEY=your_key_here
   ```

3. Run:
   ```bash
   npm start
   ```

## Running on Replit

1. Fork this project on Replit
2. Set Secrets (Environment Variables):
   - `PORT`: 3000
   - `LLM_MODE`: MOCK (or LIVE)
   - Add API keys if using LIVE mode
3. Click "Run"
4. Replit will automatically handle WebSocket connections

### Replit Configuration

The `.replit` file is included with proper WebSocket support:
- Uses Node.js
- Exposes port 3000
- Handles WebSocket upgrade requests

## Game Commands

### Resource Management
- `/gather moss` - Gather moss
- `/gather cedar` - Gather cedar logs
- `/gather resin` - Gather tree resin
- `/gather spores` - Gather spores
- `/gift @username moss x5` - Gift 5 moss to a user
- `/donate moss x10` - Donate to village stockpile

### Trading
- `/offer give moss x5 for cedar x2` - Create trade offer
- `/accept offer123` - Accept a trade offer

### Voting
- `/vote option1` - Cast your vote

### Memory
- `/journal A wonderful day in the village` - Create a journal entry

### Natural Language
You can also chat naturally! The system attempts to extract intent:
- "I'd like to gather some moss" → parses as gather intent
- "I want to give Bob 3 cedar" → parses as gift intent

## API Endpoints

### HTTP Endpoints
- `GET /health` - Health check
- `GET /` - Serve frontend

### WebSocket
- `ws://localhost:3000/ws` - Main WebSocket connection

#### Message Types
- `USER_CHAT` - User sends a message
- `SYSTEM_NOTE` - System notification
- `ELDER_SAY` - Elder Mycel speaks
- `VOTE_STATUS` - Vote update
- `QUEST_STATUS` - Quest progress
- `TRADE_STATUS` - Trade board update
- `CHRONICLE_EXPORT` - Export game state

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Development with hot reload
npm run dev

# Production
npm start
```

## Testing

Run unit tests covering:
- Intent parsing
- Vote closure logic
- Trade resolution
- Cadence triggers

```bash
npm test
```

## Architecture

### Three Rings Model

1. **Canon Ring**: ≤12 Memory Stones (permanent village history)
2. **Now Ring**: Active quest, vote, recent actions
3. **Scratch Ring**: Last N actions with 5-10 minute TTL

### Agents (Backstage Only)

- **Mycelial Conductor**: Manages cadence and Elder responses
- **Lichen Archivist**: Promotes journals to Memory Stones
- **Lamella Tallykeeper**: Manages voting
- **Rhizomorph Quartermaster**: Tracks inventory and quests
- **Saproprobe Warden**: Safety and rate limiting
- **Sporocarp Broker**: Manages trading

Only Elder Mycel speaks to players. Agents coordinate backstage.

## Elder Mycel Behavior

- **Call-and-response**: Responds to direct questions/@mentions
- **Pulse**: Speaks after M messages or T seconds
- **Event interjection**: Speaks on vote close, quest threshold, or safety flag
- References 0-2 Memory Stones when relevant
- Acknowledges 1 player per message
- Ends with exactly one imperative next-action nudge

## Troubleshooting

### WebSocket Connection Issues
- Check if port 3000 is available
- On Replit, use the provided URL (not localhost)
- Ensure firewall allows WebSocket connections

### Mock Mode Not Working
- Verify `.env` has `LLM_MODE=MOCK`
- Check that prompt files exist in `/prompts/`

### Live Mode Fails
- System auto-falls back to MOCK on API errors
- Check API keys are correct
- Verify API endpoints are accessible

## Contributing

This is a demo project. Suggestions welcome!

## License

MIT
