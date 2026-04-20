# Buddy Tutor - HackForAll Hackathon

Buddy Tutor is a real-time collaborative tool designed to assist students through an interactive Electron-based "Buddy" character and a web-based Tutor Dashboard.

## 🚀 Getting Started (Plug and Play)

To get this project running on your own machine, follow these steps:

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A [Firebase Project](https://console.firebase.google.com/)

### 2. Firebase Setup
1. Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Cloud Firestore** in the project.
3. In Project Settings, create a **Web App** to get your configuration credentials.

### 3. Local Configuration
This project uses a template system to keep your API keys secure.
1. **For Electron**: Copy `firebase-config.js.example` to `firebase-config.js` in the root directory and add your keys.
2. **For Dashboard**: Copy `public/firebase-config.js.example` to `public/firebase-config.js` and add your keys.

*Note: These files are automatically ignored by Git to prevent your keys from leaking!*

### 4. Installation
```bash
npm install
```

---

## 💻 Running the Applications

### Student Buddy (Electron App)
The Student Buddy is a floating, transparent character that stays on top of other windows.
```bash
npm start
```

### Tutor Dashboard (Local testing)
You can open `public/index.html` directly in your browser or use a local server to test the dashboard.

---

## 🌐 Deployment

To deploy the Tutor Dashboard to the web using Firebase Hosting:

1. Install Firebase Tools (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```
2. Login to Firebase:
   ```bash
   npx firebase login
   ```
3. Initialize (one-time setup):
   ```bash
   npx firebase init hosting
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```

## 🛠 Tech Stack
- **Frontend**: HTML5, Vanilla CSS, JavaScript
- **Backend/Real-time**: Firebase Firestore
- **Desktop Wrapper**: Electron

---
*Created for the HackForAll Hackathon.*
