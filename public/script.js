const socket = io();
let myId = null;
let myHand = [];
let playersList = [];
// map id -> {id,name,score,handCount}
let playersMap = {};

const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");
const playersDiv = document.getElementById("players");
const messagesDiv = document.getElementById("messages");
const lobby = document.getElementById("lobby");
const gameDiv = document.getElementById("game");
const handDiv = document.getElementById("hand");
const tableDiv = document.getElementById("table");
const scoreboardDiv = document.getElementById("scoreboard");
// Reusable elements for the center play area to avoid rebuilding the container
const turnInfoEl = document.createElement("div");
turnInfoEl.className = "turn-info";
const cardsRowEl = document.createElement("div");
cardsRowEl.className = "played-cards-row";
tableDiv.appendChild(turnInfoEl);
tableDiv.appendChild(cardsRowEl);

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
  // Build a quick lookup map for fast name/score access
  playersMap = {};
  playersDiv.innerHTML = "";
  for (const p of list) {
    playersMap[p.id] = p;
    const d = document.createElement("div");
    d.textContent = `${p.name} — ${p.score || 0} pts`;
    playersDiv.appendChild(d);
  }
  renderScoreboard(list);
});

// ✅ Message updates
socket.on("message", (txt) => {
  const d = document.createElement("div");
  d.textContent = txt;
  messagesDiv.appendChild(d);
  // Keep messages bounded to avoid memory/DOM blowup
  trimMessages(100);
});

// ✅ Receive initial hand
socket.on("yourCards", (cards) => {
  myHand = cards;
  renderHand();
});

// ✅ Update game state (turns, table)
// ✅ Update game state (turns, table)
// ✅ Update game state (turns, table)
socket.on("gameState", (state) => {
  const currentTurnId = state.currentTurnPlayerId;

  // Turn Info (update existing element instead of rebuilding container)
  turnInfoEl.textContent = `Turn: ${getPlayerName(currentTurnId)}`;

  // Played cards: reuse a single row element and replace its children
  while (cardsRowEl.firstChild) cardsRowEl.removeChild(cardsRowEl.firstChild);
  if (state.trick && state.trick.length) {
    const frag = document.createDocumentFragment();
    state.trick.forEach((t) => {
      const wrapper = document.createElement("div");
      wrapper.classList.add("played-card-horizontal");
      wrapper.innerHTML = `
        <div class="player-name">${getPlayerName(t.playerId)}</div>
        ${renderCard(t.card)}
      `;
      frag.appendChild(wrapper);
    });
    cardsRowEl.appendChild(frag);
  }

  // Update scoreboard with highlight
  renderScoreboard(state.players, currentTurnId);
});



// ✅ Card played event
socket.on("cardPlayed", ({ playerId, card }) => {
  const d = document.createElement("div");
  d.textContent = `${getPlayerName(playerId)} played ${card}`;
  messagesDiv.appendChild(d);
  trimMessages(100);
});


// ✅ Trick won event
socket.on("trickWon", ({ winnerId, taken }) => {
  const d = document.createElement("div");
  d.textContent = `${getPlayerName(winnerId)} won the trick (${taken.join(", ")})`;
  messagesDiv.appendChild(d);
  // Keep messages bounded when tricks finish
  trimMessages(100);
});

// ✅ Round end event
socket.on("roundEnd", (data) => {
  const summary = data.players
    .map((p) => `${p.name}: +${p.roundPoints} (Total: ${p.totalScore})`)
    .join("\n");
  const d = document.createElement("div");
  d.textContent = `\nRound ended:\n${summary}`;
  messagesDiv.appendChild(d);

  trimMessages(100);

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
  // Use a fragment to minimize reflows
  handDiv.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const c of myHand) {
    const el = document.createElement("div");
    el.className = "card-item";
    el.innerHTML = renderCard(c);
    el.onclick = () => playCard(c);
    frag.appendChild(el);
  }
  handDiv.appendChild(frag);
}

// ✅ Render scoreboard (bottom horizontal bar)
function renderScoreboard(players, currentTurnId = null) {
  scoreboardDiv.innerHTML = "";
  players.forEach((p) => {
    const el = document.createElement("div");
    el.className = "scoreboard-player";
    // players may be sanitized (handCount only). Normalize score display.
    const scoreVal = (typeof p.totalScore !== 'undefined') ? p.totalScore : ((typeof p.score !== 'undefined') ? p.score : 0);
    el.textContent = `${p.name}: ${scoreVal}`;
    // Optionally show number of cards left
    if (typeof p.handCount === 'number') {
      el.title = `${p.handCount} cards left`;
    }

    // 🔥 Highlight the current player's turn
    if (p.id === currentTurnId) {
      el.classList.add("active-player");
    }

    scoreboardDiv.appendChild(el);
  });
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
  const p = playersMap[id] || playersList.find((x) => x.id === id);
  return p ? p.name : id;
}

function trimMessages(max) {
  while (messagesDiv.children.length > max) {
    messagesDiv.removeChild(messagesDiv.firstChild);
  }
}
