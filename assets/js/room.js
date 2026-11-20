'use strict';
// Room enhancements leave all existing media elements and peer connections intact.
let myPid='',myPublicProfile={},sharedProfile=null,replyTo=null,currentGame=null,pinnedTile=null;
const messages=new Map();
const L=(pt,en)=>language==='en'?en:pt;
const btn=(text,fn)=>{const b=E('button','room-btn',text);b.type='button';b.onclick=fn;return b};
const options={mode:'strip',columns:3,gap:10,side:'right',sounds:false,volume:20,message:true,join:true,...LS.get('room-experience',{})};
function saveRoomOptions(){LS.set('room-experience',options);applyRoomOptions()}
function applyRoomOptions(){document.querySelector('.main').dataset.side=options.side;$('#tiles').dataset.mode=options.mode;$('#tiles').dataset.multi=String(+options.columns>1);$('#tiles').style.setProperty('--columns',Math.min(6,Math.max(1,+options.columns||3)));$('#tiles').style.setProperty('--gap',Math.min(24,Math.max(2,+options.gap||10))+'px')}
function applyAvatar(el,p){el.style.backgroundColor=p.profile?.color||`hsl(${hue(p.id)} 55% 38%)`;el.style.backgroundImage=p.profile?.avatar?`url("${p.profile.avatar}")`:'';el.style.backgroundSize='cover';if(p.profile?.avatar)el.textContent=''}
function roomJoined(m){myPid=m.pid;messages.clear();$('#msgs').replaceChildren();(m.history||[]).forEach(insertMessage);renderGame(m.game);if(sharedProfile)tx({t:'profile',profile:sharedProfile})}
function resetRoomFeatures(){myPid='';sharedProfile=null;myPublicProfile={};replyTo=null;pinnedTile=null;messages.clear();renderGame(null);updateReply()}
function updateReply(){const b=$('#reply-indicator');if(!b)return;b.hidden=!replyTo;b.textContent=replyTo?L('Respondendo · cancelar','Replying · cancel'):''}
function safeContent(el,text){
  // Build nodes, never interpret message text as HTML.
  const re=/https?:\/\/[^\s<>]+/g;let last=0,match;
  while((match=re.exec(text))){el.append(document.createTextNode(text.slice(last,match.index)));try{const url=new URL(match[0]);if(['http:','https:'].includes(url.protocol)){const a=E('a','',match[0]);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';el.append(a)}else el.append(document.createTextNode(match[0]))}catch{el.append(document.createTextNode(match[0]))}last=re.lastIndex}
  el.append(document.createTextNode(text.slice(last)));
}
function messageNode(m){
  const own=m.owner===myPid,d=E('div','msg'+(own?' me':''));d.dataset.mid=m.mid;
  const head=E('div','msg-head'),time=E('time');const when=new Date(m.ts||Date.now());time.dateTime=when.toISOString();time.textContent=new Intl.DateTimeFormat(language,{hour:'2-digit',minute:'2-digit'}).format(when);
  const sender=own?{id:me,nick:myNick,profile:myPublicProfile}:[...peers.values()].find(p=>p.pid===m.owner);if(sender){const av=E('i','av msg-avatar',initial(sender.nick));applyAvatar(av,sender);head.append(av)}head.append(E('b','',own?tr('Você'):m.nick),time);d.append(head);
  if(m.reply){const r=messages.get(m.reply);d.append(E('small','reply-quote',r?(r.nick+': '+(r.deleted?L('Mensagem excluída','Deleted message'):r.text).slice(0,80)):L('Mensagem anterior','Earlier message')))}
  const body=E('span','message-text');if(m.deleted)body.textContent=L('Mensagem excluída','Deleted message');else safeContent(body,m.text);d.append(body);
  if(m.edited&&!m.deleted)d.append(E('small','room-muted',L('editada','edited')));
  const acts=E('div','message-actions');
  if(!m.deleted){acts.append(btn(L('Responder','Reply'),()=>{replyTo=m.mid;updateReply();$('#ci').focus()}));
    if(own){acts.append(btn(L('Editar','Edit'),()=>{const value=prompt(L('Editar mensagem','Edit message'),m.text);if(value!==null)tx({t:'chat_edit',mid:m.mid,text:value})}),btn(L('Excluir','Delete'),()=>{if(confirm(L('Excluir esta mensagem?','Delete this message?')))tx({t:'chat_delete',mid:m.mid})}));}
    for(const emoji of ['👍','❤️','😂']){const list=m.reactions?.[emoji]||[];const b=btn(emoji+(list.length?' '+list.length:''),()=>tx({t:'chat_reaction',mid:m.mid,emoji}));b.setAttribute('aria-label',L('Reagir com ','React with ')+emoji);b.setAttribute('aria-pressed',String(list.includes(myPid)));acts.append(b)}
    acts.append(btn(tr('Copiar mensagem'),()=>{if(navigator.clipboard?.writeText)navigator.clipboard.writeText(m.text).then(()=>toast(tr('Mensagem copiada')),()=>toast(m.text));else toast(m.text)}));
  }d.append(acts);return d;
}
function insertMessage(m){if(!m.mid)return;messages.set(m.mid,m);scrollMessages(messageNode(m));while(messages.size>200){const first=messages.keys().next().value;messages.delete(first);document.querySelector(`[data-mid="${first}"]`)?.remove()}}
function updateMessage(m){if(!m||!messages.has(m.mid))return;messages.set(m.mid,m);const old=document.querySelector(`[data-mid="${m.mid}"]`);if(old)old.replaceWith(messageNode(m))}
function renderGame(g){currentGame=g;const box=$('#game');box.replaceChildren();box.append(E('h3','',L('Jogo da velha','Tic-tac-toe')),E('p','room-muted',L('Uma partida por sala · jogadas validadas pelo servidor','One game per room · moves validated by the server')));
  if(!g){box.append(btn(L('Criar partida','Start game'),()=>tx({t:'game',action:'start'})));return}
  let status=g.status==='waiting'?L('Aguardando outro jogador','Waiting for another player'):g.status==='playing'?L('Vez de ','Turn: ')+g.players[g.turn].nick:g.status==='draw'?L('Empate','Draw'):L('Vencedor: ','Winner: ')+(g.players.find(p=>p.id===g.winner)?.nick||'');box.append(E('p','',status));
  box.append(E('p','room-muted',g.players.map((p,i)=>`${i?'O':'X'} · ${p.nick}`).join('   /   ')));
  const board=E('div','game-board');g.board.forEach((v,i)=>{const b=btn(v||'·',()=>tx({t:'game',action:'move',cell:i}));b.setAttribute('aria-label',L('Casa ','Cell ')+(i+1)+(v?' '+v:''));b.disabled=!!v||g.status!=='playing'||g.players[g.turn].id!==myPid;board.append(b)});box.append(board);
  if(g.status==='waiting'&&g.owner!==myPid)box.append(btn(L('Entrar na partida','Join game'),()=>tx({t:'game',action:'join'})));
  if(['finished','draw'].includes(g.status)&&g.players.some(p=>p.id===myPid))box.append(btn(L('Reiniciar','Restart'),()=>tx({t:'game',action:'reset'})));
  if(g.owner===myPid||role==='host')box.append(btn(L('Encerrar partida','End game'),()=>tx({t:'game',action:'end'})));
}
let soundContext;
function roomSound(kind,enabled){if(!enabled||!options.sounds||!options[kind]||!soundContext||soundContext.state!=='running')return;const o=soundContext.createOscillator(),gain=soundContext.createGain(),now=soundContext.currentTime;o.frequency.value=kind==='join'?520:660;gain.gain.setValueAtTime(Math.min(.08,(+options.volume||0)/1000),now);gain.gain.exponentialRampToValueAtTime(.0001,now+.12);o.connect(gain);gain.connect(soundContext.destination);o.start(now);o.stop(now+.12)}
function openRoomOptions(){
 const body=$('#room-options-body');body.replaceChildren();
 const section=(title,desc)=>{body.append(E('h3','',title),E('p','room-muted',desc))};
 const select=(label,key,entries)=>{const row=E('label','room-setting');row.append(E('span','',label));const s=E('select');for(const [v,n] of entries){const o=E('option','',n);o.value=v;s.append(o)}s.value=options[key];s.onchange=()=>{options[key]=s.value;saveRoomOptions()};row.append(s);body.append(row)};
 const range=(label,key,min,max)=>{const row=E('label','room-setting');row.append(E('span','',label));const input=E('input');input.type='range';input.min=min;input.max=max;input.value=options[key];input.oninput=()=>{options[key]=+input.value;saveRoomOptions()};row.append(input);body.append(row)};
 const check=(label,key)=>{const row=E('label','room-check'),i=E('input');i.type='checkbox';i.checked=!!options[key];i.onchange=()=>{options[key]=i.checked;saveRoomOptions()};row.append(i,document.createTextNode(label));body.append(row)};
 section(L('Layout','Layout'),L('Alterações locais, sem interromper as conexões.','Local changes, without interrupting connections.'));
 select(L('Vídeos','Videos'),'mode',[[ 'strip',L('Faixa','Strip')],['grid',L('Grade','Grid')],['vertical','Vertical'],['gallery',L('Galeria','Gallery')]]);select(L('Painel lateral','Side panel'),'side',[['right',L('Direita','Right')],['left',L('Esquerda','Left')]]);range(L('Colunas da grade','Grid columns'),'columns',1,6);range(L('Espaçamento','Spacing'),'gap',2,24);
 section(L('Sons','Sounds'),L('Ative com um clique; o navegador pode bloquear reprodução automática.','Enable with a click; the browser may block autoplay.'));
 check(L('Ativar sons','Enable sounds'),'sounds');range(L('Volume','Volume'),'volume',0,100);check(L('Mensagens','Messages'),'message');check(L('Entradas','Joins'),'join');body.append(btn(L('Prévia','Preview'),async()=>{try{soundContext ||= new AudioContext();await soundContext.resume();const old=options.sounds,ev=options.message;options.sounds=options.message=true;roomSound('message',true);options.sounds=old;options.message=ev}catch{toast(L('Áudio indisponível','Audio unavailable'),'err')}}));
 section(L('Compartilhar perfil nesta sala','Share profile in this room'),L('Nada é enviado automaticamente. Escolha os itens e confirme; os participantes podem guardá-los.','Nothing is sent automatically. Select items and confirm; participants can save them.'));
 const selected={};for(const [key,pt,en] of [['bio','Biografia','Bio'],['color','Cor','Color'],['avatar','Foto','Photo'],['banner','Banner','Banner']]){const row=E('label','room-check'),i=E('input');i.type='checkbox';i.onchange=()=>selected[key]=i.checked;row.append(i,document.createTextNode(L(pt,en)));body.append(row)}
 body.append(btn(L('Compartilhar selecionados','Share selected'),async()=>{try{const p=await window.lumenRoomProfile(selected);if(tx({t:'profile',profile:p})){sharedProfile=p;toast(L('Perfil compartilhado nesta sala.','Profile shared in this room.'))}}catch{toast(L('Não foi possível ler o perfil.','Could not read profile.'),'err')}}),btn(L('Parar de compartilhar','Stop sharing'),()=>{sharedProfile=null;tx({t:'profile',profile:{}})}));
}
const replyButton=btn('',()=>{replyTo=null;updateReply()});replyButton.id='reply-indicator';replyButton.hidden=true;$('#chat').insertBefore(replyButton,$('#cf'));
$('#room-options-btn').onclick=()=>{openRoomOptions();$('#room-options').showModal()};$('#room-options-close').onclick=()=>$('#room-options').close();
// AudioContext must be resumed by a user gesture.
function unlockSounds(){if(options.sounds){try{soundContext ||= new AudioContext();if(soundContext.state==='suspended')soundContext.resume().catch(()=>{})}catch{}}}
document.addEventListener('pointerdown',unlockSounds,{passive:true});document.addEventListener('keydown',unlockSounds);
Object.assign(translations.en,{'Experiência da sala':'Room experience','Sala ✧':'Room ✧','Jogo':'Game','Fechar':'Close'});
function translateRoomControls(){ $('#room-options-btn').textContent=L('Sala ✧','Room ✧');document.querySelector('[data-p=game]').textContent=L('Jogo','Game');if($('#room-options').open)openRoomOptions();renderGame(currentGame) }
window.addEventListener('lumen-language',translateRoomControls);
applyRoomOptions();translateRoomControls();
