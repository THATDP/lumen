'use strict';
// Session features are authoritative on the signaling server, not in a browser.
const crypto = require('crypto');
const EMOJI = ['👍','👏','😂','🔥','😮','❤️'];
const MAX_HISTORY = 200;
const publicMessage = m => ({ mid:m.mid,id:m.id,owner:m.owner,nick:m.nick,text:m.text,ts:m.ts,reply:m.reply,edited:m.edited,deleted:m.deleted,reactions:Object.fromEntries(Object.entries(m.reactions).map(([emoji,users])=>[emoji,[...users]])) });
const publicGame = r => r.game && ({...r.game,board:[...r.game.board],players:r.game.players.map(p=>({...p}))});
function startRoom(r){r.history=[];r.game=null}
function snapshot(r){return {history:r.history.map(publicMessage),game:publicGame(r)}}
function handle(r,p,m,broadcast,err){
  const find = id => r.history.find(x=>x.mid===id);
  switch(m.t){
    case 'profile': {
      const input=m.profile;if(!input||typeof input!=='object'||Array.isArray(input))return;
      const validImage=(v,max)=>{
        if(typeof v!=='string'||v.length>max||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v))return '';
        const bytes=Buffer.from(v.slice(v.indexOf(',')+1),'base64');return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255?v:'';
      };
      p.profile={bio:typeof input.bio==='string'?input.bio.trim().slice(0,160):'',color:typeof input.color==='string'&&/^#[a-f0-9]{6}$/i.test(input.color)?input.color:'',avatar:validImage(input.avatar,18000),banner:validImage(input.banner,26000)};
      return broadcast(r,{t:'profile',id:p.id,profile:p.profile});
    }
    case 'chat': {
      const text=typeof m.text==='string'?m.text.trim():'';if(!text||text.length>500)return err('bad_message','A mensagem deve ter de 1 a 500 caracteres.');
      const now=Date.now();p.rl=(p.rl||[]).filter(x=>now-x<5000);if(p.rl.length>=8)return err('rate_limit','Muitas mensagens. Aguarde um pouco e tente novamente.');p.rl.push(now);
      const reply=typeof m.reply==='string'&&find(m.reply)?m.reply:null;
      const msg={mid:crypto.randomBytes(12).toString('hex'),id:p.id,owner:p.pid,nick:p.nick,text,ts:now,reply,edited:false,deleted:false,reactions:{}};
      r.history.push(msg);if(r.history.length>MAX_HISTORY)r.history.shift();return broadcast(r,{t:'chat',...publicMessage(msg)});
    }
    case 'chat_edit': case 'chat_delete': {
      const msg=find(m.mid);if(!msg||msg.owner!==p.pid||msg.deleted)return err('chat_forbidden','Não é possível alterar esta mensagem.');
      if(m.t==='chat_delete'){msg.text='';msg.deleted=true;msg.reactions={}}
      else {if(typeof m.text!=='string'||!m.text.trim()||m.text.trim().length>500)return err('bad_message','Mensagem inválida.');msg.text=m.text.trim();msg.edited=true}
      return broadcast(r,{t:'chat_update',message:publicMessage(msg)});
    }
    case 'chat_reaction': {
      const msg=find(m.mid);if(!msg||msg.deleted||!EMOJI.includes(m.emoji))return;
      const users=msg.reactions[m.emoji]||(msg.reactions[m.emoji]=new Set());if(users.has(p.pid))users.delete(p.pid);else if(users.size<100)users.add(p.pid);if(!users.size)delete msg.reactions[m.emoji];
      return broadcast(r,{t:'chat_update',message:publicMessage(msg)});
    }
    case 'game': {
      const action=m.action,g=r.game;
      if(action==='start'){
        if(g)return err('game_busy','Já existe uma partida nesta sala.');
        r.game={type:'tic-tac-toe',owner:p.pid,players:[{id:p.pid,nick:p.nick}],board:Array(9).fill(''),turn:0,status:'waiting',winner:null};
      }else if(action==='join'){
        if(!g||g.status!=='waiting'||g.players.length!==1||g.players.some(x=>x.id===p.pid))return err('game_invalid','Não foi possível entrar na partida.');
        g.players.push({id:p.pid,nick:p.nick});g.status='playing';
      }else if(action==='move'){
        if(!g||g.status!=='playing'||g.players[g.turn]?.id!==p.pid||!Number.isInteger(m.cell)||m.cell<0||m.cell>8||g.board[m.cell])return err('game_invalid','Jogada inválida ou fora de turno.');
        const symbol=g.turn===0?'X':'O';g.board[m.cell]=symbol;
        const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        if(lines.some(line=>line.every(i=>g.board[i]===symbol))){g.status='finished';g.winner=p.pid}
        else if(g.board.every(Boolean)){g.status='draw';g.winner=null}
        else g.turn=1-g.turn;
      }else if(action==='reset'){
        if(!g||g.players.length!==2||!g.players.some(x=>x.id===p.pid)||!['finished','draw'].includes(g.status))return err('game_invalid','Não é possível reiniciar agora.');
        g.board=Array(9).fill('');g.turn=0;g.status='playing';g.winner=null;
      }else if(action==='end'){
        if(!g||(g.owner!==p.pid&&p.role!=='host'))return err('game_forbidden','Somente quem iniciou ou o anfitrião pode encerrar.');
        r.game=null;
      }else return;
      return broadcast(r,{t:'game_state',game:publicGame(r)});
    }
  }
}
function departed(r,p,broadcast){
  const g=r.game;if(!g)return;
  if(g.players.some(x=>x.id===p.pid)) {r.game=null;broadcast(r,{t:'game_state',game:null,reason:'left'})}
}
module.exports={startRoom,snapshot,handle,departed};
