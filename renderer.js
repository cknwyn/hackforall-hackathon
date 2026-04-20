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
const antenna = document.querySelector('.antenna'); 
const infoName = document.getElementById('info-name-display');
const infoCode = document.getElementById('info-code-display');
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
let isDead = false;
let distractionStartTime = null;
const roomId = "hack-" + Math.floor(1000 + Math.random() * 9000);

// --- 2.1 TTS STATE ---
let voices = [];
let selectedVoice = null;
let voicePreference = localStorage.getItem('buddy-voice-pref') || 'male';
let voiceVolume = parseFloat(localStorage.getItem('buddy-voice-volume')) || 1.0;

function initTTS() {
    const loadVoices = () => {
        voices = window.speechSynthesis.getVoices();
        updateSelectedVoice();
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
}

function updateSelectedVoice() {
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));
    const maleCandidates = ['david', 'mark', 'george', 'male', 'james', 'microsoft david'];
    const femaleCandidates = ['zira', 'hazel', 'susan', 'female', 'linda', 'microsoft zira'];

    const maleVoices = englishVoices.filter(v => maleCandidates.some(c => v.name.toLowerCase().includes(c)));
    const femaleVoices = englishVoices.filter(v => femaleCandidates.some(c => v.name.toLowerCase().includes(c)));

    if (voicePreference === 'male' && maleVoices.length > 0) {
        selectedVoice = maleVoices[0];
    } else if (voicePreference === 'female' && femaleVoices.length > 0) {
        selectedVoice = femaleVoices[0];
    } else {
        selectedVoice = englishVoices[0]; // Fallback
    }
}

window.toggleVoicePreference = () => {
    voicePreference = voicePreference === 'male' ? 'female' : 'male';
    localStorage.setItem('buddy-voice-pref', voicePreference);
    updateSelectedVoice();
    speak(`Voice updated to ${voicePreference}!`);
};

function speakVerbal(message) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.volume = voiceVolume;

    utterance.onstart = () => {
        if (mouth) {
            mouth.style.height = '15px';
            mouth.style.borderRadius = '50%';
            mouth.style.background = '#ff7675';
        }
    };

    utterance.onend = () => {
        if (mouth) {
            mouth.style.height = '5px';
            mouth.style.borderRadius = '10px';
            mouth.style.background = '#fff';
        }
    };

    window.speechSynthesis.speak(utterance);
}

// --- 3. BASIC BUDDY FUNCTIONS ---
function speak(message, duration = 3000) {
    console.log("Buddy says:", message);
    if (!text || !bubble || !mouth) return;
    
    text.innerText = message;
    bubble.classList.add('visible');

    // Trigger verbal output
    speakVerbal(message);

    setTimeout(() => {
        bubble.classList.remove('visible');
    }, duration);
}

function updateStatus(status) {
    // Legacy support, also useful for hidden badge
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
    if (infoName) infoName.innerText = buddyName;
    if (infoCode) infoCode.innerText = roomId.replace('hack-', '');
}

window.flipBuddy = (e) => {
    if (e) e.stopPropagation();
    if (buddy) {
        buddy.classList.toggle('flipped');
        
        const isFlipped = buddy.classList.contains('flipped');
        const front = buddy.querySelector('.buddy-face.front');
        const back = buddy.querySelector('.buddy-face.back');
        
        // Reinforce backface-visibility for shapes like triangles that break 3D rendering
        if (front) front.style.opacity = isFlipped ? '0' : '1';
        if (back) back.style.opacity = isFlipped ? '1' : '0';

        if (isFlipped) {
             closeRadialMenu();
             closeBottomBar();
        }
    }
};

window.toggleNameInput = () => {
    if (nameInputContainer) {
        const isHidden = nameInputContainer.style.display === 'none' || !nameInputContainer.style.display;
        nameInputContainer.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            nameInput.value = buddyName;
            setTimeout(() => nameInput.focus(), 50);
        }
    }
};

window.saveBuddyName = () => {
    const newName = nameInput.value.trim();
    if (newName) {
        buddyName = newName;
        localStorage.setItem('buddy-name', buddyName);
        finishLoading();
        nameInputContainer.style.display = 'none';
        speak(`My name is now ${buddyName}!`);
    }
};

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
        if (isDead) return;
        window.openRadialMenu('main');
    });
}

function die() {
    if (isDead) return;
    isDead = true;
    buddy.classList.add('dead');
    physicsAnimator.classList.add('dead'); // For stopping animation
    speak("I couldn't handle the distraction... I'm gone. Click me to revive me... if you care.");
    if (window.stopPomodoro) window.stopPomodoro();
}

function revive() {
    if (!isDead) return;
    isDead = false;
    buddy.classList.remove('dead');
    physicsAnimator.classList.remove('dead');
    distractionStartTime = null;
    speak("I'm back! Let's stay focused this time, okay?");
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
            if (isDead) {
                revive();
            } else {
                window.openRadialMenu('main');
            }
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

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overBuddy = buddy && (el === buddy || buddy.contains(el));
    const overAntenna = el && (el.classList.contains('antenna') || el.classList.contains('antenna-tip'));
    const overBadge = idBadge && (el === idBadge || idBadge.contains(el));
    const overNameInput = nameInputContainer && (el === nameInputContainer || nameInputContainer.contains(el));
    const overRadial = radialContainer && (el === radialContainer || radialContainer.contains(el));
    const overBottomBar = bottomBar && (el === bottomBar || bottomBar.contains(el));
    const overPhysics = physicsAnimator && (el === physicsAnimator || physicsAnimator.contains(el));
    const isOverlayVisible = overlay && overlay.classList.contains('visible');
    const overRadialBtn = el && el.closest('.radial-btn');
    const overInput = el && (el.tagName === 'INPUT' || el.tagName === 'BUTTON');

    if (!overBuddy && !overAntenna && !overBadge && !overNameInput && !overRadial && !overBottomBar && !isOverlayVisible && !overRadialBtn && !overInput && !overPhysics) {
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    } else {
        ipcRenderer.send('set-ignore-mouse-events', false);
    }
});

// --- 5. FIREBASE INITIALIZATION ---
async function initFirebase() {
    updateStatus("Connecting...");
    try {
        if (typeof firebase === 'undefined') {
            throw new Error("Firebase CDN scripts failed to load.");
        }

        let firebaseConfig;
        try {
            firebaseConfig = require('./firebase-config.js');
        } catch(e) {
            // Fallback to hardcoded dev config if file is missing
            firebaseConfig = {
                apiKey: "AIzaSyDlz91QUyZ3u5jIOBvuL3FeNW-F3fcdi1Y",
                authDomain: "hackforall-hackathon.firebaseapp.com",
                projectId: "hackforall-hackathon",
                storageBucket: "hackforall-hackathon.firebasestorage.app",
                messagingSenderId: "391540276748",
                appId: "1:391540276748:web:8dd22d1a98684e8b647829",
                measurementId: "G-L2N5PZC4R5"
            };
        }

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
        { angle: -135, icon: '🔄', action: () => window.flipBuddy(), color: 'btn-back' },
        { angle: 180, icon: '❌', action: () => closeRadialMenu(), color: 'btn-close' }
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
        { angle: 90, icon: '🤠', action: () => { applyHat('cowboy'); closeRadialMenu(); }, color: 'btn-yellow' },
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
        { angle: 45, icon: '⏱️', action: () => openRadialMenu('pomodoro'), color: '' },
        { angle: -45, icon: '🗣️', action: () => { window.toggleVoicePreference(); closeRadialMenu(); }, color: 'btn-sky' },
        { angle: 0, icon: '🔊', action: () => openBottomBar('volume'), color: 'btn-mint' }
    ],
    pomodoro: [
        { angle: 135, icon: '↩️', action: () => openRadialMenu('settings'), color: 'btn-back' },
        { angle: 45, icon: '🍅', action: () => { window.startPomodoro(25); closeRadialMenu(); }, color: 'btn-fire' },
        { angle: -45, icon: '☕', action: () => { window.startPomodoro(5); closeRadialMenu(); }, color: 'btn-sky' },
        { angle: 0, icon: '⏹️', action: () => { window.stopPomodoro(); closeRadialMenu(); }, color: '' }
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
    const slider = document.getElementById('volume-slider');
    const label = document.getElementById('bar-label');
    const btn = document.getElementById('dynamic-btn');
    const statusDot = document.getElementById('partner-status');

    bottomBar.classList.add('visible');
    input.value = '';
    
    // Default visibility
    input.style.display = 'block';
    slider.style.display = 'none';
    label.style.display = 'none';
    statusDot.style.display = 'none';

    if (mode === 'connect') {
        input.placeholder = 'Partner Code (4 Digits)';
        btn.innerText = window.isPartnerConnected ? 'DISCONNECT' : 'LINK';
        btn.onclick = () => window.isPartnerConnected ? window.disconnectBuddy() : window.requestConnectionUI(input.value);
    } else if (mode === 'message') {
        input.placeholder = 'Type a message...';
        btn.innerText = 'SEND';
        btn.onclick = () => window.sendMessageUI(input.value);
    } else if (mode === 'volume') {
        input.style.display = 'none';
        slider.style.display = 'block';
        label.style.display = 'block';
        label.innerText = 'VOL';
        slider.value = voiceVolume;
        btn.innerText = 'OK';
        btn.onclick = () => {
             voiceVolume = parseFloat(slider.value);
             localStorage.setItem('buddy-voice-volume', voiceVolume);
             speak(`Volume: ${Math.round(voiceVolume * 100)}%`);
             closeBottomBar();
        };
        slider.oninput = () => { voiceVolume = parseFloat(slider.value); };
    }
    input.onkeypress = (e) => { if (e.key === 'Enter') btn.click(); };
    if (mode !== 'volume') setTimeout(() => input.focus(), 150);
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
    const faces = buddy.querySelectorAll('.buddy-face');
    buddy.classList.remove('shape-circle', 'shape-square', 'shape-triangle');
    faces.forEach(f => f.classList.remove('shape-circle', 'shape-square', 'shape-triangle'));
    
    if (shape !== 'default') {
        buddy.classList.add(`shape-${shape}`);
        faces.forEach(f => f.classList.add(`shape-${shape}`));
    }
    localStorage.setItem('buddy-shape', shape);
};

// --- 6. DISTRACTION WATCHDOG LISTENER ---
let lastWarningSpeakTime = 0;
let distractionHeartbeat;

ipcRenderer.on('distraction-state', (event, isDistracted, appName, isForeground) => {
    if (isDistracted) {
        if (buddy) {
            if (isForeground) {
                if (!buddy.classList.contains('angry')) {
                    speakVerbal("Hey!"); 
                }
                buddy.classList.remove('suspicious');
                buddy.classList.add('angry');
            } else {
                buddy.classList.remove('angry');
                buddy.classList.add('suspicious');
            }

            // --- 6.1 DEATH TIMER LOGIC ---
            if (!isDead) {
                if (!distractionStartTime) {
                    distractionStartTime = Date.now();
                } else {
                    const elapsed = Date.now() - distractionStartTime;
                    if (elapsed > 60000) {
                        die();
                    }
                }
            }
        }

        clearTimeout(distractionHeartbeat);
        distractionHeartbeat = setTimeout(() => {
            if (buddy) buddy.classList.remove('angry');
        }, 4000);
    } else {
        if (buddy) buddy.classList.remove('angry');
    }
});

ipcRenderer.on('trigger-distraction-warning', (event, appName, isForeground) => {
    const now = Date.now();
    if (now - lastWarningSpeakTime > 30000) {
        let warnings = [];
        if (isForeground) {
            warnings = [
                `Hey! Get off ${appName} and get back to work!`,
                `I see you looking at ${appName}... Focus!`,
                `Eyes on the code, not on ${appName}! 😠`
            ];
        } else {
            warnings = [
                `I see ${appName} running on the side... No cheating!`,
                `Is that ${appName} I see on your other monitor? 🤨`,
                `You might be focused here, but ${appName} is still there. Close it!`,
                `I smell ${appName} in the background. Don't think I can't see it!`
            ];
        }
        const randomWarning = warnings[Math.floor(Math.random() * warnings.length)];
        speak(randomWarning, 4000);
        lastWarningSpeakTime = now;
    }
});

// --- STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
    initTTS();
    const buddyColor = JSON.parse(localStorage.getItem('buddy-color')) || { c1: '#6c5ce7', c2: '#a29bfe' };
    const buddyHat = localStorage.getItem('buddy-hat') || 'none';
    const buddyShape = localStorage.getItem('buddy-shape') || 'default';
    window.applyColor(buddyColor.c1, buddyColor.c2);
    window.applyHat(buddyHat);
    window.applyShape(buddyShape);
    speak("Hello! Just waking up...");
    setTimeout(initFirebase, 2000);
});
// --- POMODORO TIMER ENGINE ---
let pomodoroInterval = null;
let pomodoroTimeLeft = 0;
const timerOverlay = document.getElementById('timer-overlay');

window.startPomodoro = (minutes) => {
    window.stopPomodoro();
    pomodoroTimeLeft = minutes * 60;
    
    timerOverlay.style.display = 'block';
    updateTimerDisplay();
    
    speak(`Starting a ${minutes} minute session. You got this!`);
    
    pomodoroInterval = setInterval(() => {
        pomodoroTimeLeft--;
        updateTimerDisplay();
        
        if (pomodoroTimeLeft <= 10) {
            timerOverlay.classList.add('pulse');
        } else {
            timerOverlay.classList.remove('pulse');
        }
        
        if (pomodoroTimeLeft <= 0) {
            window.stopPomodoro();
            timerOverlay.style.display = 'block';
            timerOverlay.innerText = "DONE!";
            speak("Time is up! Great work.");
            if (buddy) buddy.classList.add('angry'); // Re-use wiggle/pulse animation
            setTimeout(() => {
                if (buddy) buddy.classList.remove('angry');
                timerOverlay.style.display = 'none';
            }, 5000);
        }
    }, 1000);
};

window.stopPomodoro = () => {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    timerOverlay.style.display = 'none';
    timerOverlay.classList.remove('pulse');
};

function updateTimerDisplay() {
    const mins = Math.floor(pomodoroTimeLeft / 60);
    const secs = pomodoroTimeLeft % 60;
    timerOverlay.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
}
