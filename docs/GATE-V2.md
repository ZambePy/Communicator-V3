# Gate de validação do V2

O V2 do IrisFlow tem dois objetivos que não se negociam: **acurácia e precisão
melhores que a beta** e **nenhum peso derivado do Gaze360 no instalador**. Este
documento é o portão: a lista de tudo que o relatório *Rota para o V2* pediu,
o que já está feito, o que falta, e — para cada item que falta — o critério
medido que o fecha. Um item só muda de coluna com número, hash ou contrato.

**Decisão registrada (2026-09-15):** a partir desta data, nenhum release do
IrisFlow sai com pesos treinados no Gaze360. Os pesos atuais
(`l2cs_gaze360.onnx`) continuam no repositório de trabalho para medir e
comparar — a ficha de proveniência deles diz `usoComercial: 'proibido'`, e o
preflight mostra isso em toda sessão. Motivo: a licença do Gaze360 proíbe uso
comercial de "models trained on dataset" (github.com/erkil1452/gaze360,
LICENSE.md).

---

## 1. Feito nesta rodada (código, sem medição)

| Item do relatório | Onde | Como conferir |
|---|---|---|
| Ficha de proveniência do modelo (etapa 11) | `src/l2cs/proveniencia.ts`, `types.ts`, `l2cs.worker.ts`, `client.ts`; `frontend/public/models/l2cs/l2cs.meta.json` | `npx vitest run src/l2cs/proveniencia`; no app, Configurações → "Modelo de olhar: …" e o item "L2CS · pesos" do preflight; `pipeline.runtime.modelo` no relatório |
| Verificação de integridade dos pesos (SHA-256) | `l2cs.worker.ts` (`sha256Hex`), preflight bloqueia em `nao-confere` | preencher `sha256` na meta com o hash que o console imprime; trocar o ONNX e ver o bloqueio |
| Decodificação linear para bins que não fecham a volta (etapa 03) | `src/l2cs/decode.ts` (`modoDeDecodificacao`), meta `decoding` | `npx vitest run src/l2cs/proveniencia src/l2cs/decode` |
| Worker confere `outputBins` contra o tensor e aceita tensor retangular | `l2cs.worker.ts` (`infer`) | carregar uma meta com bins errados → `infer_error` nomeando os dois números |
| Recorte compartilhado com o treino (etapa 02) | `fixtures/recorte-l2cs.json` (48 casos), `src/l2cs/crop.fixtures.test.ts`; `Communicator V2/tests/test_recorte.py` | os dois testes passam sobre o MESMO arquivo; regenerar só com `GERAR_FIXTURES=1` |
| **Desfazer o roll no olhar (lacuna da S6)** | `src/l2cs/roll.ts`, `engine.ts` (`rollDaSubmissao`) | `npx vitest run src/l2cs/roll` — o teste fecha o ciclo contra a própria `matrizDoRecorte` |
| Ramo ocular atrás de flag (etapa 04) | `src/olho/{recorte,bloco,ramoOcular}.ts`, `EXPERIMENT.eyeNet`, conjuntos `irisCore+l2cs+olho` (8 dims) e `irisCore+olho`; `fixtures/recorte-olho.json` (24 casos); `models/eyenet/eyenet.meta.json` (exemplo) | `npx vitest run src/olho`; `?olho=onnx` só funciona depois de `eyenet.onnx` existir |
| FOV por câmera (etapa 00) | `src/camera/fovPorCamera.ts`, `SettingsContext` (`fovPorCamera`, `ultimaCameraChave`), `GazeContext`, `GazeStatusBanner` | `npx vitest run src/camera`; trocar de webcam → banner "Câmera diferente da última sessão" |
| Modo Computador elástico a DPI (Fase 6) | `src/computador/geometria.ts` (`reacaoAMudancaDeTela`), `electron/computador/sessao.ts` (`reajustarAoMonitor`), `Overlay.tsx` | `npx vitest run src/computador`; mudar a escala do Windows com o modo ligado → segue; trocar de monitor → encerra |
| Parâmetros de URL das sessões novas | `frontend/src/sessionFromUrl.ts` | `?rollCrop=`, `?estabilizar=`, `?dwellCorrige=`, `?olho=` |
| Protocolos M-ablação, M-deslocamento, M-luz, M-óculos, M-distância | `docs/MEDICOES.md` §4.6 | só protocolo; nenhuma medição feita |
| Release automatizado com motor de voz (Fase 6) | `.github/workflows/release.yml` (entregue à parte — o bridge do desktop recusa gravar em `.github/`) | `git tag v2.0.0-beta.1 && git push --tags` → artefato `irisflow-installer-*` |
| Projeto de treino + tutorial Colab | pasta `Communicator V2` | `pytest` (85 passam), `treinar.py --dados-sinteticos --overfit-um-batch` |

## 2. Já existia e foi conferido (não refeito)

| Item | Estado | Observação |
|---|---|---|
| Oito sprints S1–S8 | **Estão no PC** — commit "Melhorias no pipeline" (2026-09-11), arquivos idênticos aos da revisão `04ac6f6` | O pedido dizia "estado anterior às sprints"; o repositório diz o contrário. Confirmar o que se quer antes de mexer |
| `holdPorEAR` | Existe como `filters/blinkHold.ts` (congela na predição do Kalman, teto 2 s) + `BlinkDetector` com limiar adaptativo por pessoa (`blinkRatio` 0,8) + `olhosFechados.ts` (aviso após 2,6 s) | O relatório pedia 70 % da linha de base e 3 quadros de histerese; o que existe usa 80 % e histerese própria. Ajustar só com medição (M-óculos/M-luz mostram o custo) |
| Calibração do campo de visão com fita métrica | Configurações → "Calibrar campo de visão" | Passou a ser guardada por câmera nesta rodada |
| Bins parametrizados no worker | `l2cs.meta.json` (`outputBins`, `binWidth`, `binOffset`) | A conversa com o Google dizia que trocar a grade "quebra o worker": não quebra; o worker lê a meta e agora confere o tensor |
| Correção contínua por dwell (a "calibração passiva" da conversa) | S3, `interaction/correcaoPorDwell.ts` com cinco guardas | Ligada por padrão; `?dwellCorrige=0` desliga para medir |

## 3. Pendente — modelo (fora do escopo desta rodada, por pedido)

| Item | Critério de fechamento |
|---|---|
| **Fase 1** — EyeNet treinada no UnityEyes 2 (`Communicator V2/notebooks/02`) | `eyenet.onnx` + meta com `sha256` real em `frontend/public/models/eyenet/`; com `?olho=onnx`, o erro médio na M1 cai além da régua de 0,1° e o caso M-óculos não piora em relação aos escalares de íris |
| **Fase 2** — L2CS-Net retreinado (`notebooks/01`) | A/B contra os pesos Gaze360 no conjunto interno: diferença ≤ 0,1° para pior; meta nova com `proveniencia.usoComercial` = `permitido` **apontando para contrato assinado** (GazeGene) ou para base MIT/comprada. Treinar no GazeGene sem contrato é teste acadêmico: o resultado mede ganho potencial, e os pesos não entram em release |
| Camada Epic/MetaHuman do GazeGene | Resposta escrita da BUAA sobre os termos da Epic para treino de modelos com conteúdo MetaHuman. Sem ela, o GazeGene não entra em release mesmo com a BUAA dizendo sim |
| **Fase 5** — troca dos pesos e retirada do Gaze360 | `l2cs_gaze360.onnx` fora do instalador e do histórico de release; preflight "L2CS · pesos" em `ok`; `pipeline.runtime.modelo.usoComercial === 'permitido'` em todos os relatórios da bateria final |

## 4. Pendente — medição (no fim, como pedido)

| Sessão | Pergunta | Fecha quando |
|---|---|---|
| M-ablação (`ep=off` vs `auto`) | quanto vale o bloco L2CS | N ≥ 3 por condição; a diferença dimensiona a prioridade do retreino |
| M-deslocamento (15°, 30°; `rollCrop`, compensação de pose) | o produto serve a quem está acamado | a 15°, erro ≤ 1,5× a postura de referência; o que não ajudar, sai |
| M-luz (sala vs só tela) | a luz de tela precisa estar no corpus | número registrado; decide a randomização do treino |
| M-óculos | custo dos óculos hoje; régua do ramo ocular | número registrado |
| M-distância (45/60/75, compensação on/off) | a compensação de distância ajuda fora da calibração | fica se reduzir o erro nas duas distâncias |
| Sprints S1–S8, uma por vez (Fase 3) | quanto cada uma vale | uma linha por sprint na MEDICOES.md com N ≥ 3 — inclusive as que não ajudarem, para ficarem desligadas por medida |
| Bateria final com pesos novos | o V2 é melhor que a beta | tabela "hoje vs V2" da Parte 2 do relatório preenchida com números medidos |

## 5. Pendente — produto e infraestrutura (não feito nesta rodada, e por quê)

| Item | Por que não foi feito aqui | Como fechar |
|---|---|---|
| Certificado de assinatura de código (EV/OV) | Decisão comercial e compra; não é código | Comprar; pôr `CSC_LINK`/`CSC_KEY_PASSWORD` nos segredos do repositório — `release.yml` já os lê; instalador passa no SmartScreen sem aviso |
| Serviço do Windows para o UAC (cursor sobre janelas elevadas) | Engenharia nativa (serviço como SYSTEM injetando entrada) com superfície de segurança real; exige revisão de ameaças e teste na máquina — não dá para escrever às cegas daqui | Spec mínima: serviço que só recebe `{x, y, ação}` por pipe nomeado com ACL restrita ao usuário logado, valida faixa, injeta via `SendInput`, sem nenhuma outra capacidade; revisão de ameaças antes da primeira linha |
| Quantização do motor de voz (INT8/FP16) para 8 GB | Precisa do modelo no PC e de teste auditivo com as frases de referência | Rodar a quantização pós-treino no Chatterbox; comparar as 30 frases do cache antes/depois; critério: carrega numa máquina de 8 GB com o Chrome aberto e a voz continua reconhecível pelo cuidador |
| Preditor de frases para pré-síntese (aquecimento dinâmico) | Não estava no roadmap do relatório; depende do assistente local | Backlog da Fase 6 |
| i18n (`i18next`) | Última da Fase 6 por decisão do relatório; refatoração ampla de strings | Só depois de o produto estar estável em português |
| Conjunto interno de validação real (Fase 0) | Precisa de pessoas, termo de consentimento e gravação no PC | 5–8 pessoas × 3 condições (sentado, reclinado, só tela) × com/sem óculos; consentimento escrito cobrindo treino e avaliação; fica local |
| Cartas e negociação (Fase 0) | Em curso — BUAA respondeu, pediu dados da empresa | Site no ar; resposta enviada; demais cartas do dossiê *Saída do Gaze360* despachadas |

## 6. Como usar este gate

1. Antes de qualquer release do V2, percorrer as seções 3 e 4: cada linha
   precisa de um relatório JSON (com `pipeline.runtime.modelo`) ou de um
   documento nomeado ao lado.
2. Uma linha da seção 5 que continue pendente não bloqueia o release de
   rastreamento — bloqueia o item de produto correspondente (sem certificado,
   o instalador sai com aviso do SmartScreen; sem serviço, o Modo Computador
   continua sem alcançar janelas elevadas, como documentado).
3. A tabela "hoje vs V2" do relatório é o resumo executivo deste gate: quando
   ela estiver preenchida com números medidos, o gate está fechado.
