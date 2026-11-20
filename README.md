# Lumen

https://thatdp.github.io/lumen/

Compartilhamento de tela, câmera, áudio e chat em salas WebRTC. O frontend continua no [GitHub Pages](https://thatdp.github.io/lumen/); o backend de sinalização continua em `https://lumen-server-xiye.onrender.com`. Convites usam `https://thatdp.github.io/lumen/?room=CODIGO`.

## Desenvolvimento e testes

Requer Node.js 22.17 ou superior. Para rodar localmente:

```sh
npm ci
npm start
# Abra http://localhost:3000/lumen/ em duas abas ou navegadores.
npm test
```

O servidor local também entrega o `index.html`, mas em produção o Pages entrega o frontend. O servidor usa `PORT` (padrão 3000); os endpoints são `GET /api/ice`, `GET /api/rooms` e WebSocket na raiz. Para mídia, use HTTPS ou localhost, conceda as permissões e permita a reprodução de áudio. O compartilhamento de tela e, especialmente, a captura de áudio de sistema dependem do navegador, dispositivo e fonte selecionada; celulares podem não oferecer captura de tela.

Os testes automatizados cobrem servidor, salas, convites, permissões e histórico do chat, perfil autorizado, jogo da velha, xadrez, fila de mídia, arraste e redimensionamento, reconexão, preferências e transporte WebRTC entre contextos de navegador. Os testes do painel de YouTube usam um **player simulado**: não validam a API externa ou reprodução real. O Chromium de teste usa dispositivos falsos, um canvas como fonte de vídeo de tela e um oscilador como áudio da transmissão; ele verifica vídeo decodificado e recebimento de pacotes de áudio (inclusive o áudio da transmissão), mas **não** substitui o teste manual da captura real, dos alto-falantes, nem de diferentes dispositivos e redes. O pacote de Chromium usado nos testes é para Linux x86-64 e requer bibliotecas básicas do sistema. Para testar em outro sistema, adapte o executável do navegador no teste.

## TURN: necessário para redes restritas

STUN sozinho não garante comunicação entre dispositivos em redes ou NATs diferentes. É necessário disponibilizar um serviço TURN externo acessível pela internet; ele não está incluído neste repositório e o Render não fornece esse relay automaticamente. Sem TURN, algumas chamadas funcionarão em redes diretas e outras não.

No serviço **existente** do Render, configure:

- `TURN_URL`: lista separada por vírgulas, por exemplo `turn:turn.seudominio.com:3478?transport=udp,turn:turn.seudominio.com:3478?transport=tcp`. Inclua `turns:turn.seudominio.com:5349?transport=tcp` apenas se o TURN tiver TLS configurado.
- `TURN_SECRET`: segredo aleatório forte compartilhado apenas com o servidor TURN. `/api/ice` gera credenciais temporárias no formato TURN REST (HMAC-SHA1); o segredo não é enviado ao navegador.
- `TURN_TTL` (opcional): validade das credenciais em segundos, padrão 3600, mínimo 60. Ajuste à duração esperada das sessões; valide sessões longas e renovações em sua infraestrutura.
- `STUN_URLS` (opcional): URLs STUN separadas por vírgulas; padrão `stun:stun.l.google.com:19302`.
- `MAX_PEERS` (opcional): limite por sala, padrão 8.

Exemplo de parâmetros no **coturn externo** (substitua domínio, IP e segredo por valores reais):

```ini
listening-port=3478
realm=turn.seudominio.com
external-ip=IP_PUBLICO_DO_TURN
use-auth-secret
static-auth-secret=O_MESMO_VALOR_DE_TURN_SECRET_NO_RENDER
min-port=49152
max-port=65535
no-multicast-peers
```

Aponte o DNS para o TURN e libere TCP/UDP 3478 e a faixa UDP de relay configurada no firewall/NAT. Se usar `turns:`, configure certificado e chave TLS válidos no coturn e libere TCP 5349. A configuração exata de `external-ip` pode exigir o mapeamento público/privado do provedor. Restrinja destinos internos e monitore/limite abuso e consumo. Credenciais estáticas `TURN_USER` e `TURN_PASS` não são mais servidas ao navegador: utilize `TURN_SECRET`. As credenciais temporárias de TURN necessariamente são entregues ao cliente para que ele acesse o relay. A API é pública, portanto o segredo por si só não impede abuso do relay.

Confirme em `https://lumen-server-xiye.onrender.com/api/ice` que a lista inclui o TURN após o deploy. Isso confirma apenas a configuração, **não** que o relay está acessível: teste com dois dispositivos em redes diferentes, inclusive uma rede móvel, verificando o tipo de candidato selecionado nas ferramentas WebRTC do navegador.

## Publicação e operação

1. Revise e faça merge da branch de trabalho na branch utilizada pelo Pages e pelo Render. Nenhuma publicação é feita automaticamente por estas instruções.
2. No serviço Render atual, mantenha o endereço e configure build `npm ci --omit=dev` e start `npm start` (Node 22.17+). Configure as variáveis TURN acima antes de testar; faça o deploy do backend primeiro.
3. Publique o `index.html` **e o diretório `assets/` completo** na raiz do GitHub Pages existente, mantendo a base `/lumen/`. Verifique a configuração da branch/pasta em Pages e aguarde o deploy.
4. Teste convite, chat, microfone em ambas as direções, câmera, compartilhamento com e sem áudio, entrada durante transmissão, saída e reconexão em pelo menos dois dispositivos e redes diferentes.

As salas, participantes e mensagens residem na memória do processo de sinalização; não há histórico persistente. Uma sala vazia é mantida por 60 segundos para permitir reconexão e depois removida. Um reinício do Render perde as salas. Execute uma única instância do backend: múltiplas instâncias exigiriam armazenamento e distribuição de eventos compartilhados. A mídia usa malha P2P (ou TURN), por isso o uso de banda cresce com o número de participantes. Salas podem ter senha opcional: o servidor mantém um hash scrypt com salt apenas em memória, limita tentativas por sala e não inclui a senha nos convites. A senha deve ser transmitida somente por HTTPS/WSS. Uma sala bloqueada ou protegida por senha não equivale a uma conta, autenticação forte ou proteção completa contra abuso. A camada gratuita do Render pode demorar a despertar.

## Arquitetura e limites conhecidos

O frontend é estático, sem build, e está dividido em `assets/js/core.js` (idioma e preferências), `connection.js` (sessão de sinalização), `rtc.js` (transporte por participante), `media.js` (captura e áudio), `ui.js`, `settings.js`, `studio.js` (perfil, temas, papéis de parede e acessibilidade) `room.js` (perfil, sons e chat), `layout.js` (painéis), `chess.js` (interface) e `shared-media.js` (player). Os estilos ficam em `assets/css/`. Não publique apenas o HTML. O backend `server.js` usa `ws` para sinalização e mantém o estado de salas em memória. A mídia usa malha P2P com STUN/TURN; não passa pelo WebSocket. O transporte P2P é adequado a grupos pequenos e consome mais banda de envio conforme o número de participantes aumenta.

Um SFU como mediasoup não é instalado no Render atual: ele requer portas públicas de mídia UDP ou TCP, enquanto o serviço web do Render expõe HTTP/WebSocket em uma única porta. Veja a [documentação do Render para WebSockets](https://render.com/docs/websocket) e a [API de transportes do mediasoup](https://mediasoup.org/documentation/v3/mediasoup/api/). Além disso, os [serviços gratuitos do Render](https://render.com/docs/free) podem hibernar depois de 15 minutos sem tráfego e levar cerca de um minuto para acordar; reinícios perdem as salas. Um TURN externo acessível continua necessário para redes restritas.

## Experiência da sala e privacidade

### Painéis e controles

A barra sobre a área de trabalho mostra ou oculta **Transmissão, Câmeras, Chat, Participantes, Jogos, Mídia e Controles**. Arraste a alça de cada cabeçalho para mover; arraste bordas ou cantos para redimensionar. Os painéis podem ficar sobrepostos: o painel clicado vem para a frente. Ao aproximar bordas aparece uma guia de encaixe. Os botões de cada cabeçalho minimizam, maximizam/restauram ou ocultam. O menu **Layouts** salva até 20 layouts nomeados, carrega ou exclui um layout e restaura o padrão. O layout corrente é salvo automaticamente neste navegador, com posições separadas para tela pequena e grande. Em telas pequenas a área rola verticalmente e as alças aceitam toque. No teclado, focalize a alça e use setas para mover ou Shift+setas para redimensionar. O vídeo mantém sua proporção e mover os painéis não reconstrói as conexões WebRTC.

O cabeçalho de Câmeras mantém as opções de faixa, grade, galeria ou vertical, colunas e espaçamento; ☆ coloca um participante primeiro. Configurações permite selecionar entrada/saída quando o navegador permite, volume geral, supressão de ruído/eco/ganho automático quando disponíveis, resolução e FPS ideais da câmera, enquadramento e prévia de câmera e teste de atividade do microfone. São preferências solicitadas ao navegador, não garantia de resolução/FPS. Em Participantes há volume e mudo local individuais; o volume do palco controla o áudio da transmissão, e o volume geral também é aplicado a ele. Áudio do sistema capturado faz parte dessa mesma transmissão, não possui uma trilha separada controlável. Indicadores de voz, estados de mídia e diagnóstico ICE permanecem disponíveis.

### Chat, perfil e sons

O chat oferece envio, edição/exclusão próprias, respostas, reações, cópia, horário, links HTTP(S), pesquisa local no histórico disponível, texto em **negrito** (`**texto**`), código (crases), menções simples `@nickname` e indicador efêmero de digitação. Anfitrião ou moderador pode destacar uma mensagem por vez; o servidor valida essa permissão. As menções não oferecem autocompletar nem correspondência completa a nicknames com espaços. O servidor mantém até 200 mensagens por sala em memória; busca não alcança mensagens descartadas. Reações são limitadas a 100 identidades por emoji e mensagem. Não há transferência de arquivos.

O Studio guarda fotos e fundos no IndexedDB e valida JPG/PNG/WebP até 5 MB. Nome, bio, foto, banner, cor e status **não são enviados automaticamente**. Em **Perfil e sons**, selecione os campos e confirme para transmiti-los à sessão; foto/banner são reduzidos e convertidos para JPEG antes do envio. A confirmação é dada após resposta do servidor. Quem entra depois recebe o perfil público dos participantes conectados; ao reconectar, os campos já autorizados são reenviados. Interrompa o compartilhamento pelo botão correspondente ou saia da sala. Outros participantes podem conservar dados já recebidos. Nickname da sala é sempre enviado; o nome do perfil é opcional e separado. Temas e preferências permanecem locais; limpar os dados do navegador os apaga.

Os efeitos são sintetizados, começam desativados e respeitam o desbloqueio de áudio por gesto do usuário. Em **Perfil e sons**, é possível escolher ou desativar o som de cada evento, ajustar o volume e ouvir prévias. A disponibilidade e o volume real dependem do navegador/dispositivo.

### Jogos e mídia compartilhada

Em **Jogos**, o jogo da velha continua disponível. Para xadrez, escolha outra pessoa e um relógio de 1 a 30 minutos; o convidado precisa aceitar. O servidor usa `chess.js` para validar jogadas, roque, en passant, promoção, xeque, xeque-mate, afogamento, repetição e material insuficiente; o tabuleiro permite arrastar ou selecionar origem e destino. Mostra histórico, relógios, desistência e convite de revanche. A repetição e a regra de 50 lances são tratadas automaticamente como empate, sem pedido do jogador; ainda não há ofertas de empate, incrementos ou cobertura integral da regra FIDE de possibilidade de mate na queda de tempo. O relógio continua durante a reconexão: o jogador tem 60 segundos de reserva, depois perde por desconexão caso o adversário ainda esteja presente. Partidas não sobrevivem ao reinício do processo.

O painel **Mídia** aceita links de vídeo HTTPS do YouTube e usa somente a [IFrame Player API oficial](https://developers.google.com/youtube/iframe_api_reference). A fila, permissão de controle (anfitrião ou todos), play/pause e posição são validados e distribuídos pelo servidor; cada navegador usa seu próprio player, sem download ou retransmissão. O controle nativo do player pode alterar apenas a reprodução local: use os botões da sala para compartilhar comandos. Bloqueios de autoplay, anúncios, permissões do vídeo, rede e diferenças de relógio podem gerar divergências; **não se garante sincronização perfeita**. O botão de sincronização tenta corrigir a posição local. O servidor não pode verificar duração ou disponibilidade do vídeo. O player só carrega quando um conteúdo é adicionado.

Spotify, SoundCloud e Vimeo não estão implementados. A [API de embeds do Spotify](https://developer.spotify.com/documentation/embeds/references/iframe-api) documenta limitações de autoplay e de busca, o [SDK do Vimeo](https://developer.vimeo.com/player/sdk/embed) depende das permissões do vídeo, e a [Widget API do SoundCloud](https://developers.soundcloud.com/docs/api/html5-widget) oferece controles de reprodução e posição no player incorporado. Uma futura integração precisa respeitar essas condições, autenticação e direitos das plataformas.

### Operação e limitações

O protocolo de chat/perfil fica em `room-features.js`; xadrez em `chess-room.js`; fila de mídia em `media-room.js`. O servidor identifica a autoria pela conexão e valida permissões e jogadas. O UID de reconexão é um segredo de sessão gerado no navegador; se for obtido por terceiros, pode permitir assumir a sessão durante a reserva. Não há contas nem autenticação forte. Dados não são criptografados de ponta a ponta no servidor, apenas protegidos em trânsito por HTTPS/WSS em produção. O cabeçalho `strict-origin-when-cross-origin` permite que o player receba a origem sem enviar o código do convite a terceiros.

**Escopo ainda incompleto:** não há outros jogos além de xadrez e jogo da velha, sincronização de Spotify/SoundCloud/Vimeo, notificações separadas do som, seletor/autocompletar de menções, formatação rica completa ou transferência de arquivos. A fixação de vídeo apenas ordena participantes; não há modos dedicados de foco/lado a lado/apresentação, presets de workspace além do padrão e dos layouts salvos, ou controle independente para áudio de sistema dentro da transmissão. As opções de qualidade dependem do navegador e não garantem suporte de hardware. Faltam testes em Firefox/Safari, TURN externo e testes manuais com pessoas e dispositivos em redes reais.
