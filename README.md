# 🔴 Chain Reaction — Multiplayer

A fully online 2–5 player **Chain Reaction** game with a WebSocket server and a standalone HTML client.

---

## 📦 What's Inside

```
chain-reaction/
├── server/
│   ├── server.js        ← Node.js WebSocket game server
│   └── package.json
└── client/
    └── index.html       ← Standalone game client (open in any browser)
```

---

## 🕹️ Game Rules

- Players take turns placing orbs on a 9×6 grid.
- Each cell has a **critical mass** based on its position:
  - **Corner** cells: 2 orbs
  - **Edge** cells: 3 orbs
  - **Inner** cells: 4 orbs
- When a cell reaches its critical mass it **explodes**, sending one orb to each neighbor — converting those cells to your color.
- Chain reactions can cascade across the board.
- A player is **eliminated** when all their orbs are captured.
- **Last player with orbs on the board wins.**

---

## 🚀 Quick Start (Local)

### 1. Install & run the server

```bash
cd server
npm install
npm start
```

The server runs on `ws://localhost:8080`.

### 2. Open the client

Just open `client/index.html` in your browser — no build step needed.

### 3. Play

1. Make sure the server URL at the top of the page says `ws://localhost:8080` and click **Connect**
2. Player 1: Enter your name, choose player count, click **Create Room**
3. Share the **5-letter room code** with friends
4. Friends: Open `index.html`, connect to the same server, enter their name + the room code, click **Join Room**
5. Host clicks **Start Game** when everyone is in

---

## 🌐 Online Deployment (Play With Friends Anywhere)

To play with friends over the internet, you need to host the server somewhere public.

---

### Option A — Render.com (Free, Recommended)

1. Create a free account at https://render.com
2. Click **New → Web Service**
3. Connect your GitHub repo (push the `server/` folder there), OR use the **Manual Deploy** option
4. Settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Port:** `8080`
5. After deploy, Render gives you a URL like `https://my-chain-reaction.onrender.com`
6. In the client, set the server URL to: `wss://my-chain-reaction.onrender.com`
   - Note: `wss://` (secure) instead of `ws://` for HTTPS-served pages

> ⚠️ Free Render services sleep after 15 min of inactivity. First connect may take ~30 seconds to wake up.

---

### Option B — Railway.app (Free Tier, Fast)

1. Go to https://railway.app and sign in with GitHub
2. **New Project → Deploy from GitHub Repo** (push the `server/` folder)
3. Railway auto-detects Node.js and deploys it
4. Under **Settings → Networking**, expose port `8080` and get your public URL
5. Use `wss://your-app.up.railway.app` in the client

---

### Option C — Fly.io (Free, More Control)

```bash
cd server
npm install -g flyctl
fly auth signup
fly launch      # follow prompts, set port 8080
fly deploy
```

You'll get a URL like `wss://chain-reaction.fly.dev`

---

### Option D — VPS / DigitalOcean / AWS

If you have a VPS:

```bash
# On your server
git clone <your-repo>
cd chain-reaction/server
npm install
node server.js &    # or use PM2

# Open port 8080 in your firewall
ufw allow 8080
```

Players connect to `ws://YOUR_SERVER_IP:8080`

For HTTPS/WSS, put Nginx in front with a Let's Encrypt cert and proxy to 8080.

---

## 🔗 Sharing With Friends

Once your server is deployed:

1. Send friends the `client/index.html` file  
   **OR** host it for free on GitHub Pages / Netlify / Vercel (drag & drop the file)

2. Tell them to set the Server URL to your deployed server address

3. You create a room, share the 5-letter code, they join — done!

---

## 🎨 Player Colors

| Player | Color        |
|--------|-------------|
| 1      | 🔵 Blue     |
| 2      | 🟡 Yellow   |
| 3      | 🟢 Green    |
| 4      | 🔴 Red      |
| 5      | 🩵 Bright Teal |

---

## 🛠️ Configuration

In `server/server.js`, you can change:

```js
const PORT = process.env.PORT || 8080;  // Change port
const GRID_ROWS = 9;                     // Grid height
const GRID_COLS = 6;                     // Grid width
```

---

## 📋 Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot reach server" | Make sure `npm start` is running and the URL in the client matches |
| "Room not found" | Double-check the 5-letter code (case-insensitive) |
| WSS errors in browser | Use `wss://` if your server is behind HTTPS |
| Game won't start | Need at least 2 players in the lobby |
| Free tier sleeping | Wait ~30s for the server to wake up on first connect |

---

## 🔧 Tech Stack

- **Server:** Node.js + `ws` WebSocket library (zero dependencies beyond that)
- **Client:** Vanilla HTML/CSS/JS — single file, no framework, no build tools
- **Protocol:** Custom JSON messages over WebSocket
