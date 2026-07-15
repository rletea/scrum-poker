const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

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

const logFilePath = path.join(__dirname, 'login_history.txt');
const credentialsFilePath = path.join(__dirname, 'credentials.json');

let initialCredentials = {
  "Ankor": "Scrum#0726@Poker",
  "Merlin": "Merlin#0726@Poker"
};
if (fs.existsSync(credentialsFilePath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(credentialsFilePath, 'utf8'));
    initialCredentials = { ...initialCredentials, ...existing };
  } catch (e) {
    console.error('Failed to parse existing credentials:', e);
  }
}
fs.writeFileSync(credentialsFilePath, JSON.stringify(initialCredentials, null, 2), 'utf8');
console.log('Synchronized credentials.json database.');

function logActivity(userName, action, roomCode) {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC';
  const logLine = `[${timestamp}] User: ${userName} | Action: ${action} | Room: ${roomCode || 'N/A'}\n`;
  fs.appendFile(logFilePath, logLine, (err) => {
    if (err) console.error('Failed to write activity log:', err);
  });
}

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
//   },
//   lastActivity: number
// }
const rooms = {
  'MTCS': {
    code: 'MTCS',
    ticketName: 'Story Title',
    ticketDesc: 'Story description goes here. Double click to edit.',
    deckType: 'fibonacci',
    revealed: false,
    players: {},
    lastActivity: Date.now()
  },
  'MTPS': {
    code: 'MTPS',
    ticketName: 'Story Title',
    ticketDesc: 'Story description goes here. Double click to edit.',
    deckType: 'fibonacci',
    revealed: false,
    players: {},
    lastActivity: Date.now()
  },
  'PRDS': {
    code: 'PRDS',
    ticketName: 'Story Title',
    ticketDesc: 'Story description goes here. Double click to edit.',
    deckType: 'fibonacci',
    revealed: false,
    players: {},
    lastActivity: Date.now()
  }
};

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
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
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
              players: {},
              lastActivity: Date.now()
            };
            console.log(`Created room: ${roomCode}`);
            logActivity('System', 'Created new room', roomCode);
          } else {
            roomCode = roomCode.toUpperCase().trim();
            if (!rooms[roomCode]) {
              // Room doesn't exist, tell the client
              ws.send(JSON.stringify({ type: 'error', message: `Room ${roomCode} does not exist.` }));
              return;
            }
          }

          // Check if userName already exists in the room players and has an active socket
          const existingPlayer = Object.values(rooms[roomCode].players).find(
            p => p.name.toLowerCase() === userName.toLowerCase()
          );
          if (existingPlayer) {
            let isSocketActive = false;
            wss.clients.forEach(client => {
              if (client !== ws && client.roomCode === roomCode && client.userId === existingPlayer.id && client.readyState === WebSocket.OPEN) {
                isSocketActive = true;
              }
            });
            if (isSocketActive) {
              ws.send(JSON.stringify({ type: 'error', message: `Username "${userName}" is already taken in this room.` }));
              return;
            } else {
              // The old socket is inactive, remove the player so they can rejoin with the new socket
              delete rooms[roomCode].players[existingPlayer.id];
              console.log(`Replaced inactive duplicate player "${userName}" in room ${roomCode}`);
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

          rooms[roomCode].lastActivity = Date.now();
          console.log(`User ${userName} (${role}) joined room ${roomCode}`);
          logActivity(userName, `Joined room (Role: ${role})`, roomCode);
          ws.send(JSON.stringify({ type: 'welcome', data: { userId, roomCode } }));
          broadcastRoomState(roomCode);
          break;
        }

        case 'vote': {
          const { vote } = message.data;
          const { roomCode, userId } = ws;
          if (roomCode && rooms[roomCode] && rooms[roomCode].players[userId]) {
            rooms[roomCode].players[userId].vote = vote;
            rooms[roomCode].lastActivity = Date.now();
            console.log(`User ${rooms[roomCode].players[userId].name} voted: ${vote} in room ${roomCode}`);
            broadcastRoomState(roomCode);
          }
          break;
        }

        case 'reveal': {
          const { roomCode } = ws;
          if (roomCode && rooms[roomCode]) {
            rooms[roomCode].revealed = true;
            rooms[roomCode].lastActivity = Date.now();
            console.log(`Votes revealed in room ${roomCode}`);
            logActivity('System', 'Revealed cards', roomCode);
            broadcastRoomState(roomCode);
          }
          break;
        }

        case 'reset': {
          const { roomCode } = ws;
          if (roomCode && rooms[roomCode]) {
            rooms[roomCode].revealed = false;
            rooms[roomCode].ticketName = 'Story Title';
            rooms[roomCode].ticketDesc = 'Story description goes here. Double click to edit.';
            rooms[roomCode].lastActivity = Date.now();
            // Clear votes for all estimators (spectators don't vote anyway)
            Object.keys(rooms[roomCode].players).forEach((pId) => {
              rooms[roomCode].players[pId].vote = null;
            });
            console.log(`Round reset in room ${roomCode}`);
            logActivity('System', 'Cleared cards/reset round', roomCode);
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
            rooms[roomCode].lastActivity = Date.now();
            console.log(`Ticket updated in room ${roomCode}: ${ticketName}`);
            logActivity('System', `Updated ticket title to "${ticketName}"`, roomCode);
            broadcastRoomState(roomCode);
          }
          break;
        }

        case 'changeDeck': {
          const { deckType } = message.data;
          const { roomCode } = ws;
          if (roomCode && rooms[roomCode]) {
            rooms[roomCode].deckType = deckType;
            rooms[roomCode].lastActivity = Date.now();
            // Clear votes when switching decks to keep state consistent
            Object.keys(rooms[roomCode].players).forEach((pId) => {
              rooms[roomCode].players[pId].vote = null;
            });
            rooms[roomCode].revealed = false;
            console.log(`Deck type changed to ${deckType} in room ${roomCode}`);
            logActivity('System', `Changed deck type to ${deckType}`, roomCode);
            broadcastRoomState(roomCode);
          }
          break;
        }

        case 'login': {
          const { user, pass } = message.data;
          const trimmedUser = user ? user.trim() : '';
          
          if (!trimmedUser) {
            ws.send(JSON.stringify({ type: 'loginResult', success: false, message: 'Username cannot be empty.' }));
            break;
          }
          if (!pass) {
            ws.send(JSON.stringify({ type: 'loginResult', success: false, message: 'Password cannot be empty.' }));
            break;
          }

          fs.readFile(credentialsFilePath, 'utf8', (err, data) => {
            let credentials = { "Ankor": "Scrum#0726@Poker" };
            if (!err) {
              try {
                credentials = JSON.parse(data);
              } catch (e) {
                console.error('Failed to parse credentials:', e);
              }
            }

            if (credentials[trimmedUser] === undefined) {
              ws.send(JSON.stringify({ type: 'loginResult', success: false, message: 'Username does not exist. Please register first.' }));
              logActivity(trimmedUser, 'Failed Login Attempt (User Not Registered)', null);
            } else {
              // Existing user check
              if (credentials[trimmedUser] === pass) {
                ws.send(JSON.stringify({ type: 'loginResult', success: true, userName: trimmedUser }));
                logActivity(trimmedUser, 'Dealer Logged In', null);
              } else {
                ws.send(JSON.stringify({ type: 'loginResult', success: false, message: 'Incorrect password for this user.' }));
                logActivity(trimmedUser, 'Failed Login Attempt (Wrong Password)', null);
              }
            }
          });
          break;
        }

        case 'register': {
          const { user, pass } = message.data;
          const trimmedUser = user ? user.trim() : '';
          
          if (!trimmedUser) {
            ws.send(JSON.stringify({ type: 'registerResult', success: false, message: 'Username cannot be empty.' }));
            break;
          }
          if (trimmedUser.toLowerCase() === 'ankor') {
            ws.send(JSON.stringify({ type: 'registerResult', success: false, message: 'Username "Ankor" is reserved.' }));
            break;
          }
          if (!pass) {
            ws.send(JSON.stringify({ type: 'registerResult', success: false, message: 'Password cannot be empty.' }));
            break;
          }

          fs.readFile(credentialsFilePath, 'utf8', (err, data) => {
            let credentials = { "Ankor": "Scrum#0726@Poker" };
            if (!err) {
              try {
                credentials = JSON.parse(data);
              } catch (e) {
                console.error('Failed to parse credentials:', e);
              }
            }

            if (credentials[trimmedUser] !== undefined) {
              ws.send(JSON.stringify({ type: 'registerResult', success: false, message: 'Username is already taken.' }));
            } else {
              credentials[trimmedUser] = pass;
              fs.writeFile(credentialsFilePath, JSON.stringify(credentials, null, 2), 'utf8', (writeErr) => {
                if (writeErr) {
                  console.error('Failed to write credentials file:', writeErr);
                  ws.send(JSON.stringify({ type: 'registerResult', success: false, message: 'Server database error.' }));
                } else {
                  logActivity(trimmedUser, 'New User Registered', null);
                  // Auto log in!
                  ws.send(JSON.stringify({ type: 'loginResult', success: true, userName: trimmedUser }));
                  logActivity(trimmedUser, 'Dealer Logged In (Auto-Login)', null);
                }
              });
            }
          });
          break;
        }

        case 'changePassword': {
          const { user, oldPass, newPass } = message.data;
          const trimmedUser = user ? user.trim() : '';
          
          if (trimmedUser === 'Ankor') {
            ws.send(JSON.stringify({ type: 'changePasswordResult', success: false, message: 'Admin password cannot be changed.' }));
            break;
          }
          if (!trimmedUser || !oldPass || !newPass) {
            ws.send(JSON.stringify({ type: 'changePasswordResult', success: false, message: 'Invalid arguments.' }));
            break;
          }

          fs.readFile(credentialsFilePath, 'utf8', (err, data) => {
            let credentials = {};
            if (!err) {
              try {
                credentials = JSON.parse(data);
              } catch (e) {
                console.error('Failed to parse credentials:', e);
              }
            }

            if (credentials[trimmedUser] === undefined) {
              ws.send(JSON.stringify({ type: 'changePasswordResult', success: false, message: 'User does not exist.' }));
            } else if (credentials[trimmedUser] !== oldPass) {
              ws.send(JSON.stringify({ type: 'changePasswordResult', success: false, message: 'Current password does not match.' }));
            } else {
              credentials[trimmedUser] = newPass;
              fs.writeFile(credentialsFilePath, JSON.stringify(credentials, null, 2), 'utf8', (writeErr) => {
                if (writeErr) {
                  console.error('Failed to write credentials file:', writeErr);
                  ws.send(JSON.stringify({ type: 'changePasswordResult', success: false, message: 'Server database error.' }));
                } else {
                  ws.send(JSON.stringify({ type: 'changePasswordResult', success: true }));
                  logActivity(trimmedUser, 'Changed Password', null);
                }
              });
            }
          });
          break;
        }

        case 'getLogs': {
          fs.readFile(credentialsFilePath, 'utf8', (credErr, credData) => {
            let users = ['Ankor', 'Merlin'];
            if (!credErr) {
              try {
                users = Object.keys(JSON.parse(credData));
              } catch (e) {}
            }
            fs.readFile(logFilePath, 'utf8', (err, data) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'logs', data: 'No activity logs found.', users }));
              } else {
                ws.send(JSON.stringify({ type: 'logs', data: data, users }));
              }
            });
          });
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
      logActivity(player.name, 'Left room', roomCode);
      
      // If room is completely empty, delete it (unless it is a reserved room)
      const reservedRooms = ['MTCS', 'MTPS', 'PRDS'];
      if (Object.keys(rooms[roomCode].players).length === 0) {
        if (reservedRooms.includes(roomCode)) {
          rooms[roomCode].revealed = false;
          rooms[roomCode].ticketName = 'Story Title';
          rooms[roomCode].ticketDesc = 'Story description goes here. Double click to edit.';
          rooms[roomCode].lastActivity = Date.now();
          console.log(`Reset empty reserved room ${roomCode}`);
        } else {
          delete rooms[roomCode];
          console.log(`Deleted empty room ${roomCode}`);
        }
      } else {
        rooms[roomCode].lastActivity = Date.now();
        broadcastRoomState(roomCode);
      }
    }
  }
}

// Keep-Alive Ping-Pong interval to clean up dead WebSocket connections
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`Terminating inactive client socket: ${ws.userId || 'unknown'}`);
      ws.terminate();
      handleDisconnect(ws);
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

// Inactivity timer check (runs every 1 minute)
const INACTIVITY_TIMEOUT = 1.5 * 60 * 60 * 1000; // 1.5 hours in ms
const inactivityInterval = setInterval(() => {
  const now = Date.now();
  Object.keys(rooms).forEach((roomCode) => {
    const room = rooms[roomCode];
    if (now - room.lastActivity > INACTIVITY_TIMEOUT) {
      console.log(`Room ${roomCode} inactive for 1.5 hours. Cleaning up.`);
      logActivity('System', 'Room closed due to inactivity', roomCode);
      
      const kickMessage = JSON.stringify({
        type: 'kicked',
        message: 'This room has been closed due to 1.5 hours of inactivity.'
      });

      wss.clients.forEach((client) => {
        if (client.roomCode === roomCode) {
          try {
            client.send(kickMessage);
          } catch (e) {
            console.error('Failed to send kick to socket:', e);
          }
          client.roomCode = null;
          client.userId = null;
        }
      });

      const reservedRooms = ['MTCS', 'MTPS', 'PRDS'];
      if (reservedRooms.includes(roomCode)) {
        rooms[roomCode].players = {};
        rooms[roomCode].revealed = false;
        rooms[roomCode].ticketName = 'Story Title';
        rooms[roomCode].ticketDesc = 'Story description goes here. Double click to edit.';
        rooms[roomCode].lastActivity = now;
        console.log(`Reserved room ${roomCode} reset due to inactivity.`);
      } else {
        delete rooms[roomCode];
        console.log(`Deleted inactive room ${roomCode}`);
      }
    }
  });
}, 60000);

wss.on('close', () => {
  clearInterval(pingInterval);
  clearInterval(inactivityInterval);
});

// Start HTTP and WebSocket server together
server.listen(PORT, () => {
  console.log(`Scrum Poker Server listening on port ${PORT}`);
});