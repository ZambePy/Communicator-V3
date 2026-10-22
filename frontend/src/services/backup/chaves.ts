/**
 * O que entra no backup e o que NÃO entra (rodada 3, 21/10/2026).
 *
 * Regra: ENTRA POR PADRÃO toda chave `irisflow.` ou `irisflow_` do
 * `localStorage` — as frases, o vocabulário aprendido, o histórico de dor, os
 * pacientes, os ajustes — MENOS as que estão na lista de fora abaixo. Lista do
 * que sai e não do que entra, de propósito: as outras tarefas da rodada criam
 * ajustes novos, e uma lista do que entra deixaria cada um deles de fora do
 * backup sem ninguém perceber.
 *
 * Quem criar uma chave que é TRANSITÓRIA, de SESSÃO ou presa a ESTE COMPUTADOR
 * deve incluí-la em `GRUPOS_DE_FORA` e em `chaves.test.ts`, com o porquê. O
 * restaurador IGNORA uma chave de fora que o arquivo traga (ver `validarBackup`
 * e `chavesIgnoradasDoBackup`) e conta quantas foram: um backup mexido à mão não
 * liga o modo apresentação, que descarta todos os pedidos de socorro, nem troca a
 * licença — e um backup antigo continua valendo quando a lista de fora cresce.
 *
 * Restaurar mexe SÓ nas chaves que entram: o que ficou de fora (licença,
 * sessão, calibração, Preparo) continua como o computador tem.
 */

const PREFIXO_DO_APP = /^irisflow[._]/;

/** As configurações do aplicativo (um objeto JSON). Única chave com regra própria: ver `configuracoesParaRestaurar`. */
export const CHAVE_DAS_CONFIGURACOES = 'irisflow_settings';

interface GrupoDeFora {
  porque: string;
  /** Nomes exatos. */
  chaves?: readonly string[];
  /** Tudo o que começa assim. */
  prefixos?: readonly string[];
}

export const GRUPOS_DE_FORA: readonly GrupoDeFora[] = [
  {
    porque: 'Transitórias: restaurar uma delas seria perigoso ou só confuso.',
    chaves: [
      // Modo apresentação DESCARTA todos os pedidos de socorro (vale por 2 h).
      'irisflow.apresentacao',
      'irisflow_socorro_ativo',
      'irisflow.rascunhoDoTeclado',
      'irisflow.registroDaSessao',
      // Ajustes de experimento: podem, por exemplo, desligar a persistência da calibração.
      'irisflow.experiment',
      // Lembretes que já tocaram hoje: restaurar escondia os de hoje no computador novo.
      'irisflow_triggered_reminders',
      'irisflow_caregiver_session',
      'irisflow_dev_mode',
      // A missão do tutorial em andamento (o progresso do paciente, `irisflow_tutorial_<id>`, entra).
      'irisflow_tutorial_missao',
      'irisflow_tutorial_ensaio',
      'irisflow_tutorial_passo',
      'irisflow_tutorial_missoes_ok',
      // As perguntas do cuidador que ESTE computador já respondeu (`cloud/perguntaDoCuidador.ts`), até o `message.spoken`
      // chegar ao servidor. Presa ao vínculo e à fila de envio deste computador: restaurar um arquivo sem ela a APAGARIA, e
      // a pergunta já respondida, com o aviso ainda na fila sem internet, voltaria depois da recarga (revisão final,
      // rodada 1, M5, 21/10/2026). Levada a outro computador, esconderia perguntas que nunca foram respondidas lá.
      'irisflow.perguntasRespondidas',
    ],
  },
  {
    porque: 'Conta, licença e identidade DESTE computador: copiar faria dois computadores passarem por um só.',
    chaves: [
      'irisflow_license',
      'irisflow.licenca',
      'irisflow_device_id',
      'irisflow.vinculo',
      'irisflow.supabase.session',
      // A fila offline reenviaria como se fossem de agora os socorros e mensagens que ficaram esperando.
      'irisflow.fila',
      'irisflow_mock_network',
    ],
    prefixos: ['irisflow.sb.'],
  },
  {
    porque: 'Feitas para a câmera e a tela deste computador: a calibração de um não vale no outro — e parece boa.',
    chaves: [
      'irisflow.calib.profiles.v2',
      'irisflow.calibracao.dono',
      'irisflow_referencia_checagem',
      'irisflow_ultimo_relatorio',
    ],
    // O Preparo (câmera, distância, luz) é um por paciente: `irisflow_setup_<id>`.
    prefixos: ['irisflow_setup_'],
  },
  {
    porque: 'Escolhas desta instalação: o computador novo pergunta de novo.',
    chaves: [
      'irisflow_consent', // termo de privacidade deste computador
      // O aceite da coleta clínica liga o registro de frases e calibrações NESTE computador. Se viajasse, o computador
      // novo passaria a registrar sem nunca ter perguntado — o mesmo motivo do termo de privacidade acima (decisão do
      // coordenador, rodada 1 da tarefa 4, 21/10/2026). O histórico em si (`irisflow_clinical_data*`) continua indo.
      'irisflow_consent_clinical_data',
      'irisflow_intro_seen',
      'irisflow.relatos.automaticos',
      'irisflow.relatos.convite-visto',
      // Começa a gravar junto com a calibração: nunca pode chegar ligado sem ninguém pedir.
      'irisflow.autoRecordOnCalibrate',
    ],
  },
];

const NOMES_DE_FORA: ReadonlySet<string> = new Set(GRUPOS_DE_FORA.flatMap((g) => g.chaves ?? []));
const PREFIXOS_DE_FORA: readonly string[] = GRUPOS_DE_FORA.flatMap((g) => g.prefixos ?? []);

/** A chave tem o jeito de uma chave do IrisFlow (`irisflow.` ou `irisflow_`)? Um backup feito por este aplicativo só traz chaves assim. */
export function chaveEhDoAplicativo(chave: string): boolean {
  return typeof chave === 'string' && PREFIXO_DO_APP.test(chave);
}

/** Esta chave do `localStorage` vai no backup (e volta dele)? */
export function chaveEntraNoBackup(chave: string): boolean {
  if (!chaveEhDoAplicativo(chave)) return false;
  if (NOMES_DE_FORA.has(chave)) return false;
  return !PREFIXOS_DE_FORA.some((p) => chave.startsWith(p));
}

/**
 * As famílias de chave que são DE UM PACIENTE: `<família><id do paciente>`. É o
 * que a restauração "só deste paciente" troca (junto com a linha dele em
 * `irisflow_profiles`). Chave por paciente nova entra aqui, senão ela vai no
 * backup completo mas fica de fora da restauração por paciente.
 */
const FAMILIAS_DO_PACIENTE = [
  'irisflow_clinical_data_', // o histórico (frases, calibrações, dor)
  'irisflow_tutorial_',
  'irisflow.assistente.v1.', // o vocabulário que o assistente aprendeu com ele
  // Abreviações e respostas sugeridas (rodada 3): as siglas que ele escreveu, as
  // frases curtas que o aparelho aprendeu delas e a contagem das sugestões aceitas.
  'irisflow.abreviacoes.v1.',
  'irisflow.abreviacoes.falas.v1.',
  'irisflow.sugestoes.aceitacao.v1.',
  // Evolução semanal e modo consulta (rodada 3): o uso por dia, o diário (dor,
  // sono, humor, notas) e as perguntas para o médico — dado de saúde dele.
  'irisflow.evolucao.uso.v1.',
  'irisflow.consulta.diario.v1.',
  'irisflow.consulta.perguntas.v1.',
  'irisflow.vozGuardada.frasesProprias.', // as frases que ele escolheu gravar
  'irisflow_favorites_',
  'irisflow_caregiver_', // o painel do cuidador (tarefas e diário)
] as const;

export function chavesDoPaciente(perfilId: string): string[] {
  return FAMILIAS_DO_PACIENTE.map((familia) => `${familia}${perfilId}`).filter(chaveEntraNoBackup);
}

/**
 * Famílias de chave que são do paciente mas NÃO entram no backup (presas à câmera e
 * à tela deste computador): o Preparo, `irisflow_setup_<id>`. Saem com o perfil.
 */
const FAMILIAS_DO_PACIENTE_FORA_DO_BACKUP = ['irisflow_setup_'] as const;

/**
 * TUDO o que o `localStorage` guarda de um paciente — as chaves do backup por
 * paciente e o que fica de fora dele (o Preparo). É a lista de quem REMOVE o
 * perfil (revisão final, rodada 1, M4, 21/10/2026): o diário e as tarefas do
 * cuidador, os favoritos, o progresso do tutorial, as frases próprias da voz
 * guardada e o Preparo ficavam no computador depois da remoção, sem dono e sem
 * caminho na interface para apagá-los — e o backup "Tudo" os levava junto.
 * Família nova, por paciente, entra em `FAMILIAS_DO_PACIENTE`.
 */
export function chavesLocaisDoPaciente(perfilId: string): string[] {
  return [
    ...chavesDoPaciente(perfilId),
    ...FAMILIAS_DO_PACIENTE_FORA_DO_BACKUP.map((familia) => `${familia}${perfilId}`),
  ];
}

/**
 * Dentro de `irisflow_settings` há, junto das escolhas da pessoa (tempo de
 * fixação, tema, som, modo de entrada), o que DESCREVE o posto de uso deste
 * computador: diagonal da tela, distância, campo de visão e escolha da câmera,
 * brilho do monitor. Vindos de outro computador, deslocariam a grade de
 * calibração e o erro angular dos relatórios SEM aviso (o app só dá por falta
 * se o campo estiver vazio). Por isso, ao restaurar, estes campos ficam como
 * este computador tem — ou somem, e valem os padrões.
 */
export const CAMPOS_PRESOS_AO_COMPUTADOR = [
  'screenDiagonalIn',
  'viewingDistanceCm',
  'screenGeometrySource',
  'systemAccessGranted',
  'cameraHorizontalFovDeg',
  'fovPorCamera',
  'ultimaCameraChave',
  'cameraDeviceId',
  'screenScaleFactor',
  'posicaoDaCamera',
  'monitorBrightness',
  // A saída da voz (rodada 3): id do aparelho de som deste computador (o cabo virtual das chamadas).
  // Desde 21/10/2026 (B1) ela vale só para a sessão e nem é gravada no disco; fica aqui para um
  // backup ou disco antigo que ainda a traga não levar o id de um aparelho de outro computador.
  'saidaDaVoz',
] as const;

function lerObjeto(texto: string | null): Record<string, unknown> | null {
  if (texto === null) return null;
  try {
    const v: unknown = JSON.parse(texto);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * As configurações que a restauração grava: as do backup, com os campos presos
 * ao computador trocados pelos de AQUI (`daqui`, o que está gravado agora) ou
 * removidos quando não há. Valor do backup que não é um objeto JSON passa como
 * veio — o leitor das configurações o descarta e usa os padrões.
 */
export function configuracoesParaRestaurar(doBackup: string, daqui: string | null): string {
  const novo = lerObjeto(doBackup);
  if (!novo) return doBackup;
  const local = lerObjeto(daqui);
  for (const campo of CAMPOS_PRESOS_AO_COMPUTADOR) {
    if (local && Object.hasOwn(local, campo)) novo[campo] = local[campo];
    else delete novo[campo];
  }
  return JSON.stringify(novo);
}
