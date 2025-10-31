const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createDeck, shuffleDeck } = require("./deck");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Enable extra debug logging by setting environment variable DEBUG_GAME=1
const DEBUG_GAME = process.env.DEBUG_GAME === '1';

app.use(express.static("public"));

// Game state
const gameState = {
  players: [],
  currentTurn: 0,
  gameInProgress: false,
  table: [],
  leadingSuit: null,
  scores: {},
  round: 1,
  trickCount: 0,
  handSize: 0
};

// Helper: sort a hand of cards by suit then rank
function sortHand(hand) {
  const rankOrder = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
  };
  const suitPriority = { Clubs: 0, Diamonds: 1, Hearts: 2, Spades: 3 };

  hand.sort((a, b) => {
    // a, b are strings like "Q of Spades"
    const [rankA, , suitA] = a.split(" ");
    const [rankB, , suitB] = b.split(" ");

    const suitDiff = (suitPriority[suitA] || 0) - (suitPriority[suitB] || 0);
    if (suitDiff !== 0) return suitDiff;

    return (rankOrder[rankA] || 0) - (rankOrder[rankB] || 0);
  });
}

io.on("connection", (socket) => {
  socket.on("join", (name, callback) => {
    if (gameState.players.length >= 4) {
      return callback({ error: "Room full" });
    }
    
    const player = { id: socket.id, name, hand: [], score: 0 };
    gameState.players.push(player);
    gameState.scores[socket.id] = gameState.scores[socket.id] || 0;

    io.emit("playerList", sanitizePlayers());
    callback({ id: socket.id });

    if (gameState.players.length === 4) startGame();
  });

  socket.on("playCard", (card, callback) => {
    const player = gameState.players[gameState.currentTurn];
    if (!player || player.id !== socket.id) {
      return callback({ error: "Not your turn" });
    }

    // Debug: log player's hand size before play
    if (DEBUG_GAME) {
      console.log(`DEBUG: playCard by ${socket.id} before play handSize=${player.hand.length} hand=${JSON.stringify(player.hand)}`);
    }

    const cardIndex = player.hand.findIndex(c => c === card);
    if (cardIndex === -1) return callback({ error: "Card not found" });

    // Validate suit following (robust parsing + trimming)
    const suit = (card.split(" of ")[1] || "").trim();
    if (gameState.leadingSuit && suit !== gameState.leadingSuit) {
      const hasLeadingSuit = player.hand.some(c => {
        const s = (c.split(" of ")[1] || "").trim();
        return s === gameState.leadingSuit;
      });

      if (hasLeadingSuit) {
        return callback({ error: `You must follow ${gameState.leadingSuit}` });
      }
    }

    // Play card
    player.hand.splice(cardIndex, 1);
    if (DEBUG_GAME) {
      console.log(`DEBUG: playCard by ${socket.id} played=${card} after handSize=${player.hand.length} hand=${JSON.stringify(player.hand)}`);

      // Report total remaining counts by suit across players
      const suitCounts = {};
      gameState.players.forEach(p => {
        p.hand.forEach(c => {
          const s = (c.split(' of ')[1] || '').trim();
          suitCounts[s] = (suitCounts[s] || 0) + 1;
        });
      });
      console.log('DEBUG: total remaining suitCounts=', suitCounts);
    }
    gameState.table.push({ playerId: socket.id, card });
    
    if (gameState.table.length === 1) {
      gameState.leadingSuit = suit;
    }

    io.emit("cardPlayed", { playerId: socket.id, card });

    if (gameState.table.length === 4) {
      endTrick();
    } else {
      nextTurn();
    }

    callback({ success: true });
  });

  socket.on("disconnect", () => {
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    io.emit("reset");
    resetGame();
  });
});

function startGame() {
  // Guard: avoid starting twice if already in progress
  if (gameState.gameInProgress) return;
  gameState.gameInProgress = true;
  gameState.table = [];
  gameState.leadingSuit = null;
  gameState.currentTurn = 0;
  gameState.trickCount = 0;

  // Use two full decks (104 cards) so each player receives 26
  const deck = shuffleDeck(createDeck().concat(createDeck()));

  // Compute hand size dynamically (deck length divided by players)
  const numPlayers = gameState.players.length || 1;
  const handSize = Math.floor(deck.length / numPlayers) || 0;
  gameState.handSize = handSize;

  // Robust round-robin dealing: ensures each player gets exactly `handSize` cards
  // even if the deck array was mutated elsewhere or indices are inconsistent.
  // Initialize empty hands
  for (let i = 0; i < numPlayers; i++) {
    gameState.players[i].hand = [];
  }

  // Deal one card to each player in turn until each has handSize cards
  for (let i = 0; i < handSize; i++) {
    for (let p = 0; p < numPlayers; p++) {
      const card = deck.pop(); // take from end of shuffled deck
      if (!card) break; // safety
      gameState.players[p].hand.push(card);
    }
  }

  // Sort and emit each player's hand
  gameState.players.forEach((player) => {
    sortHand(player.hand);
    io.to(player.id).emit("yourCards", player.hand);
  });

  // Debug: validate dealing counts and report any mismatch
  if (DEBUG_GAME) {
    const counts = gameState.players.map(p => p.hand.length);
    const totalDealt = counts.reduce((a,b) => a + b, 0);
    const expected = handSize * numPlayers;
    console.log('DEBUG: handSize=', handSize, 'counts=', counts, 'totalDealt=', totalDealt, 'expected=', expected, 'deckRemaining=', deck.length);

    if (totalDealt !== expected) {
      console.warn('DEBUG: Dealing mismatch detected');
      io.emit('message', `⚠️ Dealing mismatch: dealt ${totalDealt} expected ${expected}`);
    }
  }

  io.emit("message", `🕹️ Round ${gameState.round} started!`);
  updateGameState();
}

function nextTurn() {
  gameState.currentTurn = (gameState.currentTurn + 1) % 4;
  updateGameState();
}

function endTrick() {
  const trickWinner = determineTrickWinner();
  const points = calculatePoints(gameState.table);
  
  trickWinner.score += points;
  gameState.scores[trickWinner.id] += points;
  gameState.trickCount++;

  io.emit("trickWon", { 
    winnerId: trickWinner.id, 
    winnerName: trickWinner.name,
    taken: gameState.table.map(t => t.card),
    points 
  });

  // Reset trick
  gameState.table = [];
  gameState.leadingSuit = null;
  gameState.currentTurn = gameState.players.findIndex(p => p.id === trickWinner.id);

  updateGameState();

  // Check if round is complete (all tricks played)
  if (gameState.trickCount === gameState.handSize) {
    endRound();
  }
}

function determineTrickWinner() {
  const suit = gameState.leadingSuit;
  let winningPlay = gameState.table[0];
  const rankOrder = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
  };

  gameState.table.forEach(play => {
    const rank = (play.card.split(" of ")[0] || "").trim();
    const playSuit = (play.card.split(" of ")[1] || "").trim();
    const winningRank = (winningPlay.card.split(" of ")[0] || "").trim();

    // If the play matches the leading suit
    if (playSuit === suit) {
      // If rank is higher OR rank is equal (later play wins ties), choose this play
      if ((rankOrder[rank] || 0) >= (rankOrder[winningRank] || 0)) {
        winningPlay = play;
      }
    }
  });

  return gameState.players.find(p => p.id === winningPlay.playerId);
}

function calculatePoints(plays) {
  return plays.reduce((total, entry) => {
    const card = typeof entry === "string" ? entry : entry.card;
    
    if (!card || typeof card !== "string") return total;
    
    // Parse suit properly instead of using endsWith
    const [rank, , suit] = card.split(" ");
    
    // Each heart is worth 1 point
    if (suit === "Hearts") total += 1;
    
    // Each Q of Spades is worth 12 points (and we want to count duplicates!)
    if (suit === "Spades" && rank === "Q") total += 12;
    
    return total;
  }, 0);
}

function endRound() {
  // Emit round end with comprehensive data
  const roundResults = {
    players: gameState.players.map(p => ({
      id: p.id,
      name: p.name,
      roundPoints: p.score,
      totalScore: gameState.scores[p.id],
    })),
    round: gameState.round
  };

  io.emit("roundEnd", roundResults);
  
  // Reset for next round
  gameState.players.forEach(p => p.score = 0);
  gameState.table = [];
  gameState.leadingSuit = null;
  gameState.currentTurn = 0;
  gameState.gameInProgress = false;
  gameState.trickCount = 0;
  gameState.round++;

  // Start next round after 10 second delay
  setTimeout(() => {
    io.emit("message", `🃏 Starting Round ${gameState.round}...`);
    startGame();
  }, 10000); // 10 second delay
}

function updateGameState() {
  io.emit("gameState", {
    currentTurnPlayerId: gameState.players[gameState.currentTurn]?.id,
    players: sanitizePlayers(),
    trick: gameState.table,
    round: gameState.round,
    trickCount: gameState.trickCount
  });
}

function sanitizePlayers() {
  return gameState.players.map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    totalScore: gameState.scores[p.id] || 0,
    handCount: p.hand.length,
  }));
}

function resetGame() {
  Object.assign(gameState, {
    players: [],
    currentTurn: 0,
    gameInProgress: false,
    table: [],
    leadingSuit: null,
    scores: {},
    round: 1,
    trickCount: 0
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));