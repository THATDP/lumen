'use strict';
const streamOf=(p,k)=>Object.values(p.media).find(s=>p.st.streams&&p.st.streams[s.id]===k);
function dropLocal(k){
  const s=local[k];if(!s)return;const ts=s.getTracks();ts.forEach(t=>t.stop());
  peers.forEach(p=>p.pc.getSenders().forEach(se=>{if(se.track&&ts.includes(se.track)){try{p.pc.removeTrack(se)}catch{}}}));
  local[k]=null;if(k==='mic')clearMeter(me);
}
function addLocal(k,s){local[k]=s;peers.forEach(p=>s.getTracks().forEach(t=>p.pc.addTrack(t,s)));if(k!=='screen')s.getTracks()[0].onended=()=>{if(local[k]===s){dropLocal(k);sendState();renderAll();toast(tr('O dispositivo foi desconectado.'),'err')}}}
function myst(){
  const streams={};for(const k in local)if(local[k])streams[local[k].id]=k==='mic'?'voice':k;
  return{mic:!!local.mic&&local.mic.getAudioTracks()[0].enabled,cam:!!local.cam,share:!!local.screen,watch:view&&view!==me?view:null,streams};
}
const sendState=()=>tx({t:'state',st:myst()});
/* taxa de bits / FPS / prioridade do vídeo de tela */
function shape(p){
  const s=local.screen;if(!s)return;
  p.pc.getSenders().forEach(se=>{
    if(!se.track||se.track.kind!=='video'||!s.getTracks().includes(se.track))return;
    const q=se.getParameters();if(!q.encodings||!q.encodings.length)return;
    Object.assign(q.encodings[0],{maxBitrate:cfg.kbps*1000,maxFramerate:cfg.fps});
    q.degradationPreference=cfg.hint==='detail'?'maintain-resolution':'maintain-framerate';
    se.setParameters(q).catch(()=>{});
  });
}
function applyShare(){
  if(!local.screen)return;const v=local.screen.getVideoTracks()[0];v.contentHint=cfg.hint;
  v.applyConstraints({frameRate:{ideal:cfg.fps},height:{ideal:cfg.res}}).catch(()=>{});peers.forEach(shape);
}
const audioC=()=>({deviceId:cfg.mic?{exact:cfg.mic}:undefined,echoCancellation:cfg.echo,noiseSuppression:cfg.noise,autoGainControl:cfg.agc});
const videoC=()=>({deviceId:cfg.cam?{exact:cfg.cam}:undefined,width:{ideal:Math.round(cfg.camres*16/9)},height:{ideal:cfg.camres},frameRate:{ideal:cfg.camfps}});

const capturing=new Set();
async function capture(k,fn){if(capturing.has(k))return null;capturing.add(k);const token=attempt;try{const stream=await fn();if(token!==attempt||!inRoom){stream.getTracks().forEach(t=>t.stop());return null}return stream}finally{capturing.delete(k)}}
async function toggleMic(){
  if(!local.mic){
    try{const stream=await capture('mic',()=>navigator.mediaDevices.getUserMedia({audio:audioC()}));if(!stream)return;addLocal('mic',stream)}catch(e){return fail(e,'o microfone')}
    meterOn(me,local.mic);
  }else{const t=local.mic.getAudioTracks()[0];t.enabled=!t.enabled}
  sendState();renderAll();roomSound(myst().mic?'micOn':'micOff',true);
}
async function toggleCam(){
  if(local.cam){dropLocal('cam')}else{try{const stream=await capture('cam',()=>navigator.mediaDevices.getUserMedia({video:videoC()}));if(!stream)return;addLocal('cam',stream)}catch(e){return fail(e,'a câmera')}}
  sendState();renderAll();
}
async function toggleShare(){
  if(local.screen)return stopShare();
  if(!navigator.mediaDevices?.getDisplayMedia)return toast(tr('Este navegador não permite compartilhar a tela.'),'err');
  const v={width:{ideal:Math.round(cfg.res*16/9)},height:{ideal:cfg.res},frameRate:{ideal:cfg.fps}};if(cfg.surface!=='any')v.displaySurface=cfg.surface;
  try{
    const s=await capture('screen',()=>navigator.mediaDevices.getDisplayMedia({video:v,audio:cfg.sysAudio?{echoCancellation:false,noiseSuppression:false,autoGainControl:false}:false}));
    if(!s)return;addLocal('screen',s);const vt=s.getVideoTracks()[0];vt.contentHint=cfg.hint;vt.onended=stopShare;
    if(cfg.sysAudio&&!s.getAudioTracks().length)toast(tr('Esta fonte não oferece áudio. No Chrome, marque “Compartilhar áudio” no seletor.'));
    view=me;sendState();renderAll();roomSound('shareStart',true);
  }catch(e){if(e.name!=='NotAllowedError'||!/dismiss|cancel/i.test(e.message))fail(e,'a tela')}
}
function stopShare(){if(!local.screen)return;dropLocal('screen');if(view===me)view=null;sendState();renderAll();roomSound('shareStop',true)}
// Serializar trocas do mesmo dispositivo impede tracks e senders obsoletos.
const swapQueues={};
function swap(k){
  const token=attempt, previous=swapQueues[k]||Promise.resolve();
  const next=previous.then(()=>{if(token===attempt)return swapDevice(k)});
  swapQueues[k]=next;next.then(()=>{if(swapQueues[k]===next)delete swapQueues[k]},()=>{if(swapQueues[k]===next)delete swapQueues[k]});
  return next;
}
async function swapDevice(k){
  const s=local[k];if(!s||!inRoom)return;const old=s.getTracks()[0];if(!old)return;const was=old.enabled;
  try{
    const replacement=await navigator.mediaDevices.getUserMedia(k==='mic'?{audio:audioC()}:{video:videoC()});if(local[k]!==s||!inRoom){replacement.getTracks().forEach(t=>t.stop());return}const nt=replacement.getTracks()[0];nt.enabled=was;nt.onended=()=>{if(local[k]===s&&s.getTracks().includes(nt)){dropLocal(k);sendState();renderAll();toast(tr('O dispositivo foi desconectado.'),'err')}};
    await Promise.all([...peers.values()].map(async p=>{const se=p.pc.getSenders().find(x=>x.track===old);if(!se)return;try{await se.replaceTrack(nt)}catch(e){if(p.pc.signalingState!=='closed'){p.pc.removeTrack(se);p.pc.addTrack(nt,s)}}}));
    if(local[k]!==s||!inRoom){nt.stop();return}
    s.removeTrack(old);old.stop();s.addTrack(nt);if(k==='mic')meterOn(me,s);
  }catch(e){fail(e,k==='mic'?'o microfone':'a câmera')}
}

/* ---------- Áudio: reprodução, volume por pessoa e atividade de voz ---------- */
function syncAudio(p){
  const s=streamOf(p,'voice');if(!p.au){p.au=new Audio();p.au.autoplay=true}
  if(p.au.srcObject!==(s||null)){p.au.srcObject=s||null;meterOn(p.id,s);if(s)p.au.play().catch(()=>toast(tr('Toque para ativar o áudio'),'err'))}
  p.au.volume=p.localMuted?0:Math.min(1,p.vol*cfg.out/100);
  if(p.au.setSinkId)p.au.setSinkId(cfg.spk||'').catch(()=>{});
}
function applyOutputVolume(){const v=$('#vid');v.volume=(+$('#sv').value/100)*(cfg.out/100);peers.forEach(syncAudio)}
const meters=new Map();
function clearMeter(id){const m=meters.get(id);if(m)m.source.disconnect();meters.delete(id)}
function meterOn(id,s){
  clearMeter(id);if(!s||!s.getAudioTracks().length)return;if(!window.AudioContext)return;AC=AC||new AudioContext();
  const a=AC.createAnalyser();a.fftSize=512;const source=AC.createMediaStreamSource(s);source.connect(a);meters.set(id,{a,source,b:new Uint8Array(512)});
}
document.addEventListener('click',()=>{if(AC&&AC.state==='suspended')AC.resume();peers.forEach(p=>{if(p.au?.srcObject&&p.au.paused)p.au.play().catch(()=>{})});const v=$('#vid');if(v.srcObject&&v.paused)v.play().catch(()=>{})});
setInterval(()=>meters.forEach((m,id)=>{
  m.a.getByteTimeDomainData(m.b);let x=0;for(const v of m.b)x=Math.max(x,Math.abs(v-128));const on=x>12;
  const t=tiles.get(id);if(t)t.classList.toggle('speaking',on);
  const r=$(`#ppl [data-id="${id}"]`);if(r)r.classList.toggle('speaking',on);
}),120);
