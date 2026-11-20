'use strict';
// The workspace moves existing media elements only once, before joining. Subsequent
// layout operations change geometry, never the WebRTC transports or media nodes.
(() => {
  const main=document.querySelector('.main'), left=main.querySelector('.left'), side=main.querySelector('.side');
  const footer=document.querySelector('#app > footer'), nav=side.querySelector('nav');
  const workspace=document.createElement('div');workspace.id='workspace';workspace.setAttribute('aria-label',L('Área de trabalho da sala','Room workspace'));
  const toolbar=document.createElement('div');toolbar.className='workspace-toolbar';
  const canvas=document.createElement('div');canvas.id='workspace-canvas';
  const defs=[
    ['stage','Transmissão','Screen share',document.querySelector('#stage')],
    ['camera','Câmeras','Cameras',document.querySelector('#tiles')],
    ['chat','Chat','Chat',document.querySelector('#chat')],
    ['ppl','Participantes','Participants',document.querySelector('#ppl')],
    ['game','Jogos','Games',document.querySelector('#game')],
    ['shared','Mídia','Media',document.querySelector('#shared-media')],
    ['controls','Controles','Controls',footer]
  ];
  const defaults={
    desktop:{stage:{x:0,y:0,w:67,h:63},camera:{x:0,y:64,w:67,h:24},chat:{x:68,y:0,w:32,h:88},ppl:{x:68,y:0,w:32,h:50,hidden:true},game:{x:36,y:6,w:42,h:75,hidden:true},shared:{x:10,y:5,w:55,h:70,hidden:true},controls:{x:0,y:89,w:67,h:11}},
    mobile:{stage:{x:0,y:0,w:100,h:21},camera:{x:0,y:22,w:100,h:13},chat:{x:0,y:36,w:100,h:36},ppl:{x:0,y:36,w:100,h:30,hidden:true},game:{x:0,y:36,w:100,h:35,hidden:true},shared:{x:0,y:36,w:100,h:35,hidden:true},controls:{x:0,y:73,w:100,h:9}}
  };
  const clone=o=>JSON.parse(JSON.stringify(o));
  const key='lumen-workspace-v1';
  const saved=LS.get(key,{});let layouts=Object.assign(Object.create(null),saved.layouts&&typeof saved.layouts==='object'?saved.layouts:{});
  let geometry=saved.current&&typeof saved.current==='object'?saved.current:clone(defaults);
  for(const mode of ['desktop','mobile'])for(const [id] of defs){const v=geometry[mode]?.[id];if(!v||!['x','y','w','h'].every(k=>Number.isFinite(v[k]))) {geometry[mode] ||= {};geometry[mode][id]=clone(defaults[mode][id])}}
  const mode=()=>matchMedia('(max-width: 700px)').matches?'mobile':'desktop';
  const panels=new Map(),panelUI=new Map();let top=2,drag=null;
  const persist=()=>LS.set(key,{current:geometry,layouts});
  const label=(pt,en)=>L(pt,en);
  function panelButton(text,title,fn){const b=document.createElement('button');b.type='button';b.className='workspace-action';b.textContent=text;b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;return b}
  function setHidden(id,value){geometry[mode()][id].hidden=value;apply();persist()}
  function apply(){
    const state=geometry[mode()];
    for(const [id,panel] of panels){
      const r=state[id];r.w=Math.max(12,Math.min(100,r.w));r.h=Math.max(5,Math.min(100,r.h));r.x=Math.max(0,Math.min(100-r.w,r.x));r.y=Math.max(0,Math.min(100-r.h,r.y));
      panel.hidden=!!r.hidden;panel.classList.toggle('minimized',!!r.minimized);
      Object.assign(panel.style,{left:r.x+'%',top:r.y+'%',width:r.w+'%',height:(r.minimized?Math.max(3,Math.min(r.h,42/canvas.clientHeight*100)):r.h)+'%'});
      const toggle=toolbar.querySelector(`[data-show="${id}"]`);if(toggle)toggle.setAttribute('aria-pressed',String(!r.hidden));
    }
  }
  function bring(panel){panel.style.zIndex=String(++top)}
  const guide=document.createElement('div');guide.className='workspace-guide';guide.hidden=true;canvas.append(guide);
  function begin(e,id,edge){
    if(e.button!==0)return;const panel=panels.get(id),r=geometry[mode()][id];bring(panel);
    const rect=canvas.getBoundingClientRect();drag={id,edge,startX:e.clientX,startY:e.clientY,rect,original:{...r},pointer:e.pointerId};
    e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
  }
  function move(e){
    if(!drag||drag.pointer!==e.pointerId)return;
    const {id,edge,original,rect,startX,startY}=drag,r=geometry[mode()][id],dx=(e.clientX-startX)/rect.width*100,dy=(e.clientY-startY)/rect.height*100;
    let x=original.x,y=original.y,w=original.w,h=original.h;
    if(edge==='move'){x=Math.max(0,Math.min(100-w,x+dx));y=Math.max(0,Math.min(100-h,y+dy))}
    else {const minW=Math.min(100,180/rect.width*100),minH=Math.min(100,110/rect.height*100);
      if(edge.includes('e'))w=Math.max(minW,Math.min(100-x,original.w+dx));
      if(edge.includes('s'))h=Math.max(minH,Math.min(100-y,original.h+dy));
      if(edge.includes('w')){x=Math.max(0,Math.min(original.x+original.w-minW,original.x+dx));w=original.x+original.w-x}
      if(edge.includes('n')){y=Math.max(0,Math.min(original.y+original.h-minH,original.y+dy));h=original.y+original.h-y}
    }
    // Snap only while moving, to both canvas edges and other panel edges.
    let snapX=null,snapY=null;const threshold=10/rect.width*100,thresholdY=10/rect.height*100;
    if(edge==='move'){
      const xs=[0,100],ys=[0,100];for(const [other,panel] of panels){if(other===id||panel.hidden)continue;const q=geometry[mode()][other];xs.push(q.x,q.x+q.w);ys.push(q.y,q.y+(q.minimized?42/rect.height*100:q.h))}
      for(const target of xs){if(Math.abs(x-target)<threshold){x=target;snapX=target;break}if(Math.abs(x+w-target)<threshold){x=target-w;snapX=target;break}}
      for(const target of ys){if(Math.abs(y-target)<thresholdY){y=target;snapY=target;break}if(Math.abs(y+h-target)<thresholdY){y=target-h;snapY=target;break}}
    }
    Object.assign(r,{x:Math.max(0,Math.min(100-w,x)),y:Math.max(0,Math.min(100-h,y)),w,h});
    guide.hidden=snapX===null&&snapY===null;guide.style.cssText=snapX!==null?`left:${snapX}%;top:0;width:2px;height:100%`:`left:0;top:${snapY}%;width:100%;height:2px`;apply();
  }
  function end(e){if(!drag||drag.pointer!==e.pointerId)return;drag=null;guide.hidden=true;persist()}
  for(const [id,pt,en,element] of defs){
    element.hidden=false;
    const panel=document.createElement('section');panel.className='workspace-panel';panel.dataset.panel=id;panel.setAttribute('aria-label',label(pt,en));
    const head=document.createElement('div');head.className='workspace-head';
    const handle=panelButton('⠿ '+label(pt,en),label('Mover '+pt,'Move '+en),()=>{});handle.classList.add('workspace-handle');handle.addEventListener('pointerdown',e=>begin(e,id,'move'));handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
    // Arrow keys move a panel; Shift+arrows resize it.
    handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const r=geometry[mode()][id],axis=e.key==='ArrowLeft'||e.key==='ArrowRight'?'x':'y',delta=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;if(e.shiftKey)r[axis==='x'?'w':'h']+=delta;else r[axis]+=delta;bring(panel);apply();persist()};
    const minimize=panelButton('−',label('Minimizar ou restaurar '+pt,'Minimize or restore '+en),()=>{const r=geometry[mode()][id];r.minimized=!r.minimized;apply();persist()});
    const maximize=panelButton('□',label('Maximizar ou restaurar '+pt,'Maximize or restore '+en),()=>{const r=geometry[mode()][id];if(r.restore){Object.assign(r,r.restore);delete r.restore}else {r.restore={x:r.x,y:r.y,w:r.w,h:r.h};Object.assign(r,{x:0,y:0,w:100,h:100,minimized:false})}bring(panel);apply();persist()});
    const hide=panelButton('×',label('Ocultar '+pt,'Hide '+en),()=>setHidden(id,true));
    head.append(handle);if(id==='camera'){const select=document.createElement('select');select.className='camera-layout';select.setAttribute('aria-label',label('Organização das câmeras','Camera arrangement'));for(const [v,pt,en] of [['strip','Faixa','Strip'],['grid','Grade','Grid'],['vertical','Vertical','Vertical'],['gallery','Galeria','Gallery']]){const o=document.createElement('option');o.value=v;o.textContent=label(pt,en);select.append(o)}select.value=options.mode;select.onchange=()=>{options.mode=select.value;saveRoomOptions()};head.append(select);const cameraOptions=document.createElement('details');cameraOptions.className='camera-options';const summary=document.createElement('summary');summary.textContent='⚙';summary.setAttribute('aria-label',label('Opções das câmeras','Camera options'));const settings=document.createElement('div');settings.className='camera-options-body';for(const [key,pt,en,min,max] of [['columns','Colunas','Columns',1,6],['gap','Espaçamento','Spacing',2,24]]){const row=document.createElement('label');row.textContent=label(pt,en);const range=document.createElement('input');range.type='range';range.min=min;range.max=max;range.value=options[key];range.oninput=()=>{options[key]=+range.value;saveRoomOptions()};row.append(range);settings.append(row)}cameraOptions.append(summary,settings);head.append(cameraOptions)}head.append(minimize,maximize,hide);const content=document.createElement('div');content.className='workspace-content';content.append(element);if(id==='game')content.append(document.querySelector('#chess'));panel.append(head,content);
    for(const edge of ['n','s','e','w','ne','nw','se','sw']){const h=document.createElement('div');h.className='resize-handle resize-'+edge;h.dataset.edge=edge;h.addEventListener('pointerdown',e=>begin(e,id,edge));h.addEventListener('pointermove',move);h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);panel.append(h)}
    panel.addEventListener('pointerdown',()=>bring(panel));panels.set(id,panel);canvas.append(panel);
    const show=panelButton(label(pt,en),label('Mostrar ou ocultar '+pt,'Show or hide '+en),()=>{const r=geometry[mode()][id];r.hidden=!r.hidden;if(!r.hidden){r.minimized=false;bring(panel)}apply();persist()});show.dataset.show=id;toolbar.append(show);panelUI.set(id,{pt,en,panel,handle,minimize,maximize,hide,show});
  }
  // Existing navigation shortcuts still open the corresponding independent panel.
  nav.querySelectorAll('button').forEach(b=>{b.onclick=()=>{const id=b.dataset.p;setHidden(id,false);geometry[mode()][id].minimized=false;bring(panels.get(id));apply();persist()}});
  const menu=document.createElement('details');menu.className='layout-menu';const summary=document.createElement('summary');summary.textContent=label('Layouts','Layouts');menu.append(summary);
  const menuBody=document.createElement('div');menuBody.className='layout-menu-body';menu.append(menuBody);
  function renderMenu(){menuBody.replaceChildren();
    menuBody.append(panelButton(label('Salvar layout…','Save layout…'),label('Salvar layout com nome','Save named layout'),()=>{const name=prompt(label('Nome do layout','Layout name'));if(!name||!name.trim())return;const n=name.trim().slice(0,40);if(!Object.hasOwn(layouts,n)&&Object.keys(layouts).length>=20){toast(label('Limite de 20 layouts.','Maximum of 20 layouts.'),'err');return}layouts[n]=clone(geometry);persist();renderMenu()}));
    menuBody.append(panelButton(label('Restaurar padrão','Reset to default'),label('Restaurar layout padrão','Reset default layout'),()=>{geometry[mode()]=clone(defaults[mode()]);persist();apply()}));
    for(const name of Object.keys(layouts)){const row=document.createElement('div');row.className='layout-saved';row.append(panelButton(name,label('Carregar ','Load ')+name,()=>{geometry=clone(layouts[name]);persist();apply();menu.open=false}),panelButton('×',label('Excluir ','Delete ')+name,()=>{delete layouts[name];persist();renderMenu()}));menuBody.append(row)}
  }
  toolbar.append(menu);renderMenu();toolbar.append(nav);nav.className='workspace-shortcuts';
  main.replaceChildren(workspace);workspace.append(toolbar,canvas);document.querySelector('#app').classList.add('workspace-app');
  window.addEventListener('resize',apply);window.addEventListener('lumen-language',()=>{for(const {pt,en,panel,handle,minimize,maximize,hide,show} of panelUI.values()){const name=label(pt,en);panel.setAttribute('aria-label',name);handle.textContent='⠿ '+name;for(const [el,title] of [[handle,label('Mover '+pt,'Move '+en)],[minimize,label('Minimizar ou restaurar '+pt,'Minimize or restore '+en)],[maximize,label('Maximizar ou restaurar '+pt,'Maximize or restore '+en)],[hide,label('Ocultar '+pt,'Hide '+en)],[show,label('Mostrar ou ocultar '+pt,'Show or hide '+en)]]){el.title=title;el.setAttribute('aria-label',title)}show.textContent=name}renderMenu();renderChess(chessState);renderSharedMedia(sharedMediaState)});
  window.lumenApplyLayout=apply;apply();
})();
