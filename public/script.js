const socket = io();
let myId = null;
let myHand = [];
let playersList = [];
// map id -> {id,name,score,handCount}
let playersMap = {};
const playerNameCache = new Map(); // Cache for player names

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

// Performance optimization variables
let renderHandTimeout = null;
let lastRenderedPlayers = null;
let messageBatch = [];
let messageBatchTimeout = null;

// ✅ Pre-compiled suit symbols
const suitSymbols = {
  'Hearts': '♥',
  'Spades': '♠', 
  'Clubs': '♣',
  'Diamonds': '♦'
};

// ✅ Helper to render visual cards (hearts red, spades black, etc.)
function renderCard(cardName) {
  if (!cardName) return "";

  const parts = cardName.split(" ");
  const rank = parts[0];
  const suitName = parts[2];
  const suitSymbol = suitSymbols[suitName] || "";

  return `<div class="card ${suitName?.toLowerCase() || ''}">
    <div class="card-content">
      <div class="card-rank">${rank}</div>
      <div class="card-suit">${suitSymbol}</div>
    </div>
  </div>`;
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
  playerNameCache.clear(); // Clear cache on player updates
  playersDiv.innerHTML = "";
  for (const p of list) {
    playersMap[p.id] = p;
    const d = document.createElement("div");
   // d.textContent = `${p.name} — ${p.totalScore || 0} pts`;  // Use totalScore for cumulative points
    playersDiv.appendChild(d);
  }
  renderScoreboard(list);
});

// ✅ Batch message handler
function addMessage(text) {
  messageBatch.push(text);
  
  if (!messageBatchTimeout) {
    messageBatchTimeout = setTimeout(() => {
      const frag = document.createDocumentFragment();
      messageBatch.forEach(txt => {
        const d = document.createElement("div");
        d.textContent = txt;
        frag.appendChild(d);
      });
      messagesDiv.appendChild(frag);
      trimMessages(100);
      
      messageBatch = [];
      messageBatchTimeout = null;
    }, 50);
  }
}

// ✅ Message updates
socket.on("message", addMessage);

// ✅ Receive initial hand
socket.on("yourCards", (cards) => {
  myHand = cards;
  renderHand();
});

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
  // addMessage(`${getPlayerName(playerId)} played ${card}`);
});

// ✅ Trick won event
socket.on("trickWon", ({ winnerId, taken }) => {
  addMessage(`${getPlayerName(winnerId)} won the trick (${taken.join(", ")})`);
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
  // if (headerDiv) {
  //   headerDiv.innerHTML = data.players
  //     .map(
  //       (p) => `<div><strong>${p.name}</strong>: ${p.totalScore} pts</div>`
  //     )
  //     .join("");
  // }

  // 🔥 BUG FIX: Update the main scoreboard after round ends
  renderScoreboard(data.players);
});

// ✅ Reset
socket.on("reset", () => {
  alert("Player left — game reset");
  location.reload();
});

// ✅ Render player hand visually with debouncing
function renderHand() {
  // Debounce rapid re-renders
  if (renderHandTimeout) {
    clearTimeout(renderHandTimeout);
  }
  
  renderHandTimeout = setTimeout(() => {
    // Use grid pattern for large hands (>13) and default grid rendering
    handDiv.classList.remove('pattern-grid');
    if (Array.isArray(myHand) && myHand.length > 13) {
      handDiv.classList.add('pattern-grid');
    }

    handDiv.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const c of myHand) {
      const el = document.createElement('div');
      el.className = 'card-item';
      el.innerHTML = renderCard(c);
      el.onclick = () => playCard(c);
      frag.appendChild(el);
    }
    handDiv.appendChild(frag);
    renderHandTimeout = null;
  }, 16); // ~60fps
}

// ✅ Render scoreboard (bottom horizontal bar) with change detection
function renderScoreboard(players, currentTurnId = null) {
  // Avoid re-rendering if data hasn't changed
  const playersKey = JSON.stringify(players) + currentTurnId;
  if (lastRenderedPlayers === playersKey) return;
  
  lastRenderedPlayers = playersKey;

  scoreboardDiv.innerHTML = "";
  const frag = document.createDocumentFragment();
  
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

    frag.appendChild(el);
  });
  
  scoreboardDiv.appendChild(frag);
}

// ✅ Play card action
function playCard(card) {
  socket.emit("playCard", card, (res) => {
    if (res && res.error) return alert(res.error);
    myHand = myHand.filter((c) => c !== card);
    renderHand();
  });
}

// ✅ Optimized helper to get player name with caching
function getPlayerName(id) {
  if (playerNameCache.has(id)) {
    return playerNameCache.get(id);
  }
  
  const p = playersMap[id] || playersList.find((x) => x.id === id);
  const name = p ? p.name : id;
  playerNameCache.set(id, name);
  return name;
}

// ✅ Efficient message trimming
function trimMessages(max) {
  const excess = messagesDiv.children.length - max;
  if (excess > 0) {
    for (let i = 0; i < excess; i++) {
      if (messagesDiv.firstChild) {
        messagesDiv.removeChild(messagesDiv.firstChild);
      }
    }
  }
}