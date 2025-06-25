const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const QRCode = require("qrcode"); // You'll need to install this: npm install qrcode

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
const os = require("os");

// Serve static files
app.use(express.static("public"));

// Game state
const gameRooms = new Map();

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// Enhanced connection info page with QR code
app.get("/connection-info", async (req, res) => {
  const localIp = getLocalIp();
  const playerUrl = `http://${localIp}:3000/player`;

  try {
    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(playerUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connection Info</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            margin: 0;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
          }
          .info-box { 
            background: rgba(255, 255, 255, 0.1); 
            padding: 30px; 
            border-radius: 15px; 
            margin: 20px 0;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          }
          .ip-address { 
            font-size: 20px; 
            font-weight: bold; 
            margin: 15px 0; 
            color: #FFD700; 
            background: rgba(0, 0, 0, 0.2);
            padding: 10px;
            border-radius: 8px;
            word-break: break-all;
          }
          .qr-section {
            background: white;
            padding: 20px;
            border-radius: 15px;
            margin: 20px 0;
            color: #333;
          }
          .qr-code {
            margin: 20px 0;
          }
          .qr-instructions {
            font-size: 18px;
            margin: 15px 0;
            color: #2c3e50;
          }
          .connection-methods {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
          }
          .method-card {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
          }
          .method-title {
            font-size: 24px;
            margin-bottom: 15px;
            color: #FFD700;
          }
          .step {
            margin: 10px 0;
            padding: 8px;
            background: rgba(0, 0, 0, 0.1);
            border-radius: 5px;
          }
          @media (max-width: 768px) {
            .connection-methods {
              grid-template-columns: 1fr;
            }
            .ip-address {
              font-size: 16px;
            }
            body {
              padding: 10px;
            }
          }
          .refresh-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px;
          }
          .refresh-btn:hover {
            background: #45a049;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎮 Classroom Game Setup</h1>
          
          <div class="qr-section">
            <h2>📱 Quick Connect for Students</h2>
            <div class="qr-instructions">
              <strong>Scan this QR code with your phone camera:</strong>
            </div>
            <div class="qr-code">
              <img src="${qrCodeDataUrl}" alt="QR Code for Player Access" />
            </div>
            <p style="color: #666; font-size: 14px;">
              The QR code will take you directly to the player interface
            </p>
          </div>

          <div class="connection-methods">
            <div class="method-card">
              <div class="method-title">👨‍🏫 For Teachers</div>
              <div class="step">
                <strong>Host Interface:</strong>
              </div>
              <div class="ip-address">http://${localIp}:3000/host</div>
              <div class="step">
                Use this to create rooms and manage the game
              </div>
            </div>

            <div class="method-card">
              <div class="method-title">👨‍🎓 For Students (Manual)</div>
              <div class="step">
                <strong>Player Interface:</strong>
              </div>
              <div class="ip-address">http://${localIp}:3000/player</div>
              <div class="step">
                Type this URL in your browser if QR code doesn't work
              </div>
            </div>
          </div>

          <div class="info-box">
            <h3>📋 Setup Instructions</h3>
            <div class="step">1. Teacher opens the Host Interface</div>
            <div class="step">2. Create a game room</div>
            <div class="step">3. Students scan QR code or visit Player Interface</div>
            <div class="step">4. Students enter room code and join</div>
            <div class="step">5. Start the game!</div>
          </div>

          <button class="refresh-btn" onclick="window.location.reload()">
            🔄 Refresh Connection Info
          </button>

          <div style="margin-top: 30px; font-size: 14px; opacity: 0.8;">
            <p>💡 Make sure all devices are connected to the same WiFi network</p>
            <p>🌐 Server IP: ${localIp} | Port: 3000</p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Error generating QR code:", error);
    // Fallback without QR code
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connection Info</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
          .info-box { background: #f0f8ff; padding: 20px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
          .ip-address { font-size: 24px; font-weight: bold; margin: 15px 0; color: #0066cc; }
          .error { color: #cc0000; margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>Classroom Game Setup</h1>
        <div class="info-box">
          <div class="error">QR Code generation failed. Using manual connection only.</div>
          
          <h2>Teacher's Connection Info</h2>
          <p>Host URL:</p>
          <div class="ip-address">http://${localIp}:3000/host</div>
          
          <h2>Student Access</h2>
          <p>Students should visit:</p>
          <div class="ip-address">http://${localIp}:3000/player</div>
        </div>
      </body>
      </html>
    `);
  }
});

// API endpoint to get QR code data (for dynamic updates)
app.get("/api/qr-code", async (req, res) => {
  const localIp = getLocalIp();
  const playerUrl = `http://${localIp}:3000/player`;

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(playerUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.json({
      success: true,
      qrCode: qrCodeDataUrl,
      playerUrl: playerUrl,
      hostUrl: `http://${localIp}:3000/host`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to generate QR code",
    });
  }
});

// Identity categories available - updated to match client expectations
const IDENTITY_CATEGORIES = [
  { id: "white_man", name: "White Man", color: "#3498db", icon: "👨🏻" },
  { id: "white_woman", name: "White Woman", color: "#e74c3c", icon: "👩🏻" },
  { id: "black_man", name: "Black Man", color: "#8e44ad", icon: "👨🏿" },
  { id: "black_woman", name: "Black Woman", color: "#e67e22", icon: "👩🏿" },
  { id: "lgbtiqa", name: "LGBTIQA+", color: "#f39c12", icon: "🏳️‍🌈" },
  { id: "blind", name: "Blind Person", color: "#16a085", icon: "🦯" },
  { id: "deaf", name: "Deaf Person", color: "#2980b9", icon: "🤟" },
  { id: "disabled", name: "Physically Disabled", color: "#c0392b", icon: "♿" },
  { id: "elderly", name: "Elderly Person", color: "#7f8c8d", icon: "👴" },
  { id: "neutral", name: "Neutral", color: "#34495e", icon: "👤" },
];

class GameRoom {
  constructor(hostSocketId) {
    this.id = generateRoomCode();
    this.hostSocketId = hostSocketId;
    this.players = new Map();
    this.gameStarted = false;
    this.currentPlayerIndex = 0;
    this.usedIdentities = new Set();
    this.gameLevel = "basic"; // basic, intermediate, advanced
    this.cardDrawOrder = 0; // Track which type of card to draw next
    this.eventRings = new Set([5, 10, 15, 20]); // Rings with events
    this.events = {
      5: {
        name: "War",
        description: "War event - follow special instructions",
      },
      10: {
        name: "Economic Crisis",
        description: "Economic crisis - follow special instructions",
      },
      15: {
        name: "Pandemic",
        description: "Pandemic event - follow special instructions",
      },
      20: {
        name: "Social Movement",
        description: "Social movement - follow special instructions",
      },
    };
    this.currentCard = null; // Track the current card
    this.playerDecisions = {}; // Track player decisions for the current card
    this.waitingForVotes = false; // Track if we're waiting for player votes
  }

  addPlayer(socketId, playerData) {
    if (this.usedIdentities.has(playerData.identity)) {
      return { success: false, error: "Identity already taken" };
    }

    const identityData = IDENTITY_CATEGORIES.find(
      (cat) => cat.id === playerData.identity
    );
    if (!identityData) {
      return { success: false, error: "Invalid identity" };
    }

    this.players.set(socketId, {
      id: socketId,
      name: playerData.name,
      identity: playerData.identity,
      identityName: identityData.name,
      color: identityData.color,
      icon: identityData.icon,
      pawnId: playerData.identity, // Add pawnId for client compatibility
      position: 21, // Start at outer ring (21)
      isConnected: true,
    });

    this.usedIdentities.add(playerData.identity);
    return { success: true };
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.usedIdentities.delete(player.identity);
      this.players.delete(socketId);
    }
  }

  getAvailableIdentities() {
    return IDENTITY_CATEGORIES.filter(
      (identity) => !this.usedIdentities.has(identity.id)
    );
  }

  getAvailablePawnIds() {
    return IDENTITY_CATEGORIES.filter(
      (identity) => !this.usedIdentities.has(identity.id)
    ).map((identity) => identity.id);
  }

  getPlayersArray() {
    return Array.from(this.players.values());
  }

  getCurrentPlayer() {
    const playersArray = this.getPlayersArray();
    return playersArray[this.currentPlayerIndex] || null;
  }

  nextPlayer() {
    const playersArray = this.getPlayersArray();
    this.currentPlayerIndex =
      (this.currentPlayerIndex + 1) % playersArray.length;
  }

  getNextCardType() {
    switch (this.gameLevel) {
      case "basic":
        return "privilege-discrimination";

      case "intermediate":
        // Alternates between privilege-discrimination and social-policies
        return this.cardDrawOrder % 2 === 0
          ? "privilege-discrimination"
          : "social-policies";

      case "advanced":
        // Rotates between privilege-discrimination, social-policies, and behaviors
        const types = [
          "privilege-discrimination",
          "social-policies",
          "behaviors",
        ];
        return types[this.cardDrawOrder % 3];

      default:
        return "privilege-discrimination";
    }
  }

  movePlayer(playerId, steps) {
    const player = this.players.get(playerId);
    if (player) {
      const newPosition = Math.max(1, Math.min(21, player.position + steps));
      player.position = newPosition;
      return newPosition;
    }
    return null;
  }

  checkWinner() {
    for (let player of this.players.values()) {
      if (player.position === 1) {
        return player;
      }
    }
    return null;
  }

  isOnEventRing(position) {
    return this.eventRings.has(position);
  }

  getEventForRing(position) {
    return this.events[position] || null;
  }

  // Get only non-host players (actual game players)
  getNonHostPlayers() {
    return this.getPlayersArray().filter((p) => p.id !== this.hostSocketId);
  }
}

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Host creates a room
  socket.on("create-room", () => {
    const room = new GameRoom(socket.id);
    gameRooms.set(room.id, room);
    gameRooms.set(socket.id, room.id); // Map socket to room

    socket.join(room.id);
    socket.emit("room-created", {
      roomCode: room.id,
      availableIdentities: room.getAvailableIdentities(),
      availablePawns: room.getAvailablePawnIds(),
    });

    console.log(`Room created: ${room.id} by host: ${socket.id}`);
  });

  // Player joins room
  socket.on("join-room", (data) => {
    const { roomCode, playerName, playerIdentity, playerPawn } = data;
    const room = gameRooms.get(roomCode);

    if (!room) {
      socket.emit("join-error", "Room not found");
      return;
    }

    if (room.gameStarted) {
      socket.emit("join-error", "Game already started");
      return;
    }

    // Use playerPawn.id if playerPawn is an object, otherwise use playerIdentity
    const identityId = playerPawn
      ? playerPawn.id || playerPawn
      : playerIdentity;

    const result = room.addPlayer(socket.id, {
      name: playerName,
      identity: identityId,
    });

    if (!result.success) {
      socket.emit("join-error", result.error);
      return;
    }

    socket.join(roomCode);
    gameRooms.set(socket.id, roomCode); // Map socket to room

    // Notify player they joined successfully
    socket.emit("joined-room", {
      roomCode: roomCode,
      playerData: room.players.get(socket.id),
      gameLevel: room.gameLevel,
    });

    // Update all clients in room
    io.to(roomCode).emit("room-updated", {
      players: room.getPlayersArray(),
      availableIdentities: room.getAvailableIdentities(),
      availablePawns: room.getAvailablePawnIds(),
      gameLevel: room.gameLevel,
    });

    console.log(
      `Player ${playerName} joined room ${roomCode} as ${identityId}`
    );
  });

  // Host starts the game
  socket.on("start-game", (gameLevel = "basic") => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);

    if (!room || room.hostSocketId !== socket.id) {
      socket.emit("error", "Not authorized to start game");
      return;
    }

    if (room.players.size < 2) {
      socket.emit("error", "Need at least 2 players to start");
      return;
    }

    room.gameStarted = true;
    room.gameLevel = gameLevel;
    room.currentPlayerIndex = 0;
    room.cardDrawOrder = 0;

    io.to(roomId).emit("game-started", {
      gameLevel: gameLevel,
      currentPlayer: room.getCurrentPlayer(),
      players: room.getPlayersArray(),
      nextCardType: room.getNextCardType(),
    });

    console.log(
      `Game started in room ${roomId} with ${room.players.size} players at ${gameLevel} level`
    );
  });

  // Draw card event: only host can draw
  socket.on("draw-card", (cardData) => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);

    if (!room || !room.gameStarted) {
      socket.emit("error", "Game not active");
      return;
    }

    // Only the host can draw a card
    if (room.hostSocketId !== socket.id) {
      socket.emit("error", "Only the host can draw a card");
      return;
    }

    // Check if we're already waiting for votes
    if (room.waitingForVotes) {
      socket.emit("error", "Still waiting for player votes on current card");
      return;
    }

    // Check if card type matches expected type
    const expectedCardType = room.getNextCardType();
    if (cardData.category !== expectedCardType) {
      socket.emit(
        "error",
        `Expected ${expectedCardType} card, but got ${cardData.category}`
      );
      return;
    }

    // Set current card and reset player decisions
    room.currentCard = cardData;
    room.playerDecisions = {};
    room.waitingForVotes = true;

    // Broadcast card to all clients (including host)
    io.to(roomId).emit("card-drawn", {
      card: cardData,
      cardDrawnBy: { id: room.hostSocketId, name: "Host" },
      nextCardType: room.getNextCardType(),
      cardType: cardData.category,
    });

    console.log(
      `Card drawn in room ${roomId}: ${cardData.description || cardData.text}`
    );
  });

  // Player submits their vote (forward/backward)
  socket.on("player-vote", (voteData) => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);

    if (!room || !room.gameStarted) {
      socket.emit("error", "Game not active");
      return;
    }

    if (!room.currentCard || !room.waitingForVotes) {
      socket.emit("error", "No card drawn or not accepting votes");
      return;
    }

    // Only allow actual players (not host) to vote
    if (socket.id === room.hostSocketId) {
      socket.emit("error", "Host cannot vote");
      return;
    }

    // Check if player already voted
    if (room.playerDecisions[socket.id] !== undefined) {
      socket.emit("error", "You have already voted for this card");
      return;
    }

    // Convert vote direction to movement steps
    // forward = move toward center (negative step), backward = move toward outer (positive step)
    const steps = voteData.direction === "forward" ? -1 : 1;

    // Record the player's decision
    room.playerDecisions[socket.id] = {
      direction: voteData.direction,
      description: voteData.description,
      steps: steps,
    };

    // Notify all clients of the updated decision
    io.to(roomId).emit("player-decision", {
      playerId: socket.id,
      decision: room.playerDecisions[socket.id],
    });

    // Check if all non-host players have voted
    const nonHostPlayers = room.getNonHostPlayers();
    const votesReceived = Object.keys(room.playerDecisions).length;

    console.log(
      `Vote received from ${socket.id}: ${voteData.direction}. Votes: ${votesReceived}/${nonHostPlayers.length}`
    );

    if (votesReceived === nonHostPlayers.length) {
      // All players have voted - process moves
      let eventsTriggered = [];

      // Apply moves to all players who voted
      for (const [playerId, decision] of Object.entries(room.playerDecisions)) {
        const oldPosition = room.players.get(playerId).position;
        const newPosition = room.movePlayer(playerId, decision.steps);
        console.log(
          `Player ${playerId} moved from ${oldPosition} to ${newPosition} (${decision.direction})`
        );

        // Check for events on advanced level
        if (room.gameLevel === "advanced" && room.isOnEventRing(newPosition)) {
          const event = room.getEventForRing(newPosition);
          if (event) {
            eventsTriggered.push({
              player: room.players.get(playerId),
              event: event,
            });
          }
        }
      }

      // Check for winner
      const winner = room.checkWinner();

      // Prepare for next round
      room.nextPlayer();
      room.cardDrawOrder++;
      room.waitingForVotes = false;

      // Broadcast all moves completed
      io.to(roomId).emit("all-decisions-made", {
        allPlayers: room.getPlayersArray(),
        nextCardType: room.getNextCardType(),
        winner: winner,
        eventsTriggered: eventsTriggered,
      });

      // If there's a winner, end the game
      if (winner) {
        io.to(roomId).emit("game-ended", { winner: winner });
        console.log(`Game ended in room ${roomId}. Winner: ${winner.name}`);
      }

      // Reset for next card
      room.currentCard = null;
      room.playerDecisions = {};
      room.waitingForVotes = false;

      // Notify host to draw the next card
      io.to(room.hostSocketId).emit("ready-for-next-card", {
        nextCardType: room.getNextCardType(),
      });

      console.log(
        `All votes processed in room ${roomId}. Ready for next card.`
      );
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    const roomId = gameRooms.get(socket.id);
    if (roomId) {
      const room = gameRooms.get(roomId);
      if (room) {
        if (room.hostSocketId === socket.id) {
          // Host disconnected, end game
          io.to(roomId).emit("host-disconnected");
          gameRooms.delete(roomId);
          console.log(`Host disconnected, room ${roomId} closed`);
        } else {
          // Player disconnected
          room.removePlayer(socket.id);
          io.to(roomId).emit("room-updated", {
            players: room.getPlayersArray(),
            availableIdentities: room.getAvailableIdentities(),
            availablePawns: room.getAvailablePawnIds(),
          });
          console.log(`Player ${socket.id} disconnected from room ${roomId}`);
        }
      }
      gameRooms.delete(socket.id);
    }
  });

  // Get available identities for a room
  socket.on("get-available-identities", (roomCode) => {
    const room = gameRooms.get(roomCode);
    if (room) {
      socket.emit("available-identities", {
        identities: room.getAvailableIdentities(),
        pawnIds: room.getAvailablePawnIds(),
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log(`Server running on port ${PORT}`);
  console.log("\n=== Connection Information ===");
  console.log(
    `📋 Connection info page: http://${localIp}:${PORT}/connection-info`
  );
  console.log(`👨‍🏫 Host interface: http://${localIp}:${PORT}/host`);
  console.log(`👨‍🎓 Player interface: http://${localIp}:${PORT}/player`);
  console.log(`📱 QR Code API: http://${localIp}:${PORT}/api/qr-code`);
  console.log("\n=== Local Access ===");
  console.log(
    `📋 Connection info page: http://localhost:${PORT}/connection-info`
  );
  console.log(`👨‍🏫 Host interface: http://localhost:${PORT}/host`);
  console.log(`👨‍🎓 Player interface: http://localhost:${PORT}/player`);
  console.log(
    "\n💡 Students can scan the QR code from the connection info page!"
  );
});
