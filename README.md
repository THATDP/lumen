# Lumen

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

Os testes automatizados cobrem servidor, salas, convites, moderação, sinalização, mensagens, reconexão, preferências e transporte WebRTC entre três instâncias de navegador. O Chromium de teste usa dispositivos falsos, um canvas como fonte de vídeo de tela e um oscilador como áudio da transmissão; ele verifica vídeo decodificado e recebimento de pacotes de áudio (inclusive o áudio da transmissão), mas **não** substitui o teste manual da captura real, dos alto-falantes, nem de diferentes dispositivos e redes. O pacote de Chromium usado nos testes é para Linux x86-64 e requer bibliotecas básicas do sistema. Para testar em outro sistema, adapte o executável do navegador no teste.

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

O frontend é estático, sem build, e está dividido em `assets/js/core.js` (idioma e preferências), `connection.js` (sessão de sinalização), `rtc.js` (transporte por participante), `media.js` (captura e áudio), `ui.js`, `settings.js` e `studio.js` (perfil, temas, papéis de parede e acessibilidade). Os estilos ficam em `assets/css/`. Não publique apenas o HTML. O backend `server.js` usa `ws` para sinalização e mantém o estado de salas em memória. A mídia usa malha P2P com STUN/TURN; não passa pelo WebSocket. O transporte P2P é adequado a grupos pequenos e consome mais banda de envio conforme o número de participantes aumenta.

Um SFU como mediasoup não é instalado no Render atual: ele requer portas públicas de mídia UDP ou TCP, enquanto o serviço web do Render expõe HTTP/WebSocket em uma única porta. Veja a [documentação do Render para WebSockets](https://render.com/docs/websocket) e a [API de transportes do mediasoup](https://mediasoup.org/documentation/v3/mediasoup/api/). Além disso, os [serviços gratuitos do Render](https://render.com/docs/free) podem hibernar depois de 15 minutos sem tráfego e levar cerca de um minuto para acordar; reinícios perdem as salas. Um TURN externo acessível continua necessário para redes restritas.

O Studio grava fotos e imagens de fundo no IndexedDB, com validação de formato e limite de 5 MB por imagem. Nome, biografia, foto e banner do perfil local **não são enviados automaticamente**: apenas a ação explícita de usar um nome na sala o transmite. Temas e preferências ficam no armazenamento local. Limpar os dados do navegador também apaga essas personalizações; exportar um tema não exporta imagens nem perfil.

A reconstrução ainda **não é uma plataforma completa**. Entre os itens pendentes estão layout e barra de ferramentas configuráveis, notificações sonoras e menções, controle de ganho e teste de microfone, opções completas de acessibilidade e configuração, testes em Firefox/Safari e testes manuais com captura e reprodução em dispositivos e redes reais. Não há validação real de TURN neste ambiente. O suporte a captura de tela e áudio do sistema varia por dispositivo e navegador.
