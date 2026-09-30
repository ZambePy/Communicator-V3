# Pesquisa: matemática do rastreamento, ELA e recalibração pelo uso

29/09/2026 · IrisFlow V2 (branch `pipeline-v2`)

Este documento é a Fase 1 do trabalho do V2. Ele descreve a matemática que o código faz hoje, confere na fonte cada número da literatura que as mudanças usam, junta o que se sabe sobre ELA e fecha com a tabela de decisão que guiou a implementação.

Regras de leitura:

- Todo número de literatura tem link. Onde a fonte primária estava bloqueada (403, captcha), o texto diz "não confirmado na fonte primária".
- Contas próprias aparecem como **[conta]**. Simulações próprias aparecem como **[simulação]**. Não são literatura.
- Documentos e medições antigas do projeto são contexto, não validação. Com uma pessoa e sem réplica, diferenças abaixo de ~0,5° não são interpretáveis (MEDICOES.md §14.4).
- Tela de referência: 23,6" 1920×1080 a 60 cm, 36,75 px/cm, 1° ≈ 38,5 px no centro.

## Sumário

1. [A matemática de hoje](#1-a-matemática-de-hoje)
2. [Onde está o erro](#2-onde-está-o-erro)
3. [Literatura verificada](#3-literatura-verificada)
4. [ELA: o que muda para o produto](#4-ela-o-que-muda-para-o-produto)
5. [Tabela de decisão](#5-tabela-de-decisão)
6. [O que ficou de fora](#6-o-que-ficou-de-fora)

---

## 1. A matemática de hoje

Referências `arquivo:linha` valem para o commit-base do V2 (`e731357`). O caminho é o padrão do código; o instalador público foi compilado com `IRISFLOW_BUILD_L2CS=off`, só com a íris, de 24/09 até a 1.0.0-beta.9, e leva o L2CS desde a beta.10 (README, *Pendências e riscos*, item 1).

### 1.1 Da câmera às features

**Landmarks e pose.** O FaceLandmarker do MediaPipe roda em modo VIDEO com um rosto (`tracker/engine.ts:966-976`) e devolve 478 pontos normalizados (x/W, y/H) e a matriz facial 4×4, lida em coluna-maior (`extractor.ts:608-618`). Os ângulos da cabeça saem crus, sem suavização:

```
pitch θ = asin(−R₁₂)   yaw ψ = atan2(R₀₂, R₂₂)   roll φ = atan2(R₁₀, R₁₁)
```

No espaço métrico do MediaPipe, yaw > 0 é a cabeça virada para a esquerda da pessoa e pitch > 0 é a cabeça para baixo.

**Referencial da cabeça.** Montado com landmarks, não com a matriz (`extractor.ts:720-735`): eixo x dos cantos externos 33 → 263, eixo y ortogonalizado na direção da testa (10), tudo dividido pela distância entre os cantos. As coordenadas usadas são as normalizadas (x/W, y/H), que em 16:9 **não são isotrópicas**.

**Vetor por olho.** No conjunto padrão `irisAbs+l2cs:4` entram quatro números (`extractor.ts:411`):

```
oX, oY  = centro da íris − ponto médio dos cantos do mesmo olho   (referencial da cabeça, em distâncias cantais)
tψ, tθ  = tan(clamp(ψ_L2CS, ±45°)), tan(clamp(θ_L2CS, ±45°))        (referencial do raio câmera→olho)
```

O bloco L2CS é o mesmo nos dois olhos. Ele zera na hora acima de 0,61 rad (`l2cs/block.ts:43`) e reaproveita o último ângulo válido por até 600 ms, com desvanecimento de 200 ms (`block.ts:114, 136`).

**Expansão parcial.** Os ângulos ficam lineares e só a íris ganha termos de 2º grau: `[oX, oY, tψ, tθ, oX², oX·oY, oY²]`, 7 colunas (`calibration/polynomial.ts:50-82`). Sem L2CS são 5 colunas. Depois vem o StandardScaler por olho (`scaler.ts`).

### 1.2 O L2CS (não muda nesta versão)

Recorte quadrado da face (1,4× a caixa dos landmarks), girado pelo roll suavizado (EMA de 150 ms, `l2cs/rollSuave.ts:20`), 448² no WebGPU e 224² no WASM, normalização ImageNet, ResNet-50 do Gaze360, 90 bins de 4° decodificados por média circular (`l2cs/decode.ts:76-89`). A cadência é de 100 ms (WebGPU) ou 160 ms (WASM), com uma inferência em voo (`l2cs/client.ts:34-43, 144`).

Depois da rede, dois passos ainda mexem nos ângulos:

- `l2cs/roll.ts` desfaz no vetor de olhar o giro que o recorte aplicou;
- `l2cs/suavizacao.ts` faz uma EMA de 120 ms que se solta entre 20 e 60 °/s.

**Convenção de sinais.** O código de referência do L2CS devolve primeiro o yaw e depois o pitch; yaw > 0 é olhar para a direita **da pessoa** (esquerda da imagem não espelhada) e pitch > 0 é para cima. O vetor 3D em eixos OpenCV é `g = (−cos p·sin y, −sin p, −cos p·cos y)` ([model.py](https://github.com/Ahmednull/L2CS-Net/blob/main/l2cs/model.py#L57-L71), [vis.py](https://github.com/Ahmednull/L2CS-Net/blob/main/l2cs/vis.py#L5-L18), [utils.py](https://github.com/Ahmednull/L2CS-Net/blob/main/l2cs/utils.py#L33-L38)). O Gaze360 mede o olhar no referencial do **raio câmera→olho**, não nos eixos da câmera ([README do dataset](https://github.com/erkil1452/gaze360/blob/master/dataset/README.md)). A gravação de 23/09 confirma o sinal: ψ = −6,2° / +4,5° / +15,6° para alvos à esquerda, no centro e à direita da tela.

### 1.3 Ridge por olho

Por olho e por eixo, com intercepto sem penalidade (`ridge.ts:248-326`):

```
β̂ = (ΦᵀW̃Φ + λ·m·diag(0, P))⁻¹ ΦᵀW̃y
P  = Σ_W / (tr Σ_W / d) + 0,01·I        Σ_W = covariância intra-alvo das features padronizadas
```

`m` é o número de quadros, o que torna λ adimensional. λ sai de uma grade de 25 valores (1e-5…1e3) por validação cruzada deixando um **alvo** inteiro de fora, independente por eixo, com o erro quadrático médio como critério (`ridge.ts:623-769`). O Ridge devolve só o ponto, sem incerteza.

### 1.4 Calibração

**Alvos.** 13 no perfil padrão: grade 3×3 limitada por um orçamento de 16° (12° embaixo), com a linha de baixo em y = 0,8375, mais os quatro cantos da tela a 5% (`calibration.ts:2096-2175`). O perfil do computador tem 13 alvos a 2% da borda; o modo rápido, 4.

**Ordem.** Ordem de leitura: linhas de cima para baixo, cada uma da esquerda para a direita (`frontend/src/pages/calibration/ordemDaGrade.ts:47-79`). Na referência, a correlação entre a altura do alvo e a ordem de coleta é r(t, y) = +0,95 e o maior salto é de 45°. **[conta]**

**Coleta.** A bola desliza 620 ms, a coleta abre 1200 ms depois do alvo anterior e descarta 600 ms (`CalibrationCheck.tsx:81, 615`; `accuracyProtocol.ts:29`). O primeiro dado útil chega 1180 ms depois de a bola parar. A janela útil vai de 900 ms até 1680 + 1120·d ms e fecha antes se o olhar estabilizar (`calibration/estabilidadeDoPonto.ts`).

**Treino.** Cada quadro vira uma linha do Ridge. Não há agregação por alvo nem descarte de quadros: os portões de qualidade foram removidos e só sobraram pesos de imagem, normalizados para média 1 dentro de cada alvo (`calibration.ts:2679-2698`; `calibration/pesoDaAmostra.ts`). Os rótulos são compensados pela pose de cada amostra:

```
y'_k = T_k − (−D·tan Δψ_k / W, +D·tan Δθ_k / H)      D = distância olho–tela configurada × px/cm
```

**Outliers.** `detectOutlierPoints` refaz o ajuste sem cada alvo com um Ridge isotrópico de λ fixo 2e-3, sem pesos, e marca o alvo com |r − mediana| > max(3·1,4826·MAD; 0,15). Só marca; não remove nem retreina (`calibration.ts:3880-4093`).

**Correção dos cantos.** Um processo gaussiano sobre o resíduo dos alvos fora da grade interna, com ℓ = 0,10 e σ² = 0,10 em fração da tela (`correcaoLocal.ts:75-167`).

### 1.5 Do Ridge ao cursor

A ordem por quadro está em `calibration.ts:4545-4688` (`mapGaze`) e em `tracker/engine.ts:1590-1717`:

1. **Fusão binocular.** w_e = max(0,05; EAR_e/0,25) · max(0,05; confiabilidade_e) · 1,5 se dominante. A confiabilidade é o inverso do erro de treino do olho.
2. **Distância.** u ← ½ + (u − ½)·r, com r = d_agora/d_calib limitado a [0,6; 1,6], em torno do centro da tela (`distanceCompensation.ts:177-191`).
3. **Pose.** uₓ ← uₓ − D·tan Δψ/W, u_y ← u_y + D·tan Δθ/H, com peso que desvanece entre 25° e 35° (`poseCompensation.ts:123-189`). Pose crua, sem suavização.
4. **Translação.** O deslocamento da ponta do nariz, em cm pela régua da íris, entra 1:1 na tela (`translationCompensation.ts:93-141`).
5. **Correção dos cantos** e **correção por dwell** (deslocamento aprendido).
6. **Clamp suave** e conversão para px.
7. **One Euro** em espaço normalizado, preset `balanceado-v2` (0,5 Hz, β = 5, dcutoff 2 Hz).
8. **Estabilizador de fixação.** Média de 200 ms com pesos que caem entre 1,0° e 1,5° de dispersão e teto de 0,5° (`filters/estabilizadorDeFixacao.ts`).
9. **Dwell** sobre a amostra filtrada e **seguidor de cursor**, que só desenha a 60 Hz.

### 1.6 Correção por dwell e vigia

A cada seleção elegível, `offset ← offset + 0,05·(centro do botão − olhar filtrado)`, com teto de norma 0,08, meia-vida de 10 min, resfriamento de 300 ms e recusa de resíduos acima de 180 px (`interaction/correcaoPorDwell.ts:56-85, 208-269`). O vigia compara o viés e a BCEA recentes com a última medição (`vigiaDeRecalibracao.ts:130-163`).

O comentário do código atribui o 0,05 a "um estudo com 43 participantes que mediu 3,15° → 0,91°". O estudo existe, mas não sustenta o número (§3.4).

### 1.7 Relatório de precisão

O teste chama o mesmo `mapGaze` (`accuracy.ts:834`), sem o peso por EAR. A predição testada inclui distância, pose, translação, correção dos cantos e correção por dwell. **Não inclui** One Euro nem estabilizador, que só aparecem em `jitterFilteredRMS`. Métricas por ponto: erro da média, viés, `jitterRMS` (STD), RMS-S2S, BCEA. Agregadas: média, mediana e p90 do erro nos 9 pontos internos, viés médio, `alvoMinimoPx` = 2·(erro médio + 2·max(sdX, sdY)) (fórmula de [Feit et al. 2017](https://doi.org/10.1145/3025453.3025599)), ajuste afim e deltas de pose. O esquema é `irisflow.accuracy-report/2`.

### 1.8 Pontos frágeis que a análise encontrou

Os mais importantes, verificados rodando as funções do próprio código:

| # | Problema | Onde | Efeito |
|---|---|---|---|
| F1 | O engine passa ao recorte do L2CS o roll da matriz (y para cima), mas o recorte espera o ângulo na imagem (y para baixo): a inclinação **dobra** em vez de sumir | `engine.ts:1374` → `l2cs/crop.ts:179` | Com 10° de cabeça inclinada, a rede vê o rosto a 20°. Na gravação real, correlação −0,947 entre os dois ângulos. |
| F2 | `roll.ts` trata yaw > 0 como direita da imagem, o contrário do L2CS | `l2cs/roll.ts:17-46` | A contra-rotação gira para o lado errado: com 8° de roll, (15°, 0°) sai (14,4°, −4,1°). |
| F3 | Referencial da cabeça montado em coordenadas anisotrópicas | `extractor.ts:720-735` | Com roll de 5°, vazamento de 1,87° no offsetX **[simulação]**. |
| F4 | Íris no referencial da cabeça e L2CS no do raio, com a mesma compensação d·tanΔ na saída e nos rótulos | `extractor.ts:804-817`; `calibration.ts:3386-3404, 4634` | A compensação conta duas vezes a parte L2CS, e os rótulos de treino ficam incoerentes com ela quando a cabeça deriva durante a calibração. |
| F5 | Pose crua na compensação | `engine.ts:1548` | O tremor de pitch entra no cursor a 38,5 px/°; σ ≈ 0,27° na calibração dá até ~10 px. |
| F6 | One Euro que quase não filtra | `oneEuroFilter.ts`; `engine.ts:1669` | O β abre o filtro com o próprio ruído: corte efetivo de ~1,7 Hz em x e 2,4 Hz em y, contra 0,5 Hz nominais **[simulação]**. |
| F7 | Limiares do estabilizador abaixo da dispersão do ruído | `estabilizadorDeFixacao.ts:70-102` | A dispersão de 6 amostras de puro ruído tem mediana de 3,3°; o estabilizador age como ×0,994 no sinal cru **[simulação]**. |
| F8 | Degraus no caminho do cursor | `correcaoPorDwell.ts:245`; `seguidorDeCursor.ts:89`; `escalaMetrica.ts:207`; `block.ts:236` | Seleção aprendida move a tela até 9 px de uma vez; seguidor aplica 80% do passo acima de 96 px; régua da íris troca 9,0 cm pela mediana aos 12 quadros. |
| F9 | O fallback de rosto perdido zera o dwell no 1º quadro, contra a pausa de 500 ms do `dwell.ts` | `GazeContext.tsx:1514-1526` | Um piscar mal classificado ou uma perda de 1 quadro apaga o progresso do dwell. |
| F10 | O veredito compara o LOO com limiar calibrado em 9 alvos, mas o LOO inclui os 4 cantos | `veredito.ts:19-34`; `calibration.ts:3812` | Viés para "aceitável/erro alto". |

---

## 2. Onde está o erro

A última medição (28/09, `accuracy-report-1790635943285.json`) teve erro médio de 68,6 px (1,73°), viés de (−25,8; +51,4) px, STD de 56,6 px e RMS-S2S de 37,5 px.

**O viés vertical de +51 px com a cabeça parada.** O Δpitch da calibração para o teste foi de só 0,28°. Descontando termo a termo com os números do relatório:

- **Pose:** explica +10,8 px (21%), com o sinal certo.
- **Excluídos:** correção por dwell (zerada ao calibrar, nenhum dwell elegível até o teste); One Euro e estabilizador (fora da predição testada); correção dos cantos (≤ 3 px no miolo, 0 no centro); distância (< 1 px); intercepto com rótulos compensados (< 0,1 px); roll (≤ 2,4 px); diagonal padrão, distância em d·tanΔ e FOV (só escalam o termo de pose).
- **O que sobra** é (−61, +79) px no ponto central, que coincide com o alvo central da calibração. Ali só podem mexer a compensação lateral (o nariz não é registrado no relatório) ou mudanças das próprias features entre calibração e teste (pálpebra, íris, L2CS).

Três mecanismos do código favorecem esse tipo de viés e são tratados nesta versão:

1. **Rótulos compensados de forma incoerente (F4).** A parte L2CS não "vê" a deriva de pitch durante a calibração, mas o rótulo dela é compensado como se visse. Com a deriva correlacionada com a ordem (r(t, y) = 0,95), o erro vira ganho e deslocamento verticais.
2. **Ordem de leitura.** Deriva postural monotônica em 8 de 9 sessões, de 1,6° a 6,8° (relatório de 27/09), fica colinear com a altura do alvo.
3. **Quadros ruins no treino.** Sem agregação robusta, piscadas e intrusões entram com peso cheio.

Para fechar o diagnóstico nas próximas medições, o relatório /3 passa a gravar o deslocamento da correção por dwell, os termos de pose e de translação por ponto, a escala cantal e sua origem, a confiabilidade de cada olho, as predições de cada olho e a razão de distância (§5, M11).

**O limite físico.** Um grau de rotação do olho move o centro da íris ~0,42 px na câmera: Δu ≈ f·L·tan 1°/Z = 1379 × 10,5 mm × 0,01745 / 600 mm **[conta]**. A tela inteira cabe em ~19 × 12 px de percurso da íris. Por isso a média no tempo e a extração robusta pesam tanto.

**O ruído é colorido.** Com RMS-S2S/STD = √(2(1−ρ₁)), a razão medida de 0,64–0,66 dá ρ₁ ≈ 0,78–0,80 pela fórmula direta, ~0,83–0,85 corrigindo o viés da janela de 1,4 s ([Niehorster et al. 2020](https://doi.org/10.3758/s13428-020-01400-9); **[conta]**). Parte da correlação vem da própria cadeia: um sinal amostrado e segurado por 3 quadros (o L2CS a 100 ms) já tem ρ₁ = 0,67 **[conta]**.

---

## 3. Literatura verificada

### 3.1 Pistas pedidas

| Pista | Veredito | O que a fonte diz |
|---|---|---|
| Feit et al. CHI 2017: 3–10 recalibrações por dia | **Confirmado, mas anedótico** | "between three and ten times per day": enquete informal com cinco usuários experientes com ELA, na introdução, mesmo com o aparelho preso à cadeira de rodas ([PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2017/01/everyday_eyetracking-1.pdf)). |
| EyeO: até 50 por dia | **Paráfrase de entrevista** | "ALS users often recalibrate as much as 50 times a day", resumo de entrevistas com 6–7 pessoas da comunidade ELA; um entrevistado citou "20 calibrations in a 2 hour period" ([arXiv 2307.15039 v2](https://arxiv.org/pdf/2307.15039v2)). Não é medição. |
| Mott et al. CHI 2017: dwell em cascata, 9,51 ppm com 5 usuários com ELA | **Confirmado**, com ressalva | 9,51 WPM (dp 2,70), erro corrigido 8,80%, dwell de base 400 ms, **só com cascata** (sem comparação com dwell fixo nesse grupo). Nos 17 sem deficiência: 12,39 contra 10,62 WPM (+16,7%) e erro corrigido −35% ([PDF](https://faculty.washington.edu/wobbrock/pubs/chi-17.02.pdf)). |
| Guo et al. 2022: SWJ em 53% | **Confirmado** | 53,3% (32/60) contra 6,7% nos controles; 68,2% com envolvimento bulbar ([Brain Sci 12:489](https://doi.org/10.3390/brainsci12040489)). |
| Becker et al. 2019: intrusões de ~2° | **Parcial** | 2° é o teto do contínuo. As medianas são 0,64–0,70° na ELA contra 0,43–0,47° nos controles, e a frequência não aumenta ([JEMR 12(6)](https://doi.org/10.16910/jemr.12.6.8)). |
| Hooge et al. 2019: erros binoculares correlacionados | **Parcial** | Usar o melhor olho aumentou o erro variável em 6,8% e 6,0% ([BRM 51:2712](https://doi.org/10.3758/s13428-018-1135-3)). Isso não identifica a correlação: ~70% dos participantes continuaram com a média dos olhos, e ρ fica entre ~0,32 e ~0,78 conforme a hipótese **[conta]**. |
| "43 participantes, 3,15° → 0,91°" (comentário de `correcaoPorDwell.ts`) | **Existe, mas não sustenta o 0,05** | Krowicki et al. 2026, *Technologies* 14(7):444 ([doi](https://doi.org/10.3390/technologies14070444)): 43 adultos saudáveis, Tobii Eye Tracker 5 (infravermelho), 193,4 → 56,0 px. A métrica é o erro no próprio cursor corrigido durante o dwell ("algorithm-conditioned", nas palavras dos autores), sem ablação e sem análise de deriva no tempo. O k = 0,05 foi escolhido sem ajuste. |

### 3.2 Calibração

**Ordem dos alvos.** Não há estudo publicado que meça o viés de deriva da cabeça correlacionada com a ordem. A prática das ferramentas é sortear: o Titta sorteia por padrão ([Niehorster et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7575480/)), o PsychoPy usa `randomisePos=True` ([código](https://github.com/psychopy/psychopy/blob/release/psychopy/experiment/routines/eyetracker_calibrate/__init__.py)) e o EyeLink tem a opção ([manual](https://natmeg.se/onewebmedia/EL1000_UserManual_1.52.pdf)). Em planejamento de experimentos, escolher a ordem de execução para que os efeitos fiquem ortogonais à tendência linear com poucas trocas é um problema estudado ([Hilow 2014](https://ideas.repec.org/a/taf/japsta/v41y2014i4p802-816.html)).

Numa busca exaustiva **[conta]**, uma ordem começando no centro chega a r(t,x) = +0,06, r(t,y) = −0,03 e termos de 2ª ordem ≤ 0,14 em cinco geometrias de tela, com caminho 11% mais curto e maior salto de 33°. Num modelo de brinquedo com 200 px de deriva residual, o erro RMS vertical cai de 54 px (leitura) para 8,5 px **[simulação]**. Decorrelacionar não remove a deriva: ela deixa de ser ganho e vira ruído (LOO maior).

**Agregação robusta.** A mediana tem eficiência 2/π ≈ 0,64 sob normalidade e breakdown de 50%. O 1,4826 é 1/Φ⁻¹(0,75), a constante que torna o MAD consistente para σ ([Leys et al. 2013](https://doi.org/10.1016/j.jesp.2013.03.013), citando Rousseeuw & Croux 1993). Leys recomenda corte em 2,5 e chama 3 de "muito conservador". Com 7 features testadas por quadro, o corte em 2,5 marcaria por acaso 8,4% dos quadros bons, e o de 3, 1,9% **[conta]**.

**Huber com ridge.** k = 1,345 dá 95% de eficiência sob normalidade ([MATLAB robustfit](https://www.mathworks.com/help/stats/robustfit.html); [MASS rlm](https://github.com/cran/MASS/blob/master/R/rlm.R); [statsmodels](https://github.com/statsmodels/statsmodels/blob/main/statsmodels/robust/norms.py)). O resíduo deve ser estudentizado pela alavanca, r/(k·s·√(1−h)), senão cantos com alta alavanca escapam. A escala re-estimada a cada iteração não converge em 20% dos casos com 13 alvos; fixa por rodada, converge sempre (mediana de 7 iterações) **[simulação]**.

**Identidade útil [conta, verificada numericamente].** O Ridge por quadros com λ·m·Σ_W é idêntico a um Ridge em 13 linhas (médias por alvo) com penalidade λ·m·P + S_W, mais o termo s_zy = Σ w(φ − φ̄)(y − ȳ) quando os rótulos variam dentro do alvo (compensação de pose). Isso permite trocar a média do alvo por um centro robusto, pôr um peso de Huber por alvo e fazer o LOO por alvo sem mudar o significado de λ.

**LOO e λ.** O LOO fechado vale para ridge ponderado com pesos e penalidade fixos, por amostra (e_i/(1−h_ii)) e por alvo ((I − H_GG)⁻¹r_G) ([An, Liu & Venkatesh 2007](https://doi.org/10.1016/j.patcog.2006.12.015); **[conta]**). Congelar os pesos do IRLS é a aproximação de um passo ([Rad & Maleki 2020](https://doi.org/10.1111/rssb.12374)). O critério de CV quadrático é sensível a outliers; um critério robusto é defendido por [Ronchetti, Field & Blanchard 1997](https://archive-ouverte.unige.ch/unige:23222).

**Grau e número de pontos.** Acima do 2º grau o ganho é quase nulo (Cerrolaza, via [Blignaut 2014](https://doi.org/10.16910/jemr.7.1.4)). Em rastreador IR, 9 → 14 → 23 pontos deram 0,87° → 0,58° → 0,53°, e com 9 pontos a faixa de baixo da tela fica ruim ([Blignaut 2014](https://www.mdpi.com/1995-8692/7/1/4/xml)). A borda de baixo é a pior também em [Feit et al. 2017](https://doi.org/10.1145/3025453.3025599) e com câmera em cima, porque "the eyes tend to appear partially closed when participants look down" ([Valliappan et al. 2020](https://doi.org/10.1038/s41467-020-18360-5)).

**Tempo por ponto.** A literatura descarta 0,5–0,7 s depois que o alvo chega: Tobii "rests for about 0.5 seconds" ([docs](https://developer.tobiipro.com/commonconcepts/calibration.html)); Krafka et al. começam a gravar 0,5 s depois ([CVPR 2016](https://openaccess.thecvf.com/content_cvpr_2016/papers/Krafka_Eye_Tracking_for_CVPR_2016_paper.pdf)); [Harezlak et al. 2014](https://doi.org/10.1016/j.procs.2014.08.194) descartam 600–700 ms. Para ELA, ≥ 800 ms (§4).

**Refazer ponto × regressão robusta.** Huber tem breakdown de 1/n contra pontos de alta alavanca, que são justamente os cantos. Rebaixar um canto devolve a região à extrapolação. A Tobii documenta repetir os pontos ruins ([docs](https://developer.tobiipro.com/commonconcepts/calibration.html)). A robusta detecta e amortece; refazer repõe a cobertura.

**Webcam, erros típicos.** WebGazer 4,17° ([IJCAI 2016](https://www.ijcai.org/Proceedings/16/Papers/540.pdf)); Labvanced 1,45° com 5 min e 7 poses ([Kaduk et al. 2024](https://doi.org/10.3758/s13428-023-02237-8)); FAZE 3,18° com 3 amostras ([NVIDIA](https://research.nvidia.com/publication/2019-10_few-shot-adaptive-gaze-estimation)).

### 3.3 Cabeça, pose, kappa e geometria

**Normalização.** O olhar se leva ao referencial normalizado só por rotação: g_n = R·g_r; escalar mudaria a direção ([Zhang, Sugano & Bulling, ETRA 2018](https://www.collaborative-ai.org/publications/zhang18_etra.pdf)). Contra nenhuma normalização, o erro caiu 9,5–32,7% na tabela do artigo.

**Matriz facial do MediaPipe.** Espaço de mão direita, câmera olhando para −Z, unidades em cm ([face_mesh.md](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md)). A pose sai de um Procrustes ponderado **com escala** ([procrustes_solver.cc](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/libs/procrustes_solver.cc)), então é preciso normalizar a escala antes de usar R. O FOV vertical da câmera virtual é fixo em 63° ([face_geometry_from_landmarks_graph.cc](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_geometry/face_geometry_from_landmarks_graph.cc#L76-L98)) e a API web não deixa mudar. Com uma C920 (43,3° na vertical, [Logitech](https://www.logitech.com/en-us/shop/p/c920s-pro-hd-webcam)), a distância da matriz sai ×0,65–0,67, t_x e t_y ficam certos e os ângulos perdem ~3% de ganho **[simulação]**. O IrisFlow não usa a translação da matriz.

**Suavização interna do FaceLandmarker.** Em modo VIDEO com `numFaces = 1`, os landmarks passam por um One Euro com min_cutoff 0,05, beta 80 e derivate_cutoff 1 ([face_landmarks_detector_graph.cc](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_landmarks_detector_graph.cc#L185-L196); condição em [face_landmarker_graph.cc](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_landmarker_graph.cc)). O mesmo fluxo alimenta a matriz facial. O modo IMAGE desliga a suavização, ao custo de rodar o detector a cada quadro. O filtro não cria viés estático, mas deixa "pegajosas" por 0,5–2 s as correções finas de 1–2° quando o landmark é pouco ruidoso **[simulação]**.

**Kappa.** 5,46 ± 1,33° em 800 olhos de 410 pessoas, Orbscan II, magnitude sem separar H e V ([Hashemi et al. 2010](https://doi.org/10.3928/1081597X-20100114-06), lido numa cópia do artigo; a editora deu 403). A fóvea fica "about 1.5° below" do eixo óptico, então o eixo visual fica ~1,5° acima ([Guestrin & Eizenman 2006](https://ieeexplore.ieee.org/document/1634506/)). Em relação ao eixo óptico, o eixo visual fica deslocado para o lado nasal e para cima ([Aguirre, bioRxiv 325548](https://www.biorxiv.org/content/10.1101/325548v1.full)). A 60 cm, 5,46° são ~211 px e a dispersão entre pessoas é ~51 px **[conta]**.

**Modelos 3D por webcam.** 3,5° com Logitech C310 a 45–65 cm e 5 pontos online ([Wang & Ji, ICCV 2017](https://openaccess.thecvf.com/content_ICCV_2017/papers/Wang_Real_Time_Eye_ICCV_2017_paper.pdf)); 6,88° sem calibração num tablet ([EyeTab, ETRA 2014](https://www.collaborative-ai.org/publications/wood14_etra.pdf)). O ganho esperado da geometria é robustez a movimento de cabeça, não acurácia parada. Girar a cabeça ±30° em yaw e ±25° em pitch elevou o erro de webcam de 3,3° para 5,1° ([Falch & Lohan 2024](https://doi.org/10.3389/frobt.2024.1369566)). A inclinação da câmera pode ser estimada junto com a calibração ([Gudi, Li & van Gemert 2020](https://arxiv.org/abs/2009.01270)).

**Validade de d·tan(Δ).** O deslocamento exato é d·[tan(θ₀+Δ) − tan θ₀], não d·tan Δ. Para a deriva de 3,92° medida numa calibração, faltam ~40 px na linha de baixo **[conta]**. A compensação de distância escala em torno do centro da tela, mas o ponto fixo físico é o pé da perpendicular do olho: erro de ~27 px para cada 5% de variação da distância **[conta]**. As duas aproximações só se resolvem com a posição do olho, o que fica no caminho 6DoF (M12).

### 3.4 Filtros de precisão

**Estado primeiro, média depois.** No único estudo que compara 13 filtros de olhar frente a frente, a família que detecta o estado e faz média na fixação (AWoo) teve o menor atraso, e o Kalman ficou com os piores valores de proximidade e suavidade ([Špakov, ETRA 2012](https://homepages.tuni.fi/oleg.spakov/publications/Spakov_ETRA_12.pdf)). [Kumar et al. 2008](https://graphics.stanford.edu/~klingner/publications/GazeInputAccuracy.pdf) medem o deslocamento contra a estimativa da fixação e usam 1 amostra de antecipação para rejeitar saltos que voltam, com média de 400–500 ms. [Feit et al. 2017](https://www.microsoft.com/en-us/research/wp-content/uploads/2017/01/everyday_eyetracking-1.pdf) mediram precisão 45–47% melhor e alvo até 42% menor com média ponderada + sacada + correção de pico, **contra o dado bruto** (não contra o One Euro), com janela ótima de 36–40 quadros a 60 Hz. Sobre o One Euro, o ajuste "not enough for the filter to react to the sudden and large signal jumps".

**Portão.** Para 2 graus de liberdade, χ²₂(P) = −2·ln(1−P): 9,21 a 99% e 13,82 a 99,9% **[conta]**. Três cuidados ao usar a covariância da calibração: o STD da janela subestima σ com ruído correlacionado (fator 0,899 com ρ₁ = 0,80 e 42 amostras); a covariância reestimada só com amostras aceitas encolhe ([Or 2025](https://arxiv.org/abs/2512.18508)); e o ruído é heterocedástico (35–116 px por ponto no relatório de 28/09) **[conta]**. A escala robusta pela mediana de [Engbert & Kliegl 2003](https://doi.org/10.1016/S0042-6989(03)00084-1) é a mais transplantável para 30 Hz em tempo real.

**"Vertical maior" não vale para webcam.** Num rastreador por webcam, RMS-S2S foi maior em x (1,66°) do que em y (1,42°) ([Kaduk et al. 2024](https://doi.org/10.3758/s13428-023-02237-8)); no relatório de 28/09, sdX 40,9 > sdY 38,4 px. Estime a Σ 2×2 completa.

**Janela.** Média de N amostras com autocorrelação ρ_k: Var(x̄) = (σ²/N)·[1 + 2·Σ(1 − k/N)ρ_k]. Com ρ₁ = 0,80 a 30 Hz, 200/600/1000 ms reduzem o desvio em 17,5/38,5/49,4%, não em √N **[conta]**. Hoje a janela é de 200 ms.

**Detecção de fixação com ruído alto.** O I-DT de [Salvucci & Goldberg 2000](https://www.cs.drexel.edu/~salvucci/publications/Salvucci-ETRA00.pdf) usa 0,5–1°; com o ruído atual a dispersão de 6 amostras tem mediana de 3,3° **[simulação]**, então limiares fixos não servem. O I2MC aguenta até ~2° de RMS, mas é offline ([Hessels et al. 2017](https://doi.org/10.3758/s13428-016-0822-1)). O limiar adaptativo de [Nyström & Holmqvist 2010](https://doi.org/10.3758/BRM.42.1.188) foi desenhado para ≥ 500 Hz.

**Fusão binocular.** Pesos de variância mínima para duas estimativas correlacionadas: w₁ = (σ₂² − ρσ₁σ₂)/(σ₁² + σ₂² − 2ρσ₁σ₂) ([Bates & Granger 1969](https://doi.org/10.1057/jors.1969.103), fórmula via [Lee](https://faculty.ucr.edu/~taelee/paper/chapter7.pdf); forma geral em [Capistrán & Timmermann](https://rady.ucsd.edu/_files/faculty-research/timmermann/Capistran_Timmermann_June29_2007.pdf)). Pesos estimados costumam perder da média simples por erro de estimação ([Frazier et al. 2023](https://www.monash.edu/business/ebs/research/publications/ebs/2023/wp18-2023.pdf)), por isso limitar a [0, 1] e encolher para ½. No IrisFlow a correlação é estrutural: o bloco L2CS é idêntico nos dois olhos. Com ρ = 0,8 e σ iguais, a média dá 0,95 do desvio de um olho **[conta]**: a fusão serve mais para robustez (um olho fechando) do que para precisão.

**Medir o atraso e o dwell.** Atraso no estilo de Feit: emendar uma fixação real com outra deslocada de um passo de tecla e contar os quadros até cruzar a borda. Tamanho de alvo de Feit: S = 2(O + 2σ) por eixo, 95% das amostras. Para permanência contínua não há fórmula publicada; a métrica S₉₅(T) proposta aqui (§5, M11) é o lado mínimo que contém 95% das janelas de T ms do cursor. Com o ruído atual, S₉₅ no sinal cru passa de 205 px (T = 0) para 294 px (T = 1 s) **[simulação]**.

### 3.5 Recalibração pelo uso

**Kalman × integrador.** O integrador `offset += k·resíduo` é um Kalman de regime com q/r = k²/(1 − k); para k = 0,05, q/r = 0,00263, meia-vida de 13,5 rótulos **[conta]** (equivalência de Muth 1960, [doi](https://doi.org/10.1080/01621459.1960.10482064), não confirmado na fonte primária). Isso supõe um deslocamento quase parado, menor que o que o projeto mediu (virada de 190 px em 10 min). Com decaimento, o modelo certo é o Ornstein–Uhlenbeck discretizado: φ = 2^(−Δt/T½), x̂ ← φx̂, P ← φ²P + σ∞²(1 − φ²). Depois de uma pausa longa, P volta a σ∞² e o próximo rótulo entra com ganho alto.

**Quanto dura uma correção.** Uma correção afim "remains effective for approximately ten minutes" e a translação faz a maior parte ([Padikal et al. 2025](https://doi.org/10.3390/vision9020029)). Em webcam, o erro subiu 20% (WebEyeTrack) e 49% (WebGazer) em 20 min ([arXiv 2508.19544](https://arxiv.org/abs/2508.19544), preprint).

**Malha aberta e janela.** O EyeO aprende com o olhar **bruto**, média de 64 quadros, zona de 150 px e corte em 200 px, e aprende durante a **leitura**, não durante a digitação, porque ao digitar a pessoa compensa o erro ([arXiv 2307.15039](https://arxiv.org/pdf/2307.15039v2)); 14 de 19 preferiram. No PACE, o pico de alinhamento entre olhar e interação vem **antes** do evento (−0,01 a −0,43 s) e, em alvo grande, o olhar se espalha pelo botão ([PDF](https://ira.lib.polyu.edu.hk/bitstream/10397/64378/1/Huang_Building_Personalized_Auto-Calibrating.pdf)). WebGazer pesa clique com 1 e cursor com 0,5 ([IJCAI 2016](https://www.ijcai.org/Proceedings/16/Papers/540.pdf)).

**O portão de meia tecla não protege um rótulo de dwell [conta].** O dwell só conclui com o cursor dentro do botão, então |resíduo| ≤ W/2 ≤ passo/2 sempre. O travamento no vizinho vem de rótulos **errados**, que têm resíduo pequeno: cada seleção errada aplica d ← (1−k)d + k·p, com ponto fixo d = p. Na simulação 1D, o portão de meio passo recusou zero rótulos, e o que evitou o travamento foi descartar as seleções desfeitas. Zhang & Hornof alertam que o deslocamento "could shift all fixations to adjacent objects" em grades, mas não dão limiar ([BRM 2011](https://doi.org/10.3758/s13428-011-0073-0)).

**Afim e esquecimento.** RLS com esquecimento constante faz a covariância explodir nas direções sem excitação ([Fortescue et al. 1981](https://doi.org/10.1016/0005-1098(81)90070-4); [Goel, Bruce & Bernstein 2020](https://arxiv.org/abs/2003.03523)). O esquecimento em forma aditiva (Q do OU) cresce de forma limitada.

**Persistência.** Em Zhang & Hornof, as medianas verticais variaram de −1° a −2° entre sessões; em Padikal a correção vale ~10 min. O estado da correção não deve atravessar sessões.

---

## 4. ELA: o que muda para o produto

Esta seção orienta engenharia de produto. Não é orientação clínica.

### 4.1 O que se sabe

- **Movimentos oculares.** SWJ em 22–53% dos pacientes, 68% com envolvimento bulbar ([Guo 2022](https://doi.org/10.3390/brainsci12040489); [Kang 2018](https://doi.org/10.3988/jcn.2018.14.4.464)). Intrusões maiores, não mais frequentes: mediana 0,64–0,70° contra 0,43–0,47°, ~0,4/s por direção, e a volta de uma SWJ leva mediana de 305 ms e média de 378 ms ([Becker 2019](https://doi.org/10.16910/jemr.12.6.8)). Hipometria em 10–34%. Latência aumentada na ELA inicial e no locked-in incompleto, mais no eixo vertical ([Hermann 2023](https://doi.org/10.1007/s00415-023-11957-y)).
- **Piscadas.** 0,25/s na ELA contra 0,13/s nos controles ([Becker 2019](https://doi.org/10.16910/jemr.12.6.8)). Se a piscada zerasse o dwell, um dwell de 1 s teria 22% de chance de ser interrompido **[conta, Poisson]**.
- **Estágio avançado.** O olhar vertical cai antes do horizontal, depois vem a oftalmoplegia ([Hayashi 2016](https://doi.org/10.1186/s40478-016-0379-3)).
- **Ptose e olho seco.** Ptose não é típica da ELA ([Pinto & de Carvalho 2008](https://doi.org/10.1016/j.clineuro.2007.08.022)), mas 16,2% dos usuários de rastreador relatam o início dela e 8,8% relatam nistagmo ([Conte 2021](https://www.mdpi.com/2532-7518/5/1/11)). Visão borrada e ardor em mais de 1/3 dos pacientes ([Cozza 2021](https://doi.org/10.3988/jcn.2021.17.1.96)). "tears confuse eyegaze technology" ([Kane 2017](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/10/aacselfexpression-1.pdf)).
- **Medicamentos.** Sonolência com baclofeno (10–63%, [bula](https://www.accessdata.fda.gov/drugsatfda_docs/label/2019/208193s000lbl.pdf)), tizanidina (48%, [bula](https://www.accessdata.fda.gov/drugsatfda_docs/label/2006/020397s021,021447s002lbl.pdf)) e clonazepam (37%, [bula](https://www.accessdata.fda.gov/drugsatfda_docs/label/2017/017533s059lbl.pdf)); midríase em 4% com escopolamina ([bula](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/017874s053lbl.pdf)); miose com morfina ([bula](https://www.accessdata.fda.gov/drugsatfda_docs/label/2021/022207s010lbl.pdf)). Lorazepam 1 mg reduziu a velocidade de pico e aumentou a latência ([Baumert 2024](https://doi.org/10.1007/s00213-024-06672-z)). O produto deve se adaptar rápido sem pedir dado de saúde.
- **Uso real.** 36,8% usam 2–5 h/dia e 29,4%, 5–10 h/dia; 36,8% usam na cama; queixas mais comuns: fadiga ocular (41%) e necessidade de recalibrar o tempo todo (34%) ([Conte 2021](https://www.mdpi.com/2532-7518/5/1/11)). "Tobii is tiring… I'm good for maybe 2 hours" ([Kane 2017](https://doi.org/10.1145/2998181.2998284)).
- **Câmera em cima.** A borda de baixo é a pior, porque a pálpebra cobre o olho ao olhar para baixo; é por isso que a Tobii monta o sensor embaixo ([Tobii](https://help.tobii.com/hc/en-us/articles/210252245-Mounting-guide); [Valliappan 2020](https://doi.org/10.1038/s41467-020-18360-5)). Com ptose, subir o aparelho levanta a pálpebra ([Tobii Dynavox](https://www.tobiidynavox.com/blogs/support-articles/how-can-i-position-the-device-to-get-a-better-calibration)).
- **Luz.** Pouca luz simulada levou o erro de 5,76° para 9,7–10,6° ([Kim & Jeong 2020](https://doi.org/10.3390/s20174935)); luz lateral dobrou o erro da frontal ([Yüksel 2023](https://doi.org/10.3390/jtaer18040105)). Não há limiar em lux publicado para webcam.

### 4.2 Requisitos

| # | Requisito | Número | Fonte |
|---|---|---|---|
| E1 | Dwell que pausa sem zerar quando o olhar sai por pouco tempo | memória ≥ 400 ms | volta da SWJ: 305/378 ms ([Becker 2019](https://doi.org/10.16910/jemr.12.6.8)); "dwell memory time" do [Mind Express](https://forbesaac.zendesk.com/hc/en-us/articles/36273943487117-How-do-I-change-the-dwell-time-and-other-eye-gaze-selection-settings-within-Mind-Express) |
| E2 | Área de acerto um pouco maior depois que o dwell começa | +1° por lado, sem invadir o vizinho | intrusões de 0,6–0,85° ([Becker 2019](https://doi.org/10.16910/jemr.12.6.8); [2023](https://doi.org/10.1007/s00221-023-06633-6)) — **proposta** |
| E3 | Piscada congela o cursor e pausa o dwell, sem zerar; perda curta de rosto também | fechamentos ≤ 500 ms | piscadas de 150–400 ms ([Nyström 2024](https://doi.org/10.3758/s13428-023-02333-9)) |
| E4 | Tamanho mínimo de botão pela acurácia medida do próprio usuário | S = 2(O + 2σ) por eixo + 0,2° de deriva | [Feit 2017](https://doi.org/10.1145/3025453.3025599); deriva de +0,2° ([Nyström 2013](https://doi.org/10.3758/s13428-012-0247-4)) |
| E5 | Dwell em cascata no teclado | piso −10% por letra, volta no espaço, espaço a 2/3 | [Mott 2017](https://faculty.washington.edu/wobbrock/pubs/chi-17.02.pdf) |
| E6 | Assentamento na calibração para sacadas lentas | ≥ 800 ms depois da chegada do alvo | latência de 312,5 ± 62,7 ms acima de 65 anos ([Noiret 2017](https://doi.org/10.1080/13825585.2016.1237613)) + volta de SWJ **[conta]** |
| E7 | Correção rápida com poucos pontos, sem refazer tudo | ≤ 15 s, 1–5 pontos | Tobii Dynavox 1/2/5/9 pontos e "melhorar ponto" ([manual](https://download.mytobiidynavox.com/I-Series/documents/I-Series_User_manual/I-13%20and%20I-16/Tobii%20Dynavox%20I-Series%20I-13_I-16%20Users%20Manual_v1-0-2_en-US.pdf)); afim vale ~10 min ([Padikal 2025](https://doi.org/10.3390/vision9020029)) |
| E8 | Ações críticas fora da borda de baixo; sim/não horizontal no estágio avançado | — | [Feit 2017](https://doi.org/10.1145/3025453.3025599); [Hayashi 2016](https://doi.org/10.1186/s40478-016-0379-3) |
| E9 | Pergunta sobre onde fica a câmera e conselho de posição | topo, base, notebook | [Tobii](https://help.tobii.com/hc/en-us/articles/210252245-Mounting-guide) |
| E10 | Adaptação sem dado clínico: perfis de dwell e tamanho trocáveis | — | sedação por medicamento (bulas FDA) |
| E11 | Calibração curta | teto de ~40 s | fadiga em 41% ([Conte 2021](https://www.mdpi.com/2532-7518/5/1/11)) |

---

## 5. Tabela de decisão

Cada mudança de matemática ou de comportamento tem uma flag em `src/config/experiment.ts` (M11, o relatório, é a exceção). Ligada por padrão; desligada, o comportamento é idêntico ao de antes. O interruptor `?pipeline=base` desliga todas de uma vez; `?pipeline=v3` deixa cada uma no seu valor — inclusive um `?exp.<flag>` gravado antes, que só sai com `__irisflowExp.reset()`. Cinco flags ficam fora do interruptor e desligadas por padrão: `saida6DoF` e `nivelarRecorteCorrigido`, desde o planejamento, e três desligadas depois de implementadas — `referencialIsotropico` (M2) e `fusaoPorCovariancia` (M10), que pioraram o replay da gravação de 23/09, e `alvoInferiorCentral` (M7), que na simulação de um olho que satura embaixo como o real troca erro de lugar (`docs/RELATORIO_DE_ALTERACOES.md`, Fases 5 e 7). `pipeline=v3` não liga nenhuma das cinco; `?exp.<flag>=1` liga uma de cada vez, para a medição.

| # | Mudança | Evidência | Efeito esperado | Risco | Flag | Como medir |
|---|---|---|---|---|---|---|
| M1 | Ordem dos alvos calculada por busca determinística: começa no centro, \|r(t,x)\| e \|r(t,y)\| ≤ 0,10, caminho mais curto que a leitura | deriva monotônica em 8/9 sessões; r(t,y) = 0,95 hoje; sorteio é o padrão (Titta, PsychoPy); ordens livres de tendência (Hilow 2014); 54 → 8,5 px **[simulação]** | a deriva postural deixa de virar ganho e viés vertical | saltos até ~33° (hoje 45°) | `ordemDescorrelacionada` | trendR, viés vertical e ganho Y do afim, com réplica |
| M2 | Referencial da cabeça em px isotrópicos | vazamento 1,87° → 0,05° com roll de 5° **[simulação]** | menos acoplamento entre eixos e com o roll | invalida perfis (recalibrar uma vez); no replay de 23/09 piorou de 64 para 115 px (13 alvos) | `referencialIsotropico` (desligada, fora do interruptor) | shearYX do afim; sessão com cabeça inclinada |
| M3 | Sinal do yaw na contra-rotação do roll | código do L2CS, Gaze360, gravação de 23/09 | com 8° de roll, some o erro de 4,1° no pitch | baixo | `desrolarComSinalDoL2cs` | sessão com cabeça inclinada ±10° |
| M4 | L2CS girado para o referencial da cabeça (raio → câmera → cabeça, Rᵀ da matriz suavizada) | relatório de 27/09 §2; convenções do L2CS/Gaze360; F4 | um referencial só; a compensação de pose deixa de contar duas vezes; rótulos coerentes; o ruído de R cancela em 1ª ordem entre feature e compensação | herda o erro de pose do MediaPipe (~3% de ganho, ~0,1°/° com o FOV de 63°) e perde a invariância natural do L2CS | `l2csNaCabeca` | teste de sinais; replay: viés × Δpose; sessão com Δpose |
| M5 | Pose da matriz facial suavizada com rampa contínua (One Euro em graus) na compensação e na rotação do L2CS | tremor de pitch entra a 38,5 px/° (F5) | menos tremor vertical vindo da pose | atraso numa virada rápida, limitado pelo β | `poseSuavizada` | STD e RMS-S2S; atraso numa virada |
| M6 | Calibração robusta: peso por quadro com rampa em 3·1,4826·MAD por feature, centro robusto por alvo, Huber entre alvos estudentizado pela alavanca, λ por LOTO com perda de Huber, Σ_W sem os quadros descartados; novo diagnóstico de alvos no lugar de `detectOutlierPoints` | Leys 2013; k = 1,345 (MASS, statsmodels, MATLAB); identidade de 13 linhas; Ronchetti 1997 | piscada e intrusão não puxam o alvo; LOO e pior alvo menores | descartar demais com nistagmo (a fração vai para o diagnóstico) | `calibracaoRobusta` | replay: LOO e pior alvo; fração descartada |
| M7 | 14º alvo no meio da borda de baixo (0,5; 0,95), só no perfil padrão completo | 9 → 14 pontos: 0,87° → 0,58°, faixa de baixo ruim com 9 (Blignaut 2014); borda de baixo pior (Feit, Valliappan); cantos de baixo em −77/−100 px no relatório de 28/09 | borda de baixo melhor sem perder pontos | pálpebra ao olhar para baixo: no olho sintético que satura como o real, a faixa de baixo melhorou (111 → 48 px) e a linha de baixo da grade piorou (23 → 71 px) | `alvoInferiorCentral` (desligada, fora do interruptor) | meanErrorEdge; erro da faixa de baixo e da linha de baixo da grade |
| M8 | Assentamento de 800 ms contado da chegada da bola (hoje 1180 ms) | Tobii 0,5 s; Krafka 0,5 s; Harezlak 0,6–0,7 s; ELA ≥ 800 ms (E6) | coleta útil ~380 ms mais cedo por alvo; com M7, paga o 14º alvo dentro do mesmo tempo | latência prolongada em parte dos pacientes; o fechamento por estabilidade continua | `assentamentoPelaChegada` | curva de erro × tempo desde a chegada |
| M9 | Estimador de fixação no lugar de One Euro + estabilizador: média com núcleo triangular crescente até 600 ms (até 1 s se ρ₁ > 0,8), portão de Mahalanobis com Σ da calibração por região (corrigida pela janela, escala robusta), 1 amostra de antecipação, pesos em rampa em unidades de σ, escala da Σ que acompanha a sessão (mediana dos d², presa em [1, 4]), entrada = saída crua do `mapGaze` | Kumar 2008; Feit 2017; Špakov 2012; χ²; com σ = 40 px e ρ₁ = 0,8 a 30 Hz, o cursor parado fica com 0,65 do desvio da entrada (25 px) e o lado que segura 95 % cai de 177 para 119 px **[simulação, mediana de 20 sementes]** | cursor muito mais parado na fixação; alvo menor para o dwell | sacadas grandes (> ~4,5σ) chegam em 67 ms; as de 2 a 4,3σ — como entre teclas vizinhas com σ de 40 px — levam ~200 ms até a metade e ~430 ms até 90 %: um salto de latência no meio da faixa, que a sessão de ablação mede | `estimadorDeFixacao` | STD, RMS-S2S, lado95 filtrado, atraso do filtro, sacadas falsas por minuto |
| M10 | Fusão binocular por variância mínima com a covariância dos resíduos LOO de cada olho; o peso é encolhido para ½ pela incerteza do jackknife e nenhum olho pesa menos de 5 %; o EAR infla a variância do olho | Bates & Granger 1969; Frazier 2023; bloco L2CS idêntico nos dois olhos | robustez com um olho fechando; peso certo para o olho pior | ganho pequeno com ρ alto; no replay de 23/09 o LOO caiu e o teste piorou (67 → 91 px com 9 alvos) — os pesos saem dos mesmos resíduos LOO que depois os avaliam, então o LOO é otimista por construção | `fusaoPorCovariancia` (desligada, fora do interruptor) | precisão binocular × por olho; olho semicerrado |
| M11 | Relatório /3: mediana, p95, fração ≤ 1° e ≤ 2°, razão S2S/STD e ρ₁, N_eff, atraso do filtro, S₉₅(T) no sinal filtrado, campos de diagnóstico do viés | Niehorster 2020; Feit 2017 | decidir com as métricas certas | nenhum; relatórios /2 continuam legíveis | sem flag (medição) | — |
| M12 | Saída 6DoF: pergunta da câmera; reprojeção da predição do Ridge pela interseção raio–plano com olho e rotação de referência (g_h = R₀ᵀ(T − e₀)/‖T − e₀‖), no treino (alvos levados à postura de referência) e na inferência; idêntica ao clássico em Δ = 0 por construção; kappa absorvido (g_h já é o eixo visual) | relatório de 27/09 §6; Wang & Ji 2017; Hashemi 2010; Guestrin 2006; Falch & Lohan 2024 | robustez a mudança de postura: reclinar 10 cm + 5,7° pede 400–590 px de correção, que a geometria faz exata; lente 3 cm fora do lugar ou câmera 5° inclinada erram ≤ 27 px dela **[simulação]** | não melhora a acurácia parada; depende da distância pela régua cantal | `saida6DoF` (desligada, fora do interruptor) | M-deslocamento: calibrar sentado, medir reclinado |
| M13 | Sinal do roll passado ao recorte do L2CS (F1) | verificado com o código e com a gravação | a rede vê o rosto nivelado, como o recorte pretendia | muda a imagem que a rede vê — a regra do projeto é não mexer no L2CS; decisão do responsável | `nivelarRecorteCorrigido` (desligada, fora do interruptor) | sessão com cabeça inclinada ~15° |
| M14 | Opção de rodar o FaceLandmarker em modo IMAGE, sem o One Euro interno | código do MediaPipe | medir quanto do ruído chega pré-filtrado | detector a cada quadro | `suavizacaoDoLandmarker` (padrão = hoje) | razão S2S/STD, atraso de saltos de 1–2°, ms por quadro |
| M15 | Correção por dwell como Kalman OU por eixo em px (T½ = 10 min, σ∞ = 60 px), R pelo tamanho do botão e pela dispersão, medida em malha aberta na janela estável, K ≤ 0,5, forma de Joseph, teste χ², injeção por mudança de postura, quarentena de desfazer de 4 s, isolamento medido na tela, aplicação em rampa, estado não persistido | §3.5; Padikal 2025; EyeO; PACE | segue a deriva sem travar no vizinho | rótulo errado em grade densa (o teclado segue fora do aprendizado) | `correcaoPorDwellKalman` | sessão de 30 min; NIS; erro um passo à frente |
| M16 | Afim (ganho) na correção por dwell, com prior e só com excitação | Padikal 2025 (translação domina); Goel 2020 | corrige ganho quando os rótulos cobrem o eixo | pouca excitação; por isso começa congelado | `correcaoPorDwellAfim` | inclinação do resíduo × posição |
| M17 | Dwell em cascata no teclado | Mott 2017 | mais velocidade e menos erro corrigido | depende do preditor | `dwellEmCascata` | ppm e desfazer por sessão |
| M18 | Alvo mínimo pela acurácia medida | Feit 2017; Nyström 2013 | botões do tamanho que aquela pessoa acerta | telas com menos botões | `alvoMinimoMedido` | taxa de erro de seleção |
| M19 | Tolerância a intrusões: memória de dwell de 400 ms e área de acerto +1° depois que o dwell começa | Becker 2019; Mind Express | menos dwells perdidos por SWJ | seleção do vizinho se o espaço for curto (a folga não invade) | `toleranciaIntrusoes` | dwells cancelados por excursão < 500 ms |
| M20 | Correção rápida afim com 5 pontos, sem retreinar | Tobii Dynavox; Padikal 2025 | recalibrar em ≤ 15 s | afim com poucos pontos | `recalibracaoRapidaAfim` | O antes e depois da correção |
| M21 | Perda curta de rosto pausa o dwell em vez de zerar | F9; E3 | piscada mal classificada não apaga o progresso | nenhum relevante | `pausaNaPerdaCurta` | dwells interrompidos por perda |

O que cada flag faz no código, e como desligá-la, está na tabela do README. O roteiro das medições que decidem cada uma está em `docs/ROTEIRO_DE_MEDICAO.md`.

---

## 6. O que ficou de fora

- **Ramo ocular (UnityEyes 2, EyeNet).** Fora do escopo desta versão; o vetor continua aceitando o bloco ocular.
- **Rede, pesos, recorte, decodificação e cadência do L2CS.** Não mudam. O erro de sinal do recorte (F1) ficou atrás de uma flag desligada, porque corrigir muda a imagem que a rede vê.
- **Compensação de distância no pé do olho e d·tanΔ exato no caminho padrão.** Precisam da posição do olho em relação à tela; entram só no caminho 6DoF.
- **Kappa por olho com prior populacional e inclinação da câmera estimada com prior (6DoF).** Na reprojeção implementada, a direção no referencial da cabeça sai de pontos da tela e já é o eixo VISUAL: o kappa fica absorvido pelo Ridge, olho a olho, como no caminho clássico, e o estimador MAP com o prior (5,46 ± 1,33° na horizontal, ~1,5° na vertical) só tem objeto quando entra uma estimativa do eixo ÓPTICO — o ramo ocular, fora desta versão. A inclinação da câmera não é identificável com a calibração feita numa postura só e entra em segunda ordem na reprojeção (5° de erro custam ≤ 27 px numa correção de 400–590 px, **[simulação]** em `geometria6dof.test.ts`); fica fixa em zero até a sessão M-deslocamento dizer que precisa.
- **Alimentar a correção dos cantos com os dwells.** Os rótulos de dwell se concentram em poucos botões isolados, quase sempre na borda; empurrar o processo gaussiano dos cantos com eles criaria distorção local. A correção por dwell continua global.
- **I2MC e o limiar de Nyström & Holmqvist.** O primeiro é offline e o segundo pede ≥ 500 Hz.
- **Limiar de luz em lux.** Não há número publicado; fica para medir.
