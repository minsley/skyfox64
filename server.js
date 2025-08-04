import express from 'express';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the built React app
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server for relay
const wss = new WebSocketServer({ server });

const JETSTREAM_URL = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const connectedClients = new Set();
let jetstreamConnection = null;

// Function to connect to Jetstream and forward messages
function connectToJetstream() {
  console.log('Connecting to Jetstream...');
  jetstreamConnection = new WebSocket(JETSTREAM_URL);
  
  jetstreamConnection.on('open', () => {
    console.log('Connected to Jetstream');
  });
  
  jetstreamConnection.on('message', (data) => {
    // Forward message to all connected clients
    connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    });
  });
  
  jetstreamConnection.on('close', () => {
    console.log('Jetstream connection closed, reconnecting in 5s...');
    setTimeout(connectToJetstream, 5000);
  });
  
  jetstreamConnection.on('error', (error) => {
    console.error('Jetstream error:', error);
  });
}

// Handle client WebSocket connections
wss.on('connection', (ws) => {
  connectedClients.add(ws);
  console.log(`Client connected. Total clients: ${connectedClients.size}`);
  
  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log(`Client disconnected. Total clients: ${connectedClients.size}`);
  });
  
  ws.on('error', (error) => {
    console.error('Client WebSocket error:', error);
    connectedClients.delete(ws);
  });
});

// Start Jetstream connection
connectToJetstream();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    clients: connectedClients.size,
    jetstream: jetstreamConnection?.readyState === WebSocket.OPEN
  });
});