function createDeck() {
  const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  
  // More functional approach using flatMap
  return suits.flatMap(suit => 
    ranks.map(rank => `${rank} of ${suit}`)
  );
}

function shuffleDeck(deck) {
  // Create a copy to avoid mutating original array if needed elsewhere
  const shuffledDeck = [...deck];
  
  // Fisher-Yates shuffle (your implementation is correct)
  for (let i = shuffledDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
  }
  return shuffledDeck;
}

// Optional: Add utility function to deal cards
function dealCards(deck, numCards) {
  return deck.splice(0, numCards);
}

module.exports = { createDeck, shuffleDeck, dealCards };