const $=id=>document.getElementById(id),socket=io();let myId=null,state=null,interval=null,roomCode=null;
function screen(id){["home","lobby","game","reveal","finished"].forEach(x=>$(x).classList.toggle("hidden",x!==id));if(interval)clearInterval(interval);if(id==="game")interval=setInterval(tick,200)}
function toast(s){const t=$("toast");t.textContent=s;t.style.display="block";setTimeout(()=>t.style.display="none",3000)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function list(id,players){$(id).innerHTML=players.slice().sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="player"><span>${["🥇","🥈","🥉","⭐"][i]}</span><strong>${esc(p.name)}${p.id===myId?" (you)":""}${p.connected?"":" · reconnecting"}</strong><span class="team">${esc(p.team)}</span><span class="score">${p.score}</span></div>`).join("")}
function joinRoom(){socket.emit("join",{name:$("name").value,code:$("room").value})}
$("create").onclick=()=>socket.emit("create",{name:$("name").value,teamMode:$("teams").checked});
$("join").onclick=joinRoom;
$("room").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5));
$("copy").onclick=async()=>{try{await navigator.clipboard.writeText(state.code);toast("Room code copied!")}catch{toast("Room code: "+state.code)}};
$("start").onclick=()=>socket.emit("start");
$("leave").onclick=()=>{socket.emit("leave");myId=null;state=null;roomCode=null;screen("home")};
$("answerform").onsubmit=e=>{e.preventDefault();socket.emit("answer",{word:$("answer").value});$("answer").disabled=true;$("feedback").textContent="Locked in. Trust your vocabulary."};
$("again").onclick=()=>socket.emit("again");
socket.on("joined",d=>{myId=d.id;roomCode=d.code;sessionStorage.setItem("wrp-room",d.code);sessionStorage.setItem("wrp-name",$("name").value||"Player");$("roomcode").textContent=d.code;$("room").value=d.code;toast("Joined room "+d.code)});
socket.on("err",toast);
socket.on("connect",()=>{$("reconnect").classList.add("hidden");if(!myId){const saved=sessionStorage.getItem("wrp-room");if(saved){$("room").value=saved;$("name").value=sessionStorage.getItem("wrp-name")||"Player";joinRoom()}}});
socket.on("disconnect",()=> $("reconnect").classList.remove("hidden"));
socket.on("state",s=>{state=s;if(s.status==="lobby"){screen("lobby");list("players",s.players);$("start").disabled=!s.players.some(p=>p.id===myId&&p.host)||s.players.filter(p=>p.connected).length<2;return}
if(s.status==="playing"){screen("game");$("round").textContent=`ROUND ${s.round}/${s.totalRounds}`;$("hint").textContent=s.word.hint;$("tiles").innerHTML=s.word.letters.map(l=>`<span class="letter">${esc(l)}</span>`).join("");$("answer").disabled=!!s.players.find(p=>p.id===myId)?.answered;$("answer").value="";$("feedback").textContent=$("answer").disabled?"Answer locked. Wait for the reveal.":"";list("scores",s.players);tick();return}
if(s.status==="reveal"){screen("reveal");$("revealed").textContent=s.answer;list("revealscores",s.players);return}
if(s.status==="finished"){screen("finished");$("winner").textContent=(s.winner||"Everyone")+" wins the word crown!";list("finalscores",s.players);$("again").disabled=!s.players.some(p=>p.id===myId&&p.host);return}});
function tick(){if(!state||state.status!=="playing")return;const n=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));$("time").textContent=n}
