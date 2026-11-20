'use strict';
const crypto=require('crypto');
function startRoom(r){r.media={queue:[],playing:false,position:0,at:Date.now(),permission:'host'}}
function snapshot(r){const now=Date.now(),s=r.media;return {...s,position:Math.min(21600,s.position+(s.playing?(now-s.at)/1000:0)),at:now,queue:s.queue.map(x=>({...x}))}}
function parseYoutube(value){
  if(typeof value!=='string'||value.length>500)return null;
  try{const u=new URL(value);if(u.protocol!=='https:')return null;const host=u.hostname.toLowerCase();let id;
    if(host==='youtu.be')id=u.pathname.split('/')[1];
    else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){if(u.pathname==='/watch')id=u.searchParams.get('v');else if(/^\/(embed|shorts)\//.test(u.pathname))id=u.pathname.split('/')[2]}
    return /^[a-zA-Z0-9_-]{11}$/.test(id||'')?id:null;
  }catch{return null}
}
function handle(r,p,m,broadcast,err){
  const state=r.media,host=p.role==='host',control=host||state.permission==='all',now=Date.now();
  const currentPosition=()=>Math.min(21600,Math.max(0,state.position+(state.playing?(now-state.at)/1000:0)));
  switch(m.action){
    case 'add':{
      const video=parseYoutube(m.url);if(!video)return err('media_invalid','Use um link HTTPS válido de vídeo do YouTube.');
      if(state.queue.length>=20)return err('media_full','A fila está cheia.');
      state.queue.push({id:crypto.randomBytes(8).toString('hex'),video,by:p.nick,owner:p.pid});break;
    }
    case 'permission':if(!host||!['host','all'].includes(m.value))return err('media_forbidden','Somente o anfitrião define permissões.');state.permission=m.value;break;
    case 'remove':{
      const i=state.queue.findIndex(x=>x.id===m.id);if(i<0)return err('media_invalid','Item não encontrado.');
      if(!control&&(i===0||state.queue[i].owner!==p.pid))return err('media_forbidden','Sem permissão para remover este item.');
      state.queue.splice(i,1);if(i===0){state.position=0;state.playing=false;state.at=now}break;
    }
    case 'next':if(!control)return err('media_forbidden','Sem permissão para controlar a reprodução.');if(!state.queue.length)return;if(m.id!==state.queue[0].id)return err('media_invalid','A fila foi alterada.');state.queue.shift();state.position=0;state.playing=false;state.at=now;break;
    case 'play':case 'pause':
      if(!control)return err('media_forbidden','Sem permissão para controlar a reprodução.');if(!state.queue.length)return;if(m.id!==state.queue[0].id)return err('media_invalid','A fila foi alterada.');
      state.position=currentPosition();state.at=now;state.playing=m.action==='play';break;
    case 'seek':
      if(!control)return err('media_forbidden','Sem permissão para controlar a reprodução.');
      if(!state.queue.length||m.id!==state.queue[0].id||!Number.isFinite(m.position)||m.position<0||m.position>21600)return err('media_invalid','Posição inválida.');
      state.position=m.position;state.at=now;break;
    default:return;
  }
  broadcast(r,{t:'media_state',media:snapshot(r)});
}
module.exports={startRoom,snapshot,handle,parseYoutube};
