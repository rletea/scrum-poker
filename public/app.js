// --------------------------------------------------------------------------
// APPLICATION STATE
// --------------------------------------------------------------------------
if (!window.name || !window.name.startsWith('tab_')) {
  window.name = 'tab_' + Math.random().toString(36).substring(2, 9);
}
let localUserId = window.name;
let localRoomCode = null;
let localName = '';
let localRole = 'estimator'; // 'estimator' | 'spectator'
let roomState = null;
let socket = null;
let reconnectTimer = null;
let isWebSocketConnected = false;
let hasConnectedOnce = false;

// Browser-native BroadcastChannel for serverless multi-tab offline sync
const bc = new BroadcastChannel('scrum_poker_sync');

// Card Deck Configurations
const DECKS = {
  fibonacci: ['0', '1', '2', '3', '5', '8', '13', '?', '☕'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕']
};

// Numeric mapping for T-Shirt sizes to calculate average/median
const TSHIRT_VALUES = {
  'XS': 1,
  'S': 2,
  'M': 3,
  'L': 5,
  'XL': 8,
  'XXL': 13
};
const TSHIRT_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// --------------------------------------------------------------------------
// DOM ELEMENTS
// --------------------------------------------------------------------------
// Screens
const screenLogin = document.getElementById('screen-login');
const screenLanding = document.getElementById('screen-landing');
const screenGame = document.getElementById('screen-game');

// Login Elements
const formLogin = document.getElementById('form-login');
const loginUserField = document.getElementById('login-user');
const loginPassField = document.getElementById('login-pass');

// Registration Elements
const formRegister = document.getElementById('form-register');
const registerUserField = document.getElementById('register-user');
const registerPassField = document.getElementById('register-pass');
const registerPassConfirmField = document.getElementById('register-pass-confirm');

const tabLoginToggle = document.getElementById('tab-login-toggle');
const tabRegisterToggle = document.getElementById('tab-register-toggle');
const loginFormContainer = document.getElementById('login-form-container');
const registerFormContainer = document.getElementById('register-form-container');

// Logs & Password Elements
const userProfileBar = document.getElementById('user-profile-bar');
const dealerLogsLinkContainer = document.getElementById('dealer-logs-link-container');
const loggedInUsername = document.getElementById('logged-in-username');
const btnOpenChangePw = document.getElementById('btn-open-change-pw');
const changePwModal = document.getElementById('change-pw-modal');
const btnCloseChangePw = document.getElementById('btn-close-change-pw');
const formChangePassword = document.getElementById('form-change-password');
const changeOldPass = document.getElementById('change-old-pass');
const changeNewPass = document.getElementById('change-new-pass');

// Forms & Inputs
const tabCreate = document.getElementById('tab-create');
const tabJoin = document.getElementById('tab-join');
const formCreate = document.getElementById('form-create-room');
const formJoin = document.getElementById('form-join-room');
const createNameInput = document.getElementById('create-name');
const joinNameInput = document.getElementById('join-name');
const joinCodeInput = document.getElementById('join-code');
const createDeckSelect = document.getElementById('create-deck');
const btnSubmitCreate = document.getElementById('btn-submit-create');

// Game UI
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const displayRoomCode = document.getElementById('display-room-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnLeave = document.getElementById('btn-leave');

// Ticket / User Story
const ticketDisplay = document.getElementById('ticket-display');
const ticketEditor = document.getElementById('ticket-editor');
const ticketTitleDisplay = document.getElementById('ticket-title-display');
const ticketDescDisplay = document.getElementById('ticket-desc-display');
const ticketTitleInput = document.getElementById('ticket-title-input');
const ticketDescInput = document.getElementById('ticket-desc-input');
const ticketEditBtn = document.getElementById('ticket-edit-btn');
const btnSaveTicket = document.getElementById('btn-save-ticket');
const btnCancelTicket = document.getElementById('btn-cancel-ticket');

// Cards & Deck Settings
const cardsGrid = document.getElementById('cards-grid');
const deckSelectDropdown = document.getElementById('deck-select-dropdown');
const spectatorMsg = document.getElementById('spectator-msg');

// Sidebar
const participantsList = document.getElementById('participants-list');
const participantCount = document.getElementById('participant-count');
// Simulator elements removed

// Results & Statistics
const resultsPanel = document.getElementById('results-panel');
const consensusStatus = document.getElementById('consensus-status');
const statAvg = document.getElementById('stat-avg');
const statMedian = document.getElementById('stat-median');
const statSpread = document.getElementById('stat-spread');
const chartBars = document.getElementById('chart-bars');
const consensusHint = document.getElementById('consensus-hint');

// Moderator Controls
const btnReveal = document.getElementById('btn-reveal');
const btnReset = document.getElementById('btn-reset');
const toastEl = document.getElementById('toast');

// --------------------------------------------------------------------------
// EVENT LISTENERS & SETUP
// --------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  setupLoginHandler();
  setupLandingTabs();
  setupFormSubmissions();
  setupGameControls();
  checkAuthAndHash();
  setupBroadcastChannel();
  connectWebSocket();
  updateCreateButtonState();
  setupBroadcastHeartbeat();
  setupUnloadHandlers();
  
  // Change Password Modal triggers
  if (btnOpenChangePw && changePwModal) {
    btnOpenChangePw.addEventListener('click', () => {
      const currentUser = sessionStorage.getItem('userName') || 'Dealer';
      if (currentUser === 'Ankor') {
        showToast('⚠️ Admin password cannot be changed.');
        return;
      }
      changePwModal.classList.remove('hidden');
    });
  }
  
  if (btnCloseChangePw && changePwModal) {
    btnCloseChangePw.addEventListener('click', () => {
      changePwModal.classList.add('hidden');
    });
  }

  if (formChangePassword) {
    formChangePassword.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = sessionStorage.getItem('userName') || 'Dealer';
      const oldPass = changeOldPass.value;
      const newPass = changeNewPass.value;

      sendMsg('changePassword', { user, oldPass, newPass });
      
      // Clear inputs and close
      changeOldPass.value = '';
      changeNewPass.value = '';
      changePwModal.classList.add('hidden');
    });
  }

  // Handle Logs link open via JavaScript to clone sessionStorage to new tab
  const logsLink = dealerLogsLinkContainer ? dealerLogsLinkContainer.querySelector('a') : null;
  if (logsLink) {
    logsLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.open('/logs.html', '_blank');
    });
  }
});

// Setup Copy Room Link functionality
btnCopyCode.addEventListener('click', () => {
  if (!localRoomCode) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}#${localRoomCode}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('📋 Room invite link copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
});

// --------------------------------------------------------------------------
// LANDING SCREEN CONTROLS
// --------------------------------------------------------------------------
function setupLandingTabs() {
  tabCreate.addEventListener('click', () => {
    tabCreate.classList.add('active');
    tabJoin.classList.remove('active');
    formCreate.classList.remove('hidden');
    formJoin.classList.add('hidden');
  });

  tabJoin.addEventListener('click', () => {
    tabJoin.classList.add('active');
    tabCreate.classList.remove('active');
    formJoin.classList.remove('hidden');
    formCreate.classList.add('hidden');
  });

  // Sync name inputs so they don't clear on tab change
  createNameInput.addEventListener('input', (e) => {
    joinNameInput.value = e.target.value;
  });
  joinNameInput.addEventListener('input', (e) => {
    createNameInput.value = e.target.value;
  });

  // Watch room code input to disable/enable Create Room button
  joinCodeInput.addEventListener('input', () => {
    updateCreateButtonState();
  });
}

function updateCreateButtonState() {
  if (!btnSubmitCreate) return;
  const code = joinCodeInput.value.trim();
  const hash = window.location.hash.replace('#', '').trim();
  
  if (hash.length === 4) {
    // Joining via shared invite link
    btnSubmitCreate.disabled = true;
    btnSubmitCreate.title = 'Create Room is disabled when joining via an invite link.';
    if (tabCreate) {
      tabCreate.disabled = true;
      tabCreate.style.opacity = '0.5';
      tabCreate.style.pointerEvents = 'none';
      tabCreate.title = 'Create Room is disabled when joining via an invite link.';
    }
  } else if (code !== '') {
    btnSubmitCreate.disabled = true;
    btnSubmitCreate.title = 'Cannot create a new room while a Room Code is entered. Clear the room code in the Join tab to create a room.';
    if (tabCreate) {
      tabCreate.disabled = true;
      tabCreate.style.opacity = '0.5';
      tabCreate.style.pointerEvents = 'none';
      tabCreate.title = 'Clear the Room Code input to enable creating a room.';
    }
  } else {
    btnSubmitCreate.disabled = false;
    btnSubmitCreate.title = '';
    if (tabCreate) {
      tabCreate.disabled = false;
      tabCreate.style.opacity = '1';
      tabCreate.style.pointerEvents = 'auto';
      tabCreate.title = '';
    }
  }
}

function setupFormSubmissions() {
  // Create Room Form
  formCreate.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = createNameInput.value.trim();
    const deckType = createDeckSelect.value;
    const role = document.querySelector('input[name="create-role"]:checked').value;
    
    sessionStorage.setItem('userName', name);
    sessionStorage.setItem('userRole', role);
    
    localName = name;
    localRole = role;
    
    joinRoom(null, name, role, deckType);
  });

  // Join Room Form
  formJoin.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = joinNameInput.value.trim();
    const code = joinCodeInput.value.trim().toUpperCase();
    const role = document.querySelector('input[name="join-role"]:checked').value;
    
    sessionStorage.setItem('userName', name);
    sessionStorage.setItem('userRole', role);
    
    localName = name;
    localRole = role;
    
    joinRoom(code, name, role, null);
  });
}

function setupLoginHandler() {
  // Toggle between Log In and Register tabs
  if (tabLoginToggle && tabRegisterToggle && loginFormContainer && registerFormContainer) {
    tabLoginToggle.addEventListener('click', () => {
      tabLoginToggle.classList.add('active');
      tabRegisterToggle.classList.remove('active');
      loginFormContainer.classList.remove('hidden');
      registerFormContainer.classList.add('hidden');
    });

    tabRegisterToggle.addEventListener('click', () => {
      tabRegisterToggle.classList.add('active');
      tabLoginToggle.classList.remove('active');
      registerFormContainer.classList.remove('hidden');
      loginFormContainer.classList.add('hidden');
    });
  }

  // Handle Login submission
  if (formLogin) {
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = loginUserField.value.trim();
      const pass = loginPassField.value;
      
      if (isWebSocketConnected && socket && socket.readyState === WebSocket.OPEN) {
        sendMsg('login', { user, pass });
      } else {
        // Offline fallback validation
        if (user === 'Ankor' && pass === 'Scrum#0726@Poker') {
          sessionStorage.setItem('isLoggedIn', 'true');
          sessionStorage.setItem('userName', user);
          showToast('🔑 Local Authentication successful!');
          
          loginUserField.value = '';
          loginPassField.value = '';
          
          screenLogin.classList.add('hidden');
          screenLanding.classList.remove('hidden');
        } else {
          showToast('❌ Invalid credentials (Local offline mode).');
        }
      }
    });
  }

  // Handle Register submission
  if (formRegister) {
    formRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = registerUserField.value.trim();
      const pass = registerPassField.value;
      const passConfirm = registerPassConfirmField.value;

      if (!user) {
        showToast('⚠️ Username cannot be empty.');
        return;
      }
      if (user.toLowerCase() === 'ankor') {
        showToast('⚠️ Username "Ankor" is reserved.');
        return;
      }
      if (pass !== passConfirm) {
        showToast('❌ Passwords do not match.');
        return;
      }

      if (isWebSocketConnected && socket && socket.readyState === WebSocket.OPEN) {
        sendMsg('register', { user, pass });
      } else {
        showToast('❌ Registration is unavailable in offline local mode.');
      }
    });
  }
}

function checkAuthAndHash() {
  const hash = window.location.hash.replace('#', '').trim();
  const savedName = sessionStorage.getItem('userName');
  const savedRole = sessionStorage.getItem('userRole') || 'estimator';
  
  if (hash.length === 4) {
    // Shared Invite link bypasses login
    console.log('Shared room link detected. Bypassing login.');
    joinCodeInput.value = hash.toUpperCase();
    tabJoin.click();
    updateCreateButtonState();
    
    if (userProfileBar) {
      userProfileBar.classList.add('hidden');
    }
    if (dealerLogsLinkContainer) {
      dealerLogsLinkContainer.classList.add('hidden');
    }
    
    if (savedName) {
      joinNameInput.value = savedName;
      createNameInput.value = savedName;
      
      const radio = document.querySelector(`input[name="join-role"][value="${savedRole}"]`);
      if (radio) radio.checked = true;
      
      // Auto rejoin!
      console.log(`Auto-rejoining room ${hash} with saved user ${savedName} (${savedRole})`);
      localName = savedName;
      localRole = savedRole;
      joinRoom(hash, savedName, savedRole, null);
    } else {
      screenLogin.classList.add('hidden');
      screenLanding.classList.remove('hidden');
      screenGame.classList.add('hidden');
    }
  } else {
    // Normal link - check login status
    const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
      const savedLoggedInUser = sessionStorage.getItem('userName');
      if (savedName) {
        joinNameInput.value = savedName;
        createNameInput.value = savedName;
        
        const radioJoin = document.querySelector(`input[name="join-role"][value="${savedRole}"]`);
        if (radioJoin) radioJoin.checked = true;
        const radioCreate = document.querySelector(`input[name="create-role"][value="${savedRole}"]`);
        if (radioCreate) radioCreate.checked = true;
      }
      screenLogin.classList.add('hidden');
      screenLanding.classList.remove('hidden');
      screenGame.classList.add('hidden');
      
      if (userProfileBar) {
        userProfileBar.classList.remove('hidden');
      }
      if (loggedInUsername && savedLoggedInUser) {
        loggedInUsername.textContent = savedLoggedInUser;
      }
      if (dealerLogsLinkContainer) {
        if (savedLoggedInUser === 'Ankor') {
          dealerLogsLinkContainer.classList.remove('hidden');
        } else {
          dealerLogsLinkContainer.classList.add('hidden');
        }
      }
    } else {
      screenLogin.classList.remove('hidden');
      screenLanding.classList.add('hidden');
      screenGame.classList.add('hidden');
      if (userProfileBar) {
        userProfileBar.classList.add('hidden');
      }
      if (dealerLogsLinkContainer) {
        dealerLogsLinkContainer.classList.add('hidden');
      }
    }
  }
}

// --------------------------------------------------------------------------
// BROADCASTCHANNEL SYNC (OFFLINE/LOCAL FALLBACK)
// --------------------------------------------------------------------------
function setupBroadcastChannel() {
  bc.onmessage = (event) => {
    // Only process if we are not connected to WebSocket (so we don't mix sources)
    if (isWebSocketConnected) return;

    const { type, roomCode, data, senderId } = event.data;
    
    if (localRoomCode && roomCode === localRoomCode) {
      console.log('Broadcast message received:', type, 'from:', senderId);
      
      switch (type) {
        case 'requestState':
          // If we have an active roomState, send it to the newly joined tab
          if (roomState) {
            bc.postMessage({
              type: 'syncState',
              roomCode: localRoomCode,
              data: roomState,
              senderId: localUserId
            });
          }
          break;

        case 'syncState':
          // Set state if we receive a valid syncState
          if (data) {
            // Ensure we are registered in the synchronized player list
            if (!data.players[localUserId]) {
              // Check if username is already taken in this room
              const nameExists = Object.values(data.players).some(
                p => p.name.toLowerCase() === localName.toLowerCase() && p.id !== localUserId
              );
              if (nameExists) {
                showToast(`❌ Username "${localName}" is already taken in this room.`);
                localRoomCode = null;
                roomState = null;
                window.location.hash = '';
                screenGame.classList.add('hidden');
                screenLanding.classList.remove('hidden');
                return;
              }

              data.players[localUserId] = {
                id: localUserId,
                name: localName,
                role: localRole,
                vote: null,
                lastSeen: Date.now()
              };
              data.timestamp = Date.now();
              roomState = data;
              broadcastLocalState();
            } else {
              roomState = data;
            }
            updateGameUI();
          }
          break;

        case 'clientStateUpdate':
          // Update state based on other client actions
          if (data) {
            roomState = data;
            // Initialize lastSeen for all active players
            Object.keys(roomState.players).forEach(pId => {
              if (pId !== localUserId && !roomState.players[pId].lastSeen) {
                roomState.players[pId].lastSeen = Date.now();
              }
            });
            updateGameUI();
          }
          break;

        case 'ping':
          if (roomState && roomState.players[senderId]) {
            roomState.players[senderId].lastSeen = Date.now();
          }
          break;

        case 'kickPlayer':
          if (data.targetPlayerId === localUserId) {
            showToast('⚠️ You have been removed from the room.');
            btnLeave.click();
          }
          break;
      }
    }
  };
}

function broadcastLocalState() {
  if (roomState && localRoomCode) {
    bc.postMessage({
      type: 'clientStateUpdate',
      roomCode: localRoomCode,
      data: roomState,
      senderId: localUserId
    });
  }
}

// --------------------------------------------------------------------------
// WEBSOCKET LOGIC & ACTIONS DISPATCHER
// --------------------------------------------------------------------------
function connectWebSocket() {
  // Graceful fallback to localhost if opening files locally
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  let host = window.location.host;
  // Bypass VPN DNS hijacks of localhost during local testing
  if (host.startsWith('localhost')) {
    host = host.replace('localhost', '127.0.0.1');
  }
  const wsUrl = window.location.protocol === 'file:' 
    ? 'ws://127.0.0.1:3000' 
    : protocol + host;

  console.log(`Connecting to WebSocket: ${wsUrl}`);
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WebSocket connection established');
    isWebSocketConnected = true;
    hasConnectedOnce = true;
    statusIndicator.classList.add('online');
    statusText.textContent = 'Connected';
    
    // Auto-rejoin if connection was dropped
    if (localRoomCode && localName) {
      console.log(`Re-joining room: ${localRoomCode}`);
      joinRoom(localRoomCode, localName, localRole, roomState ? roomState.deckType : 'fibonacci');
    }
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('Received from WS server:', message);

      switch (message.type) {
        case 'welcome':
          localUserId = message.data.userId;
          localRoomCode = message.data.roomCode;
          // Set hash in URL
          window.location.hash = localRoomCode;
          break;

        case 'state':
          if (!localRoomCode) {
            console.log('State message ignored because client is not in a room.');
            break;
          }
          roomState = message.data;
          updateGameUI();
          break;

        case 'error':
          showToast(`❌ ${message.message}`);
          break;

        case 'loginResult':
          if (message.success) {
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('userName', message.userName);
            
            showToast(`🔑 Authentication successful! Welcome, ${message.userName}.`);
            
            // Clear inputs
            loginUserField.value = '';
            loginPassField.value = '';
            
            // Populate usernames in fields
            joinNameInput.value = message.userName;
            createNameInput.value = message.userName;
            if (loggedInUsername) {
              loggedInUsername.textContent = message.userName;
            }
            if (userProfileBar) {
              userProfileBar.classList.remove('hidden');
            }
            
            // Go to landing screen
            screenLogin.classList.add('hidden');
            screenLanding.classList.remove('hidden');
            
            if (dealerLogsLinkContainer) {
              if (message.userName === 'Ankor') {
                dealerLogsLinkContainer.classList.remove('hidden');
              } else {
                dealerLogsLinkContainer.classList.add('hidden');
              }
            }
          } else {
            showToast(`❌ ${message.message}`);
          }
          break;

        case 'registerResult':
          if (!message.success) {
            showToast(`❌ Registration failed: ${message.message}`);
          }
          break;

        case 'changePasswordResult':
          if (message.success) {
            showToast('🔑 Password changed successfully!');
          } else {
            showToast(`❌ Password change failed: ${message.message}`);
          }
          break;

        case 'kicked':
          showToast(`⚠️ ${message.message}`);
          window.location.hash = '';
          joinCodeInput.value = '';
          
          sessionStorage.removeItem('isLoggedIn');
          sessionStorage.removeItem('userName');
          sessionStorage.removeItem('userRole');
          updateCreateButtonState();
          
          localRoomCode = null;
          roomState = null;
          
          screenLanding.classList.add('hidden');
          screenGame.classList.add('hidden');
          screenLogin.classList.remove('hidden');
          
          if (userProfileBar) {
            userProfileBar.classList.add('hidden');
          }
          if (dealerLogsLinkContainer) {
            dealerLogsLinkContainer.classList.add('hidden');
          }
          break;

        default:
          console.warn('Unhandled message type:', message.type);
      }
    } catch (err) {
      console.error('Error parsing WS message:', err);
    }
  };

  socket.onclose = () => {
    console.warn('WebSocket connection closed. Falling back to local offline BroadcastChannel sync.');
    isWebSocketConnected = false;
    
    // If it closed before ever successfully connecting once, warn about VPN
    if (!hasConnectedOnce) {
      showToast('⚠️ WebSocket blocked. If using a VPN, it may block WebSocket upgrades (try disabling it or using 127.0.0.1 locally).');
    }
    
    // Update indicator to local mode
    if (localRoomCode) {
      statusIndicator.classList.add('online');
      statusText.textContent = 'Connected (Local Tab Sync)';
    } else {
      statusIndicator.classList.remove('online');
      statusText.textContent = 'Offline (Connect server to play)';
    }
    
    // Attempt WebSocket reconnection in background
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = (err) => {
    console.error('WebSocket encountered an error:', err);
  };
}

// Unified action sender (Sends to server if connected, else simulates and syncs locally via BroadcastChannel)
function sendMsg(type, data = {}) {
  if (isWebSocketConnected && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, data }));
  } else {
    handleLocalAction(type, data);
  }
}

function joinRoom(roomCode, userName, role, deckType) {
  sendMsg('join', { roomCode, userName, role, deckType });
}

// --------------------------------------------------------------------------
// OFFLINE LOCAL STATE CONTROLLER
// --------------------------------------------------------------------------
function handleLocalAction(type, data) {
  console.log('Dispatching local offline action:', type, data);

  switch (type) {
    case 'join': {
      let { roomCode, userName, role, deckType } = data;
      
      if (!roomCode) {
        // Generate random 4-letter room code
        roomCode = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let i = 0; i < 4; i++) {
          roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      } else {
        roomCode = roomCode.toUpperCase().trim();
      }

      localRoomCode = roomCode;
      window.location.hash = localRoomCode;
      statusIndicator.classList.add('online');
      statusText.textContent = 'Connected (Local Tab Sync)';

      // Clear local state first to wait for responses
      roomState = null;

      // Ask if any other tab already has state for this room code
      bc.postMessage({
        type: 'requestState',
        roomCode: localRoomCode,
        senderId: localUserId
      });

      // Broadcast our state and render if no tab responded within 200ms
      setTimeout(() => {
        if (!roomState) {
          console.log('No existing state received. Creating new room state.');
          roomState = {
            code: roomCode,
            ticketName: 'Story Title',
            ticketDesc: 'Story description goes here. Double click to edit.',
            deckType: deckType || 'fibonacci',
            revealed: false,
            players: {},
            timestamp: Date.now()
          };
          roomState.players[localUserId] = {
            id: localUserId,
            name: userName,
            role: role,
            vote: null
          };
          broadcastLocalState();
          updateGameUI();
        }
      }, 200);
      break;
    }

    case 'vote': {
      if (!roomState || !roomState.players[localUserId]) return;
      roomState.players[localUserId].vote = data.vote;
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
      break;
    }

    case 'reveal': {
      if (!roomState) return;
      roomState.revealed = true;
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
      break;
    }

    case 'reset': {
      if (!roomState) return;
      roomState.revealed = false;
      roomState.ticketName = 'Story Title';
      roomState.ticketDesc = 'Story description goes here. Double click to edit.';
      Object.keys(roomState.players).forEach(pId => {
        roomState.players[pId].vote = null;
      });
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
      break;
    }

    case 'updateTicket': {
      if (!roomState) return;
      roomState.ticketName = data.ticketName;
      roomState.ticketDesc = data.ticketDesc;
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
      break;
    }

    case 'changeDeck': {
      if (!roomState) return;
      roomState.deckType = data.deckType;
      roomState.revealed = false;
      Object.keys(roomState.players).forEach(pId => {
        roomState.players[pId].vote = null;
      });
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
      break;
    }

    case 'addMockPlayers': {
      if (!roomState) return;
      const mockNames = ['Alex (Dev)', 'Taylor (QA)', 'Jordan (UX)'];
      mockNames.forEach((name) => {
        const mockId = 'mock_' + Math.random().toString(36).substring(2, 9);
        roomState.players[mockId] = {
          id: mockId,
          name: name,
          role: 'estimator',
          vote: null,
          isMock: true
        };
      });
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
      break;
    }

    case 'removePlayer': {
      if (!roomState) return;
      // If we are kicking a mock player
      delete roomState.players[data.targetPlayerId];
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
      break;
    }

    case 'mockVote': {
      if (!roomState) return;
      const { targetPlayerId, vote } = data;
      if (roomState.players[targetPlayerId]) {
        roomState.players[targetPlayerId].vote = vote;
      }
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
      break;
    }

    case 'leave': {
      if (roomState) {
        delete roomState.players[localUserId];
        roomState.timestamp = Date.now();
        broadcastLocalState();
      }
      localRoomCode = null;
      roomState = null;
      window.location.hash = '';
      break;
    }
  }
}

// --------------------------------------------------------------------------
// GAME CONTROLS & EVENT HANDLERS
// --------------------------------------------------------------------------
function setupGameControls() {
  // Leave Room button
  btnLeave.addEventListener('click', () => {
    sendMsg('leave');
    // Clear URL Hash & inputs
    window.location.hash = '';
    joinCodeInput.value = '';
    
    // Log out (clear login session storage)
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('userName');
    sessionStorage.removeItem('userRole');
    updateCreateButtonState();
    
    // Reset client state
    localRoomCode = null;
    roomState = null;
    // Simulator reset removed
    // Switch screens and redirect back to login
    screenLanding.classList.add('hidden');
    screenGame.classList.add('hidden');
    screenLogin.classList.remove('hidden');
    
    if (userProfileBar) {
      userProfileBar.classList.add('hidden');
    }
    if (dealerLogsLinkContainer) {
      dealerLogsLinkContainer.classList.add('hidden');
    }
    
    // reset indicator text
    if (!isWebSocketConnected) {
      statusIndicator.classList.remove('online');
      statusText.textContent = 'Offline (Connect server to play)';
    }
  });

  // Reveal Cards button
  btnReveal.addEventListener('click', () => {
    sendMsg('reveal');
  });

  // Reset Round button
  btnReset.addEventListener('click', () => {
    sendMsg('reset');
  });

  // Deck selector change handler
  deckSelectDropdown.addEventListener('change', (e) => {
    const deckType = e.target.value;
    sendMsg('changeDeck', { deckType });
  });

  // Ticket Editor triggers
  ticketEditBtn.addEventListener('click', () => {
    toggleTicketEditor(true);
  });

  btnCancelTicket.addEventListener('click', () => {
    toggleTicketEditor(false);
  });

  btnSaveTicket.addEventListener('click', () => {
    const ticketName = ticketTitleInput.value.trim() || 'Story Title';
    const ticketDesc = ticketDescInput.value.trim() || 'No description provided.';
    sendMsg('updateTicket', { ticketName, ticketDesc });
    toggleTicketEditor(false);
  });

  // Double click story cards to edit directly
  ticketDisplay.addEventListener('dblclick', () => {
    toggleTicketEditor(true);
  });

  // Simulator listeners removed
}

function toggleTicketEditor(editing) {
  if (editing) {
    ticketTitleInput.value = ticketTitleDisplay.textContent;
    ticketDescInput.value = ticketDescDisplay.textContent;
    ticketDisplay.classList.add('hidden');
    ticketEditor.classList.remove('hidden');
  } else {
    ticketDisplay.classList.remove('hidden');
    ticketEditor.classList.add('hidden');
  }
}

// --------------------------------------------------------------------------
// RENDERING & INTERFACE UPDATES
// --------------------------------------------------------------------------
function updateGameUI() {
  if (!roomState) return;

  // Show game screen
  screenLanding.classList.add('hidden');
  screenGame.classList.remove('hidden');

  // Room header details
  displayRoomCode.textContent = roomState.code;
  
  // Ticket name and description
  ticketTitleDisplay.textContent = roomState.ticketName;
  ticketDescDisplay.textContent = roomState.ticketDesc;

  // Ensure deck selector dropdown is in sync
  deckSelectDropdown.value = roomState.deckType;

  // Check role of the local user
  const me = roomState.players[localUserId];
  if (me) {
    localRole = me.role;
    // Highlight the card selected by the local user
    localVote = me.vote;
  }

  // Render sub-components
  renderDeck();
  renderParticipants();
  renderResultsAndStats();
}

function renderDeck() {
  cardsGrid.innerHTML = '';
  
  if (localRole === 'spectator') {
    spectatorMsg.classList.remove('hidden');
    cardsGrid.classList.add('hidden');
    return;
  }

  spectatorMsg.classList.add('hidden');
  cardsGrid.classList.remove('hidden');

  const deck = DECKS[roomState.deckType] || DECKS.fibonacci;
  const suits = ['♠', '♥', '♣', '♦'];

  deck.forEach((val, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'poker-card';
    if (localVote === val) {
      cardEl.classList.add('active');
    }

    const suit = suits[index % 4];
    const isRed = suit === '♥' || suit === '♦';
    const suitClass = isRed ? 'suit-red' : 'suit-black';

    cardEl.innerHTML = `
      <div class="card-corner top-left ${suitClass}">
        <span class="corner-val">${val}</span>
        <span class="corner-suit">${suit}</span>
      </div>
      <span class="poker-card-value ${suitClass}">${val}</span>
      <div class="card-corner bottom-right ${suitClass}">
        <span class="corner-val">${val}</span>
        <span class="corner-suit">${suit}</span>
      </div>
    `;
    
    cardEl.addEventListener('click', () => {
      // Toggle vote
      const newVote = localVote === val ? null : val;
      sendMsg('vote', { vote: newVote });
      
      // Simulator trigger removed
    });

    cardsGrid.appendChild(cardEl);
  });
}

function renderParticipants() {
  participantsList.innerHTML = '';
  const players = Object.values(roomState.players);
  participantCount.textContent = players.length;

  // Group by Estimators first, then Spectators. Sort alphabetically within groups.
  players.sort((a, b) => {
    if (a.role === 'estimator' && b.role === 'spectator') return -1;
    if (a.role === 'spectator' && b.role === 'estimator') return 1;
    return a.name.localeCompare(b.name);
  });

  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-row';

    const isMe = p.id === localUserId;
    const nameText = isMe ? `${p.name} <span class="self-tag">You</span>` : p.name;
    
    // Generate initials for avatar
    const initials = p.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    // Assign a unique background color based on name hash
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6'];
    const colorIdx = Math.abs(hashCode(p.name)) % colors.length;
    const avatarBg = colors[colorIdx];

    // Determine player role display
    const roleText = p.role === 'spectator' ? '👁️ Spectator' : '💻 Estimator';

    let cardSlotHtml = '';
    if (p.role === 'estimator') {
      // 3D Flip Card components
      const hasVotedClass = p.vote ? 'has-voted' : '';
      
      // Determine if revealed is true
      const revealedClass = roomState.revealed ? 'revealed' : '';
      const faceBackVotedClass = p.vote ? '' : 'not-voted';
      const backFaceContent = p.vote ? p.vote : '-';

      // Pick dynamic suit watermark based on player's name hash
      const suits = ['♠', '♥', '♣', '♦'];
      const playerSuit = suits[Math.abs(hashCode(p.name)) % 4];
      const isRed = playerSuit === '♥' || playerSuit === '♦';
      const suitClass = isRed ? 'suit-red' : 'suit-black';

      cardSlotHtml = `
        <div class="player-card-slot">
          <div class="card-flip-inner ${revealedClass}">
            <!-- Front Face: Shown while voting (classic casino blue back) -->
            <div class="card-face card-face-front ${hasVotedClass}">
              ${p.vote ? '' : '?'}
            </div>
            <!-- Back Face: Shown on Reveal (watermarked clean white face) -->
            <div class="card-face card-face-back ${faceBackVotedClass} ${suitClass}">
              ${p.vote ? `<span class="card-suit-watermark">${playerSuit}</span>` : ''}
              <span class="card-reveal-val">${backFaceContent}</span>
            </div>
          </div>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="player-info">
        <div class="player-avatar" style="background-color: ${avatarBg};">${initials}</div>
        <div class="player-details">
          <span class="player-name">${nameText}</span>
          <span class="player-role">${roleText}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap: 0.5rem;">
        ${cardSlotHtml}
      </div>
    `;

    participantsList.appendChild(row);
  });
}

function renderResultsAndStats() {
  if (!roomState.revealed) {
    resultsPanel.classList.add('hidden');
    btnReveal.disabled = false;
    return;
  }

  resultsPanel.classList.remove('hidden');
  btnReveal.disabled = true;

  // Gather estimator votes
  const estimators = Object.values(roomState.players).filter(p => p.role === 'estimator');
  const validVotes = [];
  const allVotedCards = {}; // Card value -> Count

  estimators.forEach(p => {
    if (p.vote) {
      validVotes.push(p.vote);
      allVotedCards[p.vote] = (allVotedCards[p.vote] || 0) + 1;
    }
  });

  // Calculate statistics (skip if no valid votes)
  if (validVotes.length === 0) {
    statAvg.textContent = '-';
    statMedian.textContent = '-';
    statSpread.textContent = '-';
    consensusStatus.textContent = 'No Votes';
    consensusStatus.className = 'consensus-badge no-consensus';
    chartBars.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.9rem;">No votes cast to show distribution.</div>';
    consensusHint.innerHTML = '💡 Discussion tip: Have estimators select cards before revealing.';
    return;
  }

  // Parse numerical equivalents
  const isFibonacci = roomState.deckType === 'fibonacci';
  const numericValues = []; // Stores numeric equivalent for stats calculations

  validVotes.forEach(v => {
    if (v === '?' || v === '☕') return;
    
    if (isFibonacci) {
      const parsed = parseFloat(v);
      if (!isNaN(parsed)) numericValues.push(parsed);
    } else {
      // T-Shirt Sizes mapping
      if (TSHIRT_VALUES[v] !== undefined) {
        numericValues.push(TSHIRT_VALUES[v]);
      }
    }
  });

  let averageStr = '-';
  let medianStr = '-';
  let spreadStr = '-';

  if (numericValues.length > 0) {
    // Average
    const sum = numericValues.reduce((a, b) => a + b, 0);
    const avg = sum / numericValues.length;

    // Median
    numericValues.sort((a, b) => a - b);
    const mid = Math.floor(numericValues.length / 2);
    const median = numericValues.length % 2 !== 0 
      ? numericValues[mid] 
      : (numericValues[mid - 1] + numericValues[mid]) / 2;

    // Spread (Min & Max Range)
    const minVal = numericValues[0];
    const maxVal = numericValues[numericValues.length - 1];

    if (isFibonacci) {
      averageStr = avg.toFixed(1);
      medianStr = median.toFixed(1);
      spreadStr = (maxVal - minVal).toString();
    } else {
      // Map numerical average back to T-Shirt sizes
      averageStr = mapNumericToTshirt(avg);
      medianStr = mapNumericToTshirt(median);
      // Map min/max spread
      const minShirt = mapNumericToTshirt(minVal);
      const maxShirt = mapNumericToTshirt(maxVal);
      spreadStr = minShirt === maxShirt ? '0' : `${minShirt} to ${maxShirt}`;
    }
  }

  statAvg.textContent = averageStr;
  statMedian.textContent = medianStr;
  statSpread.textContent = spreadStr;

  // Consensus status calculation
  // Check if unique count of votes is 1 (excluding ? and coffee cup, but let's count absolute consensus)
  const uniqueVotes = [...newSet(validVotes)];
  
  if (uniqueVotes.length === 1) {
    consensusStatus.textContent = 'Consensus Reached!';
    consensusStatus.className = 'consensus-badge';
    consensusHint.innerHTML = `🎉 Perfect consensus! Everyone agrees on sizing this ticket as <strong>${uniqueVotes[0]}</strong>. Ready to lock in this estimate.`;
  } else {
    // Check if close consensus (spread is small)
    let isClose = false;
    if (numericValues.length > 0) {
      const minVal = numericValues[0];
      const maxVal = numericValues[numericValues.length - 1];
      if (isFibonacci) {
        // Close if difference is small in fibonacci indexes
        const fibIndexMin = DECKS.fibonacci.indexOf(minVal.toString());
        const fibIndexMax = DECKS.fibonacci.indexOf(maxVal.toString());
        if (fibIndexMin !== -1 && fibIndexMax !== -1 && (fibIndexMax - fibIndexMin <= 2)) {
          isClose = true;
        }
      } else {
        // T-shirt sizes close within 1 index
        const indexMin = TSHIRT_ORDER.indexOf(mapNumericToTshirt(minVal));
        const indexMax = TSHIRT_ORDER.indexOf(mapNumericToTshirt(maxVal));
        if (indexMin !== -1 && indexMax !== -1 && (indexMax - indexMin <= 1)) {
          isClose = true;
        }
      }
    }

    if (isClose) {
      consensusStatus.textContent = 'Close consensus';
      consensusStatus.className = 'consensus-badge no-consensus';
      consensusHint.innerHTML = `💡 The votes are close (ranging from <strong>${uniqueVotes.join('</strong>, <strong>')}</strong>). A brief sync should align the team.`;
    } else {
      consensusStatus.textContent = 'Wide Variance';
      consensusStatus.className = 'consensus-badge no-consensus';
      
      // Dynamic discussion prompt listing extremes
      let discussPrompt = '💡 Discussion tip: Let\'s hear from the estimators with the lowest and highest values to align.';
      
      // Attempt to identify lowest and highest voters
      const activeEstimatorsWithNumeric = estimators.filter(p => {
        if (!p.vote || p.vote === '?' || p.vote === '☕') return false;
        return true;
      });

      if (activeEstimatorsWithNumeric.length >= 2) {
        // Sort active players by vote value
        activeEstimatorsWithNumeric.sort((a, b) => {
          const valA = isFibonacci ? parseFloat(a.vote) : TSHIRT_VALUES[a.vote];
          const valB = isFibonacci ? parseFloat(b.vote) : TSHIRT_VALUES[b.vote];
          return valA - valB;
        });
        const lowestVoter = activeEstimatorsWithNumeric[0];
        const highestVoter = activeEstimatorsWithNumeric[activeEstimatorsWithNumeric.length - 1];
        discussPrompt = `🗣️ **Wide variance!** It's highly recommended to let **${lowestVoter.name}** (voted ${lowestVoter.vote}) and **${highestVoter.name}** (voted ${highestVoter.vote}) explain their thoughts to bridge the gap.`;
      }

      consensusHint.innerHTML = discussPrompt;
    }
  }

  // Render Vote Distribution Chart
  chartBars.innerHTML = '';
  const currentDeck = DECKS[roomState.deckType] || DECKS.fibonacci;

  // Iterate over full deck to keep consistent order of options
  currentDeck.forEach(cardValue => {
    const count = allVotedCards[cardValue] || 0;
    if (count > 0) {
      const pct = (count / validVotes.length) * 100;
      const barRow = document.createElement('div');
      barRow.className = 'chart-bar-row';
      barRow.innerHTML = `
        <span class="chart-label">${cardValue}</span>
        <div class="chart-track">
          <div class="chart-bar" style="width: ${pct}%;"></div>
        </div>
        <span class="chart-count">${count} vote${count > 1 ? 's' : ''}</span>
      `;
      chartBars.appendChild(barRow);
    }
  });
}

// Teammate Simulator functions removed

// --------------------------------------------------------------------------
// UTILITY FUNCTIONS
// --------------------------------------------------------------------------
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function newSet(arr) {
  return Array.from(new Set(arr));
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  
  // Slide toast in
  setTimeout(() => {
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateY(0)';
  }, 10);

  // Hide toast after 3.5 seconds
  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(20px)';
    setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 300);
  }, 3500);
}

function mapNumericToTshirt(num) {
  // Num will be between 1 and 13. Map to closest TSHIRT size
  let closest = 'M';
  let minDiff = Infinity;
  for (const size in TSHIRT_VALUES) {
    const diff = Math.abs(TSHIRT_VALUES[size] - num);
    if (diff < minDiff) {
      minDiff = diff;
      closest = size;
    }
  }
  return closest;
}

// Unload handler to send leave message before tab closes
function setupUnloadHandlers() {
  window.addEventListener('beforeunload', () => {
    sendMsg('leave');
  });
}

// Keep-Alive Heartbeat interval for local BroadcastChannel fallback mode
function setupBroadcastHeartbeat() {
  setInterval(() => {
    // Skip if connected to WebSocket, which handles keep-alives natively
    if (isWebSocketConnected) return;
    if (!localRoomCode || !roomState) return;

    // Send a ping to keep our session alive in other tabs
    bc.postMessage({
      type: 'ping',
      roomCode: localRoomCode,
      senderId: localUserId
    });

    // Check for stale players (lastSeen older than 12 seconds)
    const now = Date.now();
    let stateChanged = false;

    Object.keys(roomState.players).forEach(pId => {
      // Don't timeout ourselves or bots
      if (pId === localUserId || roomState.players[pId].isMock) return;

      const lastSeen = roomState.players[pId].lastSeen || now;
      if (now - lastSeen > 12000) {
        console.log(`Player ${roomState.players[pId].name} timed out in local mode. Removing.`);
        delete roomState.players[pId];
        stateChanged = true;
      }
    });

    if (stateChanged) {
      roomState.timestamp = Date.now();
      broadcastLocalState();
      updateGameUI();
    }
  }, 5000);
}
