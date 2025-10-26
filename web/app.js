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
    
    // Setup tab switching
    this.setupTabs();
    
    // Initialize donation amounts
    this.donateAmounts = {
      moss: 1,
      cedar: 1,
      resin: 1,
      spores: 1
    };
  }

  setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  switchTab(tabName) {
    // Update button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      }
    });
    
    // Update panel visibility
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Re-render village map when village tab is opened
    if (tabName === 'village') {
      setTimeout(() => {
        if (this.villageMap && this.villageMap.canvas) {
          const rect = this.villageMap.canvas.getBoundingClientRect();
          this.villageMap.canvas.width = rect.width;
          this.villageMap.canvas.height = rect.height;
          this.renderVillageMap();
        } else {
          this.initVillageMap();
        }
      }, 50);
    }
  }

  incrementDonateAmount(resource) {
    const player = this.getPlayerInventory();
    const maxAmount = player?.[resource] || 99;
    
    if (this.donateAmounts[resource] < maxAmount) {
      this.donateAmounts[resource]++;
      document.getElementById(`donate-amount-${resource}`).textContent = this.donateAmounts[resource];
    }
  }

  decrementDonateAmount(resource) {
    if (this.donateAmounts[resource] > 1) {
      this.donateAmounts[resource]--;
      document.getElementById(`donate-amount-${resource}`).textContent = this.donateAmounts[resource];
    }
  }

  donateWithAmount(resource) {
    const amount = this.donateAmounts[resource];
    this.send({
      type: 'USER_CHAT',
      text: `/donate ${resource} x${amount}`
    });
    
    // Reset to 1
    this.donateAmounts[resource] = 1;
    document.getElementById(`donate-amount-${resource}`).textContent = '1';
  }

  getPlayerInventory() {
    // This will be populated when inventory updates are received
    return {
      moss: parseInt(document.getElementById('inv-moss').textContent) || 0,
      cedar: parseInt(document.getElementById('inv-cedar').textContent) || 0,
      resin: parseInt(document.getElementById('inv-resin').textContent) || 0,
      spores: parseInt(document.getElementById('inv-spores').textContent) || 0
    };
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
    
    // Update inventory if provided and it's for this player
    console.log('[addSystemMessage] Received system message:', {
      hasInventory: !!data.inventory,
      playerId: data.playerId,
      myPlayerId: this.playerId,
      matches: data.playerId === this.playerId,
      inventory: data.inventory
    });
    
    if (data.inventory && data.playerId === this.playerId) {
      console.log('[addSystemMessage] Updating inventory:', data.inventory);
      this.updateInventory(data.inventory);
    }
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

  // Update player inventory display
  updateInventory(inventory) {
    if (!inventory) return;
    
    // Update all inventory displays
    const items = ['moss', 'cedar', 'resin', 'spores'];
    items.forEach(item => {
      const value = inventory[item] || 0;
      const elem = document.getElementById(`inv-${item}`);
      if (elem) {
        elem.textContent = value;
      }
      
      // Update donate amount max limit
      const donateElem = document.getElementById(`donate-amount-${item}`);
      if (donateElem) {
        const currentAmount = this.donateAmounts[item];
        if (currentAmount > value) {
          this.donateAmounts[item] = Math.max(1, value);
          donateElem.textContent = this.donateAmounts[item];
        }
      }
    });
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
    game.timeLeft = 15;
    game.spores = [];
    
    // Define spore colors
    const sporeColors = [
      { name: 'PURPLE', hue: 280, label: '💜' },
      { name: 'BLUE', hue: 220, label: '💙' },
      { name: 'PINK', hue: 320, label: '💗' }
    ];
    
    // Choose target color
    game.targetColor = sporeColors[Math.floor(Math.random() * sporeColors.length)];
    game.colorChangeTime = Date.now() + 5000; // Change color every 5 seconds
    
    // Update UI
    document.getElementById('spore-score').textContent = '0';
    document.getElementById('spore-time').textContent = '15';
    
    // Add click handler
    game.canvas.onclick = (e) => this.handleSporeClick(e);
    
    // Spawn spores periodically
    const spawnInterval = setInterval(() => {
      if (!game.isRunning) {
        clearInterval(spawnInterval);
        return;
      }
      
      // Change target color every 5 seconds
      if (Date.now() >= game.colorChangeTime) {
        game.targetColor = sporeColors[Math.floor(Math.random() * sporeColors.length)];
        game.colorChangeTime = Date.now() + 5000;
      }
      
      // Spawn 1-2 spores with random colors
      const count = Math.random() > 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const colorChoice = sporeColors[Math.floor(Math.random() * sporeColors.length)];
        game.spores.push({
          x: Math.random() * (game.canvas.width - 30) + 15,
          y: -20,
          radius: 12 + Math.random() * 8,
          speed: 0.5 + Math.random() * 0.8,
          color: `hsl(${colorChoice.hue}, 60%, 70%)`,
          colorName: colorChoice.name,
          hue: colorChoice.hue
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
      game.ctx.fillStyle = '#F0F8EF';
      game.ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
      
      // Draw instructions with target color
      game.ctx.fillStyle = '#3A3A3A';
      game.ctx.font = 'bold 20px Nunito';
      game.ctx.textAlign = 'center';
      game.ctx.fillText(`Catch ${game.targetColor.label} ${game.targetColor.name} spores!`, game.canvas.width / 2, 30);
      
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
        // Check if correct color
        if (spore.colorName === game.targetColor.name) {
          // Correct color - gain point!
          game.score++;
          document.getElementById('spore-score').textContent = game.score;
          
          // Visual feedback - green
          game.ctx.beginPath();
          game.ctx.arc(spore.x, spore.y, spore.radius * 1.5, 0, Math.PI * 2);
          game.ctx.strokeStyle = '#7A9B76';
          game.ctx.lineWidth = 3;
          game.ctx.stroke();
        } else {
          // Wrong color - lose point!
          game.score = Math.max(0, game.score - 1);
          document.getElementById('spore-score').textContent = game.score;
          
          // Visual feedback - red
          game.ctx.beginPath();
          game.ctx.arc(spore.x, spore.y, spore.radius * 1.5, 0, Math.PI * 2);
          game.ctx.strokeStyle = '#D4756E';
          game.ctx.lineWidth = 3;
          game.ctx.stroke();
        }
        
        // Remove spore
        game.spores.splice(i, 1);
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
    
    // Send gather command - resources go to player inventory
    if (game.score > 0) {
      this.send({
        type: 'USER_CHAT',
        text: `/gather spores x${game.score}`
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
    
    const yield_amt = this.mossGame.score * 2;
    
    if (yield_amt > 0) {
      this.send({
        type: 'USER_CHAT',
        text: `/gather moss x${yield_amt}`
      });
    }
    
    // Show completion message on grid
    const grid = document.getElementById('moss-game-grid');
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px;">
        <h3 style="color: #7A9B76; font-size: 24px; margin-bottom: 10px;">Game Complete!</h3>
        <p style="font-size: 18px;">Matches: ${this.mossGame.score}/6</p>
        <p style="font-size: 18px;">Collected: ${yield_amt} moss</p>
      </div>
    `;
    
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
      consecutiveHits: 0,
      targetPos: 0.5,
      indicatorPos: 0,
      direction: 1,
      speed: 0.005,
      hitZoneSize: 0.25,
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
    
    // Draw target zone (size based on difficulty)
    const targetX = 50 + (w - 100) * game.targetPos;
    const zoneWidth = (w - 100) * game.hitZoneSize;
    ctx.fillStyle = 'rgba(122, 155, 118, 0.3)';
    ctx.fillRect(targetX - zoneWidth/2, barY, zoneWidth, barHeight);
    
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
    
    // Draw instructions and difficulty indicator
    ctx.fillStyle = '#3A3A3A';
    ctx.font = '16px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText('Click when indicator is in green zone!', w/2, 40);
    
    // Show consecutive hits streak
    if (game.consecutiveHits > 0) {
      ctx.fillStyle = '#7A9B76';
      ctx.font = 'bold 14px Quicksand';
      ctx.fillText(`🔥 Streak: ${game.consecutiveHits} (Getting harder!)`, w/2, 65);
    }
    
    requestAnimationFrame(() => this.animateCedarChop());
  }

  chopCedar() {
    const game = this.cedarGame;
    if (!game.waiting || !game.isRunning) return;
    
    game.waiting = false;
    game.chops++;
    
    // Check accuracy (use current hit zone size)
    const distance = Math.abs(game.indicatorPos - game.targetPos);
    const isHit = distance < game.hitZoneSize / 2;
    
    if (isHit) {
      game.hits++;
      game.consecutiveHits++;
      
      // Progressive difficulty: speed up and shrink hit zone on consecutive hits
      game.speed = Math.min(0.025, game.speed + 0.002);
      game.hitZoneSize = Math.max(0.08, game.hitZoneSize - 0.02);
    } else {
      // Reset streak on miss
      game.consecutiveHits = 0;
      // Reset difficulty slightly
      game.speed = Math.max(0.005, game.speed - 0.001);
      game.hitZoneSize = Math.min(0.25, game.hitZoneSize + 0.01);
    }
    
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
      }, 500);
    }
  }

  endCedarGame() {
    this.cedarGame.isRunning = false;
    const yield_amt = Math.max(1, Math.round(this.cedarGame.hits * 1.5));
    
    if (yield_amt > 0) {
      this.send({
        type: 'USER_CHAT',
        text: `/gather cedar x${yield_amt}`
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

  // RESIN COLLECTION GAME - Redesigned as a bucket catching game
  startResinGame() {
    if (this.isCooldown('resin')) return;
    
    document.getElementById('resin-game-panel').style.display = 'block';
    
    this.resinGame = {
      canvas: document.getElementById('resin-canvas'),
      ctx: null,
      bucketX: 0,
      bucketWidth: 80,
      bucketHeight: 30,
      drops: [],
      score: 0,
      missed: 0,
      timeLeft: 20,
      isRunning: true
    };
    
    this.resinGame.ctx = this.resinGame.canvas.getContext('2d');
    const rect = this.resinGame.canvas.getBoundingClientRect();
    this.resinGame.canvas.width = rect.width;
    this.resinGame.canvas.height = rect.height;
    
    // Initialize bucket position
    this.resinGame.bucketX = (this.resinGame.canvas.width - this.resinGame.bucketWidth) / 2;
    
    // Mouse/touch control
    this.resinGame.canvas.onmousemove = (e) => this.moveResinBucket(e);
    this.resinGame.canvas.ontouchmove = (e) => {
      e.preventDefault();
      this.moveResinBucket(e.touches[0]);
    };
    
    // Start game
    this.runResinGame();
  }

  moveResinBucket(e) {
    const game = this.resinGame;
    if (!game.isRunning) return;
    
    const rect = game.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    // Center bucket on mouse position
    game.bucketX = Math.max(0, Math.min(game.canvas.width - game.bucketWidth, mouseX - game.bucketWidth / 2));
  }

  runResinGame() {
    const game = this.resinGame;
    game.score = 0;
    game.missed = 0;
    
    document.getElementById('resin-accuracy').textContent = '0';
    document.getElementById('resin-time').textContent = '20';
    
    // Spawn resin drops
    const spawnInterval = setInterval(() => {
      if (!game.isRunning) {
        clearInterval(spawnInterval);
        return;
      }
      
      // Spawn 1-2 drops
      const count = Math.random() > 0.6 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        game.drops.push({
          x: 20 + Math.random() * (game.canvas.width - 40),
          y: -20,
          speed: 1.2 + Math.random() * 0.8,
          size: 8 + Math.random() * 6,
          wobble: Math.random() * Math.PI * 2
        });
      }
    }, 1000);
    
    // Timer
    const timerInterval = setInterval(() => {
      if (!game.isRunning) {
        clearInterval(timerInterval);
        return;
      }
      
      game.timeLeft--;
      document.getElementById('resin-time').textContent = game.timeLeft;
      
      if (game.timeLeft <= 0) {
        this.endResinGame();
        clearInterval(timerInterval);
        clearInterval(spawnInterval);
      }
    }, 1000);
    
    // Animation loop
    const animate = () => {
      if (!game.isRunning) return;
      
      const ctx = game.ctx;
      const w = game.canvas.width;
      const h = game.canvas.height;
      
      // Clear
      ctx.fillStyle = '#FAF8F5';
      ctx.fillRect(0, 0, w, h);
      
      // Draw trees in background
      ctx.fillStyle = 'rgba(139, 115, 85, 0.2)';
      for (let i = 0; i < 3; i++) {
        const treeX = (w / 4) * (i + 1);
        ctx.fillRect(treeX - 15, 30, 30, 80);
      }
      
      // Update and draw drops
      game.drops = game.drops.filter(drop => {
        drop.y += drop.speed;
        drop.wobble += 0.05;
        
        // Check if caught
        const bucketY = h - 60;
        if (drop.y >= bucketY && drop.y <= bucketY + game.bucketHeight) {
          if (drop.x >= game.bucketX && drop.x <= game.bucketX + game.bucketWidth) {
            game.score++;
            document.getElementById('resin-accuracy').textContent = game.score;
            return false; // Remove drop
          }
        }
        
        // Check if missed
        if (drop.y > h + 20) {
          game.missed++;
          return false;
        }
        
        // Draw drop with wobble
        const wobbleOffset = Math.sin(drop.wobble) * 3;
        ctx.fillStyle = '#E8B869';
        ctx.beginPath();
        ctx.ellipse(drop.x + wobbleOffset, drop.y, drop.size, drop.size * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(drop.x + wobbleOffset - drop.size * 0.3, drop.y - drop.size * 0.3, drop.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        return true;
      });
      
      // Draw bucket
      const bucketY = h - 60;
      
      // Bucket shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(game.bucketX + 5, bucketY + 5, game.bucketWidth, game.bucketHeight);
      
      // Bucket body
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(game.bucketX, bucketY, game.bucketWidth, game.bucketHeight);
      
      // Bucket rim
      ctx.fillStyle = '#A0896A';
      ctx.fillRect(game.bucketX - 5, bucketY - 5, game.bucketWidth + 10, 8);
      
      // Bucket interior
      ctx.fillStyle = '#6A5D4F';
      ctx.fillRect(game.bucketX + 5, bucketY + 3, game.bucketWidth - 10, game.bucketHeight - 8);
      
      // Instructions
      ctx.fillStyle = '#3A3A3A';
      ctx.font = '16px Nunito';
      ctx.textAlign = 'center';
      ctx.fillText('Move your mouse to catch resin drops!', w / 2, 25);
      
      requestAnimationFrame(animate);
    };
    
    animate();
  }

  endResinGame() {
    this.resinGame.isRunning = false;
    const yield_amt = Math.max(1, this.resinGame.score);
    
    if (yield_amt > 0) {
      this.send({
        type: 'USER_CHAT',
        text: `/gather resin x${yield_amt}`
      });
    }
    
    // Show result
    const ctx = this.resinGame.ctx;
    ctx.fillStyle = 'rgba(122, 155, 118, 0.9)';
    ctx.fillRect(0, 0, this.resinGame.canvas.width, this.resinGame.canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px Quicksand';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', this.resinGame.canvas.width / 2, this.resinGame.canvas.height / 2 - 40);
    
    ctx.font = '20px Nunito';
    ctx.fillText(`Caught: ${this.resinGame.score} drops`, this.resinGame.canvas.width / 2, this.resinGame.canvas.height / 2);
    ctx.fillText(`Missed: ${this.resinGame.missed}`, this.resinGame.canvas.width / 2, this.resinGame.canvas.height / 2 + 30);
    
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
    const canvas = document.getElementById('village-map-canvas');
    if (!canvas) return;
    
    this.villageMap = {
      canvas: canvas,
      ctx: canvas.getContext('2d'),
      locations: [
        {name: "Elder's Grove", x: 300, y: 200, type: 'elder', icon: '🍄'},
        {name: 'Moss Garden', x: 100, y: 100, type: 'resource', icon: '🌿'},
        {name: 'Cedar Forest', x: 500, y: 100, type: 'resource', icon: '🪵'},
        {name: 'Resin Trees', x: 100, y: 300, type: 'resource', icon: '💧'},
        {name: 'Stockpile', x: 300, y: 350, type: 'stockpile', icon: '📦'},
        {name: 'Trading Post', x: 500, y: 250, type: 'trade', icon: '🤝'},
        {name: 'Memory Stones', x: 50, y: 200, type: 'stones', icon: '🪨'}
      ],
      players: [],
      pathCache: null  // Cache the random path curves
    };
    
    const rect = this.villageMap.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.villageMap.canvas.width = rect.width;
      this.villageMap.canvas.height = rect.height;
      this.renderVillageMap();
    }
  }

  renderVillageMap() {
    if (!this.villageMap || !this.villageMap.ctx) return;
    
    const ctx = this.villageMap.ctx;
    const w = this.villageMap.canvas.width;
    const h = this.villageMap.canvas.height;
    
    if (w === 0 || h === 0) return;
    
    // Draw gradient background with subtle texture
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#E8F5E9');
    gradient.addColorStop(0.5, '#F1F8E9');
    gradient.addColorStop(1, '#FFF9C4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    
    // Draw decorative forest elements in background (use seed for consistency)
    ctx.globalAlpha = 0.1;
    const seed = 12345; // Fixed seed for consistent rendering
    for (let i = 0; i < 15; i++) {
      const x = ((seed + i * 37) % 1000) / 1000 * w;
      const y = ((seed + i * 73) % 1000) / 1000 * h;
      const size = 20 + ((seed + i * 17) % 30);
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Generate or use cached paths
    if (!this.villageMap.pathCache) {
      this.villageMap.pathCache = [];
      const grove = this.villageMap.locations[0];
      this.villageMap.locations.slice(1).forEach((loc, idx) => {
        const midX = (grove.x + loc.x) / 2;
        const midY = (grove.y + loc.y) / 2;
        const cpX = midX + ((idx % 2 === 0 ? 1 : -1) * 30);
        const cpY = midY + ((idx % 3 === 0 ? 1 : -1) * 30);
        this.villageMap.pathCache.push({ from: grove, to: loc, cpX, cpY });
      });
    }
    
    // Draw curved paths between locations
    ctx.strokeStyle = '#8D6E63';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    this.villageMap.pathCache.forEach(path => {
      ctx.beginPath();
      ctx.moveTo(path.from.x, path.from.y);
      ctx.quadraticCurveTo(path.cpX, path.cpY, path.to.x, path.to.y);
      ctx.stroke();
      
      // Draw path decorations (small stones/grass)
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        const pathX = (1-t)*(1-t)*path.from.x + 2*(1-t)*t*path.cpX + t*t*path.to.x;
        const pathY = (1-t)*(1-t)*path.from.y + 2*(1-t)*t*path.cpY + t*t*path.to.y;
        
        ctx.fillStyle = 'rgba(160, 130, 100, 0.3)';
        ctx.beginPath();
        ctx.arc(pathX + (i % 2 === 0 ? 5 : -5), pathY + (i % 2 === 0 ? 5 : -5), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    // Draw locations with enhanced visuals
    this.villageMap.locations.forEach(loc => {
      // Outer glow
      const glowGradient = ctx.createRadialGradient(loc.x, loc.y, 20, loc.x, loc.y, 35);
      glowGradient.addColorStop(0, loc.type === 'elder' ? 'rgba(155, 127, 168, 0.3)' : 'rgba(122, 155, 118, 0.3)');
      glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(loc.x, loc.y, 35, 0, Math.PI * 2);
      ctx.fill();
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(loc.x + 3, loc.y + 3, 22, 0, Math.PI * 2);
      ctx.fill();
      
      // Main circle with gradient
      const locGradient = ctx.createRadialGradient(loc.x - 5, loc.y - 5, 5, loc.x, loc.y, 22);
      locGradient.addColorStop(0, loc.type === 'elder' ? '#B39DDB' : '#A5D6A7');
      locGradient.addColorStop(1, loc.type === 'elder' ? '#9B7FA8' : '#7A9B76');
      ctx.fillStyle = locGradient;
      ctx.beginPath();
      ctx.arc(loc.x, loc.y, 22, 0, Math.PI * 2);
      ctx.fill();
      
      // Border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Icon with shadow
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 2;
      ctx.font = '22px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(loc.icon, loc.x, loc.y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      
      // Label with background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(loc.x - 40, loc.y + 30, 80, 18);
      ctx.strokeStyle = '#D4C4B0';
      ctx.lineWidth = 1;
      ctx.strokeRect(loc.x - 40, loc.y + 30, 80, 18);
      
      ctx.fillStyle = '#3A3A3A';
      ctx.font = 'bold 11px Quicksand';
      ctx.fillText(loc.name, loc.x, loc.y + 39);
    });
    
    // Draw players with improved style
    this.villageMap.players.forEach(player => {
      // Player glow
      const playerGlow = ctx.createRadialGradient(player.x, player.y, 8, player.x, player.y, 15);
      playerGlow.addColorStop(0, 'rgba(212, 165, 116, 0.5)');
      playerGlow.addColorStop(1, 'rgba(212, 165, 116, 0)');
      ctx.fillStyle = playerGlow;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
      ctx.fill();
      
      // Player circle
      ctx.fillStyle = player.color || '#D4A574';
      ctx.beginPath();
      ctx.arc(player.x, player.y, 9, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      
      // Player name with background
      const nameWidth = ctx.measureText(player.name).width;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(player.x - nameWidth/2 - 4, player.y - 25, nameWidth + 8, 14);
      ctx.strokeStyle = '#D4A574';
      ctx.lineWidth = 1;
      ctx.strokeRect(player.x - nameWidth/2 - 4, player.y - 25, nameWidth + 8, 14);
      
      ctx.fillStyle = '#3A3A3A';
      ctx.font = 'bold 10px Nunito';
      ctx.fillText(player.name, player.x, player.y - 18);
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
