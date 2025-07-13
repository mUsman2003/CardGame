const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const os = require("os");

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

// Servir arquivos estáticos
app.use(express.static("public"));

// Estado do jogo
const gameRooms = new Map();

// Gerar código aleatório da sala
function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Categorias de identidade disponíveis - atualizado para corresponder às expectativas do cliente
const IDENTITY_CATEGORIES = [
  { id: "white_man", name: "Homem Branco", color: "#3498db", icon: "👨🏻" },
  { id: "white_woman", name: "Mulher Branca", color: "#e74c3c", icon: "👩🏻" },
  { id: "black_man", name: "Homem Negro", color: "#8e44ad", icon: "👨🏿" },
  { id: "black_woman", name: "Mulher Negra", color: "#e67e22", icon: "👩🏿" },
  { id: "lgbtiqa", name: "LGBTIQA+", color: "#f39c12", icon: "🏳️‍🌈" },
  { id: "blind", name: "Pessoa Cega", color: "#16a085", icon: "🦯" },
  { id: "deaf", name: "Pessoa Surda", color: "#2980b9", icon: "👂" },
  {
    id: "disabled",
    name: "Pessoa com Deficiência Física",
    color: "#c0392b",
    icon: "♿",
  },
  { id: "elderly", name: "Pessoa Idosa", color: "#7f8c8d", icon: "👴" },
  { id: "neutral", name: "Neutro", color: "#34495e", icon: "👤" },
];

class GameRoom {
  constructor(hostSocketId) {
    this.id = generateRoomCode();
    this.hostSocketId = hostSocketId;
    this.disconnectedPlayers = new Map();
    this.players = new Map();
    this.gameStarted = false;
    this.currentPlayerIndex = 0;
    this.usedNames = new Set(); // Alterado de usedIdentities para usedNames
    this.gameLevel = "basic"; // básico, intermediário, avançado
    this.cardDrawOrder = 0; // Rastrear qual tipo de carta desenhar a seguir
    this.eventRings = new Set([2, 6, 10, 14, 18]); // Updated ring positions
    this.events = {
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
    this.currentCard = null; // Rastrear a carta atual
    this.playerDecisions = {}; // Rastrear decisões dos jogadores para a carta atual
    this.waitingForVotes = false; // Rastrear se estamos esperando votos dos jogadores
  }
  // Add this new method to GameRoom class
  findPlayerByNameAndIdentity(playerName, playerIdentity) {
    // Check active players
    for (let player of this.players.values()) {
      if (player.name === playerName && player.identity === playerIdentity) {
        return { player, isActive: true };
      }
    }

    // Check disconnected players
    for (let player of this.disconnectedPlayers.values()) {
      if (player.name === playerName && player.identity === playerIdentity) {
        return { player, isActive: false };
      }
    }

    return null;
  }

  addPlayer(socketId, playerData) {
    // Verificar nomes duplicados em vez de identidades
    if (this.usedNames.has(playerData.name.toLowerCase())) {
      return { success: false, error: "Nome já utilizado" };
    }

    const identityData = IDENTITY_CATEGORIES.find(
      (cat) => cat.id === playerData.identity
    );
    if (!identityData) {
      return { success: false, error: "Identidade inválida" };
    }

    this.players.set(socketId, {
      id: socketId,
      name: playerData.name,
      identity: playerData.identity,
      identityName: identityData.name,
      color: identityData.color,
      icon: identityData.icon,
      pawnId: playerData.identity, // Adicionar pawnId para compatibilidade com cliente
      position: 21, // Começar no anel externo (21)
      isConnected: true,
    });

    // Armazenar o nome em vez da identidade
    this.usedNames.add(playerData.name.toLowerCase());
    return { success: true };
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      // Remover o nome em vez da identidade
      this.usedNames.delete(player.name.toLowerCase());
      this.players.delete(socketId);
    }
  }

  getAvailableIdentities() {
    // Retornar todas as identidades já que podem ser reutilizadas
    return IDENTITY_CATEGORIES;
  }

  getAvailablePawnIds() {
    // Retornar todos os IDs de peão já que podem ser reutilizados
    return IDENTITY_CATEGORIES.map((identity) => identity.id);
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
        // Alterna entre privilege-discrimination e social-policies
        return this.cardDrawOrder % 2 === 0
          ? "privilege-discrimination"
          : "social-policies";

      case "advanced":
        // Rotaciona entre privilege-discrimination, social-policies e behaviors
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
      // Lógica de movimento: passos negativos = mover em direção ao centro (para frente), passos positivos = mover em direção ao exterior (para trás)
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

  // Obter apenas jogadores não-anfitriões (jogadores reais do jogo)
  getNonHostPlayers() {
    return this.getPlayersArray().filter((p) => p.id !== this.hostSocketId);
  }

  processEventDecision(eventType, playerId, decision, targetPlayerId = null) {
    const player = this.players.get(playerId);
    const playersArray = this.getPlayersArray();

    switch (eventType) {
      case "war":
        if (decision === "self_retreat") {
          this.movePlayer(playerId, 1); // Mover jogador de volta 1 casa
        } else if (decision === "all_retreat") {
          // Mover todos os jogadores de volta 2 casas
          playersArray.forEach((p) => this.movePlayer(p.id, 2));
        }
        break;

      case "global_warming":
        const mostBackwardGW = this.getMostBackwardPlayer();

        if (decision === "remain_help_backward") {
          this.movePlayer(mostBackwardGW.id, -1); // Mais recuado avança 1 casa
        } else if (decision === "self_advance") {
          this.movePlayer(playerId, -1); // Jogador avança 1 casa
        }
        break;

      case "corruption":
        if (decision === "help_other" && targetPlayerId) {
          this.movePlayer(targetPlayerId, -1); // Jogador alvo avança 1 casa
        }
        // Se a decisão for 'remain', não fazer nada
        break;

      case "crisis":
        const mostAdvanced = this.getMostAdvancedPlayer();
        const mostBackward = this.getMostBackwardPlayer();

        if (playerId === mostAdvanced.id) {
          if (decision === "self_retreat") {
            this.movePlayer(playerId, 1); // Mais avançado recua 1 casa
          } else if (decision === "help_backward") {
            this.movePlayer(mostBackward.id, -1); // Mais recuado avança 1 casa
          }
        }
        break;

      case "fascism":
        if (decision === "advance_others_retreat") {
          // Jogador avança 1 casa
          this.movePlayer(playerId, -1);
          // Outros jogadores recuam 1 casa
          playersArray.forEach((p) => {
            if (p.id !== playerId) {
              this.movePlayer(p.id, 1);
            }
          });
        }
        // Se a decisão for 'remain', não fazer nada
        break;
    }
  }

  getMostAdvancedPlayer() {
    const players = this.getPlayersArray();
    return players.reduce((min, player) =>
      player.position < min.position ? player : min
    );
  }

  getMostBackwardPlayer() {
    const players = this.getPlayersArray();
    return players.reduce((max, player) =>
      player.position > max.position ? player : max
    );
  }

  getEventChoices(eventType, playerId) {
    const player = this.players.get(playerId);
    const mostAdvanced = this.getMostAdvancedPlayer();
    const mostBackward = this.getMostBackwardPlayer();

    switch (eventType) {
      case "war":
        return [
          { id: "self_retreat", text: "Eu recuo 1 casa" },
          { id: "all_retreat", text: "Todos recuam 2 casas" },
        ];

      case "global_warming":
        return [
          {
            id: "remain_help_backward",
            text: `Permanecer e ajudar ${mostBackward.name} a avançar 1 casa`,
          },
          { id: "self_advance", text: "Eu avanço 1 casa" },
        ];

      case "corruption":
        const otherPlayers = this.getPlayersArray().filter(
          (p) => p.id !== playerId
        );
        const choices = [{ id: "remain", text: "Permanecer na posição atual" }];
        otherPlayers.forEach((p) => {
          choices.push({
            id: "help_other",
            text: `Ajudar ${p.name} a avançar 1 casa`,
            targetId: p.id,
          });
        });
        return choices;

      case "crisis":
        if (playerId === mostAdvanced.id) {
          return [
            { id: "self_retreat", text: "Eu recuo 1 casa" },
            {
              id: "help_backward",
              text: `Ajudar ${mostBackward.name} a avançar 1 casa`,
            },
          ];
        }
        return null; // Apenas o jogador mais avançado pode escolher

      case "fascism":
        return [
          { id: "remain", text: "Permanecer na posição atual" },
          {
            id: "advance_others_retreat",
            text: "Eu avanço 1 casa e os outros recuam 1 casa",
          },
        ];

      default:
        return [];
    }
  }

  // NEW METHOD: Get current game state for reconnecting players
  getCurrentGameState() {
    return {
      gameStarted: this.gameStarted,
      gameLevel: this.gameLevel,
      currentPlayer: this.getCurrentPlayer(),
      players: this.getPlayersArray(),
      nextCardType: this.getNextCardType(),
      currentCard: this.currentCard,
      waitingForVotes: this.waitingForVotes,
      playerDecisions: this.playerDecisions,
      cardDrawOrder: this.cardDrawOrder,
    };
  }
}

io.on("connection", (socket) => {
  console.log("Nova conexão:", socket.id);

  // Anfitrião cria uma sala
  socket.on("create-room", () => {
    const room = new GameRoom(socket.id);
    gameRooms.set(room.id, room);
    gameRooms.set(socket.id, room.id); // Mapear socket para sala

    socket.join(room.id);
    socket.emit("room-created", {
      roomCode: room.id,
      availableIdentities: room.getAvailableIdentities(),
      availablePawns: room.getAvailablePawnIds(),
    });

    console.log(`Sala criada: ${room.id} pelo anfitrião: ${socket.id}`);
  });

  // Jogador entra na sala
  socket.on("join-room", (data) => {
    const { roomCode, playerName, playerIdentity, playerPawn } = data;
    const room = gameRooms.get(roomCode);

    if (!room) {
      socket.emit("join-error", "Sala não encontrada");
      return;
    }

    // Usar playerPawn.id se playerPawn for um objeto, caso contrário usar playerIdentity
    const identityId = playerPawn
      ? playerPawn.id || playerPawn
      : playerIdentity;

    // Check if this is a reconnection attempt
    const existingPlayer = room.findPlayerByNameAndIdentity(
      playerName,
      identityId
    );

    if (existingPlayer) {
      // This is a reconnection
      if (existingPlayer.isActive) {
        socket.emit("join-error", "Jogador já está conectado");
        return;
      }

      // Reconnect the player
      const playerData = existingPlayer.player;
      playerData.id = socket.id; // Update socket ID
      playerData.isConnected = true;

      // Move from disconnected to active players
      room.disconnectedPlayers.delete(playerData.originalId);
      room.players.set(socket.id, playerData);

      socket.join(roomCode);
      gameRooms.set(socket.id, roomCode);

      // Send appropriate response based on game state
      if (room.gameStarted) {
        socket.emit("joined-room", {
          roomCode: roomCode,
          playerData: playerData,
          gameLevel: room.gameLevel,
          reconnected: true,
        });

        // Send current game state
        const gameState = room.getCurrentGameState();
        socket.emit("game-started", gameState);

        // CRITICAL FIX: If there's a current card and we're waiting for votes, send it to the reconnecting player
        if (room.currentCard && room.waitingForVotes) {
          socket.emit("card-drawn", {
            card: room.currentCard,
            cardDrawnBy: { id: room.hostSocketId, name: "Anfitrião" },
            nextCardType: room.getNextCardType(),
            cardType: room.currentCard.category,
          });

          // Also send any existing player decisions
          for (const [playerId, decision] of Object.entries(
            room.playerDecisions
          )) {
            socket.emit("player-decision", {
              playerId: playerId,
              decision: decision,
            });
          }

          console.log(
            `Reconnecting player ${playerName} received current card state`
          );
        }
      } else {
        socket.emit("joined-room", {
          roomCode: roomCode,
          playerData: playerData,
          gameLevel: room.gameLevel,
          reconnected: true,
        });
      }

      // Update all clients
      io.to(roomCode).emit("room-updated", {
        players: room.getPlayersArray(),
        availableIdentities: room.getAvailableIdentities(),
        availablePawns: room.getAvailablePawnIds(),
        gameLevel: room.gameLevel,
      });

      console.log(`Jogador ${playerName} reconectado na sala ${roomCode}`);
      return;
    }

    // New player trying to join
    if (room.gameStarted) {
      socket.emit(
        "join-error",
        "Jogo já iniciado. Apenas jogadores existentes podem reconectar."
      );
      return;
    }

    // Regular join logic for new players
    const result = room.addPlayer(socket.id, {
      name: playerName,
      identity: identityId,
    });

    if (!result.success) {
      socket.emit("join-error", result.error);
      return;
    }

    socket.join(roomCode);
    gameRooms.set(socket.id, roomCode);

    // Notificar jogador que entrou com sucesso
    socket.emit("joined-room", {
      roomCode: roomCode,
      playerData: room.players.get(socket.id),
      gameLevel: room.gameLevel,
    });

    // Atualizar todos os clientes na sala
    io.to(roomCode).emit("room-updated", {
      players: room.getPlayersArray(),
      availableIdentities: room.getAvailableIdentities(),
      availablePawns: room.getAvailablePawnIds(),
      gameLevel: room.gameLevel,
    });

    console.log(
      `Jogador ${playerName} entrou na sala ${roomCode} como ${identityId}`
    );
  });

  // Anfitrião inicia o jogo
  socket.on("start-game", (gameLevel = "basic") => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);

    if (!room || room.hostSocketId !== socket.id) {
      socket.emit("error", "Não autorizado a iniciar o jogo");
      return;
    }

    if (room.players.size < 2) {
      socket.emit("error", "Necessário pelo menos 2 jogadores para iniciar");
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
      `Jogo iniciado na sala ${roomId} com ${room.players.size} jogadores no nível ${gameLevel}`
    );
  });

  // Evento de puxar carta: apenas o anfitrião pode puxar
  socket.on("draw-card", (cardData) => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);

    if (!room || !room.gameStarted) {
      socket.emit("error", "Jogo não ativo");
      return;
    }

    // Apenas o anfitrião pode puxar uma carta
    if (room.hostSocketId !== socket.id) {
      socket.emit("error", "Apenas o anfitrião pode puxar uma carta");
      return;
    }

    // Verificar se já estamos esperando votos
    if (room.waitingForVotes) {
      socket.emit(
        "error",
        "Ainda aguardando votos dos jogadores na carta atual"
      );
      return;
    }

    // Verificar se o tipo de carta corresponde ao tipo esperado
    const expectedCardType = room.getNextCardType();
    if (cardData.category !== expectedCardType) {
      socket.emit(
        "error",
        `Esperado carta ${expectedCardType}, mas recebido ${cardData.category}`
      );
      return;
    }

    // Validar formato da carta
    if (
      !cardData.hasOwnProperty("forwardSteps") ||
      !cardData.hasOwnProperty("backwardSteps")
    ) {
      socket.emit(
        "error",
        "Formato de carta inválido: faltando forwardSteps ou backwardSteps"
      );
      return;
    }

    // Definir carta atual e resetar decisões dos jogadores
    room.currentCard = cardData;
    room.playerDecisions = {};
    room.waitingForVotes = true;

    // IMPORTANT: Transmitir carta para TODOS os jogadores na sala (incluindo anfitrião)
    // Use io.to(roomId).emit para garantir que todos recebam
    io.to(roomId).emit("card-drawn", {
      card: cardData,
      cardDrawnBy: { id: room.hostSocketId, name: "Anfitrião" },
      nextCardType: room.getNextCardType(),
      cardType: cardData.category,
      // Add these fields to help with debugging
      forwardSteps: cardData.forwardSteps,
      backwardSteps: cardData.backwardSteps,
    });

    console.log(`Carta puxada na sala ${roomId}: ${cardData.description}`);
    console.log(`Enviado para ${room.players.size} jogadores na sala`);
  });

  // Adicionar este novo manipulador de evento socket em seu server.js
  socket.on("event-decision", (data) => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);

    if (!room || !room.gameStarted) {
      socket.emit("error", "Jogo não ativo");
      return;
    }

    const { eventType, decision, targetPlayerId } = data;

    // Processar a decisão do evento
    room.processEventDecision(eventType, socket.id, decision, targetPlayerId);

    // Verificar vencedor após evento
    const winner = room.checkWinner();

    // Agora prosseguir com a conclusão do turno
    room.nextPlayer();
    room.cardDrawOrder++;
    room.waitingForVotes = false;
    room.currentCard = null;
    room.playerDecisions = {};

    // Transmitir o resultado final
    io.to(roomId).emit("all-decisions-made", {
      allPlayers: room.getPlayersArray(),
      nextCardType: room.getNextCardType(),
      winner: winner,
      eventProcessed: true,
      currentPlayer: room.getCurrentPlayer(),
    });

    if (winner) {
      io.to(roomId).emit("game-ended", { winner: winner });
    } else {
      // Notificar anfitrião para puxar a próxima carta
      io.to(room.hostSocketId).emit("ready-for-next-card", {
        nextCardType: room.getNextCardType(),
      });
    }
  });

  // Jogador submete seu voto (para frente/para trás)
  socket.on("player-vote", (voteData) => {
    const roomId = gameRooms.get(socket.id);
    const room = gameRooms.get(roomId);

    if (!room || !room.gameStarted) {
      socket.emit("error", "Jogo não ativo");
      return;
    }

    if (!room.currentCard || !room.waitingForVotes) {
      socket.emit("error", "Nenhuma carta puxada ou não aceitando votos");
      return;
    }

    // Permitir apenas jogadores reais (não anfitrião) votarem
    if (socket.id === room.hostSocketId) {
      socket.emit("error", "Anfitrião não pode votar");
      return;
    }

    // Verificar se o jogador já votou
    if (room.playerDecisions[socket.id] !== undefined) {
      socket.emit("error", "Você já votou nesta carta");
      return;
    }

    // Calcular passos de movimento baseado na direção do voto e valores da carta
    let steps;
    if (voteData.direction === "forward") {
      // Movimento para frente: usar forwardSteps da carta (valor negativo para mover em direção ao centro)
      steps = -room.currentCard.forwardSteps;
    } else {
      // Movimento para trás: usar backwardSteps da carta (valor positivo para mover em direção ao exterior)
      steps = room.currentCard.backwardSteps;
    }

    // Registrar a decisão do jogador
    room.playerDecisions[socket.id] = {
      direction: voteData.direction,
      description: voteData.description,
      steps: steps,
      cardSteps:
        voteData.direction === "forward"
          ? room.currentCard.forwardSteps
          : room.currentCard.backwardSteps,
    };

    // Notificar todos os clientes da decisão atualizada
    io.to(roomId).emit("player-decision", {
      playerId: socket.id,
      decision: room.playerDecisions[socket.id],
    });

    // Verificar se todos os jogadores não-anfitriões votaram
    const nonHostPlayers = room.getNonHostPlayers();
    const votesReceived = Object.keys(room.playerDecisions).length;

    console.log(
      `Voto recebido de ${socket.id}: ${voteData.direction} (${
        voteData.direction === "forward"
          ? room.currentCard.forwardSteps
          : room.currentCard.backwardSteps
      } passos). Votos: ${votesReceived}/${nonHostPlayers.length}`
    );

    if (votesReceived === nonHostPlayers.length) {
      // Todos os jogadores votaram - processar movimentos
      // Substituir a seção de manipulação de eventos existente por:
      let eventsTriggered = [];
      let cardDrawerEvents = null; // Rastrear apenas eventos para quem puxou a carta
      const cardDrawer = room.getCurrentPlayer();
      // Aplicar movimentos a todos os jogadores que votaram
      for (const [playerId, decision] of Object.entries(room.playerDecisions)) {
        const oldPosition = room.players.get(playerId).position;
        const newPosition = room.movePlayer(playerId, decision.steps);
        console.log(
          `Jogador ${playerId} moveu de ${oldPosition} para ${newPosition} (${decision.direction}: ${decision.cardSteps} passos)`
        );

        // Verificar eventos APENAS para quem puxou a carta
        if (
          room.gameLevel === "advanced" &&
          playerId === cardDrawer.id &&
          room.isOnEventRing(newPosition)
        ) {
          const event = room.getEventForRing(newPosition);
          if (event) {
            const choices = room.getEventChoices(event.type, playerId);
            if (choices && choices.length > 0) {
              cardDrawerEvents = {
                player: room.players.get(playerId),
                event: event,
                choices: choices,
              };
            }
          }
        }
      }
      // Se quem puxou a carta pousou em evento, aguardar sua decisão
      if (cardDrawerEvents) {
        io.to(cardDrawerEvents.player.id).emit(
          "event-choice-required",
          cardDrawerEvents
        );
        // Não prosseguir para o próximo turno ainda
        return;
      }
      // Verificar vencedor
      const winner = room.checkWinner();

      // Preparar para próxima rodada
      room.nextPlayer();
      //gameState.currentPlayer = room.getCurrentPlayer(); // Adicionar esta linha
      room.cardDrawOrder++;
      room.waitingForVotes = false;

      // Transmitir todos os movimentos concluídos - ESTA É A CORREÇÃO CHAVE
      io.to(roomId).emit("all-decisions-made", {
        allPlayers: room.getPlayersArray(),
        nextCardType: room.getNextCardType(),
        winner: winner,
        eventsTriggered: eventsTriggered,
        currentPlayer: room.getCurrentPlayer(),
      });

      // TAMBÉM enviar atualizações individuais dos jogadores para garantir sincronização - NOVO
      room.getPlayersArray().forEach((player) => {
        io.to(player.id).emit("player-position-updated", {
          playerData: player,
          allPlayers: room.getPlayersArray(),
        });
      });

      // Se há um vencedor, terminar o jogo
      if (winner) {
        io.to(roomId).emit("game-ended", { winner: winner });
        console.log(
          `Jogo terminou na sala ${roomId}. Vencedor: ${winner.name}`
        );
      }

      // Resetar para próxima carta
      room.currentCard = null;
      room.playerDecisions = {};
      room.waitingForVotes = false;

      // Notificar anfitrião para puxar a próxima carta
      io.to(room.hostSocketId).emit("ready-for-next-card", {
        nextCardType: room.getNextCardType(),
      });

      console.log(
        `Todos os votos processados na sala ${roomId}. Pronto para próxima carta.`
      );
    }
  });

  // Lidar com desconexão
  socket.on("disconnect", () => {
    const roomId = gameRooms.get(socket.id);
    if (roomId) {
      const room = gameRooms.get(roomId);
      if (room) {
        if (room.hostSocketId === socket.id) {
          // Anfitrião desconectou, terminar jogo
          io.to(roomId).emit("host-disconnected");
          gameRooms.delete(roomId);
          console.log(`Anfitrião desconectou, sala ${roomId} fechada`);
        } else {
          // Jogador desconectou
          const player = room.players.get(socket.id);
          if (player) {
            if (room.gameStarted) {
              // Game is active, move to disconnected players for potential reconnection
              player.isConnected = false;
              player.originalId = player.id; // Store original ID
              room.disconnectedPlayers.set(player.originalId, player);
              room.players.delete(socket.id);

              console.log(
                `Jogador ${player.name} desconectou da sala ${roomId} (pode reconectar)`
              );
            } else {
              // Game hasn't started, remove completely
              room.removePlayer(socket.id);
              console.log(`Jogador ${socket.id} desconectou da sala ${roomId}`);
            }

            io.to(roomId).emit("room-updated", {
              players: room.getPlayersArray(),
              availableIdentities: room.getAvailableIdentities(),
              availablePawns: room.getAvailablePawnIds(),
            });
          }
        }
      }
      gameRooms.delete(socket.id);
    }
  });

  // Obter identidades disponíveis para uma sala
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
  console.log(`✅ Servidor funcionando!`);
  console.log(`👉 Interface do anfitrião: http://localhost:${PORT}/host`);
  console.log(`👉 Interface do jogador: http://localhost:${PORT}/player`);
  console.log(`🌐 Acesso pelo celular: http://${localIp}:${PORT}/player`);
});
