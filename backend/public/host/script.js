const localIp = window.location.hostname; // Automatically gets the IP when on the same network
const socket = io(`http://${localIp}:3000`);
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

// DOM elements
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

// Phase elements
const cardDrawnDisplay = document.getElementById("cardDrawnDisplay");
const cardDescription = document.getElementById("cardDescription");
const decisionPhase = document.getElementById("decisionPhase");
const playerDecisions = document.getElementById("playerDecisions");
const decisionsCount = document.getElementById("decisionsCount");
const totalPlayers = document.getElementById("totalPlayers");
const progressFill = document.getElementById("progressFill");
const proceedBtn = document.getElementById("proceedBtn");

// Host draw card elements
const hostDrawCardSection = document.getElementById("hostDrawCardSection");
const hostDrawCardBtn = document.getElementById("hostDrawCardBtn");

// Card samples for host to draw from
const HOST_SAMPLE_CARDS = {
  "privilege-discrimination": [
    "You can easily find beauty products that match your skin tone.",
    "You have never been followed by security in a store.",
    "Your achievements are never questioned as diversity hires.",
    "You can walk alone at night without fear.",
    "Your name is never mispronounced or seen as difficult.",
    "You see people who look like you in leadership positions.",
    "You have never been asked to speak for your entire race/group.",
    "You can use public restrooms without fear or discomfort.",
    "You can express affection for your partner in public without fear.",
    "You have access to buildings and spaces without barriers.",
    "Your cultural or religious holidays are recognized by your workplace/school.",
  ],
  "social-policies": [
    "A new accessibility law is passed requiring ramps in all buildings.",
    "Healthcare becomes free for all citizens.",
    "Marriage equality is legalized nationwide.",
    "Anti-discrimination laws in employment are strengthened.",
    "Public transportation becomes wheelchair accessible.",
    "Mental health support is included in all health plans.",
    "Educational funding is distributed more equally across districts.",
    "Affordable housing programs are expanded.",
    "Minimum wage is increased significantly.",
    "Parental leave policies are extended for all parents.",
  ],
  behaviors: [
    "You interrupt others in meetings without being called aggressive.",
    "You can express anger without being labeled as difficult.",
    "Your cultural holidays are recognized by your workplace/school.",
    "You can make mistakes without them being attributed to your identity.",
    "You receive mentorship and networking opportunities easily.",
    "Your accent or way of speaking is considered professional.",
    "You can discuss your weekend activities without hiding your identity.",
    "You can show emotions without being seen as unprofessional.",
    "Your ideas are taken seriously in group discussions.",
    "You can dress according to your culture without negative judgment.",
  ],
};

// Create room
createRoomBtn.addEventListener("click", () => {
  socket.emit("create-room");
});

// Start game
startGameBtn.addEventListener("click", () => {
  const level = document.getElementById("gameLevel").value;
  socket.emit("start-game", level);
});

// Socket events
socket.on("room-created", (data) => {
  gameState.roomCode = data.roomCode;
  roomCodeDiv.textContent = data.roomCode;
  roomInfo.style.display = "block";
  playersSection.style.display = "block";
  createRoomBtn.style.display = "none";
  createSpiralBoard();
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

  updateCurrentPlayer(data.currentPlayer);
  updatePlayerPositions();
  updatePhaseDisplay();
  showHostDrawCardButton();
});

socket.on("card-drawn", (data) => {
  gameState.currentCard = data.card;
  gameState.phase = "decisions";
  gameState.playerDecisions = {};

  // Show card drawn on host
  cardDrawnDisplay.style.display = "block";
  cardDescription.innerHTML = `
                <strong>${getCardTypeDisplay(
                  gameState.nextCardType
                )}</strong><br>
                <div style="font-size: 16px; margin-top: 10px; color: #333;">
                    ${data.card.description || data.card.text || "Card drawn"}
                </div>
            `;

  updatePhaseDisplay();
  updateDecisionProgress();
  hideHostDrawCardButton();
});

socket.on("player-decision", (data) => {
  // Update progress bar and player decision display
  gameState.playerDecisions[data.playerId] = data.decision;
  updateDecisionProgress();
  updatePlayerDecisionDisplay();
});

socket.on("all-decisions-made", (data) => {
  gameState.phase = "moving";
  gameState.players = data.allPlayers;
  gameState.nextCardType = data.nextCardType;

  // Update player positions
  updatePlayerPositions();

  // Show events if triggered
  if (data.eventsTriggered && data.eventsTriggered.length > 0) {
    showEventNotification(data.eventsTriggered);
  }

  // Check for winner
  if (data.winner) {
    showWinner(data.winner);
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
  alert("Host has disconnected. Game ended.");
  location.reload();
});

socket.on("error", (error) => {
  alert("Error: " + error);
});

socket.on("ready-for-next-card", (data) => {
  gameState.nextCardType = data.nextCardType;
  showHostDrawCardButton();
});

// Functions
function updatePlayersDisplay() {
  playersGrid.innerHTML = "";
  playerCount.textContent = gameState.players.length;

  gameState.players.forEach((player) => {
    const playerCard = document.createElement("div");
    playerCard.className = "player-card";
    playerCard.style.borderLeftColor = player.color;

    // Add status indicators during decision phase
    let statusHTML = "";
    if (gameState.phase === "decisions") {
      const hasDecided = gameState.playerDecisions[player.id] !== undefined;
      playerCard.classList.add(hasDecided ? "decided" : "waiting");
      statusHTML = `<div style="padding: 5px; font-size: 12px; color: ${
        hasDecided ? "#27ae60" : "#f39c12"
      }; font-weight: bold;">
                        ${
                          hasDecided
                            ? "✓ Vote Received"
                            : "⏳ Waiting for Vote..."
                        }
                    </div>`;
    }

    playerCard.innerHTML = `
                    <div class="player-name">${player.name}</div>
                    <div class="player-identity">${player.identityName} ${player.icon}</div>
                    <div class="player-position">Ring: ${player.position}</div>
                    ${statusHTML}
                `;
    playersGrid.appendChild(playerCard);
  });
}

function updateStartButton() {
  const canStart = gameState.players.length >= 2;
  startGameBtn.disabled = !canStart;
  startGameBtn.textContent = canStart
    ? `Start Game (${gameState.players.length} players)`
    : "Start Game (Need at least 2 players)";
}

function createSpiralBoard() {
  const board = document.getElementById("spiralBoard");
  board.innerHTML = "";

  const boardSize = 600;
  const center = boardSize / 2;
  const eventRings = [5, 10, 15, 20];

  // Create rings from outer (21) to inner (1)
  for (let ring = 21; ring >= 1; ring--) {
    const ringElement = document.createElement("div");
    ringElement.className = `ring ${
      eventRings.includes(ring) ? "event-ring" : ""
    }`;
    ringElement.id = `ring-${ring}`;

    const radius = (ring / 21) * (boardSize / 2 - 20);
    const size = radius * 2;

    ringElement.style.width = `${size}px`;
    ringElement.style.height = `${size}px`;
    ringElement.style.left = `${center - radius}px`;
    ringElement.style.top = `${center - radius}px`;

    // Add ring number
    const ringNumber = document.createElement("div");
    ringNumber.className = "ring-number";
    ringNumber.textContent = ring;
    ringElement.appendChild(ringNumber);

    board.appendChild(ringElement);
  }
}

function updatePlayerPositions() {
  // Remove existing pawns
  document.querySelectorAll(".pawn").forEach((pawn) => pawn.remove());

  gameState.players.forEach((player, index) => {
    const pawn = document.createElement("div");
    pawn.className = "pawn";
    pawn.textContent = player.icon;
    pawn.title = `${player.name} (${player.identityName})`;

    const ring = document.getElementById(`ring-${player.position}`);
    if (ring) {
      // Get ring dimensions
      const ringRect = ring.getBoundingClientRect();
      const boardRect = document
        .getElementById("spiralBoard")
        .getBoundingClientRect();

      // Calculate ring center relative to the board
      const ringCenterX =
        parseFloat(ring.style.left) + parseFloat(ring.style.width) / 2;
      const ringCenterY =
        parseFloat(ring.style.top) + parseFloat(ring.style.height) / 2;

      // Position pawns around the ring circumference
      const totalPlayers = gameState.players.length;
      const angle = ((index * 360) / totalPlayers) * (Math.PI / 180);

      // Use a radius that's slightly inside the ring border
      const ringRadius = parseFloat(ring.style.width) / 2;
      const pawnRadius = Math.max(15, ringRadius - 25); // Ensure minimum distance from center

      // Calculate pawn position
      const x = Math.cos(angle) * pawnRadius;
      const y = Math.sin(angle) * pawnRadius;

      // Position the pawn (using transform: translate(-50%, -50%) to center it)
      pawn.style.left = `${ringCenterX + x}px`;
      pawn.style.top = `${ringCenterY + y}px`;

      // Optional: Add player color as background or border
      if (player.color) {
        pawn.style.borderColor = player.color;
        pawn.style.backgroundColor = player.color + "20"; // 20% opacity
      }

      document.getElementById("spiralBoard").appendChild(pawn);
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
  // Hide all phase displays
  cardDrawnDisplay.style.display = "none";
  decisionPhase.style.display = "none";
  proceedBtn.style.display = "none";

  switch (gameState.phase) {
    case "waiting":
      currentPlayerStatus.textContent = "Ready to draw next card";
      break;
    case "decisions":
      cardDrawnDisplay.style.display = "block";
      decisionPhase.style.display = "block";
      currentPlayerStatus.textContent =
        "Card drawn - waiting for all players to vote";
      break;
    case "moving":
      currentPlayerStatus.textContent =
        "All players have voted - processing moves";
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
                            : '<div style="color: #856404; font-size: 12px;">Waiting for vote...</div>'
                        }
                    </div>
                    <div style="font-size: 20px;">
                        ${
                          decision
                            ? decision.direction === "forward"
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
    const event = events[0]; // Show first event
    eventText.textContent = `${event.player.name} landed on ring ${event.player.position}: ${event.event.name} - ${event.event.description}`;
    eventNotification.classList.add("show");

    setTimeout(() => {
      eventNotification.classList.remove("show");
    }, 8000);
  }
}

function showWinner(winner) {
  winnerText.innerHTML = `<strong>${winner.name}</strong> (${winner.identityName}) has reached the center and won the game!`;
  winnerAnnouncement.style.display = "block";
  gameControls.style.display = "none";
}

function showHostDrawCardButton() {
  hostDrawCardSection.style.display = "block";
  hostDrawCardBtn.disabled = false;
  const cardTypeDisplay = getCardTypeDisplay(gameState.nextCardType);
  hostDrawCardBtn.textContent = `🎴 Draw ${cardTypeDisplay} Card`;
}

function hideHostDrawCardButton() {
  hostDrawCardSection.style.display = "none";
}

function getCardTypeDisplay(cardType) {
  const cardTypeMap = {
    "privilege-discrimination": "Privilege/Discrimination",
    "social-policies": "Social Policy",
    behaviors: "Behavior",
  };
  return cardTypeMap[cardType] || cardType;
}

// Draw card logic for host
hostDrawCardBtn.addEventListener("click", () => {
  hostDrawCardBtn.disabled = true;

  // Pick a random card from the correct category
  const cardType = gameState.nextCardType;
  const cards = HOST_SAMPLE_CARDS[cardType] || ["Default card"];
  const randomCard = cards[Math.floor(Math.random() * cards.length)];

  const cardData = {
    category: cardType,
    description: randomCard,
    text: randomCard,
    cardType: getCardTypeDisplay(cardType),
  };

  socket.emit("draw-card", cardData);
});
