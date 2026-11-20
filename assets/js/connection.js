'use strict';
/* ---------- Conexão com o servidor de sinalização ---------- */
async function refreshIce(restart,timeout=8000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const response=await fetch(API+'/api/ice',{signal:controller.signal});if(!response.ok)throw Error('ICE');const servers=await response.json();if(!Array.isArray(servers)||!servers.length)throw Error('ICE');ICE=servers;
    if(restart)peers.forEach(p=>{try{p.pc.setConfiguration({...p.pc.getConfiguration(),iceServers:ICE});p.pc.restartIce()}catch(e){console.warn('ICE refresh',e)}});
    return true;
  }catch(e){console.warn('ICE configuration unavailable',e);return false}finally{clearTimeout(timer)}
}
function scheduleIceRefresh(){
  clearTimeout(iceRefreshTimer);if(!inRoom)return;const expiries=ICE.map(s=>/^(\d+):/.exec(s.username||'')).filter(Boolean).map(m=>Number(m[1])*1000);
  if(!expiries.length)return;const delay=Math.max(15000,(Math.min(...expiries)-Date.now())/2);
  iceRefreshTimer=setTimeout(async()=>{if(!inRoom)return;if(await refreshIce(true))scheduleIceRefresh();else iceRefreshTimer=setTimeout(scheduleIceRefresh,30000)},delay);
}
function setConnecting(value){connecting=value;$('#create').disabled=value;$('#join').disabled=value;$('#wstatus').hidden=!value;$('#wstatus').textContent=value?tr('Conectando à sala…'):''}
// Owns a single signaling attempt and its join deadline. The room controller
// remains responsible for the participant state when this attempt closes.
class SignalingAttempt {
  constructor(request,first,token){this.request=request;this.first=first;this.token=token;this.socket=null;this.deadline=null}
  start(){
    if(this.token!==attempt)return;
    try{this.socket=ws=new WebSocket(API.replace(/^http/,'ws'))}
    catch(error){setConnecting(false);werr(tr('Não foi possível conectar ao servidor.'));return}
    const socket=this.socket;
    this.deadline=setTimeout(()=>socket.close(),75000);
    socket.onopen=()=>socket.send(JSON.stringify({t:'join',uid,nick:myNick,...this.request}));
    socket.onmessage=event=>{
      try{const message=JSON.parse(event.data);if(message.t==='joined')clearTimeout(this.deadline);handle(message)}
      catch(error){console.error('Message handling failed',error)}
    };
    socket.onclose=()=>this.closed();
  }
  closed(){
    clearTimeout(this.deadline);
    if(this.socket!==ws||this.token!==attempt)return;
    if(!inRoom){
      if(this.first&&!$('#werr').textContent&&Date.now()-connectStarted<90000){retryTimer=setTimeout(()=>open(this.request,true,this.token),Math.min(1000*2**retry++,8000));return}
      setConnecting(false);if(this.first&&!$('#werr').textContent)werr(tr('Sem conexão com o servidor. Tente novamente.'));return
    }
    if(kicked)return;
    recoverChat();joined=false;peers.forEach(clearPeer);peers.clear();lastWatch=null;renderAll();
    $('#banner').hidden=false;$('#banner').textContent=tr('Conexão perdida. Reconectando…');
    if(retry>=8)return leave(tr('Não foi possível reconectar à sala.'));
    retryTimer=setTimeout(()=>open({code:room.code,password:joinSecret},false,this.token),Math.min(1000*2**retry++,8000));
  }
}
function open(req,first,token){new SignalingAttempt(req,first,token).start()}
function werr(t){$('#werr').textContent=t}
async function enter(req){
  if(connecting||inRoom)return;
  const n=$('#nick').value.trim();if(!n)return werr(tr('Escolha um nickname para continuar.'));
  if(!req.create&&!/^[A-Za-z0-9]{6}$/.test(req.code.trim()))return werr(tr('Informe um código de sala válido.'));
  myNick=n;LS.set('nick',n);joinSecret=req.password||'';werr('');kicked=false;retry=0;connectStarted=Date.now();setConnecting(true);
  const token=++attempt;
  if(!await refreshIce(false,75000))ICE=[{urls:'stun:stun.l.google.com:19302'}];
  if(token===attempt)open(req,true,token);
}
$('#create').onclick=()=>enter({create:true,name:$('#rname').value.trim()||(language==='en'?'Room of ':'Sala de ')+$('#nick').value.trim(),priv:$('#rpriv').checked,description:$('#rdesc').value.trim(),password:$('#rpassword').value});
$('#join').onclick=()=>enter({code:$('#code').value,password:$('#join-password').value});
$('#nick').value=myNick;
const inviteCode=new URLSearchParams(location.search).get('room');if(inviteCode&&/^[A-Za-z0-9]{6}$/.test(inviteCode))$('#code').value=inviteCode.toUpperCase();
fetch(API+'/api/rooms').then(r=>r.json()).then(l=>l.forEach(r=>{const c=E('button','pub',`${r.name} · ${r.n}`);c.onclick=()=>{$('#code').value=r.code};$('#pubs').append(c)})).catch(()=>{});

function handle(m){
  switch(m.t){
  case 'joined':
    me=m.id;room=m.room;role=m.role;inRoom=true;joined=true;setConnecting(false);retry=0;$('#banner').hidden=true;
    m.peers.forEach(i=>addPeer(i,true));
    $('#welcome').hidden=true;$('#app').hidden=false;history.replaceState(0,'','/lumen/?room='+room.code);
    $('#rn').textContent=room.name;$('#rn').title=room.description||room.name;$('#codeBtn').textContent=tr('Código ')+room.code;
    sendState();renderAll();scheduleIceRefresh();sys(tr('Você entrou na sala.'));break;
  case 'peer':addPeer(m.peer,false);toast(m.peer.nick+tr(' entrou'));sys(m.peer.nick+tr(' entrou.'));renderAll();break;
  case 'left':{const p=peers.get(m.id);if(p){clearPeer(p);peers.delete(m.id);if(view===m.id)view=null;toast(m.nick+tr(' saiu'));sys(m.nick+tr(' saiu.'));renderAll()}break}
  case 'state':{const p=peers.get(m.id);if(p){if(m.st.share&&!p.st.share){p.waitingSince=Date.now();clearTimeout(p.statusTimer);p.statusTimer=setTimeout(()=>renderAll(),15000)}p.st=m.st;syncAudio(p);renderAll()}break}
  case 'signal':onSignal(m.from,m.d);break;
  case 'chat':addMsg(m);break;
  case 'react':fly(m);break;
  case 'nick':{if(m.id===me){myNick=m.nick;LS.set('nick',m.nick)}else{const p=peers.get(m.id);if(p)p.nick=m.nick}renderAll();break}
  case 'role':{if(m.id===me)role=m.role;else{const p=peers.get(m.id);if(p)p.role=m.role}renderAll();break}
  case 'room':room.locked=m.locked;toast(tr(m.locked?'Sala trancada':'Sala destrancada'));renderAll();break;
  case 'mute':if(local.mic){local.mic.getAudioTracks()[0].enabled=false;sendState();renderAll()}toast(m.by+tr(' silenciou seu microfone'));break;
  case 'kicked':kicked=true;leave(tr('Você foi removido da sala.'));break;
  case 'err':
    if(m.code==='rate_limit')recoverChat();
    if(inRoom&&!joined){leave(serverError(m));}else if(!inRoom){werr(serverError(m));ws.close()}else toast(serverError(m),'err');break;
  }
}
function leave(msg){
  inRoom=false;joined=false;joinSecret='';setConnecting(false);attempt++;clearTimeout(retryTimer);clearTimeout(iceRefreshTimer);try{ws&&ws.close()}catch{}
  ['mic','cam','screen'].forEach(dropLocal);peers.forEach(clearPeer);peers.clear();tiles.forEach(t=>t.remove());tiles.clear();
  recoverChat();unreadCount=0;$('#unread').hidden=true;view=null;lastWatch=null;if($('#dlg').open)$('#dlg').close();$('#app').hidden=true;$('#welcome').hidden=false;$('#banner').hidden=true;$('#msgs').replaceChildren();history.replaceState(0,'','/lumen/');if(msg)werr(msg);
}
