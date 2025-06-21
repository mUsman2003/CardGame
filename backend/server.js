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

// Pawn colors available
const PAWN_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA',
  '#F1948A', '#AED6F1', '#A9CCE3', '#D7BDE2', '#A3E4D7',
  '#FAD7A0', '#EDBB99', '#D5A6BD', '#A9DFBF', '#F9E79F',
  '#85929E', '#CD6155', '#AF7AC5', '#5DADE2', '#58D68D',
  '#F4D03F', '#EB984E', '#A569BD', '#5499C7', '#52C41A'
];

class GameRoom {
  constructor(hostSocketId) {
    this.id = generateRoomCode();
    this.hostSocketId = hostSocketId;
    this.players = new Map();
    this.gameStarted = false;
    this.currentPlayerIndex = 0;
    this.usedColors = new Set();
    this.gameLevel = 'basic'; // basic, intermediate, advanced
    this.lastCardCategory = null;
    this.eventRings = new Set([5, 10, 15, 20]); // Rings with events
  }

  addPlayer(socketId, playerData) {
    if (this.usedColors.has(playerData.color)) {
      return { success: false, error: 'Color already taken' };
    }
    
    this.players.set(socketId, {
      id: socketId,
      name: playerData.name,
      color: playerData.color,
      position: 21, // Start at outer ring (21)
      isConnected: true
    });
    
    this.usedColors.add(playerData.color);
    return { success: true };
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.usedColors.delete(player.color);
      this.players.delete(socketId);
    }
  }

  getAvailableColors() {
    return PAWN_COLORS.filter(color => !this.usedColors.has(color));
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

  movePlayer(playerId, steps) {
    const player = this.players.get(playerId);
    if (player) {
      player.position = Math.max(1, Math.min(21, player.position + steps));
      return player.position;
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
      availableColors: room.getAvailableColors()
    });
    
    console.log(`Room created: ${room.id} by host: ${socket.id}`);
  });

  // Player joins room
  socket.on('join-room', (data) => {
    const { roomCode, playerName, playerColor } = data;
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      socket.emit('join-error', 'Room not found');
      return;
    }

    if (room.gameStarted) {
      socket.emit('join-error', 'Game already started');
      return;
    }

    const result = room.addPlayer(socket.id, {
      name: playerName,
      color: playerColor
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
      playerData: room.players.get(socket.id)
    });

    // Update all clients in room
    io.to(roomCode).emit('room-updated', {
      players: room.getPlayersArray(),
      availableColors: room.getAvailableColors()
    });

    console.log(`Player ${playerName} joined room ${roomCode}`);
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

    io.to(roomId).emit('game-started', {
      gameLevel: gameLevel,
      currentPlayer: room.getCurrentPlayer(),
      players: room.getPlayersArray()
    });

    console.log(`Game started in room ${roomId} with ${room.players.size} players`);
  });

  // Host draws a card and applies effects
  socket.on('draw-card', (cardData) => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);
    
    if (!room || room.hostSocketId !== socket.id) {
      socket.emit('error', 'Not authorized');
      return;
    }

    const currentPlayer = room.getCurrentPlayer();
    if (!currentPlayer) return;

    // Apply card effect
    const newPosition = room.movePlayer(currentPlayer.id, cardData.steps);
    const isOnEvent = room.isOnEventRing(newPosition);
    
    // Check for winner
    const winner = room.checkWinner();
    
    // Move to next player
    room.nextPlayer();

    // Broadcast updates
    io.to(roomId).emit('card-drawn', {
      card: cardData,
      player: currentPlayer,
      newPosition: newPosition,
      isOnEvent: isOnEvent,
      winner: winner,
      nextPlayer: room.getCurrentPlayer(),
      allPlayers: room.getPlayersArray()
    });

    if (winner) {
      io.to(roomId).emit('game-ended', { winner: winner });
      console.log(`Game ended in room ${roomId}. Winner: ${winner.name}`);
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
            availableColors: room.getAvailableColors()
          });
          console.log(`Player ${socket.id} disconnected from room ${roomId}`);
        }
      }
      gameRooms.delete(socket.id);
    }
  });

  // Get available colors for a room
  socket.on('get-available-colors', (roomCode) => {
    const room = gameRooms.get(roomCode);
    if (room) {
      socket.emit('available-colors', room.getAvailableColors());
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Host interface: http://localhost:${PORT}/host`);
  console.log(`Player interface: http://localhost:${PORT}/player`);
});