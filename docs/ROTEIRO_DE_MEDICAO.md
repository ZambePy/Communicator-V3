# Roteiro de medição do V3

As mudanças do pipeline V3 (M1–M21, README → *Pipeline V3*) foram decididas com
literatura, simulação e o replay de uma gravação. Nenhuma foi medida com uma
pessoa. Este roteiro diz, sessão por sessão, o que medir para decidir cada flag.
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
  mesmo jeito: é ela que a réplica repete.
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
com número, e a decisão é do responsável.

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
