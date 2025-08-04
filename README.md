# Starhose64

The Bluesky firehose viewed in the style of a Windows 95 screensaver

## Quick Start

1. Install dependencies:
```bash
npm run install-deps
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

## Development

For frontend development with hot reload:
```bash
npm run dev
```

## How it works

- Single Node.js server serves static files and acts as WebSocket relay
- Connects to Bluesky's Jetstream API and forwards messages to frontend clients
- 3D visualization using Babylon.js renders posts as floating objects in space
- Health check available at `/health`

## Deployment

Deploy to any Node.js hosting platform (Vercel, Railway, Fly.io, etc.):
- Set `NODE_ENV=production`
- Run `npm run build && npm start`