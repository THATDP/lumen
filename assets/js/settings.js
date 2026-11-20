'use strict';
/* ---------- Configurações (persistem em localStorage; aplicadas na hora) ---------- */
const FIELDS=[
 ['Áudio',[['mic','Microfone','dev:audioinput'],['spk','Saída de áudio','dev:audiooutput'],['out','Volume de saída','range'],['echo','Cancelamento de eco','bool'],['noise','Supressão de ruído','bool'],['agc','Ganho automático do microfone','bool']]],
 ['Vídeo',[['cam','Câmera','dev:videoinput'],['mirror','Espelhar minha câmera','bool']]],
 ['Compartilhamento de tela',[['res','Resolução máxima','sel',[[720,'720p'],[1080,'1080p'],[1440,'1440p']]],['fps','Quadros por segundo','sel',[15,30,60]],['kbps','Taxa de bits máxima','sel',[[1500,'1,5 Mbps'],[3000,'3 Mbps'],[4000,'4 Mbps'],[6000,'6 Mbps'],[10000,'10 Mbps']]],['hint','Prioridade','sel',[['detail','Nitidez (texto, código)'],['motion','Fluidez (jogos, vídeo)']]],['surface','Fonte sugerida','sel',[['any','Escolher no navegador'],['monitor','Tela inteira'],['window','Janela'],['browser','Aba do navegador']]],['sysAudio','Capturar áudio do sistema','bool']]]
];
function setCfg(k,v){
  cfg[k]=v;LS.set('cfg',cfg);toast(tr('Preferência salva'));
  if(['mic','echo','noise','agc'].includes(k)&&local.mic)swap('mic');
  if(k==='cam'&&local.cam)swap('cam');
  if(['spk','out'].includes(k)){peers.forEach(syncAudio);if(k==='spk'&&vid.setSinkId)vid.setSinkId(cfg.spk||'').catch(()=>{})}
  if(['res','fps','kbps','hint'].includes(k))applyShare();
  if(k==='mirror')renderTiles();
}
let activeSettings='Conta';
async function openSettings(){
  const devs=await (navigator.mediaDevices?.enumerateDevices()||Promise.resolve([])).catch(()=>[]),box=$('#sbody');box.replaceChildren();
  const nav=E('nav','settings-nav'),panels=E('div','settings-panels');box.append(nav,panels);
  const pane=title=>{const section=E('section','settings-pane'),button=E('button','',tr(title));button.type='button';button.onclick=()=>{activeSettings=title;nav.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===button));panels.querySelectorAll('section').forEach(x=>x.hidden=x!==section)};button.classList.toggle('on',title===activeSettings);section.hidden=title!==activeSettings;nav.append(button);panels.append(section);section.append(E('h3','',tr(title)));return section};
  const account=pane('Conta');
  const nr=E('div','set');nr.append(E('span','',tr('Nickname (apenas desta sala; fica salvo neste navegador)')));
  const ni=E('input');ni.value=myNick;ni.maxLength=20;const nb=E('button','btn',tr('Alterar'));nb.onclick=()=>{if(ni.value.trim()&&ni.value.trim()!==myNick)tx({t:'nick',nick:ni.value})};
  nr.append(ni,nb);account.append(nr);
  for(const[title,list]of FIELDS){
    const panel=pane(title);
    for(const[k,label,type,opts]of list){
      const row=E('label','set');let c,l=tr(label);
      if(type==='bool'){c=E('input');c.type='checkbox';c.checked=cfg[k];c.onchange=()=>setCfg(k,c.checked)}
      else if(type==='range'){c=E('input');c.type='range';c.min=0;c.max=100;c.value=cfg[k];c.oninput=()=>setCfg(k,+c.value)}
      else{
        c=E('select');
        const items=type.startsWith('dev')?[['','Padrão do sistema'],...devs.filter(d=>d.kind===type.slice(4)).map(d=>[d.deviceId,d.label||'Dispositivo (libere a permissão para ver o nome)'])]:opts.map(o=>Array.isArray(o)?o:[o,o]);
        items.forEach(([v,t])=>{const o=E('option','',tr(t));o.value=v;c.append(o)});c.value=cfg[k];
        c.onchange=()=>setCfg(k,typeof DEF[k]==='number'?+c.value:c.value);
        if(k==='spk'&&!('setSinkId'in HTMLMediaElement.prototype)){c.disabled=true;l+=tr(' (não suportado neste navegador)')}
      }
      row.append(E('span','',l),c);panel.append(row);
    }
  }
  const diagnostics=pane('Diagnóstico');
  const pre=E('pre','');pre.id='diag';pre.textContent=tr('Toque em “Atualizar” com alguém conectado à sala.');
  const rb=E('button','btn',tr('Atualizar'));rb.onclick=()=>diag(pre);
  const db=E('button','btn',tr('Restaurar configurações padrão'));db.style.marginLeft='8px';db.onclick=()=>{Object.assign(cfg,DEF);LS.set('cfg',cfg);['mic','cam'].forEach(k=>local[k]&&swap(k));applyShare();peers.forEach(syncAudio);renderTiles();openSettings();toast(tr('Configurações restauradas'))};
  diagnostics.append(pre,rb,db);if(!$('#dlg').open)$('#dlg').showModal();
}
async function diag(out){
  const p=[...peers.values()][0];if(!p)return out.textContent=tr('Sem conexões ativas: entre numa sala com mais alguém.');
  const o={lost:0};(await p.pc.getStats()).forEach(r=>{
    if(r.type==='candidate-pair'&&r.nominated&&r.state==='succeeded'){o.rtt=Math.round(r.currentRoundTripTime*1000)+' ms';o.bw=Math.round((r.availableOutgoingBitrate||0)/1000)+' kbps'}
    if(r.type==='inbound-rtp'){o.lost+=r.packetsLost||0;if(r.jitter!=null)o.jitter=Math.round(r.jitter*1000)+' ms'}
    if(r.type==='codec'&&r.mimeType.startsWith('video'))o.codec=r.mimeType;
  });
  const labels=language==='en'?['Peer','ICE connection','Latency (RTT)','Jitter','Packets lost','Estimated outgoing bandwidth','Video codec','ICE servers']:['Parceiro','Conexão ICE','Latência (RTT)','Jitter','Pacotes perdidos','Banda estimada de saída','Codec de vídeo','Servidores ICE'];
  out.textContent=[p.nick,p.pc.iceConnectionState,o.rtt||'—',o.jitter||'—',o.lost,o.bw||'—',o.codec||'—',ICE.map(s=>[].concat(s.urls).join(', ')).join(' | ')].map((v,i)=>labels[i]+': '+v).join('\n');
}
$('#setBtn').onclick=openSettings;$('#dx').onclick=()=>$('#dlg').close();
