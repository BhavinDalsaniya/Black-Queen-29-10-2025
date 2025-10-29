const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createDeck, shuffleDeck } = require("./deck");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = [];
let currentTurn = 0;
let gameInProgress = false;
let table = [];
let leadingSuit = null;
let scores = {};
let round = 1;

io.on("connection", (socket) => {
  socket.on("join", (name, callback) => {
    if (players.length >= 4) return callback({ error: "Room full" });

    players.push({ id: socket.id, name, hand: [], score: 0 });
    scores[socket.id] = scores[socket.id] || 0;

    io.emit("playerList", players);
    callback({ id: socket.id });

    if (players.length === 4) startGame();
  });

  socket.on("playCard", (card, callback) => {
    const player = players[currentTurn];
    if (!player || player.id !== socket.id)
      return callback({ error: "Not your turn" });

    const idx = player.hand.indexOf(card);
    if (idx === -1) return callback({ error: "Card not found" });

    // Enforce following suit
    const suit = card.split(" of ")[1];
    if (leadingSuit && suit !== leadingSuit) {
      const hasSuit = player.hand.some((c) => c.endsWith(leadingSuit));
      if (hasSuit)
        return callback({ error: `You must follow ${leadingSuit}` });
    }

    player.hand.splice(idx, 1);
    table.push({ playerId: socket.id, card });
    io.emit("cardPlayed", { playerId: socket.id, card });

    if (table.length === 1) leadingSuit = suit;

    if (table.length === 4) {
      endTrick();
    } else {
      nextTurn();
    }

    callback({ success: true });
  });

  socket.on("disconnect", () => {
    players = players.filter((p) => p.id !== socket.id);
    io.emit("reset");
    resetGame();
  });
});

function startGame() {
  gameInProgress = true;
  table = [];
  leadingSuit = null;
  currentTurn = 0;

  const deck = shuffleDeck(createDeck());
  const hands = [[], [], [], []];
  for (let i = 0; i < 52; i++) {
    hands[i % 4].push(deck[i]);
  }

  players.forEach((p, i) => {
    p.hand = hands[i];
    io.to(p.id).emit("yourCards", p.hand);
  });

  io.emit("message", `🕹️ Round ${round} started!`);
  updateGameState();
}

function nextTurn() {
  currentTurn = (currentTurn + 1) % 4;
  updateGameState();
}

function endTrick() {
  const suit = leadingSuit;
  let winning = table[0];
  const rankOrder = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
  };

  // Find highest card of the leading suit
  for (const play of table) {
    const [rank, , s] = play.card.split(" ");
    if (s === suit && rankOrder[rank] > rankOrder[winning.card.split(" ")[0]]) {
      winning = play;
    }
  }

  const winner = players.find((p) => p.id === winning.playerId);
  const points = calculatePoints(table);
  winner.score += points;
  scores[winner.id] += points;

  io.emit("trickWon", { winnerId: winner.id, taken: table.map(t => t.card) });

  // 🧩 Immediately broadcast updated scores
  updateGameState();

  // Reset trick
  table = [];
  leadingSuit = null;
  currentTurn = players.findIndex((p) => p.id === winner.id);

  // If all cards played, round ends
  if (players.every((p) => p.hand.length === 0)) {
    endRound();
  } else {
    updateGameState();
  }
}

function calculatePoints(cards) {
  let pts = 0;

  for (const entry of cards) {
    const c = typeof entry === "string" ? entry : entry.card;

    if (!c || typeof c !== "string") continue;

    if (c.endsWith("Hearts")) pts += 1;
    if (c.includes("Queen of Spades") || c.includes("Q of Spades")) pts += 12;
  }

  return pts;
}

function endRound() {
  io.emit("roundEnd", {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      roundPoints: p.score,
      totalScore: scores[p.id],
    })),
  });

  // Reset per-round fields
  players.forEach((p) => (p.score = 0));
  table = [];
  leadingSuit = null;
  currentTurn = 0;
  gameInProgress = false;
  round++;

  // Delay before next round
  setTimeout(() => {
    io.emit("message", `🃏 Starting Round ${round}...`);
    startGame();
  }, 3000);
}

function updateGameState() {
  io.emit("gameState", {
    currentTurnPlayerId: players[currentTurn]?.id,
    players,
    trick: table,
  });
}

function resetGame() {
  players = [];
  currentTurn = 0;
  table = [];
  leadingSuit = null;
  gameInProgress = false;
}

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
