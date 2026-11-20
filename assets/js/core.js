'use strict';
const $=s=>document.querySelector(s),E=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const ICO={mic:'<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
micoff:'<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3M3 3l18 18"/>',
cam:'<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
share:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M9 10l3-3 3 3M12 7v6"/>',
smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
full:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',leave:'<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9"/>',
gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'};
const ic=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICO[n]}</svg>`;
const setIc=(b,n)=>{b.dataset.i=n;b.innerHTML=ic(n)};
document.querySelectorAll('[data-i]').forEach(b=>setIc(b,b.dataset.i));
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const translations={en:{
  "Mostre sua tela. Sem cadastro.": "Share your screen. No sign-up.",
  "Escolha um nickname e entre. Não pedimos e-mail, senha nem telefone.": "Choose a nickname and join. No email, password or phone number needed.",
  "Nickname": "Nickname",
  "Como devemos te chamar?": "What should we call you?",
  "Nome da sala (opcional)": "Room name (optional)",
  "Privada": "Private",
  "Criar sala": "Create room",
  "ou entre com um código": "or join with a code",
  "Código da sala": "Room code",
  "Entrar": "Join",
  "Copiar link de convite": "Copy invite link",
  "Trancar/destrancar sala": "Lock/unlock room",
  "Configurações": "Settings",
  "Nenhuma transmissão agora": "No one is sharing yet",
  "Use “Compartilhar tela” (S) para mostrar uma tela, janela ou aba.": "Use “Share screen” (S) to share a screen, window or tab.",
  "Diminuir zoom": "Zoom out",
  "Aumentar zoom": "Zoom in",
  "Volume da transmissão": "Stream volume",
  "Tela cheia": "Full screen",
  "Pessoas (": "People (",
  "Mensagem": "Message",
  "Enviar": "Send",
  "Microfone (M)": "Microphone (M)",
  "Microfone": "Microphone",
  "Câmera (V)": "Camera (V)",
  "Câmera": "Camera",
  "Compartilhar tela (S)": "Share screen (S)",
  "Compartilhar tela": "Share screen",
  "Reações": "Reactions",
  "Sair da sala": "Leave room",
  "Fechar": "Close",
  "Não foi possível conectar ao servidor.": "Unable to connect to the server.",
  "Sem conexão com o servidor. Tente novamente.": "Unable to connect to the server. Please try again.",
  "Conexão perdida. Reconectando…": "Connection lost. Reconnecting…",
  "Não foi possível reconectar à sala.": "Unable to reconnect to the room.",
  "Escolha um nickname para continuar.": "Choose a nickname to continue.",
  "Informe um código de sala válido.": "Enter a valid room code.",
  "Sem conexão. Sua mensagem não foi enviada.": "No connection. Your message was not sent.",
  "Link de convite copiado": "Invite link copied",
  "Conectando à transmissão…": "Connecting to the stream…",
  "Se a conexão não for estabelecida, verifique a rede e a configuração TURN.": "If the connection does not establish, check the network and TURN configuration.",
  "Você": "You",
  " (você)": " (you)",
  "Administrador": "Host",
  "Moderador": "Moderator",
  "Participante": "Participant",
  " · transmitindo": " · sharing",
  "Silenciar": "Mute",
  "Remover": "Remove",
  "Rebaixar": "Remove moderator",
  "Sala trancada": "Room locked",
  "Sala destrancada": "Room unlocked",
  "Você entrou na sala.": "You joined the room.",
  "Você foi removido da sala.": "You were removed from the room.",
  "Ninguém assistindo ainda": "No viewers yet",
  "Assistindo: ": "Watching: ",
  " assistindo": " watching",
  "Código ": "Code ",
  "Volume de ": "Volume for ",
  " entrou": " joined",
  " entrou.": " joined.",
  " saiu": " left",
  " saiu.": " left.",
  " silenciou seu microfone": " muted your microphone",
  "Trancar sala (ninguém novo entra)": "Lock room (no new participants)",
  "Destrancar sala": "Unlock room",
  "Conta": "Account",
  "Nickname (apenas desta sala; fica salvo neste navegador)": "Nickname (for this room; saved in this browser)",
  "Alterar": "Change",
  "Áudio": "Audio",
  "Saída de áudio": "Audio output",
  "Volume de saída": "Output volume",
  "Cancelamento de eco": "Echo cancellation",
  "Supressão de ruído": "Noise suppression",
  "Ganho automático do microfone": "Automatic microphone gain",
  "Vídeo": "Video",
  "Espelhar minha câmera": "Mirror my camera",
  "Compartilhamento de tela": "Screen sharing",
  "Resolução máxima": "Maximum resolution",
  "Quadros por segundo": "Frames per second",
  "Taxa de bits máxima": "Maximum bitrate",
  "Prioridade": "Priority",
  "Nitidez (texto, código)": "Clarity (text, code)",
  "Fluidez (jogos, vídeo)": "Motion (games, video)",
  "Fonte sugerida": "Suggested source",
  "Escolher no navegador": "Choose in browser",
  "Tela inteira": "Entire screen",
  "Janela": "Window",
  "Aba do navegador": "Browser tab",
  "Capturar áudio do sistema": "Capture system audio",
  "Padrão do sistema": "System default",
  "Dispositivo (libere a permissão para ver o nome)": "Device (allow access to see its name)",
  " (não suportado neste navegador)": " (not supported in this browser)",
  "Diagnóstico": "Diagnostics",
  "Toque em “Atualizar” com alguém conectado à sala.": "Select “Refresh” while someone else is in the room.",
  "Atualizar": "Refresh",
  "Restaurar configurações padrão": "Restore defaults",
  "Configurações restauradas": "Settings restored",
  "Preferência salva": "Preference saved",
  "Sem conexões ativas: entre numa sala com mais alguém.": "No active connections: join a room with someone else.",
  "Este navegador não permite compartilhar a tela.": "This browser does not support screen sharing.",
  "Esta fonte não oferece áudio. No Chrome, marque “Compartilhar áudio” no seletor.": "This source has no audio. In Chrome, select “Share audio” in the picker."
}};
let language=LS.get('language','pt-BR'),theme=LS.get('theme','dark');
const tr=s=>language==='en'?(translations.en[s]||s):s;
const errorTranslations={bad_nick:'Invalid nickname. Use 2–20 letters, numbers, spaces, underscores, dots or hyphens.',no_room:'Room not found. Check the code.',locked:'This room is locked.',full:'This room is full.',nick_taken:'This nickname is already in use in this room.',rate_limit:'Too many messages. Please wait a moment and try again.',bad_password:'Incorrect password.',password_invalid:'Password must have at most 128 characters.'};
const serverError=m=>language==='en'?(errorTranslations[m.code]||'The server could not complete your request.'):m.text;
Object.assign(translations.en,{'Escolha um nome e conecte-se. Sem cadastro, e-mail ou telefone.':'Choose a name and connect. No sign-up, email or phone number.','Opções da sala':'Room options','Nome, privacidade e senha':'Name, privacy and password','A sala tem senha?':'Does the room have a password?','UM ESPAÇO PARA ESTAR JUNTO':'A SPACE TO BE TOGETHER','Boas ideias':'Good ideas','começam':'start','aqui.':'here.','Conversas mais próximas, ideias compartilhadas e um espaço que é todo seu.':'Closer conversations, shared ideas and a space that feels like yours.','BEM-VINDO AO LUMEN':'WELCOME TO LUMEN','Personalizar':'Customize','Seu espaço, do seu jeito.':'Your space, your way.','Preferências guardadas apenas neste dispositivo.':'Preferences are stored only on this device.','Descrição da sala (opcional)':'Room description (optional)','Senha para criar sala (opcional)':'Room password (optional)','Senha da sala (se houver)':'Room password (if required)','Senha incorreta.':'Incorrect password.','Novas mensagens ↓':'New messages ↓','Copiar mensagem':'Copy message','Mensagem copiada':'Message copied','Enviando…':'Sending…','✦  Personalizar':'✦  Customize','FEITO PARA CONECTAR':'MADE TO CONNECT','/ SEU ESPAÇO':'/ YOUR SPACE'});
const staticText=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement.closest('script,style'))continue;const original=node.nodeValue;const trimmed=original.trim();if(Object.prototype.hasOwnProperty.call(translations.en,trimmed))staticText.push([node,original,trimmed])}
const staticAttrs=[];document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>['placeholder','title','aria-label'].forEach(attr=>{if(el.hasAttribute(attr))staticAttrs.push([el,attr,el.getAttribute(attr)])}));
function applyPreferences(){
  document.documentElement.lang=language;document.documentElement.dataset.theme=theme;document.title=language==='en'?'Lumen — screen sharing':'Lumen — compartilhamento de tela';
  staticText.forEach(([node,original,trimmed])=>{node.nodeValue=original.replace(trimmed,tr(trimmed))});
  staticAttrs.forEach(([el,attr,value])=>el.setAttribute(attr,tr(value)));
  document.querySelectorAll('.prefs').forEach(box=>{
    box.replaceChildren();const lang=E('select'),mode=E('select');lang.setAttribute('aria-label',language==='en'?'Language':'Idioma');mode.setAttribute('aria-label',language==='en'?'Theme':'Tema');
    [['pt-BR','Português'],['en','English']].forEach(([v,t])=>{const o=E('option','',t);o.value=v;lang.append(o)});
    [['dark',language==='en'?'Dark':'Escuro'],['light',language==='en'?'Light':'Claro']].forEach(([v,t])=>{const o=E('option','',t);o.value=v;mode.append(o)});
    lang.value=language;mode.value=theme;lang.onchange=()=>{language=lang.value;LS.set('language',language);applyPreferences();if(inRoom)renderAll();if($('#dlg').open)openSettings()};mode.onchange=()=>{theme=mode.value;LS.set('theme',theme);window.dispatchEvent(new Event('lumen-base-theme'));applyPreferences()};box.append(lang,mode);
  });
  document.querySelectorAll('.studio-trigger').forEach(button=>button.textContent=language==='en'?'✦  Customize':'✦  Personalizar');
  window.dispatchEvent(new Event('lumen-language'));
}
applyPreferences();
Object.assign(translations.en,{'Não foi possível receber a transmissão':'Unable to receive the stream','Parar compartilhamento (S)':'Stop sharing (S)','Toque para ativar o áudio':'Click to enable audio','O dispositivo foi desconectado.':'The device was disconnected.','Conectando à sala…':'Connecting to the room…'});
const DEF={res:1080,fps:30,kbps:4000,hint:'detail',surface:'any',sysAudio:true,echo:true,noise:true,agc:true,mic:'',cam:'',spk:'',out:100,mirror:true,camres:720,camfps:30,camfit:'cover'};
const cfg={...DEF,...LS.get('cfg',{})};
let uid=sessionStorage.getItem('lumen-uid');if(!uid){uid=crypto.randomUUID();sessionStorage.setItem('lumen-uid',uid)}
let myNick=LS.get('nick','');

const API=location.hostname==='thatdp.github.io'?'https://lumen-server-xiye.onrender.com':location.origin;
let joinSecret='',connectStarted=0;
let ws,me,room,role,peers=new Map(),ICE=[],inRoom=false,joined=false,kicked=false,retry=0,view=null,zoom=1,lastWatch,AC,attempt=0,retryTimer,iceRefreshTimer,connecting=false;
const local={mic:null,cam:null,screen:null};
const tx=o=>{if(!ws||ws.readyState!==WebSocket.OPEN)return false;ws.send(JSON.stringify(o));return true};
const hue=id=>{let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))%360;return h};
const initial=n=>[...n][0].toUpperCase();
function toast(t,k){const e=E('div','toast '+(k||''),t);$('#toasts').append(e);setTimeout(()=>e.classList.add('out'),3200);setTimeout(()=>e.remove(),3700)}
function fail(e,what){if(language==='en'){const device=({'o microfone':'microphone','a câmera':'camera','a tela':'screen'})[what]||what;return toast(e.name==='NotAllowedError'?`Permission to access the ${device} was denied. Check your browser settings.`:e.name==='NotFoundError'?`No ${device} device was found.`:`Unable to access the ${device}: ${e.message}`,'err')}toast(e.name==='NotAllowedError'?`Permissão negada para ${what}. Libere o acesso nas configurações do navegador.`:e.name==='NotFoundError'?`Nenhum dispositivo de ${what} encontrado.`:`Não foi possível acessar ${what}: ${e.message}`,'err')}
