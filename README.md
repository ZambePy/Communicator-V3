# IrisFlow

Tecnologia assistiva de rastreamento ocular com webcam comum, feita para
pessoas com Esclerose Lateral Amiotrófica (ELA) e outras condições severas de
restrição motora. Sem hardware especializado: uma webcam, um computador e
100 % do processamento local.

O produto entregue à família chama-se **IrisFlow Communicator** — é esse o nome
do instalador, do atalho, do `productName`, da janela e da tela de abertura.
**IrisFlow** continua sendo o nome da empresa, e é assim que o app se apresenta
onde o espaço é curto (barra compacta, rodapés) e ao longo desta documentação.
Os canais de IPC e as chaves de `localStorage` seguem com o prefixo `irisflow`
**de propósito**: renomeá-los apagaria a calibração, os perfis, o vocabulário e
o vínculo de quem já usa o app.

![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)
![ONNX Runtime](https://img.shields.io/badge/ONNX%20Runtime-Web-005CED?logo=onnx&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Tasks%20Vision-00897B?logo=google&logoColor=white)
[![CI](https://github.com/ZambePy/Blinkv1/actions/workflows/ci.yml/badge.svg)](https://github.com/ZambePy/Blinkv1/actions/workflows/ci.yml)
[![Licença: GPL v3](https://img.shields.io/badge/licen%C3%A7a-GPLv3-blue.svg)](LICENSE)

---

## O que o sistema faz

O IrisFlow estima o ponto da tela para onde a pessoa está olhando e converte
fixações prolongadas (*dwell*) em cliques. Com isso o paciente escreve num
teclado, fala frases prontas, pede ajuda, joga e descansa, usando só os olhos.
No **Modo Computador** o mesmo cursor sai do app e passa a controlar o Windows
inteiro (clicar, arrastar, rolar, digitar), e com a **voz personalizada** o
que o paciente diz sai na própria voz dele, recriada a partir de uma gravação
— tudo processado neste computador. Um **assistente de escrita** aprende as
palavras e as frases dessa pessoa e as oferece de volta, para que dizer o que
já foi dito custe uma fixação em vez de vinte.

Duas pessoas usam o app: o **paciente**, que opera tudo pelo olhar em telas
de alvos grandes e alto contraste, e o **cuidador**, que usa mouse e teclado
para configurar, calibrar e acompanhar o rastreamento.

O repositório é um monorepo com as quatro peças do produto:

| pasta | o que é |
|---|---|
| `src/`, `frontend/`, `electron/`, `voice-engine/` | o app desktop (núcleo do rastreamento, interface, processo principal, motor de voz) |
| `site/` | o site: inscrição na beta, conta e download dos instaladores ([Site](#site-site)) |
| `app/` | o app do cuidador para celular, em Expo ([App do cuidador](#app-do-cuidador-app)) |
| `supabase/` | banco, regras de acesso e Edge Functions, compartilhados pelos três ([Supabase](#supabase-supabase)) |

A privacidade do produto se organiza em **três camadas**, e vale enunciá-las
nesta ordem porque é assim que elas são explicadas ao cuidador e ao paciente:

1. **O rastreamento é 100 % local e não sai nunca.** Imagens da câmera, marcos
   faciais, vetores de calibração e os registros brutos de sessão ficam neste
   computador. No Electron isso é imposto por política de conteúdo (CSP), não
   só por disciplina de código.
2. **O que o paciente escolheu dizer sai apenas quando há conta vinculada** — o
   texto que ele mandou falar, os alertas de socorro e os indicadores agregados
   da calibração vão para o celular do cuidador. Sem conta, nada disso existe;
   o app funciona inteiro offline. Ver [Conta IrisFlow e
   nuvem](#conta-irisflow-e-nuvem).
3. **Dois módulos dependem de autorização expressa por funcionalidade, e
   revogável**: a **clonagem de voz**, porque o áudio de referência é dado
   biométrico, e o **chatbot integrado**. Este último hoje existe só na versão
   local — o assistente de escrita — e por isso não envia nada; o dia em que
   houver um modo de nuvem, ele passará pela mesma autorização separada que a
   voz tem hoje.

Fora isso, o app só sai para a rede em três casos, todos fora do renderer: a
verificação de atualizações (GitHub Releases), o download, uma vez, dos pesos
do modelo de voz (processo Python) e o envio de relatórios de falha — este
só num instalador compilado com `IRISFLOW_CRASH_URL`, um segredo opcional do
release que, sem cadastro, deixa o envio desligado.

---

## Pipeline

```
Webcam (getUserMedia, até 1920×1080)
  │
  ├─ Ajuste da câmera em malha fechada ─ zoom (guiado pelo tamanho do rosto
  │     no quadro), brilho e contraste (guiados pela medida no recorte dos
  │     olhos). Roda uma vez, na abertura da câmera (até 14 iterações). Ao
  │     sair do laço, se o brilho medido está na faixa boa [0,25; 0,75] —
  │     convergir não é exigido, e não precisa ser: convergir já implica
  │     brilho bom —, trava exposição, balanço de branco e foco em manual.
  │     Ao subir a resolução, o `frameRate` é RE-DECLARADO: `applyConstraints`
  │     substitui o conjunto inteiro de constraints, e sem isso o pedido de
  │     30 fps do `getUserMedia` sumia — boa parte das webcams UVC entrega
  │     15 fps a 1080p contra 30 a 720p. Se a cadência medida depois da subida
  │     ficar abaixo de 24 fps E abaixo da de antes, a resolução é DESFEITA:
  │     para o olhar, cadência vale mais que pixels, e o custo aparece como o
  │     cursor travando. (Uma câmera que já entregava 15 fps a 720p não é
  │     rebaixada por continuar em 15: o rebaixamento só desfaz o que a
  │     subida causou.)
  │
  ├─ MediaPipe FaceLandmarker ─ 478 landmarks 3D + matriz de pose da cabeça
  │
  ├─ L2CS-Net (ONNX, Web Worker) ─ yaw / pitch do olhar. A política segue o
  │     provider efetivo: WebGPU recorta em 448² e submete a cada 100 ms;
  │     WASM cai para 224² e ~160 ms, porque lá quem manda é a latência da
  │     rede e insistir na resolução alta só produz leitura velha. Uma
  │     inferência em voo por vez; o recorte e o tensor (Float32Array NCHW)
  │     são montados na thread principal, no laço do engine, e o worker só
  │     roda a sessão ONNX. Enquanto o cliente ainda considera a última
  │     leitura válida (tolerância `max(400, 3·latência + cadência)` ms, teto
  │     2,5 s), o bloco a usa normalmente; passada essa tolerância, o último
  │     ângulo válido é REUSADO por mais 600 ms em vez de zerar o bloco —
  │     zerar produzia um
  │     degrau que o Ridge saltava e o One Euro tentava seguir, e o cursor
  │     pulava. Passada a janela, o ângulo não some de uma vez: ele
  │     DESVANECE por uma rampa de 200 ms até zero. O desvanecimento é no
  │     ÂNGULO e não nos sete termos — escalar os termos produziria um vetor
  │     que não corresponde a ângulo nenhum, enquanto escalar o ângulo mantém
  │     o bloco válido para ALGUM olhar, e como todos os termos têm fator
  │     `tan`, ângulo zero dá exatamente os mesmos sete zeros de antes. O
  │     provider efetivo, a latência, a fração de leituras obsoletas e o lado
  │     EFETIVO do recorte (224 no WASM, mesmo com a flag em 448) vão para os
  │     diagnósticos e para o relatório. O motivo de cada bloco zerado é
  │     agregado por alvo de calibração e aparece na mensagem de repetição da
  │     tela de calibração — não no relatório; o peso com que o ângulo entrou
  │     só é lido como "zerado ou não" pela calibração
  │
  ├─ Escala métrica pela íris ─ o diâmetro horizontal visível da íris é
  │     notavelmente constante (11,7 mm, ±4 %, praticamente invariante com
  │     etnia), e serve de régua para MEDIR a distância cantal desta pessoa
  │     no lugar dos 9,0 cm genéricos. As duas medidas saem do mesmo quadro,
  │     à mesma profundidade, então a distância da câmera se cancela e não é
  │     preciso conhecer o FOV. Importa porque a compensação lateral é 1:1
  │     em centímetros: num rosto de 8,2 cm, a constante genérica faria a
  │     cadeira andar 4 cm e o cursor andar 4,4
  │
  ├─ Vetor de features por olho ─ 2 dimensões de íris (`offsetX`/`offsetY`)
  │     + 2 do L2CS (`tan yaw` / `tan pitch`) = 4
  │     expansão polinomial de grau 2 PARCIAL: o par angular fica só no termo
  │     linear, porque já chega linearizado pela tangente — a geometria de
  │     projeção é `x_tela ≈ x_olho + d·tan(yaw)`, então a 1ª ordem já é o
  │     modelo certo e o quadrado captura só curvatura residual.
  │     4 dims → 7 colunas por olho → StandardScaler → Ridge por olho, com λ
  │     por eixo e penalidade branqueada pelo ruído intra-fixação
  │
  ├─ Fusão binocular ─ ponderada pela abertura de cada olho, pela
  │     confiabilidade medida no treino e pela dominância ocular configurada
  │
  ├─ Referência geométrica ─ as compensações medem um Δ contra a pose e o
  │     centro do rosto no instante da calibração, e essa referência fica
  │     FIXA. Existiu (e continua como flag, `referenciaLenta`, desligada) uma
  │     referência lenta: uma EMA de τ = 30 s que absorveria a deriva de
  │     postura. Na gravação de 22/09 ela absorveu 43–48 % de uma rotação real
  │     de cabeça — medida contra uma referência que andava junto, a
  │     compensação corrigia metade do movimento —, e desligá-la derrubou o
  │     erro do miolo de 88 para 67 px no replay (`docs/MEDICOES.md` §14.5). A
  │     deriva lenta de postura fica com o reajuste de 2 s no centro e com a
  │     correção por dwell (abaixo)
  │
  ├─ Compensação de cabeça ─ na saída, depois da fusão: primeiro a distância
  │     (a distância ATUAL até a tela é inferida somando a variação medida na
  │     câmera à distância de calibração; a correção em si é um ESCALONAMENTO
  │     do ponto em torno do centro da tela pela razão entre as duas, presa a
  │     0,6–1,6), depois a pose (d·tan Δ, com d = distância de calibração),
  │     por último a translação lateral do tronco (nariz em unidades da
  │     distância cantal medida). Só a de pose também é aplicada aos ALVOS de
  │     treino; as de distância e translação são exclusivas da inferência.
  │     Limite conhecido: o escalonamento de distância gira em torno do centro
  │     da TELA, e o ponto certo é a projeção do olho — igual só quando os
  │     olhos estão à altura do centro (ver "compensação 6DoF" abaixo)
  │
  ├─ Correção local dos cantos ─ a calibração padrão tem os quatro cantos da
  │     tela (a 5 % da borda) além da grade 3×3, e o resíduo médio de cada
  │     canto vira uma correção local: um processo gaussiano (núcleo RBF,
  │     ℓ = 0,10 da tela, σ² = 0,10) ancorado em resíduo zero nos nove alvos
  │     da grade. Perto do canto ela puxa o ponto para onde a pessoa de fato
  │     olhava; no miolo ela some (< 0,01 px no centro). É o que o polinômio
  │     global não representa: a saturação da íris embaixo, quando a pálpebra
  │     cobre, e a expansão nos cantos. `src/correcaoLocal.ts`; viaja no
  │     perfil salvo
  │
  ├─ Correção por dwell ─ ainda dentro de `mapGaze`, depois das compensações
  │     e da correção dos cantos, e ANTES do clamp: cada dwell concluído num alvo isolado
  │     é um rótulo de graça — a pessoa estava olhando para onde clicou. O
  │     resíduo de cada rótulo entra num integrador de ganho 0,05 (não numa
  │     média) com decaimento de meia-vida de 10 min, e o deslocamento é
  │     limitado a 8 % da tela. Recusa rótulo de quadro degradado, saturado
  │     pelo clamp, em modo apresentação, de alvo de emergência e de dois
  │     dwells a menos de 300 ms. No Modo Computador aprende dos alvos que a
  │     própria sobreposição desenha (barra e teclado flutuante, lado ≥ 52 px)
  │     — um botão de 20 px do Windows não é evidência de para onde a pessoa
  │     olhava. A aplicação vem aqui; o aprendizado acontece na conclusão do
  │     dwell
  │
  ├─ Clamp de borda ─ `suave` (produção geral): Hermite cúbico nos 2 % de cada
  │     borda, para o ponto caber na tela sem salto de velocidade. `duro` no
  │     Modo Computador: [0, 1] com margem de 0–4 px, porque ali os alvos são
  │     os botões da borda da tela e 2 % de amortecimento é o que fazia o
  │     cursor "não chegar" no canto. É a última etapa dentro de `mapGaze`
  │
  ├─ Filtro temporal ─ One Euro (produção); Kalman e Kalman+EMA disponíveis
  │     para comparação (`filterMode`). Vem depois de tudo isso, no engine
  │
  ├─ Estabilizador de fixação ─ durante uma fixação a melhor estimativa não é
  │     a última amostra: é a média da janela de 200 ms. Na sacada a média é
  │     veneno, porque mistura a partida com a chegada. A saída é
  │     `x + w·(média − x)`, com `w` CONTÍNUO: sobe com o enchimento da janela
  │     e cai com a dispersão I-DT (1 até 1,0°, 0 a partir de 1,5°). Os dois
  │     extremos são o comportamento de sempre; o que sumiu foi o degrau entre
  │     eles. Teto rígido de 0,5°: a média limpa ruído, não inventa posição
  │
  ├─ Seguidor de cursor ─ SEPARA A TAXA DE RENDER DA TAXA DE INFERÊNCIA. A
  │     posição era escrita no DOM uma vez por quadro de câmera, o que é
  │     zero-order hold puro: ~65 % dos quadros de display sem movimento
  │     nenhum e os outros recebendo o passo inteiro. Agora um laço de rAF
  │     distribui o mesmo passo pelos quadros de tela — mesmo caminho, mesmo
  │     tempo, passos menores. Custo de meio intervalo de amostra de latência
  │     (~16 ms a 30 Hz, ~24 ms nos 21 Hz medidos), deliberado e abaixo do
  │     limiar em que a latência começa a custar acerto. Vale na janela do app
  │     E na sobreposição do Modo Computador (que até 22/09 ainda escrevia a
  │     posição uma vez por amostra). NÃO
  │     extrapola (errar no fim da sacada custa uma seleção errada) e NÃO
  │     segura predição velha: passados 300 ms sem amostra ele congela e
  │     avisa, e o cursor fica translúcido
  │
  └─ Interação ─ dwell, cursor, emergência, varredura opcional, fallback
        quando o olhar se perde. É na conclusão do dwell que a correção por
        dwell (acima) recebe o rótulo
```

### Nenhum estágio comuta: todos desvanecem

Um princípio que atravessa o pipeline inteiro e vale registrar sozinho. Vários
estágios têm um limiar — "acima disto é sacada", "acima disto a pose é
implausível", "passado isto a leitura é velha". Toda vez que um limiar desses
era um **portão binário**, o cruzamento dele somava, num único quadro, a
diferença inteira entre os dois comportamentos. Medindo duas gravações de tela
quadro a quadro, durante movimento real:

| | build de 02/09 | build de 18/09 |
|---|---|---|
| taxa efetiva | 19,3 Hz | 21,2 Hz |
| deslocamento mediano por quadro | 0,77 px | 1,63 px |
| **quadros com salto > 30 px** | **0,9 %** | **11,8 %** |

A taxa não tinha caído — tinha subido. O que se relatava como "travada" era o
padrão **para-e-teleporta**: alguns quadros imóveis seguidos de um pulo. Foi o
que redirecionou o trabalho: o problema não era suavizar pouco, era o tamanho
do passo.
Os portões encontrados e o tamanho do degrau de cada um, na geometria de
referência (1920×1080, 23,6", 60 cm → 38,5 px/grau):

| portão | degrau | hoje |
|---|---|---|
| soltura da EMA angular, limiar único em 40 °/s | ~68 px | rampa de 20 a 60 °/s |
| compensação de pose, portão em ±30° | **1273 px** | rampa de ~10° em torno do limiar |
| estabilizador, média ↔ amostra crua | até 19 px | peso contínuo |
| fim do reuso do bloco L2CS | vetor cheio → 7 zeros | ângulo desvanece em 200 ms |

Em todos, os **dois extremos são idênticos ao comportamento anterior** — a
rejeição continua rejeitando, a sacada continua soltando — e a rampa é um
Hermite (3t²−2t³), contínuo em valor e em derivada. A regra que ficou: um
limiar no caminho do cursor é uma rampa, não uma chave. Os testes que protegem
isso são de **refinamento**: varrem o parâmetro com passo grosso e fino e
exigem que o maior salto encolha proporcionalmente — uma descontinuidade não
encolhe, fica presa no tamanho do degrau.

Outras duas não eram limiares, e sim afirmações falsas:

- **Piscada sem Kalman.** O teto de 2 s que separa "piscada" de "olho fechado"
  só rodava com a cadeia Kalman. Nos presets One Euro — que são o padrão — o
  ramo emitia a última posição, bit a bit idêntica, com `hasFace: true` e sem
  degradar, **sem teto nenhum**. É o congelamento de 967 ms medido na gravação
  de 18/09. O hold agora roda nos dois modos, e passado o teto a amostra sai
  marcada como degradada.
- **`mapGaze` nulo com o modelo treinado.** Caía no fallback do NARIZ, que não
  tem relação com o olhar e não tem teto: um único quadro de exceção
  arremessava o cursor e o trazia de volta. O nariz continua sendo o ponteiro
  de quem **ainda não calibrou** — ali ele é a medida, não um substituto para
  uma que faltou. Calibrado, o cursor simplesmente não se move, e o timer de
  degradação avisa.

Quando a geometria sai do lugar — a pessoa sentou mais perto, escorregou na
cadeira, apoiou a cabeça de outro jeito — a primeira saída **não** é
recalibrar. Um **reajuste de 2 s** olhando um alvo único no centro mede onde o
cursor está caindo enquanto a pessoa olha o centro e desconta esse desvio como
deslocamento da correção por dwell (até 8 % da tela; acima disso ele recusa e
pede nova calibração). O Ridge e as referências de pose e de distância ficam
como estão: até 23/09 o reajuste recomeçava as referências, o que faz sentido
só se o "zero" da cabeça mudou sem o olhar mudar — e apagava de uma vez a
compensação da postura que a pessoa ainda mantinha. Ele aparece como botão no
aviso de distância e no de postura; não tem botão de cancelar próprio (2 s é
menos que o tempo de achar um botão com o olhar), mas a Emergência fica por
cima dele, e acioná-la cancela o reajuste e descarta a coleta. A calibração
completa é pedida pelo **vigia de recalibração** quando o
modelo deixou de descrever a pessoa: dispersão recente (mediana da BCEA de 20
fixações) acima de 3× a do último teste de precisão salvo, viés acima de 2× o
de lá (piso 48 px, teto 80 px), ou a correção por dwell a 90 % do seu teto —
este último critério vale mesmo sem teste salvo. O vigia é consultado a cada
15 s; o aviso só aparece depois de duas consultas positivas seguidas, com
"Calibrar de novo" e "Agora não" (que dorme por 10 min), e some sozinho quando
a medida volta ao normal. Continuam existindo os outros caminhos para
recalibrar: a checagem de retomada, o diálogo de deriva de pose e o botão
manual em Configurações.

A **calibração** apresenta **13 alvos**: uma grade 3×3 posicionada por um
orçamento de excentricidade angular (≤ 16°) e os **quatro cantos da tela**, a
5 % da borda — onde ficam o botão de Emergência e o de voltar. Até 23/09 eram
só os nove da grade, e o canto era previsto por extrapolação: 201 px de erro
contra 88 px no miolo, na gravação de 22/09; com os cantos na calibração e a
correção local deles, 40 px no replay (a expectativa realista ao vivo é de
40–110 px — ver `docs/MEDICOES.md` §14.5). O modo rápido continua com 4 alvos
(os cantos da grade), e o perfil `computador` tem 13 alvos próprios, indo a
2 % da borda, porque ali o alvo é o canto do monitor. Cada alvo descarta os
primeiros 600 ms — sacada e acomodação — e abre em seguida uma janela útil
cujo TETO cresce com a distância ao centro (normalizada: 0 no centro, 1 no
canto geométrico): `1680 + d·1120` ms, o que dá 1680 ms no centro e ~2690 ms
nos cantos a 5 % (no `computador` um bônus por excentricidade angular leva o
canto a até ~3900 ms). É teto, não duração fixa: o ponto fecha assim que o
olhar estabiliza, com piso de 900 ms e 15 amostras. No pior caso os 13 alvos
somam ~39 s na tela de referência, abaixo do teto de fadiga de 40 s que um
teste segura.

Amostra com bloco angular zerado **é aceita**, e isso é deliberado: rejeitá-la
derrubava a linha inferior da grade inteira — é onde a pálpebra cobre a íris —
e os alvos de baixo eram pulados por esgotar as tentativas, deixando o modelo
extrapolar justamente a região onde ficam os botões mais usados. Trocamos "sem
a linha de baixo" por "com a linha de baixo, parte dela com bloco zerado". Hoje
nenhuma amostra da coleta é rejeitada por qualidade: o gate de qualidade e o
bloco zerado CONTAM (e o contador vai para o diagnóstico do ponto), mas a
amostra entra. As únicas amostras fora são as dos 600 ms de acomodação e as
recebidas fora de um alvo.

O Ridge é treinado por olho, com λ escolhido por eixo em validação cruzada
leave-one-target-out — cada fold deixa de fora um alvo inteiro, não uma
amostra. A regularização não é isotrópica: durante a janela de um alvo o olhar
está parado por construção, logo toda variação intra-alvo é ruído, e trocar
`λI` por `λ·m·Σ_W` (a covariância intra-alvo) penaliza forte as direções que
só o jitter preenche. Sem isso, medimos ~30× de amplificação de ruído.

Ao fim, um **teste de precisão** de 13 pontos (grade 3×3 interior mais 4
cantos a 5 %) mede a qualidade do modelo. Os nove interiores ficam fora da
grade de calibração, para medir generalização; os quatro cantos coincidem,
desde 23/09, com os cantos calibrados — ali o teste mede a acurácia no canto
calibrado, que é o que o botão de canto sente. Os alvos aparecem em **ordem sorteada**,
com a semente gravada no relatório; cada um coleta 2000 ms, dos quais os
primeiros 600 ms de sacada e acomodação são descartados — sobram **1400 ms
úteis**, ~42 amostras a 30 Hz. Um ponto que receba menos de 80 % dos quadros
esperados é marcado, não removido; abaixo de 8 amostras ele entra no relatório
como não medido. As métricas saem da predição crua, antes do filtro temporal —
a dispersão do cursor filtrado é reportada à parte. O relatório JSON traz
acurácia (erro médio em px e em graus, viés por eixo), as três medidas de
precisão que a literatura pede juntas (desvio-padrão por eixo, RMS
amostra-a-amostra e BCEA de 68 %), perda de dados, taxa de acerto por raio de
alvo, a distância medida durante o teste e o **tamanho mínimo de botão** que o
erro daquela pessoa exige.

Durante a medição **o cursor fica escondido**, e isso não é economia de tela: o
cursor é um laço de realimentação. Vendo-o, a pessoa corrige o olhar até ele
cair no alvo — a partir daí "olhar para o alvo" deixou de ser verdade, o erro
medido vira o resíduo da perseguição, e ele tende a zero qualquer que seja a
qualidade do modelo. A contaminação entra no COMPORTAMENTO, então nenhum
pós-processamento a desfaz.

Como a pergunta "consigo levar o cursor até o alvo?" também importa — e é ela
que decide se o teclado é usável —, ela virou uma **segunda rodada, separada**:
*Verificar com cursor*, em Configurações, ao lado de *Testar precisão*. Ali o
cursor aparece de propósito, a malha é fechada, e as métricas são outras:
quantos alvos foram alcançados, o tempo mediano até pousar em cada um e a
fração do tempo dentro do raio. Elas vivem em `result.verificacao`, nunca são
somadas às do protocolo, o JSON declara qual rodada foi (`protocolo.modo`) e a
rodada de verificação **não** escreve a linha de base do vigia de recalibração
— compará-la com uma medição seria comparar duas perguntas diferentes.

Um limite conhecido, medido: no perfil `padrao` a grade INTERNA cobre até
**y = 0,8375 em qualquer geometria plausível** (o extent vertical satura, e o
orçamento menor para baixo — a pálpebra, não o ângulo — é sempre o termo
proporcional; numa 32" a 50 cm o extent não satura e a linha de baixo sobe
para 0,767). Desde 23/09 os dois cantos de baixo (y = 0,95) são calibrados e
corrigidos localmente, mas o **meio da borda de baixo** continua previsto por
extrapolação do modelo global: a correção de um canto não chega lá (a 0,45 da
tela, o núcleo de ℓ = 0,10 vale e⁻¹⁰). No perfil `computador` a grade vai a
y = 0,98. Um teste (`calibration.coberturaDaTela`) fixa os valores medidos e
falha se a grade deixar de cobrir o topo, onde fica o botão de emergência. O
protocolo completo, o significado de cada métrica, o checklist de relato, o
histórico das sessões e as referências estão em
[`docs/MEDICOES.md`](docs/MEDICOES.md).

### Compensação de cabeça: o que existe, e para onde vai (6DoF)

Hoje a cabeça é compensada por **três estágios independentes** somados na
saída (distância, pose yaw/pitch, translação lateral), mais o **roll cancelado
no recorte do L2CS** (ligado em 22/09: o recorte gira para nivelar o rosto, a
rede responde no referencial nivelado e `l2cs/roll.ts` desfaz a rotação no
vetor 3D; o roll que vai para o recorte é suavizado com τ = 150 ms para o
tremor do MediaPipe não virar tremor de imagem). Funciona a primeira ordem, e
tem três limites estruturais, medidos na geometria de referência:

- **Rotação e translação contam a mesma coisa duas vezes.** `d·tan(Δyaw)`
  assume que a cabeça gira em torno do olho; ela gira em torno do pescoço,
  ~10 cm atrás. Girar 10° move o nariz 1,7 cm, e a compensação de translação
  — que olha o nariz — dispara junto: 64 px a mais sobre os 389 px da rotação
  (16 %), sistemáticos.
- **O escalonamento de distância gira em torno do ponto errado.** A geometria
  é `P = E_xy + (D/g_z)·g_xy`: afastar-se escala o ponto em torno da PROJEÇÃO
  DO OLHO na tela, não do centro dela. Com os olhos 10 cm acima do centro e um
  recuo de 10 cm em 60, isso são 61 px. Corrigir exige saber onde a câmera
  está em relação à tela (extrínsecos), que o app ainda não pergunta nem
  estima — por isso não foi "consertado" com um palpite.
- **Duas famílias de feature com leis de transformação diferentes.** O offset
  da íris é uma medida no referencial da cabeça; o ângulo do L2CS, no da
  câmera. Na calibração a cabeça está parada, as duas são colineares e o
  Ridge reparte o peso entre elas de forma arbitrária; quando a cabeça gira,
  cada uma muda de um jeito e nenhuma compensação a jusante sabe qual split
  o Ridge escolheu.

A saída estrutural é parar de prever coordenadas de tela e prever a **direção
do olhar no referencial da cabeça**, intersectando com a tela pela pose 6DoF
medida (`ĝ_cam = R·ĝ_h`; `P = e + (−e_z/g_z)·g_xy`). O rótulo de treino sai
de graça de cada amostra de calibração (`ĝ_h = Rᵀ·normalize(T − e)`), o mesmo
Ridge serve, roll fica de graça em `R`, e a calibração passa a tolerar
movimento de cabeça. O que falta: os extrínsecos câmera→tela (uma pergunta no
setup, refinada pela própria calibração), o FOV como dependência dura, e a
qualidade de `R` do MediaPipe — 1° de erro em `R` é 1° de olhar (38,5 px). Por
isso a migração é uma **mistura contínua** entre o modelo atual (perto da pose
de calibração) e o geométrico (longe dela), bit a bit idêntica ao de hoje em
Δ = 0. Isto é o plano, não código: nada da migração 6DoF está implementado.

Duas notas de desenvolvimento. A janela abre em **tela cheia** — no `npm run
electron:dev` e no app empacotado: a conversão px→cm usa o viewport contra a
diagonal física da tela, e em janela toda medida saía enviesada (para o
paciente, além disso, barra de tarefas e bordas são alvos que ele não usa). O
cuidador sai e volta com F11 (Ctrl+Cmd+F no macOS); `IRISFLOW_FULLSCREEN=0`
abre em janela. E, só em desenvolvimento, cada abertura começa **sem
calibração salva** (`?calib=0`), para o fluxo de calibração ser exercitado de
verdade; `IRISFLOW_DEV_CALIB=1` religa a persistência. O app empacotado
persiste a calibração — uma pessoa com ELA não refaz treze pontos a cada
abertura.

---

## Estrutura do repositório

```
src/                        núcleo do pipeline (TypeScript puro, testado com Vitest)
  tracker/engine.ts         loop principal, estados, diagnósticos, recuperação de falhas
  calibration.ts            coleta, treino, inferência, perfis e diagnóstico de ajuste
  correcaoLocal.ts          correção local dos cantos (processo gaussiano ancorado na grade)
  accuracy.ts               teste de precisão e relatório de sessão
  accuracyProtocol.ts       tempos do protocolo de medição
  extractor.ts              features de íris e bloco angular; conjunto ativo
  featurePipeline.ts        fronteira consumida pelo engine
  ridge.ts, scaler.ts       Ridge anisotrópico com CV de λ; padronização
  calibration/polynomial.ts expansão polinomial de grau 2, completa ou parcial
  escalaMetrica.ts          a íris como régua: distância cantal desta pessoa
  referenciaLenta.ts        referência geométrica lenta (desligada por padrão; ver Pipeline)
  reancoragem.ts            acumulador do reajuste de 2 s no alvo central
  vigiaDeRecalibracao.ts    quando a calibração completa é de fato necessária
  l2cs/                     worker ONNX, recorte, decodificação, proveniência, roll
  olho/                     ramo ocular (V2): recorte 96×64, bloco de features, provedor
  camera/                   campo de visão por câmera
  filters/                  One Euro, Kalman 2D, EMA adaptativa, hold na piscada,
                            estabilizador de fixação (peso contínuo da média)
  interaction/              dwell, cursor, varredura, clique por piscada, fallback,
                            correção por dwell; seguidorDeCursor.ts desenha o cursor
                            na taxa do DISPLAY, não na da câmera
  poseCompensation.ts       compensação geométrica de pose
  distanceCompensation.ts   compensação de distância (fator 0,6–1,6)
  translationCompensation.ts compensação de translação lateral do tronco
  anthropometry.ts          constantes antropométricas e seus limites
  contraluz.ts              luz atrás da pessoa: invalida o quadro, não corrige
  cameraTuner.ts            lei de controle do ajuste da câmera
  setupReadiness.ts         prontidão do posto (distância, luz, reflexo, postura)
  qualityAnalyzer.ts        brilho, contraste, borrão e reflexo por quadro
  flickerDetector.ts        cintilação da rede elétrica
  displayGeometry.ts        geometria física da tela; displayGeometryEdid.ts é a
                            parte pura do EDID (bytes → cm), lido pelo SO em
                            electron/monitores.ts
  diagnostics/preflight.ts  verificação antes de medir
  config/experiment.ts      flags de experimento (localStorage, URL, ambiente)
  telemetry/                gravação JSONL e cronometragem por estágio
  testUtils/                harness sintético, baseline de regressão e o replay de
                            gravação real pelo núcleo (replayDeGravacao.ts)
  electronSecurity.ts       permissões, navegação, CSP e travas do app empacotado
  computador/               Modo Computador: geometria (janela→tela→físico),
                            structs INPUT do Win32 e contrato IPC (puro, testado)
  voz/                      contrato da voz clonada (IPC, protocolo do motor e
                            faixas de hardware em requisitos.ts)
  assistente/               motor do assistente de escrita (palavras, bigramas,
                            frases, respostas; puro, testado)

frontend/                   interface do desktop (React 19, Tailwind v4, HashRouter)
  src/pages/onboarding/     boas-vindas, calibração e teste
  src/pages/tutorial/       a jornada de 10 passos; `passos.ts` é a ordem e a trava,
                            `missao.ts` é a ponte com as telas reais
  src/pages/                menu, teclado, frases, jogos, descanso, emergência...
  src/pages/settings/       configurações do cuidador, por seção
  src/pages/caregiver/      painel e guia do cuidador
  src/context/              GazeContext (olhar, dwell, câmera), licença, emergência
  src/cloud/                conta IrisFlow: vínculo, fila offline, tempo real, cofre
  src/services/license/     licença real (Supabase) e simulada (sem nuvem)
  src/components/ui/        GazeButton, GazeGrid, GazePageLayout e afins
  src/overlay/              a SOBREPOSIÇÃO do Modo Computador (página própria,
                            `overlay.html`): cursor, barra de ações, lupa, teclado
  src/computador/           hook que liga o Modo Computador e manda o olhar ao main
  src/services/voz/         `falar()`: voz clonada quando pronta, senão a do sistema
  src/services/assistente/  persistência do assistente e a porta das sugestões
  src/services/apresentacao.ts  modo apresentação: corta a saída para a nuvem
  src/services/diagnostico/ relatório de suporte (JSON sem nada do paciente)
  src/test/quadros.ts       relógio de quadros determinístico para os testes do cursor
  src/index.css             tokens de design (cores, raios, tipografia)

electron/                   processo principal, preloads e IPC de sistema
  main.ts                   janela, CSP, travas de depuração, IPC
  atualizacao.ts            atualização automática (electron-updater, GitHub)
  diagnostico.ts            log local e relatório de falhas
  monitores.ts              tamanho físico dos monitores: EDID do registro/WMI
                            (Windows), sysfs (Linux), ioreg/CoreGraphics (macOS)
  computador/               sessão do Modo Computador, sobreposição, adaptadores
                            (Windows via koffi/user32, Linux via xdotool)
  voz/                      gerente do motor de voz (processo Python)
  build.mjs, package-app.mjs  compilação e empacotamento (electron-builder)
voice-engine/               motor de voz local em Python (Chatterbox multilíngue)
build/                      ícones e entitlements do macOS, usados pelo electron-builder
fixtures/                   contrato de recorte TS ↔ Python (gerado, não editar à mão)

site/                       site (Vite + React): inscrição, conta, downloads — ver Site
app/                        app do cuidador (Expo) — ver App do cuidador
supabase/                   migrações, Edge Functions, seed e config do CLI — ver Supabase

scripts/
  verificar-tudo.mjs        `npm run verificar`: tipos, testes e builds do desktop, do
                            site e do app (o mesmo portão do ci.yml)
  conferir-pacote.mjs       confere o app empacotado (sem source map, fuses, asar...)
  ci-segredos-opcionais.mjs repassa ao CI só os segredos que existem; confere os da nuvem
  db-local-test.sh/.sql     aplica todas as migrações num PostgreSQL local e testa o cenário
  analisar-gravacao.mjs     diagnóstico de uma gravação do rastreador (JSONL)
  limpo.mjs                 roda o dev com o armazenamento local zerado
.github/workflows/          ci.yml (push/PR), release.yml (tag v*), supabase-keepalive.yml

docs/MEDICOES.md            protocolo, métricas e histórico de medição
docs/medicoes/historico/    relatórios reais de teste de precisão guardados
```

---

## Requisitos

Para desenvolver: Node.js 22.12 ou superior (o CI usa Node 24) e, só para o
motor de voz, **Python 3.11 (64 bits)** — ver [Voz personalizada](#voz-personalizada-clonagem-local).

### Hardware do paciente (tabela preliminar)

Os números abaixo são o ponto de partida para a tabela oficial que sai com o
lançamento; valem para o app inteiro, e a coluna da voz é o que muda o piso.

| componente | mínimo (rastreamento + comunicação) | mínimo com voz personalizada | recomendado |
|---|---|---|---|
| Sistema | Windows 10 64 bits (Modo Computador: Windows) | Windows 10/11 64 bits | Windows 11 |
| Webcam | 1280×720 @ 30 fps | idem | 1920×1080, campo de visão estreito, perto do rosto |
| Processador | quad-core com WebAssembly SIMD (Intel 8ª geração / Ryzen 2000 ou melhor) | 6 núcleos ou mais (a síntese em CPU usa metade dos núcleos, no máximo 4, para o rastreamento não engasgar) | — |
| GPU | WebGL (MediaPipe) | WebGL; **NVIDIA com CUDA** deixa a síntese quase imediata | WebGPU para o L2CS (~2 s → ~50 ms por inferência) |
| Memória | 8 GB | **16 GB** (o modelo de voz ocupa 2–3 GB enquanto carregado) | 16 GB |
| Disco | 2 GB livres | 5 GB livres (pesos do modelo ~1,5 GB + cache de frases até 300 MB) | SSD |
| Ambiente | luz frontal difusa | idem | apoio de cabeça; monitor com diagonal conhecida |

O erro do rastreamento escala com o inverso da densidade de pixels sobre o
olho: uma lente mais estreita ou a câmera mais perto do rosto melhora a
precisão mais do que qualquer ajuste de software. A latência da voz
personalizada em CPU é de alguns segundos por frase nova; frases já ditas
saem do cache na hora (ver a seção da voz).

Para a **voz clonada** especificamente, a tabela que vale — e que o app mostra
na tela, com a faixa deste computador destacada — é a de
[Requisitos de hardware da voz](#requisitos-de-hardware-da-voz), derivada de
`src/voz/requisitos.ts`.

---

## Instalação e execução

```bash
npm install                      # núcleo + Electron; inclui o `koffi` (FFI do Windows para o Modo Computador)
npm --prefix frontend install    # interface do desktop
npm --prefix site install        # só se for mexer no site
npm --prefix app install         # só se for mexer no app do cuidador
```

Para o desktop falar com a nuvem em desenvolvimento, copie
`frontend/.env.example` para `frontend/.env.local` e preencha a URL e a chave
*anon* do Supabase (valores públicos — ver [Conta IrisFlow e
nuvem](#conta-irisflow-e-nuvem)); sem esse arquivo o app roda em modo local,
com a licença simulada. O mesmo vale para `site/.env.example` → `site/.env`
e `app/.env.example` → `app/.env`. Nenhum desses arquivos vai para o
repositório.

O motor de voz é opcional para rodar o app; sem ele a tela de Voz explica o que
falta e o paciente fala com a voz do sistema. Para tê-lo em desenvolvimento
(Windows, PowerShell, dentro de `voice-engine/`):

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

O Electron acha o `.venv` sozinho (`voice-engine/.venv/Scripts/python.exe`); a
variável `IRISFLOW_PYTHON` aponta para outro interpretador se preciso. Use o
`.venv` mesmo: instalar no Python global mistura com pacotes de outros
projetos, e um `torchvision` de outra versão faz o modelo falhar ao carregar
("operator torchvision::nms does not exist"). Se isso acontecer no global,
`pip install --force-reinstall torchvision==0.21.0` resolve.

| comando | o que faz |
|---|---|
| `npm run dev` | interface em `http://localhost:5173` (desenvolvimento) |
| `npm run build` e `npm --prefix frontend run preview` | build de produção em `http://127.0.0.1:4173`; use este para medir |
| `npm run electron:dev` | app desktop em desenvolvimento |
| `npm run dev:limpo`, `npm run electron:dev:limpo` | o mesmo, começando com o armazenamento local zerado |
| `npm run electron:build` (`:win`, `:mac`, `:linux`) | instalador do sistema atual (ou do escolhido), na pasta temporária do sistema para escapar do OneDrive; inclui o motor de voz se `voice-engine\dist\irisflow-voz\` existir — ver [Instalador](#instalador-e-atualização-automática) |
| `npm run verificar` | tudo o que o CI confere: tipos, testes e builds do desktop, do site e do app ([Verificação](#verificação)) |
| `voice-engine\build-voice-engine.ps1` | gera o executável do motor de voz (PyInstaller, modo pasta) para entrar no instalador |

### Modelos

| modelo | arquivo | origem |
|---|---|---|
| L2CS-Net | `frontend/public/models/l2cs/l2cs_gaze360.onnx` (92 MB, não versionado) | treinado em Gaze360; 90 bins por eixo; entrada 224² ou 448² (padrão 448²). **Licença research-only: uso comercial proibido, inclusive de modelos treinados.** A decisão registrada em 15/09 era não distribuí-lo; o `release.yml` hoje o empacota em todo instalador — decisão jurídica pendente ([Pendências e riscos](#pendências-e-riscos), item 1) |
| EyeNet (V2, ramo ocular) | `frontend/public/models/eyenet/eyenet.onnx` (ainda não existe; só a meta de exemplo) | treinada no UnityEyes 2 (MIT) pelo projeto *Communicator V2*; entrada 3×64×96; liga com `?olho=onnx` |
| Face Landmarker | `frontend/public/mediapipe/models/face_landmarker.task` | MediaPipe Tasks Vision, 478 landmarks com íris |
| ONNX Runtime Web | `frontend/public/ort/` | binários WASM/WebGPU carregados pelo worker |

Sem o arquivo `.onnx` o app roda com as 4 features de íris (`?ep=off`).

Cada modelo tem uma **ficha de proveniência** no seu `*.meta.json` (bloco
`proveniencia`: bases de treino, licença, `usoComercial`, contrato) e um
`sha256` que o worker confere ao carregar. A ficha aparece em Configurações
("Modelo de olhar: …"), no item "L2CS · pesos" do preflight e em
`pipeline.runtime.modelo` de todo relatório de precisão. A meta também
declara a grade de bins (`outputBins`, `binWidth`, `binOffset`, `decoding`):
um modelo retreinado em ±45° usa decodificação `linear`, e o worker recusa uma
meta cuja grade não bate com o tensor que o modelo devolve.

O recorte facial e o recorte do olho são um **contrato com o treino**:
`fixtures/recorte-l2cs.json` e `fixtures/recorte-olho.json` são gerados pelo
TypeScript e lidos pelos testes do *Communicator V2* em Python — treinar com um
recorte e inferir com outro é o modo de falha silencioso de um retreino.

### Flags de experimento

Definidas em `src/config/experiment.ts` e lidas uma vez no boot, de três
fontes: `localStorage` (`irisflow.experiment`), parâmetros de URL e variáveis
de ambiente `IRISFLOW_EXP_<chave>` no Electron. Os parâmetros de URL são
`?ep=`, `?l2cs=`, `?filtro=`, `?diagonal=`, `?olho=`, `?expansao=`,
`?dimsIris=`, `?cursorNoTeste=`, `?compTranslacao=` e os booleanos (1/0)
`?rollCrop=`, `?estabilizar=`, `?dwellCorrige=`, `?refLenta=`, `?cantos=` e
`?calib=` — e eles **ficam gravados** no `localStorage`: a flag vale nas
aberturas seguintes até ser trocada ou zerada (`__irisflowExp.reset()`). Pelo
console: `__irisflowExp.set('chave', valor)` seguido de reload; só o que
difere do padrão é gravado, então mudar um padrão no código chega a quem
nunca mexeu naquela flag. A tela de Configurações do cuidador expõe as
principais e avisa quando falta recarregar.

| flag | padrão | opções |
|---|---|---|
| `l2cs` | `auto` | `auto` · `webgpu` · `wasm` · `off` |
| `l2csInputSize` | `448` | `224` · `448` |
| `l2csCadenceMs` | `100` | 33–2000 |
| `filterMode` | `oneEuro` | `oneEuro` · `kalman` · `kalmanEma` |
| `polynomialFeatures` | `true` | |
| `formaDaExpansao` | `parcial` | `parcial` · `completa` |
| `dimsDaIris` | `absolutas` | `absolutas` · `normalizadas` · `ambas` |
| `geometricPoseCompensation` | `true` | |
| `lateralTranslationCompensation` | `true` | |
| `referenciaLenta` | `false` | desde 23/09 — ver Pipeline e `docs/MEDICOES.md` §14.5 |
| `correcaoLocal` | `true` | correção local dos cantos (desde 23/09) |
| `suavizarL2csNaFixacao` | `true` | |
| `estabilizarFixacao` | `true` | |
| `correcaoPorDwell` | `true` | também é onde o reajuste de 2 s aplica o desvio do centro |
| `normalizarRollNoCrop` | `true` | desde 22/09 — ver abaixo |
| `blocoL2csCompleto` | `false` | ablação — ver abaixo |
| `persistirCalibracao` | `true` | `?calib=0` no desenvolvimento |
| `eyeNet` | `off` | `off` · `onnx` |
| `cursorSizePx` | `48` | 24–128 |
| `blinkClick`, `scanningMode`, `dwellRingOnCursor` | `false` | |
| `gazeLostFallback` | `true` | |
| `cursorNoTesteDePrecisao` | `false` | escotilha do operador — ver abaixo |

Três dessas flags **invalidam perfis salvos** quando mudam, por construção:
`dimsDaIris` e `blocoL2csCompleto` mudam o `FEATURE_VECTOR_ID`, e
`formaDaExpansao` muda o número e a ordem das colunas que o Ridge vê (os
coeficientes são posicionais). A invalidação é proteção, não obstáculo: sem
ela um perfil treinado num arranjo carregaria no outro sem erro nenhum e
preveria deslocado. Ao alternar para medir, conte uma recalibração por troca.

`cursorNoTesteDePrecisao` é escotilha de operador, não de paciente: revela o
cursor numa rodada de **medição** para conferir ao vivo se ele acompanha o
alvo — um erro de 3° e um mapeamento invertido produzem relatórios parecidos e
telas completamente diferentes, e só a tela distingue os dois. O preço é que
aquela rodada deixa de ser comparável, e por isso a flag entra no
`pipeline.experiment` do relatório. Para o uso normal existe a rodada de
*Verificação com cursor*, que já vem com as métricas certas e não suja a linha
de base.

`normalizarRollNoCrop` está ligada desde 22/09: o recorte do L2CS gira para
nivelar o rosto e a saída é contra-rotacionada no vetor 3D (`l2cs/roll.ts`).
A cautela que a mantinha desligada — "só ganha se for a mesma normalização do
treino" — não se sustenta para o checkpoint empacotado: o Gaze360 tem recortes
com toda inclinação natural, inclusive nivelada, então o rosto nivelado está
dentro da distribuição de treino. Falta a medição em vídeo real (cabeça
inclinada ~15°, com e sem). `blocoL2csCompleto` continua desligada de
propósito: leva as sete dimensões do bloco angular em vez de duas, e com treze
alvos ainda é território de decorar.

#### Arranjo do vetor: o que está medido e o que não está

`formaDaExpansao: 'parcial'` e `dimsDaIris: 'absolutas'` são os defaults desde
que o vetor foi reduzido de 27 para 7 colunas. **Eles foram adotados sem A/B na
pessoa** — a evidência até aqui é de simulação, e está registrada aqui para que
ninguém a confunda com medida de campo.

O que a simulação mostra (mundo sintético, 9 alvos, 15 amostras por alvo, erro
medido nos CANTOS, fora do fecho dos alvos, média de 16–24 execuções):

| arranjo | colunas | erro nominal | com ptose | 20 % mais perto |
|---|---|---|---|---|
| `ambas` + `completa` (histórico) | 27 | referência | **4× pior** | **2,2× pior** |
| `normalizadas` + `parcial` | 7 | −11 % | −45 % | plano |
| `absolutas` + `parcial` (atual) | 7 | −11 % | **−47 %** | quase plano |

As duas reduções são independentes e se somam: cortam eixos diferentes — a
colinearidade na entrada (`offsetX` e `relX` diferem por um divisor que varia
pouco: correlação ~0,9996) e os termos quadráticos que não pagam aluguel.

`absolutas` ganhou de `normalizadas` por um critério de pior caso, não de média.
As duas empatam no erro nominal e se separam nos dois modos de falha: a PTOSE
corrompe a altura do olho, que é o divisor de `relY`, e nada no pipeline
compensa isso; a DISTÂNCIA escala `offsetX`/`offsetY` e não escala `relX`/`relY`,
mas para distância já existe compensação dedicada a jusante.

**O que falta medir, e é o que decide:** o teste de precisão na pessoa, com a
câmera dela, comparando `?expansao=completa&dimsIris=ambas` contra o default.
A régua do projeto é ≥ 15 % de ganho nos cantos. Simulação não substitui isso —
ela fixa a propriedade estrutural (tirar colunas que só o jitter preenchia não
custa capacidade explicativa), não prevê o erro do produto. Se a medida na
pessoa não confirmar, o caminho de volta é uma flag.

---

## Fluxo de uso

1. **Login** (`/login`) e **boas-vindas** (`/`): com a nuvem configurada, o
   login é o e-mail e a senha da conta criada no site (ou a [conta de
   teste](#conta-de-teste)); sem ela, em desenvolvimento, as contas do serviço
   simulado. Depois, o paciente escolhe entre o tutorial e ir direto à
   calibração; o cuidador acessa sua área por um botão discreto.
2. **Tutorial** (`/tutorial`): dez passos, na ordem do aprendizado — o que é o
   dwell, prática com três alvos, ajuste do tempo à luz do que acabou de ser
   sentido, e então **o que se faz com isso**: falar uma frase pronta,
   **escrever uma frase própria**, responder na conversa, abrir um jogo, o
   resto do app no mapa mental, e a emergência por último (é dwell mais
   longo). A segunda metade acontece **nas telas de verdade**: o passo manda a
   pessoa ao teclado, a tela avisa quando ela escreveu, e o passo destrava.
   Desenhar miniaturas dentro do tutorial ensinaria uma interface que não
   existe. *Pular* está em todos os passos e a trilha navega livre; o único
   passo que espera é o de escrever a frase — é a única coisa do tutorial que
   ninguém aprende assistindo — e mesmo ele libera sozinho em 90 s, porque
   trava sem saída em app assistivo é armadilha. **Configurações fica de fora
   da jornada do paciente de propósito**: é lá que uma escolha errada quebra a
   calibração que ele acabou de fazer.
3. **Calibração** (`/calibration-check`): preparação com verificação de
   prontidão, coleta dos alvos, revisão (deriva de pose, alvos ignorados) e
   teste de precisão. O botão de emergência fica compacto e sai de cima dos
   alvos.
4. **Menu** (`/menu`) e telas do paciente: teclado, frases rápidas,
   pictogramas, jogos, câmera, galeria, descanso, emergência, **conversa**
   (`/conversation`) com o celular do cuidador e **Computador**
   (`/virtual-mouse`), que liga o Modo Computador. O botão de emergência é um
   alerta local (som e tela) e, com a conta ligada, também chega ao celular.
5. **Área do cuidador** (`/settings`, `/settings/voice`, `/caregiver`,
   `/caregiver/guide`): configurações por seção (rastreamento, tela,
   calibração, voz personalizada, sugestões de escrita, dados), painel com
   estado do rastreamento e alertas, guia de instalação e leitura do teste de
   precisão. É também de onde saem o **modo apresentação** e o **relatório de
   suporte**, descritos adiante.

Regras da interface do paciente: alvos de no mínimo 160×120 px, nada se move
sob o olhar (sem `transform` em hover), uma ação principal por tela, zona de
descanso sem alvos, textos curtos e sem jargão.

### Lazer e jogos

O cartão **Lazer** do menu reúne o que não é comunicação: **Estoura Bolhas**,
**Siga o Alvo**, **Jogo da Memória**, **Desenho**, **Notícias** e
**Meditação**. Os quatro primeiros foram reescritos para funcionar **por
fixação ocular** — antes eram esboços controlados por mouse, isto é,
inutilizáveis exatamente pela pessoa para quem o app existe. O Desenho pinta na
posição do olhar, assinando `useGaze().subscribe` diretamente em vez de esperar
por eventos de ponteiro. Notícias e Meditação já existiam como rotas, mas eram
órfãs: nenhum caminho da interface levava até elas, e agora estão no menu.

Um bug do **Siga o Alvo** merece registro porque falseava o único retorno que o
jogo dá: o placar subia sozinho, sem o paciente acertar nada. Corrigido — a
pontuação agora exige a fixação sobre o alvo.

---

## Modo Computador (o cursor do IrisFlow sobre o Windows)

Inspirado no Windows Control do Tobii Dynavox e no OptiKey: o cursor de olhar
do app sai da janela e passa a valer para o sistema inteiro, com a mesma
lógica de dwell. Cartão **Computador** no menu → botão **Ativar controle pelo
olhar**.

O que acontece ao ligar:

- a janela do app se **esconde** (a câmera e o motor continuam rodando nela —
  `backgroundThrottling: false` impede o Chromium de congelar o loop) e o dwell
  do app é **suspenso**, para a tela oculta não clicar em nada;
- uma janela de **sobreposição** transparente, sempre no topo e atravessável
  pelo mouse cobre o monitor: nela ficam o cursor (encolhido para ~60 % do
  tamanho do app, sem descer de 24 px), o anel de progresso, uma **barra
  lateral** de ações e, quando abertos, a lupa e o teclado;
- cada amostra de olhar vai da janela do app ao processo principal, que a
  converte para o monitor (px CSS da janela → DIP da tela → px físicos, com
  `screen.dipToScreenPoint` no Windows, para a escala de 125/150 % e
  monitores múltiplos não virarem desvio) e a entrega à sobreposição.

Como se usa (modelo "arma e olha", o mesmo do Tobii):

1. um dwell na barra **arma** uma ação: Clicar, Duplo, Direito, Arrastar,
   Rolar ou Teclado. Nada acontece na tela enquanto nenhuma ação está armada —
   ler um parágrafo não clica;
2. o paciente olha o alvo. Sobre a área, o dwell é uma **fixação** (o olhar
   tem de ficar a menos de 35 px do ponto), não "qualquer lugar por 1,5 s";
3. com a **Lupa** ligada (padrão), a região em volta é ampliada 2,5× num
   painel e o segundo dwell, dentro dele, é o que clica — é o que faz o botão
   de fechar do Chrome ser alcançável com ~1° de erro;
4. a ação **desarma** depois de executar, salvo com **Fixar** ligado.
   **Arrastar** usa dois pontos (pressiona, interpola o movimento, solta);
   **Rolar** fixa uma âncora e rola enquanto o olhar está acima ou abaixo
   dela; o **Teclado** digita em qualquer programa (Unicode via `SendInput`,
   com acentos e ç); **Pausar** congela a área sem sair do modo.

Como se sai: botão verde **IrisFlow** na barra; botão vermelho **Socorro**
(abre a tela de emergência do app); **3 minutos sem rosto** encerram sozinhos;
o cuidador pode clicar na barra com o **mouse físico** (ela deixa de ser
atravessável enquanto o mouse está sobre ela) ou usar o atalho
**Ctrl+Alt+Shift+Esc**. Um vigia no processo principal também encerra se o
olhar parar de chegar por 6 s ou vier sem calibração por 10 s, e se a
resolução, a escala ou o monitor mudarem (a calibração deixa de valer).

Sistema: **Windows** completo (user32 `SetCursorPos`/`SendInput` via `koffi`,
sem compilar nada; limitação conhecida: janelas elevadas pelo UAC ignoram a
entrada de um processo comum). **Linux X11** com `xdotool` (Wayland não
permite que um programa mova o cursor de outro). **macOS** ainda sem adaptador
(exige helper assinado com permissão de Acessibilidade). Segurança: o renderer
não move nem clica nada diretamente — só o processo principal, que valida a
forma e o remetente de cada mensagem e aceita uma lista fechada de teclas.

Arquivos: `src/computador/*` (puro, testado), `electron/computador/*`,
`electron/overlayPreload.ts`, `frontend/overlay.html` + `frontend/src/overlay/*`,
`frontend/src/computador/*`, `frontend/src/pages/VirtualMouseScreen.tsx`.

---

## Voz personalizada (clonagem local)

A voz do paciente, recriada a partir de uma gravação e usada em tudo que ele
diz pelo IrisFlow (teclado, frases, pictogramas, respostas ao cuidador).
Alarmes de emergência e as mensagens lidas do cuidador continuam na voz do
sistema, de propósito. Tela: **Configurações → Voz personalizada**
(`/settings/voice`).

> **Recurso experimental.** A tela de Voz e a seção correspondente em
> Configurações trazem um selo dizendo isso, e ele não é formalidade jurídica:
> a qualidade da voz depende da gravação de referência, a primeira frase de
> cada sessão é lenta em CPU e há computadores em que o recurso simplesmente
> não vale a pena. É melhor que a família saiba disso antes de baixar 1,5 GB de
> modelo do que descubra depois.

### Requisitos de hardware da voz

A tabela abaixo vive em `src/voz/requisitos.ts` (testada) e é mostrada na
própria tela de Voz, com a faixa do computador atual **destacada** — o cuidador
vê onde a máquina dele cai antes de decidir. Os números vêm da medição no
computador de referência e dos limites já codificados no motor, não de
estimativa de marketing.

| faixa | memória | núcleos | o que esperar |
|---|---|---|---|
| **Abaixo do mínimo** | menos de 8 GB | qualquer | a voz clonada não é recomendada; o paciente fala com a voz do sistema |
| **Mínimo** | 8 a 12 GB | 4 | funciona com os outros programas fechados; a primeira frase pode passar de um minuto e o computador fica lento enquanto o modelo carrega |
| **Recomendado** | 16 GB | 8 | primeira frase em cerca de meio minuto; as frases do dia a dia saem do cache, sem espera |
| **Folgado** | 32 GB ou mais | 12 ou mais | frases novas saem em poucos segundos mesmo fora do cache |

A memória **livre** decide o caso extremo: não adianta ter 32 GB instalados se
30 estão ocupados — o modelo não carrega. Fora isso vale a pior das duas
colunas.

- **Modelo**: [Chatterbox multilíngue](https://github.com/resemble-ai/chatterbox)
  (Resemble AI, licença MIT), clonagem zero-shot com português entre os 23
  idiomas. Roda num processo Python ao lado do Electron (`voice-engine/`),
  falando JSON por linha em stdin/stdout. Os pesos (~1,5 GB) são baixados do
  Hugging Face **uma vez**, pela tela de Voz, para a pasta de dados do app;
  depois disso o motor é posto em modo offline.
- **Importação**: o cuidador aceita o **termo de consentimento** (voz é dado
  biométrico — LGPD art. 5º, II e art. 11 — e a pessoa clonada muitas vezes
  já não pode consentir por si), escolhe um arquivo (nota de voz, vídeo,
  áudio antigo; WAV/MP3/OGG/OPUS/FLAC direto, formatos de vídeo só com
  `ffmpeg` no PATH) e o motor prepara a referência: passa-altas, medição de
  relação sinal/ruído por percentis, redução de ruído quando precisa, corte
  de silêncios e escolha dos melhores ~12 s (o modelo condiciona nos
  primeiros 10 s). O app mostra a **qualidade** (boa / aceitável / fraca) e
  os avisos. Só a referência preparada fica no computador; o arquivo original
  não é copiado. Testado com três gravações reais (limpa, nota de voz,
  ruidosa): 24 dB, 36 dB e 17 dB de SNR — a terceira passou pela redução de
  ruído e saiu como "aceitável".
- **Ao falar**: `services/voz/falar()` procura a frase no **cache** local
  (por voz + texto); se está lá, toca na hora. Se não, pede a geração com um
  prazo de **4 s**: dentro dele sai clonada; passado o prazo, o app fala com
  a voz do sistema e deixa a geração terminar para o cache — a frase sai
  clonada na próxima vez. Em CPU isso significa que **a primeira vez de cada
  frase nova costuma sair na voz do sistema** e a segunda na clonada; por
  isso, logo depois de importar a voz, o app pré-sintetiza em segundo plano
  os pictogramas, as frases rápidas **e as 30 frases mais usadas pelo próprio
  paciente** (botão **Preparar frases rápidas** refaz quando quiser). Uma fala
  nova cancela a anterior.

  As frases do paciente entraram nessa lista para resolver um sintoma
  concreto e confuso de diagnosticar: *"a voz clonada funcionou uma vez no
  teclado e não funcionou nos pictogramas"*. O cache era pré-aquecido só com os
  textos de fábrica, então a voz saía clonada nas frases que a equipe testava e
  falhava justamente nas que a pessoa usa o dia inteiro — que são as dela.
- **Custo**: em CPU comum, 3–8 s por frase nova (mais a carga do modelo na
  primeira frase da sessão); com GPU NVIDIA, abaixo de 1 s. O processo Python
  é encerrado depois de 15 min ocioso para devolver a memória. O motor só é
  iniciado quando há voz importada e ativa, ou quando a tela de Voz é aberta.
- **Plano**: o recurso é do plano **IrisFlow Voz** (`features.voz` da
  licença). Sem ele a tela explica e o paciente fala com a voz do sistema.
- **O que fica onde**: `%APPDATA%\IrisFlow\voz\` — `referencia.wav`,
  `referencia.json` (qualidade, avisos, consentimento aceito), `estado.json`,
  `cache\*.wav`, `modelos\` (HF_HOME). "Remover voz" apaga tudo menos os
  pesos do modelo.

- **Guarda de recursos**: o motor mede a memória antes de carregar e recusa
  com mensagem clara quando há menos de 4,5 GB livres (em vez de levar o
  computador para o swap); usa metade dos núcleos (1–4) e roda com prioridade
  abaixo do normal, para o rastreamento ocular não engasgar. A tela de Voz
  mostra a memória do computador e avisa quando ele está abaixo de 12 GB.
- **Testar o motor sozinho** (sem o Electron), dentro de `voice-engine\` com o
  `.venv` ativado:

  ```powershell
  python -m irisflow_voz --diagnostico                                  # versões, memória, modelo baixado
  python -m irisflow_voz --baixar                                       # pesos do modelo (~1,5 GB)
  python -m irisflow_voz --preparar "C:\caminho\voz.ogg" ref.wav         # preparo da referência
  python -m irisflow_voz --falar "Olá, esta é a minha voz." ref.wav fala.wav
  ```

  Sem argumentos o processo entra no modo protocolo (JSON por linha), que é
  como o Electron o usa. `HF_HOME` define onde os pesos ficam (o app usa
  `%APPDATA%\irisflow\voz\modelos`; no terminal, aponte para a mesma pasta
  para não baixar duas vezes).
- **Limpar tudo**: `voice-engine\limpar-voz.ps1` apaga voz importada, cache e
  pesos; com `-Ambiente` apaga também o `.venv` e o build.

Empacotar o motor para o instalador (Windows, uma vez por versão):

```powershell
cd voice-engine
.\build-voice-engine.ps1      # cria .venv, instala, roda PyInstaller → dist\irisflow-voz\
cd ..
npm run electron:build         # copia dist\irisflow-voz para resources\voice-engine
```

Testes do motor: `cd voice-engine; .\.venv\Scripts\python -m pytest -q tests`
(usa um dublê do modelo; `IRISFLOW_AUDIO_TESTE=<arquivo>` testa o preparo com
um áudio real).

---

## Assistente de escrita (o chatbot integrado, na versão local)

Este é o "chatbot integrado" que o roteiro de produto pede, implementado como
**sugestão que roda inteira no dispositivo**. A escolha é deliberada e tem três
razões que um serviço de nuvem não conseguiria pagar hoje: mandar conversa de
saúde para fora do computador, custo por usuário ativo, e dependência de
internet numa tela que precisa funcionar sempre — inclusive quando a operadora
cai e a pessoa precisa pedir ajuda.

O motor puro vive em `src/assistente/` e a persistência em
`frontend/src/services/assistente/`. Ele aprende quatro coisas com **este**
paciente, e nenhuma sai daqui:

- **palavras** — quantas vezes ele usou cada uma;
- **bigramas** — que palavra costuma vir depois de outra;
- **frases inteiras** — com frequência e recência, porque recência desempata;
- **respostas às perguntas do cuidador** — o que ele respondeu a cada pergunta.

A quarta é a que transforma predição de palavra em conversa. Quando o cuidador
pergunta "quer água?" pela décima vez, a resposta que o paciente deu nas nove
anteriores fica a uma fixação de distância.

Onde aparece: **sugestão de palavra no teclado**, **sugestão de frase inteira
no teclado** e **sugestão de frase inteira na tela de Conversa**. Em
Configurações há liga/desliga e um botão **apagar aprendizado** — o modelo é
JSON puro no `localStorage` justamente para que exportar, auditar e apagar seja
trivial.

`frontend/src/utils/wordPredictor.ts` continua existindo, mas virou
**adaptador** do motor novo: as telas e os testes que já importavam
`learnWord`, `learnBigram`, `learnSentence` e `getPredictions` seguem
funcionando, e o vocabulário antigo (`irisflow_user_words`,
`irisflow_user_bigrams`) é **migrado uma única vez** na primeira leitura —
ninguém perde o que já tinha ensinado ao app. Para código novo, use
`services/assistente` diretamente: é ele que sugere frases, onde está a
economia real de fixações.

**A porta para a nuvem fica aberta e explícita.** O tipo `ModoDoAssistente` já
prevê `'nuvem'` ao lado de `'local'`, para que as telas tratem o caso desde
agora e a troca futura não vire uma varredura pelo código inteiro. Só `'local'`
está implementado. Ligar o modo de nuvem exigirá **autorização expressa por
funcionalidade, revogável — o mesmo regime da clonagem de voz**, porque aí sim
a conversa do paciente passaria a sair do dispositivo.

---

## Modo apresentação e relatório de suporte

Duas ferramentas do cuidador que existem por motivos práticos, ambas em
Configurações.

**Modo apresentação** (`frontend/src/services/apresentacao.ts`). Numa
demonstração para clínica ou investidor, alguém vai olhar para o botão de
socorro — e, sem este modo, esse olhar dispara um pedido de emergência de
verdade: notificação no celular de um cuidador real, linha no histórico de
alertas, escalonamento se ninguém responder. Ligado, o modo **corta, no
barramento `cloud/eventos.ts`, tudo o que o paciente produz**: fala, pedido de
socorro, resultado de calibração e contadores de uso não saem do computador. O
que é estado do sistema continua (heartbeat, abertura e fim de sessão, rótulo
da voz em uso, relatório de suporte), e as mensagens do cuidador continuam
chegando e sendo faladas. Ele também troca o nome do paciente por
"Paciente demonstração" e mantém uma **faixa fixa na tela**, para que ninguém
na plateia confunda demonstração com uso real. O que ele **não** faz é simular
dados: as telas continuam mostrando o estado verdadeiro do rastreamento, da
calibração e da voz. Uma demonstração que inventa números não prova nada a quem
entende do assunto e mente para quem não entende.

**Relatório de suporte**
(`frontend/src/services/diagnostico/relatorioDeSuporte.ts`). Um botão que salva
um JSON para a família anexar quando algo dá errado, sem precisar saber abrir
console nenhum. Ele traz versão do app, plataforma, núcleos, memória, tela,
resumo das calibrações, contadores de uso, tamanho do modelo do assistente,
estado do motor de voz e os **últimos 40 erros e avisos** do console.

A regra que governa o conteúdo é dura e **tem teste que a segura**: nenhuma
frase escrita pelo paciente, nenhuma imagem e nenhum vetor de calibração entram
no arquivo. Um relatório de diagnóstico é exatamente onde uma promessa de
privacidade costuma ser quebrada em silêncio. Se alguém precisar do conteúdo
para depurar, a resposta certa é reproduzir o problema, não exportar a vida de
comunicação de uma pessoa por e-mail.

---

## Conta IrisFlow e nuvem

Os três clientes usam um só projeto Supabase, **IrisFlow Communicator** (ref
`xouznaqxhqzjdgeshlmh`, São Paulo `sa-east-1`,
`https://xouznaqxhqzjdgeshlmh.supabase.co`). A conta nasce no site (`/beta`) e o
mesmo e-mail e senha abrem o desktop e o app do cuidador; o paciente é o
`beneficiary` da conta, e o computador, um `device`. Como o mesmo login é o
cuidador no celular e o paciente no computador, o banco não os distingue pela
sessão: o desktop **escreve só pela Edge Function `desktop-sync`**, com a chave
do computador, e é ela que força `sender = 'paciente'`.

**O que sai**, só com a nuvem configurada e o computador vinculado:

| o quê | quando | ação |
|---|---|---|
| e-mail e senha | login | Supabase Auth → `desktop_license()` → `pair_device()` |
| câmera ok, rastreador ok, calibrado, versão | a cada 30 s | `heartbeat` |
| sessão: fixação e suavização em uso, frases e caracteres | ao abrir / ao fechar ou sair | `session.upsert`, `session.end` |
| resumo do teste de precisão (erro, precisão, acerto em 100/150 px, menor alvo, distância, condições) | ao concluir o teste | `calibration.result` |
| o texto que o paciente falou (teclado, frase, pictograma, sim/não, "Estou bem") | a cada fala | `message.send` |
| pedido de socorro | botão de emergência | `help.create` (+ push) |
| confirmação de que a mensagem do cuidador foi falada | depois de vocalizar | `message.spoken` |
| rótulo da voz em uso (`Voz clonada (local)` / `pt-BR padrão`) | ao ligar e quando muda | `voice.status` |
| relatório de suporte (números e erros, nunca frases) | botão em Ajustes, ou envio automático se ligado | `report.send` |

**O que nunca sai:** imagem da câmera, marcos faciais, vetores, perfil de
calibração, amostras do teste, áudio e modelo da voz, modelo do assistente de
escrita. Três camadas garantem isso: só
[`cloud/sessao.ts`](frontend/src/cloud/sessao.ts) decide o que do relatório de
precisão sai; a única origem externa na `connect-src` da CSP do Electron é a do
Supabase, em `https` e `wss`
([`src/electronSecurity.ts`](src/electronSecurity.ts)); e a Edge Function só
grava em `sessions` as colunas de `SESSION_FIELDS`. Fora do renderer, e da CSP,
saem ainda o verificador de atualizações, o download único dos pesos da voz e,
só em instalador compilado com `IRISFLOW_CRASH_URL`, minidumps (que podem conter
quadros da câmera).

**Login, licença e vínculo.** Com a nuvem configurada, o
[`LicenseContext`](frontend/src/context/LicenseContext.tsx) usa o
`supabaseLicenseService`: login → `desktop_license()` → `pair_device()`, que
devolve a chave do computador em claro uma vez e guarda só o sha256. O `token`
da licença é essa chave, enviada em `x-device-key`. No Essencial, parear revoga
os outros computadores (o desktop oferece a transferência antes); Completo, Voz
e Beta não têm limite. A cada abertura, `device.info` confirma vínculo e
licença: `403 device_revoked` leva ao login, licença negada bloqueia, e rede,
5xx ou 401 do gateway dão **7 dias** de carência (`VITE_LICENSE_OFFLINE_DAYS`) — perder a comunicação porque o
Wi-Fi caiu é pior que uma semana sem verificar. A regra mora no banco; o desktop
só decide a carência. "Sair desta máquina" fecha a sessão, revoga o computador e
faz `signOut`. A chave do computador (o token da licença), o vínculo, a
sessão e a fila ficam no cofre
([`cloud/armazenamento.ts`](frontend/src/cloud/armazenamento.ts)), que o
Electron cifra com o `safeStorage` do sistema; quando o sistema não oferece
cifra, Configurações diz **"SEM cifra"** em vez de fingir. No `localStorage`
ficam só a conta e o plano.

**Tempo real e fila.** O [`CloudProvider`](frontend/src/cloud/CloudContext.tsx)
assina, filtrado pelo paciente: mensagens do cuidador (cartão por 15 s, faladas
com a voz **do sistema** — a clonada é a do paciente e não deve dizer o que
outra pessoa escreveu), `patient_settings` (fixação, suavização e prazo de
emergência, quando preenchidos), `quick_phrases` (respostas rápidas da Conversa)
e a confirmação do socorro ("Seu cuidador viu o pedido às HH:MM"). Sem realtime,
consulta a cada 20 s. Sem rede, os envios esperam na fila `irisflow.fila` (até
200; socorro e mensagem nunca são descartados), cada um com o instante em que
aconteceu (`occurred_at`) e, a cada tentativa, o relógio do computador
(`sent_at`): a `desktop-sync` grava a hora do servidor menos esse atraso, o
que cancela um relógio de PC errado, e um socorro que esperou na fila aparece
no celular com a hora real ("pedido às HH:MM, chegou com atraso"). Sem nuvem
configurada ou sem computador vinculado **nada é enfileirado** — mensagem
para ninguém não fica no disco esperando quem vincular depois —, itens de
outro vínculo são descartados antes do envio e uma chave recusada esvazia a
fila. As telas só emitem no barramento
[`cloud/eventos.ts`](frontend/src/cloud/eventos.ts), e é nele que o [modo
apresentação](#modo-apresentação-e-relatório-de-suporte) corta fala, socorro,
calibração e contadores; heartbeat, sessão, `voice.status` e relatório de
suporte continuam, e as mensagens do cuidador seguem sendo faladas.

**Variáveis** ([`frontend/.env.example`](frontend/.env.example) →
`frontend/.env.local`), embutidas no build, nunca segredo:

| variável | para quê | sem ela |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | ligam a nuvem; a origem entra na CSP | modo local (abaixo) |
| `VITE_DESKTOP_SYNC_URL` | Edge Function hospedada fora (também entra na CSP) | `<URL>/functions/v1/desktop-sync` |
| `VITE_SITE_URL` | links do login ("esqueci a senha", "criar conta", `/conta`) | `https://irisflow.pages.dev` |
| `VITE_LICENSE_OFFLINE_DAYS` | dias de carência offline de uma licença já verificada | 7 |

**Sem as variáveis**, nada sai e a licença vem do serviço simulado
([`mockLicenseService.ts`](frontend/src/services/license/mockLicenseService.ts)),
com as contas `admin@irisflow.com` / `irisflow2026` (Completo, sem vencimento
nem limite de máquina) e, para cada recusa, `ativa@`, `semplano@`, `outropc@` e
`vencida@teste.com` com `teste123`. A sessão simulada fica só na memória: cada
reabertura pede login. O **Modo Desenvolvedor**, só em build de desenvolvimento,
pula licença, termo, perfil e calibração.

---

## Supabase (supabase/)

```
supabase/
├── migrations/    o esquema inteiro, em ordem: 20260923022346_schema_base.sql
│                  (planos, perfis, pacientes, assinaturas, pagamentos, RLS) e as
│                  migrações seguintes; o nome começa pela versão do histórico
├── functions/     desktop-sync (publicada), payment-webhook (esqueleto)
├── seed.sql       conta de teste da beta
└── config.toml    project_id do CLI; verify_jwt = false na desktop-sync
```

**Quem pode o quê.** RLS em todas as tabelas: a chave anon é pública e quem
separa as contas são as políticas. "Dono" é `auth.uid() = profiles.id` (nas
tabelas do paciente, `is_my_beneficiary()`); a `service_role` só existe nas Edge
Functions e no pg_cron. Assinatura e pagamento são só leitura, senão qualquer um
com a chave anon marcaria a própria assinatura como paga.

| tabelas | cliente lê | cliente escreve | servidor escreve |
|---|---|---|---|
| `plans`, `beta_program`, `app_releases` | qualquer um | — | SQL / painel |
| `contact_messages` | ninguém | qualquer um insere | — |
| `profiles`, `beneficiaries` | o dono | o dono edita (perfil nasce do gatilho `handle_new_user`) | RPCs de cadastro |
| `subscriptions`, `payment_methods`, `charges`, `beta_registrations` | o dono | nada (só apagar `payment_methods`) | RPCs, `register_charge()` |
| `devices`, `sessions`, `support_reports` | o dono | nada | `desktop-sync`, `pair_device()`, pg_cron |
| `messages` | o dono | insere só como `cuidador`; marca lida | `desktop-sync` (`paciente`), escalonamento |
| `help_requests` | o dono | confirma e resolve | `desktop-sync` |
| `quick_phrases`, `patient_settings`, `push_tokens` | o dono | o dono | `desktop-sync` (`voice.status`) |
| `gateway_events` | ninguém | nada | `payment-webhook` |

**Funções** (`security definer`, `search_path` fixo; o de `pair_device` inclui
`extensions`, onde o Supabase põe o pgcrypto). `desktop_license()` →
`license_for_profile()` é a regra única de "pode usar o app?", lida pelo desktop
e pela `/conta`: `beta` libera até o fim do programa, com tudo; `avaliacao`, até
3 dias depois do fim do teste; `ativa`, sempre; `inadimplente`, até 7 dias
depois da cobrança; `cancelada`, até a cobrança. Mudou a regra? Mude o SQL. As
RPCs de cadastro estão na tabela do site; só a `service_role` roda
`license_for_profile()` e `register_charge()`.

**pg_cron**, a cada minuto: `escalar-pedidos-de-ajuda` marca `escalated_at` no
socorro sem confirmação após `emergency_timeout_s` (padrão 45 s), grava uma
mensagem de sistema e reenvia push a todos os celulares — não telefona para
ninguém; `encerrar-sessoes-orfas` fecha sessões sem heartbeat há mais de 5 min.
Com a migração `20260923150000_help_requests_received_at` (no repositório,
**ainda não aplicada em produção** — ver abaixo), o prazo passa a contar da
chegada ao servidor (`received_at`), não de quando o pedido aconteceu no
computador, e a mensagem só diz que reenviou quando havia celular
cadastrado.

**Edge Functions.** `desktop-sync` está publicada (v1), com `verify_jwt = false`: as
ações de [Conta IrisFlow e nuvem](#conta-irisflow-e-nuvem) mais
`messages.pending`, `settings.get` e `device.info`, escopadas ao paciente da
chave; push Expo só para `emergencia` e `ajuda` (`EXPO_ACCESS_TOKEN` opcional).
Pelo painel, "Verify JWT" tem de ficar desligado, senão o desktop recebe 401 do
gateway, trata como falta de rede e só enfileira. A versão do repositório (com
o horário real dos eventos, `horario.ts`, testado com `deno test
supabase/functions/desktop-sync/`) ainda não foi publicada e **depende da
migração 20260923150000**: publicada antes dela, um socorro que chegasse
atrasado seria escalado no minuto seguinte. `payment-webhook` é
**esqueleto, não publicado**: HMAC de Stripe, Mercado Pago ou Pagar.me
(`PAYMENT_GATEWAY`, `PAYMENT_WEBHOOK_SECRET`; sem segredo recusa tudo) →
`gateway_events` → `register_charge()`. Na beta não há gateway: todo plano tem
`purchasable = false`.

**Estado em produção (23/09/2026).** Aplicadas as migrações até
`20260923120907_pair_device_pgcrypto`, com as versões exatamente iguais às do
nome dos arquivos. **Faltam três**, que a checagem de permissões desta sessão
não deixou aplicar e ficam para a equipe, nesta ordem:
`20260923150000_help_requests_received_at` (prazo de escalonamento contado da
chegada), `20260923150100_pair_device_mesmo_computador` (novo login no mesmo
PC substitui o vínculo dele em vez de acumular chaves válidas) e
`20260923150200_conta_de_teste_protegida` (ninguém troca a senha nem o e-mail
da [conta de teste](#conta-de-teste)). Depois delas, publique a
`desktop-sync` do repositório.

**Aplicar** (do zero ou só o que falta) com o CLI, que compara as versões com
o histórico e aplica só as ausentes:

```bash
supabase link --project-ref xouznaqxhqzjdgeshlmh
supabase db push                                   # migrações em ordem; não roda o seed
supabase functions deploy desktop-sync --no-verify-jwt
```

Sem o CLI: cole cada arquivo de `supabase/migrations/`, na ordem do nome, no
SQL Editor (todos são idempotentes; os que já estão aplicados não mudam nada)
e publique a função pelo painel (*Edge Functions → desktop-sync*, com os dois
arquivos `index.ts` e `horario.ts`, "Verify JWT" desligado). O `seed.sql`
roda à parte, no SQL Editor. No Auth do painel: Site URL = a origem do site
(`https://irisflow.pages.dev`) e Redirect URLs `<site>/entrar` e
`<site>/nova-senha` — o "Esqueci a senha" do site e o do app mandam
`redirectTo` para `/nova-senha`, e o site leva o evento de recuperação para lá
de qualquer página. A proteção contra senha vazada só existe no plano Pro.

**Teste local.** [`scripts/db-local-test.sh`](scripts/db-local-test.sh) cria o
banco `irisflow_beta_test` num PostgreSQL limpo com um *shim* do Supabase
(`auth.users`/`identities`, `auth.uid()`, papéis, realtime, pgcrypto em
`extensions`, `cron` e `net.http_post` falsos), aplica **todas** as migrações
em ordem, aplica tudo de novo (idempotência), roda
[`scripts/db-local-test.sql`](scripts/db-local-test.sql) e o `seed.sql` duas
vezes. Precisa de `psql` e superusuário:

```bash
docker run --rm -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust --name pg postgres:16
PGURL='postgresql://postgres@localhost:5432/postgres' scripts/db-local-test.sh
```

O cenário para no primeiro erro e cobre fluxo pago recusado, inscrição beta sem
CPF, `desktop_license()` (`beta`, `beta_encerrada`), dois computadores e novo
login no mesmo computador, inscrições fechadas, RLS de `beta_registrations` e
`support_reports`, sessões órfãs, `patient_settings` sem padrões de
rastreamento, telefone opcional, o escalonamento (prazo contado da chegada,
push só com celular cadastrado) e, depois do seed, a conta de teste e a
proteção dela. Passou em 23/09/2026 (PostgreSQL 16) com as 16 migrações. Fora
dele: as Edge Functions (o horário dos eventos tem teste Deno próprio).

---

## Site (site/)

Vite + React 18; cria a conta, o paciente e a assinatura. Com
`BETA.ativo = true` ([`content.ts`](site/src/data/content.ts)) a compra fica
fechada: os planos aparecem como indisponíveis e o fluxo pago leva a `/beta`.

| rota | o que faz | banco |
|---|---|---|
| `/`, `/solucao`, `/como-funciona`, `/acessibilidade`, `/planos`, `/sobre` | institucional; preço de `plans`, com reserva em `content.ts` | `plans` |
| `/beta` | inscrição em 3 etapas; logado, instaladores, app do cuidador e verificação de compatibilidade | `complete_beta_registration()`, `beta_program`, `mark_beta_download()` |
| `/entrar`, `/recuperar-senha`, `/nova-senha` | login e nova senha | Auth |
| `/conta` | "Programa beta · acesso até…" e *Aplicativo e computadores*: a licença do desktop, computadores (online = visto há < 90 s), desvincular | `my_account`, `desktop_license()`, `devices`, `revoke_device()` |
| `/contato` | formulário | `contact_messages` |
| `/cadastro`, `/pagamento`, `/sucesso` | fluxo pago, fechado (vão para `/beta`); sem gateway, `/pagamento` só grava titular, bandeira e 4 dígitos | `complete_registration()`, `attach_payment_method()` |

**Inscrição na beta.** O `signUp` leva só nome e newsletter (vão para o JWT);
CPF, condição e telefone entram pela RPC. **Telefone e CPF são opcionais**:
`validar.telefoneOpcional` ([`validation.ts`](site/src/utils/validation.ts))
aceita vazio e, preenchido, exige DDD + número; vazio vira `null` e a RPC mantém
o número já gravado. Com "Confirm email" ligado, o link volta a `/entrar` e a
inscrição termina em `/beta`.

**Instaladores** ([`releases.ts`](site/src/lib/releases.ts),
[`latestRelease.ts`](site/src/lib/latestRelease.ts),
[`useDownloads.ts`](site/src/hooks/useDownloads.ts)): o navegador consulta sem
token o último release de `VITE_RELEASES_REPO` na API do GitHub (60 pedidos/h
por IP, cache de 10 min) e separa os arquivos pela extensão; sistema sem arquivo
aparece "em preparação". Um sistema só ganha botão se tiver arquivo no
release **e** estiver em `VITE_RELEASES_AVAILABLE` (padrão `windows`): assim o
site nunca oferece um instalador de macOS ou Linux ainda não testado, e a
frase da página bate com os botões. Os releases precisam ser públicos;
`app_releases` não é mais lida.

**Variáveis** ([`site/.env.example`](site/.env.example) → `.env.local`; todas
públicas):

| variável | uso | sem ela |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | contas, planos, beta | site abre; ação de conta diz "serviço indisponível" |
| `VITE_SITE_URL` | canonical, og:*, sitemap, destino dos e-mails | `https://irisflow.pages.dev` |
| `VITE_RELEASES_REPO` / `VITE_RELEASES_AVAILABLE` | de onde vêm os instaladores / quais sistemas o site oferece | `ZambePy/Blinkv1` / `windows` |
| `VITE_APP_CUIDADOR_URL` | link do app em `/beta` | "o link chega por e-mail" |
| `VITE_CF_ANALYTICS_TOKEN` | Cloudflare Web Analytics | nenhuma estatística |
| `VITE_PAYMENT_PUBLIC_KEY`, `VITE_API_URL` | reservadas (gateway, API própria) | sem uso hoje |

**Comandos:** `npm --prefix site install`, `run dev` (`localhost:5173`),
`run build` (`site/dist`), `run preview`, `run typecheck`, `test` (Vitest, sem
rede) e `run check` (sonda só de leitura do projeto real: planos, RLS, Auth,
RPCs).

**SEO e cookies.** [`src/seo/pages.ts`](site/src/seo/pages.ts) dá título,
canonical e og:* a cada rota e o `vite.config.ts` gera `sitemap.xml` e
`robots.txt` no build; rota nova exige uma linha lá e em `src/routes.ts`
(`seo.test.ts` confere). O site não grava cookie; o Cloudflare Web Analytics
(sem cookie) carrega a menos que o visitante recuse no aviso.

**Hero.** Um pictograma branco de cadeirante (SVG em
[`GazeStory.tsx`](site/src/components/sections/GazeStory.tsx)) olha para um
monitor com a **captura real** da Home do desktop (`public/produto/`); o feixe
leva o cursor aos botões de verdade (`BOTOES`) e o anel de fixação enche. Quando
o menu mudar, sirva uma cópia do app sem `.env` em `vite preview --port 4190`,
grave um vídeo de rosto `.y4m` para a câmera falsa do Chromium (passos no
cabeçalho de
[`capturar-tela-do-app.mjs`](site/scripts/capturar-tela-do-app.mjs)) e rode, em
`site/`, com Playwright:

```bash
ROSTO_Y4M=/tmp/irisflow-snap/rosto.y4m PLAYWRIGHT_MODULE="$(npm root -g)/playwright" \
  node scripts/capturar-tela-do-app.mjs
```

Ele entra com a conta local, abre o menu (daí o selo "Sem calibração"), grava as
duas WebP e imprime o `BOTOES` novo.

---

## App do cuidador (app/)

Expo SDK 57 + expo-router, sempre no Supabase real: não há modo demonstração, e
um build sem `EXPO_PUBLIC_SUPABASE_*` mostra "Não conseguimos conectar agora".
Não há cadastro no app; em `__DEV__` o login já vem com a conta de teste
(`CONTA_DE_TESTE`, [`config.ts`](app/src/lib/config.ts)).

| tela | o que faz |
|---|---|
| Início | sessão ao vivo (computador visto há < 90 s), última mensagem, alertas, câmera e calibração |
| Conversa | chat em tempo real; o que o cuidador envia é falado na tela do paciente e marcado "falado na tela" |
| Alertas | alerta em tela cheia: "Estou indo!" (o desktop avisa o paciente), "Resolvido", ligar para os contatos, horário do escalonamento |
| Relatórios | 7 dias de uso e o Teste de precisão de cada sessão (planos Completo, Voz e Beta) |
| Ajustes | fixação, suavização (nulo = não definido), prazo de emergência e contatos, voz em uso, exclusão da conta; teclado e sensibilidade aparecem desativados, com "Em breve" |
| Frases, Paciente, Assinatura | respostas rápidas da Conversa do desktop; computadores vinculados (tocar desvincula); "Programa beta", sem compra |

O desktop aplica hoje só fixação, suavização e prazo de emergência — por isso
teclado e sensibilidade aparecem desativados no app, com "O computador ainda
não aplica este ajuste", em vez de gravar um valor que não faz nada. O tipo
`help_kind_t` do banco prevê avisos de postura, fadiga e recalibração, mas o
desktop só envia pedidos de socorro (`emergencia`). O "Esqueci a senha" do app
manda o cuidador para `<site>/nova-senha` (`EXPO_PUBLIC_SITE_URL`).

**Push.** O token Expo vai para `push_tokens` e recebe o socorro e o
escalonamento. **Não funciona no Expo Go** nem em emulador, e em build exige
`extra.eas.projectId` no `app.json`, hoje vazio: até lá o alerta só chega com o
app aberto, pelo realtime. No Android, o FCM pede o `google-services.json`
(`app.config.js`).

**Variáveis** ([`app/.env.example`](app/.env.example) → `app/.env`, públicas):
`EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` (obrigatórias),
`EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_SENTRY_DSN` e `EXPO_PUBLIC_APP_ENV`. Nos
builds do EAS vêm do `env` de cada perfil do [`eas.json`](app/eas.json).

**Comandos:** `npm --prefix app install`, `start` (Expo Go),
`run android|ios|web`, `run typecheck` e `test` (Jest). Build e lojas:
[Hospedagem e publicação](#hospedagem-e-publicação).

**Sessão e falhas.** A sessão fica no Keychain/Keystore (`expo-secure-store`, em
pedaços de menos de 2 KB), nunca no AsyncStorage. O Sentry só liga com
`EXPO_PUBLIC_SENTRY_DSN`, em build de release, sem IP, captura de tela nem texto
de mensagens.

---

## Conta de teste

`admin@irisflow.com` / `irisflow2026` — conta real, criada por
[`supabase/seed.sql`](supabase/seed.sql), válida no site, no desktop e no app (e
também a do serviço local do desktop, `LOGIN_PADRAO`). Tem paciente "Paciente
IrisFlow", assinatura `beta` sem cobrança até o fim do programa (padrão:
31/03/2027) e ajustes padrão; o seed **não cria dado de exemplo** (sessões,
conversas, alertas ou computadores) — o que aparecer nela veio de alguém que
testou.

O repositório é público: **qualquer pessoa pode entrar com ela** e ler e
escrever o que houver lá. A migração `20260923150200_conta_de_teste_protegida`
recusa, só para esta conta, trocar a senha ou o e-mail (a troca deliberada
pela equipe está no cabeçalho dela) — **enquanto ela não for aplicada em
produção, qualquer um pode trocar a senha em `/nova-senha`** e trancar os
outros. Nunca guarde dado real nela nem vincule a ela o computador de um
paciente — quem entrasse leria o que ele fala, mandaria mensagens faladas na
tela dele e receberia os alertas. Antes do lançamento comercial, apague a
conta (e o gatilho) e tire `LOGIN_PADRAO` e `CONTA_DE_TESTE` do código.

---

## Instalador e atualização automática

O empacotamento usa o **electron-builder** pela API programática
(`electron/package-app.mjs`); o que é fixo está em `package.json` → `build`. No Windows,
NSIS com escolha de pasta (`oneClick: false`, por usuário, atalho **IrisFlow
Communicator**); ícones em `build/icon.ico` e `build/icon.png`.

### Gerar os instaladores

| comando | gera | saída |
|---|---|---|
| `npm run electron:build` | só o sistema do computador atual | `<tmp>/irisflow-release/<win32\|darwin\|linux>` |
| `npm run electron:build:win` | `IrisFlow-Setup.exe` (+ `.blockmap`, `latest.yml`) | `<tmp>/irisflow-release/windows` |
| `npm run electron:build:mac` | `IrisFlow-mac-{arm64,x64}.dmg` e `.zip` (+ `latest-mac.yml`) | `<tmp>/irisflow-release/mac` |
| `npm run electron:build:linux` | `IrisFlow-linux-x86_64.AppImage`, `IrisFlow-linux-amd64.deb`, `IrisFlow-linux-x86_64.rpm` (+ `latest-linux.yml`) | `<tmp>/irisflow-release/linux` |

`<tmp>` é a pasta temporária do sistema, fora do OneDrive (que bloqueia o rename do
electron-builder); `IRISFLOW_RELEASE_DIR` troca a pasta e `--dir` gera só a pasta
desempacotada. Os nomes são **fixos, sem versão**, iguais no local e no release: o site
linka `…/releases/latest/download/<nome>` e o `latest*.yml` aponta para o arquivo dentro
da tag. O `.zip` do Mac não é redundante: o electron-updater só atualiza macOS por ele.
O build local embute os `VITE_*` de `frontend/.env.local` e só leva o modelo L2CS e o
motor de voz se existirem na máquina (sem o modelo, avisa e sai com rastreamento
degradado). Onde cada um sai: Windows gera só Windows (Linux com Docker/WSL); **só o
macOS gera `.dmg`** e assina/notariza (o script recusa `--mac` fora dele); Linux gera
Linux (o `rpm` exige `rpmbuild`) e Windows via Wine. No `release.yml` cada sistema
empacota no seu runner, e o motor de voz (PyInstaller) só entra no de Windows.

### Assinatura de código

Sem certificado cadastrado — a situação até aqui, porque nenhum foi comprado — os
instaladores saem **sem assinatura**, e o build não falha por isso.

- **Windows**: SmartScreen "O Windows protegeu o computador" → *Mais informações →
  Executar assim mesmo* (sem o botão: Propriedades → *Desbloquear*). Com o Smart App
  Control do Windows 11 ligado, o bloqueio não tem exceção por app. A atualização
  automática funciona sem assinatura; depois de uma versão assinada, voltar a publicar sem
  assinatura quebra a atualização.
- **macOS**: sem Developer ID, assinatura *ad-hoc* (`identity: "-"`) e Hardened Runtime
  desligado (ligado sem certificado, o Gatekeeper recusa em vez de avisar). Primeira
  abertura: *Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim*; desde o
  macOS 15, clique-direito → Abrir não contorna mais. Sem Developer ID a atualização baixa e
  não instala: quem usa Mac baixa o `.dmg` novo pelo site.
- **Linux**: AppImage com `chmod +x` e FUSE 2 (`libfuse2t64` no Ubuntu 24.04; no 23.10+
  o AppArmor pode barrar o AppImage, não o `.deb`). Modo Computador: `xdotool` e X11.

| saída | custo (23/09/2026) | efeito |
|---|---|---|
| sem assinatura (hoje) | R$ 0 | os avisos acima; aceitável numa beta acompanhada |
| certificado OV em nuvem (Windows) | ~US$ 129–139/ano + serviço de assinatura, se cobrado | aviso cai com a reputação; EV não pula mais o SmartScreen (2024) |
| Azure Artifact Signing | US$ 9,99/mês | indisponível para pessoa física e empresa do Brasil |
| Microsoft Store (MSIX) | cadastro grátis | a loja assina e atualiza; o build não gera MSIX |
| Apple Developer Program | US$ 99/ano | Developer ID, notarização e atualização no Mac; app do cuidador no iPhone |

Com certificado o fluxo não muda: cadastre os segredos em base64 (`base64 -w0 cert.pfx`;
[tabela](#segredos-e-variáveis-do-github-actions)) e a próxima tag sai assinada. Cada
sistema tem o seu par: **Windows só com `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`** (ou os
`AZURE_*`); **macOS com `CSC_LINK` + `CSC_KEY_PASSWORD`**, e aí Hardened Runtime,
`build/entitlements.mac.plist` e notarização se houver `APPLE_*`. O `CSC_*` nunca chega
ao build de Windows (o `ci-segredos-opcionais.mjs` não o repassa e o `package-app.mjs` o
retira do ambiente): o electron-builder recorreria a ele e assinaria o `.exe` com o
certificado da Apple.

### Atualização automática

`electron/atualizacao.ts` (electron-updater, provedor GitHub): **baixa sozinho, nunca
reinicia sozinho** — reiniciar no meio de uma frase de quem se comunica por fixação é
perder a frase. Verifica **45 s** após abrir e **a cada 4 h**. Pronta a versão, a faixa
"Atualização pronta" (canto inferior esquerdo, longe da Emergência; ausente no teclado,
na verificação de calibração, na emergência e no descanso) oferece *Reiniciar agora*
(fixação de **2,5 s**) ou *Depois*, que instala quando o app fechar; Configurações →
Sobre o IrisFlow mostra o estado. Nunca faz downgrade e fica desligada em desenvolvimento,
em build sem `app-update.yml` e em Linux fora de AppImage/deb/rpm. Para testar sem
publicar: `IRISFLOW_UPDATE_URL=http://<servidor>/<pasta>` com `latest.yml` e o instalador.

Como o app escolhe a versão (electron-updater 6.8.9, `allowPrerelease` no padrão): uma
instalação **beta** (`X.Y.Z-beta.N`) lê o feed `releases.atom` e pega a entrada semver
mais nova que não seja de outro canal — o release de pesos `0.0.0-modelos` é sempre
pulado; uma instalação **estável** consulta `/releases/latest`, que ignora
pré-lançamentos. Forçar `allowPrerelease` numa estável a faria pegar a primeira entrada do
feed, qualquer que fosse; por isso ele não é forçado.

**De onde vem a versão nova.** O repositório vai para `resources/app-update.yml` no
empacotamento, nesta ordem: `IRISFLOW_RELEASES_REPO` → `GITHUB_REPOSITORY` →
`build.publish` do `package.json` (`ZambePy/Blinkv1`). O `release.yml` publica no mesmo
repositório que grava (`vars.IRISFLOW_RELEASES_REPO || github.repository`) e o site lê
`VITE_RELEASES_REPO`. Os três apontam para o mesmo repositório, que precisa ser
**público**: o app baixa sem token e o site consulta a API sem login; releases privados
exigiriam token dentro do instalador. Código privado: item 9 de
[Pendências e riscos](#pendências-e-riscos).

### O que o instalador entrega: o app, não o código

| camada | ligado | onde |
|---|---|---|
| bundles | minificados, sem source map; main/preloads sem comentários | `frontend/vite.config.ts` (map só com `IRISFLOW_SOURCEMAP=1`), `electron/build.mjs` |
| pacote | `asar`; só `frontend/dist`, `dist-electron` e dependências de runtime; `**/*.map`, `.ts`, `.md` fora | `package.json` → `build.files` |
| fuses | `runAsNode`, `enableNodeOptionsEnvironmentVariable`, `enableNodeCliInspectArguments` desligados; `onlyLoadAppFromAsar` ligado | `build.electronFuses` |
| depuração | `devTools: false`; F12, Ctrl/Cmd+Shift+I/J/C, F5 e Ctrl/Cmd+R bloqueados; sem menu (Mac: só app/editar/janela); o app **encerra** se aberto com `--inspect*` ou `--remote-debugging-*` | `src/electronSecurity.ts`, `electron/main.ts` |
| janelas | `contextIsolation`, `sandbox`, sem Node e sem `<webview>`, navegação só interna, permissões só câmera/microfone/tela cheia, CSP | idem |

`scripts/conferir-pacote.mjs` confere tudo isso no app já empacotado — no CI a cada push
na `main` e em PR (Linux, `--dir`) e nos três sistemas em cada release. **Limite:** quem
quiser extrai o `app.asar` e lê o JavaScript minificado (e o `.onnx`, que vai dentro); o
que se garante é não haver fonte legível, source map nem depurador a um clique. Enquanto o
repositório for público, o código está no próprio GitHub.

**Falhas.** Log em `%APPDATA%\irisflow\logs\` (`~/Library/Logs/irisflow/`,
`~/.config/irisflow/logs/`) e minidumps, só locais. Envio só com `IRISFLOW_CRASH_URL` no
build — o minidump carrega memória com quadros da câmera: só com consentimento no termo.

### Publicar uma versão

```bash
git tag v1.0.0-beta.2 && git push origin v1.0.0-beta.2
```

A versão **vem da tag** (semver, `v1.2.3` ou `v1.2.3-beta.4`). O `release.yml` roda o
`ci.yml`, empacota os três sistemas, confere pacotes e nomes e, **só se os três
passarem**, cria o release normal, marcado como o mais recente — `/releases/latest/` e a
API do site ignoram pré-lançamentos, então a beta fica no número.

- **Nuvem obrigatória:** o primeiro job confere `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY` (o mesmo teste do app: URL `https://`, chave com mais de 20
  caracteres) e **para o workflow** se faltarem — sem eles o instalador cairia na licença
  simulada, sem login real e sem cuidador. `VITE_SITE_URL` é opcional.
- **Modelo:** o release de tag `0.0.0-modelos` com `l2cs_gaze360.onnx`, no repositório da
  variável `IRISFLOW_MODELOS_REPO` (sem ela, o de releases; pode ser privado, lido com o
  `RELEASES_TOKEN`). Numa tag, sem ele o workflow falha. No repositório dos instaladores
  ele precisa ser pré-lançamento (o workflow confere), e num repositório público o log
  avisa que os pesos estão abertos para download (item 1 das Pendências). A tag antiga
  `modelos` ainda é aceita, com aviso.
- **Teste sem publicar:** *Actions → Release → Run workflow*. Instaladores como artefato
  por 14 dias, sem release; sem o modelo, só um aviso e rastreamento degradado. A opção
  *permitir_sem_nuvem* (desligada por padrão) aceita testar sem os segredos da nuvem.
- **Depois:** atualize `public.beta_program.current_version` (a `/beta` mostra). A tabela
  `app_releases` não é mais lida por nenhum app.
- **Tirar do ar:** apague o release com defeito (ou volte-o a rascunho): as instalações
  beta leem o feed, e marcar o anterior como *latest* só corrige o site e as instalações
  estáveis. Quem já instalou a versão ruim só sai dela com uma versão **maior**.

---

## Hospedagem e publicação

Tudo roda em planos gratuitos; o pago entra peça por peça. Valores de 23/09/2026 —
confira antes de pagar.

| peça | agora (R$ 0) | limite que importa | quando pagar |
|---|---|---|---|
| site | Cloudflare Pages, `irisflow.pages.dev` | 500 builds/mês, 20 min cada, 20 000 arquivos de até 25 MiB | domínio próprio |
| banco e login | Supabase Free | pausa após 7 dias parado, sem backup, 500 MB | Pro, US$ 25/mês |
| instaladores | GitHub Releases, repositório público | arquivo < 2 GiB; Actions ilimitado só se público | privado: 2 000 min/mês |
| app do cuidador | EAS Free | 15 builds Android + 15 iOS/mês, fila lenta; Update até 1 000 usuários | Starter, US$ 19/mês |
| lojas | APK por link | — | Play US$ 25 (uma vez); Apple US$ 99/ano |
| e-mail do Auth | Gmail com senha de app (a configurar) | 500/dia | domínio + Resend (grátis até 3 000/mês) |

### Site no Cloudflare Pages

Ligado ao repositório pelo app do GitHub da Cloudflare; cada push na `main` publica.
Build: branch `main`, root directory `site`, comando `npm run build` (`tsc -b && vite
build`), saída `dist` (dentro de `site/`); opcional, *build watch paths* `site/*`, para
commit de desktop ou app não gastar build. Variáveis em **Production e Preview** — todo
`VITE_*` vai para o bundle, é público e só muda com novo deploy:

| variável | valor |
|---|---|
| `NODE_VERSION` | `24.11.1` (a do CI; o Pages usa Node 22 por padrão) |
| `VITE_SUPABASE_URL` / `_ANON_KEY` | `https://xouznaqxhqzjdgeshlmh.supabase.co` / chave *anon* (a proteção é a RLS) |
| `VITE_SITE_URL` | `https://irisflow.pages.dev`: canonical, `og:*`, sitemap, robots e links dos e-mails |
| `VITE_RELEASES_REPO` / `_AVAILABLE` | `ZambePy/Blinkv1` / `windows` (`windows,macos,linux` quando testados) |
| `VITE_CF_ANALYTICS_TOKEN`, `VITE_APP_CUIDADOR_URL` | token do Web Analytics e link do APK, ou vazios |

- **Downloads:** o navegador pergunta à API do GitHub pelo último release (sem token, 60
  consultas/h por IP, cache de 10 min na aba). Um sistema só ganha botão se tiver arquivo
  no release **e** estiver em `VITE_RELEASES_AVAILABLE`; os outros aparecem como "em
  preparação". Para oferecer macOS e Linux depois de testá-los, basta trocar a variável
  para `windows,macos,linux` e publicar de novo.
- **SPA e cabeçalhos:** sem `404.html` no build (o atual não gera nenhum), o Pages serve o
  `index.html` em toda rota profunda; o `_redirects` fica sem regras — a antiga
  `/* /index.html 200` era descartada pelo Pages com aviso e faria falhar um deploy no
  Workers (lá entra `not_found_handling`). O `_headers` traz CSP restrita (`connect-src`
  só Supabase, `api.github.com` e Web Analytics), HSTS, `nosniff`, `X-Frame-Options`,
  `Permissions-Policy`, COOP e cache longo em `/assets/*` e `/fonts/*`; o HTML fica no
  padrão do Pages, `public, max-age=0, must-revalidate`.
- **Prévias e estatísticas:** cada push fora da `main` e cada PR ganham
  `<hash>.`/`<branch>.irisflow.pages.dev`, **públicas**, `noindex`, com o Supabase de
  produção (para fechar: *Preview branches* = None). O Web Analytics é o manual
  (`VITE_CF_ANALYTICS_TOKEN`, carrega a menos que o visitante recuse); não ligue o
  automático do projeto, que ignora a recusa.
- **O que o visitante recebe:** JS e CSS minificados, sem source map, sem `debugger` nem
  `console.log`, sem os comentários do `index.html` (`site/vite.config.ts`). Isso não
  esconde o site: o JavaScript de uma página sempre chega ao navegador, e nenhum site
  desliga as ferramentas de desenvolvedor de quem visita. A proteção real é não haver
  segredo no cliente (só URL e chave anon) e toda permissão ser decidida no servidor
  (RLS, funções do banco, Edge Function); a `service_role` nunca sai do Supabase.

### Domínio próprio (depois)

Compre (`.com.br` só no Registro.br, R$ 40/ano; outros TLDs no Cloudflare Registrar, a
preço de custo, ou em qualquer registrador — olhe a renovação: o `.tech` sai a US$ 9,99
no 1º ano e renova a US$ 49,20, valores de agregador). Domínio raiz exige a zona na
Cloudflare (plano Free: desligue o DNSSEC no registrador, troque os nameservers, religue
pela Cloudflare); com DNS externo, só subdomínio, adicionado no Pages **antes** do CNAME
para `irisflow.pages.dev` (senão, erro 522). Em *Pages → Custom domains* adicione o
domínio e o `www`. Depois:

| onde | o quê |
|---|---|
| Pages (Production) | `VITE_SITE_URL` do domínio + novo deploy |
| Supabase → URL Configuration | Site URL `https://dominio/nova-senha`; Redirect URLs `+ /entrar` e `+ /nova-senha` do domínio (mantenha as do `pages.dev` na transição) |
| GitHub → segredo `VITE_SITE_URL` | nova tag; chega aos desktops pela atualização (no Mac, só com Developer ID) |
| EAS → `EXPO_PUBLIC_SITE_URL` | preview e production; novo build ou `eas update` |
| `app/app.json` → `extra.privacyPolicyUrl`, `termsUrl`, `accountDeletionUrl` | e as fichas da Play e da App Store |

Mantenha o `irisflow.pages.dev` no ar: versões antigas abrem esse endereço (ele é fixo na
lista de hosts do desktop). Releases, keepalive e Edge Function não mudam, e não há deep
link a trocar: o scheme `irisflow://` do app não participa do Auth.

### Supabase (plano Free)

Projeto **IrisFlow Communicator**, ref `xouznaqxhqzjdgeshlmh`, São Paulo (`sa-east-1`),
`https://xouznaqxhqzjdgeshlmh.supabase.co`: o esquema base e as migrações até
`20260923120907` aplicados (as três de `20260923150000` em diante ainda não — ver
[Supabase](#supabase-supabase)), pg_cron com `escalar-pedidos-de-ajuda` e
`encerrar-sessoes-orfas`, e a Edge Function `desktop-sync` (v1) com `verify_jwt = false`
(o desktop se autentica pela chave do computador). `EXPO_ACCESS_TOKEN` é segredo opcional.

- **Pausa após 7 dias** sem atividade; volta pelo painel, com os dados. O
  `supabase-keepalive.yml` lê uma linha de `beta_program` a cada 3 dias com os segredos
  `SUPABASE_URL` e `SUPABASE_ANON_KEY` — sem eles, **falha** (vermelho), em vez de fingir
  que protege. Em repositório público o GitHub desativa agendamentos após 60 dias sem
  atividade: reative em *Actions*.
- **Sem backup automático:** toda semana e antes de migrar,
  `supabase db dump --linked -f backup.sql` e o mesmo com `--data-only` (o CLI roda o
  `pg_dump` num contêiner: Docker aberto), fora do repositório — são dados de pacientes.
- 500 MB de banco (acima, só leitura), 5 GB de tráfego, 50 000 usuários ativos/mês,
  500 000 invocações de função, 200 conexões de Realtime. **2 projetos grátis no total:** o
  antigo "Site Iris Flow" (`ydnsnbeugxzhpkpqpqhb`) segue ativo. A proteção contra senha
  vazada (*Leaked Password Protection*) só existe do Pro para cima; no Free, o que dá é
  exigir tamanho mínimo e tipos de caractere na senha.

| Authentication → | valor | por quê |
|---|---|---|
| URL Configuration → Site URL | `https://irisflow.pages.dev` | de fábrica é `http://localhost:3000`, e é o destino de qualquer link sem `redirectTo` e o `{{ .SiteURL }}` dos modelos de e-mail; o site e o app passam `redirectTo` em todos os fluxos |
| URL Configuration → Redirect URLs | `https://irisflow.pages.dev/entrar`, `…/nova-senha`, `http://localhost:5173/**` | fora da lista o destino é ignorado; as prévias usam `VITE_SITE_URL` |
| Emails → SMTP Settings | Gmail: `smtp.gmail.com`, porta 465, usuário e remetente = o Gmail, senha de app | o SMTP padrão só entrega à equipe do projeto, 2 por hora |
| Rate Limits → e-mails | ~20/h | o SMTP próprio começa em 30/h; o Gmail para em 500/dia |
| Sign In / Providers → Email | provedor ligado; *Confirm email* ligado **depois** do SMTP | o site trata os dois modos; sem SMTP ninguém de fora recebe o link |

### App do cuidador (EAS)

Perfis do `app/eas.json`, cada um com o canal OTA de mesmo nome: `development` (APK com
dev client), `preview` (**APK** interno, por link/QR) e `production` (**AAB** para a loja,
número de build remoto com `autoIncrement`; iOS pela App Store/TestFlight). Instalar em
iPhone fora da loja também exige a conta Apple paga.

- **Variáveis:** o `env` do `eas.json` já tem `EXPO_PUBLIC_SUPABASE_URL` e `_ANON_KEY`,
  mas só o `eas build` o lê. O `eas update` (SDK 55+) exige `--environment` e usa **só**
  as variáveis do EAS: cadastre as duas lá também, ou um update sai sem Supabase e o app
  para de conectar. `EXPO_PUBLIC_SITE_URL` é opcional (vazio = `irisflow.pages.dev`);
  `GOOGLE_SERVICES_JSON` (arquivo, secreto) liga o push no Android.
- **Projeto:** `extra.eas.projectId` vazio e `updates.url` com o marcador `SEU-PROJECT-ID`
  (`app/app.json`). O `eas init` só imprime o projectId (por causa do `app.config.js`):
  cole nos dois lugares. Sem isso, nem push nem EAS Update.
- **Push:** não existe no Expo Go (SDK 53+); no Android exige Firebase (FCM V1); no iOS,
  a conta Apple paga.
- **APK fora da loja:** verificação de desenvolvedor Android a partir de 30/09/2026, no
  Brasil, para apps de lojas participantes; APK por link fica fora nesta fase (confira
  developer.android.com/developer-verification). O link interno do EAS não tem validade
  garantida: anexe o APK a um release público. Guarde cópia do keystore (`eas credentials`).

### Publicação nas lojas

| conta | custo | o que exige |
|---|---|---|
| Google Play Console | US$ 25, uma vez | verificação de identidade; conta **pessoal** criada após 13/11/2023 faz teste fechado com ≥ 12 testadores por 14 dias seguidos antes da produção (conta de organização, com D-U-N-S, não) |
| Apple Developer Program | US$ 99/ano | Apple ID com 2FA (pessoa física) ou D-U-N-S (organização). Não precisa de Mac: o EAS compila e envia |

1. **Versão:** `version` do `app/app.json` é a visível na loja; os números de build ficam
   no EAS (`appVersionSource: "remote"`) e o perfil `production` soma 1 a cada build — a
   loja recusa número repetido.
2. **Android:** `eas build -p android --profile production` gera o AAB. O **primeiro**
   upload é à mão (Play Console → Testar e lançar → Teste interno → Criar versão); depois,
   `eas submit -p android --profile production --latest`, que manda para a faixa interna
   como rascunho (`eas.json` → `submit`) e exige uma conta de serviço do Google com
   permissão de lançamento cadastrada em `eas credentials`. Deixe o Play App Signing
   ligado: o keystore do EAS vira a chave de upload.
3. **iOS:** `eas build -p ios --profile production` (o EAS cria certificado, perfil e a
   chave APNs — responda sim ao push), App Store Connect → Apps → + com o bundle
   `br.com.irisflow.cuidador`, e `eas submit -p ios --latest`.
4. **Teste antes da produção:** Play — teste interno (até 100 pessoas, sem revisão), depois
   fechado; TestFlight — internos (até 100 da equipe, sem revisão) e externos (até
   10 000, depois da Beta App Review); cada build do TestFlight vale 90 dias.
5. **Depois de publicado:** `eas update` (com `--environment`) corrige JavaScript sem novo
   binário, só para builds com o mesmo *fingerprint* nativo; recurso novo passa pela
   revisão das lojas.

Formulários (Segurança dos dados na Play, Privacidade do app na Apple), conferidos contra
o que o app envia (`app/src/data/supabaseProvider.ts`, `usePushNotifications.ts`,
`src/lib/sentry.ts`):

| dado | de onde vem | obrigatório? | finalidade | Apple: vinculado |
|---|---|---|---|---|
| e-mail | login e "esqueci a senha" | sim | funcionalidade, conta | sim |
| ID do usuário | JWT de toda requisição, `acknowledged_by` | sim | funcionalidade | sim |
| nome e telefone | contatos de emergência (`patient_settings`) | não | funcionalidade | sim |
| informações de saúde | ajustes do paciente, pedidos de ajuda confirmados | não | funcionalidade | sim |
| mensagens | conversa (`messages`) e frases rápidas | não | funcionalidade | sim |
| ID do dispositivo | token de push (`push_tokens`) | não | funcionalidade | sim |
| falhas e diagnóstico | só com `EXPO_PUBLIC_SENTRY_DSN` (sem PII, sem captura de tela) | — | análise | não |

Criptografado em trânsito: sim. Exclusão: sim (`https://irisflow.pages.dev/privacidade#direitos`
e Ajustes → "Excluir conta e dados", que abre um pedido por e-mail). Compartilhamento com
terceiros e rastreamento: não — Supabase, Expo/Google/Apple (push) e Sentry são
prestadores. Não coleta localização, agenda, fotos, áudio, arquivos nem identificador de
publicidade; não há SDK de estatística. Demais respostas: política
`https://irisflow.pages.dev/privacidade`; público 18+; mensagens privadas entre pessoas da
mesma conta; recurso de saúde declarado, sem ser dispositivo médico; iOS sem criptografia
não isenta (`usesNonExemptEncryption: false`) e sem iPad (`supportsTablet: false`: só
capturas de iPhone). Ligar o Sentry exige atualizar os dois formulários e a política.

**Conta para a revisão.** As duas lojas recusam app com login sem uma conta que o revisor
use. A conta do `supabase/seed.sql` não serve: a senha é pública (item 2 das Pendências) e
ela só tem o paciente — sem computador pareado, sessões, conversa nem alertas, o revisor
veria telas vazias. É preciso uma conta própria de revisão, com senha forte só nos
consoles (Play → Acesso ao app; App Store Connect → App Review Information), um paciente
fictício, um "computador" de demonstração, uma semana de sessões, mensagens e alertas
resolvidos, e contatos de emergência preenchidos — nunca dado real de paciente — e
recriada antes de cada envio. O script que fazia isso (`conta-revisor.sql`, citado na
documentação antiga) **não existe no repositório**. Na Apple, a exclusão de conta precisa
começar no app: hoje é um pedido por e-mail; se a revisão exigir exclusão dentro do app, é
preciso uma função no servidor.

### Segredos e variáveis do GitHub Actions

*Settings → Secrets and variables → Actions*. O `ci.yml` não usa nenhum; nos outros, um
passo recebe `toJSON(secrets)` e `scripts/ci-segredos-opcionais.mjs` repassa só os que
existem. O `GITHUB_TOKEN` automático publica o release.

| nome | tipo | usado por | obrigatório? |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | segredo | `release.yml` | **obrigatórios numa tag**: sem eles o workflow para no primeiro job (teste manual: opção *permitir_sem_nuvem*) |
| `VITE_SITE_URL` | segredo | `release.yml` | opcional (padrão `irisflow.pages.dev`); obrigatório com domínio |
| `VITE_DESKTOP_SYNC_URL`, `IRISFLOW_CRASH_URL` | segredo | `release.yml` | opcionais |
| `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`, ou os sete `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TRUSTED_SIGNING_{ENDPOINT,ACCOUNT,PROFILE,PUBLISHER}` | segredo | `release.yml` (só Windows) | opcional |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | segredo | `release.yml` (só macOS) | opcional (Developer ID) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | segredo | `release.yml` (macOS) | opcional; exige `CSC_*` |
| `RELEASES_TOKEN` | segredo | `release.yml` (modelo e publicação) | só com releases ou modelos em outro repositório |
| `IRISFLOW_RELEASES_REPO` | **variável** | `release.yml` → `package-app.mjs` | opcional (padrão: este repositório) |
| `IRISFLOW_MODELOS_REPO` | **variável** | `release.yml` (modelo) | opcional (padrão: o de releases); pode ser privado |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | segredo | `supabase-keepalive.yml` | obrigatórios: sem eles o workflow falha |

---

## Verificação

```bash
npm run verificar                                  # tudo o que o CI confere, nos três projetos
node scripts/verificar-tudo.mjs --so site,app      # só alguns grupos (desktop, site, app)
node scripts/verificar-tudo.mjs --so desktop,pacote  # + empacota a pasta do app e confere o pacote
```

O `verificar` roda, em sequência: tipos do núcleo e do Electron, testes do
núcleo (Vitest), testes e build da interface, compilação do Electron; tipos,
testes e build do site; tipos e testes (Jest) do app do cuidador — e resume no
fim. É o mesmo portão do `.github/workflows/ci.yml`, que roda a cada push e PR
na `main`: o desktop num runner Windows, e site, app e um empacotamento Linux
(`--dir` + [`scripts/conferir-pacote.mjs`](scripts/conferir-pacote.mjs)) em
runners Linux. Fora do `verificar` e do CI ficam o motor de voz (`cd
voice-engine && python -m pytest -q tests`, com um dublê do modelo), o teste
do banco (`scripts/db-local-test.sh`, ver [Supabase](#supabase-supabase)), o
teste Deno da `desktop-sync` (`deno test supabase/functions/desktop-sync/`) e
o replay de gravação real (`docs/MEDICOES.md` §15), que precisa de uma
gravação. Os instaladores dos três sistemas saem de
`.github/workflows/release.yml` ([Instalador](#instalador-e-atualização-automática)).

**Estado medido nesta versão (23/09/2026):** núcleo com **1948 testes (mais 2 pulados) em 176 arquivos**,
interface com **1183 em 134 arquivos**, site com **175 em 17 arquivos** e app do
cuidador com **96 em 12 suítes** — 3402 testes ao todo; checagem de tipos sem
erro nos cinco projetos (núcleo, Electron, interface, site e app) e os builds
de produção da interface e do site passando; banco local com as 16
migrações, o cenário e o seed passando.

Os testes do núcleo cobrem os módulos puros, onde os limiares e as leis de
controle vivem: calibração (inclusive a correção local dos cantos, com um olho
sintético que satura embaixo), Ridge, filtros, decodificação do L2CS,
prontidão, ajuste de câmera, geometria de tela e EDID, protocolo de medição,
segurança do Electron e do pacote, geometria e structs Win32 do Modo
Computador, protocolo da voz, as faixas de hardware da voz e o motor do
assistente de escrita. Na interface, a sobreposição do Modo Computador é
testada de ponta a ponta com uma ponte falsa; `falar()` com cache, prazo e
substituição; o modo apresentação pelo que ele promete (que fala, socorro e
uso **não** saem do barramento); o relatório de suporte, por não conter frase
do paciente, imagem nem vetor de calibração; a fila offline, por não guardar
nada sem vínculo e por mandar o horário original. O harness sintético
(`src/testUtils/`) roda o pipeline inteiro sobre trajetórias determinísticas e
barra regressões contra um baseline versionado.

Dois tipos de teste vale distinguir, porque eles provam coisas diferentes:

- **Refinamento**, para continuidade. Varre o parâmetro com dois passos, um
  grosso e um fino, e exige que o maior salto encolha na proporção do passo.
  Um limiar afirmado por um valor absoluto passaria com o degrau ainda lá; num
  degrau, o maior salto não encolhe. É como a soltura da EMA, a compensação de
  pose, o peso do estabilizador e o desvanecimento do bloco L2CS são
  verificados.
- **Convenção**, para o que só existe dentro de um `subscribe` ou de um `rAF`
  sob um provider que exige `getUserMedia`, MediaPipe e um Worker — nenhum dos
  três existe em jsdom. Esses testes leem o TEXTO do arquivo
  (`src/config/guardasDeInteracao.test.ts`, `src/accuracy.modoDeVerificacao.test.ts`).
  Um teste de convenção que ancora a guarda é melhor que nenhum; o que ele não
  faz é verificar comportamento, e isso está escrito no cabeçalho de cada um.

Os testes do cursor usam um **relógio de quadros determinístico**
(`frontend/src/test/quadros.ts`), que troca `requestAnimationFrame` e
`performance.now` por uma fila controlada pelo teste. Sem ele, um teste que
emite uma amostra e lê o DOM na linha seguinte lê o estado anterior — não
porque o cursor parou, mas porque o quadro ainda não aconteceu.

---

## Compatibilidade

| plataforma | estado |
|---|---|
| Windows 10/11 (Electron) | testado; lê a diagonal do monitor pelo EDID; Modo Computador completo e voz personalizada completa, esta ainda **experimental** |
| Chromium (Chrome, Edge) | testado; sem acesso à geometria do sistema, sem Modo Computador nem voz personalizada. O assistente de escrita funciona (é só renderer) |
| Linux (Electron) | não testado numa máquina real; o CI empacota e confere a pasta do app, e o release gera AppImage, `.deb` e `.rpm`. Modo Computador em X11 via `xdotool`; motor de voz roda (Python) |
| macOS (Electron) | não testado; o release gera `.dmg` e `.zip` (x64 e arm64), sem assinatura Apple. Modo Computador ainda sem adaptador (Acessibilidade) |
| Site | conferido no Chromium, em tela de computador e de celular; Firefox e Safari não foram testados à parte |
| App do cuidador | Android e iOS via Expo; push só em build (não no Expo Go) |

Os controles de câmera (`zoom`, `brightness`, `contrast`, `exposureMode`)
dependem do driver. O app sonda o que existe e, quando não consegue ajustar,
diz qual ajuste físico é necessário.

---

## Pendências e riscos

Estado em 23/09/2026.

1. **Pesos do L2CS no release — decisão jurídica.** A licença do Gaze360 é
   *research-only* e proíbe uso comercial, inclusive de modelos treinados na base; a
   decisão de 15/09/2026 é não distribuí-los ([Modelos](#modelos); `usoComercial:
   "proibido"`). O `release.yml` faz o contrário: baixa `l2cs_gaze360.onnx` do release
   `0.0.0-modelos`, o empacota em **todo** instalador e falha sem ele numa tag. Num
   repositório público, esse release ainda deixa os pesos para download direto (o workflow
   avisa); até a decisão, guarde-o num repositório privado (`IRISFLOW_MODELOS_REPO` +
   `RELEASES_TOKEN`) — o que tira o arquivo da vitrine, mas não dos instaladores. Se o
   antigo release `modelos` já existe num repositório público, os pesos já estão expostos.
   Saídas: publicar sem o L2CS (menor precisão; muda o `release.yml`), autorização escrita
   dos titulares, ou o modelo retreinado em base licenciada.
2. **Conta de teste pública.** `admin@irisflow.com` / `irisflow2026` existe no projeto de
   produção (`supabase/seed.sql`) e a senha está no repositório público (`seed.sql`,
   `app/src/lib/config.ts`, `frontend/src/services/license/mockLicenseService.ts`,
   `site/scripts/capturar-tela-do-app.mjs`) — de propósito, para qualquer testador
   entrar. Qualquer um entra no site, no desktop e no app do cuidador, altera os dados
   dessa conta, pareia computadores e dispara push aos aparelhos registrados nela. A
   migração `20260923150200` impede trocar a senha e o e-mail dela, mas **ainda não foi
   aplicada**. Antes do lançamento comercial, apague a conta.
3. **GPL-3.0 × distribuição fechada.** Fechar o repositório não revoga a licença de quem
   já recebeu o código. Distribuir binários sob GPL obriga oferecer o fonte a quem os
   recebe; fechar exige o acordo de todos os autores e uma conferência das licenças das
   dependências (não feita), e contradiz a seção [Licença](#licença). Decisão com advogado.
4. **Instaladores sem assinatura:** SmartScreen, Smart App Control e Gatekeeper, e nenhuma
   atualização no Mac sem Apple Developer. Os segredos já são separados por sistema
   (`WIN_CSC_*` só no Windows, `CSC_*` só no macOS).
5. **Supabase Free e e-mail:** pausa (o keepalive falha em vermelho sem os segredos, mas
   para de rodar se o GitHub desativar o agendamento), sem backup automático, as duas vagas
   grátis ocupadas (decida o que guardar do projeto antigo antes de apagá-lo), sem proteção
   contra senha vazada (só no Pro). O SMTP próprio ainda não está configurado: sem ele,
   confirmação e "esqueci a senha" não chegam a quem é de fora da equipe.
6. **Três migrações e a `desktop-sync` nova ainda não estão em produção** — a aplicação
   foi barrada pela checagem de permissões desta sessão. Os clientes novos funcionam com o
   banco e a função atuais (os campos novos são ignorados), mas sem elas: um socorro que
   esperou na fila offline aparece como novo, cada login no mesmo PC deixa uma chave
   antiga válida, e a senha da conta de teste pode ser trocada por qualquer um. Como
   aplicar: [Supabase](#supabase-supabase).
7. **App do cuidador sem projeto EAS:** sem push nem EAS Update até o `eas init`. Push não
   existe no Expo Go e, no Android, depende do Firebase. Um `eas update` antes de cadastrar
   as variáveis do Supabase no EAS publica um bundle que não conecta.
8. **macOS e Linux sem teste real:** o CI só gera a pasta Linux (`--dir`), o `.dmg` nunca
   foi gerado (sai no primeiro release) e nenhum dos dois foi instalado numa máquina real.
   O site só oferece esses botões quando `VITE_RELEASES_AVAILABLE` os listar.
9. **Repositório privado depois:** os releases dele somem para visitantes e apps, e o
   Actions cai para 2 000 min/mês (macOS custa ~10× o Linux). Caminho: repositório público
   só de releases, variável `IRISFLOW_RELEASES_REPO`, segredo `RELEASES_TOKEN` (PAT
   fine-grained, *Contents: Read and write* só nos repositórios de releases e de modelos) e
   `VITE_RELEASES_REPO` no Pages; o de modelos pode ficar privado (item 1). Os apps
   instalados leem o repositório antigo: antes de fechá-lo, publique nele uma versão-ponte
   com os arquivos do release novo.
10. **Ainda aberto no código:** leitores de EDID testados só como parsers (confirmar num
    PC real); medição em vídeo do roll normalizado e uma sessão ao vivo com a calibração
    de 13 pontos (`docs/MEDICOES.md` §14.5); enum `condition_t` sem esclerose múltipla;
    licença simulada (só sem nuvem, em desenvolvimento) que esquece a sessão a cada
    reabertura; antes de reabrir vendas pagas, uma assinatura pode voltar a `ativa` sem
    pagamento real (`attach_payment_method` sem gateway + cancelar + reativar) e o limite
    de computadores de Completo/Voz anunciado no site não é aplicado pelo banco;
    avisos de postura/fadiga previstos no banco que o desktop não envia.

---

## Licença

GNU General Public License v3.0 — texto completo em [`LICENSE`](LICENSE).
Para uma tecnologia assistiva isso importa em concreto: quem depende dela
para se comunicar continua tendo direito ao código que a faz funcionar.
