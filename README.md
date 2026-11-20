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

Aponte o DNS para o TURN e libere TCP/UDP 3478 e a faixa UDP de relay configurada no firewall/NAT. Se usar `turns:`, configure certificado e chave TLS válidos no coturn e libere TCP 5349. A configuração exata de `external-ip` pode exigir o mapeamento público/privado do provedor. Restrinja destinos internos e monitore/limite abuso e consumo. Também há suporte legado a `TURN_USER` e `TURN_PASS` no lugar de `TURN_SECRET`, mas credenciais estáticas são entregues aos clientes e podem ser reutilizadas; prefira credenciais temporárias e políticas adequadas no TURN. A API de credenciais é pública, portanto o segredo por si só não impede abuso do relay.

Confirme em `https://lumen-server-xiye.onrender.com/api/ice` que a lista inclui o TURN após o deploy. Isso confirma apenas a configuração, **não** que o relay está acessível: teste com dois dispositivos em redes diferentes, inclusive uma rede móvel, verificando o tipo de candidato selecionado nas ferramentas WebRTC do navegador.

## Publicação e operação

1. Revise e faça merge da branch de trabalho na branch utilizada pelo Pages e pelo Render. Nenhuma publicação é feita automaticamente por estas instruções.
2. No serviço Render atual, mantenha o endereço e configure build `npm ci --omit=dev` e start `npm start` (Node 22.17+). Configure as variáveis TURN acima antes de testar; faça o deploy do backend primeiro.
3. Publique o `index.html` atualizado na raiz do GitHub Pages existente, mantendo a base `/lumen/`. Verifique a configuração da branch/pasta em Pages e aguarde o deploy.
4. Teste convite, chat, microfone em ambas as direções, câmera, compartilhamento com e sem áudio, entrada durante transmissão, saída e reconexão em pelo menos dois dispositivos e redes diferentes.

As salas, participantes e mensagens residem na memória do processo de sinalização; não há histórico persistente. Uma sala vazia é mantida por 60 segundos para permitir reconexão e depois removida. Um reinício do Render perde as salas. Execute uma única instância do backend: múltiplas instâncias exigiriam armazenamento e distribuição de eventos compartilhados. A mídia usa malha P2P (ou TURN), por isso o uso de banda cresce com o número de participantes. Uma sala bloqueada impede novas entradas, mas não é um mecanismo de autenticação forte. A camada gratuita do Render pode demorar a despertar.
