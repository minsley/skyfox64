# SkyFox64

StarFox64 inspired visualization of the Bluesky firehose. Pilot an Arwing and shoot at posts.

**🚀 Live Demo**: [https://star-hose-64.onrender.com](https://star-hose-64.onrender.com)

https://github.com/user-attachments/assets/4b2e186c-9b66-4433-9b23-eac6ae33e102

## Features

- Fly through a tunnel of realtime Bluesky posts
- Do a barrel roll, use the boost, you know the drill
- Watch your health, if crash into 3 posts it's game over

## Controls

- **WASD**: Move Arwing (W/S: up/down, A/D: left/right)
- **Shift**: Boost
- **Ctrl**: Brake
- **Space** or **Left Click**: Fire lasers
- **AA/DD**: Barrel roll (double-tap A or D)

## How it works

- React + TypeScript frontend with Vite build system
- Node.js server serves static files and acts as WebSocket relay
- Connects to Bluesky's Jetstream API and forwards messages to frontend clients
- 3D visualization using Babylon.js
- Interactive flight controls and shooting mechanics

## How 2 Dev

1. Install dependencies:
```bash
npm install
```

2. Build the React app:
```bash
npm run build
```

3. Start the server:
```bash
npm start
```

4. Open http://localhost:3000

## Deployment

Deploy to any Node.js hosting platform:
- Set `NODE_ENV=production`
- Run `npm run build && npm start`

## Credits

- Forked from theo.io's firehose visualizer on [github](https://github.com/theosanderson/firehose/)
- Arwing model by spencer.psi0918 on [SKetchFab](https://skfb.ly/opNnG)

