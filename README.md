# 🎤 DNM Karaoke — High-Fidelity Interactive Web Karaoke & Social Platform

> **Engineered with React 19, TypeScript, Vite, Web Audio SoundFont Synthesis, and a Real-Time Mobile QR Remote Queue.**  
> **Live Demo:** [https://portfolio-karaoke.vercel.app/](https://portfolio-karaoke.vercel.app/)

---

## 🌟 Overview & Architecture

DNM Karaoke is a full-featured, zero-latency karaoke web and desktop platform designed for seamless group entertainment and portfolio presentation. It features studio-grade MIDI SoundFont synthesis, an interactive party challenge engine, and instant smartphone remote control across local Wi-Fi without external cloud dependencies.

```
┌─────────────────────────────────────────────────────────────┐
│                       DNM Karaoke TV / PC                   │
│  React 19 + SCSS Glassmorphism + Web Audio Synth Engine     │
└──────────────────────────────┬──────────────────────────────┘
                               │  Local Wi-Fi / LAN
                               │  (HTTP / WebSockets / SSE)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Mobile Phone Remote (QR Scan)               │
│  Search 48,000+ Songs • Queue • Playback Controls • Dares   │
└─────────────────────────────────────────────────────────────┘
```

### 🚀 Key Technical Features & Engineering Highlights

- **Studio-Grade MIDI SoundFont Synthesis**: Real-time multi-track MIDI playback powered by SpessaSynth and the Web Audio API. Employs IndexedDB caching for the SoundFont engine (`mega.sf2`) for instant subsequent launches.
- **Browser-Based Voice Scoring & Lyric Tracking**: Real-time lyric synchronization with blanked-word challenges and fuzzy token distance evaluation for gamified scoring.
- **Real-Time Multi-Device Remote (QR Queue)**: Guests simply scan a QR code displayed on the screen with their smartphones to search songs, add to the live queue, reorder tracks, and trigger party actions across the local Wi-Fi network.
- **Multi-Threaded 48,000+ Song Search**: Offloads catalog filtering, debounced search, and normalization to a dedicated **Web Worker**, maintaining a silky smooth 60 FPS main thread UI.
- **Strict Separation of Concerns**: Clean modular architecture strictly dividing business/game logic (`src/logic/`) and presentation/components (`src/design/`).
- **Interactive Party Challenge Engine**: Turn-based party challenges, rule tracking, animated outcome carousels, and customizable game modes.
- **PWA & Native Desktop Delivery**: Supports full Progressive Web App (PWA) installation or packaging as a standalone native Windows installer via Electron + ASAR.

---

## 🎮 Game Modes

1. **Classic Karaoke Mode**
   - Turn-based singer rotation with queue management.
   - Blanked lyric challenges with automated microphone voice scoring or manual scoring.
   - Countdown timer overlays and custom song pool filtering.

2. **Dare & Party Mode**
   - Dynamic interactive dares drawn after every performance.
   - Group voting, immunity mechanics, and active party rule management.
   - Live synchronization with the mobile remote so players can respond to challenges from their phones.

3. **Social Party Mode**
   - Interactive randomized wheel and carousel mechanics.
   - Real-time penalty and score tracking across the entire player roster.

---

## 🚀 Quick Start (Windows)

### Option A: One-Click Launcher (Recommended)
1. **Unzip** the project folder to any standard directory (avoid restricted locations like `Program Files`).
2. Double-click **`Setup_And_Run.bat`**.
3. On the first run, the script will automatically:
   - Verify Node.js (v20.19+ or v22.12+ LTS) and install it if missing.
   - Install all project dependencies (`npm ci`).
   - Launch the local server and open **`http://localhost:5173`** in your browser.
4. Keep the terminal window open while playing. Close it or press `Ctrl+C` to stop.

*Subsequent launches skip installation and start instantly.*

### Option B: Developer Setup (Any OS)

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
# Accessible at http://localhost:5173

# 3. Production build
npm run build
npm run preview
```

---

## 📱 Mobile Remote Queue (Scan to Connect)

1. Connect your smartphone to the **same Wi-Fi network** as the host computer.
2. In the app, navigate to the **Song Queue / Mobile Remote** panel.
3. Scan the displayed **QR Code** using any mobile camera or browser.
4. If prompted on Windows, allow Node.js through the Windows Firewall for Private Networks.

---

## 📦 Building Standalone Desktop Installers

To package the application as a standalone Windows `.exe` installer (bundling the runtime, songs, and soundfonts with zero external dependencies):

```bash
npm run desktop:dist
```

The resulting setup installer (`DNM Karaoke Setup.exe`) will be generated in `../DNM Karaoke App`.

### Creating a Clean Shareable Source Zip
To create a clean distribution archive without `node_modules`, `dist`, or personal save files:
- Double-click **`Make_Share_Zip.bat`**.
- It creates `DNM Karaoke - Share.zip` ready to be sent to another computer.

---

## 📁 Repository Structure

```
├── public/
│   ├── songs/           # Song catalog metadata and dare configurations
│   ├── soundfont/       # Studio SoundFont instrument assets (mega.sf2)
│   └── Images/          # Dynamic SVG album artwork and visuals
├── src/
│   ├── logic/           # Core business logic & state
│   │   ├── constants/   # Curated song pools and dare rules
│   │   ├── desktop/     # Electron main and preload scripts
│   │   ├── hooks/       # React hooks (audio controls, state logic, progress)
│   │   ├── services/    # MIDI player, remote queue server, soundfont loader
│   │   ├── types/       # TypeScript interfaces and game state models
│   │   ├── utils/       # Alignment algorithms, shuffle logic, dare engines
│   │   └── workers/     # Web Worker background search & catalog indexing
│   └── design/          # Presentation layer & UI
│       ├── components/  # KaraokePlayer, QueuePanel, Scoreboard, DrinkWheel
│       ├── screens/     # GameArea, ModeSelection, MobileRemote
│       └── styles/      # SCSS variables, mixins, and design tokens
├── scripts/             # Build utilities, catalog generators, packaging
├── package.json         # Dependencies & scripts
└── vite.config.ts       # Vite & build configuration
```

---

## 🛠️ Tech Stack & Architecture

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite |
| **Styling & Design System** | SCSS Modules, CSS Custom Properties, Glassmorphism tokens |
| **Audio Synthesis & Engine** | SpessaSynth SoundFont Synthesizer, Web Audio API, IndexedDB Cache |
| **Performance & Search** | Web Workers (multi-threaded 48k+ catalog indexer) |
| **Multi-Device Networking** | Local HTTP & SSE / WebSockets Server, Dynamic QR Generation |
| **Desktop & Distribution** | Electron 45, ASAR archiving, NSIS Windows Installer |
| **Deployment** | Vercel (PWA Web Build), Windows Desktop (.exe) |

---

## 🔧 Troubleshooting

| Issue | Resolution |
|---|---|
| **Node.js installation fails** | Download and install Node.js LTS manually from [nodejs.org](https://nodejs.org), then rerun `Setup_And_Run.bat`. |
| **Port 5173 busy** | The launcher automatically resolves port conflicts; ensure previous browser tabs are closed. |
| **Phones cannot reach QR Queue** | Verify both devices are on the same Wi-Fi subnet and Windows Firewall allows Node.js on Private networks. |
| **No audio output** | Click once anywhere in the browser to unlock the browser AudioContext autoplay policy. |

---

## 📄 License & Attribution

Developed by **Diego Elliss Matela** as a portfolio project demonstrating modern full-stack web audio engineering, real-time networking, and responsive design systems.
