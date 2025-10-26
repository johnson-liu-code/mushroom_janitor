// Mushroom Village Frontend Client

class MushroomVillageClient {
  constructor() {
    this.ws = null;
    this.playerName = null;
    this.playerId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
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
  }

  // NEW: Quick action methods for UI buttons
  quickGather(item) {
    this.send({
      type: 'USER_CHAT',
      text: `/gather ${item}`
    });
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
}

// Initialize client
const client = new MushroomVillageClient();
