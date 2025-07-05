const socket = io();
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
let scanner = null;

// Peões de identidade disponíveis
const IDENTITY_PAWNS = [
  { id: "white_man", icon: "👨🏻", label: "Homem Branco", color: "#3498db" },
  { id: "white_woman", icon: "👩🏻", label: "Mulher Branca", color: "#e74c3c" },
  { id: "black_man", icon: "👨🏿", label: "Homem Negro", color: "#8e44ad" },
  { id: "black_woman", icon: "👩🏿", label: "Mulher Negra", color: "#e67e22" },
  { id: "lgbtiqa", icon: "🏳️‍🌈", label: "LGBTIQA+", color: "#f39c12" },
  { id: "blind", icon: "🦯", label: "Pessoa Cega", color: "#16a085" },
  { id: "deaf", icon: "🤟", label: "Pessoa Surda", color: "#2980b9" },
  {
    id: "disabled",
    icon: "♿",
    label: "Pessoa com Deficiência Física",
    color: "#c0392b",
  },
  { id: "elderly", icon: "👴", label: "Pessoa Idosa", color: "#7f8c8d" },
  { id: "neutral", icon: "👤", label: "Neutro", color: "#34495e" },
];

// Elementos DOM
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
const moveBackwardBtn = document.getElementById("moveBackwardBtn");
const voteChoice = document.getElementById("voteChoice");

// Inicializar seletor de peões
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

// Selecionar peão
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

// Atualizar estado do botão de entrada
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

// APENAS opções de votação Avançar/Recuar
moveForwardBtn.addEventListener("click", () => {
  makeVote("forward");
});

moveBackwardBtn.addEventListener("click", () => {
  makeVote("backward");
});

function initQRScanner() {
  const qrScannerBtn = document.getElementById("qrScannerBtn");
  if (!qrScannerBtn) return;

  qrScannerBtn.addEventListener("click", startScanner);
}

function startScanner() {
  const scannerContainer = document.getElementById("qrScannerContainer");
  const videoElement = document.getElementById("qrScanner");

  scannerContainer.style.display = "block";

  scanner = new Instascan.Scanner({ video: videoElement });

  scanner.addListener("scan", function (content) {
    const url = new URL(content);
    const roomCode = url.searchParams.get("room");

    if (roomCode) {
      roomCodeInput.value = roomCode;
      updateJoinButton();
      stopScanner();
    }
  });

  Instascan.Camera.getCameras()
    .then(function (cameras) {
      if (cameras.length > 0) {
        scanner.start(cameras[0]);
      } else {
        alert("No cameras found");
        stopScanner();
      }
    })
    .catch(function (e) {
      console.error(e);
      alert("Error accessing camera");
      stopScanner();
    });
}

function stopScanner() {
  const scannerContainer = document.getElementById("qrScannerContainer");
  if (scanner) {
    scanner.stop();
  }
  scannerContainer.style.display = "none";
}

// Add this to check for room code in URL when page loads
function checkForRoomCodeInURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get("room");

  if (roomCode) {
    roomCodeInput.value = roomCode;
    updateJoinButton();
  }
}

// Fazer voto - APENAS avançar ou recuar
function makeVote(direction) {
  if (gameState.hasVoted) return;

  const vote = {
    direction: direction,
    description: direction === "forward" ? "Avançar" : "Recuar",
  };

  socket.emit("player-vote", vote);

  // Atualizar UI
  gameState.hasVoted = true;
  gameState.myVote = vote;

  // Ocultar seção de votação, mostrar confirmação
  votingSection.style.display = "none";
  voteConfirmed.style.display = "block";
  voteChoice.textContent = `Escolheste: ${vote.description}`;

  // Desabilitar botões
  moveForwardBtn.disabled = true;
  moveBackwardBtn.disabled = true;
}

// Atualizar exibição baseado no estado do jogo
function updateGameDisplay() {
  if (!gameState.gameStarted) return;

  if (gameState.cardDrawn && !gameState.hasVoted) {
    // Mostrar opções de votação
    waitingForCard.style.display = "none";
    votingSection.style.display = "block";
    voteConfirmed.style.display = "none";
    turnIndicator.textContent = "Carta sorteada - faz a tua escolha!";
  } else if (gameState.hasVoted) {
    // Mostrar confirmação de voto
    waitingForCard.style.display = "none";
    votingSection.style.display = "none";
    voteConfirmed.style.display = "block";
    turnIndicator.textContent = "Aguardando outros jogadores votarem...";
  } else {
    // Aguardando carta
    waitingForCard.style.display = "block";
    votingSection.style.display = "none";
    voteConfirmed.style.display = "none";
    turnIndicator.textContent = "Aguardando o anfitrião sortear uma carta...";
  }
}

socket.on("event-choice-required", (data) => {
  // Mostrar UI de escolha de evento
  showEventChoices(data.event, data.choices);
});

// Eventos de socket
socket.on("joined-room", (data) => {
  gameState.playerData = data.playerData;
  gameState.roomCode = data.roomCode;
  gameState.gameLevel = data.gameLevel || "basic";

  showStatus("Entrada no jogo bem-sucedida!", "success");
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

  // Store card data for button text updates
  const card = data.card;

  // Reset button states
  moveForwardBtn.disabled = false;
  moveBackwardBtn.disabled = false;

  // Update button text based on card steps
  if (card.forwardSteps === 0) {
    moveForwardBtn.innerHTML = "⏸️ Permanecer";
  } else {
    moveForwardBtn.innerHTML = "⬆️ Avançar";
  }

  if (card.backwardSteps === 0) {
    moveBackwardBtn.innerHTML = "⏸️ Permanecer";
  } else {
    moveBackwardBtn.innerHTML = "⬇️ Recuar";
  }

  // NÃO mostrar descrição da carta ao jogador
  // Apenas mostrar opções de votação
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
  showStatus("Professor desconectado. Jogo encerrado.", "error");
  setTimeout(() => location.reload(), 3000);
});

// Adicionar este novo manipulador de evento de socket ao script.js do jogador existente
socket.on("player-position-updated", (data) => {
  // Atualizar dados do jogador atual
  if (data.playerData && data.playerData.id === gameState.playerData?.id) {
    gameState.playerData.position = data.playerData.position;
    updateGamePlayerDisplay();
  }

  // Atualizar dados de todos os jogadores
  if (data.allPlayers) {
    gameState.players = data.allPlayers;
    updateOtherPlayersDisplay();
  }
});

// Modificar o manipulador de evento all-votes-received existente
socket.on("all-decisions-made", (data) => {
  gameState.players = data.allPlayers;
  gameState.cardDrawn = false;
  gameState.hasVoted = false;
  gameState.myVote = null;

  // Atualizar dados do jogador atual do array de jogadores atualizado
  const updatedPlayerData = gameState.players.find(
    (p) => p.id === gameState.playerData?.id
  );
  if (updatedPlayerData) {
    gameState.playerData = updatedPlayerData;
  }

  updateGamePlayerDisplay();
  updateOtherPlayersDisplay();
  updateGameDisplay();

  if (data.winner) {
    showWinner(data.winner);
  }
});

// Funções
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

// Também modificar a função updateGamePlayerDisplay para garantir atualizações adequadas
function updateGamePlayerDisplay() {
  const currentPlayerData =
    gameState.players.find((p) => p.id === gameState.playerData?.id) ||
    gameState.playerData;
  if (currentPlayerData) {
    const pawn = IDENTITY_PAWNS.find(
      (p) =>
        p.id === currentPlayerData.pawnId || p.id === currentPlayerData.identity
    );
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

  // Atualizar lista da sala de espera
  const otherPlayersList = document.getElementById("otherPlayersList");
  if (otherPlayersList) {
    otherPlayersList.innerHTML = "";
    otherPlayers.forEach((player) => {
      const pawn = IDENTITY_PAWNS.find(
        (p) => p.id === player.pawnId || p.id === player.identity
      );
      const playerElement = document.createElement("div");
      playerElement.className = "other-player";
      playerElement.innerHTML = `
                        <div class="other-player-pawn">${
                          pawn ? pawn.icon : "👤"
                        }</div>
                        <div class="player-details">
                            <div class="player-name">${player.name}</div>
                            <div class="player-position">Anel: ${
                              player.position
                            }</div>
                        </div>
                    `;
      otherPlayersList.appendChild(playerElement);
    });
  }

  // Atualizar lista da visualização do jogo
  const gameOtherPlayersList = document.getElementById("gameOtherPlayersList");
  if (gameOtherPlayersList) {
    gameOtherPlayersList.innerHTML = "";
    otherPlayers.forEach((player) => {
      const pawn = IDENTITY_PAWNS.find(
        (p) => p.id === player.pawnId || p.id === player.identity
      );
      const playerElement = document.createElement("div");
      playerElement.className = "other-player";
      playerElement.innerHTML = `
                        <div class="other-player-pawn">${
                          pawn ? pawn.icon : "👤"
                        }</div>
                        <div class="player-details">
                            <div class="player-name">${player.name}</div>
                            <div class="player-position">Anel: ${
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
    basic: "Nível Básico",
    intermediate: "Nível Intermediário",
    advanced: "Nível Avançado",
  };

  difficultyBadge.textContent =
    levelNames[gameState.gameLevel] || "Nível Básico";
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
    winnerText.innerHTML = `🎉 Você chegou ao centro primeiro! 🎉<br>Sua jornada através da espiral está completa.`;
  } else {
    winnerText.innerHTML = `${winner.name} chegou ao centro primeiro.<br>A jornada de cada um conta uma história diferente.`;
  }

  gameActive.style.display = "none";
  winnerAnnouncement.style.display = "block";
}

function showEventChoices(event, choices) {
  // Ocultar outros elementos da UI
  votingSection.style.display = "none";
  voteConfirmed.style.display = "none";
  waitingForCard.style.display = "none";

  // Mostrar UI de escolha de evento
  const eventChoiceSection = document.getElementById("eventChoiceSection");
  eventChoiceSection.style.display = "block";

  document.getElementById(
    "eventDescription"
  ).textContent = `${event.name}: ${event.description}`;

  const choicesContainer = document.getElementById("eventChoices");
  choicesContainer.innerHTML = "";

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "event-choice-btn";
    button.textContent = choice.text;
    button.onclick = () =>
      makeEventChoice(event.type, choice.id, choice.targetId);
    choicesContainer.appendChild(button);
  });
}

function makeEventChoice(eventType, decision, targetId = null) {
  socket.emit("event-decision", {
    eventType: eventType,
    decision: decision,
    targetPlayerId: targetId,
  });

  // Ocultar UI de escolha de evento
  document.getElementById("eventChoiceSection").style.display = "none";

  // Mostrar mensagem de espera
  turnIndicator.textContent = "Escolha de evento feita - processando...";
}

// Inicializar
// initializePawnSelector();
document.addEventListener("DOMContentLoaded", function () {
  initializePawnSelector();
  initQRScanner();
  checkForRoomCodeInURL();
});
