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
const circularMenu = document.getElementById('circular-menu');
const btnPower = document.getElementById('btn-power');
const btnMinimize = document.getElementById('btn-minimize');

// Independent Dragging Logic
let totalMovement = 0;

function makeDraggable(el, dragHandle = el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    dragHandle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (e.target.closest('button, input, .color-option')) return;

        e = e || window.event;
        e.preventDefault();
        
        const rect = el.getBoundingClientRect();
        el.style.top = rect.top + "px";
        el.style.left = rect.left + "px";
        el.style.bottom = 'auto';
        el.style.right = 'auto';
        el.style.margin = '0';

        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        
        if (el === buddyScaler || el === buddy) {
            totalMovement = 0;
        }
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
        
        el.style.transform = el.style.transform.replace(/translate\(-50%, -50%\)/g, 'translate(0, 0)');
        if (el.classList.contains('buddy-scaler')) {
             el.style.transform = `scale(var(--buddy-scale))`;
        }

        totalMovement += Math.abs(pos1) + Math.abs(pos2);
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

const buddyScaler = document.querySelector('.buddy-scaler');
const settingsMenu = document.getElementById('settings-menu');
const warningOverlay = document.getElementById('warning-overlay');
const warningBox = document.querySelector('.warning-box');

makeDraggable(buddyScaler, buddy);
makeDraggable(bubble);
makeDraggable(settingsMenu);
makeDraggable(circularMenu);

// Toggle menu on buddy click
buddy.addEventListener('click', (e) => {
    if (totalMovement < 10) {
        circularMenu.classList.toggle('active');
    }
});

// Close app on power button click
btnPower.addEventListener('click', () => {
    window.close();
});

// Minimize app on minimize button click
if (btnMinimize) {
    btnMinimize.addEventListener('click', () => {
        ipcRenderer.send('minimize-app');
    });
}

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
function moveWindow(x, y) {
    buddy.style.transform = `translate(${x}px, ${y}px)`;
}

// Initial Greeting
setTimeout(() => {
    speak("Hello! I'm ready to help you learn!");
}, 1000);

// --- FIREBASE INITIALIZATION ---
try {
    const firebase = require('firebase/app');
    require('firebase/firestore');

    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();
        const roomId = "hackathon-room-001"; 
        
        db.collection("rooms").doc(roomId).onSnapshot((doc) => {
            const data = doc.data();
            if (data && data.lastMessage) {
                speak(data.lastMessage);
            }
        });
    }
} catch (e) {
    console.error("Firebase error:", e.message);
}

const btnSettings = document.getElementById('btn-settings');
const btnCloseX = document.getElementById('btn-close-x');
const scaleSlider = document.getElementById('scale-slider');
const colorOptions = document.querySelectorAll('.color-option');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const btnWarningCancel = document.getElementById('btn-warning-cancel');
const btnWarningClose = document.getElementById('btn-warning-close');

let savedSettings = { scale: 1, color: '#6c5ce7' };
let currentSettings = { scale: 1, color: '#6c5ce7' };

function updateBuddyUI(settings) {
    document.body.style.setProperty('--buddy-color', settings.color);
    document.body.style.setProperty('--buddy-scale', settings.scale);
}

function checkChanges() {
    const hasChanges = currentSettings.scale != savedSettings.scale || currentSettings.color != savedSettings.color;
    if (hasChanges) {
        btnSave.classList.remove('disabled');
        btnCancel.classList.remove('disabled');
    } else {
        btnSave.classList.add('disabled');
        btnCancel.classList.add('disabled');
    }
    return hasChanges;
}

btnSettings.addEventListener('click', () => {
    currentSettings = { ...savedSettings };
    scaleSlider.value = currentSettings.scale;
    colorOptions.forEach(opt => {
        if (opt.dataset.color === currentSettings.color) opt.classList.add('selected');
        else opt.classList.remove('selected');
    });
    updateBuddyUI(currentSettings);
    
    // Position settings menu above the buddy
    const buddyRect = buddy.getBoundingClientRect();
    settingsMenu.style.display = 'flex'; // Temporarily show to get dimensions
    const menuRect = settingsMenu.getBoundingClientRect();
    
    settingsMenu.style.left = (buddyRect.left + buddyRect.width / 2 - menuRect.width / 2) + "px";
    settingsMenu.style.top = (buddyRect.top - menuRect.height - 30) + "px";
    settingsMenu.style.bottom = 'auto';
    settingsMenu.style.right = 'auto';
    settingsMenu.style.margin = '0';
    
    settingsMenu.classList.add('active');
    circularMenu.classList.remove('active');
    checkChanges();
});

scaleSlider.addEventListener('input', (e) => {
    currentSettings.scale = e.target.value;
    updateBuddyUI(currentSettings);
    checkChanges();
});

colorOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        colorOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        currentSettings.color = opt.dataset.color;
        updateBuddyUI(currentSettings);
        checkChanges();
    });
});

btnSave.addEventListener('click', () => {
    if (btnSave.classList.contains('disabled')) return;
    savedSettings = { ...currentSettings };
    settingsMenu.classList.remove('active');
});

btnCancel.addEventListener('click', () => {
    if (btnCancel.classList.contains('disabled')) return;
    currentSettings = { ...savedSettings };
    updateBuddyUI(currentSettings);
    settingsMenu.classList.remove('active');
});

btnCloseX.addEventListener('click', () => {
    if (checkChanges()) {
        warningOverlay.style.display = 'flex';
    } else {
        settingsMenu.classList.remove('active');
    }
});

btnWarningCancel.addEventListener('click', () => {
    warningOverlay.style.display = 'none';
});

btnWarningClose.addEventListener('click', () => {
    currentSettings = { ...savedSettings };
    updateBuddyUI(currentSettings);
    warningOverlay.style.display = 'none';
    settingsMenu.classList.remove('active');
});

// Handle mouse transparency
let lastInteractiveTime = 0;
window.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    
    // Check if the element or any of its parents are interactive
    // For circular menu, only consider it interactive if the element under mouse is visible
    const isOverCircularMenu = el && el.closest('#circular-menu') && window.getComputedStyle(el).opacity !== '0';
    const isOverOtherInteractive = el && el.closest('#main-buddy, #buddy-bubble, #settings-menu, .warning-box');
    
    if (isOverCircularMenu || isOverOtherInteractive) {
        lastInteractiveTime = Date.now();
        ipcRenderer.send('set-ignore-mouse-events', false);
    } else if (Date.now() - lastInteractiveTime > 150) {
        // Only set to ignore if we haven't been over an interactive element for 150ms
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
});

// Extra safety: ensure we're interactive on mousedown if we were recently over something
window.addEventListener('mousedown', (e) => {
    if (Date.now() - lastInteractiveTime < 500) {
        ipcRenderer.send('set-ignore-mouse-events', false);
    }
});
