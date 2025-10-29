const socket = io();
let myId = null;
let myHand = [];
let playersList = [];

const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");
const playersDiv = document.getElementById("players");
const messagesDiv = document.getElementById("messages");
const lobby = document.getElementById("lobby");
const gameDiv = document.getElementById("game");
const handDiv = document.getElementById("hand");
const tableDiv = document.getElementById("table");
const scoreboardDiv = document.getElementById("scoreboard");

// ✅ Helper to render visual cards (hearts red, spades black, etc.)
function renderCard(cardName) {
  if (!cardName) return "";

  const [rank, , suitName] = cardName.split(" ");
  const suitSymbol =
    suitName === "Hearts" ? "♥" :
    suitName === "Spades" ? "♠" :
    suitName === "Clubs" ? "♣" :
    suitName === "Diamonds" ? "♦" : "";

  return `<div class="card ${suitName?.toLowerCase() || ''}">${rank}${suitSymbol}</div>`;
}

// ✅ Join game
joinBtn.onclick = () => {
  const name = nameInput.value.trim() || "Guest";
  socket.emit("join", name, (res) => {
    if (res && res.error) return alert(res.error);
    myId = res.id;
    lobby.classList.add("hidden");
    gameDiv.classList.remove("hidden");
  });
};

// ✅ Player list updates
socket.on("playerList", (list) => {
  playersList = list;
  playersDiv.innerHTML = "";
  for (const p of list) {
    const d = document.createElement("div");
    d.textContent = `${p.name} — ${p.score} pts`;
    playersDiv.appendChild(d);
  }
  renderScoreboard(list);
});

// ✅ Message updates
socket.on("message", (txt) => {
  const d = document.createElement("div");
  d.textContent = txt;
  messagesDiv.appendChild(d);
});

// ✅ Receive initial hand
socket.on("yourCards", (cards) => {
  myHand = cards;
  renderHand();
});

// ✅ Update game state (turns, table)
// ✅ Update game state (turns, table)
socket.on("gameState", (state) => {
  // Clear old table and show whose turn it is
  tableDiv.innerHTML = `<div class="turn-info">Turn: ${getPlayerName(state.currentTurnPlayerId)}</div>`;

  // Show currently played cards in one horizontal line
  if (state.trick && state.trick.length) {
    const cardsRow = document.createElement("div");
    cardsRow.className = "played-cards-row";

    state.trick.forEach((t) => {
      const wrapper = document.createElement("div");
      wrapper.classList.add("played-card-horizontal");
      wrapper.innerHTML = `
        <div class="player-name">${getPlayerName(t.playerId)}</div>
        ${renderCard(t.card)}
      `;
      cardsRow.appendChild(wrapper);
    });

    tableDiv.appendChild(cardsRow);
  }

  renderScoreboard(state.players);
});


// ✅ Card played event
socket.on("cardPlayed", ({ playerId, card }) => {
  const d = document.createElement("div");
  d.textContent = `${getPlayerName(playerId)} played ${card}`;
  messagesDiv.appendChild(d);
});


// ✅ Trick won event
socket.on("trickWon", ({ winnerId, taken }) => {
  const d = document.createElement("div");
  d.textContent = `${getPlayerName(winnerId)} won the trick (${taken.join(", ")})`;
  messagesDiv.appendChild(d);
});

// ✅ Round end event
socket.on("roundEnd", (data) => {
  const summary = data.players
    .map((p) => `${p.name}: +${p.roundPoints} (Total: ${p.totalScore})`)
    .join("\n");
  const d = document.createElement("div");
  d.textContent = `\nRound ended:\n${summary}`;
  messagesDiv.appendChild(d);

  // ✅ Update header scores after each round
  const headerDiv = document.getElementById("header-scores");
  if (headerDiv) {
    headerDiv.innerHTML = data.players
      .map(
        (p) => `<div><strong>${p.name}</strong>: ${p.totalScore} pts</div>`
      )
      .join("");
  }
});

// ✅ Reset
socket.on("reset", () => {
  alert("Player left — game reset");
  location.reload();
});

// ✅ Render player hand visually
function renderHand() {
  handDiv.innerHTML = "";
  for (const c of myHand) {
    const el = document.createElement("div");
    el.className = "card-item";
    el.innerHTML = renderCard(c);
    el.onclick = () => playCard(c);
    handDiv.appendChild(el);
  }
}

// ✅ Render scoreboard (bottom horizontal bar)
function renderScoreboard(players) {
  scoreboardDiv.innerHTML = "";
  for (const p of players) {
    const el = document.createElement("div");
    el.className = "card-item";
    el.textContent = `${p.name}: ${p.totalScore || p.score || 0}`;
    scoreboardDiv.appendChild(el);
  }
}

// ✅ Play card action
function playCard(card) {
  socket.emit("playCard", card, (res) => {
    if (res && res.error) return alert(res.error);
    myHand = myHand.filter((c) => c !== card);
    renderHand();
  });
}

// ✅ Helper to get player name
function getPlayerName(id) {
  const p = playersList.find((x) => x.id === id);
  return p ? p.name : id;
}
