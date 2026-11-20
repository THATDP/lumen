'use strict';
// The browser only presents moves; chess-room.js is the authority.
let chessState=null,chessSelected=null,chessReceived=0;
const pieces={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
function chessPositions(fen){const rows=fen.split(' ')[0].split('/'),out={};rows.forEach((row,i)=>{let col=0;for(const c of row){if(/[1-8]/.test(c))col+=+c;else{out['abcdefgh'[col]+(8-i)]=c;col++}}});return out}
function chessClock(ms){ms=Math.max(0,ms);const n=Math.ceil(ms/1000);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
function updateChessClocks(){if(!chessState)return;for(const color of ['w','b']){const el=document.querySelector(`[data-clock="${color}"]`);if(!el)continue;let value=chessState.clocks[color];if(chessState.status==='playing'&&chessState.turn===color)value-=Date.now()-chessReceived;el.textContent=chessClock(value)}}
setInterval(updateChessClocks,250);
function renderChess(state){
  if(!state||state!==chessState)chessReceived=Date.now();chessState=state;chessSelected=null;const box=$('#chess');if(!box)return;box.replaceChildren();box.append(E('h3','',L('Xadrez','Chess')));
  if(!state){const row=E('div','chess-invite'),select=E('select');select.setAttribute('aria-label',L('Convidar participante','Invite participant'));
    for(const p of peers.values()){const option=E('option','',p.nick);option.value=p.id;select.append(option)}
    const clock=E('select');clock.setAttribute('aria-label',L('Relógio por jogador','Clock per player'));for(const n of [1,3,5,10,15,30]){const o=E('option','',n+' min');o.value=n;clock.append(o)}clock.value='5';
    const invite=btn(L('Convidar para xadrez','Invite to chess'),()=>tx({t:'chess',action:'invite',to:select.value,minutes:+clock.value}));invite.disabled=!select.options.length;row.append(select,clock,invite);box.append(row);if(!select.options.length)box.append(E('p','room-muted',L('Entre com outra pessoa para jogar.','Another participant must join to play.')));return}
  const mine=state.players.find(p=>p.id===myPid),other=state.players.find(p=>p.id!==myPid);
  if(state.status==='invited'){
    box.append(E('p','',state.invited===myPid?L('Você recebeu um convite de ','You were invited by ')+(other?.nick||''):L('Aguardando resposta de ','Waiting for ')+(other?.nick||'')));
    if(state.invited===myPid)box.append(btn(L('Aceitar convite','Accept invitation'),()=>tx({t:'chess',action:'accept'})));
    if(mine)box.append(btn(L('Cancelar convite','Cancel invitation'),()=>tx({t:'chess',action:'decline'})));
    return;
  }
  const status=state.status==='playing'?(state.check?L('Xeque · ','Check · '):'')+L('Vez de ','Turn: ')+(state.players.find(p=>p.color===state.turn)?.nick||''):(state.winner?L('Vencedor: ','Winner: ')+(state.players.find(p=>p.id===state.winner)?.nick||''):L('Empate','Draw'))+' · '+state.reason;
  box.append(E('p','chess-status',status));
  const clocks=E('div','chess-clocks');for(const p of state.players){const row=E('div','chess-player'),peer=p.id===myPid?{id:me,nick:myNick,profile:myPublicProfile}:[...peers.values()].find(x=>x.pid===p.id);if(peer){const av=E('i','av chess-avatar',initial(peer.nick));applyAvatar(av,peer);row.append(av)}row.append(E('span','',(peer?.profile?.name||p.nick)+(p.connected?'':L(' · reconectando',' · reconnecting'))));const time=E('b');time.dataset.clock=p.color;row.append(time);clocks.append(row)}box.append(clocks);
  const board=E('div','chess-board');board.setAttribute('aria-label',L('Tabuleiro de xadrez','Chess board'));const position=chessPositions(state.fen),flipped=mine?.color==='b';
  const files=flipped?'hgfedcba':'abcdefgh',ranks=flipped?'12345678':'87654321';
  function play(from,to){
    const piece=position[from];let promotion;
    if(piece?.toLowerCase()==='p'&&((piece==='P'&&to[1]==='8')||(piece==='p'&&to[1]==='1'))){const answer=prompt(L('Promoção: q (dama), r (torre), b (bispo), n (cavalo)','Promotion: q (queen), r (rook), b (bishop), n (knight)'),'q');if(answer===null)return;promotion=answer.toLowerCase().trim();if(!['q','r','b','n'].includes(promotion)){toast(L('Promoção inválida.','Invalid promotion.'),'err');return}}
    tx({t:'chess',action:'move',from,to,promotion});chessSelected=null;
  }
  for(const rank of ranks)for(const file of files){const square=file+rank,piece=position[square],b=E('button','chess-square '+((('abcdefgh'.indexOf(file)+ +rank)%2)?'dark':'light'),pieces[piece]||'');b.type='button';b.dataset.square=square;b.setAttribute('aria-label',square+(piece?' '+piece:''));
    const canMove=state.status==='playing'&&mine?.color===state.turn;const own=piece&&(piece===piece.toUpperCase()?'w':'b')===mine?.color;
    b.draggable=!!(canMove&&own);b.ondragstart=e=>{e.dataTransfer.setData('text/plain',square);e.dataTransfer.effectAllowed='move'};b.ondragover=e=>{if(canMove)e.preventDefault()};b.ondrop=e=>{e.preventDefault();if(canMove)play(e.dataTransfer.getData('text/plain'),square)};
    b.onclick=()=>{if(!canMove)return;if(chessSelected&&chessSelected!==square){const from=chessSelected;board.querySelector('.selected')?.classList.remove('selected');play(from,square)}else if(own){chessSelected=square;board.querySelector('.selected')?.classList.remove('selected');b.classList.add('selected')}};board.append(b)}
  box.append(board);updateChessClocks();const history=E('div','chess-history');history.textContent=state.moves.map((move,i)=>(i%2===0?(Math.floor(i/2)+1)+'. ':'')+move).join(' ');box.append(history);
  if(state.status==='playing'&&mine)box.append(btn(L('Desistir','Resign'),()=>{if(confirm(L('Desistir da partida?','Resign the game?')))tx({t:'chess',action:'resign'})}));
  if(state.status==='finished'&&mine)box.append(btn(L('Convidar para revanche','Invite rematch'),()=>tx({t:'chess',action:'restart'})));
  if(mine||role==='host')box.append(btn(L('Encerrar xadrez','End chess'),()=>tx({t:'chess',action:'end'})));
}
