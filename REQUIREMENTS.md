# Mushroom Village - Requirements Specification

## Document Information
- **Project**: Mushroom Village (Mushroom Janitor)
- **Version**: 1.0
- **Last Updated**: October 25, 2025
- **Status**: In Development

---

## 1. Executive Summary

Mushroom Village is a multiplayer chat-based game where players interact with Elder Mycel (an AI NPC) and participate in cooperative village activities. The system manages resources, trading, voting, quests, and shared memory through a coordinated backstage agent system.

### Key Objectives
- Create an engaging multiplayer social experience
- Demonstrate AI-powered NPC interaction
- Provide seamless gameplay in both MOCK and LIVE modes
- Enable real-time cooperation between players
- Maintain consistent game state across all clients

---

## 2. Functional Requirements

### 2.1 Player Management

#### FR-PM-001: Player Registration
**Priority**: CRITICAL  
**Description**: System shall automatically register new players when they connect via WebSocket.  
**Acceptance Criteria**:
- Each player receives a unique player ID
- Player name defaults to "Player_[ID]" if not provided
- Player state initializes with empty inventory
- System broadcasts player join to all connected clients

#### FR-PM-002: Player Inventory
**Priority**: CRITICAL  
**Description**: Each player shall maintain an individual inventory of resources.  
**Resources**: moss, cedar, resin, spores, charms  
**Acceptance Criteria**:
- Inventory quantities cannot be negative
- Inventory updates broadcast to player's client
- Inventory persists during session only (in-memory)

#### FR-PM-003: Player Activity Tracking
**Priority**: HIGH  
**Description**: System shall track player message count and recent actions.  
**Acceptance Criteria**:
- Message count increments per chat message
- Recent actions stored with timestamp
- Activity data used for cadence triggers and safety warnings

### 2.2 Resource Management

#### FR-RM-001: Resource Gathering
**Priority**: CRITICAL  
**Description**: Players shall gather resources using `/gather [resource]` command.  
**Resources**: moss, cedar, resin, spores  
**Acceptance Criteria**:
- Each gather yields 1-3 random units
- Gather action logged to player's recent actions
- Success message sent to player
- Inventory updated immediately

#### FR-RM-002: Resource Gifting
**Priority**: HIGH  
**Description**: Players shall gift resources to other players using `/gift @username [resource] x[amount]` command.  
**Acceptance Criteria**:
- Sender must have sufficient resources
- Recipient must be a valid, connected player
- Both inventories update atomically
- Action logged for both players
- Both players receive confirmation messages

#### FR-RM-003: Resource Donation
**Priority**: HIGH  
**Description**: Players shall donate resources to village stockpile using `/donate [resource] x[amount]` command.  
**Acceptance Criteria**:
- Player must have sufficient resources
- Player inventory decreases
- Village stockpile increases
- Donation logged to recent actions
- Quest progress may update

#### FR-RM-004: Village Stockpile
**Priority**: CRITICAL  
**Description**: System shall maintain a shared village stockpile of resources.  
**Acceptance Criteria**:
- Stockpile tracks moss, cedar, resin, spores, charms
- Stockpile visible to all players
- Stockpile used for quest progress calculation
- Stockpile cannot have negative values

### 2.3 Trading System

#### FR-TR-001: Trade Offer Creation
**Priority**: HIGH  
**Description**: Players shall create trade offers using `/offer give [resource] x[amount] for [resource] x[amount]` command.  
**Acceptance Criteria**:
- Offer includes unique ID, creator, give/want items, timestamp
- Offer visible on trade board to all players
- Maximum 10 active offers per player (configurable)
- Offer persists until accepted, cancelled, or expired

#### FR-TR-002: Trade Offer Acceptance
**Priority**: HIGH  
**Description**: Players shall accept trade offers using `/accept [offerId]` command.  
**Acceptance Criteria**:
- Acceptor must have sufficient resources (want items)
- Creator must still have sufficient resources (give items)
- Resources exchange atomically
- Both inventories update immediately
- Offer removed from trade board
- Both players receive confirmation

#### FR-TR-003: Trade Offer Cancellation
**Priority**: MEDIUM  
**Description**: System shall automatically cancel stale trade offers.  
**Acceptance Criteria**:
- Offers older than 1 hour auto-cancel (configurable)
- Creator receives cancellation notification
- Offer removed from trade board

#### FR-TR-004: Trade Consent Validation
**Priority**: HIGH  
**Description**: System shall validate trade consent before execution.  
**Acceptance Criteria**:
- Verify creator still has give items
- Verify acceptor has want items
- Prevent race conditions on concurrent accepts
- Log failed trade attempts

### 2.4 Voting System

#### FR-VT-001: Vote Creation
**Priority**: HIGH  
**Description**: System (Elder Mycel) shall create votes for village decisions.  
**Acceptance Criteria**:
- Vote includes unique ID, topic, options, timestamp
- Only one active vote at a time
- Vote duration specified at creation
- Vote visible to all players

#### FR-VT-002: Vote Casting
**Priority**: HIGH  
**Description**: Players shall cast votes using `/vote [option]` command.  
**Acceptance Criteria**:
- Each player may vote once per vote
- Vote counted in real-time
- Player receives confirmation
- Vote tally updates for all clients

#### FR-VT-003: Vote Closure
**Priority**: HIGH  
**Description**: System shall close votes based on quorum or time expiry.  
**Acceptance Criteria**:
- Vote closes when ≥50% of players have voted (quorum)
- Vote closes when duration expires
- Winning option determined by plurality
- Decision card generated with outcome
- Result announced to all players

#### FR-VT-004: Decision Card Generation
**Priority**: MEDIUM  
**Description**: System shall generate decision cards when votes close.  
**Acceptance Criteria**:
- Card includes topic, winner, summary, narrative
- Card added to game history
- Card influences future Elder responses

### 2.5 Quest System

#### FR-QS-001: Active Quest Management
**Priority**: HIGH  
**Description**: System shall maintain one active quest at a time.  
**Acceptance Criteria**:
- Quest includes ID, name, recipe (required resources)
- Quest progress calculated from stockpile vs recipe
- Progress percentage displayed to players
- Quest completion triggers celebration

#### FR-QS-002: Quest Progress Calculation
**Priority**: HIGH  
**Description**: System shall calculate quest progress as (current/required) percentage.  
**Acceptance Criteria**:
- Formula: sum(stockpile[item]/recipe[item]) / recipe.length
- Progress updates when stockpile changes
- Progress capped at 100%
- Progress visible to all players

#### FR-QS-003: Quest Completion
**Priority**: HIGH  
**Description**: System shall handle quest completion when progress reaches 100%.  
**Acceptance Criteria**:
- Stockpile resources consumed per recipe
- Quest marked as complete
- Celebration message broadcast
- New quest may be generated

### 2.6 Memory & Archive System

#### FR-MA-001: Journal Entries
**Priority**: MEDIUM  
**Description**: Players shall create journal entries using `/journal [text]` command.  
**Acceptance Criteria**:
- Journal entry includes ID, player ID, text, timestamp
- Entry added to journal queue
- Entry visible to player immediately
- Maximum 100 queued journals (configurable)

#### FR-MA-002: Memory Stone Promotion
**Priority**: MEDIUM  
**Description**: System shall promote worthy journals to Memory Stones.  
**Acceptance Criteria**:
- Journals older than 5 minutes eligible for promotion
- Lichen Archivist evaluates journal quality/relevance
- Promoted journals become permanent Memory Stones
- Memory Stone includes title, text, tags
- Memory Stones visible to all players

#### FR-MA-003: Memory Stone Cap
**Priority**: MEDIUM  
**Description**: System shall maintain maximum of 12 Memory Stones (Canon Ring).  
**Acceptance Criteria**:
- When >12 stones exist, oldest stone pruned
- Pruned stone logged to history
- Canon Ring represents village's collective memory
- Elder Mycel references 0-2 stones per response

#### FR-MA-004: Recent Actions Ring
**Priority**: MEDIUM  
**Description**: System shall maintain a ring of recent player actions (Now Ring).  
**Acceptance Criteria**:
- Recent actions include player ID, action type, text, timestamp
- Maximum 20 actions stored (configurable)
- Actions have 5-10 minute TTL (Scratch Ring)
- Actions used for context in Elder responses

### 2.7 Elder Mycel (NPC) Behavior

#### FR-EM-001: Call-and-Response
**Priority**: CRITICAL  
**Description**: Elder Mycel shall respond to direct questions and @mentions.  
**Acceptance Criteria**:
- Detects @mentions or questions directed at Elder
- Responds within reasonable time (<3 seconds MOCK, <5 seconds LIVE)
- Response references player who asked
- Response style consistent with Elder voice charter

#### FR-EM-002: Pulse Cadence
**Priority**: HIGH  
**Description**: Elder Mycel shall speak periodically based on message/time thresholds.  
**Acceptance Criteria**:
- Speaks after M messages (default: 5, configurable)
- Speaks after T seconds (default: 30, configurable)
- Pulse resets after Elder speaks
- Cadence adjustable via environment variables

#### FR-EM-003: Event Interjections
**Priority**: HIGH  
**Description**: Elder Mycel shall interject on significant game events.  
**Events**: Vote close, quest milestone, safety warning  
**Acceptance Criteria**:
- Vote close triggers Elder commentary
- Quest progress >25%, 50%, 75%, 100% triggers Elder
- Safety warnings trigger Elder guidance
- Event interjections don't reset pulse cadence

#### FR-EM-004: Memory Stone References
**Priority**: MEDIUM  
**Description**: Elder Mycel shall reference 0-2 Memory Stones per response when relevant.  
**Acceptance Criteria**:
- References selected based on topic relevance
- References woven naturally into response
- Tags used for stone selection
- No more than 2 stones per response

#### FR-EM-005: Next-Action Nudge
**Priority**: MEDIUM  
**Description**: Elder Mycel shall end each message with exactly one imperative next-action nudge.  
**Acceptance Criteria**:
- Nudge encourages specific player action
- Nudge contextually relevant to conversation
- Nudge phrased as imperative command
- Only one nudge per message

### 2.8 Safety & Moderation

#### FR-SF-001: Rate Limiting
**Priority**: HIGH  
**Description**: System shall track and warn players who message too frequently.  
**Acceptance Criteria**:
- Players with >10 messages in short period flagged
- Warning issued via Elder Mycel
- Persistent offenders may be rate-limited
- Warning count tracked per player

#### FR-SF-002: Content Filtering
**Priority**: MEDIUM  
**Description**: System shall flag inappropriate content.  
**Acceptance Criteria**:
- Basic profanity filter applied
- Spam detection for repeated messages
- Warnings logged for review
- Severe violations may block player

#### FR-SF-003: Safety Warnings
**Priority**: MEDIUM  
**Description**: Saproprobe Warden shall issue safety warnings.  
**Acceptance Criteria**:
- Warnings include player ID, reason, action type
- Action types: "warn", "block"
- Warnings logged to game state
- Players may appeal warnings

---

## 3. Non-Functional Requirements

### 3.1 Performance

#### NFR-PF-001: Response Time
**Priority**: HIGH  
**MOCK Mode**: <100ms for all operations  
**LIVE Mode**: <5 seconds for Elder responses  
**Acceptance Criteria**:
- Server tick completes in <500ms
- WebSocket messages processed immediately
- UI updates reflect within 100ms

#### NFR-PF-002: Concurrent Users
**Priority**: MEDIUM  
**Target**: Support 10-50 concurrent players  
**Acceptance Criteria**:
- No degradation with 10 players
- Acceptable performance with 50 players
- Graceful handling of 100+ players

#### NFR-PF-003: API Rate Limits
**Priority**: HIGH  
**Description**: System shall respect external API rate limits.  
**Acceptance Criteria**:
- Janitor AI: Max 60 requests/minute
- Letta API: Max 100 requests/minute
- Auto-fallback to MOCK on rate limit errors
- Exponential backoff on failures

### 3.2 Reliability

#### NFR-RL-001: Uptime
**Priority**: HIGH  
**Target**: 99% uptime during active sessions  
**Acceptance Criteria**:
- Graceful handling of API failures
- Auto-recovery from WebSocket disconnects
- State persistence during server restarts

#### NFR-RL-002: Fault Tolerance
**Priority**: CRITICAL  
**Description**: System shall continue operating when external APIs fail.  
**Acceptance Criteria**:
- Auto-fallback to MOCK mode on API errors
- Error logged but game continues
- Status endpoint reports health degradation
- No data loss on API failures

#### NFR-RL-003: Data Consistency
**Priority**: CRITICAL  
**Description**: Game state shall remain consistent across all operations.  
**Acceptance Criteria**:
- Atomic updates to shared resources
- No race conditions on concurrent trades
- State snapshots consistent at all times
- Clients eventually consistent with server

### 3.3 Usability

#### NFR-US-001: Ease of Setup
**Priority**: HIGH  
**Description**: Developers shall set up project in <5 minutes.  
**Acceptance Criteria**:
- `npm install && npm run dev` sufficient for MOCK mode
- Clear `.env.example` template provided
- README includes quick start guide
- Works on Windows, Mac, Linux

#### NFR-US-002: Command Discovery
**Priority**: MEDIUM  
**Description**: Players shall easily discover available commands.  
**Acceptance Criteria**:
- Help command lists all commands
- Elder Mycel suggests commands contextually
- Error messages guide to correct syntax
- Natural language parsing as fallback

#### NFR-US-003: Visual Clarity
**Priority**: MEDIUM  
**Description**: UI shall clearly distinguish message types.  
**Acceptance Criteria**:
- Elder messages visually distinct
- System notifications clearly labeled
- Player messages show sender name
- Timestamps visible on all messages

### 3.4 Security

#### NFR-SC-001: Input Validation
**Priority**: HIGH  
**Description**: All user inputs shall be validated and sanitized.  
**Acceptance Criteria**:
- Command parameters validated before execution
- Resource quantities checked for integer overflow
- Player names sanitized for XSS
- Trade amounts validated for negativity

#### NFR-SC-002: API Key Protection
**Priority**: CRITICAL  
**Description**: API keys shall never be exposed to clients.  
**Acceptance Criteria**:
- Keys stored in environment variables only
- Keys never logged or transmitted
- Keys not included in client bundles
- `.env` in `.gitignore`

#### NFR-SC-003: WebSocket Security
**Priority**: MEDIUM  
**Description**: WebSocket connections shall be reasonably secure.  
**Acceptance Criteria**:
- Origin validation on connection
- Rate limiting per connection
- Disconnection on malformed messages
- Connection limits per IP (future)

### 3.5 Maintainability

#### NFR-MT-001: Code Quality
**Priority**: MEDIUM  
**Description**: Codebase shall be clean and well-documented.  
**Acceptance Criteria**:
- JSDoc comments on public functions
- README explains architecture
- Consistent code style
- No dead code

#### NFR-MT-002: Test Coverage
**Priority**: MEDIUM  
**Target**: >70% unit test coverage for core logic  
**Acceptance Criteria**:
- All agents have unit tests
- Command parser tested
- State management tested
- Integration tests for critical flows

#### NFR-MT-003: Logging
**Priority**: HIGH  
**Description**: System shall log important events for debugging.  
**Acceptance Criteria**:
- Error logs include stack traces
- Info logs for major events
- Debug logs toggleable
- Logs include timestamps and context

---

## 4. Game Mechanics Requirements

### 4.1 Three Rings Model

#### GM-3R-001: Canon Ring (Memory Stones)
**Capacity**: ≤12 Memory Stones  
**Persistence**: Permanent (session-only in current implementation)  
**Purpose**: Village's collective long-term memory  
**Management**: Lichen Archivist promotes journals, prunes oldest when >12

#### GM-3R-002: Now Ring (Active State)
**Contents**: Active quest, active vote, recent actions (last 20)  
**Persistence**: Session-only  
**Purpose**: Current village context and activity  
**Management**: Updated real-time by all agents

#### GM-3R-003: Scratch Ring (Recent Actions)
**Capacity**: Last 20 actions  
**TTL**: 5-10 minutes per action  
**Purpose**: Short-term context for Elder responses  
**Management**: FIFO queue, oldest actions pruned

### 4.2 Resource Economy

#### GM-RE-001: Resource Types
**Resources**: moss, cedar, resin, spores, charms  
**Purpose**: 
- moss, cedar, resin, spores: Gathered and traded
- charms: Special items from completed quests

#### GM-RE-002: Gathering Rates
**Range**: 1-3 units per `/gather` command  
**Distribution**: Uniform random  
**Cooldown**: None (rate limit via Warden)

#### GM-RE-003: Trade Mechanics
**Offer Lifetime**: 1 hour (configurable)  
**Acceptance**: First-come-first-served  
**Validation**: Consent-based (both parties must have resources)

### 4.3 Quest Mechanics

#### GM-QM-001: Quest Generation
**Trigger**: Quest completion or Elder decision  
**Recipe**: 3-5 different resources, 10-50 units each  
**Difficulty**: Scales with village size

#### GM-QM-002: Progress Tracking
**Formula**: `Σ(stockpile[item] / recipe[item]) / recipe.length * 100`  
**Display**: Percentage shown to all players  
**Milestones**: 25%, 50%, 75%, 100%

#### GM-QM-003: Completion Rewards
**Stockpile**: Resources consumed per recipe  
**Charm**: 1 charm awarded to village  
**Celebration**: Elder announces completion  
**New Quest**: May trigger immediately or after delay

### 4.4 Voting Mechanics

#### GM-VM-001: Vote Triggers
**Sources**: Elder decision, player request, scheduled events  
**Topics**: New quest, village rule, resource allocation  
**Options**: 2-5 choices per vote

#### GM-VM-002: Vote Resolution
**Quorum**: ≥50% of active players (configurable)  
**Timeout**: Configurable per vote (default 5 minutes)  
**Winner**: Plurality (most votes)  
**Ties**: Elder breaks tie

#### GM-VM-003: Decision Impact
**Quest Votes**: Determines next quest recipe  
**Rule Votes**: Adjusts game parameters  
**Allocation Votes**: Distributes stockpile resources

---

## 5. API Requirements

### 5.1 WebSocket API

#### API-WS-001: Connection Endpoint
**URL**: `ws://[host]:[port]/ws`  
**Protocol**: WebSocket (RFC 6455)  
**Authentication**: None (public demo)

#### API-WS-002: Message Format
**Envelope**:
```json
{
  "type": "MESSAGE_TYPE",
  "payload": { /* type-specific data */ }
}
```

#### API-WS-003: Client → Server Messages
**Types**:
- `USER_CHAT`: Player sends message
  ```json
  {
    "type": "USER_CHAT",
    "payload": {
      "playerId": "uuid",
      "message": "string"
    }
  }
  ```

#### API-WS-004: Server → Client Messages
**Types**:
- `SYSTEM_NOTE`: System notification
- `ELDER_SAY`: Elder Mycel speaks
- `VOTE_STATUS`: Vote created/updated/closed
- `QUEST_STATUS`: Quest progress update
- `TRADE_STATUS`: Trade board update
- `INVENTORY_UPDATE`: Player inventory change
- `CHRONICLE_EXPORT`: Full state snapshot

### 5.2 HTTP API

#### API-HTTP-001: Health Check
**Endpoint**: `GET /health`  
**Response**:
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": 1234567890,
  "adapters": {
    "janitor": { "mode": "MOCK", "healthy": true },
    "letta": { "mode": "LIVE", "healthy": false, "last_error": "..." },
    "mycelialSteward": { "mode": "MOCK", "healthy": true }
  }
}
```

#### API-HTTP-002: Static Assets
**Endpoint**: `GET /`  
**Response**: Serves `web/index.html`

**Endpoint**: `GET /app.js`  
**Response**: Serves `web/app.js`

**Endpoint**: `GET /style.css`  
**Response**: Serves `web/style.css`

### 5.3 External API Integration

#### API-EXT-001: Janitor AI Integration
**Base URL**: Configured via environment  
**Authentication**: API key in headers  
**Endpoints**: `/chat` (Elder responses)  
**Rate Limit**: 60 requests/minute

#### API-EXT-002: Letta Integration
**Base URL**: Configured via environment  
**Authentication**: API key in headers  
**Endpoints**: Various (agent-specific)  
**Rate Limit**: 100 requests/minute

#### API-EXT-003: Fallback Behavior
**Trigger**: API error, timeout, rate limit  
**Action**: Log error, set health degraded, use MOCK mode  
**Recovery**: Automatic retry with exponential backoff

---

## 6. Data Requirements

### 6.1 Game State Schema

#### DR-GS-001: Core State Structure
```javascript
{
  players: Map<playerId, {
    id: string,
    name: string,
    inventory: { moss, cedar, resin, spores, charms },
    messageCount: number,
    connectedAt: timestamp
  }>,
  
  stockpile: { moss, cedar, resin, spores, charms },
  
  activeQuest: {
    id: string,
    name: string,
    recipe: { moss: number, cedar: number, ... },
    percentComplete: number,
    createdAt: timestamp
  } | null,
  
  activeVote: {
    id: string,
    topic: string,
    options: string[],
    tally: Map<option, count>,
    votedPlayers: Set<playerId>,
    closesAt: timestamp,
    status: "open" | "closed"
  } | null,
  
  openOffers: [{
    id: string,
    fromPlayer: playerId,
    give: { resource: string, amount: number },
    want: { resource: string, amount: number },
    createdAt: timestamp
  }],
  
  memoryStones: [{
    id: string,
    title: string,
    text: string,
    tags: string[],
    createdAt: timestamp
  }],
  
  recentActions: [{
    playerId: string,
    action: string,
    text: string,
    timestamp: number
  }],
  
  journalQueue: [{
    id: string,
    playerId: string,
    text: string,
    timestamp: number
  }]
}
```

#### DR-GS-002: State Persistence
**Storage**: In-memory (current implementation)  
**Future**: Database persistence (Redis, PostgreSQL)  
**Backup**: Manual export via `/export` command

#### DR-GS-003: State Validation
**Invariants**:
- Player inventories never negative
- Stockpile never negative
- Memory stones ≤12
- Only one active quest at a time
- Only one active vote at a time

### 6.2 Configuration Data

#### DR-CF-001: Environment Variables
**Required**:
- `PORT`: Server port
- `NODE_ENV`: development | production

**Optional**:
- `LLM_MODE`: MOCK | LIVE
- `JANITOR_API_KEY`: Janitor AI key
- `LETTA_API_KEY`: Letta API key
- Prompt file paths
- Cadence thresholds

#### DR-CF-002: Prompt Templates
**Location**: `./prompts/`  
**Format**: Plain text  
**Files**:
- `elder_voice_charter.txt`: Elder Mycel personality
- `archivist_rules.txt`: Journal evaluation
- `broker_rules.txt`: Trade management
- `quartermaster_rules.txt`: Resource tracking
- `tallykeeper_rules.txt`: Vote management
- `warden_rules.txt`: Safety rules
- `cadence_card.txt`: Pulse triggers
- `mycelial_steward.txt`: Unified orchestration

---

## 7. Integration Requirements

### 7.1 Third-Party Services

#### INT-TP-001: Janitor AI
**Purpose**: Elder Mycel NPC responses  
**Dependency Level**: Optional (fallback to MOCK)  
**Configuration**: API key, base URL  
**Failure Mode**: Auto-fallback to MOCK

#### INT-TP-002: Letta AI
**Purpose**: Backstage agent orchestration  
**Dependency Level**: Optional (fallback to MOCK)  
**Configuration**: API key, base URL  
**Failure Mode**: Auto-fallback to MOCK

### 7.2 Deployment Platforms

#### INT-DP-001: Local Development
**Requirements**: Node.js 16+, npm  
**Commands**: `npm install`, `npm run dev`  
**Features**: Hot reload, MOCK mode default

#### INT-DP-002: Replit Deployment
**Requirements**: .replit configuration  
**Features**: Automatic WebSocket support, secrets management  
**Limitations**: Free tier resource constraints

#### INT-DP-003: Production Deployment
**Requirements**: Node.js 16+, reverse proxy for WebSocket  
**Recommendations**: PM2 for process management, nginx for proxy  
**Monitoring**: Health endpoint, log aggregation

---

## 8. Testing Requirements

### 8.1 Unit Testing

#### TEST-UT-001: Intent Parsing
**Coverage**: All command types  
**Test Cases**:
- Valid command parsing
- Invalid syntax handling
- Natural language extraction
- Edge cases (empty, malformed)

#### TEST-UT-002: State Management
**Coverage**: All state mutations  
**Test Cases**:
- Resource transfers (gift, donate, trade)
- Inventory validation
- Concurrent modification safety
- State consistency checks

#### TEST-UT-003: Agent Logic
**Coverage**: All backstage agents  
**Test Cases**:
- Archivist journal promotion
- Broker trade resolution
- Quartermaster quest progress
- Tallykeeper vote closure
- Warden safety warnings
- Conductor cadence triggers

### 8.2 Integration Testing

#### TEST-IT-001: WebSocket Communication
**Scenarios**:
- Player connect/disconnect
- Message broadcast
- State synchronization
- Error handling

#### TEST-IT-002: API Fallback
**Scenarios**:
- Janitor API failure → MOCK
- Letta API failure → MOCK
- Timeout handling
- Rate limit handling

#### TEST-IT-003: Multi-Player Scenarios
**Scenarios**:
- Concurrent trading
- Simultaneous voting
- Race condition handling
- State consistency

### 8.3 End-to-End Testing

#### TEST-E2E-001: Complete Game Flow
**Scenario**: New player joins → gathers → trades → votes → completes quest  
**Validation**: All state updates correct, Elder responds appropriately

#### TEST-E2E-002: Stress Testing
**Scenario**: 50 concurrent players, high message rate  
**Validation**: No crashes, acceptable performance, state consistency

---

## 9. Acceptance Criteria

### 9.1 Minimum Viable Product (MVP)

#### AC-MVP-001: Core Gameplay
- [x] Players can connect and chat
- [x] Elder Mycel responds in MOCK mode
- [x] Players can gather resources
- [x] Players can gift/donate resources
- [x] Village stockpile tracks resources
- [x] Basic trading works (offer, accept)
- [x] Voting works (create, vote, close)
- [x] Quest progress displayed
- [x] Memory stones display

#### AC-MVP-002: Technical Foundation
- [x] WebSocket server stable
- [x] State management consistent
- [x] MOCK mode fully functional
- [x] Unit tests passing
- [x] Health endpoint works
- [x] Deployed on Replit successfully

### 9.2 Version 1.0 Release

#### AC-V1-001: Enhanced Features
- [x] LIVE mode with Janitor AI
- [x] Backstage agents in LIVE mode
- [x] MycelialSteward orchestration
- [ ] Quest completion rewards
- [ ] Advanced trade filtering
- [ ] Player reputation system

#### AC-V1-002: Polish
- [ ] Improved UI/UX
- [ ] Better error messages
- [ ] Command autocomplete
- [ ] Mobile-responsive design
- [ ] Accessibility features

#### AC-V1-003: Documentation
- [x] README complete
- [x] API documentation
- [x] Requirements specification (this document)
- [ ] Player guide/tutorial
- [ ] Developer onboarding guide

---

## 10. Future Enhancements

### 10.1 Planned Features (Version 2.0)

#### FE-V2-001: Persistence
- Database integration (PostgreSQL or Redis)
- Player accounts and authentication
- Persistent memory stones across sessions
- Historical game data and analytics

#### FE-V2-002: Advanced Gameplay
- Multiple concurrent quests
- Quest difficulty tiers
- Seasonal events
- Achievements and badges
- Leaderboards

#### FE-V2-003: Social Features
- Player profiles
- Private messaging
- Guilds/teams
- Mentorship system
- Community moderation tools

#### FE-V2-004: Technical Improvements
- Horizontal scaling (multiple server instances)
- Advanced caching strategies
- GraphQL API option
- Mobile apps (iOS/Android)
- Desktop client (Electron)

### 10.2 Research Topics

#### FE-RT-001: AI/ML Enhancements
- Adaptive difficulty based on player behavior
- Sentiment analysis for safety
- Predictive resource recommendations
- Personalized Elder responses

#### FE-RT-002: Game Theory
- Economic balancing algorithms
- Trade market dynamics
- Voting system game theory
- Cooperative incentive structures

---

## 11. Success Metrics

### 11.1 Technical Metrics
- **Uptime**: >99% during active hours
- **Response Time**: <100ms (MOCK), <5s (LIVE)
- **Error Rate**: <1% of all operations
- **Test Coverage**: >70% for core logic

### 11.2 User Engagement Metrics
- **Daily Active Players**: Target 20-50
- **Session Length**: Average 15-30 minutes
- **Message Rate**: 2-5 messages/minute per player
- **Return Rate**: >60% of players return within 24 hours

### 11.3 Game Balance Metrics
- **Resource Distribution**: No single player controls >30% of resources
- **Trade Velocity**: Average 5-10 trades/hour with active players
- **Vote Participation**: >70% of players vote when prompted
- **Quest Completion Time**: 30-60 minutes average per quest

---

## 12. Constraints & Assumptions

### 12.1 Technical Constraints

#### CON-TC-001: In-Memory State
**Constraint**: All game state stored in server memory  
**Impact**: State lost on server restart  
**Mitigation**: Manual export/import commands for demos  
**Future**: Database persistence layer

#### CON-TC-002: Single Server Instance
**Constraint**: No horizontal scaling support  
**Impact**: Limited to one server process  
**Mitigation**: Vertical scaling, process management  
**Future**: Distributed architecture with Redis

#### CON-TC-003: WebSocket Only
**Constraint**: Real-time communication requires WebSocket  
**Impact**: No HTTP polling fallback  
**Mitigation**: Clear error messages for WebSocket failures  
**Future**: Server-Sent Events fallback

### 12.2 Business Constraints

#### CON-BC-001: Demo/Prototype Focus
**Constraint**: Primary goal is demonstration, not production  
**Impact**: Limited features, no monetization  
**Scope**: Educational and portfolio purposes

#### CON-BC-002: API Cost Management
**Constraint**: External API usage may incur costs  
**Impact**: LIVE mode usage should be monitored  
**Mitigation**: MOCK mode as default, rate limiting

#### CON-BC-003: Open Source
**Constraint**: Code publicly available (MIT license)  
**Impact**: No proprietary features or secrets in code  
**Security**: API keys via environment variables only

### 12.3 Design Assumptions

#### ASM-DS-001: Cooperative Players
**Assumption**: Players generally cooperative, not adversarial  
**Justification**: Target audience is demo viewers and testers  
**Risk**: Griefing possible, moderation tools minimal

#### ASM-DS-002: Small Player Count
**Assumption**: Typical session has 5-20 concurrent players  
**Justification**: Demo/prototype scale  
**Risk**: Performance issues if exceeded

#### ASM-DS-003: Short Sessions
**Assumption**: Most play sessions <1 hour  
**Justification**: Casual gameplay style  
**Risk**: In-memory state loss acceptable for demos

#### ASM-DS-004: Modern Browsers
**Assumption**: Players use modern browsers (Chrome, Firefox, Safari, Edge)  
**Justification**: WebSocket and ES6+ required  
**Risk**: No IE11 or legacy browser support

---

## 13. Risk Assessment

### 13.1 Technical Risks

#### RISK-T-001: API Availability
**Risk**: Janitor AI or Letta API unavailable  
**Probability**: MEDIUM  
**Impact**: HIGH  
**Mitigation**: MOCK mode fallback, health monitoring  
**Contingency**: Game fully playable in MOCK mode

#### RISK-T-002: State Loss
**Risk**: Server crash loses all game state  
**Probability**: LOW-MEDIUM  
**Impact**: MEDIUM  
**Mitigation**: Regular state export reminders  
**Contingency**: Players understand demo nature

#### RISK-T-003: WebSocket Instability
**Risk**: Network issues cause frequent disconnects  
**Probability**: MEDIUM  
**Impact**: MEDIUM  
**Mitigation**: Auto-reconnect logic, connection status UI  
**Contingency**: Manual reconnect instructions

#### RISK-T-004: Concurrent Modification Bugs
**Risk**: Race conditions on trades or votes  
**Probability**: LOW  
**Impact**: HIGH  
**Mitigation**: Atomic operations, validation checks, unit tests  
**Contingency**: Manual state correction by admin

### 13.2 User Experience Risks

#### RISK-UX-001: Elder Response Quality
**Risk**: AI responses inappropriate or nonsensical  
**Probability**: LOW-MEDIUM (LIVE mode)  
**Impact**: MEDIUM  
**Mitigation**: System prompts, fallback to MOCK, content filtering  
**Contingency**: Admin can manually inject messages

#### RISK-UX-002: Learning Curve
**Risk**: New players confused by commands  
**Probability**: MEDIUM  
**Impact**: MEDIUM  
**Mitigation**: Help command, Elder tutorials, clear error messages  
**Contingency**: Tutorial mode or onboarding flow

#### RISK-UX-003: Player Isolation
**Risk**: Players feel ignored if Elder doesn't respond  
**Probability**: MEDIUM  
**Impact**: LOW  
**Mitigation**: Cadence system ensures regular Elder pulses  
**Contingency**: Adjust cadence thresholds

### 13.3 Project Risks

#### RISK-P-001: Scope Creep
**Risk**: Feature requests exceed MVP scope  
**Probability**: HIGH  
**Impact**: HIGH  
**Mitigation**: Clear MVP definition, prioritization framework  
**Contingency**: Defer features to v2.0

#### RISK-P-002: API Cost Overrun
**Risk**: LIVE mode usage exceeds budget  
**Probability**: LOW  
**Impact**: MEDIUM  
**Mitigation**: Rate limiting, MOCK mode default, usage monitoring  
**Contingency**: Disable LIVE mode temporarily

---

## 14. Compliance & Ethics

### 14.1 Data Privacy

#### COMP-DP-001: No Personal Data Collection
**Requirement**: System collects no personal information  
**Implementation**: No email, no passwords, no tracking  
**Compliance**: GDPR/CCPA not applicable (no PII)

#### COMP-DP-002: Session-Only Storage
**Requirement**: All data in-memory, deleted on server restart  
**Implementation**: No databases, no persistent logs with user data  
**Transparency**: Users informed of session-only nature

#### COMP-DP-003: No Third-Party Tracking
**Requirement**: No analytics or tracking scripts  
**Implementation**: Pure WebSocket communication, no cookies  
**Privacy**: Maximum user privacy preserved

### 14.2 AI Ethics

#### COMP-AI-001: Transparent AI Usage
**Requirement**: Users aware Elder Mycel is AI  
**Implementation**: Elder introduction, documentation disclosure  
**Ethics**: No deception about AI nature

#### COMP-AI-002: Content Moderation
**Requirement**: AI responses filtered for inappropriate content  
**Implementation**: System prompts, basic filtering, Warden monitoring  
**Safety**: Minimize risk of harmful outputs

#### COMP-AI-003: User Control
**Requirement**: Players can disengage from AI interactions  
**Implementation**: Opt-out via disconnection, no forced interaction  
**Autonomy**: User control preserved

### 14.3 Open Source

#### COMP-OS-001: MIT License
**Requirement**: Code licensed under MIT (permissive)  
**Implementation**: LICENSE file in repository  
**Compliance**: Attribution required, commercial use allowed

#### COMP-OS-002: No Secrets in Code
**Requirement**: No API keys or secrets committed to repository  
**Implementation**: `.env` in `.gitignore`, `.env.example` template  
**Security**: Prevents accidental exposure

---

## 15. Documentation Requirements

### 15.1 User Documentation

#### DOC-UD-001: Player Guide
**Status**: PLANNED  
**Content**: 
- Getting started tutorial
- Command reference
- Game mechanics explanation
- FAQ

#### DOC-UD-002: In-Game Help
**Status**: PARTIAL  
**Content**:
- `/help` command lists all commands
- Elder contextual hints
- Error message guidance

### 15.2 Developer Documentation

#### DOC-DD-001: README.md
**Status**: COMPLETE  
**Content**: Quick start, features, architecture overview, API endpoints

#### DOC-DD-002: REQUIREMENTS.md (This Document)
**Status**: COMPLETE  
**Content**: Comprehensive requirements specification

#### DOC-DD-003: MYCELIAL_STEWARD.md
**Status**: COMPLETE  
**Content**: MycelialSteward adapter technical documentation

#### DOC-DD-004: API Documentation
**Status**: PARTIAL  
**Content**: 
- WebSocket message formats
- HTTP endpoints
- External API integration

#### DOC-DD-005: Code Comments
**Status**: PARTIAL  
**Content**: JSDoc comments on public functions (ongoing)

### 15.3 Operational Documentation

#### DOC-OD-001: Deployment Guide
**Status**: PARTIAL (README Quick Start)  
**Content**:
- Local setup
- Replit deployment
- Production deployment (planned)

#### DOC-OD-002: Troubleshooting Guide
**Status**: PARTIAL (README Troubleshooting)  
**Content**:
- Common issues and solutions
- Health check interpretation
- Log analysis

---

## 16. Change Log

### Version 1.0 (Current)
**Date**: October 25, 2025  
**Status**: In Development  
**Changes**:
- Initial requirements document created
- All major sections completed
- MVP acceptance criteria defined
- Comprehensive functional and non-functional requirements documented

### Version 0.9 (MVP)
**Date**: October 2025  
**Status**: Implemented  
**Features**:
- WebSocket server
- MOCK mode gameplay
- Core commands (gather, gift, donate, offer, accept, vote, journal)
- Elder Mycel NPC
- MycelialSteward orchestration
- Basic UI

---

## 17. Glossary

### Game Terms
- **Elder Mycel**: The AI-powered NPC that interacts with players
- **Memory Stone**: A permanent piece of village history (max 12)
- **Canon Ring**: The collection of Memory Stones
- **Now Ring**: Current game state (quest, vote, recent actions)
- **Scratch Ring**: Short-term action history (5-10 min TTL)
- **Stockpile**: Shared village resource pool

### Agent Terms
- **Mycelial Conductor**: Manages Elder cadence and responses
- **Lichen Archivist**: Promotes journals to Memory Stones
- **Lamella Tallykeeper**: Manages voting system
- **Rhizomorph Quartermaster**: Tracks resources and quests
- **Saproprobe Warden**: Safety and moderation
- **Sporocarp Broker**: Trade management
- **MycelialSteward**: Unified orchestration adapter

### Technical Terms
- **MOCK Mode**: Deterministic AI responses using predefined logic
- **LIVE Mode**: Real API calls to Janitor AI and Letta
- **Pulse**: Periodic Elder response based on time/message thresholds
- **Cadence**: The rhythm/timing of Elder responses
- **Interjection**: Elder response triggered by game events
- **Patch**: Atomic state update returned by MycelialSteward

### Command Terms
- `/gather [resource]`: Collect resources
- `/gift @player [resource] x[amount]`: Transfer to player
- `/donate [resource] x[amount]`: Add to stockpile
- `/offer give [resource] x[amount] for [resource] x[amount]`: Create trade
- `/accept [offerId]`: Accept a trade
- `/vote [option]`: Cast vote
- `/journal [text]`: Create journal entry

---

## 18. Appendices

### Appendix A: Command Reference

See README.md Game Commands section for complete command reference.

### Appendix B: Test Coverage

Current test status: **24/24 passing ✅**

Test files:
- `test/intents.test.js`: Command parsing
- `test/letta-normalizer.test.js`: Response normalization
- `test/mycelial-steward.test.js`: Orchestration logic
- `server/test/apply_patch.test.js`: Patch application
- `server/test/elder_adapter.test.js`: Elder adapter
- `server/test/smoke_tick.js`: Server tick integration

### Appendix C: Environment Variables Reference

Complete list in `.env.example`:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# LLM Configuration
LLM_MODE=MOCK  # or LIVE
JANITOR_API_KEY=
LETTA_API_KEY=

# Prompt Paths
ELDER_SYSTEM_PROMPT_PATH=./prompts/elder_voice_charter.txt
ARCHIVIST_PROMPT_PATH=./prompts/archivist_rules.txt
CADENCE_PROMPT_PATH=./prompts/cadence_card.txt
TALLYKEEPER_PROMPT_PATH=./prompts/tallykeeper_rules.txt
QUARTERMASTER_PROMPT_PATH=./prompts/quartermaster_rules.txt
WARDEN_PROMPT_PATH=./prompts/warden_rules.txt
BROKER_PROMPT_PATH=./prompts/broker_rules.txt
MYCELIAL_STEWARD_PROMPT_PATH=./prompts/mycelial_steward.txt

# Cadence Configuration
CADENCE_MESSAGE_THRESHOLD=5
CADENCE_TIME_THRESHOLD=30
```

### Appendix D: Architecture Diagrams

See MYCELIAL_STEWARD.md for detailed architecture documentation including:
- State flow diagrams
- Agent coordination model
- Three Rings memory model
- Patch application sequence

---

## Document Maintenance

**Owner**: Development Team  
**Review Cycle**: As needed during development  
**Distribution**: Public (GitHub repository)  
**Format**: Markdown  
**Version Control**: Git

**Last Review**: October 25, 2025  
**Next Review**: As features are implemented or requirements change

---

*End of Requirements Specification*
