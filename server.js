const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// rooms: Map<roomCode, RoomState>
const rooms = new Map();

const COLORS = ['blue', 'yellow', 'green', 'red', 'teal'];
const GRID_ROWS = 9;
const GRID_COLS = 6;

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(maxPlayers) {
  let code;
  do { code = generateRoomCode(); } while (rooms.has(code));

  const room = {
    code,
    maxPlayers,
    players: [],       // { id, ws, name, color, alive }
    gameState: null,
    started: false,
    host: null,
  };
  rooms.set(code, room);
  return room;
}

function broadcast(room, msg, excludeId = null) {
  const data = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.id !== excludeId && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(data);
    }
  });
}

function sendTo(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function getCriticalMass(row, col) {
  const corner = (row === 0 || row === GRID_ROWS - 1) && (col === 0 || col === GRID_COLS - 1);
  const edge = row === 0 || row === GRID_ROWS - 1 || col === 0 || col === GRID_COLS - 1;
  if (corner) return 2;
  if (edge) return 3;
  return 4;
}

function getNeighbors(row, col) {
  const n = [];
  if (row > 0) n.push([row - 1, col]);
  if (row < GRID_ROWS - 1) n.push([row + 1, col]);
  if (col > 0) n.push([row, col - 1]);
  if (col < GRID_COLS - 1) n.push([row, col + 1]);
  return n;
}

function initGameState(players) {
  const grid = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    grid.push([]);
    for (let c = 0; c < GRID_COLS; c++) {
      grid[r].push({ owner: null, orbs: 0 });
    }
  }
  return {
    grid,
    currentTurn: 0,  // index into players array
    turnCount: 0,
    players: players.map((p, i) => ({ id: p.id, name: p.name, color: p.color, alive: true, index: i })),
    winner: null,
    explosionQueue: [],
  };
}

async function processExplosions(grid, alivePlayers) {
  const explosions = [];
  let exploded = true;
  let iterations = 0;
  const maxIterations = GRID_ROWS * GRID_COLS * 10;

  while (exploded && iterations < maxIterations) {
    exploded = false;
    iterations++;
    const toExplode = [];

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = grid[r][c];
        if (cell.orbs >= getCriticalMass(r, c)) {
          toExplode.push([r, c]);
        }
      }
    }

    if (toExplode.length === 0) break;

    for (const [r, c] of toExplode) {
      const cell = grid[r][c];
      const mass = getCriticalMass(r, c);
      const owner = cell.owner;
      cell.orbs -= mass;
      if (cell.orbs <= 0) { cell.orbs = 0; cell.owner = null; }
      const neighbors = getNeighbors(r, c);
      for (const [nr, nc] of neighbors) {
        grid[nr][nc].orbs++;
        grid[nr][nc].owner = owner;
      }
      explosions.push({ r, c, owner });
      exploded = true;
    }
  }

  return explosions;
}

function checkWinner(gameState) {
  if (gameState.turnCount < gameState.players.length) return null;

  const ownersOnBoard = new Set();
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (gameState.grid[r][c].owner !== null) {
        ownersOnBoard.add(gameState.grid[r][c].owner);
      }
    }
  }

  // Mark dead players
  gameState.players.forEach(p => {
    if (p.alive && gameState.turnCount >= gameState.players.length && !ownersOnBoard.has(p.id)) {
      p.alive = false;
    }
  });

  const alive = gameState.players.filter(p => p.alive);
  if (alive.length === 1) return alive[0];
  return null;
}

function nextTurn(gameState) {
  const total = gameState.players.length;
  let next = (gameState.currentTurn + 1) % total;
  let tries = 0;
  while (!gameState.players[next].alive && tries < total) {
    next = (next + 1) % total;
    tries++;
  }
  gameState.currentTurn = next;
  gameState.turnCount++;
}

function broadcastGameState(room) {
  const gs = room.gameState;
  broadcast(room, {
    type: 'game_state',
    grid: gs.grid,
    currentTurn: gs.currentTurn,
    players: gs.players,
    winner: gs.winner,
  });
}

async function handleMove(room, playerId, row, col) {
  const gs = room.gameState;
  if (!gs || gs.winner) return;

  const currentPlayer = gs.players[gs.currentTurn];
  if (currentPlayer.id !== playerId) return;

  const cell = gs.grid[row][col];
  if (cell.owner !== null && cell.owner !== playerId) return;

  // Place orb
  cell.orbs++;
  cell.owner = playerId;

  // Process chain explosions
  const explosions = await processExplosions(gs.grid, gs.players.filter(p => p.alive));

  // Check winner
  const winner = checkWinner(gs);
  if (winner) {
    gs.winner = winner;
    broadcast(room, {
      type: 'game_over',
      winner: { id: winner.id, name: winner.name, color: winner.color },
      grid: gs.grid,
      players: gs.players,
    });
    return;
  }

  nextTurn(gs);
  broadcastGameState(room);
}

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  let currentRoom = null;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'create_room': {
        const maxPlayers = Math.min(5, Math.max(2, parseInt(msg.maxPlayers) || 2));
        const room = createRoom(maxPlayers);
        const player = { id: clientId, ws, name: msg.name || 'Player 1', color: COLORS[0], alive: true };
        room.players.push(player);
        room.host = clientId;
        currentRoom = room;
        sendTo(ws, {
          type: 'room_created',
          roomCode: room.code,
          playerId: clientId,
          color: COLORS[0],
          maxPlayers,
          players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
        });
        break;
      }

      case 'join_room': {
        const room = rooms.get(msg.roomCode?.toUpperCase());
        if (!room) { sendTo(ws, { type: 'error', message: 'Room not found.' }); return; }
        if (room.started) { sendTo(ws, { type: 'error', message: 'Game already started.' }); return; }
        if (room.players.length >= room.maxPlayers) { sendTo(ws, { type: 'error', message: 'Room is full.' }); return; }

        const colorIndex = room.players.length;
        const player = { id: clientId, ws, name: msg.name || `Player ${colorIndex + 1}`, color: COLORS[colorIndex], alive: true };
        room.players.push(player);
        currentRoom = room;

        sendTo(ws, {
          type: 'room_joined',
          roomCode: room.code,
          playerId: clientId,
          color: COLORS[colorIndex],
          maxPlayers: room.maxPlayers,
          players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
        });

        broadcast(room, {
          type: 'player_joined',
          players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
        }, clientId);
        break;
      }

      case 'start_game': {
        if (!currentRoom) return;
        if (currentRoom.host !== clientId) { sendTo(ws, { type: 'error', message: 'Only the host can start.' }); return; }
        if (currentRoom.players.length < 2) { sendTo(ws, { type: 'error', message: 'Need at least 2 players.' }); return; }
        if (currentRoom.started) return;

        currentRoom.started = true;
        currentRoom.gameState = initGameState(currentRoom.players);

        broadcast(currentRoom, {
          type: 'game_started',
          grid: currentRoom.gameState.grid,
          currentTurn: 0,
          players: currentRoom.gameState.players,
        });
        break;
      }

      case 'make_move': {
        if (!currentRoom || !currentRoom.gameState) return;
        await handleMove(currentRoom, clientId, msg.row, msg.col);
        break;
      }

      case 'restart_game': {
        if (!currentRoom || currentRoom.host !== clientId) return;
        currentRoom.started = true;
        currentRoom.gameState = initGameState(currentRoom.players);
        broadcast(currentRoom, {
          type: 'game_started',
          grid: currentRoom.gameState.grid,
          currentTurn: 0,
          players: currentRoom.gameState.players,
        });
        break;
      }

      case 'ping': {
        sendTo(ws, { type: 'pong' });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    const idx = currentRoom.players.findIndex(p => p.id === clientId);
    if (idx !== -1) currentRoom.players.splice(idx, 1);

    if (currentRoom.players.length === 0) {
      rooms.delete(currentRoom.code);
      return;
    }

    // Reassign host
    if (currentRoom.host === clientId && currentRoom.players.length > 0) {
      currentRoom.host = currentRoom.players[0].id;
      broadcast(currentRoom, { type: 'new_host', hostId: currentRoom.host });
    }

    broadcast(currentRoom, {
      type: 'player_left',
      playerId: clientId,
      players: currentRoom.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
    });

    // If game is in progress and only 1 alive player left, they win
    if (currentRoom.gameState && !currentRoom.gameState.winner) {
      if (currentRoom.gameState) {
        const gsp = currentRoom.gameState.players.find(p => p.id === clientId);
        if (gsp) gsp.alive = false;
        const alive = currentRoom.gameState.players.filter(p => p.alive);
        if (alive.length === 1) {
          currentRoom.gameState.winner = alive[0];
          broadcast(currentRoom, {
            type: 'game_over',
            winner: { id: alive[0].id, name: alive[0].name, color: alive[0].color },
            grid: currentRoom.gameState.grid,
            players: currentRoom.gameState.players,
          });
        }
      }
    }
  });

  ws.on('error', () => {});
});

console.log(`Chain Reaction server running on ws://localhost:${PORT}`);
console.log(`Share your server's public address with players.`);
