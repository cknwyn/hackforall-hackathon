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
const controlPanel = document.getElementById('control-panel');
const partnerCodeInput = document.getElementById('partner-code-input');
const connectBtn = document.getElementById('connect-btn');
const buddyMsgInput = document.getElementById('buddy-msg-input');
const partnerStatus = document.getElementById('partner-status');
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

if (buddy) {
    buddy.addEventListener('pointerdown', (e) => {
        isDragging = true;
        dragOffsetX = e.clientX;
        dragOffsetY = e.clientY;
        buddy.setPointerCapture(e.pointerId);
        ipcRenderer.send('set-ignore-mouse-events', false);
    });

    // Double click to toggle menu
    buddy.addEventListener('dblclick', () => {
        controlPanel.classList.toggle('visible');
        if (controlPanel.classList.contains('visible')) {
            speak("How can I help?");
        }
    });
}

window.addEventListener('pointerup', (e) => {
    if (isDragging) {
        isDragging = false;
        if (buddy && buddy.hasPointerCapture(e.pointerId)) {
            buddy.releasePointerCapture(e.pointerId);
        }
    }
});
window.addEventListener('pointermove', (e) => {
    if (isDragging) {
        ipcRenderer.send('move-window-absolute', e.screenX - dragOffsetX, e.screenY - dragOffsetY);
        return;
    }

    // Check if mouse is over UI elements
    const overBuddy = buddy && (document.elementFromPoint(e.clientX, e.clientY) === buddy || buddy.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overBubble = bubble && (document.elementFromPoint(e.clientX, e.clientY) === bubble || bubble.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overBadge = idBadge && (document.elementFromPoint(e.clientX, e.clientY) === idBadge || idBadge.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overPanel = controlPanel && (document.elementFromPoint(e.clientX, e.clientY) === controlPanel || controlPanel.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const isOverlayVisible = overlay && overlay.classList.contains('visible');

    if (!overBuddy && !overBubble && !overBadge && !overPanel && !isOverlayVisible) {
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
            partnerStatus.classList.add('connected');

            // Integrate Disconnect into the button
            connectBtn.innerText = "Disconnect";
            connectBtn.disabled = false;
            connectBtn.onclick = () => window.disconnectBuddy();
            connectBtn.style.background = "#ff7675"; // Red for disconnect

            // QoL: Update badge text and style
            idBadge.innerText = "Connected 🟢";
            idBadge.style.color = '#00b894';
            idBadge.style.background = 'white';
            idBadge.style.opacity = '1';

            // QoL Tweak: Hide badge after 5 seconds for a cleaner look
            if (!window.badgeHideTimeout) {
                window.badgeHideTimeout = setTimeout(() => {
                    idBadge.style.opacity = '0';
                    idBadge.style.pointerEvents = 'none'; // Don't let it block clicks
                }, 5000);
            }

            // If they connected to US, we should know their room ID to talk back
            if (data.requesterCode && !partnerRoomId) {
                partnerRoomId = "hack-" + data.requesterCode;
                console.log("Partner room identified:", partnerRoomId);
            }
        } else if (data.status === "idle") {
            // QoL: Reset everything if we go back to idle
            overlay.classList.remove('visible');
            partnerStatus.classList.remove('connected');
            idBadge.style.display = 'block';
            idBadge.style.opacity = '1';
            idBadge.style.pointerEvents = 'auto';

            // Reset button to Connect mode
            connectBtn.innerText = "Connect";
            connectBtn.disabled = false;
            connectBtn.onclick = () => window.requestConnectionUI();
            connectBtn.style.background = "#6c5ce7"; // Original purple

            if (window.badgeHideTimeout) {
                clearTimeout(window.badgeHideTimeout);
                window.badgeHideTimeout = null;
            }
            finishLoading();
        } else {
            partnerStatus.classList.remove('connected');
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
    controlPanel.classList.remove('visible');
    finishLoading();
    speak("Disconnected. Time for a break!");
};


// --- 6. TUTOR/BUDDY SEND COMMANDS ---
window.requestConnectionUI = async () => {
    const friendCode = partnerCodeInput.value.trim();
    if (!friendCode || friendCode.length !== 4) {
        speak("Need a 4-digit code!");
        return;
    }

    partnerRoomId = "hack-" + friendCode;
    updateStatus("Connecting...");

    await db.collection("rooms").doc(partnerRoomId).set({
        requestConnect: true,
        requesterCode: roomId.replace('hack-', '') // Send our own code!
    }, { merge: true });

    speak("Request sent!");
    connectBtn.innerText = "Awaiting...";
    connectBtn.disabled = true;
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

window.sendMessageUI = async () => {
    if (!partnerRoomId) {
        speak("Connect first!");
        return;
    }

    const msg = buddyMsgInput.value;
    if (!msg) return;

    await db.collection("rooms").doc(partnerRoomId).set({
        lastMessage: msg,
        lastMessageTimestamp: Date.now(),
        status: "connected" // Ensure they stay connected
    }, { merge: true });

    buddyMsgInput.value = '';
};


// --- STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
    speak("Hello! Just waking up...");
    initFirebase();
});
