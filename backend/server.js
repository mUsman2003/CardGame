const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static('public'));

// Game state
const gameRooms = new Map();

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Identity categories available - updated to match client expectations
const IDENTITY_CATEGORIES = [
  { id: 'white_man', name: 'White Man', color: '#3498db', icon: '👨🏻' },
  { id: 'white_woman', name: 'White Woman', color: '#e74c3c', icon: '👩🏻' },
  { id: 'black_man', name: 'Black Man', color: '#8e44ad', icon: '👨🏿' },
  { id: 'black_woman', name: 'Black Woman', color: '#e67e22', icon: '👩🏿' },
  { id: 'lgbtiqa', name: 'LGBTIQA+', color: '#f39c12', icon: '🏳️‍🌈' },
  { id: 'blind', name: 'Blind Person', color: '#16a085', icon: '🦯' },
  { id: 'deaf', name: 'Deaf Person', color: '#2980b9', icon: '🤟' },
  { id: 'disabled', name: 'Physically Disabled', color: '#c0392b', icon: '♿' },
  { id: 'elderly', name: 'Elderly Person', color: '#7f8c8d', icon: '👴' },
  { id: 'neutral', name: 'Neutral', color: '#34495e', icon: '👤' }
];

class GameRoom {
  constructor(hostSocketId) {
    this.id = generateRoomCode();
    this.hostSocketId = hostSocketId;
    this.players = new Map();
    this.gameStarted = false;
    this.currentPlayerIndex = 0;
    this.usedIdentities = new Set();
    this.gameLevel = 'basic'; // basic, intermediate, advanced
    this.cardDrawOrder = 0; // Track which type of card to draw next
    this.eventRings = new Set([5, 10, 15, 20]); // Rings with events
    this.events = {
      5: { name: 'War', description: 'War event - follow special instructions' },
      10: { name: 'Economic Crisis', description: 'Economic crisis - follow special instructions' },
      15: { name: 'Pandemic', description: 'Pandemic event - follow special instructions' },
      20: { name: 'Social Movement', description: 'Social movement - follow special instructions' }
    };
    this.currentCard = null; // Track the current card
    this.playerDecisions = {}; // Track player decisions for the current card
    this.waitingForVotes = false; // Track if we're waiting for player votes
  }

  addPlayer(socketId, playerData) {
    if (this.usedIdentities.has(playerData.identity)) {
      return { success: false, error: 'Identity already taken' };
    }
    
    const identityData = IDENTITY_CATEGORIES.find(cat => cat.id === playerData.identity);
    if (!identityData) {
      return { success: false, error: 'Invalid identity' };
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
      isConnected: true
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
    return IDENTITY_CATEGORIES.filter(identity => !this.usedIdentities.has(identity.id));
  }

  getAvailablePawnIds() {
    return IDENTITY_CATEGORIES
      .filter(identity => !this.usedIdentities.has(identity.id))
      .map(identity => identity.id);
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
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % playersArray.length;
  }

  getNextCardType() {
    switch (this.gameLevel) {
      case 'basic':
        return 'privilege-discrimination';
      
      case 'intermediate':
        // Alternates between privilege-discrimination and social-policies
        return (this.cardDrawOrder % 2 === 0) ? 'privilege-discrimination' : 'social-policies';
      
      case 'advanced':
        // Rotates between privilege-discrimination, social-policies, and behaviors
        const types = ['privilege-discrimination', 'social-policies', 'behaviors'];
        return types[this.cardDrawOrder % 3];
      
      default:
        return 'privilege-discrimination';
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
    return this.getPlayersArray().filter(p => p.id !== this.hostSocketId);
  }
}


io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Host creates a room
  socket.on('create-room', () => {
    const room = new GameRoom(socket.id);
    gameRooms.set(room.id, room);
    gameRooms.set(socket.id, room.id); // Map socket to room
    
    socket.join(room.id);
    socket.emit('room-created', {
      roomCode: room.id,
      availableIdentities: room.getAvailableIdentities(),
      availablePawns: room.getAvailablePawnIds()
    });
    
    console.log(`Room created: ${room.id} by host: ${socket.id}`);
  });

  // Player joins room
  socket.on('join-room', (data) => {
    const { roomCode, playerName, playerIdentity, playerPawn } = data;
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      socket.emit('join-error', 'Room not found');
      return;
    }

    if (room.gameStarted) {
      socket.emit('join-error', 'Game already started');
      return;
    }

    // Use playerPawn.id if playerPawn is an object, otherwise use playerIdentity
    const identityId = playerPawn ? (playerPawn.id || playerPawn) : playerIdentity;

    const result = room.addPlayer(socket.id, {
      name: playerName,
      identity: identityId
    });

    if (!result.success) {
      socket.emit('join-error', result.error);
      return;
    }

    socket.join(roomCode);
    gameRooms.set(socket.id, roomCode); // Map socket to room

    // Notify player they joined successfully
    socket.emit('joined-room', {
      roomCode: roomCode,
      playerData: room.players.get(socket.id),
      gameLevel: room.gameLevel
    });

    // Update all clients in room
    io.to(roomCode).emit('room-updated', {
      players: room.getPlayersArray(),
      availableIdentities: room.getAvailableIdentities(),
      availablePawns: room.getAvailablePawnIds(),
      gameLevel: room.gameLevel
    });

    console.log(`Player ${playerName} joined room ${roomCode} as ${identityId}`);
  });

  // Host starts the game
  socket.on('start-game', (gameLevel = 'basic') => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);
    
    if (!room || room.hostSocketId !== socket.id) {
      socket.emit('error', 'Not authorized to start game');
      return;
    }

    if (room.players.size < 2) {
      socket.emit('error', 'Need at least 2 players to start');
      return;
    }

    room.gameStarted = true;
    room.gameLevel = gameLevel;
    room.currentPlayerIndex = 0;
    room.cardDrawOrder = 0;

    io.to(roomId).emit('game-started', {
      gameLevel: gameLevel,
      currentPlayer: room.getCurrentPlayer(),
      players: room.getPlayersArray(),
      nextCardType: room.getNextCardType()
    });

    console.log(`Game started in room ${roomId} with ${room.players.size} players at ${gameLevel} level`);
  });

  // Draw card event: only host can draw
  socket.on('draw-card', (cardData) => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);
    
    if (!room || !room.gameStarted) {
      socket.emit('error', 'Game not active');
      return;
    }
    
    // Only the host can draw a card
    if (room.hostSocketId !== socket.id) {
      socket.emit('error', 'Only the host can draw a card');
      return;
    }

    // Check if we're already waiting for votes
    if (room.waitingForVotes) {
      socket.emit('error', 'Still waiting for player votes on current card');
      return;
    }
    
    // Check if card type matches expected type
    const expectedCardType = room.getNextCardType();
    if (cardData.category !== expectedCardType) {
      socket.emit('error', `Expected ${expectedCardType} card, but got ${cardData.category}`);
      return;
    }
    
    // Set current card and reset player decisions
    room.currentCard = cardData;
    room.playerDecisions = {};
    room.waitingForVotes = true;
    
    // Broadcast card to all clients (including host)
    io.to(roomId).emit('card-drawn', {
      card: cardData,
      cardDrawnBy: { id: room.hostSocketId, name: 'Host' },
      nextCardType: room.getNextCardType(),
      cardType: cardData.category
    });

    console.log(`Card drawn in room ${roomId}: ${cardData.description || cardData.text}`);
  });

  // Player submits their vote (forward/backward)
  socket.on('player-vote', (voteData) => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);
    
    if (!room || !room.gameStarted) {
      socket.emit('error', 'Game not active');
      return;
    }
    
    if (!room.currentCard || !room.waitingForVotes) {
      socket.emit('error', 'No card drawn or not accepting votes');
      return;
    }
    
    // Only allow actual players (not host) to vote
    if (socket.id === room.hostSocketId) {
      socket.emit('error', 'Host cannot vote');
      return;
    }

    // Check if player already voted
    if (room.playerDecisions[socket.id] !== undefined) {
      socket.emit('error', 'You have already voted for this card');
      return;
    }
    
    // Convert vote direction to movement steps
    // forward = move toward center (negative step), backward = move toward outer (positive step)
    const steps = voteData.direction === 'forward' ? -1 : 1;
    
    // Record the player's decision
    room.playerDecisions[socket.id] = {
      direction: voteData.direction,
      description: voteData.description,
      steps: steps
    };
    
    // Notify all clients of the updated decision
    io.to(roomId).emit('player-decision', {
      playerId: socket.id,
      decision: room.playerDecisions[socket.id]
    });
    
    // Check if all non-host players have voted
    const nonHostPlayers = room.getNonHostPlayers();
    const votesReceived = Object.keys(room.playerDecisions).length;
    
    console.log(`Vote received from ${socket.id}: ${voteData.direction}. Votes: ${votesReceived}/${nonHostPlayers.length}`);
    
    if (votesReceived === nonHostPlayers.length) {
      // All players have voted - process moves
      let eventsTriggered = [];
      
      // Apply moves to all players who voted
      for (const [playerId, decision] of Object.entries(room.playerDecisions)) {
        const oldPosition = room.players.get(playerId).position;
        const newPosition = room.movePlayer(playerId, decision.steps);
        console.log(`Player ${playerId} moved from ${oldPosition} to ${newPosition} (${decision.direction})`);
        
        // Check for events on advanced level
        if (room.gameLevel === 'advanced' && room.isOnEventRing(newPosition)) {
          const event = room.getEventForRing(newPosition);
          if (event) {
            eventsTriggered.push({
              player: room.players.get(playerId),
              event: event
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
      io.to(roomId).emit('all-decisions-made', {
        allPlayers: room.getPlayersArray(),
        nextCardType: room.getNextCardType(),
        winner: winner,
        eventsTriggered: eventsTriggered
      });
      
      // If there's a winner, end the game
      if (winner) {
        io.to(roomId).emit('game-ended', { winner: winner });
        console.log(`Game ended in room ${roomId}. Winner: ${winner.name}`);
      }
      
      // Reset for next card
      room.currentCard = null;
      room.playerDecisions = {};
      room.waitingForVotes = false;
      
      // Notify host to draw the next card
      io.to(room.hostSocketId).emit('ready-for-next-card', {
        nextCardType: room.getNextCardType()
      });
      
      console.log(`All votes processed in room ${roomId}. Ready for next card.`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const roomId = gameRooms.get(socket.id);
    if (roomId) {
      const room = gameRooms.get(roomId);
      if (room) {
        if (room.hostSocketId === socket.id) {
          // Host disconnected, end game
          io.to(roomId).emit('host-disconnected');
          gameRooms.delete(roomId);
          console.log(`Host disconnected, room ${roomId} closed`);
        } else {
          // Player disconnected
          room.removePlayer(socket.id);
          io.to(roomId).emit('room-updated', {
            players: room.getPlayersArray(),
            availableIdentities: room.getAvailableIdentities(),
            availablePawns: room.getAvailablePawnIds()
          });
          console.log(`Player ${socket.id} disconnected from room ${roomId}`);
        }
      }
      gameRooms.delete(socket.id);
    }
  });

  // Get available identities for a room
  socket.on('get-available-identities', (roomCode) => {
    const room = gameRooms.get(roomCode);
    if (room) {
      socket.emit('available-identities', {
        identities: room.getAvailableIdentities(),
        pawnIds: room.getAvailablePawnIds()
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Host interface: http://localhost:${PORT}/host`);
  console.log(`Player interface: http://localhost:${PORT}/player`);
});