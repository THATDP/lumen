'use strict';
/* ---------- Interface ---------- */
const tiles=new Map(),allp=()=>[{id:me,nick:myNick,role,st:myst(),profile:myPublicProfile,self:true},...peers.values()];
const canMod=p=>(role==='host'||role==='mod')&&p.role!=='host'&&!(role==='mod'&&p.role==='mod');
function renderAll(){if(!inRoom)return;renderBar();renderTabs();renderStage();renderTiles();renderPeople()}
function renderBar(){
  $('#codeBtn').textContent=tr('Código ')+room.code;
  const mic=myst().mic;setIc($('#bMic'),mic?'mic':'micoff');$('#bMic').classList.toggle('off',!mic);
  $('#bCam').classList.toggle('off',!local.cam);$('#bShare').classList.toggle('live',!!local.screen);
  $('#bShare').title=tr(local.screen?'Parar compartilhamento (S)':'Compartilhar tela (S)');
  const l=$('#lockBtn');l.hidden=!(role==='host'||role==='mod');l.style.color=room.locked?'var(--live)':'';l.title=tr(room.locked?'Destrancar sala':'Trancar sala (ninguém novo entra)');
}
const sharers=()=>allp().filter(p=>p.self?!!local.screen:p.st.share);
const watchers=id=>allp().filter(p=>(p.self?view===id&&id!==me:p.st.watch===id));
function renderTabs(){
  const sh=sharers();if(!sh.find(p=>p.id===view))view=sh.length?sh[0].id:null;
  const box=$('#tabs');box.replaceChildren();
  sh.forEach(p=>{const c=E('button','chip'+(p.id===view?' on':''));c.append(E('span','dot'),E('span','',(p.self?tr('Você'):p.nick)+' · '+watchers(p.id).length));c.onclick=()=>{view=p.id;renderAll()};box.append(c)});
  const w=view&&view!==me?view:null;if(w!==lastWatch){lastWatch=w;sendState()}
}
function renderStage(){
  const p=view&&(view===me?{self:true}:peers.get(view));
  const s=!p?null:p.self?local.screen:streamOf(p,'screen');
  const vid=$('#vid');vid.muted=!!(p&&p.self);if(vid.srcObject!==(s||null)){vid.srcObject=s||null;if(vid.setSinkId)vid.setSinkId(cfg.spk||'').catch(()=>{});if(s)vid.play().catch(()=>toast(tr('Toque para ativar o áudio'),'err'))};$('#stage').classList.toggle('live',!!s);
  const videoReady=!!s&&vid.videoWidth>0;$('#empty').hidden=videoReady;
  if(view&&!videoReady){const delayed=p&&!p.self&&Date.now()-p.waitingSince>=15000;$('#empty').innerHTML='<b>'+tr(delayed?'Não foi possível receber a transmissão':'Conectando à transmissão…')+'</b>'+tr('Se a conexão não for estabelecida, verifique a rede e a configuração TURN.')}
  else if(!view){$('#empty').innerHTML='<b>'+tr('Nenhuma transmissão agora')+'</b>'+tr('Use “Compartilhar tela” (S) para mostrar uma tela, janela ou aba.')}
  const vw=$('#viewers');vw.hidden=!s;if(s){const l=watchers(view);vw.textContent=view===me?(l.length?tr('Assistindo: ')+l.map(x=>x.nick).join(', '):tr('Ninguém assistindo ainda')):l.length+tr(' assistindo')}
}
function renderTiles(){
  const seen=new Set();
  for(const p of allp()){
    seen.add(p.id);let t=tiles.get(p.id);
    if(!t){t=E('div','tile');t.innerHTML='<video autoplay playsinline muted></video><i class="av"></i><span class="nm"></span><span class="mi"></span>';const pin=E('button','tile-pin','☆');pin.type='button';pin.onclick=()=>{pinnedTile=pinnedTile===p.id?null:p.id;renderTiles()};t.append(pin);tiles.set(p.id,t);$('#tiles').append(t)}
    const pin=t.querySelector('.tile-pin');pin.textContent=pinnedTile===p.id?'★':'☆';pin.setAttribute('aria-label',L(pinnedTile===p.id?'Desafixar ':'Fixar ',pinnedTile===p.id?'Unpin ':'Pin ')+p.nick);pin.setAttribute('aria-pressed',String(pinnedTile===p.id));t.style.order=pinnedTile===p.id?'-1':'';
    const cs=p.self?local.cam:(p.st.cam?streamOf(p,'cam'):null),v=t.firstChild;
    if(v.srcObject!==(cs||null))v.srcObject=cs||null;
    t.classList.toggle('hascam',!!cs);t.classList.toggle('mirror',!!(p.self&&cfg.mirror));
    const av=t.querySelector('.av');av.textContent=initial(p.nick);applyAvatar(av,p);
    t.querySelector('.nm').textContent=p.nick+(p.self?tr(' (você)'):'');t.querySelector('.mi').innerHTML=p.st.mic?'':ic('micoff');
  }
  tiles.forEach((t,id)=>{if(!seen.has(id)){t.remove();tiles.delete(id)}});
}
function renderPeople(){
  const box=$('#ppl');box.replaceChildren();$('#pc').textContent=peers.size+1;
  const act=(txt,t,p)=>{const b=E('button','btn',txt);b.onclick=()=>tx({t,id:p.id});return b};
  for(const p of allp()){
    const r=E('div','row2');r.dataset.id=p.id;const av=E('i','av',initial(p.nick));applyAvatar(av,p);
    const n=E('div','pn');n.append(E('b','',p.nick+(p.self?tr(' (você)'):'')),E('small','',tr(({host:'Administrador',mod:'Moderador'})[p.role]||'Participante')));
    if(p.st.share)n.lastChild.textContent+=tr(' · transmitindo');if(p.profile?.bio)n.append(E('small','',p.profile.bio));if(p.profile?.banner)r.style.backgroundImage=`linear-gradient(90deg,var(--s1),transparent),url("${p.profile.banner}")`;r.append(av,n);
    if(!p.self){
      const v=E('input');v.type='range';v.min=0;v.max=100;v.value=p.vol*100;v.title=tr('Volume de ')+p.nick;v.setAttribute('aria-label',tr('Volume de ')+p.nick);v.oninput=()=>{p.vol=v.value/100;syncAudio(p)};r.append(v);
      if(canMod(p)){r.append(act(tr('Silenciar'),'mute',p),act(tr('Remover'),'kick',p));if(role==='host')r.append(act(tr(p.role==='mod'?'Rebaixar':'Moderador'),'mod',p))}
    }
    box.append(r);
  }
}
let pendingChat=null,unreadCount=0;
function scrollMessages(node){const box=$('#msgs'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;box.append(node);if(nearBottom||node.classList.contains('me'))box.scrollTop=box.scrollHeight;else{unreadCount++;$('#unread').hidden=false;$('#unread').textContent=tr('Novas mensagens ↓')+' ('+unreadCount+')'}}
function sys(t){scrollMessages(E('div','msg sys',t))}
function recoverChat(){if(!pendingChat)return;if(!$('#ci').value)$('#ci').value=pendingChat;pendingChat=null;$('#send-status').hidden=true;$('#cf button').disabled=false}
function addMsg(m){
  if(m.id===me&&pendingChat!==null){pendingChat=null;$('#send-status').hidden=true;$('#cf button').disabled=false}
  insertMessage(m);
}
$('#unread').onclick=()=>{const box=$('#msgs');box.scrollTop=box.scrollHeight;unreadCount=0;$('#unread').hidden=true};
$('#msgs').onscroll=()=>{const box=$('#msgs');if(box.scrollHeight-box.scrollTop-box.clientHeight<40){unreadCount=0;$('#unread').hidden=true}};
function fly(m){const e=E('div','fly',m.e);e.append(E('small','',m.nick));e.style.left=(10+Math.random()*75)+'%';$('#stage').append(e);setTimeout(()=>e.remove(),2300)}

/* controles */
$('#bMic').onclick=toggleMic;$('#bCam').onclick=toggleCam;$('#bShare').onclick=toggleShare;$('#bLeave').onclick=()=>leave();
$('#cf').onsubmit=e=>{e.preventDefault();const v=$('#ci').value.trim();if(!v||pendingChat!==null)return;if(tx({t:'chat',text:v,reply:replyTo})){pendingChat=v;replyTo=null;updateReply();$('#ci').value='';$('#cf button').disabled=true;$('#send-status').textContent=tr('Enviando…');$('#send-status').hidden=false}else toast(tr('Sem conexão. Sua mensagem não foi enviada.'),'err')};
['👍','👏','😂','🔥','😮','❤️'].forEach(e=>{const b=E('button','',e);b.onclick=()=>{tx({t:'react',e});$('#rx').hidden=true};$('#rx').append(b)});
$('#bRx').onclick=()=>{$('#rx').hidden=!$('#rx').hidden};
$('#lockBtn').onclick=()=>tx({t:'lock',v:!room.locked});

$('#codeBtn').onclick=()=>{const link='https://thatdp.github.io/lumen/?room='+room.code;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(link).then(()=>toast(tr('Link de convite copiado')),()=>toast(link));else toast(link)};
document.querySelectorAll('.side nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.side nav button').forEach(x=>x.classList.toggle('on',x===b));$('#chat').hidden=b.dataset.p!=='chat';$('#ppl').hidden=b.dataset.p!=='ppl';$('#game').hidden=b.dataset.p!=='game'});
const vid=$('#vid');vid.onloadeddata=()=>renderAll();
const zset=z=>{zoom=Math.min(4,Math.max(1,z));vid.style.transform=`scale(${zoom})`;$('#zl').textContent=Math.round(zoom*100)+'%'};
$('#zi').onclick=()=>zset(zoom+.25);$('#zo').onclick=()=>zset(zoom-.25);$('#stage').ondblclick=()=>zset(1);
$('#stage').onwheel=e=>{if(!view)return;e.preventDefault();zset(zoom-e.deltaY*.002)};
$('#stage').onmousemove=e=>{if(zoom>1){const r=$('#stage').getBoundingClientRect();vid.style.transformOrigin=`${(e.clientX-r.left)/r.width*100}% ${(e.clientY-r.top)/r.height*100}%`}};
$('#sv').oninput=e=>{vid.volume=e.target.value/100};
const fs=()=>document.fullscreenElement?document.exitFullscreen():$('#stage').requestFullscreen().catch(()=>{});$('#fs').onclick=fs;
addEventListener('keydown',e=>{
  if(!inRoom||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,select,textarea'))return;
  const f={m:toggleMic,v:toggleCam,s:toggleShare,f:fs}[e.key.toLowerCase()];if(f){e.preventDefault();f()}
});
