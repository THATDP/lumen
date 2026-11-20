'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { WebSocket } = require('ws');
const { chromium: browserType } = require('playwright-core');
const chromiumPackage = require('@sparticuz/chromium');
const chromium = chromiumPackage.default;
const path = require('node:path');
const port = 31000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
let server, browser;
before(async () => {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), MAX_PEERS: '4' }, stdio: 'pipe' });
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('exit', code => reject(Error(`server exited ${code}`))); setTimeout(() => reject(Error('server timeout')), 10000).unref(); });
});
after(async () => { if (browser) await browser.close(); if (server) server.kill(); });
function client() {
  const socket = new WebSocket(base.replace('http', 'ws')); const events = [], waiters = [];
  socket.on('message', data => { const m = JSON.parse(data); const i = waiters.findIndex(w => w.type === m.t); if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else events.push(m); });
  return { socket, open: () => new Promise(r => socket.once('open', r)), send: m => socket.send(JSON.stringify(m)), next: type => { const i = events.findIndex(m => m.t === type); if (i >= 0) return Promise.resolve(events.splice(i, 1)[0]); return new Promise((resolve, reject) => { const w = {type, resolve: m => { clearTimeout(timer); resolve(m); }}; waiters.push(w); const timer = setTimeout(() => { const i=waiters.indexOf(w);if(i>=0)waiters.splice(i,1);reject(Error(`timeout waiting for ${type}`)); }, 5000); }); } };
}
test('HTTP, room lifecycle, signaling, chat, moderation and reconnect', async () => {
  assert.equal((await fetch(base+'/')).status, 200);
  assert.equal((await fetch(base+'/server.js')).status, 404);
  assert.ok(Array.isArray(await (await fetch(base+'/api/ice')).json()));
  const a=client(), b=client(), c=client(); await Promise.all([a.open(),b.open(),c.open()]);
  a.send({t:'join',nick:'Alice',uid:'unique-a',create:true,priv:false}); const joined=await a.next('joined'); const code=joined.room.code;
  assert.match(code,/^[A-Z2-9]{6}$/); assert.equal(joined.role,'host');
  assert.ok((await (await fetch(base+'/api/rooms')).json()).some(r=>r.code===code));
  b.send({t:'join',nick:'Bob',uid:'unique-b',code}); const bj=await b.next('joined'); assert.equal(bj.peers[0].id,joined.id); assert.equal((await a.next('peer')).peer.id,bj.id);
  c.send({t:'join',nick:'bOB',uid:'unique-c',code}); assert.equal((await c.next('err')).code,'nick_taken');
  a.send({t:'signal',to:bj.id,d:{desc:{type:'offer',sdp:'test'}}}); assert.equal((await b.next('signal')).from,joined.id);
  b.send({t:'state',st:{share:true,streams:{stream1:'screen'}}}); assert.equal((await a.next('state')).st.streams.stream1,'screen');
  b.send({t:'chat',text:'Olá!'}); assert.equal((await a.next('chat')).text,'Olá!'); assert.equal((await b.next('chat')).text,'Olá!');
  a.send({t:'mod',id:bj.id});assert.equal((await b.next('role')).role,'mod');await a.next('role');
  a.send({t:'lock',v:true}); await a.next('room'); await b.next('room');
  c.send({t:'join',nick:'Carol',uid:'unique-c',code}); assert.equal((await c.next('err')).code,'locked');
  b.socket.terminate(); await a.next('left');
  const b2=client(); await b2.open(); b2.send({t:'join',nick:'Bob',uid:'unique-b',code}); const b2j=await b2.next('joined'); assert.equal(b2j.room.code,code); await a.next('peer');
  a.send({t:'kick',id:b2j.id}); await b2.next('kicked'); assert.equal((await a.next('left')).why,'kicked');
  b2.socket.close(); a.socket.close(); c.socket.close();
});

test('an active session can reconnect with a changed nickname in a locked room', async () => {
  const a=client(), b=client(), replacement=client();await Promise.all([a.open(),b.open(),replacement.open()]);
  try {
    a.send({t:'join',nick:'Alice',uid:'owner-active',create:true});const aj=await a.next('joined');
    b.send({t:'join',nick:'Bob',uid:'returning-active',code:aj.room.code});const bj=await b.next('joined');await a.next('peer');
    a.send({t:'lock',v:true});await a.next('room');await b.next('room');
    replacement.send({t:'join',nick:'Alice',uid:'returning-active',code:aj.room.code});
    assert.equal((await replacement.next('err')).code,'nick_taken');
    b.send({t:'chat',text:'still connected'});assert.equal((await a.next('chat')).text,'still connected');
    replacement.send({t:'join',nick:'Bobby',uid:'returning-active',code:aj.room.code});
    const joined=await replacement.next('joined');
    assert.equal(joined.room.code,aj.room.code);assert.equal((await a.next('left')).id,bj.id);
    assert.equal((await a.next('peer')).peer.nick,'Bobby');
    assert.equal(joined.peers.length,1);
  } finally {a.socket.close();b.socket.close();replacement.socket.close()}
});

test('ws accepts fragmented messages and isolates signaling by room', async () => {
  const a=client(),b=client(),outsider=client();await Promise.all([a.open(),b.open(),outsider.open()]);
  try {
    const join=JSON.stringify({t:'join',nick:'Fragment',uid:'fragment-id',create:true});
    a.socket.send(join.slice(0,10),{fin:false});a.socket.send(join.slice(10),{fin:true});
    const aj=await a.next('joined');
    b.send({t:'join',nick:'Bob',uid:'fragment-b',code:aj.room.code});const bj=await b.next('joined');await a.next('peer');
    outsider.send({t:'join',nick:'Other',uid:'outside',create:true});const oj=await outsider.next('joined');
    outsider.send({t:'signal',to:bj.id,d:{desc:{type:'offer',sdp:'must-not-arrive'}}});
    outsider.send({t:'chat',text:'barrier'});await outsider.next('chat');
    a.send({t:'signal',to:bj.id,d:{cand:{candidate:'expected'}}});const signal=await b.next('signal');
    assert.equal(signal.from,aj.id);assert.notEqual(signal.from,oj.id);assert.equal(signal.d.cand.candidate,'expected');
  } finally {a.socket.close();b.socket.close();outsider.socket.close()}
});

test('TURN REST credentials are short-lived and signed', async () => {
  const turnPort=port+1;
  const proc=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(turnPort),TURN_URL:'turn:example.org:3478?transport=udp',TURN_SECRET:'test-secret',TURN_TTL:'600'},stdio:'pipe'});
  try {
    await new Promise((resolve,reject)=>{proc.stdout.once('data',resolve);proc.once('exit',()=>reject(Error('TURN test server exited')))});
    const ice=await (await fetch(`http://127.0.0.1:${turnPort}/api/ice`)).json(); const turn=ice.find(x=>x.username);
    assert.ok(turn);assert.ok(Number(turn.username.split(':')[0])>=Math.floor(Date.now()/1000)+590);
    assert.equal(turn.credential,crypto.createHmac('sha1','test-secret').update(turn.username).digest('base64'));
    assert.ok(!JSON.stringify(ice).includes('test-secret'));
  } finally {proc.kill()}
});

test('a sole participant can reconnect to the retained room', async () => {
  const a=client();await a.open();a.send({t:'join',nick:'Alone',uid:'reconnect-sole',create:true});const joined=await a.next('joined');
  a.socket.terminate();await new Promise(resolve=>a.socket.once('close',resolve));
  const next=client();await next.open();next.send({t:'join',nick:'Alone',uid:'reconnect-sole',code:joined.room.code});
  const rejoined=await next.next('joined');assert.equal(rejoined.room.code,joined.room.code);assert.equal(rejoined.role,'host');next.socket.close();
});

test('browser-to-browser tracks, chat, late join, reconnect and preferences', { timeout: 120000 }, async () => {
  await chromiumPackage.inflate(path.join(path.dirname(require.resolve('@sparticuz/chromium')), '../bin/al2023.tar.br'));
  browser=await browserType.launch({executablePath:await chromium.executablePath(),env:{...process.env,LD_LIBRARY_PATH:'/tmp/al2023/lib:'+ (process.env.LD_LIBRARY_PATH||'')},args:[...chromium.args,'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'],headless:true});
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({permissions:['microphone','camera']})));
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  const errors=[]; pages.forEach(p=>p.on('pageerror',e=>errors.push(e.message)));
  // Fake display capture, while keeping real browser WebRTC, SDP, ICE and media transport.
  await pages[0].addInitScript(() => { navigator.mediaDevices.getDisplayMedia = async () => { const c=document.createElement('canvas');c.width=320;c.height=180; const ctx=c.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,320,180);let n=0;setInterval(()=>{ctx.fillStyle=(n++%2?'red':'blue');ctx.fillRect(0,0,320,180)},100);window.__screenCanvas=c;const stream=c.captureStream(10);const ac=new AudioContext(),osc=ac.createOscillator(),destination=ac.createMediaStreamDestination();osc.connect(destination);osc.start();window.__screenAudio={ac,osc};stream.addTrack(destination.stream.getAudioTracks()[0]);return stream; }; });
  await Promise.all(pages.map(p=>p.goto(base+'/lumen/')));
  const [a,b,c]=pages;
  await a.locator('#nick').fill('Alice'); await a.locator('#create').click(); await a.locator('#app').waitFor({state:'visible'});
  const code=await a.evaluate(()=>room.code); assert.match(code,/^[A-Z2-9]{6}$/);
  await a.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__invite=text}},configurable:true})});await a.locator('#codeBtn').click();assert.equal(await a.evaluate(()=>window.__invite),'https://thatdp.github.io/lumen/?room='+code);
  await b.goto(base+'/lumen/?room='+code); assert.equal(await b.locator('#code').inputValue(),code);
  await b.locator('#nick').fill('Bob'); await b.locator('#join').click(); await b.locator('#app').waitFor({state:'visible'});
  await a.waitForFunction(()=>peers.size===1); await b.waitForFunction(()=>peers.size===1);
  await Promise.all([a.locator('#bMic').click(),b.locator('#bMic').click()]);await Promise.all([a.locator('#bCam').click(),b.locator('#bCam').click()]);
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>{const p=[...peers.values()][0];return p&&streamOf(p,'voice')?.getAudioTracks().length&&streamOf(p,'cam')?.getVideoTracks().length},null,{timeout:30000})));
  await Promise.all([a,b].map(p=>p.waitForFunction(async()=>{const peer=[...peers.values()][0];const stats=await peer.pc.getStats();return [...stats.values()].some(s=>s.type==='inbound-rtp'&&s.kind==='audio'&&s.bytesReceived>0)&&[...stats.values()].some(s=>s.type==='inbound-rtp'&&s.kind==='video'&&s.framesDecoded>0)},null,{timeout:30000})));
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>[...peers.values()].every(p=>p.pc.signalingState==='stable'),null,{timeout:15000})));
  // Overlapping device changes must not leave multiple microphone tracks or obsolete senders.
  const swapped=await a.evaluate(async()=>{const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let calls=0;navigator.mediaDevices.getUserMedia=async options=>{const stream=await get(options);await new Promise(r=>setTimeout(r,++calls===1?300:0));return stream};try{await Promise.all([swap('mic'),swap('mic')]);const p=[...peers.values()][0];return {tracks:local.mic.getAudioTracks().filter(t=>t.readyState==='live').length,senders:p.pc.getSenders().filter(s=>s.track?.kind==='audio').map(s=>s.track.id),current:local.mic.getAudioTracks()[0].id}}finally{navigator.mediaDevices.getUserMedia=get}});
  assert.equal(swapped.tracks,1);assert.ok(swapped.senders.includes(swapped.current));
  await a.locator('#bShare').click(); await b.waitForFunction(()=>{const p=[...peers.values()][0];return p&&streamOf(p,'screen')?.getVideoTracks().length&&streamOf(p,'screen')?.getAudioTracks().length&&document.querySelector('#vid').videoWidth>0},null,{timeout:30000});
  assert.equal(await b.evaluate(()=>document.querySelector('#vid').muted),false);
  await b.waitForFunction(async()=>{const p=[...peers.values()][0],stream=streamOf(p,'screen'),receiver=p.pc.getReceivers().find(r=>stream?.getAudioTracks().includes(r.track));if(!receiver)return false;const stats=await p.pc.getStats(receiver.track);return [...stats.values()].some(s=>s.type==='inbound-rtp'&&s.kind==='audio'&&s.bytesReceived>0)},null,{timeout:30000});
  await c.locator('#nick').fill('Carol');await c.locator('#code').fill(code);await c.locator('#join').click();await c.locator('#app').waitFor({state:'visible'});
  await c.waitForFunction(()=>[...peers.values()].some(p=>streamOf(p,'screen')?.getVideoTracks().length)&&document.querySelector('#vid').videoWidth>0,null,{timeout:30000});
  await Promise.all(pages.map(p=>p.waitForFunction(()=>[...peers.values()].every(p=>p.pc.signalingState==='stable'),null,{timeout:15000})));
  const previousUfrags=await a.evaluate(()=>Object.fromEntries([...peers.values()].map(p=>[p.id,p.pc.localDescription.sdp.match(/^a=ice-ufrag:(.+)$/m)?.[1]])));
  await a.evaluate(()=>[...peers.values()].forEach(p=>p.pc.restartIce()));
  await a.waitForFunction(previous=>[...peers.values()].every(p=>p.pc.localDescription?.sdp.match(/^a=ice-ufrag:(.+)$/m)?.[1]!==previous[p.id]&&p.pc.signalingState==='stable'&&['connected','completed'].includes(p.pc.iceConnectionState)),previousUfrags,{timeout:30000});
  await b.locator('#ci').fill('Hello from Bob');await b.locator('#ci').press('Enter');await a.getByText('Hello from Bob').waitFor();await c.getByText('Hello from Bob').waitFor();
  await b.locator('#app .prefs select').first().selectOption('en'); await b.locator('#app .prefs select').last().selectOption('light');
  assert.equal(await b.evaluate(()=>document.documentElement.dataset.theme),'light');assert.equal(await b.locator('[data-p="ppl"]').innerText(),'People (3)');
  await b.locator('#setBtn').click();await b.locator('#sbody input').first().fill('Bobby');await b.getByRole('button',{name:'Change',exact:true}).click();await a.waitForFunction(()=>[...peers.values()].some(p=>p.nick==='Bobby'));await b.locator('#dx').click();
  const old=await b.evaluate(()=>me);await b.evaluate(()=>ws.close());await b.waitForFunction(old=>joined&&me!==old,old,{timeout:30000});await a.waitForFunction(()=>peers.size===2,{},{timeout:30000});
  await b.waitForFunction(()=>[...peers.values()].some(p=>streamOf(p,'screen')?.getVideoTracks().length),null,{timeout:30000});
  await a.waitForFunction(()=>[...peers.values()].some(p=>p.nick==='Bobby'&&streamOf(p,'voice')?.getAudioTracks().length),null,{timeout:30000});
  await b.locator('#bCam').click();await a.waitForFunction(()=>[...peers.values()].some(p=>p.nick==='Bobby'&&!p.st.cam));await b.locator('#bCam').click();await a.waitForFunction(()=>[...peers.values()].some(p=>p.nick==='Bobby'&&p.st.cam&&streamOf(p,'cam')?.getVideoTracks().length),null,{timeout:30000});
  await b.locator('#bMic').click();await a.waitForFunction(()=>[...peers.values()].some(p=>p.nick==='Bobby'&&!p.st.mic));await b.locator('#bMic').click();
  await a.locator('#bShare').click();await b.waitForFunction(()=>![...peers.values()].some(p=>p.st.share),null,{timeout:10000});
  await a.evaluate(()=>{navigator.mediaDevices.getDisplayMedia=async()=>{throw new DOMException('source unavailable','NotReadableError')}});await a.locator('#bShare').click();await a.getByText('Não foi possível acessar a tela: source unavailable').waitFor();assert.equal(await a.evaluate(()=>!!local.screen),false);
  await c.locator('#bLeave').click();await a.waitForFunction(()=>peers.size===1,null,{timeout:10000});
  await b.reload();assert.equal(await b.evaluate(()=>document.documentElement.lang),'en');assert.equal(await b.evaluate(()=>document.documentElement.dataset.theme),'light');
  assert.deepEqual(errors,[]);
});
