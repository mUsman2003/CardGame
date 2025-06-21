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
app.use(express.static(path.join(__dirname, 'public')));

// Game state management
class GameManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(roomCode) {
        const room = {
            code: roomCode,
            players: new Map(),
            gameState: {
                started: false,
                currentPlayerIndex: 0,
                level: 'basic',
                currentCard: null,
                winner: null
            },
            cardDecks: {
                privilege: [
                    "Your family has a computer at home. Move forward 2 spaces.",
                    "You speak the dominant language fluently. Move forward 1 space.",
                    "Your parents have university degrees. Move forward 2 spaces.",
                    "You have access to private tutoring. Move forward 3 spaces.",
                    "Your family owns their home. Move forward 1 space.",
                    "You have reliable internet access. Move forward 2 spaces.",
                    "Your school has well-funded programs. Move forward 1 space.",
                    "You receive encouragement for higher education. Move forward 2 spaces.",
                    "Your family can afford school supplies easily. Move forward 1 space.",
                    "You have a quiet place to study at home. Move forward 2 spaces."
                ],
                discrimination: [
                    "You face language barriers in school. Move back 2 spaces.",
                    "Your family struggles financially. Move back 1 space.",
                    "You experience bullying due to differences. Move back 3 spaces.",
                    "Limited access to educational resources. Move back 2 spaces.",
                    "Your neighborhood lacks good schools. Move back 1 space.",
                    "You face discrimination based on appearance. Move back 2 spaces.",
                    "Your family works multiple jobs, less homework help. Move back 1 space.",
                    "You lack access to extracurricular activities. Move back 2 spaces.",
                    "You experience microaggressions daily. Move back 1 space.",
                    "Your cultural background is not represented in curriculum. Move back 2 spaces."
                ],
                social_policy: [
                    "Free school meal program launched. All players move forward 1 space.",
                    "Budget cuts affect school resources. All players move back 1 space.",
                    "New anti-discrimination policy implemented. Move forward 2 spaces.",
                    "Scholarship program for disadvantaged students. Move forward 3 spaces.",
                    "Technology access program in schools. Move forward 1 space.",
                    "Mental health support services added. All players move forward 2 spaces.",
                    "School funding formula changed. All players move back 1 space.",
                    "Free tutoring program established. All players move forward 1 space.",
                    "Transportation assistance provided. All players move forward 2 spaces.",
                    "Teacher training on cultural sensitivity. All players move forward 1 space."
                ]
            }
        };
        this.rooms.set(roomCode, room);
        return room;
    }

    getRoom(roomCode) {
        return this.rooms.get(roomCode);
    }

    addPlayerToRoom(roomCode, player) {
        const room = this.getRoom(roomCode);
        if (!room) return false;
        
        if (room.players.size >= 30) {
            return { error: 'Room is full (max 30 players)' };
        }

        // Assign pawn color
        const pawnColors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D2B4DE',
            '#AED6F1', '#A3E4D7', '#F9E79F', '#FADBD8', '#D5DBDB',
            '#FFB3BA', '#BAFFC9', '#BAE1FF', '#FFFFBA', '#FFD700',
            '#FF69B4', '#00CED1', '#9370DB', '#32CD32', '#FF4500'
        ];

        const playerData = {
            id: player.id,
            name: player.name,
            color: pawnColors[room.players.size],
            ring: 21, // Start at outer ring
            socketId: player.socketId,
            connected: true
        };

        room.players.set(player.id, playerData);
        return { success: true, player: playerData };
    }

    removePlayerFromRoom(roomCode, playerId) {
        const room = this.getRoom(roomCode);
        if (room) {
            room.players.delete(playerId);
            if (room.players.size === 0) {
                this.rooms.delete(roomCode);
            }
        }
    }

    drawCard(roomCode) {
        const room = this.getRoom(roomCode);
        if (!room) return null;

        let availableDecks = [];
        const turnNumber = room.gameState.currentPlayerIndex;
        
        switch (room.gameState.level) {
            case 'basic':
                availableDecks = ['privilege', 'discrimination'];
                break;
            case 'intermediate':
                if (turnNumber % 2 === 0) {
                    availableDecks = ['privilege', 'discrimination'];
                } else {
                    availableDecks = ['social_policy'];
                }
                break;
            case 'advanced':
                const cycle = turnNumber % 3;
                if (cycle === 0) availableDecks = ['privilege'];
                else if (cycle === 1) availableDecks = ['discrimination'];
                else availableDecks = ['social_policy'];
                break;
        }
        
        const deckType = availableDecks[Math.floor(Math.random() * availableDecks.length)];
        const deck = room.cardDecks[deckType];
        const cardText = deck[Math.floor(Math.random() * deck.length)];
        
        return {
            category: deckType,
            text: cardText
        };
    }

    movePlayer(roomCode, playerId, spaces) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        const player = room.players.get(playerId);
        if (!player) return false;

        player.ring = Math.max(1, Math.min(21, player.ring - spaces));
        
        // Check for winner
        if (player.ring === 1 && !room.gameState.winner) {
            room.gameState.winner = player;
        }

        return true;
    }

    processCardEffect(roomCode, card) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        const text = card.text.toLowerCase();
        let spaces = 0;
        let affectAllPlayers = false;

        // Parse movement from card text
        if (text.includes('move forward')) {
            const match = text.match(/move forward (\d+)/);
            spaces = match ? parseInt(match[1]) : 1;
        } else if (text.includes('move back')) {
            const match = text.match(/move back (\d+)/);
            spaces = match ? -parseInt(match[1]) : -1;
        }

        // Check if affects all players
        if (text.includes('all players')) {
            affectAllPlayers = true;
        }

        // Apply movement
        if (affectAllPlayers) {
            for (const [playerId, player] of room.players) {
                this.movePlayer(roomCode, playerId, spaces);
            }
        } else {
            const currentPlayer = Array.from(room.players.values())[room.gameState.currentPlayerIndex];
            if (currentPlayer) {
                this.movePlayer(roomCode, currentPlayer.id, spaces);
            }
        }

        return { spaces, affectAllPlayers };
    }

    nextTurn(roomCode) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % room.players.size;
        return true;
    }

    getRoomState(roomCode) {
        const room = this.getRoom(roomCode);
        if (!room) return null;

        return {
            code: room.code,
            players: Array.from(room.players.values()),
            gameState: room.gameState
        };
    }
}

const gameManager = new GameManager();

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Host creates a room
    socket.on('create-room', (callback) => {
        const roomCode = generateRoomCode();
        const room = gameManager.createRoom(roomCode);
        socket.join(roomCode);
        
        console.log(`Room created: ${roomCode}`);
        callback({ success: true, roomCode });
    });

    // Player joins a room
    socket.on('join-room', (data, callback) => {
        const { roomCode, playerName } = data;
        const room = gameManager.getRoom(roomCode);
        
        if (!room) {
            callback({ error: 'Room not found' });
            return;
        }

        const player = {
            id: Date.now() + Math.random(),
            name: playerName,
            socketId: socket.id
        };

        const result = gameManager.addPlayerToRoom(roomCode, player);
        
        if (result.error) {
            callback({ error: result.error });
            return;
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerId = player.id;

        // Notify all clients in the room
        const roomState = gameManager.getRoomState(roomCode);
        io.to(roomCode).emit('room-updated', roomState);
        
        callback({ success: true, player: result.player, roomState });
        console.log(`Player ${playerName} joined room ${roomCode}`);
    });

    // Start game
    socket.on('start-game', (roomCode, callback) => {
        const room = gameManager.getRoom(roomCode);
        if (!room) {
            callback({ error: 'Room not found' });
            return;
        }

        if (room.players.size < 5) {
            callback({ error: 'Need at least 5 players to start' });
            return;
        }

        room.gameState.started = true;
        room.gameState.currentPlayerIndex = 0;

        const roomState = gameManager.getRoomState(roomCode);
        io.to(roomCode).emit('game-started', roomState);
        
        callback({ success: true });
        console.log(`Game started in room ${roomCode}`);
    });

    // Draw card (when it's player's turn)
    socket.on('draw-card', (roomCode, callback) => {
        const room = gameManager.getRoom(roomCode);
        if (!room || !room.gameState.started) {
            callback({ error: 'Game not active' });
            return;
        }

        // Check if it's this player's turn
        const currentPlayer = Array.from(room.players.values())[room.gameState.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.socketId !== socket.id) {
            callback({ error: 'Not your turn' });
            return;
        }

        const card = gameManager.drawCard(roomCode);
        room.gameState.currentCard = card;

        // Process card effect
        const effect = gameManager.processCardEffect(roomCode, card);
        
        // Move to next turn
        gameManager.nextTurn(roomCode);

        const roomState = gameManager.getRoomState(roomCode);
        
        // Broadcast card and updated state to all players
        io.to(roomCode).emit('card-drawn', {
            card,
            effect,
            roomState
        });

        callback({ success: true, card, effect });
        
        // Check for winner
        if (room.gameState.winner) {
            io.to(roomCode).emit('game-ended', {
                winner: room.gameState.winner,
                roomState
            });
        }
    });

    // Change game level
    socket.on('change-level', (data, callback) => {
        const { roomCode, level } = data;
        const room = gameManager.getRoom(roomCode);
        
        if (!room) {
            callback({ error: 'Room not found' });
            return;
        }

        room.gameState.level = level;
        const roomState = gameManager.getRoomState(roomCode);
        io.to(roomCode).emit('room-updated', roomState);
        
        callback({ success: true });
    });

    // Reset game
    socket.on('reset-game', (roomCode, callback) => {
        const room = gameManager.getRoom(roomCode);
        if (!room) {
            callback({ error: 'Room not found' });
            return;
        }

        // Reset all players to starting position
        for (const [playerId, player] of room.players) {
            player.ring = 21;
        }

        room.gameState = {
            started: false,
            currentPlayerIndex: 0,
            level: room.gameState.level, // Keep current level
            currentCard: null,
            winner: null
        };

        const roomState = gameManager.getRoomState(roomCode);
        io.to(roomCode).emit('game-reset', roomState);
        
        callback({ success: true });
        console.log(`Game reset in room ${roomCode}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        if (socket.roomCode && socket.playerId) {
            gameManager.removePlayerFromRoom(socket.roomCode, socket.playerId);
            
            const roomState = gameManager.getRoomState(socket.roomCode);
            if (roomState) {
                io.to(socket.roomCode).emit('room-updated', roomState);
            }
            
            console.log(`Player removed from room ${socket.roomCode}`);
        }
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/join', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

// Get server IP for players to connect
app.get('/api/server-info', (req, res) => {
    const networkInterfaces = require('os').networkInterfaces();
    const addresses = [];
    
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push(net.address);
            }
        }
    }
    
    res.json({
        addresses,
        port: process.env.PORT || 3000
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🎮 Game server running on port ${PORT}`);
    console.log(`📱 Host: http://localhost:${PORT}/host`);
    console.log(`📱 Players join at: http://[your-ip]:${PORT}/join`);
    
    // Display local IP addresses
    const networkInterfaces = require('os').networkInterfaces();
    console.log('\n📡 Available network addresses:');
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`   http://${net.address}:${PORT}/join`);
            }
        }
    }
    console.log('');
});