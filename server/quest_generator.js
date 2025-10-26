// Quest generation system for Mushroom Village

const QUEST_NAMES = [
  "Bridge Across the Brook",
  "Healing Circle for the Elders", 
  "Festival Lantern Grove",
  "Moss Tapestry for the Gathering Hall",
  "Cedar Watchtower",
  "Resin Seal for Ancient Texts",
  "Spore Garden Restoration",
  "Charm of Protection",
  "Village Well Repair",
  "Sacred Grove Renewal"
];

const QUEST_RECIPES = [
  { moss: 20, cedar: 10, resin: 5 },
  { cedar: 15, resin: 10, spores: 5 },
  { moss: 25, spores: 15, resin: 8 },
  { moss: 30, cedar: 15 },
  { cedar: 20, resin: 15, spores: 10 },
  { moss: 15, cedar: 8, spores: 12 },
  { resin: 20, spores: 20 },
  { moss: 10, cedar: 10, resin: 10, spores: 10 },
  { moss: 35, resin: 12 },
  { cedar: 25, spores: 18 }
];

/**
 * Generate a new random quest
 * @returns {Object} New quest object
 */
export function generateNewQuest() {
  const name = QUEST_NAMES[Math.floor(Math.random() * QUEST_NAMES.length)];
  const recipe = QUEST_RECIPES[Math.floor(Math.random() * QUEST_RECIPES.length)];
  
  return {
    id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name,
    recipe: { ...recipe }, // Clone to avoid mutation
    percent: 0,
    status: 'ACTIVE',
    createdAt: Date.now()
  };
}

/**
 * Check if quest is complete and handle completion
 * @param {GameState} gameState - Current game state
 * @returns {Object|null} Completion event or null if not complete
 */
export function checkAndCompleteQuest(gameState) {
  const quest = gameState.nowRing.activeQuest;
  
  // No active quest or not at 100%
  if (!quest || quest.percent < 100 || quest.status === 'COMPLETED') {
    return null;
  }
  
  // 1. Consume resources from stockpile
  for (const [item, qty] of Object.entries(quest.recipe)) {
    gameState.stockpile[item] = Math.max(0, gameState.stockpile[item] - qty);
  }
  
  // 2. Award charm to village
  gameState.stockpile.charms = (gameState.stockpile.charms || 0) + 1;
  
  // 3. Mark quest as completed
  quest.status = 'COMPLETED';
  quest.completedAt = Date.now();
  
  // 4. Generate new quest
  const newQuest = generateNewQuest();
  gameState.setActiveQuest(newQuest);
  
  // 5. Return completion event
  return {
    type: 'QUEST_COMPLETED',
    completedQuest: {
      id: quest.id,
      name: quest.name,
      recipe: quest.recipe
    },
    newQuest: {
      id: newQuest.id,
      name: newQuest.name,
      recipe: newQuest.recipe,
      percent: 0
    },
    rewards: {
      charms: 1
    },
    timestamp: Date.now()
  };
}
