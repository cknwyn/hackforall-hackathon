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
const physicsAnimator = document.getElementById('physics-animator');
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
let buddyColor = JSON.parse(localStorage.getItem('buddy-color')) || { c1: '#6c5ce7', c2: '#a29bfe' };
let buddyHat = localStorage.getItem('buddy-hat') || 'none';
let buddyShape = localStorage.getItem('buddy-shape') || 'default';
const roomId = "hack-" + Math.floor(1000 + Math.random() * 9000);

// --- 3. BASIC BUDDY FUNCTIONS ---
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
        idBadge.style.color = '#e17055'; 
    }
}

function finishLoading() {
    if (idBadge) {
        idBadge.innerText = `${buddyName} | Code: ${roomId.replace('hack-', '')}`;
        idBadge.style.color = '#6c5ce7'; 
    }
}

// --- 4. INTERACTION LOGIC (DRAGGING) ---
let isDragging = false;
let dragOffsetX = 0, dragOffsetY = 0;
let dragMoved = false;

if (physicsAnimator) {
    physicsAnimator.addEventListener('pointerdown', (e) => {
        isDragging = true;
        dragMoved = false;
        dragOffsetX = e.clientX;
        dragOffsetY = e.clientY;
        physicsAnimator.setPointerCapture(e.pointerId);
        
        physicsAnimator.style.animation = 'none'; 
        ipcRenderer.send('set-ignore-mouse-events', false);
    });

    physicsAnimator.addEventListener('dblclick', () => {
        window.openRadialMenu('main');
    });
}

window.addEventListener('pointerup', (e) => {
    if (isDragging) {
        isDragging = false;
        if (physicsAnimator && physicsAnimator.hasPointerCapture(e.pointerId)) {
            physicsAnimator.releasePointerCapture(e.pointerId);
        }
        
        if (physicsAnimator) {
            physicsAnimator.style.animation = 'float 3s ease-in-out infinite';
        }

        if (!dragMoved) {
            window.openRadialMenu('main');
        }
    }
});

window.addEventListener('pointermove', (e) => {
    if (isDragging) {
        if (Math.abs(e.clientX - dragOffsetX) > 3 || Math.abs(e.clientY - dragOffsetY) > 3) {
            dragMoved = true;
            closeRadialMenu();
            closeBottomBar();
        }
        ipcRenderer.send('move-window-absolute', e.screenX - dragOffsetX, e.screenY - dragOffsetY);
        return;
    }

    // Broadened hit detection to fix top button and hat issues
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overBuddy = buddy && (el === buddy || buddy.contains(el));
    const overBadge = idBadge && (el === idBadge || idBadge.contains(el));
    const overNameInput = nameInputContainer && (el === nameInputContainer || nameInputContainer.contains(el));
    const overRadial = radialContainer && (el === radialContainer || radialContainer.contains(el));
    const overBottomBar = bottomBar && (el === bottomBar || bottomBar.contains(el));
    const overPhysics = physicsAnimator && (el === physicsAnimator || physicsAnimator.contains(el));
    const isOverlayVisible = overlay && overlay.classList.contains('visible');
    const overRadialBtn = el && el.closest('.radial-btn');
    const overInput = el && (el.tagName === 'INPUT' || el.tagName === 'BUTTON');

    if (!overBuddy && !overBadge && !overNameInput && !overRadial && !overBottomBar && !isOverlayVisible && !overRadialBtn && !overInput && !overPhysics) {
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    } else {
        ipcRenderer.send('set-ignore-mouse-events', false);
    }
});

// --- 5. FIREBASE INITIALIZATION ---
async function initFirebase() {
    updateStatus("Connecting...");
    try {
        const firebaseConfig = {
            apiKey: "AIzaSyDlz91QUyZ3u5jIOBvuL3FeNW-F3fcdi1Y",
            authDomain: "hackforall-hackathon.firebaseapp.com",
            projectId: "hackforall-hackathon",
            storageBucket: "hackforall-hackathon.firebasestorage.app",
            messagingSenderId: "391540276748",
            appId: "1:391540276748:web:8dd22d1a98684e8b647829",
            measurementId: "G-L2N5PZC4R5"
        };
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        await db.collection("rooms").doc(roomId).set({ status: "idle", requestConnect: false });
        finishLoading();
        setupTutorListener();
    } catch (err) {
        console.error("Firebase Error:", err);
        updateStatus("Offline Mode");
        setTimeout(finishLoading, 3000);
    }
}

function setupTutorListener() {
    if (!db) return;
    db.collection("rooms").doc(roomId).onSnapshot((doc) => {
        const data = doc.data();
        if (!data) return;
        if (data.requestConnect && data.status !== "connected") {
            requesterCode = data.requesterCode;
            connectRequestText.innerText = `Buddy ${requesterCode} wants to connect!`;
            overlay.classList.add('visible');
        } else if (data.status === "connected") {
            overlay.classList.remove('visible');
            window.isPartnerConnected = true;
            idBadge.innerText = "Connected 🟢";
            if (data.requesterCode && !partnerRoomId) partnerRoomId = "hack-" + data.requesterCode;
        } else if (data.status === "idle") {
            overlay.classList.remove('visible');
            window.isPartnerConnected = false;
            finishLoading();
        }
        if (data.status === "connected" && data.lastMessage && data.lastMessageTimestamp > (window.lastProcessedMsg || 0)) {
            speak(data.lastMessage);
            window.lastProcessedMsg = data.lastMessageTimestamp;
        }
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
    }
}

window.acceptBuddyUI = () => {
    if (!requesterCode) return;
    partnerRoomId = "hack-" + requesterCode;
    db.collection("rooms").doc(roomId).update({ status: "connected", requestConnect: false });
    overlay.classList.remove('visible');
};

window.rejectTutor = () => {
    db.collection("rooms").doc(roomId).update({ status: "idle", requestConnect: false });
    overlay.classList.remove('visible');
};

window.disconnectBuddy = async () => {
    await db.collection("rooms").doc(roomId).update({ status: "idle", requestConnect: false });
    if (partnerRoomId) await db.collection("rooms").doc(partnerRoomId).update({ status: "idle", requestConnect: false });
    partnerRoomId = null;
    closeBottomBar();
    finishLoading();
};

window.requestConnectionUI = async (val) => {
    const friendCode = val.trim();
    if (friendCode.length !== 4) return;
    partnerRoomId = "hack-" + friendCode;
    await db.collection("rooms").doc(partnerRoomId).set({ requestConnect: true, requesterCode: roomId.replace('hack-', '') }, { merge: true });
    closeBottomBar();
};

window.sendMessageUI = async (msg) => {
    if (!partnerRoomId || !msg) return;
    await db.collection("rooms").doc(partnerRoomId).set({ lastMessage: msg, lastMessageTimestamp: Date.now(), status: "connected" }, { merge: true });
    closeBottomBar();
};

// --- RADIAL MENU RENDERING ENGINE ---
const RADIAL_RADIUS = 130;
const radialMenuData = {
    main: [
        { angle: 45, icon: '🖌️', action: () => openRadialMenu('customize'), color: '' },
        { angle: -45, icon: '🌐', action: () => openRadialMenu('network'), color: '' },
        { angle: 135, icon: '⚙️', action: () => openRadialMenu('settings'), color: '' },
        { angle: -135, icon: '❌', action: () => closeRadialMenu(), color: 'btn-close' }
    ],
    customize: [
        { angle: 45, icon: '↩️', action: () => openRadialMenu('main'), color: 'btn-back' },
        { angle: -45, icon: '🎨', action: () => openRadialMenu('colors'), color: '' },
        { angle: 135, icon: '🎩', action: () => openRadialMenu('hats'), color: '' },
        { angle: -135, icon: '🔶', action: () => openRadialMenu('shapes'), color: '' }
    ],
    colors: [
        { angle: -45, icon: '↩️', action: () => openRadialMenu('customize'), color: 'btn-back' },
        { angle: 45, icon: '🔴', action: () => { applyColor('#d63031', '#ff7675'); closeRadialMenu(); }, color: 'btn-fire' },
        { angle: 135, icon: '🟢', action: () => { applyColor('#00b894', '#55efc4'); closeRadialMenu(); }, color: 'btn-mint' },
        { angle: -135, icon: '🔵', action: () => { applyColor('#0984e3', '#74b9ff'); closeRadialMenu(); }, color: 'btn-sky' },
        { angle: 0, icon: '🟣', action: () => { applyColor('#6c5ce7', '#a29bfe'); closeRadialMenu(); }, color: 'btn-purple' },
        { angle: 90, icon: '🟡', action: () => { applyColor('#fdcb6e', '#ffeaa7'); closeRadialMenu(); }, color: 'btn-yellow' },
        { angle: 180, icon: '💖', action: () => { applyColor('#fd79a8', '#ff9ff3'); closeRadialMenu(); }, color: 'btn-pink' },
        { angle: -90, icon: '⚪', action: () => { applyColor('#ffffff', '#dfe6e9'); closeRadialMenu(); }, color: 'btn-white' }
    ],
    hats: [
        { angle: 135, icon: '↩️', action: () => openRadialMenu('customize'), color: 'btn-back' },
        { angle: -45, icon: '🎩', action: () => { applyHat('🎩'); closeRadialMenu(); }, color: 'btn-fire' },
        { angle: 45, icon: '👑', action: () => { applyHat('👑'); closeRadialMenu(); }, color: 'btn-sky' },
        { angle: 0, icon: '🎓', action: () => { applyHat('🎓'); closeRadialMenu(); }, color: 'btn-mint' },
        { angle: 90, icon: '🤠', action: () => { applyHat('cowboy'); closeRadialMenu(); }, color: '' },
        { angle: -135, icon: '🚫', action: () => { applyHat('none'); closeRadialMenu(); }, color: '' }
    ],
    shapes: [
        { angle: -135, icon: '↩️', action: () => openRadialMenu('customize'), color: 'btn-back' },
        { angle: -45, icon: '🔺', action: () => { applyShape('triangle'); closeRadialMenu(); }, color: '' },
        { angle: 45, icon: '🔵', action: () => { applyShape('circle'); closeRadialMenu(); }, color: '' },
        { angle: 135, icon: '⬛', action: () => { applyShape('square'); closeRadialMenu(); }, color: '' },
        { angle: 0, icon: '🟦', action: () => { applyShape('default'); closeRadialMenu(); }, color: '' } 
    ],
    network: [
        { angle: -45, icon: '↩️', action: () => openRadialMenu('main'), color: 'btn-back' },
        { angle: 45, icon: '🔓', action: () => openBottomBar('connect'), color: '' },
        { angle: 135, icon: '💬', action: () => openBottomBar('message'), color: '' }
    ],
    settings: [
        { angle: 135, icon: '↩️', action: () => openRadialMenu('main'), color: 'btn-back' },
        { angle: 45, icon: '🏷️', action: () => { nameInputContainer.style.display = 'block'; closeRadialMenu(); }, color: '' }
    ]
};

window.openRadialMenu = (viewId) => {
    closeBottomBar();
    radialContainer.innerHTML = '';
    const nodes = radialMenuData[viewId];
    if (!nodes) return;
    nodes.forEach((node, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'radial-btn-wrapper';
        wrapper.style.transform = `rotate(${node.angle}deg) translateY(-${RADIAL_RADIUS}px) rotate(${-node.angle}deg)`;
        const btn = document.createElement('button');
        btn.className = `radial-btn ${node.color}`;
        btn.innerText = node.icon;
        btn.onclick = node.action;
        wrapper.appendChild(btn);
        radialContainer.appendChild(wrapper);
        setTimeout(() => wrapper.classList.add('active'), 10 + index * 50);
    });
};

window.closeRadialMenu = () => { radialContainer.innerHTML = ''; };

window.openBottomBar = (mode) => {
    closeRadialMenu();
    const input = document.getElementById('dynamic-input');
    const btn = document.getElementById('dynamic-btn');
    bottomBar.classList.add('visible');
    input.value = '';
    if (mode === 'connect') {
        input.placeholder = 'Partner Code (4 Digits)';
        btn.innerText = window.isPartnerConnected ? 'DISCONNECT' : 'LINK';
        btn.onclick = () => window.isPartnerConnected ? window.disconnectBuddy() : window.requestConnectionUI(input.value);
    } else {
        input.placeholder = 'Type a message...';
        btn.innerText = 'SEND';
        btn.onclick = () => window.sendMessageUI(input.value);
    }
    setTimeout(() => input.focus(), 150);
};

window.closeBottomBar = () => { bottomBar.classList.remove('visible'); };

// --- Customizations ---
window.applyColor = (c1, c2) => {
    document.documentElement.style.setProperty('--buddy-c1', c1);
    document.documentElement.style.setProperty('--buddy-c2', c2);
    localStorage.setItem('buddy-color', JSON.stringify({ c1, c2 }));
};

window.applyHat = (hatStr) => {
    const emojiSpan = document.getElementById('emoji-hat-span');
    const cssCowboyHat = document.getElementById('css-cowboy-hat');
    
    if (emojiSpan && cssCowboyHat) {
        // Reset everything first
        emojiSpan.innerText = '';
        cssCowboyHat.style.display = 'none';

        if (hatStr === 'none') {
            // Stay empty
        } else if (hatStr === 'cowboy') {
            cssCowboyHat.style.display = 'block';
        } else {
            emojiSpan.innerText = hatStr;
        }
    }
    localStorage.setItem('buddy-hat', hatStr);
};

window.applyShape = (shape) => {
    if (!buddy) return;
    buddy.classList.remove('shape-circle', 'shape-square', 'shape-triangle');
    if (shape !== 'default') buddy.classList.add(`shape-${shape}`);
    localStorage.setItem('buddy-shape', shape);
};

// --- STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
    const buddyColor = JSON.parse(localStorage.getItem('buddy-color')) || { c1: '#6c5ce7', c2: '#a29bfe' };
    const buddyHat = localStorage.getItem('buddy-hat') || 'none';
    const buddyShape = localStorage.getItem('buddy-shape') || 'default';
    window.applyColor(buddyColor.c1, buddyColor.c2);
    window.applyHat(buddyHat);
    window.applyShape(buddyShape);
    speak("Hello! Just waking up...");
    setTimeout(initFirebase, 2000);
});
