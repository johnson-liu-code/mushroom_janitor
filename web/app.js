// Mushroom Village Frontend Client

class MushroomVillageClient {
  constructor() {
    this.ws = null;
    this.playerName = null;
    this.playerId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    // Cooldown tracking: { resourceName: endTimestamp }
    this.cooldowns = {
      moss: 0,
      cedar: 0,
      resin: 0,
      spores: 0
    };
    
    // Cooldown durations in milliseconds
    this.cooldownDurations = {
      moss: 3000,    // 3 seconds
      cedar: 4000,   // 4 seconds
      resin: 5000,   // 5 seconds
      spores: 6000   // 6 seconds (for spore game)
    };
    
    this.init();
  }

  init() {
    // Show registration modal
    this.showRegistrationModal();
    
    // Setup event listeners
    document.getElementById('register-button').addEventListener('click', () => this.register());
    document.getElementById('player-name-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.register();
    });
    
    document.getElementById('send-button').addEventListener('click', () => this.sendMessage());
    document.getElementById('message-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
  }

  showRegistrationModal() {
    document.getElementById('registration-modal').style.display = 'flex';
    document.getElementById('player-name-input').focus();
  }

  hideRegistrationModal() {
    document.getElementById('registration-modal').style.display = 'none';
  }

  register() {
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim();
    
    if (!name) {
      alert('Please enter a name');
      return;
    }

    this.playerName = name;
    this.hideRegistrationModal();
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.updateStatus('connecting', 'Connecting...');
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (event) => this.onMessage(event);
      this.ws.onclose = () => this.onClose();
      this.ws.onerror = (error) => this.onError(error);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.updateStatus('error', 'Connection failed');
    }
  }

  onOpen() {
    console.log('WebSocket connected');
    this.updateStatus('connected', 'Connected');
    this.reconnectAttempts = 0;
    
    // Register player
    this.send({
      type: 'REGISTER',
      name: this.playerName
    });
  }

  onMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  onClose() {
    console.log('WebSocket disconnected');
    this.updateStatus('disconnected', 'Disconnected');
    
    // Attempt to reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.connect();
      }, 2000 * this.reconnectAttempts);
    }
  }

  onError(error) {
    console.error('WebSocket error:', error);
    this.updateStatus('error', 'Connection error');
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    this.send({
      type: 'USER_CHAT',
      text
    });
    
    input.value = '';
  }

  handleMessage(message) {
    switch (message.type) {
      case 'SYSTEM_NOTE':
        this.addSystemMessage(message.data);
        if (message.data.player) {
          this.playerId = message.data.playerId;
        }
        // Update inventory if provided
        if (message.data.inventory) {
          this.updateInventory(message.data.inventory);
        }
        break;
      
      case 'USER_CHAT':
        this.addUserMessage(message.data);
        break;
      
      case 'ELDER_SAY':
        this.addElderMessage(message.data);
        break;
      
      case 'ELDER_DM':
        this.addElderDM(message.data);
        break;
      
      case 'STATE_UPDATE':
        this.updateState(message.data);
        break;
      
      case 'QUEST_STATUS':
        this.updateQuest(message.data.quest);
        this.updateStockpile(message.data.stockpile);
        break;
      
      case 'QUEST_COMPLETED':
        this.showQuestCompletion(message.data);
        break;
      
      case 'VOTE_STATUS':
        this.updateVote(message.data.vote);
        break;
      
      case 'TRADE_STATUS':
        this.updateTrades(message.data.offers);
        break;
      
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  updateStatus(status, text) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    indicator.className = `status-dot status-${status}`;
    statusText.textContent = text;
  }

  addSystemMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message system-message ${data.type || ''}`;
    msgDiv.textContent = data.text;
    messagesDiv.appendChild(msgDiv);
    this.scrollToBottom();
  }

  addUserMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user-message';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'message-author';
    nameSpan.textContent = `${data.playerName}: `;
    
    const textSpan = document.createElement('span');
    textSpan.textContent = data.text;
    
    msgDiv.appendChild(nameSpan);
    msgDiv.appendChild(textSpan);
    messagesDiv.appendChild(msgDiv);
    this.scrollToBottom();
  }

  addElderMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message elder-message';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'message-author elder-author';
    nameSpan.textContent = '🍄 Elder Mycel: ';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = data.text;
    
    msgDiv.appendChild(nameSpan);
    msgDiv.appendChild(textSpan);
    messagesDiv.appendChild(msgDiv);
    this.scrollToBottom();
    
    // Update bell action hint
    this.extractActionHint(data.text);
  }

  extractActionHint(text) {
    // Simple extraction of imperative verbs
    const match = text.match(/(Gather|Donate|Vote|Trade|Share|Contribute|Cast)[^.]*\./i);
    if (match) {
      document.getElementById('bell-action').textContent = match[0];
    }
  }

  scrollToBottom() {
    const messagesDiv = document.getElementById('chat-messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  updateState(data) {
    if (data.stones) this.updateStones(data.stones);
    if (data.quest) this.updateQuest(data.quest);
    if (data.vote) this.updateVote(data.vote);
    if (data.stockpile) this.updateStockpile(data.stockpile);
    if (data.trades) this.updateTrades(data.trades);
    if (data.locations) this.updateMapLocations(data.locations);
  }

  // Quick action methods for UI buttons with cooldowns
  quickGather(item) {
    // Check if on cooldown
    if (this.isCooldown(item)) {
      return;
    }
    
    this.send({
      type: 'USER_CHAT',
      text: `/gather ${item}`
    });
    
    // Start cooldown
    this.startCooldown(item);
  }

  quickDonate(item) {
    this.send({
      type: 'USER_CHAT',
      text: `/donate ${item} x1`
    });
  }

  createTradeOffer() {
    const giveItem = document.getElementById('give-item').value;
    const giveQty = document.getElementById('give-qty').value;
    const wantItem = document.getElementById('want-item').value;
    const wantQty = document.getElementById('want-qty').value;
    
    if (!giveQty || !wantQty || giveQty < 1 || wantQty < 1) {
      alert('Please enter valid quantities');
      return;
    }
    
    this.send({
      type: 'USER_CHAT',
      text: `/offer give ${giveItem} x${giveQty} for ${wantItem} x${wantQty}`
    });
    
    // Reset form
    document.getElementById('give-qty').value = '1';
    document.getElementById('want-qty').value = '1';
  }

  // NEW: Update player inventory display
  updateInventory(inventory) {
    if (!inventory) return;
    
    document.getElementById('inv-moss').textContent = inventory.moss || 0;
    document.getElementById('inv-cedar').textContent = inventory.cedar || 0;
    document.getElementById('inv-resin').textContent = inventory.resin || 0;
    document.getElementById('inv-spores').textContent = inventory.spores || 0;
  }

  updateQuest(quest) {
    const content = document.getElementById('quest-content');
    const bellQuest = document.getElementById('bell-quest');
    
    if (!quest || !quest.name) {
      content.innerHTML = '<p class="panel-empty">No active quest</p>';
      bellQuest.textContent = 'None';
      return;
    }
    
    content.innerHTML = `
      <div class="quest-info">
        <h4>${quest.name}</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${quest.percent}%"></div>
        </div>
        <p class="progress-text">${quest.percent}% Complete</p>
        <div class="quest-recipe">
          <p><strong>Required:</strong></p>
          ${Object.entries(quest.recipe).map(([item, qty]) => 
            `<div class="recipe-item">${item}: ${qty}</div>`
          ).join('')}
        </div>
      </div>
    `;
    
    bellQuest.textContent = `${quest.name} (${quest.percent}%)`;
  }

  updateVote(vote) {
    const content = document.getElementById('vote-content');
    const bellVote = document.getElementById('bell-vote');
    
    if (!vote || vote.status !== 'OPEN') {
      content.innerHTML = '<p class="panel-empty">No active vote</p>';
      bellVote.textContent = 'None';
      return;
    }
    
    const timeRemaining = Math.floor(vote.timeRemaining / 1000);
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    
    content.innerHTML = `
      <div class="vote-info">
        <h4>${vote.topic}</h4>
        <p class="vote-timer">Closes in: ${minutes}m ${seconds}s</p>
        <div class="vote-options">
          ${vote.options.map(option => `
            <div class="vote-option">
              <button class="vote-button" onclick="client.castVote('${option}')">
                ${option}
              </button>
              <span class="vote-count">${vote.results[option] || 0} votes</span>
            </div>
          `).join('')}
        </div>
        <p class="vote-total">Total votes: ${vote.totalVotes}</p>
      </div>
    `;
    
    bellVote.textContent = vote.topic;
  }

  castVote(option) {
    this.send({
      type: 'USER_CHAT',
      text: `/vote ${option}`
    });
  }

  updateStockpile(stockpile) {
    if (!stockpile) return;
    
    document.getElementById('stock-moss').textContent = stockpile.moss || 0;
    document.getElementById('stock-cedar').textContent = stockpile.cedar || 0;
    document.getElementById('stock-resin').textContent = stockpile.resin || 0;
    document.getElementById('stock-spores').textContent = stockpile.spores || 0;
  }

  updateTrades(offers) {
    const content = document.getElementById('trades-content');
    
    if (!offers || offers.length === 0) {
      content.innerHTML = '<p class="panel-empty">No open trades</p>';
      return;
    }
    
    content.innerHTML = offers.map(offer => {
      const fromName = offer.fromPlayer || 'Unknown';
      
      return `
        <div class="trade-offer">
          <p class="trade-from">${fromName} offers:</p>
          <p class="trade-details">
            ${offer.give.qty} ${offer.give.item} ➔ ${offer.want.qty} ${offer.want.item}
          </p>
          <button class="trade-accept" onclick="client.acceptTrade('${offer.id}')">
            Accept
          </button>
        </div>
      `;
    }).join('');
  }

  acceptTrade(offerId) {
    this.send({
      type: 'USER_CHAT',
      text: `/accept ${offerId}`
    });
  }

  updateStones(stones) {
    const content = document.getElementById('stones-content');
    
    if (!stones || stones.length === 0) {
      content.innerHTML = '<p class="panel-empty">No memory stones yet</p>';
      return;
    }
    
    content.innerHTML = stones.map(stone => `
      <div class="memory-stone">
        <h4 class="stone-title">${stone.title}</h4>
        <p class="stone-text">${stone.text}</p>
        ${stone.tags && stone.tags.length > 0 ? 
          `<div class="stone-tags">${stone.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>` 
          : ''}
      </div>
    `).join('');
  }

  showQuestCompletion(data) {
    // Create celebration modal
    const modal = document.createElement('div');
    modal.className = 'completion-modal';
    modal.innerHTML = `
      <div class="completion-content">
        <div class="completion-header">
          <span class="completion-icon">🎉</span>
          <h2>Quest Complete!</h2>
          <span class="completion-icon">🎉</span>
        </div>
        
        <div class="completion-body">
          <p class="completed-quest-name">"${data.completedQuest.name}"</p>
          <p class="completion-subtitle">is finished!</p>
          
          <div class="completion-rewards">
            <h3>Rewards</h3>
            <p class="reward-item">✨ ${data.rewards.charms} Charm added to village</p>
          </div>
          
          <div class="completion-new-quest">
            <h3>New Quest</h3>
            <p class="new-quest-name">"${data.newQuest.name}"</p>
            <div class="new-quest-recipe">
              <p><strong>Needs:</strong></p>
              ${Object.entries(data.newQuest.recipe).map(([item, qty]) => 
                `<span class="recipe-item">${qty} ${item}</span>`
              ).join(', ')}
            </div>
          </div>
          
          <button class="completion-button" onclick="client.closeCompletionModal()">
            Continue
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add celebration message to chat
    this.addSystemMessage({
      text: `🎉 Quest "${data.completedQuest.name}" completed! The village earned ${data.rewards.charms} charm!`,
      type: 'success'
    });
  }

  closeCompletionModal() {
    const modal = document.querySelector('.completion-modal');
    if (modal) {
      modal.remove();
    }
  }

  // Cooldown management
  isCooldown(resource) {
    return Date.now() < this.cooldowns[resource];
  }

  startCooldown(resource) {
    const duration = this.cooldownDurations[resource];
    this.cooldowns[resource] = Date.now() + duration;
    
    // Get button element
    const button = document.querySelector(`[onclick="client.quickGather('${resource}')"]`);
    if (!button) return;
    
    // Disable button
    button.disabled = true;
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    
    // Create overlay and timer elements
    const overlay = document.createElement('div');
    overlay.className = 'cooldown-overlay';
    overlay.style.width = '100%';
    
    const timer = document.createElement('div');
    timer.className = 'cooldown-timer';
    
    button.appendChild(overlay);
    button.appendChild(timer);
    
    // Update countdown
    const updateCooldown = () => {
      const remaining = this.cooldowns[resource] - Date.now();
      
      if (remaining <= 0) {
        // Cooldown finished
        button.disabled = false;
        overlay.remove();
        timer.remove();
        return;
      }
      
      // Update progress bar (reverse fill)
      const progress = (remaining / duration) * 100;
      overlay.style.width = `${progress}%`;
      
      // Update timer text
      const seconds = Math.ceil(remaining / 1000);
      timer.textContent = `${seconds}s`;
      
      requestAnimationFrame(updateCooldown);
    };
    
    updateCooldown();
  }

  // NEW: Handle Elder private messages
  addElderDM(data) {
    const dmContent = document.getElementById('dm-content');
    const badge = document.getElementById('dm-badge');
    
    // Create DM element
    const dmDiv = document.createElement('div');
    dmDiv.className = 'dm-message';
    dmDiv.innerHTML = `
      <div class="dm-header">
        <span class="dm-from">🍄 Elder Mycel</span>
        <span class="dm-time">${new Date(data.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="dm-text">${data.text}</div>
    `;
    
    // Replace empty state or prepend to existing messages
    if (dmContent.querySelector('.panel-empty')) {
      dmContent.innerHTML = '';
    }
    dmContent.insertBefore(dmDiv, dmContent.firstChild);
    
    // Update badge
    if (data.unreadCount && data.unreadCount > 0) {
      badge.textContent = data.unreadCount;
      badge.style.display = 'inline-block';
    }
    
    // Add notification sound effect (optional)
    console.log('📜 New private message from Elder Mycel');
  }

  // Spore Game Methods
  startSporeGame() {
    // Check cooldown
    if (this.isCooldown('spores')) {
      return;
    }

    // Show game panel
    document.getElementById('spore-game-panel').style.display = 'block';
    
    // Initialize game
    this.sporeGame = {
      canvas: document.getElementById('spore-canvas'),
      ctx: null,
      score: 0,
      timeLeft: 10,
      isRunning: false,
      spores: [],
      animationFrame: null
    };
    
    this.sporeGame.ctx = this.sporeGame.canvas.getContext('2d');
    
    // Set canvas size
    const rect = this.sporeGame.canvas.getBoundingClientRect();
    this.sporeGame.canvas.width = rect.width;
    this.sporeGame.canvas.height = rect.height;
    
    // Start game
    this.runSporeGame();
  }

  runSporeGame() {
    const game = this.sporeGame;
    game.isRunning = true;
    game.score = 0;
    game.timeLeft = 10;
    game.spores = [];
    
    // Update UI
    document.getElementById('spore-score').textContent = '0';
    document.getElementById('spore-time').textContent = '10';
    
    // Add click handler
    game.canvas.onclick = (e) => this.handleSporeClick(e);
    
    // Spawn spores periodically
    const spawnInterval = setInterval(() => {
      if (!game.isRunning) {
        clearInterval(spawnInterval);
        return;
      }
      
      // Spawn 1-2 spores
      const count = Math.random() > 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        game.spores.push({
          x: Math.random() * (game.canvas.width - 30) + 15,
          y: -20,
          radius: 12 + Math.random() * 8,
          speed: 1 + Math.random() * 1.5,
          color: `hsl(${Math.random() * 60 + 260}, 60%, 70%)`
        });
      }
    }, 800);
    
    // Game timer
    const timerInterval = setInterval(() => {
      if (!game.isRunning) {
        clearInterval(timerInterval);
        return;
      }
      
      game.timeLeft--;
      document.getElementById('spore-time').textContent = game.timeLeft;
      
      if (game.timeLeft <= 0) {
        this.endSporeGame();
        clearInterval(timerInterval);
        clearInterval(spawnInterval);
      }
    }, 1000);
    
    // Animation loop
    const animate = () => {
      if (!game.isRunning) {
        return;
      }
      
      // Clear canvas
      game.ctx.fillStyle = 'linear-gradient(180deg, #F0F8EF 0%, #FAFAF8 100%)';
      game.ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
      
      // Update and draw spores
      game.spores = game.spores.filter(spore => {
        spore.y += spore.speed;
        
        // Remove if off screen
        if (spore.y > game.canvas.height + 30) {
          return false;
        }
        
        // Draw spore
        game.ctx.beginPath();
        game.ctx.arc(spore.x, spore.y, spore.radius, 0, Math.PI * 2);
        game.ctx.fillStyle = spore.color;
        game.ctx.fill();
        game.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        game.ctx.lineWidth = 2;
        game.ctx.stroke();
        
        // Draw highlight
        game.ctx.beginPath();
        game.ctx.arc(spore.x - spore.radius * 0.3, spore.y - spore.radius * 0.3, spore.radius * 0.3, 0, Math.PI * 2);
        game.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        game.ctx.fill();
        
        return true;
      });
      
      game.animationFrame = requestAnimationFrame(animate);
    };
    
    animate();
  }

  handleSporeClick(e) {
    const game = this.sporeGame;
    if (!game.isRunning) return;
    
    const rect = game.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicked on any spore
    for (let i = game.spores.length - 1; i >= 0; i--) {
      const spore = game.spores[i];
      const distance = Math.sqrt((x - spore.x) ** 2 + (y - spore.y) ** 2);
      
      if (distance < spore.radius) {
        // Hit!
        game.score++;
        document.getElementById('spore-score').textContent = game.score;
        
        // Remove spore
        game.spores.splice(i, 1);
        
        // Visual feedback
        game.ctx.beginPath();
        game.ctx.arc(spore.x, spore.y, spore.radius * 1.5, 0, Math.PI * 2);
        game.ctx.strokeStyle = '#7A9B76';
        game.ctx.lineWidth = 3;
        game.ctx.stroke();
        
        break;
      }
    }
  }

  endSporeGame() {
    const game = this.sporeGame;
    game.isRunning = false;
    
    if (game.animationFrame) {
      cancelAnimationFrame(game.animationFrame);
    }
    
    // Send contribution command with score
    if (game.score > 0) {
      this.send({
        type: 'USER_CHAT',
        text: `/contribute spores x${game.score}`
      });
    }
    
    // Show result
    game.ctx.fillStyle = 'rgba(122, 155, 118, 0.9)';
    game.ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
    
    game.ctx.fillStyle = 'white';
    game.ctx.font = 'bold 32px Quicksand';
    game.ctx.textAlign = 'center';
    game.ctx.fillText('Game Over!', game.canvas.width / 2, game.canvas.height / 2 - 30);
    
    game.ctx.font = '20px Nunito';
    game.ctx.fillText(`You caught ${game.score} spores!`, game.canvas.width / 2, game.canvas.height / 2 + 10);
    
    // Start cooldown
    this.startCooldown('spores');
  }

  closeSporeGame() {
    const game = this.sporeGame;
    if (game && game.isRunning) {
      this.endSporeGame();
    }
    
    document.getElementById('spore-game-panel').style.display = 'none';
  }

  // MOSS MATCHER GAME
  startMossGame() {
    if (this.isCooldown('moss')) return;
    
    document.getElementById('moss-game-panel').style.display = 'block';
    
    const mossTypes = ['🌿', '🍀', '🌱', '🪴', '🌾', '🍃'];
    const cards = [];
    
    // Create 6 pairs
    for (let i = 0; i < 6; i++) {
      cards.push(mossTypes[i], mossTypes[i]);
    }
    
    // Shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    
    this.mossGame = {
      cards,
      flipped: [],
      matched: [],
      score: 0,
      timeLeft: 30,
      isRunning: true
    };
    
    this.renderMossGrid();
    this.runMossTimer();
  }

  renderMossGrid() {
    const grid = document.getElementById('moss-game-grid');
    grid.innerHTML = '';
    
    this.mossGame.cards.forEach((moss, index) => {
      const card = document.createElement('div');
      card.className = 'moss-card';
      card.dataset.index = index;
      
      const back = document.createElement('div');
      back.className = 'moss-card-back';
      back.textContent = '🌿';
      
      const front = document.createElement('div');
      front.textContent = moss;
      
      card.appendChild(back);
      card.appendChild(front);
      card.onclick = () => this.flipMossCard(index);
      
      grid.appendChild(card);
    });
  }

  flipMossCard(index) {
    const game = this.mossGame;
    if (!game.isRunning || game.flipped.length >= 2 || 
        game.flipped.includes(index) || game.matched.includes(index)) {
      return;
    }
    
    game.flipped.push(index);
    const card = document.querySelector(`.moss-card[data-index="${index}"]`);
    card.classList.add('flipped');
    
    if (game.flipped.length === 2) {
      const [first, second] = game.flipped;
      if (game.cards[first] === game.cards[second]) {
        // Match!
        game.matched.push(first, second);
        game.score++;
        document.getElementById('moss-score').textContent = game.score;
        
        setTimeout(() => {
          document.querySelectorAll('.moss-card.flipped').forEach(c => {
            if (!c.classList.contains('matched')) c.classList.add('matched');
          });
          game.flipped = [];
          
          if (game.matched.length === game.cards.length) {
            this.endMossGame();
          }
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          game.flipped.forEach(i => {
            document.querySelector(`.moss-card[data-index="${i}"]`).classList.remove('flipped');
          });
          game.flipped = [];
        }, 1000);
      }
    }
  }

  runMossTimer() {
    const interval = setInterval(() => {
      if (!this.mossGame.isRunning) {
        clearInterval(interval);
        return;
      }
      
      this.mossGame.timeLeft--;
      document.getElementById('moss-time').textContent = this.mossGame.timeLeft;
      
      if (this.mossGame.timeLeft <= 0) {
        this.endMossGame();
        clearInterval(interval);
      }
    }, 1000);
  }

  endMossGame() {
    this.mossGame.isRunning = false;
    
    if (this.mossGame.score > 0) {
      this.send({
        type: 'USER_CHAT',
        text: `/contribute moss x${this.mossGame.score * 2}`
      });
    }
    
    this.startCooldown('moss');
  }

  closeMossGame() {
    if (this.mossGame && this.mossGame.isRunning) {
      this.endMossGame();
    }
    document.getElementById('moss-game-panel').style.display = 'none';
  }

  // CEDAR CHOP GAME
  startCedarGame() {
    if (this.isCooldown('cedar')) return;
    
    document.getElementById('cedar-game-panel').style.display = 'block';
    
    this.cedarGame = {
      canvas: document.getElementById('cedar-canvas'),
      ctx: null,
      chops: 0,
      totalChops: 10,
      hits: 0,
      targetPos: 0.5,
      indicatorPos: 0,
      direction: 1,
      speed: 0.02,
      isRunning: true,
      waiting: true
    };
    
    this.cedarGame.ctx = this.cedarGame.canvas.getContext('2d');
    const rect = this.cedarGame.canvas.getBoundingClientRect();
    this.cedarGame.canvas.width = rect.width;
    this.cedarGame.canvas.height = rect.height;
    
    // Click handler
    this.cedarGame.canvas.onclick = () => this.chopCedar();
    
    // Start animation
    this.animateCedarChop();
  }

  animateCedarChop() {
    const game = this.cedarGame;
    if (!game.isRunning) return;
    
    const ctx = game.ctx;
    const w = game.canvas.width;
    const h = game.canvas.height;
    
    // Clear
    ctx.fillStyle = '#FAFAF8';
    ctx.fillRect(0, 0, w, h);
    
    // Draw tree
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(w/2 - 30, h/2 - 100, 60, 200);
    
    // Draw bar
    const barY = h/2 + 120;
    const barHeight = 40;
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(50, barY, w - 100, barHeight);
    
    // Draw target zone
    const targetX = 50 + (w - 100) * game.targetPos;
    ctx.fillStyle = 'rgba(122, 155, 118, 0.3)';
    ctx.fillRect(targetX - 30, barY, 60, barHeight);
    
    // Draw indicator
    if (game.waiting) {
      game.indicatorPos += game.speed * game.direction;
      if (game.indicatorPos >= 1 || game.indicatorPos <= 0) {
        game.direction *= -1;
      }
    }
    
    const indicatorX = 50 + (w - 100) * game.indicatorPos;
    ctx.fillStyle = '#7A9B76';
    ctx.fillRect(indicatorX - 5, barY - 10, 10, barHeight + 20);
    
    // Draw instructions
    ctx.fillStyle = '#3A3A3A';
    ctx.font = '16px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText('Click when indicator is in green zone!', w/2, 50);
    
    requestAnimationFrame(() => this.animateCedarChop());
  }

  chopCedar() {
    const game = this.cedarGame;
    if (!game.waiting || !game.isRunning) return;
    
    game.waiting = false;
    game.chops++;
    
    // Check accuracy
    const distance = Math.abs(game.indicatorPos - game.targetPos);
    const isHit = distance < 0.15;
    
    if (isHit) game.hits++;
    
    const accuracy = Math.round((game.hits / game.chops) * 100);
    document.getElementById('cedar-chops').textContent = `${game.chops}/10`;
    document.getElementById('cedar-accuracy').textContent = `${accuracy}%`;
    
    if (game.chops >= game.totalChops) {
      this.endCedarGame();
    } else {
      // Reset for next chop
      setTimeout(() => {
        game.waiting = true;
        game.targetPos = 0.2 + Math.random() * 0.6;
        game.speed = 0.015 + Math.random() * 0.015;
      }, 500);
    }
  }

  endCedarGame() {
    this.cedarGame.isRunning = false;
    const yield_amt = Math.max(1, Math.round(this.cedarGame.hits * 1.5));
    
    if (yield_amt > 0) {
      this.send({
        type: 'USER_CHAT',
        text: `/contribute cedar x${yield_amt}`
      });
    }
    
    this.startCooldown('cedar');
  }

  closeCedarGame() {
    if (this.cedarGame && this.cedarGame.isRunning) {
      this.endCedarGame();
    }
    document.getElementById('cedar-game-panel').style.display = 'none';
  }

  // RESIN FLOW GAME
  startResinGame() {
    if (this.isCooldown('resin')) return;
    
    document.getElementById('resin-game-panel').style.display = 'block';
    
    this.resinGame = {
      canvas: document.getElementById('resin-canvas'),
      ctx: null,
      paths: [],
      timeLeft: 15,
      score: 0,
      totalDistance: 0,
      tracedDistance: 0,
      isRunning: true,
      isDrawing: false,
      lastPos: null
    };
    
    this.resinGame.ctx = this.resinGame.canvas.getContext('2d');
    const rect = this.resinGame.canvas.getBoundingClientRect();
    this.resinGame.canvas.width = rect.width;
    this.resinGame.canvas.height = rect.height;
    
    // Generate paths
    this.generateResinPaths();
    
    // Mouse handlers
    this.resinGame.canvas.onmousedown = (e) => this.startResinTrace(e);
    this.resinGame.canvas.onmousemove = (e) => this.continueResinTrace(e);
    this.resinGame.canvas.onmouseup = () => this.endResinTrace();
    
    // Timer
    const interval = setInterval(() => {
      if (!this.resinGame.isRunning) {
        clearInterval(interval);
        return;
      }
      
      this.resinGame.timeLeft--;
      document.getElementById('resin-time').textContent = this.resinGame.timeLeft;
      
      if (this.resinGame.timeLeft <= 0) {
        this.endResinGame();
        clearInterval(interval);
      }
    }, 1000);
    
    this.animateResinFlow();
  }

  generateResinPaths() {
    const game = this.resinGame;
    const w = game.canvas.width;
    const h = game.canvas.height;
    
    // Create 3 flowing paths
    for (let i = 0; i < 3; i++) {
      const path = [];
      const startX = (w / 4) * (i + 1);
      let x = startX;
      let y = 50;
      
      while (y < h - 50) {
        path.push({x, y});
        y += 20 + Math.random() * 20;
        x += (Math.random() - 0.5) * 40;
        x = Math.max(20, Math.min(w - 20, x));
      }
      
      game.paths.push({points: path, traced: []});
      
      // Calculate total distance
      for (let j = 1; j < path.length; j++) {
        const dx = path[j].x - path[j-1].x;
        const dy = path[j].y - path[j-1].y;
        game.totalDistance += Math.sqrt(dx*dx + dy*dy);
      }
    }
  }

  animateResinFlow() {
    const game = this.resinGame;
    if (!game.isRunning) return;
    
    const ctx = game.ctx;
    ctx.fillStyle = '#FAFAF8';
    ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
    
    // Draw paths
    game.paths.forEach(path => {
      ctx.strokeStyle = '#E8B869';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.3;
      
      ctx.beginPath();
      path.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      
      // Draw traced portions
      ctx.strokeStyle = '#7A9B76';
      ctx.globalAlpha = 0.8;
      path.traced.forEach(segment => {
        ctx.beginPath();
        ctx.moveTo(segment.from.x, segment.from.y);
        ctx.lineTo(segment.to.x, segment.to.y);
        ctx.stroke();
      });
    });
    
    ctx.globalAlpha = 1;
    
    requestAnimationFrame(() => this.animateResinFlow());
  }

  startResinTrace(e) {
    const rect = this.resinGame.canvas.getBoundingClientRect();
    this.resinGame.isDrawing = true;
    this.resinGame.lastPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  continueResinTrace(e) {
    const game = this.resinGame;
    if (!game.isDrawing || !game.isRunning) return;
    
    const rect = game.canvas.getBoundingClientRect();
    const pos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    // Check if near any path
    game.paths.forEach(path => {
      path.points.forEach((point, i) => {
        const dx = pos.x - point.x;
        const dy = pos.y - point.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        if (distance < 15 && game.lastPos) {
          const segment = {from: {...game.lastPos}, to: {...pos}};
          path.traced.push(segment);
          
          const segDist = Math.sqrt((pos.x - game.lastPos.x)**2 + (pos.y - game.lastPos.y)**2);
          game.tracedDistance += segDist;
        }
      });
    });
    
    game.lastPos = pos;
    
    // Update accuracy
    const accuracy = Math.min(100, Math.round((game.tracedDistance / game.totalDistance) * 100));
    document.getElementById('resin-accuracy').textContent = `${accuracy}%`;
  }

  endResinTrace() {
    this.resinGame.isDrawing = false;
    this.resinGame.lastPos = null;
  }

  endResinGame() {
    this.resinGame.isRunning = false;
    const accuracy = Math.min(100, Math.round((this.resinGame.tracedDistance / this.resinGame.totalDistance) * 100));
    const yield_amt = Math.max(1, Math.round(accuracy / 10));
    
    if (yield_amt > 0) {
      this.send({
        type: 'USER_CHAT',
        text: `/contribute resin x${yield_amt}`
      });
    }
    
    this.startCooldown('resin');
  }

  closeResinGame() {
    if (this.resinGame && this.resinGame.isRunning) {
      this.endResinGame();
    }
    document.getElementById('resin-game-panel').style.display = 'none';
  }

  // VILLAGE MAP
  initVillageMap() {
    this.villageMap = {
      canvas: document.getElementById('village-map-canvas'),
      ctx: null,
      locations: [
        {name: "Elder's Grove", x: 300, y: 200, type: 'elder', icon: '🍄'},
        {name: 'Moss Garden', x: 100, y: 100, type: 'resource', icon: '🌿'},
        {name: 'Cedar Forest', x: 500, y: 100, type: 'resource', icon: '🪵'},
        {name: 'Resin Trees', x: 100, y: 300, type: 'resource', icon: '💧'},
        {name: 'Stockpile', x: 300, y: 350, type: 'stockpile', icon: '📦'},
        {name: 'Trading Post', x: 500, y: 250, type: 'trade', icon: '🤝'},
        {name: 'Memory Stones', x: 50, y: 200, type: 'stones', icon: '🪨'}
      ],
      players: []
    };
    
    const rect = this.villageMap.canvas.getBoundingClientRect();
    this.villageMap.canvas.width = rect.width;
    this.villageMap.canvas.height = rect.height;
    this.villageMap.ctx = this.villageMap.canvas.getContext('2d');
    
    this.renderVillageMap();
  }

  renderVillageMap() {
    if (!this.villageMap) return;
    
    const ctx = this.villageMap.ctx;
    const w = this.villageMap.canvas.width;
    const h = this.villageMap.canvas.height;
    
    // Clear
    ctx.fillStyle = '#FAF8F5';
    ctx.fillRect(0, 0, w, h);
    
    // Draw paths between locations
    ctx.strokeStyle = '#D4C4B0';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    const grove = this.villageMap.locations[0];
    this.villageMap.locations.slice(1).forEach(loc => {
      ctx.beginPath();
      ctx.moveTo(grove.x, grove.y);
      ctx.lineTo(loc.x, loc.y);
      ctx.stroke();
    });
    
    ctx.setLineDash([]);
    
    // Draw locations
    this.villageMap.locations.forEach(loc => {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath();
      ctx.arc(loc.x + 2, loc.y + 2, 20, 0, Math.PI * 2);
      ctx.fill();
      
      // Background
      ctx.fillStyle = loc.type === 'elder' ? '#9B7FA8' : '#7A9B76';
      ctx.beginPath();
      ctx.arc(loc.x, loc.y, 20, 0, Math.PI * 2);
      ctx.fill();
      
      // Icon
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(loc.icon, loc.x, loc.y);
      
      // Label
      ctx.fillStyle = '#3A3A3A';
      ctx.font = '12px Quicksand';
      ctx.fillText(loc.name, loc.x, loc.y + 35);
    });
    
    // Draw players
    this.villageMap.players.forEach(player => {
      ctx.fillStyle = player.color || '#D4A574';
      ctx.beginPath();
      ctx.arc(player.x, player.y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Player name
      ctx.fillStyle = '#3A3A3A';
      ctx.font = '10px Nunito';
      ctx.fillText(player.name, player.x, player.y - 15);
    });
  }

  updateMapLocations(locations) {
    if (!this.villageMap) this.initVillageMap();
    
    if (locations && locations.length > 0) {
      // Add new locations from Letta
      locations.forEach(newLoc => {
        const exists = this.villageMap.locations.find(l => l.name === newLoc.name);
        if (!exists) {
          this.villageMap.locations.push(newLoc);
        }
      });
      
      this.renderVillageMap();
    }
  }
}

// Initialize client
const client = new MushroomVillageClient();

// Initialize village map on load
window.addEventListener('load', () => {
  if (client.villageMap) {
    client.initVillageMap();
  } else {
    setTimeout(() => client.initVillageMap(), 100);
  }
});
