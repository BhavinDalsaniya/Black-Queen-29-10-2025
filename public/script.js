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

joinBtn.onclick = () => {
  const name = nameInput.value.trim() || "Guest";
  socket.emit("join", name, (res) => {
    if (res && res.error) return alert(res.error);
    myId = res.id;
    lobby.classList.add("hidden");
    gameDiv.classList.remove("hidden");
  });
};

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

socket.on("message", (txt) => {
  const d = document.createElement("div");
  d.textContent = txt;
  messagesDiv.appendChild(d);
});

socket.on("yourCards", (cards) => {
  myHand = cards;
  renderHand();
});

socket.on("gameState", (state) => {
  tableDiv.innerHTML = `<div>Turn: ${getPlayerName(state.currentTurnPlayerId)}</div>`;
  if (state.trick && state.trick.length) {
    const html = state.trick
      .map((t) => `<div>${getPlayerName(t.playerId)}: ${t.card}</div>`)
      .join("");
    tableDiv.innerHTML += html;
  }
  renderScoreboard(state.players);
});

socket.on("cardPlayed", ({ playerId, card }) => {
  const d = document.createElement("div");
  d.textContent = `${getPlayerName(playerId)} played ${card}`;
  messagesDiv.appendChild(d);
});

socket.on("trickWon", ({ winnerId, taken }) => {
  const d = document.createElement("div");
  d.textContent = `${getPlayerName(winnerId)} won the trick (${taken.join(", ")})`;
  messagesDiv.appendChild(d);
});

socket.on("roundEnd", (data) => {
  const summary = data.players
    .map((p) => `${p.name}: +${p.roundPoints} (Total: ${p.totalScore})`)
    .join("\n");
  const d = document.createElement("div");
  d.textContent = `\nRound ended:\n${summary}`;
  messagesDiv.appendChild(d);
});

socket.on("reset", () => {
  alert("Player left — game reset");
  location.reload();
});

function renderHand() {
  handDiv.innerHTML = "";
  for (const c of myHand) {
    const el = document.createElement("div");
    el.className = "card-item";
    el.textContent = c;
    el.onclick = () => playCard(c);
    handDiv.appendChild(el);
  }
}

function renderScoreboard(players) {
  scoreboardDiv.innerHTML = "";
  for (const p of players) {
    const el = document.createElement("div");
    el.className = "card-item";
    el.textContent = `${p.name}: ${p.totalScore || p.score || 0}`;
    scoreboardDiv.appendChild(el);
  }
}

function playCard(card) {
  socket.emit("playCard", card, (res) => {
    if (res && res.error) return alert(res.error);
    myHand = myHand.filter((c) => c !== card);
    renderHand();
  });
}

function getPlayerName(id) {
  const p = playersList.find((x) => x.id === id);
  return p ? p.name : id;
}
