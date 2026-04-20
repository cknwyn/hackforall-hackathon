const { ipcRenderer } = require('electron');

// --- 1. CORE UI ELEMENTS ---
const bubble = document.getElementById('buddy-bubble');
const text = document.getElementById('buddy-text');
const mouth = document.getElementById('buddy-mouth');
const buddy = document.getElementById('main-buddy');
const overlay = document.getElementById('connect-overlay');
const idBadge = document.getElementById('id-badge');
const nameInputContainer = document.getElementById('name-input-container');
const nameInput = document.getElementById('buddy-name-input');

// --- 2. GLOBAL STATE ---
let db = null;
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
let mouseX, mouseY;

if (buddy) {
    buddy.addEventListener('mousedown', (e) => {
        isDragging = true;
        mouseX = e.clientX;
        mouseY = e.clientY;
        ipcRenderer.send('set-ignore-mouse-events', false);
    });
}

window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        ipcRenderer.send('move-window', e.clientX - mouseX, e.clientY - mouseY);
        return;
    }
    
    // Check if mouse is over UI elements
    const overBuddy = buddy && (document.elementFromPoint(e.clientX, e.clientY) === buddy || buddy.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overBubble = bubble && (document.elementFromPoint(e.clientX, e.clientY) === bubble || bubble.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const overBadge = idBadge && (document.elementFromPoint(e.clientX, e.clientY) === idBadge || idBadge.contains(document.elementFromPoint(e.clientX, e.clientY)));
    const isOverlayVisible = overlay && overlay.classList.contains('visible');

    if (!overBuddy && !overBubble && !overBadge && !isOverlayVisible) {
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    } else {
        ipcRenderer.send('set-ignore-mouse-events', false);
    }
});

// Wander Mode
setInterval(() => {
    if (isDragging || (overlay && overlay.classList.contains('visible'))) return;
    ipcRenderer.send('move-window', (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
}, 10000);

// --- 5. FIREBASE INITIALIZATION (SAFE MODE) ---
async function initFirebase() {
    updateStatus("Loading Bridge...");
    
    try {
        // Use global 'firebase' from the CDN script
        if (typeof firebase === 'undefined') {
            throw new Error("Firebase CDN scripts failed to load.");
        }

        const firebaseConfig = {
          apiKey: "YOUR_API_KEY",
          authDomain: "YOUR_AUTH_DOMAIN",
          projectId: "YOUR_PROJECT_ID",
          storageBucket: "YOUR_STORAGE_BUCKET",
          messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
          appId: "YOUR_APP_ID",
          measurementId: "YOUR_MEASUREMENT_ID"
        };

        updateStatus("Connecting DB...");
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();

        updateStatus("Ready!");
        setTimeout(finishLoading, 1000);
        
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

        if (data.requestConnect && data.status !== "connected") {
            overlay.classList.add('visible');
        } else if (data.status === "connected") {
            overlay.classList.remove('visible');
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
    } else if (cmd.type === 'move') {
        ipcRenderer.send('move-window', cmd.x, cmd.y);
    }
}

window.acceptTutor = () => {
    db.collection("rooms").doc(roomId).update({ status: "connected", requestConnect: false });
    overlay.classList.remove('visible');
    speak("Awesome! Let's get to work.");
};

window.rejectTutor = () => {
    db.collection("rooms").doc(roomId).update({ status: "idle", requestConnect: false });
    overlay.classList.remove('visible');
};

// --- STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
    speak("Hello! Just waking up...");
    initFirebase();
});
