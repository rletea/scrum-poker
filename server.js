const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route to explicitly serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory store for rooms
// Structure:
// rooms[roomCode] = {
//   code: string,
//   ticketName: string,
//   ticketDesc: string,
//   deckType: 'fibonacci' | 'tshirt',
//   revealed: boolean,
//   players: {
//     [userId]: { id: string, name: string, role: 'estimator' | 'spectator', vote: string | null }
//   }
// }
const rooms = {};

// Helper to broadcast room state to all clients in that room
function broadcastRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const message = JSON.stringify({
    type: 'state',
    data: room
  });

  // Iterate over connected clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.roomCode === roomCode) {
      client.send(message);
    }
  });
}

// Helper to generate a random 4-letter room code
function generateRoomCode() {
  let code = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness
  if (rooms[code]) return generateRoomCode();
  return code;
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Track room and user details on the WebSocket connection object itself
  ws.roomCode = null;
  ws.userId = null;

  ws.on('message', (messageStr) => {
    try {
      const message = JSON.parse(messageStr);
      console.log('Received message:', message.type, 'from room:', ws.roomCode);

      switch (message.type) {
        case 'join': {
          let { roomCode, userName, role, deckType } = message.data;
          userName = userName ? userName.trim() : 'Anonymous';
          role = role || 'estimator';
          deckType = deckType || 'fibonacci';

          if (!roomCode) {
            // Creating a new room
            roomCode = generateRoomCode();
            rooms[roomCode] = {
              code: roomCode,
              ticketName: 'Story Title',
              ticketDesc: 'Story description goes here. Double click to edit.',
              deckType: deckType,
              revealed: false,
              players: {}
            };
            console.log(`Created room: ${roomCode}`);
          } else {
            roomCode = roomCode.toUpperCase().trim();
            if (!rooms[roomCode]) {
              // Room doesn't exist, tell the client
              ws.send(JSON.stringify({ type: 'error', message: `Room ${roomCode} does not exist.` }));
              return;
            }
          }

          // Assign a unique user ID to this connection
          const userId = ws.userId || Math.random().toString(36).substring(2, 9);
          ws.userId = userId;
          ws.roomCode = roomCode;

          // Add player to the room state
          rooms[roomCode].players[userId] = {
            id: userId,
            name: userName,
            role: role,
            vote: null
          };

          console.log(`User ${userName} (${role}) joined room ${roomCode}`);
          ws.send(JSON.stringify({ type: 'welcome', data: { userId, roomCode } }));
          broadcastRoomState(roomCode);
          break;
        }

        case 'vote': {
          const { vote } = message.data;
          const { roomCode, userId } = ws;
          if (roomCode && rooms[roomCode] && rooms[roomCode].players[userId]) {
            rooms[roomCode].players[userId].vote = vote;
            console.log(`User ${rooms[roomCode].players[userId].name} voted: ${vote} in room ${roomCode}`);
            broadcastRoomState(roomCode);
          }
          break;
        }

        case 'reveal': {
          const { roomCode } = ws;
          if (roomCode && rooms[roomCode]) {
            rooms[roomCode].revealed = true;
            console.log(`Votes revealed in room ${roomCode}`);
            broadcastRoomState(roomCode);
          }
          break;
        }

        case 'reset': {
          const { roomCode } = ws;
          if (roomCode && rooms[roomCode]) {
            rooms[roomCode].revealed = false;
            // Clear votes for all estimators (spectators don't vote anyway)
            Object.keys(rooms[roomCode].players).forEach((pId) => {
              rooms[roomCode].players[pId].vote = null;
            });
            console.log(`Round reset in room ${roomCode}`);
            broadcastRoomState(roomCode);
          }
          break;
        }

        case 'updateTicket': {
          const { ticketName, ticketDesc } = message.data;
          const { roomCode } = ws;
          if (roomCode && rooms[roomCode]) {
            rooms[roomCode].ticketName = ticketName;
            rooms[roomCode].ticketDesc = ticketDesc;
            console.log(`Ticket updated in room ${roomCode}: ${ticketName}`);
            broadcastRoomState(roomCode);
          }
          break;
        }

        case 'changeDeck': {
          const { deckType } = message.data;
          const { roomCode } = ws;
          if (roomCode && rooms[roomCode]) {
            rooms[roomCode].deckType = deckType;
            // Clear votes when switching decks to keep state consistent
            Object.keys(rooms[roomCode].players).forEach((pId) => {
              rooms[roomCode].players[pId].vote = null;
            });
            rooms[roomCode].revealed = false;
            console.log(`Deck type changed to ${deckType} in room ${roomCode}`);
            broadcastRoomState(roomCode);
          }
          break;
        }



        case 'leave': {
          handleDisconnect(ws);
          break;
        }

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client connection closed');
    handleDisconnect(ws);
  });
});

function handleDisconnect(ws) {
  const { roomCode, userId } = ws;
  
  // Clear room variables from socket first to prevent the client from receiving the exit broadcast
  ws.roomCode = null;
  ws.userId = null;

  if (roomCode && rooms[roomCode]) {
    const player = rooms[roomCode].players[userId];
    if (player) {
      delete rooms[roomCode].players[userId];
      console.log(`User ${player.name} left room ${roomCode}`);
      // If room is completely empty, delete it
      if (Object.keys(rooms[roomCode].players).length === 0) {
        delete rooms[roomCode];
        console.log(`Deleted empty room ${roomCode}`);
      } else {
        broadcastRoomState(roomCode);
      }
    }
  }
}

// Start HTTP and WebSocket server together
server.listen(PORT, () => {
  console.log(`Scrum Poker Server listening on port ${PORT}`);
});