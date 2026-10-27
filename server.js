const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));

const rooms = new Map();
const ROUND_MS = 25000;
const TOTAL_ROUNDS = 10;
const WORDS = [
  ["PLANET","A world that orbits a star"],["WAFFLE","A breakfast food with little squares"],
  ["ROCKET","A vehicle that blasts into space"],["JUNGLE","A dense tropical forest"],
  ["PUZZLE","A brain teaser"],["BANANA","A yellow fruit monkeys are famous for"],
  ["CASTLE","A fortified home for royalty"],["GUITAR","A six-string musical instrument"],
  ["DRAGON","A mythical creature that may breathe fire"],["POCKET","A small pouch sewn into clothing"],
  ["CANDLE","Wax and a wick, often used for light"],["KITTEN","A young cat"],
  ["BUBBLE","A floating sphere made from soap"],["PIRATE","A sea-raider with a classic eye patch"],
  ["CLOUD","A fluffy thing floating in the sky"],["TIGER","A large striped wild cat"],
  ["ORANGE","A citrus fruit and a colour"],["ROBOT","A machine that can perform tasks"],
  ["GARDEN","A place where flowers and vegetables grow"],["SILVER","A shiny precious metal"]
];
const clean = s => String(s || "").replace(/[<>]/g, "").trim().replace(/\s+/g, " ").slice(0, 18) || "Player";
const makeCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;
  do { c = Array.from({length:5}, () => alphabet[crypto.randomInt(alphabet.length)]).join(""); }
  while (rooms.has(c));
  return c;
};
const shuffle = a => [...a].sort(() => Math.random() - 0.5);
function publicState(r) {
  const players = [...r.players.values()].map(p => ({
    id:p.id, name:p.name, team:p.team, score:p.score,
    connected:p.connected, answered:p.answered, host:p.id===r.hostId
  })).sort((a,b)=>b.score-a.score);
  const w = r.words[r.roundIndex];
  return {
    code:r.code, status:r.status, round:r.roundIndex+1, totalRounds:TOTAL_ROUNDS,
    deadline:r.deadline, players, teamMode:r.teamMode,
    word:r.status==="playing" ? {hint:w[1], letters:shuffle(w[0].split(""))} : null,
    answer:r.status==="reveal" ? w[0] : null,
    winner:r.status==="finished" ? players[0]?.name || null : null
  };
}
function emit(r) { io.to(r.code).emit("state", publicState(r)); }
function stopTimer(r) { if (r.timer) clearTimeout(r.timer); r.timer = null; }
function startRound(r) {
  stopTimer(r);
  r.status = "playing"; r.deadline = Date.now() + ROUND_MS;
  for (const p of r.players.values()) p.answered = false;
  emit(r);
  r.timer = setTimeout(() => reveal(r), ROUND_MS);
}
function reveal(r) {
  if (r.status !== "playing") return;
  stopTimer(r); r.status = "reveal"; r.deadline = null; emit(r);
  r.timer = setTimeout(() => {
    if (r.roundIndex + 1 >= TOTAL_ROUNDS) {
      r.status = "finished"; emit(r);
    } else {
      r.roundIndex++; startRound(r);
    }
  }, 2800);
}
function createPlayer(socket, r, name, team) {
  const id = crypto.randomUUID();
  const p = {id, name:clean(name), team, score:0, answered:false, connected:true, socketId:socket.id, disconnectTimer:null};
  r.players.set(id,p); socket.join(r.code); socket.data = {code:r.code,id};
  socket.emit("joined",{code:r.code,id});
  emit(r);
}
io.on("connection", socket => {
  socket.on("create", ({name, teamMode=true}={}) => {
    if (socket.data.code) return socket.emit("err","Leave your current room first.");
    const code = makeCode(), id = crypto.randomUUID();
    const r = {code, hostId:id, players:new Map(), status:"lobby", roundIndex:0, words:shuffle(WORDS).slice(0,TOTAL_ROUNDS), teamMode:!!teamMode, timer:null, deadline:null};
    rooms.set(code,r);
    const team = r.teamMode ? "A" : "Solo";
    const p = {id,name:clean(name),team,score:0,answered:false,connected:true,socketId:socket.id,disconnectTimer:null};
    r.players.set(id,p); socket.join(code); socket.data={code,id};
    socket.emit("joined",{code,id}); emit(r);
  });
  socket.on("join", ({code,name}={}) => {
    code=String(code||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5);
    const r=rooms.get(code);
    if(!r) return socket.emit("err","Room not found. Check the code.");
    if(r.status!=="lobby") return socket.emit("err","That game has already started.");
    if(r.players.size>=4) return socket.emit("err","Room full: 4 players maximum.");
    if(socket.data.code) return socket.emit("err","Leave your current room first.");
    const team = r.teamMode ? ( [...r.players.values()].filter(p=>p.team==="A").length <= [...r.players.values()].filter(p=>p.team==="B").length ? "A":"B") : "Solo";
    createPlayer(socket,r,name,team);
  });
  socket.on("team", team => {
    const r=rooms.get(socket.data.code), p=r?.players.get(socket.data.id);
    if(!r || !p || r.status!=="lobby" || !r.teamMode) return;
    if(team==="A" || team==="B") p.team=team;
    emit(r);
  });
  socket.on("start", () => {
    const r=rooms.get(socket.data.code);
    if(!r || r.hostId!==socket.data.id || r.status!=="lobby") return;
    if([...r.players.values()].filter(p=>p.connected).length<2) return socket.emit("err","At least 2 connected players are needed.");
    r.roundIndex=0; r.words=shuffle(WORDS).slice(0,TOTAL_ROUNDS);
    for(const p of r.players.values()) p.score=0;
    startRound(r);
  });
  socket.on("answer", ({word}={}) => {
    const r=rooms.get(socket.data.code); 
    p=r?.players.get(socket.data.id);
    if(!r || r.status!=="playing" || !p || p.answered || Date.now()>r.deadline) return;
    p.answered=true;
    const correctAnswer = r.words [r.roundIndex] [0] ;
    const submittedAnswer = String(word || "").trim().toUpperCase() ;
    if (submittedAnswer === correctAnswer) {
      const remaining = Math.max(0, r.deadline - Date.now());
      const points = 100 + Math.round(400 * remaining / ROUND_MS);
      p.score += points;
      socket.emit("answerResult", { correct: true, points });
    } else {
      socket.emit("answerResult", { correct: false, points: 0 });
    }
    emit(r);
    if([...r.players.values()].filter(x => x.connected).every(x => x.answered)) { reveal(r);
    }
  });
  socket.on("again", () => {
    const r=rooms.get(socket.data.code);
    if(!r || r.hostId!==socket.data.id || r.status!=="finished") return;
    r.status="lobby"; r.roundIndex=0; r.deadline=null;
    for(const p of r.players.values()) {p.score=0;p.answered=false;}
    emit(r);
  });
  socket.on("leave", () => {
    const r=rooms.get(socket.data.code), p=r?.players.get(socket.data.id);
    if(r&&p) {
      if(p.disconnectTimer) clearTimeout(p.disconnectTimer);
      r.players.delete(p.id);
      if(r.hostId===p.id) r.hostId=[...r.players.keys()][0]||null;
      socket.leave(r.code);
      if(!r.players.size){stopTimer(r);rooms.delete(r.code);} else emit(r);
    }
    socket.data={};
  });
  socket.on("disconnect", () => {
    const r=rooms.get(socket.data.code),p=r?.players.get(socket.data.id);
    if(!p || p.socketId!==socket.id) return;
    p.connected=false; emit(r);
    p.disconnectTimer=setTimeout(()=>{
      if(!rooms.has(r.code)||r.players.get(p.id)!==p||p.connected) return;
      r.players.delete(p.id);
      if(r.hostId===p.id) r.hostId=[...r.players.keys()][0]||null;
      if(!r.players.size){stopTimer(r);rooms.delete(r.code);}else emit(r);
    },90000);
  });
});
server.listen(process.env.PORT||3000,()=>console.log("Word Rush Party listening"));
