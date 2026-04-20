const { ipcRenderer } = require('electron');

// --- FIREBASE CONFIGURATION ---
// PASTE YOUR FIREBASE CONFIG HERE
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// --- APP LOGIC ---

const bubble = document.getElementById('buddy-bubble');
const text = document.getElementById('buddy-text');
const mouth = document.getElementById('buddy-mouth');
const buddy = document.getElementById('main-buddy');

// Function to make buddy speak
function speak(message, duration = 3000) {
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

// Function to move buddy (relative to its container or window)
// Since we are in a small window, we can also move the window itself using IPC
// But for now, let's just animate within the 300x300 space or use IPC
function moveWindow(x, y) {
    // Current behavior: just small internal movement for effect
    buddy.style.transform = `translate(${x}px, ${y}px)`;
}

// Initial Greeting
setTimeout(() => {
    speak("Hello! I'm ready to help you learn!");
}, 1000);

// --- FIREBASE INITIALIZATION (Optional - will fail until config provided) ---
try {
    const firebase = require('firebase/app');
    require('firebase/firestore');

    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        // Listen for tutor commands
        // Room ID could be hardcoded or passed as a param
        const roomId = "hackathon-room-001"; 
        
        db.collection("rooms").doc(roomId).onSnapshot((doc) => {
            const data = doc.data();
            if (data) {
                if (data.lastMessage) {
                    speak(data.lastMessage);
                }
                if (data.position) {
                    // Logically, we would move the window here
                    // ipcRenderer.send('move-buddy', data.position);
                }
            }
        });
    } else {
        console.warn("Firebase not configured. Using local/mock mode.");
    }
} catch (e) {
    console.error("Firebase error:", e.message);
}

// Handle mouse transparency
// When mouse enters the buddy, we want to capture clicks.
// When it's in the transparent area, we want to ignore them.
buddy.addEventListener('mouseenter', () => {
    ipcRenderer.send('set-ignore-mouse-events', false);
});

bubble.addEventListener('mouseenter', () => {
    ipcRenderer.send('set-ignore-mouse-events', false);
});

window.addEventListener('mousemove', (e) => {
    // If the mouse is NOT over the buddy or bubble, set ignore true
    const overBuddy = document.elementFromPoint(e.clientX, e.clientY) === buddy || buddy.contains(document.elementFromPoint(e.clientX, e.clientY));
    const overBubble = document.elementFromPoint(e.clientX, e.clientY) === bubble || bubble.contains(document.elementFromPoint(e.clientX, e.clientY));
    
    if (!overBuddy && !overBubble) {
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    } else {
        ipcRenderer.send('set-ignore-mouse-events', false);
    }
});
