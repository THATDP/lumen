'use strict';
// All chess moves and clocks are authoritative on the room's server instance.
const {Chess}=require('chess.js');
const MAX_GRACE=60000;
function publicState(g){
  if(!g)return null;
  const clocks={...g.clocks};if(g.status==='playing')clocks[g.chess.turn()]=Math.max(0,clocks[g.chess.turn()]-(Date.now()-g.started));
  return {status:g.status,owner:g.owner,invited:g.invited,players:g.players.map(x=>({...x})),fen:g.chess.fen(),turn:g.chess.turn(),moves:g.chess.history(),clocks,clockMinutes:g.clockMinutes,winner:g.winner,reason:g.reason,check:g.chess.isCheck()};
}
function startRoom(r){r.chess=null}
function clearTimers(g){clearTimeout(g.timer);Object.values(g.offline||{}).forEach(clearTimeout);g.offline={}}
function emit(r,broadcast){broadcast(r,{t:'chess_state',chess:publicState(r.chess)})}
function stop(r,g,reason,winner,broadcast){if(r.chess!==g||g.status!=='playing')return;g.status='finished';g.reason=reason;g.winner=winner;clearTimers(g);emit(r,broadcast)}
function flagFall(r,g,color,broadcast){const other=g.players.find(p=>p.color!==color);const hasPiece=g.chess.board().flat().some(piece=>piece&&piece.color===other.color&&piece.type!=='k');const winner=hasPiece&&!g.chess.isInsufficientMaterial()?other.id:null;stop(r,g,'timeout',winner,broadcast)}
function schedule(r,g,broadcast){
  clearTimeout(g.timer);if(g.status!=='playing')return;
  const color=g.chess.turn(),left=Math.max(0,g.clocks[color]-(Date.now()-g.started));
  g.timer=setTimeout(()=>{if(r.chess!==g||g.status!=='playing')return;g.clocks[color]=0;flagFall(r,g,color,broadcast)},left+5);g.timer.unref();
}
function onJoin(r,p,broadcast){const g=r.chess;if(!g||!g.players.some(x=>x.id===p.pid))return;clearTimeout(g.offline[p.pid]);delete g.offline[p.pid];const player=g.players.find(x=>x.id===p.pid);player.connected=true;player.nick=p.nick;emit(r,broadcast)}
function departed(r,p,broadcast){
  const g=r.chess;if(!g)return;
  if(g.status==='invited'&&(g.owner===p.pid||g.invited===p.pid)){clearTimers(g);r.chess=null;emit(r,broadcast);return}
  const player=g.players.find(x=>x.id===p.pid);if(!player)return;player.connected=false;emit(r,broadcast);
  if(g.status==='playing'){
    clearTimeout(g.offline[p.pid]);g.offline[p.pid]=setTimeout(()=>{const other=g.players.find(x=>x.id!==p.pid);stop(r,g,'disconnect',other.connected?other.id:null,broadcast)},MAX_GRACE);g.offline[p.pid].unref();
  }
}
function cleanup(r){if(r.chess)clearTimers(r.chess)}
function handle(r,p,m,broadcast,err){
  let g=r.chess;const action=m.action;
  if(action==='invite'){
    if(g)return err('chess_busy','Já existe uma partida ou convite de xadrez.');
    const target=[...r.peers.values()].find(x=>x.id===m.to&&x.pid!==p.pid);if(!target)return err('chess_invalid','Escolha um participante conectado.');
    const minutes=Number(m.minutes);if(![1,3,5,10,15,30].includes(minutes))return err('chess_invalid','Relógio inválido.');
    g=r.chess={status:'invited',owner:p.pid,invited:target.pid,players:[{id:p.pid,nick:p.nick,color:'w',connected:true},{id:target.pid,nick:target.nick,color:'b',connected:true}],chess:new Chess(),clockMinutes:minutes,clocks:{w:minutes*60000,b:minutes*60000},offline:{},winner:null,reason:null};
  }else if(!g)return err('chess_invalid','Não há partida de xadrez.');
  else if(action==='accept'){
    if(g.status!=='invited'||g.invited!==p.pid)return err('chess_forbidden','Somente o convidado pode aceitar.');
    g.status='playing';g.started=Date.now();schedule(r,g,broadcast);
  }else if(action==='decline'){
    if(g.status!=='invited'||![g.owner,g.invited].includes(p.pid))return err('chess_forbidden','Convite inválido.');clearTimers(g);r.chess=null;
  }else if(action==='move'){
    if(g.status!=='playing'||!g.players.some(x=>x.id===p.pid&&x.color===g.chess.turn())||typeof m.from!=='string'||typeof m.to!=='string'||!(/^[a-h][1-8]$/.test(m.from)&&/^[a-h][1-8]$/.test(m.to))||!(m.promotion===undefined||['q','r','b','n'].includes(m.promotion)))return err('chess_invalid','Jogada inválida ou fora de turno.');
    const color=g.chess.turn(),elapsed=Date.now()-g.started;
    if(elapsed>=g.clocks[color]){g.clocks[color]=0;flagFall(r,g,color,broadcast);return}
    try{g.chess.move({from:m.from,to:m.to,promotion:m.promotion})}catch{return err('chess_invalid','Jogada ilegal.');}
    g.clocks[color]-=elapsed;g.started=Date.now();
    if(g.chess.isCheckmate()){g.status='finished';g.reason='checkmate';g.winner=p.pid;clearTimers(g)}
    else if(g.chess.isDraw()){g.status='finished';g.reason=g.chess.isStalemate()?'stalemate':g.chess.isThreefoldRepetition()?'repetition':g.chess.isInsufficientMaterial()?'material':'fifty-move';g.winner=null;clearTimers(g)}
    else schedule(r,g,broadcast);
  }else if(action==='resign'){
    if(g.status!=='playing'||!g.players.some(x=>x.id===p.pid))return err('chess_forbidden','Somente jogadores podem desistir.');stop(r,g,'resign',g.players.find(x=>x.id!==p.pid).id,broadcast);return;
  }else if(action==='restart'){
    if(g.status!=='finished'||!g.players.some(x=>x.id===p.pid)||g.players.some(x=>![...r.peers.values()].some(y=>y.pid===x.id)))return err('chess_invalid','Os dois jogadores precisam estar conectados.');
    g.status='invited';g.owner=p.pid;g.invited=g.players.find(x=>x.id!==p.pid).id;g.players=g.players.map(x=>({...x,color:x.id===p.pid?'w':'b',connected:true})).sort((a,b)=>a.color==='w'?-1:1);g.chess=new Chess();g.clocks={w:g.clockMinutes*60000,b:g.clockMinutes*60000};g.winner=null;g.reason=null;
  }else if(action==='end'){
    if(p.role!=='host'&&!g.players.some(x=>x.id===p.pid))return err('chess_forbidden','Somente jogadores ou anfitrião podem encerrar.');clearTimers(g);r.chess=null;
  }else return;
  emit(r,broadcast);
}
module.exports={startRoom,publicState,handle,departed,onJoin,cleanup};
