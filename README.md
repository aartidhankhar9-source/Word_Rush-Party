# Word Rush Party

A responsive Socket.IO word-scramble game for 2–4 players. Players join by nickname and room code, unscramble ten words, and earn more points for faster correct answers.

## Run locally
Requires Node.js 20+.
```bash
npm install
npm start
```
Open http://localhost:3000.

## Deploy publicly
Push the project folder to a GitHub repository. On Render, create a Web Service connected to that repository:
- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node
Render provides an HTTPS URL to share. No player login is required.

## What is implemented
- Socket.IO shared state, room codes, host-started match, 2–4 players
- Ten 25-second rounds, hints and shuffled letter tiles
- Server-side answer validation and speed-based scoring
- Live scoreboard, reveal screens, responsive UI
- Optional team mode assigns players to teams A/B

## Limitations / before public launch
- Team mode currently assigns team labels, but scoring and winner are individual. Team-total scoring is not yet implemented.
- Active rooms live in server memory and disappear on restart/redeploy. Run one server instance; use Redis + Socket.IO adapter for horizontal scaling.
- Reconnect attempts work while the server retains the room/player, but a full page refresh can create a new identity in some browser/network situations.
- Add rate limits, moderation and abuse protections before a large public launch.
