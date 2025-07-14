const socket = io();
let gameState = {
  roomCode: null,
  players: [],
  gameStarted: false,
  gameLevel: "basic",
  currentPlayer: null,
  nextCardType: "privilege-discrimination",
  phase: "waiting", // 'waiting', 'card-drawn', 'decisions', 'moving'
  currentCard: null,
  playerDecisions: {},
};

// Elementos DOM
const createRoomBtn = document.getElementById("createRoomBtn");
const roomInfo = document.getElementById("roomInfo");
const roomCodeDiv = document.getElementById("roomCode");
const startGameBtn = document.getElementById("startGameBtn");
const playersSection = document.getElementById("players-section");
const playersGrid = document.getElementById("playersGrid");
const playerCount = document.getElementById("playerCount");
const gameBoard = document.getElementById("game-board");
const gameControls = document.getElementById("game-controls");
const currentPlayerName = document.getElementById("currentPlayerName");
const currentPlayerStatus = document.getElementById("currentPlayerStatus");
const winnerAnnouncement = document.getElementById("winner-announcement");
const winnerText = document.getElementById("winnerText");
const eventNotification = document.getElementById("eventNotification");
const eventText = document.getElementById("eventText");

// Elementos de fase
const cardDrawnDisplay = document.getElementById("cardDrawnDisplay");
const cardDescription = document.getElementById("cardDescription");
const decisionPhase = document.getElementById("decisionPhase");
const playerDecisions = document.getElementById("playerDecisions");
const decisionsCount = document.getElementById("decisionsCount");
const totalPlayers = document.getElementById("totalPlayers");
const progressFill = document.getElementById("progressFill");
const proceedBtn = document.getElementById("proceedBtn");

// Elementos de puxar carta do anfitrião
const hostDrawCardSection = document.getElementById("hostDrawCardSection");
const hostDrawCardBtn = document.getElementById("hostDrawCardBtn");

// Amostras de cartas atualizadas com novo formato
let HOST_SAMPLE_CARDS = {};

// Criar sala
createRoomBtn.addEventListener("click", () => {
  socket.emit("create-room");
});

// Iniciar jogo
startGameBtn.addEventListener("click", () => {
  const level = document.getElementById("gameLevel").value;
  socket.emit("start-game", level);
});

// Eventos do socket
socket.on("room-created", (data) => {
  gameState.roomCode = data.roomCode;
  roomCodeDiv.textContent = data.roomCode;
  roomInfo.style.display = "block";
  playersSection.style.display = "block";
  createRoomBtn.style.display = "none";
  createSpiralBoard();
  generateQRCode(data.roomCode);
});

socket.on("room-updated", (data) => {
  gameState.players = data.players;
  updatePlayersDisplay();
  updateStartButton();
});

socket.on("game-started", (data) => {
  gameState.gameStarted = true;
  gameState.gameLevel = data.gameLevel;
  gameState.currentPlayer = data.currentPlayer;
  gameState.nextCardType = data.nextCardType;
  gameState.phase = "waiting";

  gameBoard.style.display = "block";
  gameControls.style.display = "block";
  startGameBtn.style.display = "none";

  document.getElementById("gameLevel").disabled = true;
  const qrCodeContainer = document.getElementById("qrCodeContainer");
  const roomCodeDisplay = document.getElementById("roomCodeDisplay");
  if (qrCodeContainer) qrCodeContainer.style.display = "none";
  if (roomCodeDisplay) {
    roomCodeDisplay.textContent = `Room Code: ${gameState.roomCode}`;
    roomCodeDisplay.style.display = "block";
  }
  // Recreate the spiral board to include event icons if advanced level
  createSpiralBoard();

  updateCurrentPlayer(data.currentPlayer);
  updatePlayerPositions();
  updatePhaseDisplay();
  showHostDrawCardButton();
});

socket.on("card-drawn", (data) => {
  gameState.currentCard = data.card;
  gameState.phase = "decisions";
  gameState.playerDecisions = {};

  // Mostrar carta puxada no anfitrião com informações de passos
  cardDrawnDisplay.style.display = "block";
  cardDescription.innerHTML = `
                <strong>${getCardTypeDisplay(
                  gameState.nextCardType
                )}</strong><br>
                <div style="font-size: 16px; margin-top: 10px; color: #333;">
                    ${data.card.description}
                </div>
                <div style="font-size: 12px; margin-top: 10px; color: #666; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                    <strong>Movimento:</strong> 
                    Avançar = ${data.card.forwardSteps} casa(s) | 
                    Recuar = ${data.card.backwardSteps} casa(s)
                </div>
            `;

  updatePhaseDisplay();
  updateDecisionProgress();
  hideHostDrawCardButton();
});

socket.on("player-decision", (data) => {
  // Atualizar barra de progresso e exibição de decisão do jogador
  gameState.playerDecisions[data.playerId] = data.decision;
  updateDecisionProgress();
  updatePlayerDecisionDisplay();
});

socket.on("all-decisions-made", (data) => {
  gameState.players = data.allPlayers;
  updatePlayerPositions();

  gameState.currentPlayer = data.currentPlayer;
  updateCurrentPlayer(data.currentPlayer);

  if (data.winner) {
    showWinner(data.winner);
    return;
  }

  // Mostrar pronto para próxima carta apenas se evento foi processado ou não há evento
  if (data.eventProcessed !== false) {
    gameState.nextCardType = data.nextCardType;
    showHostDrawCardButton();
  } else {
    // Mostrar aguardando decisão de evento
    currentPlayerStatus.textContent =
      "Aguardando jogador tomar decisão de evento...";
  }

  updatePhaseDisplay();
});

socket.on("turn-ended", (data) => {
  gameState.phase = "waiting";
  gameState.currentPlayer = data.nextPlayer;
  gameState.nextCardType = data.nextCardType;
  gameState.playerDecisions = {};

  updateCurrentPlayer(data.nextPlayer);
  updatePhaseDisplay();
});

socket.on("player-moved", (data) => {
  gameState.players = data.allPlayers;
  updatePlayerPositions();
  updatePlayersDisplay();
});

socket.on("game-ended", (data) => {
  showWinner(data.winner);
});

socket.on("host-disconnected", () => {
  alert("Anfitrião desconectou. Jogo terminado.");
  location.reload();
});

socket.on("error", (error) => {
  alert("Erro: " + error);
});

socket.on("ready-for-next-card", (data) => {
  gameState.nextCardType = data.nextCardType;
  showHostDrawCardButton();
});

// Funções
function updatePlayersDisplay() {
  playersGrid.innerHTML = "";
  playerCount.textContent = gameState.players.length;

  gameState.players.forEach((player) => {
    const playerCard = document.createElement("div");
    playerCard.className = "player-card";
    playerCard.style.borderLeftColor = player.color;

    // Status indicator for decision phase
    let statusHTML = "";
    if (gameState.phase === "decisions") {
      const hasDecided = gameState.playerDecisions[player.id] !== undefined;
      playerCard.classList.add(hasDecided ? "decided" : "waiting");
      statusHTML = `<div class="player-status" style="color:${
        hasDecided ? "#27ae60" : "#f39c12"
      }">
                      ${hasDecided ? "✓ Decisões Registadas" : "⏳ Aguardando"}
                  </div>`;
    }

    playerCard.innerHTML = `
      <div class="player-name">${player.name}</div>
      <div class="player-icon" style="font-size: 32px;">${player.icon}</div>
      <div class="player-position">Anel: ${player.position}</div>
      ${statusHTML}
    `;

    playersGrid.appendChild(playerCard);
  });
}

function updateStartButton() {
  const canStart = gameState.players.length >= 2;
  startGameBtn.disabled = !canStart;
  startGameBtn.textContent = canStart
    ? `Iniciar Jogo (${gameState.players.length} jogadores)`
    : "Iniciar Jogo (Precisa de pelo menos 2 jogadores)";
}
function generateQRCode(roomCode) {
  const qrCodeDiv = document.getElementById("qrCode");
  const qrCodeContainer = document.getElementById("qrCodeContainer");
  const roomLinkSpan = document.getElementById("roomLink");

  if (!qrCodeDiv || !qrCodeContainer) {
    console.error("Required elements not found");
    return;
  }

  const joinUrl = `https://cardgame-yh73.onrender.com/player/?room=${roomCode}`;

  // Clear previous QR code
  qrCodeDiv.innerHTML = "";

  // Use simpler QR code generation
  QRCode.toDataURL(
    joinUrl,
    {
      width: 200,
      margin: 2,
    },
    (err, url) => {
      if (err) {
        console.error("QR generation error:", err);
        return;
      }

      const img = document.createElement("img");
      img.src = url;
      img.alt = `Digitalize para entrar na sala
 ${roomCode}`;
      qrCodeDiv.appendChild(img);

      // roomLinkSpan.textContent = joinUrl;
      qrCodeContainer.style.display = "block";
    }
  );
}

const hardcodedPositions = {
  18: [
    // Top
    { x: 290, y: 45 + 13 },
    // Bottom
    { x: 290, y: 535 - 13 },
    // Left
    { x: 45 + 13, y: 290 },
    // Right
    { x: 535 - 13, y: 290 },
  ],
  14: [
    { x: 290, y: 97 + 13 },
    { x: 290, y: 483 - 13 },
    { x: 97 + 13, y: 290 },
    { x: 483 - 13, y: 290 },
  ],
  10: [
    { x: 290, y: 150 + 13 },
    { x: 290, y: 430 - 13 },
    { x: 150 + 13, y: 290 },
    { x: 430 - 13, y: 290 },
  ],
  6: [
    { x: 290, y: 203 + 13 },
    { x: 290, y: 377 - 13 },
    { x: 203 + 13, y: 290 },
    { x: 377 - 13, y: 290 },
  ],
  2: [
    { x: 290, y: 258 + 13 },
    { x: 290, y: 322 - 13 },
    { x: 256 + 13, y: 290 },
    { x: 324 - 13, y: 290 },
  ],
};

function addEventIconToRing(ringNumber, eventData) {
  const spiralBoard = document.getElementById("spiralBoard");
  if (!spiralBoard) return;

  const iconEmoji = getEventIcon(eventData.type);
  const positions = hardcodedPositions[ringNumber];
  if (!positions) return;

  positions.forEach((pos, index) => {
    const eventIcon = document.createElement("div");
    eventIcon.className = `event-icon event-icon-${index}`;
    eventIcon.innerHTML = iconEmoji;
    eventIcon.title = `${eventData.name} - Ring ${ringNumber}`;

    eventIcon.style.cssText = `
      position: absolute;
      left: ${pos.x}px;
      top: ${pos.y}px;
      width: 21px;
      height: 21px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      z-index: 15;
      cursor: help;
    `;

    spiralBoard.appendChild(eventIcon);
  });
}

// function getEventIcon(eventType) {
//   const eventIcons = {
//     'war': '⚔️',
//     'global_warming': '🌡️',
//     'corruption': '💰',
//     'crisis': '📉',
//     'fascism': '👊'
//   };
//   return eventIcons[eventType] || '';
// }

function getEventIcon(eventType) {
  const eventIcons = {
    war: `<img src="EventIcons/war.png" alt="War" class="event-icon-img">`,
    global_warming: `<img src="EventIcons/global_warming.png" alt="Global Warming" class="event-icon-img">`,
    corruption: `<img src="EventIcons/corruption.png" alt="Corruption" class="event-icon-img">`,
    crisis: `<img src="EventIcons/crisis.png" alt="Crisis" class="event-icon-img">`,
    fascism: `<img src="EventIcons/fascism.png" alt="Fascism" class="event-icon-img">`,
  };
  return (
    eventIcons[eventType] ||
    `<img src="icons/default.png" alt="Event" class="event-icon-img">`
  );
}

// Updated event data object
const eventData = {
  2: {
    name: "Guerra",
    description: "Escolhe recuar 1 casa ou todos recuarem 2 casas",
    type: "war",
  },
  6: {
    name: "Aquecimento Global",
    description:
      "Escolhe permanecer e o jogador mais recuado avançar 1 casa ou escolhe avançar 1 casa",
    type: "global_warming",
  },
  10: {
    name: "Corrupção",
    description:
      "Escolhe outro jogador para avançarem mais 1 casa ou permanecerem",
    type: "corruption",
  },
  14: {
    name: "Crise",
    description:
      "O jogador mais avançado escolhe recuar ou permitir que o mais recuado avance 1 casa",
    type: "crisis",
  },
  18: {
    name: "Fascismo",
    description:
      "Escolhe avançar 1 casa e os outros recuarem 1 casa ou permanecer",
    type: "fascism",
  },
};

function createSpiralBoard() {
  const board = document.getElementById("spiralBoard");
  board.innerHTML = "";

  const boardSize = 600;
  const center = boardSize / 2;
  const newEventRings = [2, 6, 10, 14, 18]; // New event positions

  // Definir cores dos anéis do exterior (21) ao interior (1) baseado na sua imagem
  const ringColors = [
    "#1f4e79",
    "#ffffff",
    "#4472a8",
    "#ffffff",
    "#7ba3d1",
    "#ffffff",
    "#b8d1ed",
    "#ffffff",
    "#8e44ad",
    "#ffffff",
    "#af7ac5",
    "#ffffff",
    "#e8b4cb",
    "#ffffff",
    "#f06292",
    "#ffffff",
    "#ff9800",
    "#ffffff",
    "#ffcc80",
    "#ffffff",
    "#4caf50", // Anel central
  ];

  // Criar anéis do exterior (21) ao interior (1)
  for (let ring = 21; ring >= 1; ring--) {
    const ringElement = document.createElement("div");
    ringElement.className = `ring ${
      newEventRings.includes(ring) ? "event-ring" : ""
    }`;
    ringElement.id = `ring-${ring}`;

    const radius = (ring / 21) * (boardSize / 2 - 20);
    const size = radius * 2;

    ringElement.style.width = `${size}px`;
    ringElement.style.height = `${size}px`;
    ringElement.style.left = `${center - radius}px`;
    ringElement.style.top = `${center - radius}px`;

    // Aplicar cor do array
    const colorIndex = 21 - ring;
    ringElement.style.backgroundColor = ringColors[colorIndex];
    ringElement.style.borderColor = ringColors[colorIndex];

    board.appendChild(ringElement);

    // Add event icons if level is advanced and this ring has an event
    if (gameState.gameLevel === "advanced" && eventData[ring]) {
      addEventIconToRing(ring, eventData[ring]);
    }
  }
}

function updatePlayerPositions() {
  // Remove existing pawns
  document.querySelectorAll(".pawn").forEach((pawn) => pawn.remove());

  gameState.players.forEach((player, index) => {
    const pawn = document.createElement("div");
    pawn.className = "pawn";
    pawn.title = `${player.name} (${player.identityName}) - Ring ${player.position}`;

    // Use icon instead of background color
    pawn.textContent = player.icon;
    pawn.style.fontSize = "20px";
    pawn.style.width = "32px";
    pawn.style.height = "32px";
    pawn.style.display = "flex";
    pawn.style.alignItems = "center";
    pawn.style.justifyContent = "center";
    pawn.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
    pawn.style.borderRadius = "50%";
    pawn.style.border = `3px solid ${player.color}`;
    pawn.style.position = "absolute";
    pawn.style.zIndex = "10";
    pawn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

    const ring = document.getElementById(`ring-${player.position}`);
    if (ring) {
      // Get the ring's actual radius from its width
      const ringRadius = parseFloat(ring.style.width) / 2;
      const ringCenterX = parseFloat(ring.style.left) + ringRadius;
      const ringCenterY = parseFloat(ring.style.top) + ringRadius;

      // Position pawns around the ring circumference
      const totalPlayers = gameState.players.length;
      const angleStep = (2 * Math.PI) / totalPlayers;
      const angle = index * angleStep;

      // Place pawns on the ring border (not inside)
      const pawnDistanceFromCenter = Math.max(25, ringRadius - 8); // Minimum distance or slightly inside ring

      const pawnX = ringCenterX + Math.cos(angle) * pawnDistanceFromCenter;
      const pawnY = ringCenterY + Math.sin(angle) * pawnDistanceFromCenter;

      // Center the pawn on its position
      pawn.style.left = `${pawnX - 16}px`; // 16 = half of pawn width
      pawn.style.top = `${pawnY - 16}px`; // 16 = half of pawn height

      document.getElementById("spiralBoard").appendChild(pawn);
    } else {
      console.warn(
        `Ring ${player.position} not found for player ${player.name}`
      );
    }
  });
}

function updateCurrentPlayer(player) {
  if (player) {
    currentPlayerName.textContent = `${player.name} (${player.identityName})`;
    currentPlayerName.style.color = player.color;
  }
}

function updatePhaseDisplay() {
  // Ocultar todas as exibições de fase
  cardDrawnDisplay.style.display = "none";
  decisionPhase.style.display = "none";
  proceedBtn.style.display = "none";

  switch (gameState.phase) {
    case "waiting":
      currentPlayerStatus.textContent = "Pronto para retirar a próxima carta";
      break;
    case "decisions":
      cardDrawnDisplay.style.display = "block";
      decisionPhase.style.display = "none";
      currentPlayerStatus.textContent =
        "Carta retirada - aguardando a decisão de todos os jogadores";
      break;
    case "moving":
      currentPlayerStatus.textContent =
        "Todos os jogadores votaram - processando movimentos";
      break;
  }
  updatePlayersDisplay();
}

function updateDecisionProgress() {
  const totalPlayerCount = gameState.players.length;
  const decisionsReceived = Object.keys(gameState.playerDecisions).length;

  decisionsCount.textContent = decisionsReceived;
  totalPlayers.textContent = totalPlayerCount;

  const percentage =
    totalPlayerCount > 0 ? (decisionsReceived / totalPlayerCount) * 100 : 0;
  progressFill.style.width = `${percentage}%`;
}

function updatePlayerDecisionDisplay() {
  playerDecisions.innerHTML = "";

  gameState.players.forEach((player) => {
    const decision = gameState.playerDecisions[player.id];
    const playerDiv = document.createElement("div");
    playerDiv.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px;
                    margin: 5px 0;
                    border-left: 4px solid ${player.color};
                    background: ${decision ? "#f8f9fa" : "#fff3cd"};
                    border-radius: 5px;
                `;

    playerDiv.innerHTML = `
                    <div>
                        <div style="font-weight: bold;">${player.name}</div>
                        <div style="font-size: 12px; color: #666;">${
                          player.identityName
                        }</div>
                        ${
                          decision
                            ? `<div style="color: #27ae60; font-size: 12px; margin-top: 2px;">${decision.description}</div>`
                            : '<div style="color: #856404; font-size: 12px;">Aguardando voto...</div>'
                        }
                    </div>
                    <div style="font-size: 20px;">
                        ${
                          decision
                            ? decision.cardSteps === 0
                              ? "⏸️" // Show pause emoji for stay
                              : decision.direction === "forward"
                              ? "⬆️"
                              : "⬇️"
                            : "⏳"
                        }
                    </div>
                `;

    playerDecisions.appendChild(playerDiv);
  });
}

function proceedToNextTurn() {
  socket.emit("proceed-to-next-turn");
}

function showEventNotification(events) {
  if (events.length > 0) {
    const event = events[0]; // Mostrar primeiro evento
    eventText.textContent = `${event.player.name} pousou no anel ${event.player.position}: ${event.event.name} - ${event.event.description}`;
    eventNotification.classList.add("show");

    setTimeout(() => {
      eventNotification.classList.remove("show");
    }, 8000);
  }
}

function showWinner(winner) {
  winnerText.innerHTML = `<strong>${winner.name}</strong> (${winner.identityName}) chegou ao centro e ganhou o jogo!`;
  winnerAnnouncement.style.display = "block";
  gameControls.style.display = "none";
}

function showHostDrawCardButton() {
  hostDrawCardSection.style.display = "block";
  hostDrawCardBtn.disabled = false;
  const cardTypeDisplay = getCardTypeDisplay(gameState.nextCardType);
  hostDrawCardBtn.textContent = `🎴 Retirar Carta. ${cardTypeDisplay}`;
}

function hideHostDrawCardButton() {
  hostDrawCardSection.style.display = "none";
}

function getCardTypeDisplay(cardType) {
  const cardTypeMap = {
    "privilege-discrimination": "Privilégio/Discriminação",
    "social-policies": "Política Social",
    behaviors: "Comportamento",
  };
  return cardTypeMap[cardType] || cardType;
}

// Lógica de puxar carta para anfitrião
hostDrawCardBtn.addEventListener("click", async () => {
  hostDrawCardBtn.disabled = true;

  // Garantir que as cartas estão carregadas
  if (Object.keys(HOST_SAMPLE_CARDS).length === 0) {
    await loadCards();
  }

  // Escolher uma carta aleatória da categoria correta
  const cardType = gameState.nextCardType;
  const cards = HOST_SAMPLE_CARDS[cardType] || [];

  if (cards.length === 0) {
    console.error("Nenhuma carta disponível para o tipo:", cardType);
    hostDrawCardBtn.disabled = false;
    return;
  }

  const randomCard = cards[Math.floor(Math.random() * cards.length)];

  // Enviar os dados da carta no formato correto esperado pelo servidor
  const cardData = {
    category: cardType,
    description: randomCard.description,
    forwardSteps: randomCard.forwardSteps,
    backwardSteps: randomCard.backwardSteps,
    cardType: getCardTypeDisplay(cardType),
  };

  console.log("Enviando dados da carta:", cardData);
  socket.emit("draw-card", cardData);
});

async function loadCards() {
  try {
    const cardTypes = [
      "privilege-discrimination",
      "social-policies",
      "behaviors",
    ];

    for (const cardType of cardTypes) {
      const response = await fetch(`./cards/${cardType}.json`);
      if (response.ok) {
        HOST_SAMPLE_CARDS[cardType] = await response.json();
      } else {
        console.error(`Falha ao carregar cartas de ${cardType}`);
        HOST_SAMPLE_CARDS[cardType] = [];
      }
    }

    console.log("Cartas carregadas com sucesso:", HOST_SAMPLE_CARDS);
  } catch (error) {
    console.error("Erro ao carregar cartas:", error);
  }
}

loadCards();
