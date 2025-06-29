const socket = io();
let gameState = {
    roomCode: null,
    players: [],
    gameStarted: false,
    gameLevel: 'basic',
    currentPlayer: null,
    nextCardType: 'privilege-discrimination',
    phase: 'waiting', // 'waiting', 'card-drawn', 'decisions', 'moving'
    currentCard: null,
    playerDecisions: {}
};

// DOM elements
const createRoomBtn = document.getElementById('createRoomBtn');
const roomInfo = document.getElementById('roomInfo');
const roomCodeDiv = document.getElementById('roomCode');
const startGameBtn = document.getElementById('startGameBtn');
const playersSection = document.getElementById('players-section');
const playersGrid = document.getElementById('playersGrid');
const playerCount = document.getElementById('playerCount');
const gameBoard = document.getElementById('game-board');
const gameControls = document.getElementById('game-controls');
const currentPlayerName = document.getElementById('currentPlayerName');
const currentPlayerStatus = document.getElementById('currentPlayerStatus');
const winnerAnnouncement = document.getElementById('winner-announcement');
const winnerText = document.getElementById('winnerText');
const eventNotification = document.getElementById('eventNotification');
const eventText = document.getElementById('eventText');

// Phase elements
const cardDrawnDisplay = document.getElementById('cardDrawnDisplay');
const cardDescription = document.getElementById('cardDescription');
const decisionPhase = document.getElementById('decisionPhase');
const playerDecisions = document.getElementById('playerDecisions');
const decisionsCount = document.getElementById('decisionsCount');
const totalPlayers = document.getElementById('totalPlayers');
const progressFill = document.getElementById('progressFill');
const proceedBtn = document.getElementById('proceedBtn');

// Host draw card elements
const hostDrawCardSection = document.getElementById('hostDrawCardSection');
const hostDrawCardBtn = document.getElementById('hostDrawCardBtn');

// Updated card samples with new format
let HOST_SAMPLE_CARDS = {};

// Create room
createRoomBtn.addEventListener('click', () => {
    socket.emit('create-room');
});

// Start game
startGameBtn.addEventListener('click', () => {
    const level = document.getElementById('gameLevel').value;
    socket.emit('start-game', level);
});

// Socket events
socket.on('room-created', (data) => {
    gameState.roomCode = data.roomCode;
    roomCodeDiv.textContent = data.roomCode;
    roomInfo.style.display = 'block';
    playersSection.style.display = 'block';
    createRoomBtn.style.display = 'none';
    createSpiralBoard();
});

socket.on('room-updated', (data) => {
    gameState.players = data.players;
    updatePlayersDisplay();
    updateStartButton();
});

socket.on('game-started', (data) => {
    gameState.gameStarted = true;
    gameState.gameLevel = data.gameLevel;
    gameState.currentPlayer = data.currentPlayer;
    gameState.nextCardType = data.nextCardType;
    gameState.phase = 'waiting';

    gameBoard.style.display = 'block';
    gameControls.style.display = 'block';
    startGameBtn.style.display = 'none';
    
    document.getElementById('gameLevel').disabled = true;

    updateCurrentPlayer(data.currentPlayer);
    updatePlayerPositions();
    updatePhaseDisplay();
    showHostDrawCardButton();
});



socket.on('card-drawn', (data) => {
    gameState.currentCard = data.card;
    gameState.phase = 'decisions';
    gameState.playerDecisions = {};

    // Show card drawn on host with step information
    cardDrawnDisplay.style.display = 'block';
    cardDescription.innerHTML = `
                <strong>${getCardTypeDisplay(gameState.nextCardType)}</strong><br>
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
socket.on('player-decision', (data) => {
    // Update progress bar and player decision display
    gameState.playerDecisions[data.playerId] = data.decision;
    updateDecisionProgress();
    updatePlayerDecisionDisplay();
});

socket.on('all-decisions-made', (data) => {
    gameState.players = data.allPlayers;
    updatePlayerPositions();
    
    gameState.currentPlayer = data.currentPlayer;
    updateCurrentPlayer(data.currentPlayer); // Add this line
    //gameState.phase = 'waiting'; // Add this line

    if (data.winner) {
        showWinner(data.winner);
        return;
    }
    
    // Only show ready for next card if event was processed or no event
    if (data.eventProcessed !== false) {
        gameState.nextCardType = data.nextCardType;
        showHostDrawCardButton();
    } else {
        // Show waiting for event decision
        currentPlayerStatus.textContent = 'Waiting for player to make event decision...';
    }
    
    updatePhaseDisplay();
});

socket.on('turn-ended', (data) => {
    gameState.phase = 'waiting';
    gameState.currentPlayer = data.nextPlayer;
    gameState.nextCardType = data.nextCardType;
    gameState.playerDecisions = {};

    updateCurrentPlayer(data.nextPlayer);
    updatePhaseDisplay();
});

socket.on('player-moved', (data) => {
    gameState.players = data.allPlayers;
    updatePlayerPositions();
    updatePlayersDisplay();
});

socket.on('game-ended', (data) => {
    showWinner(data.winner);
});

socket.on('host-disconnected', () => {
    alert('Host has disconnected. Game ended.');
    location.reload();
});

socket.on('error', (error) => {
    alert('Error: ' + error);
});

socket.on('ready-for-next-card', (data) => {
    gameState.nextCardType = data.nextCardType;
    showHostDrawCardButton();
});

// Functions
function updatePlayersDisplay() {
    playersGrid.innerHTML = '';
    playerCount.textContent = gameState.players.length;

    gameState.players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        playerCard.style.borderLeftColor = player.color;

        // Add status indicators during decision phase
        let statusHTML = '';
        if (gameState.phase === 'decisions') {
            const hasDecided = gameState.playerDecisions[player.id] !== undefined;
            playerCard.classList.add(hasDecided ? 'decided' : 'waiting');
            statusHTML = `<div style="padding: 5px; font-size: 12px; color: ${hasDecided ? '#27ae60' : '#f39c12'}; font-weight: bold;">
                        ${hasDecided ? '✓ Vote Received' : '⏳ Waiting for Vote...'}
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
    startGameBtn.textContent = canStart ?
        `Start Game (${gameState.players.length} players)` :
        'Start Game (Need at least 2 players)';
}

function createSpiralBoard() {
    const board = document.getElementById('spiralBoard');
    board.innerHTML = '';

    const boardSize = 600;
    const center = boardSize / 2;
    const eventRings = [5, 10, 15, 20];
    
    // Define ring colors from outer (21) to inner (1) based on your image
    const ringColors = [
    '#1f4e79', '#ffffff', '#4472a8', '#ffffff',
    '#7ba3d1', '#ffffff', '#b8d1ed', '#ffffff',
    '#8e44ad', '#ffffff', '#af7ac5', '#ffffff',
    '#e8b4cb', '#ffffff', '#f06292', '#ffffff',
    '#ff9800', '#ffffff', '#ffcc80', '#ffffff',
    '#4caf50' // Center ring
];


    // Create rings from outer (21) to inner (1)
    for (let ring = 21; ring >= 1; ring--) {
        const ringElement = document.createElement('div');
        ringElement.className = `ring ${eventRings.includes(ring) ? 'event-ring' : ''}`;
        ringElement.id = `ring-${ring}`;

        const radius = (ring / 21) * (boardSize / 2 - 20);
        const size = radius * 2;

        ringElement.style.width = `${size}px`;
        ringElement.style.height = `${size}px`;
        ringElement.style.left = `${center - radius}px`;
        ringElement.style.top = `${center - radius}px`;
        
        // Apply color from the array
        const colorIndex = 21 - ring; // Convert ring number to array index
        ringElement.style.backgroundColor = ringColors[colorIndex];
        ringElement.style.borderColor = ringColors[colorIndex];

        // Remove the ring number code here

        board.appendChild(ringElement);
    }
}

function updatePlayerPositions() {
    // Remove existing pawns
    document.querySelectorAll('.pawn').forEach(pawn => pawn.remove());

    gameState.players.forEach((player, index) => {
        const pawn = document.createElement('div');
        pawn.className = 'pawn';
        pawn.title = `${player.name} (${player.identityName})`;
        
        // Use icon instead of background color
        pawn.textContent = player.icon;
        pawn.style.fontSize = '24px';
        pawn.style.width = '30px';
        pawn.style.height = '30px';
        pawn.style.display = 'flex';
        pawn.style.alignItems = 'center';
        pawn.style.justifyContent = 'center';
        pawn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        pawn.style.borderRadius = '50%';
        pawn.style.border = `2px solid ${player.color}`;

        const ring = document.getElementById(`ring-${player.position}`);
        if (ring) {
            // Position pawns around the ring
            const angle = (index * (360 / gameState.players.length)) * (Math.PI / 180);
            const ringRadius = parseFloat(ring.style.width) / 2;
            const pawnRadius = Math.max(10, ringRadius - 30);

            const x = Math.cos(angle) * pawnRadius;
            const y = Math.sin(angle) * pawnRadius;

            pawn.style.left = `${parseFloat(ring.style.left) + parseFloat(ring.style.width) / 2 + x - 15}px`;
            pawn.style.top = `${parseFloat(ring.style.top) + parseFloat(ring.style.height) / 2 + y - 15}px`;

            document.getElementById('spiralBoard').appendChild(pawn);
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
    cardDrawnDisplay.style.display = 'none';
    decisionPhase.style.display = 'none';
    proceedBtn.style.display = 'none';

    switch (gameState.phase) {
        case 'waiting':
            currentPlayerStatus.textContent = 'Ready to draw next card';
            break;
        case 'decisions':
            cardDrawnDisplay.style.display = 'block';
            decisionPhase.style.display = 'block';
            currentPlayerStatus.textContent = 'Card drawn - waiting for all players to vote';
            break;
        case 'moving':
            currentPlayerStatus.textContent = 'All players have voted - processing moves';
            break;
    }
    updatePlayersDisplay();
}

function updateDecisionProgress() {
    const totalPlayerCount = gameState.players.length;
    const decisionsReceived = Object.keys(gameState.playerDecisions).length;

    decisionsCount.textContent = decisionsReceived;
    totalPlayers.textContent = totalPlayerCount;

    const percentage = totalPlayerCount > 0 ? (decisionsReceived / totalPlayerCount) * 100 : 0;
    progressFill.style.width = `${percentage}%`;
}

function updatePlayerDecisionDisplay() {
    playerDecisions.innerHTML = '';

    gameState.players.forEach(player => {
        const decision = gameState.playerDecisions[player.id];
        const playerDiv = document.createElement('div');
        playerDiv.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px;
                    margin: 5px 0;
                    border-left: 4px solid ${player.color};
                    background: ${decision ? '#f8f9fa' : '#fff3cd'};
                    border-radius: 5px;
                `;

        playerDiv.innerHTML = `
                    <div>
                        <div style="font-weight: bold;">${player.name}</div>
                        <div style="font-size: 12px; color: #666;">${player.identityName}</div>
                        ${decision ? `<div style="color: #27ae60; font-size: 12px; margin-top: 2px;">${decision.description}</div>` : '<div style="color: #856404; font-size: 12px;">Waiting for vote...</div>'}
                    </div>
                    <div style="font-size: 20px;">
                        ${decision ? (decision.direction === 'forward' ? '⬆️' : '⬇️') : '⏳'}
                    </div>
                `;

        playerDecisions.appendChild(playerDiv);
    });
}

function proceedToNextTurn() {
    socket.emit('proceed-to-next-turn');
}

function showEventNotification(events) {
    if (events.length > 0) {
        const event = events[0]; // Show first event
        eventText.textContent = `${event.player.name} landed on ring ${event.player.position}: ${event.event.name} - ${event.event.description}`;
        eventNotification.classList.add('show');

        setTimeout(() => {
            eventNotification.classList.remove('show');
        }, 8000);
    }
}

function showWinner(winner) {
    winnerText.innerHTML = `<strong>${winner.name}</strong> (${winner.identityName}) has reached the center and won the game!`;
    winnerAnnouncement.style.display = 'block';
    gameControls.style.display = 'none';
}

function showHostDrawCardButton() {
    hostDrawCardSection.style.display = 'block';
    hostDrawCardBtn.disabled = false;
    const cardTypeDisplay = getCardTypeDisplay(gameState.nextCardType);
    hostDrawCardBtn.textContent = `🎴 Draw ${cardTypeDisplay} Card`;
}

function hideHostDrawCardButton() {
    hostDrawCardSection.style.display = 'none';
}

function getCardTypeDisplay(cardType) {
    const cardTypeMap = {
        'privilege-discrimination': 'Privilege/Discrimination',
        'social-policies': 'Social Policy',
        'behaviors': 'Behavior'
    };
    return cardTypeMap[cardType] || cardType;
}


// Draw card logic for host
hostDrawCardBtn.addEventListener('click', async () => {
    hostDrawCardBtn.disabled = true;

    // Ensure cards are loaded
    if (Object.keys(HOST_SAMPLE_CARDS).length === 0) {
        await loadCards();
    }

    // Pick a random card from the correct category
    const cardType = gameState.nextCardType;
    const cards = HOST_SAMPLE_CARDS[cardType] || [];
    
    if (cards.length === 0) {
        console.error('No cards available for type:', cardType);
        hostDrawCardBtn.disabled = false;
        return;
    }
    
    const randomCard = cards[Math.floor(Math.random() * cards.length)];

    // Send the card data in the correct format expected by the server
    const cardData = {
        category: cardType,
        description: randomCard.description,
        forwardSteps: randomCard.forwardSteps,
        backwardSteps: randomCard.backwardSteps,
        cardType: getCardTypeDisplay(cardType)
    };

    console.log('Sending card data:', cardData);
    socket.emit('draw-card', cardData);
});

async function loadCards() {
    try {
        const cardTypes = ['privilege-discrimination', 'social-policies', 'behaviors'];
        
        for (const cardType of cardTypes) {
            const response = await fetch(`./cards/${cardType}.json`);
            if (response.ok) {
                HOST_SAMPLE_CARDS[cardType] = await response.json();
            } else {
                console.error(`Failed to load ${cardType} cards`);
                HOST_SAMPLE_CARDS[cardType] = [];
            }
        }
        
        console.log('Cards loaded successfully:', HOST_SAMPLE_CARDS);
    } catch (error) {
        console.error('Error loading cards:', error);
    }
}

loadCards();