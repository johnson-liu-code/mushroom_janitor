// Sporocarp Broker: Trading board management
import { gameState } from '../state.js';
import { createOffer, TradeStatus } from '../types.js';
import { lettaAdapter } from '../adapters/letta.js';

class SporocarpBroker {
  constructor() {
    this.name = 'Sporocarp Broker';
  }

  // Create a new trade offer
  createOffer(playerId, give, want) {
    const player = gameState.getPlayer(playerId);
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }

    // Check if player has the items
    if (!player.inventory.hasOwnProperty(give.item)) {
      return { success: false, reason: 'Invalid item to give' };
    }

    if (player.inventory[give.item] < give.qty) {
      return { success: false, reason: 'Insufficient inventory' };
    }

    // Validate want item
    if (!player.inventory.hasOwnProperty(want.item)) {
      return { success: false, reason: 'Invalid item to receive' };
    }

    // Create offer
    const offerId = `offer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const offer = createOffer(offerId, playerId, give, want);
    
    gameState.createOffer(offer);

    return { success: true, offer };
  }

  // Accept a trade offer
  acceptOffer(offerId, acceptingPlayerId) {
    const result = gameState.acceptOffer(offerId, acceptingPlayerId);
    
    if (result.success) {
      // Record in scratch ring
      const fromPlayer = gameState.getPlayer(result.offer.fromPlayer);
      const toPlayer = gameState.getPlayer(acceptingPlayerId);
      
      return {
        success: true,
        offer: result.offer,
        summary: `${toPlayer.name} accepted ${fromPlayer.name}'s offer: ${result.offer.give.qty} ${result.offer.give.item} for ${result.offer.want.qty} ${result.offer.want.item}`
      };
    }

    return result;
  }

  // Cancel an offer
  cancelOffer(offerId, playerId) {
    const offer = gameState.getOffer(offerId);
    
    if (!offer) {
      return { success: false, reason: 'Offer not found' };
    }

    if (offer.fromPlayer !== playerId) {
      return { success: false, reason: 'Not your offer' };
    }

    if (offer.status !== TradeStatus.OPEN) {
      return { success: false, reason: 'Offer already closed' };
    }

    offer.status = TradeStatus.CANCELLED;
    offer.cancelledAt = Date.now();

    return { success: true, offer };
  }

  // Get all open offers
  getOpenOffers() {
    return gameState.getOpenOffers();
  }

  // Get offers by player
  getPlayerOffers(playerId) {
    return Array.from(gameState.offers.values())
      .filter(o => o.fromPlayer === playerId);
  }

  // Get trading board summary
  getTradingBoardSummary() {
    const openOffers = this.getOpenOffers();
    
    return {
      total: openOffers.length,
      offers: openOffers.map(o => {
        const player = gameState.getPlayer(o.fromPlayer);
        return {
          id: o.id,
          from: player?.name || 'Unknown',
          give: o.give,
          want: o.want,
          age: Date.now() - o.createdAt
        };
      })
    };
  }

  // Generate summary for Elder
  async generateSummaryForElder() {
    const summary = this.getTradingBoardSummary();
    
    if (summary.total === 0) {
      return 'Trading board is quiet.';
    }

    try {
      // Use Letta to create narrative summary
      const narrative = await lettaAdapter.generateBrokerSummary(summary);
      return narrative;
    } catch (error) {
      console.error('Broker summary error:', error);
      return this.generateSimpleSummary(summary);
    }
  }

  // Simple fallback summary
  generateSimpleSummary(summary) {
    if (summary.total === 0) {
      return 'No active trades.';
    }

    const examples = summary.offers.slice(0, 2).map(o => 
      `${o.from}: ${o.give.qty} ${o.give.item} for ${o.want.qty} ${o.want.item}`
    );

    return `${summary.total} trade offer(s) posted. ${examples.join('; ')}.`;
  }

  // Check for stale offers (older than 1 hour)
  cleanStaleOffers() {
    const staleThreshold = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    let cleanedCount = 0;

    for (const [offerId, offer] of gameState.offers.entries()) {
      if (offer.status === TradeStatus.OPEN && (now - offer.createdAt) > staleThreshold) {
        offer.status = TradeStatus.CANCELLED;
        offer.cancelledAt = now;
        offer.cancelReason = 'stale';
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  // Match offers (find compatible offers)
  findMatchingOffers(offerId) {
    const offer = gameState.getOffer(offerId);
    if (!offer || offer.status !== TradeStatus.OPEN) {
      return [];
    }

    const matches = [];
    const openOffers = this.getOpenOffers();

    for (const other of openOffers) {
      if (other.id === offerId) continue;
      
      // Check if offers are compatible
      // A wants B, B wants A
      if (offer.give.item === other.want.item && 
          offer.want.item === other.give.item) {
        
        // Check if quantities work
        const ratio1 = offer.give.qty / other.want.qty;
        const ratio2 = other.give.qty / offer.want.qty;
        
        if (Math.abs(ratio1 - 1) < 0.1 && Math.abs(ratio2 - 1) < 0.1) {
          matches.push({
            offerId: other.id,
            from: other.fromPlayer,
            compatibility: 'exact'
          });
        } else {
          matches.push({
            offerId: other.id,
            from: other.fromPlayer,
            compatibility: 'partial'
          });
        }
      }
    }

    return matches;
  }

  // Get trade history for a player
  getPlayerTradeHistory(playerId) {
    const history = [];
    
    for (const offer of gameState.offers.values()) {
      if ((offer.fromPlayer === playerId || offer.acceptedBy === playerId) && 
          offer.status === TradeStatus.COMPLETED) {
        history.push(offer);
      }
    }

    return history.sort((a, b) => b.completedAt - a.completedAt);
  }
}

// Singleton instance
export const sporocarpBroker = new SporocarpBroker();
