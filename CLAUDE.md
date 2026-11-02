# IrisFlow — direção de design e ferramentas

Este arquivo é lido em toda sessão. Ele diz **como trabalhar a interface** deste
monorepo: quais skills usar, em que ordem, e como verificar o resultado olhando
a tela renderizada em vez de confiar no código.

## O repositório

| Pasta | O que é | Stack | Tipo de superfície |
|---|---|---|---|
| `site/` | site público (institucional, preços, download) | Vite + React + TS, CSS próprio | página — lida e rolada |
| `frontend/` | a interface do IrisFlow (comunicador, calibração) | Vite + React + Tailwind | tela de app — trabalhada |
| `app/` | app do cuidador | Expo / React Native, Reanimated, Gesture Handler, expo-haptics | app nativo |
| `electron/` | casca desktop que embala `frontend/` | Electron | tela de app |
| `voice-engine/`, `supabase/`, `scripts/` | motor de voz, banco, automação | — | não é UI |

Comandos: `npm run dev` (frontend), `npm --prefix site run dev`, `npm --prefix site run preview`,
`npm test`, `npm run verificar`.

O projeto é escrito em português do Brasil — nomes de arquivo, variáveis, commits
e comentários. Mantenha isso. A UI é para pessoas com deficiência motora severa
que usam **só o olhar**: alvos grandes, nada que dependa de precisão fina ou de
movimento rápido, e nenhuma animação que atrase uma ação.

## Skills instaladas

18 skills em `.claude/skills/` (escopo do projeto). Três só rodam quando
chamadas pelo nome: `/prototype`, `/pick-ui-library`, `/review-animations`
(elas têm `disable-model-invocation: true` de fábrica — isso é intencional).
As outras 15 disparam sozinhas pelo contexto.

Fonte canônica em `.agents/skills/` (compartilhada com Codex, Cursor, Copilot,
Gemini CLI, Antigravity). Atualizar tudo: `npx skills@latest update -p -y` e
`.claude/skills/impeccable/scripts/impeccable.cmd update`.

### Hierarquia de trabalho

A ordem abaixo é a prioridade **quando mais de uma skill cabe**. Não empilhe as
três em toda tarefa: cada uma tem um fluxo próprio e completo, e `impeccable`
diz explicitamente para não misturar direções. Escolha pelo tipo de trabalho.

**1. `design-taste-frontend` — direção estética (manda no visual).**
Dona do *look*. Tem um fluxo de 10 passos próprio: inventário do assunto →
argumento em claims → `draw.mjs` sorteia 3 direções de 20 pesquisadas → achar a
*ideia* (algo que só pertence a este assunto) → copy deck → construir → portão
→ **olhar os screenshots** → camada de movimento → relatório. Use para:

- qualquer página pública nova ou redesenhada em `site/`;
- quando a página parece genérica, templada ou "feita por IA";
- telas de app novas — aí leia `references/app-screens.md` inteiro antes e use
  `draw.mjs --app` / `inspect.mjs --app` (as regras são outras: borda discreta,
  rótulo pequeno e painel repetido são normais lá).

Scripts (rode da raiz do projeto; precisam de Node 22+ e Chrome — ambos
presentes; não instalam nada):

```bash
S=.claude/skills/design-taste-frontend/scripts
node $S/draw.mjs --list sectors            # setores disponíveis
node $S/draw.mjs --sector <s> --brief "<assunto>" --sections <papéis> --options 3
node $S/assets.mjs "<busca>"               # fotos/arquivos de acervo aberto, com licença
node $S/lint.mjs <arquivos>                # padrões banidos no código-fonte
node $S/inspect.mjs <url>                  # mede em 1440/768/390 e salva screenshots
node $S/scenes.mjs <url>                   # quando a página tem cenas de scroll
```

As regras da casa dela são **absolutas e medidas** pelo inspetor: títulos em até
duas linhas em toda largura; um `h1` claro na primeira tela; margens externas
iguais; sem eyebrow/kicker, sem monospace fora de código, sem numeração 01/02/03,
sem régua fina, sem gradiente, sem sombra em coisa parada, sem glass/blur, sem
emoji, sem card com ícone em quadradinho, no máximo duas fontes. Piso de
**4 imagens reais** (6–12 é o normal) e de **8 elementos que se movem**.

Tirar ornamento é metade do trabalho. A outra metade é substância: tipo maior,
campos inteiros de cor, imagens reais do mundo do assunto, e cada seção com o
conteúdo completo. Página vazia perde de página cheia.

**2. `impeccable` — refinamento, auditoria e melhoria (manda no acabamento).**
Dona do *rigor*. Use para mexer em UI que já existe, e como segunda opinião
depois que a taste fechou a direção. Regras do próprio skill:

- rode `.claude/skills/impeccable/scripts/impeccable.cmd context` **uma vez por
  sessão** (no Windows use o `.cmd`; o `impeccable` sem extensão é o launcher sh),
  mantendo o cwd na raiz. Não repita.
- leia `reference/craft-floor.md` **imediatamente antes de qualquer edição de
  UI**, inclusive refinamento pequeno. Não leia em trabalho só de planejamento.
- classifique a superfície no **modo** certo, pela superfície e não pelo produto:
  **Persuade** (`site/` — decidir e agir), **Operate** (`frontend/`, Electron —
  completar tarefa; escaneabilidade e consistência acima de expressão),
  **Read** (docs), **Experience** (vitrine).
- **Refinamento preserva, redesenho substitui.** Não divida a diferença
  polindo um visual que foi descartado. Pergunte antes de trocar copy factual.

Comandos (`$impeccable <verbo>`): `shape`, `critique`, `audit`, `polish`,
`bolder`, `quieter`, `distill`, `harden`, `onboard`, `animate`, `colorize`,
`typeset`, `layout`, `delight`, `clarify`, `adapt`, `optimize`, `document`,
`extract`, `init`, `live`, `generate`. Sem argumento, leia `reference/routing.md`
e ofereça o menu — nunca execute um comando por conta própria.

O detector roda por hook (`.claude/settings.local.json`) após Edit/Write e no
Stop. Em código-fonte ele é regex e **subconta**; o check completo é contra o
servidor rodando. Quatro subagentes vivem em `.claude/agents/`
(asset-producer, documenter, finish-reviewer, manual-edit-applier).

Não conserte drift de artefatos (`CONTEXT_STALE`) como efeito colateral de uma
tarefa de design — relate e siga.

**Os artefatos existem e estão limpos** (`$impeccable doctor`: "No drift found",
01/11/2026):

| arquivo | o que é |
|---|---|
| `PRODUCT.md` | verdade de produto da raiz, `Platform: web` — cobre `site/`, `frontend/`, `electron/` |
| `app/PRODUCT.md` | o IrisFlow Cuidador, `Platform: adaptive` |
| `DESIGN.md` | o sistema visual, North Star **"O Aro que Fecha"** |
| `.impeccable/design.json` | sidecar v2: rampas tonais, sombras, movimento, 8 componentes com HTML/CSS |

Três coisas que decorrem disso:

- **Antes de qualquer trabalho de design em `app/`**, carregue
  `reference/ios.md` **e** `reference/android.md` — a plataforma é `adaptive` e o
  `impeccable context` da raiz não os carrega sozinho.
- **`frontend/` é uma lacuna conhecida, não um segundo sistema.** Seu
  `tailwind.config.js` fixa só `primary: #1B54A8` e a `Boldonse`; ele não
  compartilha os tokens do `site/`. Alinhe-o ou rode `/impeccable document`
  apontando para ele antes de tratá-lo como sistema próprio.
- O `DESIGN.md` registra **dívida nomeada** que o inspetor da taste também pega:
  4 sombras em repouso (`.palco`, `.celular__moldura`, `.v3-chega`), 22 fios
  finos e 2 eyebrows. São para corrigir, não para imitar.

O `buildPath` (comp-first × code-first) **não está gravado** em
`.impeccable/config.json`, de propósito: nenhuma superfície foi construída nesta
sessão. O new-work oferece a escolha na primeira vez que ela importar. Não
invente um padrão aqui.

**3. Família Emil Kowalski — animação, interação e microinteração.**
Entram no detalhe do movimento, dentro do passo 9 da taste ou do `animate` do
impeccable:

- `animate` (web, do zero) · `animate-expo` (Expo/RN — é o caso de `app/`)
- `animation-performance` (frame budget, jank) · `apple-design` (gesto, spring, física)
- `find-animation-opportunities` (achar o que falta) · `improve-animations` (auditoria + plano)
- `remove-animations` (subtrair o que sobra) · `/review-animations` (crítica)
- `emil-design-eng` (filosofia de polimento) · `animation-vocabulary` (achar o nome de um efeito)
- `mobile-native` (web que precisa parecer instalada no celular)
- `break-ui` (dado de pior caso) · `ask-sonner` (toasts) · `/pick-ui-library` · `/prototype`
- `write-swift` (não se aplica a este repo hoje)

Toda animação: só `transform` e `opacity`, com fallback de
`prefers-reduced-motion` que mantém o conteúdo e tira o deslocamento. Conteúdo
nunca fica escondido se o script falhar.

**4. Figma MCP — consultar e extrair referência de design.**
Já conectado e autenticado na conta (`claude.ai Figma`, `https://mcp.figma.com/mcp`),
ferramentas `mcp__claude_ai_Figma__*`. **Quando houver link do Figma ou
referência visual, consulte antes de desenhar** — não invente o que já está
decidido lá.

- ler: `get_design_context`, `get_screenshot`, `get_metadata`,
  `get_variable_defs` (tokens), `download_assets`, `search_design_system`
- antes de qualquer ferramenta de arquivo, chame `create_session` com o fileKey
  e reuse o `sessionId` — vale também para leitura
- antes de `use_figma` (código → Figma), carregue a skill do próprio servidor
  com `get_figma_skill`

Referência do Figma **vence** o sorteio da taste quando existe marca definida:
passe `--keep palette,type` no `draw.mjs` e mapeie os valores reais nos papéis.

**5. Playwright MCP — testar, inspecionar e validar.**
Registrado no escopo do projeto em `.mcp.json` (`npx -y @playwright/mcp@latest`,
25 ferramentas `browser_*`). Use para abrir a página de verdade, clicar,
preencher, ler console e rede, e tirar screenshot em várias larguras.

- `browser_navigate`, `browser_snapshot` (árvore de acessibilidade — melhor que
  screenshot para checar nome acessível e ordem de leitura), `browser_click`,
  `browser_fill_form`, `browser_press_key` (teclado puro),
  `browser_take_screenshot`, `browser_resize`, `browser_console_messages`,
  `browser_network_requests`, `browser_emulate_media` (testar
  `prefers-reduced-motion` e tema)
- saída vai para `.playwright-mcp/` (ignorado pelo git)

## Como verificar — não negociável

**Olhe a tela renderizada.** Passar no medidor não quer dizer que está bom; e se
o problema aparece no screenshot, ele é real, não importa o que o código diga.

1. **Meça contra o servidor rodando, nunca contra `dist/index.html`.** Verificado
   neste repo: o build usa caminhos absolutos (`/assets/...`), então abrir o
   arquivo direto entrega página em branco e o inspetor relata "0 words, 0
   images" — um falso verde. Suba `npm --prefix site run preview` (porta 4173) ou
   `npm run dev` e aponte o inspetor para a URL.
2. Com build step, a última medição é no **build de produção**, não no dev
   server: minificador e bundler mudam o que embarca.
3. `node $S/inspect.mjs <url>` até **0 FAIL** em 1440, 768 e 390. Trate cada
   `WARN` como errado a menos que consiga defendê-lo em uma frase.
4. **Abra todos os screenshots que ele listar** (`.taste-skill/inspect/`), não só
   a primeira tela, e critique com `references/critique.md`. Corrija os três
   maiores problemas, meça de novo, olhe de novo. No máximo três rodadas.
5. Teclado e leitor: `browser_snapshot` para conferir que todo controle tem nome
   acessível e ordem de leitura; `browser_press_key` para andar só de Tab.
6. `prefers-reduced-motion` via `browser_emulate_media`: o conteúdo continua lá.
7. Acessibilidade, responsivo e performance têm dono: `$impeccable audit`
   (e `audit.native.md` no `app/`). Casos-limite e i18n: `$impeccable harden`.
   Dado de pior caso: `break-ui`.

Faça auditoria visual depois de **toda implementação significativa** — não ao
final de tudo. E agrupe as checagens: conserte o que uma olhada mostrou antes de
olhar de novo, em vez de screenshotar a cada ajuste.

## Não faça

- Não entregue layout genérico: hero centralizado, rótulo em cima do título,
  fileira de três cards com ícone, gradiente suave, régua fininha, legenda em
  monospace. É exatamente o que estas skills existem para impedir.
- Não invente prova social: cliente, depoimento, avaliação, imprensa, logo ou
  estatística de negócio. Detalhe de amostra é aceitável onde o brief tem lacuna
  — e vai listado no relatório para o cliente confirmar.
- Não apresente foto de acervo como se fosse do IrisFlow (produto, sala, equipe).
  Legenda diz o que a imagem é; o crédito fica pequeno no rodapé
  (`assets.mjs --credits`).
- Não troque substância por contenção: seção magra é o motivo mais comum de uma
  página limpa perder para uma cheia.
- Não diga que rodou uma verificação que não rodou, nem reivindique "0 FAIL" sem
  a saída do inspetor na mão.
- Não mexa em `voice-engine/`, `supabase/` ou `scripts/` a pretexto de design.

## Notas de ambiente

- `CLAUDE.md` **é versionado** (exceção `!/CLAUDE.md` no `.gitignore`, ao lado das
  de README e MEDICOES). `PRODUCT.md` e `DESIGN.md` **não são** — caem na regra
  `*.md` da política de privacidade (`.gitignore:82`) — e `app/PRODUCT.md` é
  ignorado pelo `app/.gitignore:20`. Funcionam igual: o impeccable e o Claude Code
  leem do disco. Para versioná-los, `!/PRODUCT.md` e `!/DESIGN.md` na raiz, e
  `!/PRODUCT.md` dentro de `app/.gitignore`.
- `.claude/` não é versionado (ignorado no `.gitignore` local e no global).
- `.mcp.json` e `.impeccable/design.json` **são** versionados: o Playwright e o
  sistema de design valem para quem clonar.
- `.taste-skill/` e `.playwright-mcp/` são saída de ferramenta e estão ignorados.
- O plugin global `frontend-design` sobrepõe estas skills. Neste projeto,
  `design-taste-frontend` e `impeccable` têm precedência; use `frontend-design`
  só quando nenhuma das duas se aplica.
