# Roteiro de medição do V3

As mudanças do pipeline V3 (M1–M22, README → *Pipeline V3*) foram decididas com
literatura, simulação e o replay de uma gravação. Nenhuma foi medida com uma
pessoa. Este roteiro diz, sessão por sessão, o que medir para decidir cada flag
— e, desde 19/10/2026, também o que conferir nas mudanças de robustez de
18–19/10 (roll do recorte, estímulo novo, contraluz, perda do modelo, pouca luz,
desempenho), que não têm flag mas têm limiares e comportamentos a confirmar.
O protocolo do teste de precisão, a bancada e a leitura do relatório continuam
os de [`MEDICOES.md`](MEDICOES.md); aqui entra só o que o V3 acrescenta.

| sessão | decide | tempo aproximado |
|---|---|---|
| 1. V3 contra o pipeline anterior | se o V3 fica como padrão | 45 min |
| 2. Ablação | quais flags pagam o que custam (M1, M3–M6, M8, M9) | 60 min, ou replay |
| 3. Deslocamento (6DoF) | M12 | 40 min |
| 4. Condições de ELA | M2, M3, M7, M10, M13; luz e óculos | 30 min por condição |
| 5. 30 min de uso | M15, M16 | 40 min |
| 6. Sessão longa | M17–M21, deriva e fadiga | 2 h |
| 7. Ramo ocular | se a EyeNet substitui a L2CS-Net do rosto (`eyeNet` com `ep=off`); **refazer** as rodadas de antes de 19/10/2026 | 70 min |
| 8. Roll do recorte (A1) | o padrão de `normalizarRollNoCrop` e a M13 | 60 min |
| 9. Recoleta dos alvos ruins | M22 | 45 min |
| 10. Estímulo novo | quanto a troca de alvo e de fundo de 19/10/2026 muda os números | 45 min |
| 11. Contraluz real | as três fases da contraluz forte | 20 min |
| 12. Perda da WebGPU | o reinício do modelo e o aviso de calibração perdida | 20 min |
| 13. Pouca luz | os limiares 0,12 e 0,18 e o destravar da exposição | 30 min |
| 14. Desempenho no PC real | se o reaproveitamento de buffers tira as coletas de lixo e os engasgos | 20 min |

---

## 0. Regras que valem para todas

- **Réplica.** Cada condição tem pelo menos três calibrações independentes, cada
  uma com o seu teste de precisão (três testes sobre a mesma calibração não são
  réplica). As condições se alternam em ABBA (A B B A A B), para que a hora e a
  fadiga não virem efeito da condição.
- **A régua é ≥ 15 %.** Uma mudança fica ligada se melhora em pelo menos 15 % a
  métrica principal da sessão e se a diferença entre as condições é maior que a
  variação entre as réplicas da mesma condição. É a régua que o projeto já usa
  (README → *Arranjo do vetor*). Uma diferença menor, ou sem réplica, é "não
  decidido": a flag fica como está e a sessão entra no histórico assim. Com uma
  pessoa e sem réplica, diferenças abaixo de ~0,5° não são interpretáveis
  (MEDICOES §14.4).
- **Piorar também conta.** Se a condição nova piora 15 % ou mais qualquer
  métrica da tabela da sessão, ela não fica ligada, mesmo ganhando na principal.
- **Confira a condição antes de medir.** A linha `exp` do HUD (`?debug=1`)
  mostra o pipeline em vigor, e `__irisflowExp.dump()` no console mostra as
  flags. O relatório grava as duas coisas (`pipeline.experiment`), e é ele a
  prova da condição, não a anotação.
- **Recalibre a cada troca.** Com o L2CS ligado, trocar entre `v3` e `base`
  muda o `FEATURE_VECTOR_ID`, e o perfil salvo não carrega na outra condição.
  Sem o L2CS o identificador não muda, mas a calibração tem de ser nova do
  mesmo jeito: é ela que a réplica repete. O mesmo vale para todo parâmetro que
  entra na chave do perfil — `ep=off`, `dimsIris=`, `expansao=`, `rosto=`,
  `rollCrop=` (no V3), os `exp.` da M2, da M3, da M4 e da M13,
  `geometricPoseCompensation` (pelo console) e o lado efetivo do L2CS (lista
  completa no README, *Flags de experimento*): na recarga, o perfil da condição
  anterior é descartado.
- **Mudança de protocolo em 19/10/2026: o estímulo mudou.** Desde então a
  calibração e o teste usam o alvo ABC sobre o fundo azul-marinho `#091B33`
  (MEDICOES §2); antes, outro alvo e fundo preto. Não junte na mesma condição
  rodadas dos dois lados dessa data: confira o carimbo de build na tela de
  calibração e anote-o. A sessão 10 mede a diferença; até ela, uma sessão de
  antes não é linha de base para uma de depois.
- **A recoleta (M22) muda o modelo medido.** No V3, uma calibração com alvo
  ruim refaz até 4 alvos e pode trocar o modelo. Em toda sessão, registre
  `calibrationFit.recoleta` (rodou? foi aceita?) junto com o relatório; para
  medir outra coisa sem ela, acrescente `&exp.recoletaDeAlvosRuins=0` às duas
  condições.
- **Com e sem o L2CS.** O instalador da beta roda com o L2CS desde a
  1.0.0-beta.10 (até a beta.9 rodava sem, `&ep=off`), e é esse o número que a
  família recebe; sem o L2CS fica o caminho de quem escolhe "calibrar só com a
  íris". M3, M4 e M13 só agem com o L2CS; as outras valem nos dois. Quando der
  tempo, meça as duas; quando não, com o L2CS primeiro.
- **Grave uma réplica de cada condição** (Configurações → Gravador de sessão).
  A gravação permite repetir a calibração e o teste offline, com outras flags,
  sem a pessoa (§8).
- **Guarde os relatórios** em `docs/medicoes/historico/` e registre a sessão na
  §14 de MEDICOES, com a condição, a réplica e a decisão.

## 1. Preparação

1. Build de medição, sempre depois de mexer no código:

   ```bash
   npm --prefix frontend run build && npm --prefix frontend run preview
   ```

2. URL de partida (o monitor de referência tem 23,6"; troque pela diagonal real
   do monitor em uso):

   ```
   http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6
   ```

   Cada condição acrescenta os parâmetros dela: `&pipeline=v3` ou
   `&pipeline=base` para o pipeline inteiro, `&exp.<flag>=1` ou `=0` para uma
   flag só (M14 recebe o nome do modo: `&exp.suavizacaoDoLandmarker=desligada`),
   `&ep=off` para rodar sem o L2CS. Os parâmetros ficam gravados no
   navegador até `__irisflowExp.reset()`: zere entre sessões.

3. A bancada é a de MEDICOES §5.3: monitor em 60 Hz, janela maximizada, luz
   frontal difusa, câmera de maior resolução, preflight verde. Anote a
   distância medida com fita (o relatório registra a medida pela câmera como
   testemunha).

4. O campo de visão da câmera precisa estar calibrado (Configurações →
   "Calibrar campo de visão") antes das sessões 3 e 4: com o padrão, a sessão
   mede o erro do padrão, não o da compensação.

## 2. Sessão 1 — V3 contra o pipeline anterior

A pergunta: com tudo o que está ligado por padrão, o V3 acerta mais o botão que
o pipeline anterior?

| | condição A | condição B |
|---|---|---|
| parâmetro | `&pipeline=base` | `&pipeline=v3` |
| ordem | A B B A A B, cinco minutos de pausa entre as rodadas | |
| cada rodada | calibração completa (13 alvos) e teste de precisão (relatório /3) | |

**Métrica principal:** `meanErrorDeg`. **Tabela da sessão** (MEDICOES §8):
`medianErrorDeg`, `p95ErrorDeg`, `fracaoAte1Grau`, `fracaoAte2Graus`,
`meanErrorEdge`, `lado95Filtrado1sPx` (o botão que um dwell de 1 s pede),
`jitterRMS`, `precisionS2S`, `razaoS2sDp`, `atrasoDoFiltro` e
`decomposicaoDoVies` (de que estágio vem o viés que sobrou).

**Decisão.** O V3 continua padrão se ganhar ≥ 15 % em `meanErrorDeg` ou em
`lado95Filtrado1sPx` sem piorar 15 % nenhuma outra. Se não ganhar, ou se piorar
alguma, a sessão 2 acha a flag responsável antes de qualquer outra decisão.

Desde 19/10/2026 a condição B inclui a M22 (a recoleta), que a A não tem:
anote em cada rodada de B se a recoleta rodou e se foi aceita
(`calibrationFit.recoleta`). Se ela rodar em alguma rodada, a comparação mede o
V3 com a M22; o efeito da M22 sozinha é a sessão 9.

## 3. Sessão 2 — ablação

A pergunta: cada flag ligada paga o que custa? Parte-se do V3 e desliga-se uma
flag por vez, sempre contra o V3 completo da mesma pessoa no mesmo dia.

| flag | parâmetro | métrica | onde medir |
|---|---|---|---|
| M1 ordem dos alvos | `&exp.ordemDescorrelacionada=0` | viés vertical e ganho Y do `affine`; correlação da ordem com a pose | ao vivo |
| M3 roll com o sinal do L2CS | `&exp.desrolarComSinalDoL2cs=0` | `biasY` e erro com a cabeça inclinada (sessão 4) | ao vivo, com L2CS |
| M4 L2CS na cabeça | `&exp.l2csNaCabeca=0` | viés × `poseDeltaCalibToTestDeg` | ao vivo, com L2CS |
| M5 pose suavizada | `&exp.poseSuavizada=0` | `jitterRMS`, `precisionS2S`; atraso numa virada de cabeça | ao vivo |
| M6 calibração robusta | `&exp.calibracaoRobusta=0` | `calibrationFit`: LOO, pior alvo, fração descartada | replay |
| M8 assentamento pela chegada | `&exp.assentamentoPelaChegada=0` | LOO; erro × tempo desde a chegada da bola | ao vivo |
| M9 estimador de fixação | `&exp.estimadorDeFixacao=0` | `jitterFilteredRMS`, `lado95Filtrado1sPx`, `atrasoDoFiltro`; tempo para o cursor chegar à tecla vizinha | ao vivo |

Só M6 sai inteiro do replay das gravações da sessão 1 (§8): ela roda no núcleo
de calibração, sobre as features gravadas. M3, M4, M5 e M9 rodam no engine,
antes do que a gravação guarda ou depois do `mapGaze`. M8 muda quando a coleta
abre, e isso só existe na tela: o replay penaliza M8 em vez de medi-la, com
qualquer gravação.

M9 tem um ponto a olhar de perto: na simulação, uma sacada de mais de ~4,5σ
chega em 67 ms, mas uma de 2 a 4,3σ — a distância entre teclas vizinhas, com o
ruído típico — leva ~430 ms até 90 % do caminho. Meça o tempo do cursor entre
duas teclas vizinhas do teclado, com e sem M9, além do `atrasoDoFiltro`.

**Decisão.** Uma flag cuja retirada piora ≥ 15 % a métrica dela fica ligada.
Uma cuja retirada melhora ≥ 15 % sai. No meio, fica como está e a sessão
registra "não decidido".

## 4. Sessão 3 — deslocamento (6DoF, M12)

A pergunta: o produto continua servindo quando a pessoa se reclina depois de
calibrar? É a M-deslocamento de MEDICOES §4.6, agora com a saída 6DoF.

1. Condição A: `&exp.saida6DoF=0`. Condição B: `&exp.saida6DoF=1` e a pergunta
   de onde fica a câmera respondida no preparo. A flag muda o treino também, então
   cada condição tem a sua calibração, feita na postura de referência.
2. Sem recalibrar, teste de precisão em quatro posturas: a mesma, 10 cm mais
   perto, reclinado ~15° (encosto um dente atrás) e reclinado ~30°.
3. Registrar `poseDeltaCalibToTestDeg` (quanto a pessoa se moveu),
   `distanciaMedidaCm`, `meanErrorDeg`, `biasY` e o ganho do `affine`.

**Decisão.** A meta de MEDICOES §4.6 é, a 15°, erro ≤ 1,5 × o da postura de
referência. A 6DoF fica ligada se reduzir ≥ 15 % o erro nas posturas
deslocadas sem piorar a postura de referência além da variação entre réplicas.

## 5. Sessão 4 — condições de ELA

Cada condição decide uma flag desligada ou confere uma adaptação. O parâmetro
liga a flag; a condição de controle é o V3 padrão.

| condição | como produzir | flag | métrica |
|---|---|---|---|
| cabeça inclinada ±10–15° (roll) | inclinar e manter; conferir `pose.roll` no HUD | M2 `&exp.referencialIsotropico=1`; M3 `&exp.desrolarComSinalDoL2cs=0` e M13 `&exp.nivelarRecorteCorrigido=1` (as duas com L2CS) | `affine` (cisalhamento), `biasY`, `meanErrorDeg` |
| olhar para baixo, pálpebra cobrindo a íris | pessoa com ptose do programa de validação, ou a de referência com o monitor mais alto | M7 `&exp.alvoInferiorCentral=1` | B3 e B4 (a borda de baixo) e P8 (o risco); acerto nos botões da linha de baixo do teclado, contado à mão |
| um olho semicerrado | pessoa com ptose de um lado, ou manter um olho semicerrado durante calibração e teste | M10 `&exp.fusaoPorCovariancia=1` | `meanErrorDeg`; `calibrationFit.fusao` (a variância fora da amostra de cada olho e o peso que sai dela) |
| quarto à noite | só a tela acesa (a M-luz de MEDICOES §4.6) | nenhuma | `l2csValidFraction`, `meanErrorDeg`, avisos do preparo |
| óculos | com e sem, calibrando de novo (M-óculos) | nenhuma | `jitterRMS`, `meanErrorDeg`, item `óculos` do preflight |

Sobre M7: o teste de precisão não tem ponto no meio da borda de baixo, e é de
propósito — o protocolo fixo é o que torna as sessões comparáveis. O ganho de M7
aparece em B3/B4 e na contagem de acertos na linha de baixo do teclado; o risco,
em P8. No olho sintético que satura como o real, M7 melhorou a faixa de baixo e
piorou a linha de baixo da grade (README, nota da tabela; RELATORIO, Fase 7).
A sessão com gente é o que falta para decidir.

M13 muda a imagem que o L2CS recebe: a flag existe para essa decisão ser tomada
com número, e a decisão é do responsável. A comparação do roll com as três
condições do recorte (sem normalização, a de hoje — que dobra a inclinação — e
a M13) ficou numa sessão própria, a 8; aqui a cabeça inclinada mede M2 e M3.

O "quarto à noite" daqui mede a acurácia com só a tela acesa; o aviso de pouca
luz e os limiares dele são a sessão 13.

## 6. Sessão 5 — 30 minutos de uso com a correção por dwell (M15, M16)

A pergunta: a correção aprendida no uso segura a deriva sem travar num botão
vizinho?

1. Calibrar e rodar o teste de precisão (t = 0).
2. 30 minutos de uso normal, sem recalibrar: escrever no teclado, a conversa
   com o cuidador, o menu. Anotar as vezes em que o reajuste foi pedido.
3. Teste de precisão de novo (t = 30 min).
4. Antes do teste final, no console: `__irisflowDiag().correcao` — deslocamento
   e desvio aprendidos, ganho (M16), seleções aceitas, recusas (χ², desfeitas,
   inválidas), `nisMedio` (perto de 1 quando o modelo do filtro está certo) e se
   `pedeReajuste` disparou.

| condição | parâmetro |
|---|---|
| V3 (Kalman com ganho) | padrão |
| Kalman sem ganho | `&exp.correcaoPorDwellAfim=0` |
| integrador anterior | `&exp.correcaoPorDwellKalman=0` |

**Métrica principal:** a piora de `meanErrorDeg` entre t = 0 e t = 30 min.
**Decisão:** o Kalman fica se a piora for ≥ 15 % menor que a do integrador; o
ganho fica se melhorar a inclinação do resíduo × posição (o `affine` de t = 30)
sem aumentar as recusas.

## 7. Sessão 6 — sessão longa

A pergunta: o que acontece em duas horas, que é o uso real de quem depende do
aparelho o dia todo?

- Teste de precisão em t = 0, 30, 60, 90 e 120 min, sem recalibrar, com uso
  normal entre eles. A curva de `meanErrorDeg` e de `biasX/biasY` no tempo é a
  deriva que sobra depois da correção por dwell.
- Anotar cada reajuste rápido (M20) e rodar um teste de precisão logo depois
  de um deles: o antes e o depois é a medida da M20.
- Velocidade de escrita com e sem o dwell em cascata (M17,
  `&exp.dwellEmCascata=0`): a mesma frase de referência, cronometrada, e as
  letras apagadas. O app não conta palavras por minuto; conte à mão.
- Dwells interrompidos por perda de rosto (M21) e por uma escapada curta do
  olhar (M19): o app também não conta; anote pela gravação da tela ou ao vivo.
- Fadiga: o indicador do app e a percepção da pessoa ao fim de cada bloco.

**Decisão.** M17 fica se a frase sair ≥ 15 % mais rápido sem mais letras
apagadas. M19 e M21 ficam se reduzirem os dwells perdidos sem seleções erradas
novas. A curva de deriva decide se a correção por dwell basta ou se o app
precisa sugerir o reajuste mais cedo.

## 8. O que o replay já respondeu, e como repetir

Com a gravação de 23/09 (13 alvos, correção dos cantos, referência fixa):

| pipeline | grade interna | cantos |
|---|---|---|
| base (`?pipeline=base`) | 64,2 px | 40,2 px |
| V3 padrão | 62,4 px | 39,4 px |

É um empate. O replay passa as features e a pose gravadas pelo núcleo de
calibração, então enxerga a calibração robusta (M6) e a correção dos cantos,
não o que roda no engine (M3, M4, M5, M9) nem as mudanças de uso (M15–M21); e
penaliza o assentamento na chegada (M8), porque a gravação do pipeline base só
marca o alvo a partir de quando a coleta abria. A tabela completa, com os
cenários sem a correção dos cantos, está em MEDICOES §14.6. A mesma gravação
desligou M2 e M10 (RELATORIO, Fase 5). É uma pessoa, uma gravação: a sessão 1
é o que decide.

Para repetir com uma gravação nova:

```bash
IRISFLOW_GRAVACAO=/caminho/irisflow-recording-….jsonl npx vitest run src/replayDeGravacao.test.ts
```

O teste imprime o erro por alvo em cada cenário, inclusive o pipeline base.
Para testar outra flag no replay, acrescente um cenário em
`src/replayDeGravacao.test.ts` com `experimento: { <flag>: true }`.

## 9. Sessão 7 — ramo ocular: a EyeNet no lugar da L2CS-Net

A pergunta: a rede do olho, treinada só em renders do UnityEyes 2 (1,55° no
teste sintético), pode substituir a L2CS-Net do rosto, cujos pesos (Gaze360,
GazeGene) não têm licença comercial? É o Passo 0 do plano de 15/10: quanto custa
tirar a rede do rosto, e quanto a EyeNet devolve.

`?olho=onnx` sozinho não responde isso: ele soma a EyeNet à L2CS-Net (conjunto
`irisCore+l2cs+olho`). A condição da EyeNet no lugar da L2CS-Net leva também
`&ep=off`.

**Refazer as rodadas de antes de 19/10/2026.** Até então a condição E media um
ramo ocular com defeito (A4 da auditoria de 18/10): o peso da amostra olhava só
o bloco do L2CS e, com `?ep=off&olho=onnx`, toda amostra saía como "bloco
zerado" (×0,35), e o bloco ocular zerava sem rampa. Desde 19/10/2026 o peso
olha o motivo do bloco ocular e o bloco desvanece como o do L2CS. Rodada de E
anterior a isso não vale, e rodada de qualquer condição anterior a 19/10/2026
também usou o estímulo antigo (§0).

| | P — produção | I — só íris | E — íris + EyeNet |
|---|---|---|---|
| parâmetros | `&rosto=gaze360&ep=auto&olho=off&dimsIris=absolutas` | `&ep=off&olho=off&dimsIris=ambas` | `&ep=off&olho=onnx` |
| redes que rodam | L2CS-Net (Gaze360) | nenhuma | EyeNet, um worker por olho |
| conjunto do vetor | `irisAbs+l2cs` | `irisCore` (4 dims) | `irisCore+olho` (6 dims) |
| ordem | P I E E I P P I E, cinco minutos de pausa entre as rodadas | | |
| cada rodada | calibração completa (13 alvos) e teste de precisão | | |

I é o controle da EyeNet: o mesmo bloco de íris de E (com o ramo ligado,
`dimsDaIris` é ignorado e o vetor leva as quatro dimensões), sem as duas do
olho. P é o que a beta entrega hoje, com o modelo da beta: o navegador pode ter
`rosto=gazegene` gravado de outra sessão, e o `&rosto=gaze360` volta ao da beta.

Antes de cada rodada, confira a condição:

- a linha `[IrisFlow] redes desta sessão` do console diz a rede do rosto e a dos
  olhos. Em E: `rosto: desligada (?ep=off) · olhos: EyeNet`;
- em E, a linha `[olho] ramo ocular pronto` termina em `hash confere`, a linha
  `olhos` do HUD diz `pronto`, e o preflight passa nos itens `olhos (EyeNet)` e
  `olhos · pesos` (este fica em atenção: uso comercial não declarado). A tela de
  calibração espera a EyeNet carregar; se ela não carregar, a tela avisa e não
  deixa começar;
- o relatório grava a condição em `pipeline.experiment` (`l2cs`, `eyeNet`) e a
  ficha da EyeNet em `pipeline.runtime.olho`.

No fim, `__irisflowExp.reset()`.

**Métrica principal:** `meanErrorDeg`. **Tabela da sessão:** a da sessão 1, com
atenção a `jitterRMS` (a EyeNet responde a cada 33 ms por olho; a L2CS-Net, a
cada 100 ms) e às bordas de baixo (B3, B4), onde a pálpebra cobre a íris.

**Decisão.**

- I contra P é o custo de tirar a rede do rosto.
- E contra I é o que a EyeNet devolve: ela fica no vetor sem rede do rosto se
  ganhar ≥ 15 % em `meanErrorDeg` (a régua do §0).
- E contra P decide a troca, pela regra do plano de 15/10: a EyeNet substitui a
  L2CS-Net se ficar no máximo 0,2° acima de P em `meanErrorDeg`, sem `jitterRMS`
  pior, em pelo menos três pessoas. Com menos de três, a troca fica "não
  decidida", e a sessão entra no histórico como uma delas.
- Antes de ir para o instalador, a licença dos modelos de olho do UnityEyes
  precisa estar resolvida.

A EyeNet junto com a L2CS-Net (`&ep=auto&olho=onnx`, conjunto
`irisCore+l2cs+olho`) fica como ablação, se sobrar tempo: ela responde se o olho
acrescenta algo à rede do rosto, não se pode substituí-la.

## 10. Sessão 8 — roll do recorte do L2CS (A1)

A pergunta: o recorte do L2CS deve girar com a cabeça? Hoje
(`normalizarRollNoCrop` ligada) ele gira com o sinal trocado, e a rede vê o
DOBRO da inclinação (README, *Compensação de cabeça*); a M13 passa o sinal
certo e a rede vê o rosto nivelado. O impacto na acurácia nunca foi medido.

| | A — sem normalização | B — a de hoje | C — M13 |
|---|---|---|---|
| URL | `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3&rollCrop=0&exp.nivelarRecorteCorrigido=0` | `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3&rollCrop=1&exp.nivelarRecorteCorrigido=0` | `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3&rollCrop=1&exp.nivelarRecorteCorrigido=1` |
| o que a rede vê, com a cabeça a 15° | o rosto a 15° | o rosto a ~30° | o rosto nivelado |
| ordem | A B C C B A A B C, cinco minutos de pausa entre as rodadas | | |
| cada rodada | calibração completa com a cabeça nivelada; teste de precisão nivelado; teste de precisão com a cabeça inclinada ~15° para um lado e mantida (o mesmo lado em todas as rodadas; conferir `pose.roll` no HUD), sem recalibrar | | |

Com o L2CS (é ele que vê o recorte). As três condições mudam a chave do perfil
(`+rl`, `+rc`): **cada rodada tem a sua calibração**, e o "sem recalibrar" vale
só entre o teste nivelado e o inclinado.

**Registrar:** `meanErrorDeg` e `biasY` nos dois testes; o cisalhamento do
`affine`; `pose.roll` do HUD durante o teste inclinado; `l2csValidFraction`.

**Decisão.** A métrica é o `meanErrorDeg` do teste inclinado, contra B. C
ganhando ≥ 15 % sem piorar 15 % o teste nivelado: a M13 vira candidata a padrão,
e a decisão é do responsável (muda a imagem que a rede vê). A ganhando ≥ 15 %:
`normalizarRollNoCrop` sai do padrão. No meio, fica como está, "não decidido".

## 11. Sessão 9 — recoleta dos alvos ruins (M22)

A pergunta: refazer na hora os alvos ruins melhora o modelo que a pessoa usa, e
quanto tempo custa? A trava garante que o LOTO médio não piora; o teste de
precisão é o que diz se o cursor melhorou.

| | A — sem recoleta | B — com recoleta (padrão) |
|---|---|---|
| URL | `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3&exp.recoletaDeAlvosRuins=0` | `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3&exp.recoletaDeAlvosRuins=1` |
| ordem | blocos alternados, A B B A A B, cinco minutos de pausa entre as rodadas | |
| cada rodada | calibração completa (13 alvos) e teste de precisão | |

A flag não muda a chave do perfil, mas cada rodada calibra de novo do mesmo
jeito. Para haver alvo ruim sem forçar, não peça nada à pessoa: a recoleta
existe para as distrações de verdade, e uma sessão em que ela nunca roda também
é resultado.

**Registrar**, em cada rodada de B: `calibrationFit.recoleta` — `looAntesPx`,
`looDepoisPx`, `aceito`, `motivo`, `tempoUtilMs` e os `alvos` refeitos; em todas
as rodadas: o erro do teste no miolo (`meanErrorDeg`, P1–P9) e nos cantos
(`meanErrorEdge`, B1–B4), e o tempo total da calibração no cronômetro.

**Decisão.** Comparam-se as rodadas de B em que a recoleta rodou e foi aceita
com as de A. A M22 fica ligada se o erro do miolo ou o dos cantos melhorar
≥ 15 % sem o outro piorar 15 %; sai se piorar 15 % qualquer um dos dois. Se em
nenhuma rodada houver alvo ruim, a sessão registra "não decidido: a M22 não
agiu", com a contagem das rodadas, e a flag fica como está.

## 12. Sessão 10 — o estímulo novo (19/10/2026)

A pergunta: quanto a troca do alvo (a bola pulsante e o alvo antigo do teste
pelo ABC) e do fundo (preto pelo azul-marinho `#091B33`) muda os números? Não há
flag: a sessão diz se as medições de antes e de depois podem ser comparadas.

| | A — antes | B — depois |
|---|---|---|
| build | o de antes de 19/10/2026 no `preview`: a tag `pc-atual` (a pasta do PC em 18/10, 23h10; commit `22a0047` na reconstrução), que ainda não tem `src/alvoDeFixacao.ts` | o atual (`pipeline-v2`) no `preview` |
| URL | `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3` | `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3&exp.recoletaDeAlvosRuins=0` |
| ordem | A B B A A B, a mesma pessoa, a mesma bancada e a mesma luz | |
| cada rodada | calibração completa (13 alvos) e teste de precisão | |

O `&exp.recoletaDeAlvosRuins=0` em B tira a M22, que A não tem: assim a
diferença é a do estímulo. As outras mudanças entre os dois builds agem em
falha (contraluz forte, pouca luz, modelo que cai, predição inválida) ou fora
do rastreamento, com uma exceção: desde 19/10/2026 o rastreador abre a câmera
escolhida no preparo, e antes podia abrir outra — deixe só uma câmera ligada. Cada build serve a sua pasta `dist`; confira o carimbo de build na tela
de calibração antes de cada rodada.

**Registrar:** `meanErrorDeg`, `medianErrorDeg`, `p95ErrorDeg`, `jitterRMS`,
`precisionS2S`, `bceaDeg2`, `calibrationFit.looErrorPx` e o tempo da
calibração.

**Decisão.** Sem diferença maior que a variação entre as réplicas: as sessões
de antes continuam valendo como linha de base, com a nota da data. Com
diferença: as de antes viram histórico, e a linha de base passa a ser B. Se B
piorar ≥ 15 % o `meanErrorDeg` ou o `jitterRMS`, a troca volta ao responsável
antes de qualquer outra sessão.

**Atualização de 20/10/2026.** Agora dá para medir o estímulo no MESMO build: blocos alternados com `?exp.estimuloAntigo=1` (a bola azul lisa sobre preto na calibração e o círculo com cruz no teste, como antes de 19/10) e `?exp.estimuloAntigo=0` (o alvo ABC e o fundo marinho, o padrão), recalibrando a cada bloco. Isso separa o efeito do estímulo das outras mudanças (M22, A4, A5, supervisor).

## 13. Sessão 11 — contraluz real

A pergunta: com uma janela de verdade atrás da pessoa, a contraluz forte
(fundo ≥ 3× mais claro que o rosto) segue as três fases de 19/10/2026? Até
~500 ms, pausa; até 10 s, posição não medida — o dwell não conta tempo e nada
é selecionado; depois de 10 s, a predição volta degradada e só a Emergência
(dwell 2×) e os botões de recuperação (2,5×) aceitam.

| | A — controle | B — contraluz |
|---|---|---|
| posto | luz de frente, janela fechada ou de lado | janela clara atrás da pessoa, cortina aberta |
| URL | `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3` | a mesma |

Calibrar no posto A. Em B, sem recalibrar, abrir a cortina com a pessoa olhando
o teclado; repetir três vezes, com a pessoa parada sobre uma letra, sobre o
"Voltar" e sobre a Emergência.

**Registrar:** o tempo do abrir da cortina até o aviso "Luz forte atrás de
você" (cronômetro ou a hora do console); se alguma letra ou botão foi
selecionado antes dos 10 s (não pode); se, depois dos 10 s, a Emergência
completou e as letras não; a contraluz que a verificação de prontidão do
preparo mostra em A e em B (a razão fundo/rosto).

**Decisão.** Passa se nada for selecionado nos primeiros 10 s e se, depois
deles, só a Emergência e os botões de recuperação completarem. Qualquer seleção
indevida volta ao código como defeito, com o horário do console. Os 10 s e os
multiplicadores do dwell ficam se a pessoa conseguir chamar a Emergência sob
contraluz em pelo menos duas das três tentativas.

## 14. Sessão 12 — perda da WebGPU (suspender e acordar)

A pergunta: quando o dispositivo WebGPU se perde no sono do notebook, o modelo
volta sozinho, e a pessoa fica sabendo que a calibração precisa ser refeita?

1. No `preview`, num navegador com WebGPU (Chrome ou Edge), com
   `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3&ep=auto`:
   conferir no HUD que o provider é `webgpu` e o recorte 448². Calibrar.
2. Suspender o computador por pelo menos 1 minuto e acordar, com a pessoa na
   frente da câmera. Depois, repetir no aplicativo instalado, que é onde o
   paciente usa — lá sem o HUD: vale o que a tela diz.
3. Cronometrar até o modelo voltar: as tentativas são em 2, 5, 15, 30 e 60 s, e
   da segunda em diante o WASM é forçado (recorte 224²).

**Registrar:** as linhas do console do reinício (tentativas, provider de
volta); o provider e o lado do recorte depois; se a tela disse que a
calibração deixou de valer e pediu outra (com o recorte em 224², a calibração
de 448² deixa de valer, a não ser que exista um perfil salvo em 224²); com a
conta ligada, se o celular recebeu o aviso `calibracao_perdida` depois de 45 s.

**Decisão.** Passa se o modelo voltar sem reabrir o IrisFlow e se a tela pedir
a calibração nova em vez de mostrar um cursor deslocado. Esgotadas as cinco
tentativas sem volta, ou cursor deslocado sem aviso, é defeito: o console vai
junto com o relato.

**Atualização de 20/10/2026.** O reinício agora MANTÉM o lado da calibração (WASM a 448², ~3,2× mais lento que a 224² no contêiner) e mede as primeiras respostas: se duas das três passarem de 1,25 s, volta a 224² e a calibração fica suspensa (só Emergência e recuperação, faixa "O olhar está em modo reduzido", aviso `olhar_reduzido` ao cuidador). Registrar: a latência real a 448² e a 224² no PC (HUD com `?ep=wasm&l2cs=448&debug=1` e `l2cs=224`), se a linha "[L2CS] o recorte de 448² em WASM está levando X s…" aparece no console, quanto tempo leva a troca, e se o cursor fica no lugar quando NÃO troca.

## 15. Sessão 13 — pouca luz

A pergunta: os limiares do aviso de pouca luz (entra abaixo de 0,12 por 10 s,
sai acima de 0,18 por 3 s, na luminância média do quadro) batem com uma webcam
real? E destravar a exposição traz o rosto de volta?

1. Calibrar com o quarto bem iluminado: o ajuste da câmera trava a exposição.
2. Sem recalibrar, escurecer o quarto aos poucos (uma luz por vez, até ficar só
   a tela), com a pessoa olhando o menu.
3. Depois de 2 minutos no escuro, acender de novo.
4. Repetir com o brilho da tela reduzido ou o filtro âmbar ligado, para ver o
   "Clarear a tela".

URL: `http://127.0.0.1:4173/?preflight=1&debug=1&diagonal=23.6&pipeline=v3`.

**Registrar:** as linhas `[camera] pouca luz no quadro (brilho …) há mais de
10 s.` e `[camera] pouca luz: a exposição voltou ao automático…` (ou a de
recusa da câmera), com a hora; o brilho em que o rosto se perdeu (a hora do
aviso de rosto perdido); se o rosto voltou depois de a exposição destravar; o
brilho em que o aviso saiu; e, numa hora de uso normal com a luz acesa, se o
aviso apareceu alguma vez (não pode).

**Decisão.** Os limiares ficam se o aviso aparecer quando o rosto some pelo
escuro e nunca com a luz normal. Se o rosto se perder com o brilho acima de
0,12 nas três repetições, o limiar sobe para o brilho medido na perda (e o de
saída acompanha, com a mesma folga); se o aviso aparecer com luz normal, ele
desce. A mudança é no código (`src/poucaLuz.ts`), com os números desta sessão.

## 16. Sessão 14 — desempenho no PC real

A pergunta: o reaproveitamento dos buffers (19/10/2026) tira, no PC de
verdade, as coletas de lixo e os engasgos do cursor? Na medição sintética de 1
min de pipeline, a alocação caiu de 707 MB para ~0 e as coletas de 33 para 11
(224²), e de 1,74 GB para ~0 e de 63 para 12 (448²). O `getImageData` ainda
aloca por recorte.

| | A — antes | B — depois |
|---|---|---|
| build | o último commit antes do reaproveitamento ("à noite: aviso de pouca luz…", `041d11c` na reconstrução), que ainda não tem `src/reusoDeBuffers.test.ts` | o atual |
| como | `npm run electron:dev`, DevTools → Performance, com Memory marcado | o mesmo |

Gravar 60 s com o rastreamento ligado e o cursor andando sobre o teclado, três
vezes por condição, com o mesmo provider (anotar `webgpu` 448² ou `wasm` 224²).

**Registrar:** o número de coletas (Minor GC e Major GC) e o tempo somado
delas; a amplitude do dente de serra do JS heap; os quadros acima de 50 ms; e
os engasgos do cursor que a pessoa percebeu.

**Decisão.** Não há flag: a saída é idêntica por teste
(`src/reusoDeBuffers.test.ts`). A sessão confirma o ganho se as coletas e os
quadros longos caírem em B. Se não caírem, registra "sem efeito no PC real", e
o próximo passo é o `getImageData`.
