'use strict';
// Personalization stays on this device. Files are kept as blobs in IndexedDB,
// never transmitted unless the user explicitly selects and shares them for a room.
(() => {
  const t=(pt,en)=>language==='en'?en:pt;
  const $s=s=>document.querySelector(s);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
  const keys=['bg','s1','s2','ln','tx','mu','ac','live','ok'];
  const palettes={
    Dark:['#0b0d15','#141721','#1c1f2b','#303443','#f3f2f8','#a5a7b8','#b5b4ff','#ff748b','#80dfbd'],
    Light:['#f2f3f8','#ffffff','#edf0f6','#d3d8e3','#202533','#606a7a','#4b57c8','#be3151','#087859'],
    Midnight:['#050a19','#0b1328','#121f3a','#243859','#eef4ff','#9eafc8','#83abff','#f27091','#7ae2cd'],
    'AMOLED Black':['#000000','#080808','#151515','#292929','#ffffff','#aaaaaa','#b9adff','#ff7285','#73dfb5'],
    Graphite:['#17191b','#222528','#2c3034','#42474b','#f0f1f1','#aeb5b8','#bac5cb','#eb8585','#9bccad'],
    Ocean:['#061b24','#0b2a37','#103b49','#27505d','#e8f8fa','#9bc0c7','#70cfe0','#fa8892','#8be8c3'],
    Aurora:['#0d1721','#142932','#1b3940','#355a60','#e5f8f5','#9bbfbc','#78dec5','#f787a7','#a3edb9'],
    Sunset:['#24141c','#351f29','#482b32','#68414a','#fff1eb','#d1aaad','#ffb19b','#fa7f8b','#dfcf9b'],
    Lavender:['#1b1629','#29213a','#382d4b','#51445f','#f7efff','#bbaccb','#d0b1ff','#fa89a5','#a6dfc2'],
    Forest:['#101c17','#192a20','#243b2a','#3b5441','#eaf6eb','#a8bfaa','#9cdb95','#ee8b83','#8ee4b5'],
    Minimal:['#f7f7f5','#ffffff','#f0f0ed','#d9dbd6','#202422','#68716b','#51766a','#a93647','#2b7d5d'],
    Glass:['#111424','#1c2036','#292e48','#454b68','#f3f4ff','#adb5cf','#a5bcff','#f68ea9','#86dfcc'],
    Neon:['#090914','#111122','#1d1a31','#383153','#f7f4ff','#b2a8ce','#c6a0ff','#ff73ba','#7af2c6'],
    Monochrome:['#111111','#1c1c1c','#292929','#414141','#f4f4f4','#b1b1b1','#d2d2d2','#e79c9c','#c1dfcc']
  };
  const defaultEffects={opacity:100,radius:18,shadow:40,glow:35};
  const effectsOf=effects=>({...defaultEffects,...effects});
  const defaults={name:'',username:'',bio:'',accent:'#b5b4ff',avatarX:50,avatarY:50,avatarZoom:100,bannerX:50,bannerY:50,bannerZoom:100};
  let profile={...defaults,...LS.get('lumen-profile',{})};
  let customs=LS.get('lumen-custom-themes',[]);if(!Array.isArray(customs))customs=[];
  let active=LS.get('lumen-active-theme','');
  let wall=LS.get('lumen-wallpapers',{});if(!wall||typeof wall!=='object')wall={};
  let access={scale:100,reduce:false,compact:false,...LS.get('lumen-accessibility',{})};
  const urls={};let currentTab='themes', selectedScope='home', draft=null;
  const studio=$s('#studio'),content=$s('#studio-content'),nav=studio.querySelector('.studio-nav');

  const openDB=()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('lumen-local',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('images');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  async function imageStore(mode,key,value){
    const db=await openDB();
    try{return await new Promise((resolve,reject)=>{const tx=db.transaction('images',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('images');let req=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(value,key);let result;req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});}finally{db.close()}
  }
  function objectUrl(key,blob){if(urls[key])URL.revokeObjectURL(urls[key]);if(blob)urls[key]=URL.createObjectURL(blob);else delete urls[key]}
  async function validateImage(file){
    if(!file||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error(t('Use JPG, PNG ou WebP de até 5 MB.','Use a JPG, PNG or WebP image up to 5 MB.'));
    const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
    const valid=(file.type==='image/jpeg'&&b[0]===255&&b[1]===216&&b[2]===255)||(file.type==='image/png'&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))||(file.type==='image/webp'&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP');
    if(!valid)throw Error(t('O arquivo não é uma imagem válida.','This is not a valid image.'));
    const url=URL.createObjectURL(file);
    try{const img=new Image();img.src=url;await img.decode();if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>32000000)throw Error(t('Imagem muito grande. Limite: 32 megapixels.','Image too large. Limit: 32 megapixels.'));}finally{URL.revokeObjectURL(url)}
    return file;
  }
  async function loadImages(){
    for(const key of ['avatar','banner','wall-home','wall-room','wall-settings','wall-profile']){try{const blob=await imageStore('get',key);if(blob)objectUrl(key,blob)}catch(error){console.warn('Local image storage unavailable',error);break}}
    applyWalls();
  }
  // Images are reduced before the explicitly authorized room transmission.
  window.lumenRoomProfile=async selection=>{
    const result={bio:selection.bio?profile.bio:'',color:selection.color?profile.accent:''};
    for(const key of ['avatar','banner']) if(selection[key]){
      const blob=await imageStore('get',key);if(!blob)continue;
      const url=URL.createObjectURL(blob);
      try{const image=new Image();image.src=url;await image.decode();const max=key==='avatar'?96:192,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);let quality=.65;result[key]=canvas.toDataURL('image/jpeg',quality);while(result[key].length>(key==='avatar'?18000:26000)&&quality>.2){quality-=.1;result[key]=canvas.toDataURL('image/jpeg',quality)}}finally{URL.revokeObjectURL(url)}
    }
    return result;
  };
  function applyPalette(colors,effects){const style=document.documentElement.style;keys.forEach((k,i)=>style.setProperty('--'+k,colors[i]));const fx=effectsOf(effects);style.setProperty('--panel-opacity',fx.opacity+'%');style.setProperty('--r',fx.radius+'px');style.setProperty('--shadow-opacity',fx.shadow/100);style.setProperty('--glow-opacity',fx.glow+'%')}
  function applyActive(){
    const custom=customs.find(c=>c.id===active),colors=palettes[active]||custom?.colors;
    if(colors){
      applyPalette(colors,custom?.effects);
      const hex=colors[0],rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
      theme=(rgb[0]*.299+rgb[1]*.587+rgb[2]*.114)>145?'light':'dark';
      LS.set('theme',theme);document.documentElement.dataset.theme=theme;
      document.querySelectorAll('.prefs select:last-child').forEach(select=>select.value=theme);
    }else [...keys,'panel-opacity','r','shadow-opacity','glow-opacity'].forEach(k=>document.documentElement.style.removeProperty('--'+k));
  }
  function setActive(id){active=id;LS.set('lumen-active-theme',id);applyActive();render()}
  window.addEventListener('lumen-base-theme',()=>{active='';LS.set('lumen-active-theme','');applyActive()});
  function wallConfig(scope){return {opacity:50,blur:0,brightness:100,contrast:100,saturation:100,x:50,y:50,zoom:100,fit:'cover',...(wall[scope]||{})}}
  function applyWalls(){
    for(const scope of ['home','room','settings','profile']){
      const cfg=wallConfig(scope),root=document.documentElement.style,url=urls['wall-'+scope];
      root.setProperty('--wp-'+scope,url?`url("${url}")`:'none');
      for(const [key,value] of Object.entries({opacity:cfg.opacity/100,blur:cfg.blur+'px',brightness:cfg.brightness/100,contrast:cfg.contrast/100,saturation:cfg.saturation/100,zoom:cfg.zoom/100,pos:cfg.x+'% '+cfg.y+'%',size:cfg.fit}))root.setProperty('--wp-'+scope+'-'+key,value);
    }
  }
  function saveWall(key,value){wall[selectedScope]={...wallConfig(selectedScope),[key]:value};LS.set('lumen-wallpapers',wall);applyWalls()}
  function button(label,fn,cls='btn'){const b=el('button',cls,label);b.type='button';b.onclick=fn;return b}
  // Labels wrap controls to preserve accessible names while retaining layout.
  function field(label,control){const r=el('label','studio-row');r.append(el('span','',label),control);return r}
  function input(type,value){const n=el('input');n.type=type;if(value!==undefined)n.value=value;return n}
  function range(value,min,max,change){const n=input('range');n.min=min;n.max=max;n.value=value;n.oninput=()=>change(+n.value);return n}
  function heading(title,description){content.append(el('h3','',title),el('p','',description))}
  function error(message){const box=$s('#studio-error');if(box)box.textContent=message}
  function actions(...items){const bar=el('div','studio-actions');bar.append(...items);content.append(bar)}
  function imageField(label,key,after){
    const i=input('file');i.accept='image/jpeg,image/png,image/webp';i.className='studio-file';
    i.onchange=async()=>{try{error('');const file=await validateImage(i.files[0]);await imageStore('put',key,file);objectUrl(key,file);after();}catch(e){error(e.message||t('Não foi possível salvar a imagem.','Could not save the image.'))}finally{i.value=''}};
    content.append(field(label,i));
    content.append(button(t('Remover imagem','Remove image'),async()=>{try{await imageStore('delete',key);objectUrl(key,null);after()}catch(e){error(t('Não foi possível remover a imagem.','Could not remove the image.'))}}));
  }
  function buildNav(){
    nav.replaceChildren();const entries=[['themes',t('✦  Temas','✦  Themes')],['profile',t('◉  Perfil local','◉  Local profile')],['wallpaper',t('▧  Papéis de parede','▧  Wallpapers')],['access',t('◌  Acessibilidade','◌  Accessibility')],['privacy',t('◇  Privacidade','◇  Privacy')]];
    entries.forEach(([id,label])=>{const b=button(label,()=>{currentTab=id;render()},currentTab===id?'on':'');b.setAttribute('aria-current',currentTab===id?'page':'false');nav.append(b)})
  }
  function renderThemes(){
    heading(t('Uma atmosfera para cada momento.','An atmosphere for every moment.'),t('Escolha uma paleta ou crie uma combinação só sua.','Choose a palette or create a combination of your own.'));
    const grid=el('div','studio-grid');
    for(const [name,colors] of Object.entries(palettes)){
      const b=button('',()=>{draft=null;setActive(name)},'theme-card'+(active===name?' active':''));const sw=el('div','swatches');[colors[0],colors[1],colors[6]].forEach(c=>{const i=el('i');i.style.background=c;sw.append(i)});b.append(sw,el('strong','',name));grid.append(b);
    }
    content.append(grid);
    content.append(el('h4','',t('Seus temas','Your themes')));
    if(!customs.length)content.append(el('p','studio-note',t('Nenhum tema personalizado ainda.','No custom themes yet.')));
    for(const custom of customs){const r=el('div','studio-row');r.append(el('span','',custom.name),button(t('Aplicar','Apply'),()=>setActive(custom.id)),button(t('Editar','Edit'),()=>{draft={...custom,colors:[...custom.colors],effects:effectsOf(custom.effects)};render()}));content.append(r)}
    actions(button(t('Criar tema','Create theme'),()=>{draft={id:'',name:t('Meu tema','My theme'),colors:[...(palettes[active]||customs.find(c=>c.id===active)?.colors||palettes.Dark)],effects:effectsOf(customs.find(c=>c.id===active)?.effects)};render()},'btn pri'),button(t('Importar tema','Import theme'),()=>file.click()),button(t('Restaurar padrão','Restore default'),()=>{draft=null;theme='dark';LS.set('theme','dark');setActive('');applyPreferences()}));
    const file=input('file');file.accept='application/json,.json';file.hidden=true;content.append(file);file.onchange=async()=>{try{if(file.files[0].size>16384)throw Error();const data=JSON.parse(await file.files[0].text());if(typeof data.name!=='string'||!Array.isArray(data.colors)||data.colors.length!==keys.length||!data.colors.every(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)))throw Error();if(data.effects&&(!Object.keys(data.effects).every(k=>Object.hasOwn(defaultEffects,k))||Object.entries(data.effects).some(([k,v])=>!Number.isFinite(v)||v<0||v>100)))throw Error();draft={id:'',name:data.name.slice(0,40),colors:data.colors,effects:effectsOf(data.effects)};applyPalette(draft.colors,draft.effects);render()}catch{error(t('Tema inválido. Verifique o arquivo JSON.','Invalid theme. Check the JSON file.'))}};
    if(!draft)return;
    content.append(el('h4','',t('Editor de tema','Theme editor')),el('p','studio-note',t('As alterações aparecem na hora. Salve para mantê-las.','Changes appear immediately. Save to keep them.')));
    const name=input('text',draft.name);name.maxLength=40;name.oninput=()=>draft.name=name.value;content.append(field(t('Nome do tema','Theme name'),name));
    const labels=[['Fundo','Background'],['Painéis','Panels'],['Cartões','Cards'],['Bordas','Borders'],['Texto','Text'],['Texto secundário','Secondary text'],['Destaque e botões','Accent and buttons'],['Avisos','Alerts'],['Sucesso','Success']];
    labels.forEach(([pt,en],index)=>{const c=input('color',draft.colors[index]);c.oninput=()=>{draft.colors[index]=c.value;applyPalette(draft.colors,draft.effects)};content.append(field(t(pt,en),c))});
    for(const [key,pt,en,min,max] of [['opacity','Opacidade dos painéis','Panel opacity',30,100],['radius','Arredondamento','Corner radius',4,32],['shadow','Intensidade da sombra','Shadow intensity',0,100],['glow','Brilho da transmissão','Stream glow',0,100]])content.append(field(t(pt,en),range(draft.effects[key],min,max,v=>{draft.effects[key]=v;applyPalette(draft.colors,draft.effects)})));
    const save=()=>{if(!draft.name.trim())return error(t('Dê um nome ao tema.','Give your theme a name.'));const item={id:draft.id||crypto.randomUUID(),name:draft.name.trim().slice(0,40),colors:[...draft.colors],effects:{...draft.effects}};const idx=customs.findIndex(c=>c.id===item.id);if(idx<0)customs.push(item);else customs[idx]=item;LS.set('lumen-custom-themes',customs);draft=null;setActive(item.id)};
    const exportTheme=()=>{const blob=new Blob([JSON.stringify({version:1,name:draft.name,colors:draft.colors,effects:draft.effects},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='lumen-theme.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
    const buttons=[button(t('Salvar tema','Save theme'),save,'btn pri'),button(t('Duplicar','Duplicate'),()=>{draft={...draft,id:'',name:(draft.name+' copy').slice(0,40)};render()}),button(t('Exportar','Export'),exportTheme),button(t('Cancelar','Cancel'),()=>{draft=null;applyActive();render()})];
    if(draft.id)buttons.push(button(t('Excluir','Delete'),()=>{if(!confirm(t('Excluir este tema?','Delete this theme?')))return;customs=customs.filter(c=>c.id!==draft.id);LS.set('lumen-custom-themes',customs);if(active===draft.id){active='';LS.set('lumen-active-theme','')}draft=null;applyActive();render()}));actions(...buttons);
  }
  function renderProfile(){
    content.classList.add('profile');heading(t('Sua identidade, sob seu controle.','Your identity, under your control.'),t('Foto, banner e biografia ficam neste navegador até você escolher compartilhá-los na sala.','Your photo, banner and bio stay in this browser until you choose to share them in a room.'));
    const preview=el('div','profile-preview'),banner=el('div','profile-banner'),info=el('div','profile-info'),avatar=el('div','profile-avatar');
    const update=()=>{avatar.style.backgroundColor=profile.accent;banner.style.backgroundImage=urls.banner?`url("${urls.banner}")`:'';banner.replaceChildren();avatar.style.backgroundImage=urls.avatar?`url("${urls.avatar}")`:'';avatar.replaceChildren();for(const [node,key] of [[avatar,'avatar'],[banner,'banner']]){if(urls[key]){const img=el('img','profile-image');img.alt='';img.src=urls[key];img.style.objectPosition=`${profile[key+'X']}% ${profile[key+'Y']}%`;img.style.transform=`scale(${profile[key+'Zoom']/100})`;node.append(img)}else if(key==='avatar')node.textContent=(profile.name.trim()[0]||'✦').toUpperCase()}info.querySelector('strong').textContent=profile.name||t('Seu nome','Your name');info.querySelector('small').textContent=profile.username?'@'+profile.username:t('Perfil local','Local profile');info.querySelector('p').textContent=profile.bio};
    info.append(avatar,el('strong'),el('small'),el('p'));preview.append(banner,info);content.append(preview);update();
    const name=input('text',profile.name);name.maxLength=40;name.oninput=()=>{profile.name=name.value;update()};content.append(field(t('Nome de exibição','Display name'),name));
    const user=input('text',profile.username);user.maxLength=30;user.oninput=()=>{profile.username=user.value;update()};content.append(field(t('Nome de usuário local','Local username'),user));
    const bio=el('textarea');bio.maxLength=200;bio.rows=3;bio.value=profile.bio;bio.oninput=()=>{profile.bio=bio.value;update()};content.append(field(t('Sobre você','About you'),bio));
    const accent=input('color',profile.accent);accent.oninput=()=>{profile.accent=accent.value;avatar.style.backgroundColor=accent.value};content.append(field(t('Cor de destaque do perfil','Profile accent'),accent));
    imageField(t('Foto de perfil · JPG, PNG ou WebP, até 5 MB','Profile photo · JPG, PNG or WebP, up to 5 MB'),'avatar',update);
    for(const [key,pt,en] of [['avatarX','Foto: posição horizontal','Photo: horizontal position'],['avatarY','Foto: posição vertical','Photo: vertical position']])content.append(field(t(pt,en),range(profile[key],0,100,v=>{profile[key]=v;update()})));
    content.append(field(t('Foto: aproximação','Photo: zoom'),range(profile.avatarZoom,100,250,v=>{profile.avatarZoom=v;update()})));
    imageField(t('Banner · JPG, PNG ou WebP, até 5 MB','Banner · JPG, PNG or WebP, up to 5 MB'),'banner',update);
    for(const [key,pt,en] of [['bannerX','Banner: posição horizontal','Banner: horizontal position'],['bannerY','Banner: posição vertical','Banner: vertical position']])content.append(field(t(pt,en),range(profile[key],0,100,v=>{profile[key]=v;update()})));
    content.append(field(t('Banner: aproximação','Banner: zoom'),range(profile.bannerZoom,100,250,v=>{profile.bannerZoom=v;update()})));
    actions(button(t('Salvar perfil','Save profile'),()=>{LS.set('lumen-profile',profile);toast(t('Perfil salvo neste dispositivo.','Profile saved on this device.'))},'btn pri'),button(t('Usar nome na sala','Use name in room'),()=>{const n=profile.name.trim();if(!n)return error(t('Informe um nome para usar na sala.','Enter a name to use in the room.'));if(inRoom){if(!tx({t:'nick',nick:n}))error(t('Sem conexão com a sala.','Not connected to the room.'))}else{$s('#nick').value=n;toast(t('Nome preenchido para sua próxima sala.','Name filled in for your next room.'))}}),button(t('Restaurar perfil','Reset profile'),async()=>{if(!confirm(t('Restaurar o perfil local e remover as imagens?','Reset your local profile and remove images?')))return;try{await imageStore('delete','avatar');await imageStore('delete','banner');objectUrl('avatar',null);objectUrl('banner',null);profile={...defaults};LS.set('lumen-profile',profile);render()}catch(e){error(t('Não foi possível restaurar o perfil.','Could not reset the profile.'))}}));
  }
  function renderWallpaper(){
    heading(t('Um cenário que combina com você.','A backdrop that feels like you.'),t('Suas imagens são privadas e nunca saem deste dispositivo.','Your images are private and never leave this device.'));
    const select=el('select');for(const [id,pt,en] of [['home','Página inicial','Home'],['room','Sala','Room'],['settings','Configurações','Settings'],['profile','Perfil','Profile']]){const o=el('option','',t(pt,en));o.value=id;select.append(o)}select.value=selectedScope;select.onchange=()=>{selectedScope=select.value;render()};content.append(field(t('Área','Area'),select));
    imageField(t('Importar imagem · até 5 MB','Import image · up to 5 MB'),'wall-'+selectedScope,()=>{applyWalls();toast(t('Papel de parede atualizado.','Wallpaper updated.'))});
    const cfg=wallConfig(selectedScope);
    for(const [key,pt,en,min,max] of [['opacity','Opacidade','Opacity',0,100],['blur','Desfoque','Blur',0,20],['brightness','Brilho','Brightness',30,150],['contrast','Contraste','Contrast',30,150],['saturation','Saturação','Saturation',0,200],['zoom','Escala','Scale',100,200],['x','Posição horizontal','Horizontal position',0,100],['y','Posição vertical','Vertical position',0,100]])content.append(field(t(pt,en),range(cfg[key],min,max,v=>saveWall(key,v))));
    const fit=el('select');[['cover',t('Preencher','Fill')],['contain',t('Ajustar','Fit')],['auto',t('Centralizar','Center')]].forEach(([v,label])=>{const o=el('option','',label);o.value=v;fit.append(o)});fit.value=cfg.fit;fit.onchange=()=>saveWall('fit',fit.value);content.append(field(t('Enquadramento','Fit'),fit));
  }
  function applyAccess(){document.documentElement.style.setProperty('--text-scale',Math.max(90,Math.min(140,+access.scale||100))/100);document.documentElement.dataset.reduceMotion=access.reduce?'true':'false';document.documentElement.dataset.density=access.compact?'compact':'comfortable'}
  function renderAccess(){
    heading(t('Conforto para o seu jeito de usar.','Comfort for the way you use Lumen.'),t('Estas preferências são aplicadas imediatamente neste dispositivo.','These preferences apply immediately on this device.'));
    const scale=range(access.scale,90,140,v=>{access.scale=v;LS.set('lumen-accessibility',access);applyAccess()});content.append(field(t('Tamanho do texto','Text size'),scale));
    const motion=input('checkbox');motion.checked=!!access.reduce;motion.onchange=()=>{access.reduce=motion.checked;LS.set('lumen-accessibility',access);applyAccess()};content.append(field(t('Reduzir animações','Reduce motion'),motion));
    const compact=input('checkbox');compact.checked=!!access.compact;compact.onchange=()=>{access.compact=compact.checked;LS.set('lumen-accessibility',access);applyAccess()};content.append(field(t('Interface compacta','Compact interface'),compact));
    content.append(el('p','studio-note',t('O Lumen também respeita a preferência de movimento reduzido do sistema.','Lumen also respects your system’s reduced-motion preference.')));
  }
  function renderPrivacy(){
    heading(t('Privacidade que faz sentido.','Privacy by design.'),t('Você decide o que fica neste navegador.','You decide what stays in this browser.'));
    content.append(el('p','',t('As imagens do perfil e os papéis de parede permanecem neste dispositivo. O nome usado na sala, estado da mídia e mensagens são enviados aos participantes pelo servidor.','Profile images and wallpapers remain on this device. Your room nickname, media state and messages are sent to participants through the server.')));
    content.append(el('p','',t('A mídia segue diretamente entre participantes ou por TURN, quando configurado. As salas não são contas e não fornecem autenticação forte.','Media travels directly between participants or through TURN, when configured. Rooms are not accounts and do not provide strong authentication.')));
    actions(button(t('Limpar personalização local','Clear local customization'),async()=>{if(!confirm(t('Remover perfil, imagens, papéis de parede e temas personalizados?','Remove your profile, images, wallpapers and custom themes?')))return;try{for(const k of ['avatar','banner','wall-home','wall-room','wall-settings','wall-profile']){await imageStore('delete',k);objectUrl(k,null)}profile={...defaults};customs=[];wall={};access={scale:100,reduce:false,compact:false};active='';draft=null;for(const k of ['lumen-profile','lumen-custom-themes','lumen-wallpapers','lumen-active-theme','lumen-accessibility'])localStorage.removeItem(k);applyActive();applyWalls();applyAccess();toast(t('Personalização removida.','Customization removed.'));render()}catch(e){error(t('Não foi possível limpar os dados locais.','Could not clear local data.'))}}));
  }
  function render(){buildNav();content.className='studio-content';content.replaceChildren();content.append(el('div','studio-error'));content.firstChild.id='studio-error';({themes:renderThemes,profile:renderProfile,wallpaper:renderWallpaper,access:renderAccess,privacy:renderPrivacy})[currentTab]()}
  document.querySelectorAll('.studio-trigger').forEach(b=>b.onclick=()=>{render();studio.showModal()});
  $s('#studio-close').onclick=()=>{if(draft){draft=null;applyActive()}studio.close()};
  studio.addEventListener('close',()=>{if(draft){draft=null;applyActive()}});
  window.addEventListener('lumen-language',()=>{if(studio.open)render()});
  applyActive();applyAccess();loadImages();
})();
