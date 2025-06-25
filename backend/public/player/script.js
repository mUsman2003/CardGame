const localIp = window.location.hostname; // Automatically gets the IP when on the same network
const socket = io(`http://${localIp}:3000`);
let gameState = {
  playerData: null,
  roomCode: null,
  selectedPawn: null,
  players: [],
  currentPlayer: null,
  gameStarted: false,
  gameLevel: "basic",
  cardDrawn: false,
  hasVoted: false,
  myVote: null,
};

// Available identity pawns
const IDENTITY_PAWNS = [
  { id: "white_man", icon: "👨🏻", label: "White Man", color: "#3498db" },
  { id: "white_woman", icon: "👩🏻", label: "White Woman", color: "#e74c3c" },
  { id: "black_man", icon: "👨🏿", label: "Black Man", color: "#8e44ad" },
  { id: "black_woman", icon: "👩🏿", label: "Black Woman", color: "#e67e22" },
  { id: "lgbtiqa", icon: "🏳️‍🌈", label: "LGBTIQA+", color: "#f39c12" },
  { id: "blind", icon: "🦯", label: "Blind Person", color: "#16a085" },
  { id: "deaf", icon: "🤟", label: "Deaf Person", color: "#2980b9" },
  {
    id: "disabled",
    icon: "♿",
    label: "Physically Disabled",
    color: "#c0392b",
  },
  { id: "elderly", icon: "👴", label: "Elderly Person", color: "#7f8c8d" },
  { id: "neutral", icon: "👤", label: "Neutral", color: "#34495e" },
];

// DOM elements
const joinForm = document.getElementById("joinForm");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const pawnSelector = document.getElementById("pawnSelector");
const joinBtn = document.getElementById("joinBtn");
const statusMessage = document.getElementById("statusMessage");
const waitingRoom = document.getElementById("waitingRoom");
const gameActive = document.getElementById("gameActive");
const winnerAnnouncement = document.getElementById("winnerAnnouncement");
const turnIndicator = document.getElementById("turnIndicator");
const waitingForCard = document.getElementById("waitingForCard");
const votingSection = document.getElementById("votingSection");
const voteConfirmed = document.getElementById("voteConfirmed");
const moveForwardBtn = document.getElementById("moveForwardBtn");
const moveDontBtn = document.getElementById("moveDontBtn");
const moveBackwardBtn = document.getElementById("moveBackwardBtn");
const voteChoice = document.getElementById("voteChoice");

// Initialize pawn selector
function initializePawnSelector() {
  pawnSelector.innerHTML = "";
  IDENTITY_PAWNS.forEach((pawn) => {
    const pawnOption = document.createElement("div");
    pawnOption.className = "pawn-option";
    pawnOption.innerHTML = `
                    <div class="pawn-icon">${pawn.icon}</div>
                    <div class="pawn-label">${pawn.label}</div>
                `;
    pawnOption.addEventListener("click", () => selectPawn(pawn));
    pawnSelector.appendChild(pawnOption);
  });
}

// Select pawn
function selectPawn(pawn) {
  const pawnOptions = document.querySelectorAll(".pawn-option");
  pawnOptions.forEach((option) => option.classList.remove("selected"));

  const selectedOption = Array.from(pawnOptions).find(
    (option) => option.querySelector(".pawn-label").textContent === pawn.label
  );
  if (selectedOption && !selectedOption.classList.contains("disabled")) {
    selectedOption.classList.add("selected");
    gameState.selectedPawn = pawn;
    updateJoinButton();
  }
}

// Update join button state
function updateJoinButton() {
  const canJoin =
    playerNameInput.value.trim() &&
    roomCodeInput.value.trim() &&
    gameState.selectedPawn;
  joinBtn.disabled = !canJoin;
}

// Event listeners
playerNameInput.addEventListener("input", updateJoinButton);
roomCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
  updateJoinButton();
});

joinBtn.addEventListener("click", () => {
  const playerName = playerNameInput.value.trim();
  const roomCode = roomCodeInput.value.trim();

  if (playerName && roomCode && gameState.selectedPawn) {
    socket.emit("join-room", {
      roomCode: roomCode,
      playerName: playerName,
      playerPawn: gameState.selectedPawn,
    });
  }
});

// ONLY Forward/Backward voting options
moveForwardBtn.addEventListener("click", () => {
  makeVote("forward");
});

moveDontBtn.addEventListener("click", () => {
  makeVote("moveDontBtn");
});

moveBackwardBtn.addEventListener("click", () => {
  makeVote("backward");
});

// Make vote - ONLY forward or backward
function makeVote(direction) {
  if (gameState.hasVoted) return;

  const vote = {
    direction: direction,
    description: direction === "forward" ? "Move Forward" : "Move Backward",
  };

  socket.emit("player-vote", vote);

  // Update UI
  gameState.hasVoted = true;
  gameState.myVote = vote;

  // Hide voting section, show confirmation
  votingSection.style.display = "none";
  voteConfirmed.style.display = "block";
  voteChoice.textContent = `You chose: ${vote.description}`;

  // Disable buttons
  moveForwardBtn.disabled = true;
  moveBackwardBtn.disabled = true;
  moveDontBtn.disabled = true;
}

// Update display based on game state
function updateGameDisplay() {
  if (!gameState.gameStarted) return;

  if (gameState.cardDrawn && !gameState.hasVoted) {
    // Show voting options
    waitingForCard.style.display = "none";
    votingSection.style.display = "block";
    voteConfirmed.style.display = "none";
    turnIndicator.textContent = "Card drawn - make your choice!";
  } else if (gameState.hasVoted) {
    // Show vote confirmation
    waitingForCard.style.display = "none";
    votingSection.style.display = "none";
    voteConfirmed.style.display = "block";
    turnIndicator.textContent = "Waiting for other players to vote...";
  } else {
    // Waiting for card
    waitingForCard.style.display = "block";
    votingSection.style.display = "none";
    voteConfirmed.style.display = "none";
    turnIndicator.textContent = "Waiting for host to draw a card...";
  }
}

// Socket events
socket.on("joined-room", (data) => {
  gameState.playerData = data.playerData;
  gameState.roomCode = data.roomCode;
  gameState.gameLevel = data.gameLevel || "basic";

  showStatus("Successfully joined the game!", "success");
  joinForm.style.display = "none";
  waitingRoom.style.display = "block";

  updatePlayerDisplay();
});

socket.on("join-error", (error) => {
  showStatus(error, "error");
});

socket.on("room-updated", (data) => {
  gameState.players = data.players;
  gameState.gameLevel = data.gameLevel || "basic";
  updateOtherPlayersDisplay();
  updateAvailablePawns(data.availablePawns);
});

socket.on("game-started", (data) => {
  gameState.gameStarted = true;
  gameState.currentPlayer = data.currentPlayer;
  gameState.gameLevel = data.gameLevel || "basic";
  gameState.players = data.players;
  gameState.cardDrawn = false;
  gameState.hasVoted = false;

  waitingRoom.style.display = "none";
  gameActive.style.display = "block";

  updateGamePlayerDisplay();
  updateDifficultyDisplay();
  updateGameDisplay();
});

socket.on("card-drawn", (data) => {
  gameState.cardDrawn = true;
  gameState.hasVoted = false;
  gameState.myVote = null;

  // Reset buttons
  moveForwardBtn.disabled = false;
  moveBackwardBtn.disabled = false;
  moveDontBtn.disabled = false;

  // Do NOT show card description to player
  // Only show voting options
  updateGameDisplay();
});

socket.on("all-votes-received", (data) => {
  gameState.players = data.players;
  gameState.cardDrawn = false;
  gameState.hasVoted = false;
  gameState.myVote = null;

  updateGamePlayerDisplay();
  updateOtherPlayersDisplay();
  updateGameDisplay();

  if (data.winner) {
    showWinner(data.winner);
  }
});

socket.on("game-ended", (data) => {
  showWinner(data.winner);
});

socket.on("host-disconnected", () => {
  showStatus("Teacher disconnected. Game ended.", "error");
  setTimeout(() => location.reload(), 3000);
});

// Functions
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.style.display = "block";

  setTimeout(() => {
    statusMessage.style.display = "none";
  }, 5000);
}

function updatePlayerDisplay() {
  if (gameState.playerData) {
    const pawn = IDENTITY_PAWNS.find(
      (p) => p.id === gameState.playerData.pawnId
    );
    if (pawn) {
      document.getElementById("playerPawn").innerHTML = pawn.icon;
      document.getElementById("playerDisplayName").textContent =
        gameState.playerData.name;
      document.getElementById("playerPosition").textContent =
        gameState.playerData.position;
    }
  }
}

function updateGamePlayerDisplay() {
  const currentPlayerData = gameState.players.find(
    (p) => p.id === gameState.playerData?.id
  );
  if (currentPlayerData) {
    const pawn = IDENTITY_PAWNS.find((p) => p.id === currentPlayerData.pawnId);
    if (pawn) {
      document.getElementById("gamePlayerPawn").innerHTML = pawn.icon;
      document.getElementById("gamePlayerName").textContent =
        currentPlayerData.name;
      document.getElementById("gamePlayerPosition").textContent =
        currentPlayerData.position;
    }
  }
}

function updateOtherPlayersDisplay() {
  const otherPlayers = gameState.players.filter(
    (p) => p.id !== gameState.playerData?.id
  );
  document.getElementById("otherPlayerCount").textContent = otherPlayers.length;

  // Update waiting room list
  const otherPlayersList = document.getElementById("otherPlayersList");
  if (otherPlayersList) {
    otherPlayersList.innerHTML = "";
    otherPlayers.forEach((player) => {
      const pawn = IDENTITY_PAWNS.find((p) => p.id === player.pawnId);
      const playerElement = document.createElement("div");
      playerElement.className = "other-player";
      playerElement.innerHTML = `
                        <div class="other-player-pawn">${
                          pawn ? pawn.icon : "👤"
                        }</div>
                        <div class="player-details">
                            <div class="player-name">${player.name}</div>
                            <div class="player-position">Ring: ${
                              player.position
                            }</div>
                        </div>
                    `;
      otherPlayersList.appendChild(playerElement);
    });
  }

  // Update game view list
  const gameOtherPlayersList = document.getElementById("gameOtherPlayersList");
  if (gameOtherPlayersList) {
    gameOtherPlayersList.innerHTML = "";
    otherPlayers.forEach((player) => {
      const pawn = IDENTITY_PAWNS.find((p) => p.id === player.pawnId);
      const playerElement = document.createElement("div");
      playerElement.className = "other-player";
      playerElement.innerHTML = `
                        <div class="other-player-pawn">${
                          pawn ? pawn.icon : "👤"
                        }</div>
                        <div class="player-details">
                            <div class="player-name">${player.name}</div>
                            <div class="player-position">Ring: ${
                              player.position
                            }</div>
                        </div>
                    `;
      gameOtherPlayersList.appendChild(playerElement);
    });
  }
}

function updateDifficultyDisplay() {
  const difficultyBadge = document.getElementById("difficultyBadge");
  difficultyBadge.className = `difficulty-badge difficulty-${gameState.gameLevel}`;

  const levelNames = {
    basic: "Basic Level",
    intermediate: "Intermediate Level",
    advanced: "Advanced Level",
  };

  difficultyBadge.textContent =
    levelNames[gameState.gameLevel] || "Basic Level";
}

function updateAvailablePawns(availablePawns) {
  const pawnOptions = document.querySelectorAll(".pawn-option");
  IDENTITY_PAWNS.forEach((pawn, index) => {
    const option = pawnOptions[index];
    if (availablePawns && availablePawns.includes(pawn.id)) {
      option.classList.remove("disabled");
    } else if (availablePawns) {
      option.classList.add("disabled");
      if (gameState.selectedPawn && gameState.selectedPawn.id === pawn.id) {
        option.classList.remove("selected");
        gameState.selectedPawn = null;
        updateJoinButton();
      }
    }
  });
}

function showWinner(winner) {
  const winnerText = document.getElementById("winnerText");
  const isWinner = winner.id === gameState.playerData?.id;

  if (isWinner) {
    winnerText.innerHTML = `🎉 You reached the center first! 🎉<br>Your journey through the spiral is complete.`;
  } else {
    winnerText.innerHTML = `${winner.name} reached the center first.<br>Everyone's journey tells a different story.`;
  }

  gameActive.style.display = "none";
  winnerAnnouncement.style.display = "block";
}

// Initialize
initializePawnSelector();
