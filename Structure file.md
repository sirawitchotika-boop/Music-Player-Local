# Project Architecture & Dependency Matrix

## 1. Project Overview & Architecture
- Description: Premium Local Music Player เล่นเพลงจากไฟล์ในเครื่องโดยตรง พร้อม 10-Band EQ, Soft Limiter, Sleep Timer, Visualizer และ Playlist/Favorites
- Tech Stack: HTML5, CSS3, Vanilla JavaScript (ES6 Modules), Web Audio API, IndexedDB, LocalStorage

## 2. Directory Tree
/ (Root)
├── index.html
├── css/
│   ├── eq.css
│   ├── main.css
│   ├── player.css
│   ├── playlist.css
│   └── timer.css
└── js/
    ├── app.js
    ├── core/
    │   ├── audioEffect.js
    │   ├── audioEngine.js
    │   ├── stateManager.js
    │   └── storage.js
    └── ui/
        ├── eqUI.js
        ├── modalUI.js
        ├── playerUI.js
        ├── playlistUI.js
        └── timerUI.js
