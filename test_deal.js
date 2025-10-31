const { createDeck, shuffleDeck } = require('./deck');

function dealHands(numPlayers = 4) {
  const deck = shuffleDeck(createDeck().concat(createDeck()));
  const handSize = Math.floor(deck.length / numPlayers);
  const hands = Array.from({ length: numPlayers }, () => []);

  for (let i = 0; i < handSize; i++) {
    for (let p = 0; p < numPlayers; p++) {
      const card = deck.pop();
      if (!card) break;
      hands[p].push(card);
    }
  }

  return hands.map(h => h.length);
}

function run(iterations = 10000) {
  let failures = 0;
  for (let i = 0; i < iterations; i++) {
    const lengths = dealHands(4);
    if (!lengths.every(l => l === 26)) {
      failures++;
      console.log('Failure on iteration', i, 'lengths:', lengths);
      break;
    }
  }

  if (failures === 0) {
    console.log(`All ${iterations} deals gave 26 cards per player.`);
  } else {
    console.log('Detected unequal distribution.');
  }
}

// Run quick check
run(1000);
