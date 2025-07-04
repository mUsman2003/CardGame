# Spiral Board Game - Digital Adaptation

A digital multiplayer adaptation of the educational spiral board game designed for classroom environments. This implementation allows 5-30 players to participate using their mobile phones while the main game board is displayed on a host screen.

## Features

- **Host-Player Architecture**: One host controls the main game board, players use mobile devices
- **Real-time Multiplayer**: Uses WebSockets for instant synchronization
- **Three Game Levels**:
  - Basic: Privilege/Discrimination cards only
  - Intermediate: Adds Social Policy cards
  - Advanced: All card types plus event rings
- **Mobile-Friendly**: Optimized player interface for phones
- **Visual Board**: Interactive spiral board with 21 rings
- **Room System**: Secure room codes for joining games

## Setup Instructions

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. **Create project directory and navigate to it:**
```bash
mkdir spiral-board-game
cd spiral-board-game
```

2. **Create the file structure:**
```
backend/
├── server.js
├── package.json
├── public/
│   ├── host/
│   │   └── index.html
│   └── player/
│       └── index.html
```

3. **Save the provided files:**
   - Copy the server code to `server.js`
   - Copy the package.json content to `package.json`
   - Create `public/host/index.html` with the host interface code
   - Create `public/player/index.html` with the player interface code

4. **Install dependencies:**
```bash
npm install
```

5. **Start the server:**
```bash
npm start
```

The server will start on port 3000 (or the port specified in the PORT environment variable).

### Accessing the Game

- **Host Interface**: Open `http://localhost:3000/host/index.html` on the main display (laptop/projector)
- **Player Interface**: Players visit `http://[YOUR_IP]:3000/player/index.html` on their mobile phones

Replace `[YOUR_IP]` with your computer's local IP address (e.g., 192.168.1.100).

## How to Play

### For the Host:

1. **Setup**:
   - Open the host interface on your main display
   - Click "Create New Room" - this generates a 6-character room code
   - Share the room code with players
   - Select the game level (Basic/Intermediate/Advanced)

2. **Starting the Game**:
   - Wait for players to join (minimum 2, recommended 5-30)
   - Click "Start Game" when ready
   - The spiral board will appear with all player pawns

3. **During the Game**:
   - The current player is highlighted
   - Draw cards by clicking the appropriate category buttons
   - Cards automatically move the current player and advance to the next player
   - Watch for players landing on event rings (red rings in Advanced mode)
   - Game ends when first player reaches the center (ring 1)

### For Players:

1. **Joining**:
   - Enter your name
   - Enter the room code provided by the host
   - Select an available pawn color
   - Click "Join Game"

2. **During the Game**:
   - Your phone shows your current position and other players
   - When it's your turn, you'll see a notification
   - Follow the host's instructions - no actions needed on your phone during gameplay
   - Watch the main board for the visual game progress

## Game Rules

1. **Starting Position**: All players begin on the outer ring (ring 21)
2. **Turn Order**: Players take turns in the order they joined
3. **Card Effects**: 
   - Privilege cards: Move forward (+1 to +3 rings)
   - Discrimination cards: Move backward (-1 to -3 rings)
   - Social Policy cards: Various effects (+2 to -1 rings)
4. **Objective**: First player to reach the center ring (ring 1) wins
5. **Event Rings**: In Advanced mode, landing on rings 5, 10, 15, or 20 triggers special events

## Game Levels

- **Basic**: Only Privilege and Discrimination cards
- **Intermediate**: Adds Social Policy cards, alternating with Privilege/Discrimination
- **Advanced**: All card types plus event rings that trigger special scenarios

## Technical Details

- **Backend**: Node.js with Express and Socket.IO
- **Real-time Communication**: WebSocket connections for instant updates
- **Mobile Responsive**: Player interface optimized for mobile devices
- **Room Management**: Secure room codes and automatic cleanup
- **Error Handling**: Comprehensive error handling and reconnection logic

## Troubleshooting

### Common Issues:

1. **Players can't connect**:
   - Ensure all devices are on the same network
   - Check firewall settings
   - Verify the correct IP address is being used

2. **Game not starting**:
   - Ensure minimum 2 players have joined
   - Check that host clicked "Start Game"

3. **Connection lost**:
   - Players will see error messages
   - Host disconnection ends the game
   - Players can refresh to rejoin if the host is still active

### Network Setup:
To find your computer's IP address:
- **Windows**: Run `ipconfig` in Command Prompt
- **Mac/Linux**: Run `ifconfig` or `ip addr` in Terminal
- Look for your local network IP (usually starts with 192.168. or 10.)

## Customization

The game can be easily customized by modifying:
- **Card categories and effects** in the server code
- **Board design and ring count** in the host interface
- **Player colors** in both server and client code
- **Game rules and win conditions** in the game logic


---

*Digital adaptation created for educational purposes. Original game concept by Manuel Cruz.*