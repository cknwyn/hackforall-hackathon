const { ipcRenderer, webFrame } = require('electron');

// Prevent accidental scaling/zooming
webFrame.setVisualZoomLevelLimits(1, 1);
webFrame.setZoomLevel(0);
window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
}, { passive: false });

// --- 1. CORE UI ELEMENTS ---
const bubble = document.getElementById('buddy-bubble');
const text = document.getElementById('buddy-text');
const mouth = document.getElementById('buddy-mouth');
const buddy = document.getElementById('main-buddy');
const overlay = document.getElementById('connect-overlay');
const idBadge = document.getElementById('id-badge');
const nameInputContainer = document.getElementById('name-input-container');
const nameInput = document.getElementById('buddy-name-input');
const radialContainer = document.getElementById('radial-menu-container');
const bottomBar = document.getElementById('bottom-input-bar');
const connectRequestText = document.getElementById('connect-request-text');

// --- 2. GLOBAL STATE ---
let db = null;
let partnerRoomId = null;
let requesterCode = null;
let buddyName = localStorage.getItem('buddy-name') || "My Buddy";
const roomId = "hack-" + Math.floor(1000 + Math.random() * 9000);

// --- 3. BASIC BUDDY FUNCTIONS (ALWAYS WORK) ---
function speak(message, duration = 3000) {
    console.log("Buddy says:", message);
    if (!text || !bubble || !mouth) return;
    text.innerText = message;
    bubble.classList.add('visible');
    mouth.style.height = '10px';
    mouth.style.borderRadius = '50%';

    setTimeout(() => {
        bubble.classList.remove('visible');
        mouth.style.height = '5px';
        mouth.style.borderRadius = '10px';
    }, duration);
}

function updateStatus(status) {
    if (idBadge) {
        idBadge.innerText = status;
        idBadge.style.color = '#e17055'; // Orange-ish while loading
    }
}

function finishLoading() {
    if (idBadge) {
        idBadge.innerText = `${buddyName} | Code: ${roomId.replace('hack-', '')}`;
        idBadge.style.color = '#6c5ce7'; // Purple when ready
    }
}

// --- 4. INTERACTION LOGIC (DRAGGING) ---
let isDragging = false;
let dragOffsetX = 0, dragOffsetY = 0;
let dragMoved = false;

if (buddy) {
    buddy.addEventListener('pointerdown', (e) => {
        isDragging = true;
        dragMoved = false;
        dragOffsetX = e.clientX;
        dragOffsetY = e.clientY;
        buddy.setPointerCapture(e.pointerId);
        ipcRenderer.send('set-ignore-mouse-events', false);
    });

    // Fallback double click if needed
    buddy.addEventListener('dblclick', () => {
        window.openRadialMenu('main');
    });
}

window.addEventListener('pointerup', (e) => {
    if (isDragging) {
        isDragging = false;
        if (buddy && buddy.hasPointerCapture(e.pointerId)) {
            buddy.releasePointerCapture(e.pointerId);
        }
        
        // If they didn't really move the mouse, treat as a click to open menu
        if (!dragMoved) {
            window.openRadialMenu('main');
        }
    }
});
window.addEventListener('pointermove', (e) => {
    if (isDragging) {
        if (Math.abs(e.clientX - dragOffsetX) > 3 || Math.abs(e.clientY - dragOffsetY) > 3) {
            dragMoved = true;
            closeRadialMenu(); // hide if dragging
            closeBottomBar();
        }
        ipcRenderer.send('move-window-absolute', e.screenX - dragOffsetX, e.screenY - dragOffsetY);
        return;
    }

    // Check if mouse is over UI elements
    const overBuddy = buddy && (document.elementFromPoint(e.clientX, e.clientY) === buddy || buddy.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overBubble = bubble && (document.elementFromPoint(e.clientX, e.clientY) === bubble || bubble.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overBadge = idBadge && (document.elementFromPoint(e.clientX, e.clientY) === idBadge || idBadge.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overRadial = radialContainer && (document.elementFromPoint(e.clientX, e.clientY) === radialContainer || radialContainer.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overBottomBar = bottomBar && (document.elementFromPoint(e.clientX, e.clientY) === bottomBar || bottomBar.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const isOverlayVisible = overlay && overlay.classList.contains('visible');

    if (!overBuddy && !overBubble && !overBadge && !overRadial && !overBottomBar && !isOverlayVisible) {
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    } else {
        ipcRenderer.send('set-ignore-mouse-events', false);
    }
});

// Wander Mode - Disabled to prevent random jumping
// setInterval(() => {
//     if (isDragging || (overlay && overlay.classList.contains('visible'))) return;
//     ipcRenderer.send('move-window', (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
// }, 10000);

// --- 5. FIREBASE INITIALIZATION (SAFE MODE) ---
async function initFirebase() {
    updateStatus("Loading Bridge...");

    try {
        // Use global 'firebase' from the CDN script
        if (typeof firebase === 'undefined') {
            throw new Error("Firebase CDN scripts failed to load.");
        }

        const firebaseConfig = {
            apiKey: "AIzaSyDlz91QUyZ3u5jIOBvuL3FeNW-F3fcdi1Y",
            authDomain: "hackforall-hackathon.firebaseapp.com",
            projectId: "hackforall-hackathon",
            storageBucket: "hackforall-hackathon.firebasestorage.app",
            messagingSenderId: "391540276748",
            appId: "1:391540276748:web:8dd22d1a98684e8b647829",
            measurementId: "G-L2N5PZC4R5"
        };

        updateStatus("Connecting DB...");
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();

        updateStatus("Ready!");

        // Quality of Life: Initialize room explicitly and wait for it
        await db.collection("rooms").doc(roomId).set({ status: "idle", requestConnect: false });
        finishLoading();

        setupTutorListener();
        speak(`I'm connected! My code is ${roomId.replace('hack-', '')}`);

    } catch (err) {
        console.error("Firebase Init Error:", err);
        updateStatus("Offline Mode");
        // Speak the error for debugging
        const errMsg = err.message || "Unknown error";
        speak(`Error: ${errMsg.substring(0, 40)}`);
        setTimeout(finishLoading, 6000);
    }
}

function setupTutorListener() {
    if (!db) return;
    db.collection("rooms").doc(roomId).onSnapshot((doc) => {
        // Blink on data receipt
        if (buddy) {
            buddy.style.boxShadow = '0 0 30px #a29bfe';
            setTimeout(() => buddy.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)', 200);
        }

        const data = doc.data();
        if (!data) return;

        // 1. Connection Request Logic
        if (data.requestConnect && data.status !== "connected") {
            requesterCode = data.requesterCode;
            connectRequestText.innerText = `Buddy ${requesterCode} wants to connect!`;
            overlay.classList.add('visible');
        } else if (data.status === "connected") {
            overlay.classList.remove('visible');
            window.isPartnerConnected = true;

            // QoL: Update badge text and style
            idBadge.innerText = "Connected 🟢";
            idBadge.style.color = '#00b894';
            idBadge.style.background = 'white';
            idBadge.style.opacity = '1';

            if (!window.badgeHideTimeout) {
                window.badgeHideTimeout = setTimeout(() => {
                    idBadge.style.opacity = '0';
                    idBadge.style.pointerEvents = 'none';
                }, 5000);
            }

            if (data.requesterCode && !partnerRoomId) {
                partnerRoomId = "hack-" + data.requesterCode;
                console.log("Partner room identified:", partnerRoomId);
            }
        } else if (data.status === "idle") {
            overlay.classList.remove('visible');
            window.isPartnerConnected = false;
            
            idBadge.style.display = 'block';
            idBadge.style.opacity = '1';
            idBadge.style.pointerEvents = 'auto';

            if (window.badgeHideTimeout) {
                clearTimeout(window.badgeHideTimeout);
                window.badgeHideTimeout = null;
            }
            finishLoading();
        } else {
            window.isPartnerConnected = false;
        }

        // 2. Incoming Messages
        if (data.status === "connected" && data.lastMessage && data.lastMessageTimestamp > (window.lastProcessedMsg || 0)) {
            speak(data.lastMessage);
            window.lastProcessedMsg = data.lastMessageTimestamp;
        }

        // 3. Remote Commands
        if (data.status === "connected" && data.command) {
            handleRemoteCommand(data.command);
            db.collection("rooms").doc(roomId).update({ command: null });
        }
    });
}


function handleRemoteCommand(cmd) {
    if (cmd.type === 'wiggle') {
        buddy.style.animation = 'wiggle 0.5s ease infinite';
        setTimeout(() => buddy.style.animation = 'float 3s ease-in-out infinite', 2000);
    } else if (cmd.type === 'emoji') {
        speak(cmd.value);
    } else if (cmd.type === 'move') {
        ipcRenderer.send('move-window', cmd.x, cmd.y);
    }
}

window.acceptBuddyUI = () => {
    if (!requesterCode) return;

    partnerRoomId = "hack-" + requesterCode;
    db.collection("rooms").doc(roomId).update({ status: "connected", requestConnect: false });
    overlay.classList.remove('visible');
    speak("We're connected!");
};

window.rejectTutor = () => {
    db.collection("rooms").doc(roomId).update({ status: "idle", requestConnect: false });
    overlay.classList.remove('visible');
};

window.disconnectBuddy = async () => {
    speak("Disconnecting...");

    // 1. Reset your own room
    await db.collection("rooms").doc(roomId).update({
        status: "idle",
        requestConnect: false
    });

    // 2. Reset your partner's room if possible
    if (partnerRoomId) {
        await db.collection("rooms").doc(partnerRoomId).update({
            status: "idle",
            requestConnect: false
        });
        partnerRoomId = null;
    }

    // 3. UI Cleanup
    closeBottomBar();
    finishLoading();
    speak("Disconnected. Time for a break!");
};


// --- 6. TUTOR/BUDDY SEND COMMANDS ---
window.requestConnectionUI = async (val) => {
    const friendCode = val.trim();
    if (!friendCode || friendCode.length !== 4) {
        speak("Need 4 digits!");
        return;
    }
    partnerRoomId = "hack-" + friendCode;
    updateStatus("Connecting...");
    await db.collection("rooms").doc(partnerRoomId).set({
        requestConnect: true,
        requesterCode: roomId.replace('hack-', '')
    }, { merge: true });
    speak("Request sent!");
    closeBottomBar();
};

window.sendCommandToBuddy = async (type, payload = {}) => {
    if (!partnerRoomId) {
        speak("Connect to a buddy first!");
        return;
    }
    await db.collection("rooms").doc(partnerRoomId).set({
        command: { type, ...payload, timestamp: Date.now() }
    }, { merge: true });
};

window.sendMessageUI = async (msg) => {
    if (!partnerRoomId) {
        speak("Connect first!");
        return;
    }
    if (!msg) return;
    await db.collection("rooms").doc(partnerRoomId).set({
        lastMessage: msg,
        lastMessageTimestamp: Date.now(),
        status: "connected"
    }, { merge: true });
    closeBottomBar();
};

// --- RADIAL MENU RENDERING ENGINE ---
const RADIAL_RADIUS = 130; // Push further out from buddy

const radialMenuData = {
    main: [
        { angle: 45, icon: '🖌️', action: () => openRadialMenu('customize'), color: '' },
        { angle: -45, icon: '🌐', action: () => openRadialMenu('network'), color: '' },
        { angle: 135, icon: '⚙️', action: () => openRadialMenu('settings'), color: '' },
        { angle: -135, icon: '❌', action: () => closeRadialMenu(), color: 'btn-close' }
    ],
    customize: [
        { angle: 45, icon: '🔙', action: () => openRadialMenu('main'), color: 'btn-back' },
        { angle: -45, icon: '🎨', action: () => openRadialMenu('colors'), color: '' },
        { angle: 135, icon: '🎩', action: () => openRadialMenu('hats'), color: '' }
    ],
    colors: [
        { angle: -45, icon: '🔙', action: () => openRadialMenu('customize'), color: 'btn-back' },
        { angle: 45, icon: '🔴', action: () => { applyColor('#d63031', '#ff7675'); closeRadialMenu(); }, color: 'btn-fire' },
        { angle: 135, icon: '🟢', action: () => { applyColor('#00b894', '#55efc4'); closeRadialMenu(); }, color: 'btn-mint' },
        { angle: -135, icon: '🔵', action: () => { applyColor('#0984e3', '#74b9ff'); closeRadialMenu(); }, color: 'btn-sky' },
        { angle: 0, icon: '🟣', action: () => { applyColor('#6c5ce7', '#a29bfe'); closeRadialMenu(); }, color: '' },
    ],
    hats: [
        { angle: 135, icon: '🔙', action: () => openRadialMenu('customize'), color: 'btn-back' },
        { angle: -45, icon: '🎩', action: () => { applyHat('🎩'); closeRadialMenu(); }, color: 'btn-fire' },
        { angle: 45, icon: '👑', action: () => { applyHat('👑'); closeRadialMenu(); }, color: 'btn-sky' },
        { angle: -135, icon: '🚫', action: () => { applyHat('none'); closeRadialMenu(); }, color: 'btn-close' }
    ],
    network: [
        { angle: -45, icon: '🔙', action: () => openRadialMenu('main'), color: 'btn-back' },
        { angle: 45, icon: '🔓', action: () => openBottomBar('connect'), color: '' },
        { angle: 135, icon: '💬', action: () => openBottomBar('message'), color: '' },
        { angle: -135, icon: '👋', action: () => { window.sendCommandToBuddy('wiggle'); closeRadialMenu(); }, color: '' }
    ],
    settings: [
        { angle: 135, icon: '🔙', action: () => openRadialMenu('main'), color: 'btn-back' },
        { angle: 45, icon: '🏷️', action: () => { document.getElementById('name-input-container').style.display='block'; closeRadialMenu(); }, color: '' }
    ]
};

window.openRadialMenu = (viewId) => {
    closeBottomBar();
    radialContainer.innerHTML = ''; // Clear prev
    const nodes = radialMenuData[viewId];
    if (!nodes) return;

    nodes.forEach((node, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'radial-btn-wrapper';
        
        // Use standard Rotate/Translate to map angle easily using CSS
        // Ensure negative numbers don't print double-minuses
        wrapper.style.transform = `rotate(${node.angle}deg) translateY(-${RADIAL_RADIUS}px) rotate(${ -node.angle }deg)`;

        const btn = document.createElement('button');
        btn.className = `radial-btn ${node.color}`;
        btn.innerText = node.icon;
        btn.onclick = node.action;

        wrapper.appendChild(btn);
        radialContainer.appendChild(wrapper);

        // trigger animation after a tiny delay so it pops out
        setTimeout(() => {
            wrapper.classList.add('active');
        }, 10 + index * 50); // Stagger pop-out
    });
};

window.closeRadialMenu = () => {
    radialContainer.innerHTML = '';
};

// --- DYNAMIC BOTTOM BAR FORMS ---
window.openBottomBar = (mode) => {
    closeRadialMenu();
    const input = document.getElementById('dynamic-input');
    const btn = document.getElementById('dynamic-btn');
    const statusDot = document.getElementById('partner-status');
    
    bottomBar.classList.add('visible');
    input.value = '';
    statusDot.style.display = 'none';

    if (mode === 'connect') {
        input.placeholder = 'Partner Code (4 Digits)';
        input.maxLength = 4;
        btn.innerText = 'LINK';
        btn.onclick = () => window.requestConnectionUI(input.value);
        if (window.isPartnerConnected) {
            statusDot.style.display = 'inline-block';
            statusDot.classList.add('connected');
            btn.innerText = 'DISCONNECT';
            btn.onclick = () => window.disconnectBuddy();
        }
    } else if (mode === 'message') {
        input.placeholder = 'Type a message...';
        input.removeAttribute('maxLength');
        btn.innerText = 'SEND';
        btn.onclick = () => window.sendMessageUI(input.value);
    }
    input.onkeypress = (e) => { if(e.key === 'Enter') btn.click(); };
    setTimeout(() => input.focus(), 150);
};

window.closeBottomBar = () => {
    bottomBar.classList.remove('visible');
};

// --- Customizations ---
window.applyColor = (c1, c2) => {
    if (buddy) buddy.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
};

window.applyHat = (hatStr) => {
    const hatOverlay = document.getElementById('hat-overlay');
    if (hatOverlay) {
        if (hatStr === 'none') {
            hatOverlay.innerText = '';
        } else {
            hatOverlay.innerText = hatStr;
        }
    }
};

// --- STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
    speak("Hello! Just waking up...");
    initFirebase();
});
