'use strict';
// Only an official YouTube IFrame player is used; no media goes through Lumen.
let sharedMediaState=null,sharedMediaReceived=0,ytPlayer=null,ytReady=false,ytId=null,ytLoading=false,ytFailed=false;
const mediaRoot=$('#shared-media');
mediaRoot.innerHTML='<div class="shared-body"><p class="room-muted" id="media-description"></p><div id="media-player-wrap"><div id="media-player"></div></div><p id="media-status" class="room-muted" role="status"></p><form id="media-form"><input id="media-url" type="url" maxlength="500" required><button class="room-btn" type="submit"></button></form><div id="media-controls"></div><div id="media-queue"></div></div>';
$('#media-form').onsubmit=e=>{e.preventDefault();const input=$('#media-url');if(tx({t:'media',action:'add',url:input.value}))input.value=''};
function loadYouTube(){
 if(window.YT?.Player){createYouTube();return}if(ytLoading||ytFailed)return;ytLoading=true;
 window.onYouTubeIframeAPIReady=()=>{ytLoading=false;createYouTube()};const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{ytLoading=false;ytFailed=true;$('#media-status').textContent=L('Não foi possível carregar o player do YouTube.','Could not load the YouTube player.')};document.head.append(script);
}
function createYouTube(){if(ytPlayer||!sharedMediaState?.queue.length)return;const id=sharedMediaState.queue[0].video;ytId=id;
 ytPlayer=new YT.Player('media-player',{height:'100%',width:'100%',videoId:id,playerVars:{playsinline:1,origin:location.origin},events:{
  onReady:e=>{if(!sharedMediaState?.queue.length||!ytPlayer||e.target!==ytPlayer)return;ytReady=true;ytPlayer.setVolume(+LS.get('shared-media-volume',70));applyMediaPlayback(true)},
  onError:()=>{$('#media-status').textContent=L('Vídeo indisponível ou incorporação bloqueada pelo YouTube.','Video unavailable or embedding blocked by YouTube.')},
  onStateChange:e=>{if(e.data===0&&sharedMediaState?.playing&&(role==='host'||sharedMediaState.permission==='all'))tx({t:'media',action:'next',id:sharedMediaState.queue[0].id})}
 }});
}
function desiredPosition(){return Math.min(21600,Math.max(0,sharedMediaState.position+(sharedMediaState.playing?(Date.now()-sharedMediaReceived)/1000:0)))}
function applyMediaPlayback(force=false){
 if(!sharedMediaState?.queue.length||!ytReady||!ytPlayer)return;try{
  const id=sharedMediaState.queue[0].video;if(id!==ytId){ytId=id;ytPlayer.cueVideoById(id);force=true}
  const desired=desiredPosition(),actual=ytPlayer.getCurrentTime();if(force||Math.abs(actual-desired)>3)ytPlayer.seekTo(desired,true);
  if(sharedMediaState.playing)ytPlayer.playVideo();else ytPlayer.pauseVideo();
 }catch(e){console.warn('Shared media playback',e)}
}
function renderSharedMedia(state){
 if(!state||state!==sharedMediaState)sharedMediaReceived=Date.now();sharedMediaState=state;const desc=$('#media-description');desc.textContent=L('Vídeos do YouTube via player oficial. A reprodução depende do navegador e das permissões do vídeo.','YouTube videos via the official player. Playback depends on the browser and video permissions.');$('#media-url').placeholder=L('Cole um link do YouTube','Paste a YouTube link');$('#media-url').setAttribute('aria-label',L('Link do YouTube','YouTube link'));$('#media-form button').textContent=L('Adicionar à fila','Add to queue');
 const controls=$('#media-controls'),queue=$('#media-queue');controls.replaceChildren();queue.replaceChildren();if(!state){if(ytPlayer){try{ytPlayer.destroy()}catch{}ytPlayer=null;ytReady=false;ytId=null;$('#media-player-wrap').innerHTML='<div id="media-player"></div>'}return}
 if(state.queue.length){if(!ytPlayer)loadYouTube();else applyMediaPlayback(true)}else if(ytPlayer&&ytReady){ytPlayer.stopVideo();ytId=null}
 const can=role==='host'||state.permission==='all';
 if(role==='host'){const label=E('label','media-permission',L('Quem controla: ','Who controls: ')),select=E('select');for(const [v,pt,en] of [['host','Anfitrião','Host'],['all','Todos','Everyone']]){const o=E('option','',L(pt,en));o.value=v;select.append(o)}select.value=state.permission;select.onchange=()=>tx({t:'media',action:'permission',value:select.value});label.append(select);controls.append(label)}
 if(state.queue.length){
  if(can){controls.append(btn(state.playing?L('Pausar','Pause'):L('Reproduzir','Play'),()=>tx({t:'media',action:state.playing?'pause':'play',id:state.queue[0].id})),btn(L('Próximo','Next'),()=>tx({t:'media',action:'next',id:sharedMediaState.queue[0].id})));
   const seek=E('input');seek.type='number';seek.min='0';seek.max='21600';seek.placeholder=L('Segundos','Seconds');seek.setAttribute('aria-label',L('Ir para segundos','Seek to seconds'));controls.append(seek,btn(L('Ir','Seek'),()=>{if(seek.value!==''&&seek.checkValidity())tx({t:'media',action:'seek',id:state.queue[0].id,position:+seek.value})}));}
  const volume=E('input');volume.type='range';volume.min=0;volume.max=100;volume.value=LS.get('shared-media-volume',70);volume.setAttribute('aria-label',L('Volume da mídia compartilhada','Shared media volume'));volume.oninput=()=>{LS.set('shared-media-volume',+volume.value);if(ytReady)ytPlayer.setVolume(+volume.value)};controls.append(volume,btn(L('Sincronizar neste navegador','Sync this browser'),()=>applyMediaPlayback(true)));
 }
 const heading=E('h4','',L('Fila','Queue'));queue.append(heading);state.queue.forEach((item,i)=>{const row=E('div','media-item'),link=E('a','',`YouTube · ${item.video}`);link.href='https://www.youtube.com/watch?v='+item.video;link.target='_blank';link.rel='noopener noreferrer';row.append(E('span','',`${i+1}. `),link,E('small','room-muted',' · '+item.by));if(can||item.owner===myPid)row.append(btn(L('Remover','Remove'),()=>tx({t:'media',action:'remove',id:item.id})));queue.append(row)});
}
// Drift correction does not change the room state; each client remains subject to
// autoplay, ad breaks and the availability policy of the official player.
setInterval(()=>{if(ytReady&&sharedMediaState?.queue.length&&sharedMediaState.playing){try{const current=ytPlayer.getCurrentTime(),target=desiredPosition();if(Math.abs(current-target)>4)ytPlayer.seekTo(target,true)}catch{}}},5000);
