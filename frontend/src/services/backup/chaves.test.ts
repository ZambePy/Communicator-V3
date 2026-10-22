import { describe, it, expect } from 'vitest';
import { CHAVES as CHAVES_DO_COFRE } from '../../cloud/armazenamento';
import { CHAVE_DAS_PERGUNTAS_RESPONDIDAS } from '../../cloud/perguntaDoCuidador';
import {
  CAMPOS_PRESOS_AO_COMPUTADOR, chaveEntraNoBackup, chavesDoPaciente, chavesLocaisDoPaciente, configuracoesParaRestaurar,
} from './chaves';

// -----------------------------------------------------------------------------
// O que entra no backup e o que NÃO entra (rodada 3, 21/10/2026).
//
// A regra é "entra por padrão": toda chave `irisflow…` leva — as frases, o
// vocabulário aprendido, o histórico de dor, os pacientes, os ajustes — menos o
// que está na lista de fora. O padrão é de propósito: as outras tarefas desta
// rodada criam ajustes novos, e uma lista do que entra deixaria cada um deles
// de fora do backup sem ninguém perceber. Quem cria uma chave que é transitória,
// de sessão ou presa a este computador entra na lista de fora (em `chaves.ts`)
// E AQUI.
//
// Cada grupo abaixo diz POR QUE a chave não pode ser restaurada.
// -----------------------------------------------------------------------------

describe('chaves que ficam FORA do backup', () => {
  it('transitórias: restaurar uma delas seria perigoso ou só confuso', () => {
    const transitorias = [
      'irisflow.apresentacao', // modo apresentação: descarta TODOS os pedidos de socorro por 2 h
      'irisflow_socorro_ativo', // pedido de socorro em curso
      'irisflow.rascunhoDoTeclado', // texto que estava sendo escrito
      'irisflow.registroDaSessao', // registro da sessão de uso atual
      'irisflow.experiment', // ajustes de experimento (podem desligar a persistência da calibração)
      'irisflow_triggered_reminders', // lembretes que já tocaram hoje
      'irisflow_caregiver_session', // acesso do cuidador desta aba
      'irisflow_dev_mode', // modo desenvolvedor
      'irisflow_tutorial_missao', 'irisflow_tutorial_ensaio', 'irisflow_tutorial_passo', 'irisflow_tutorial_missoes_ok', // missão do tutorial em andamento
      // As perguntas do cuidador já respondidas: presas ao vínculo e à fila de envio DESTE computador (revisão final, rodada 1, M5).
      'irisflow.perguntasRespondidas',
    ];
    for (const k of transitorias) expect(chaveEntraNoBackup(k), k).toBe(false);
  });

  // Revisão final, rodada 1 (M5): `irisflow.perguntasRespondidas` guarda os ids
  // das perguntas do cuidador que ESTE computador já respondeu, até o
  // `message.spoken` chegar ao servidor. Ela é presa ao vínculo e à fila deste
  // computador. Entrando no backup, uma restauração "Tudo" de um arquivo sem ela
  // a APAGARIA (o restaurador remove o que o arquivo não traz): sem internet, com
  // o `message.spoken` ainda na fila, a pergunta já respondida voltaria depois da
  // recarga e o paciente teria de respondê-la de novo. E levada a outro
  // computador, escondia perguntas que nunca foram respondidas lá.
  it('as perguntas do cuidador já respondidas (a chave mora em cloud/perguntaDoCuidador) ficam fora', () => {
    expect(CHAVE_DAS_PERGUNTAS_RESPONDIDAS).toBe('irisflow.perguntasRespondidas');
    expect(chaveEntraNoBackup(CHAVE_DAS_PERGUNTAS_RESPONDIDAS)).toBe(false);
  });

  it('conta, licença e identidade DESTE computador: copiar faria dois computadores passarem por um só', () => {
    const daConta = [
      'irisflow_license', 'irisflow.licenca', 'irisflow_device_id', 'irisflow.vinculo',
      'irisflow.supabase.session', 'irisflow.sb.auth-token', 'irisflow.sb.qualquer-outra',
      'irisflow.fila', // fila offline: reenviaria socorros antigos como se fossem de agora
      'irisflow_mock_network',
    ];
    for (const k of daConta) expect(chaveEntraNoBackup(k), k).toBe(false);
  });

  // No navegador o cofre guarda no `localStorage` com estes mesmos nomes (no app instalado fica
  // cifrado e nem aparece lá). Se alguém criar uma chave nova no cofre sem pô-la na lista de fora,
  // a sessão ou a licença de um computador viajaria no arquivo de backup: este teste avisa.
  it('toda chave do cofre da conta (sessão, vínculo, licença, fila de envio) fica fora', () => {
    for (const k of Object.values(CHAVES_DO_COFRE)) expect(chaveEntraNoBackup(k), k).toBe(false);
  });

  it('feitas para a câmera e a tela deste computador: a calibração de um não vale no outro (e parece boa)', () => {
    const doEquipamento = [
      'irisflow.calib.profiles.v2', 'irisflow.calibracao.dono', 'irisflow_referencia_checagem', 'irisflow_ultimo_relatorio',
      'irisflow_setup_8d6f1f0a-aaaa-bbbb-cccc-000000000001', 'irisflow_setup_perfil-qualquer', // o Preparo, um por paciente
    ];
    for (const k of doEquipamento) expect(chaveEntraNoBackup(k), k).toBe(false);
  });

  it('escolhas desta instalação: o computador novo pergunta de novo (termo de privacidade, aceite da coleta clínica, apresentação, relatos, gravação na calibração)', () => {
    const daInstalacao = [
      'irisflow_consent', 'irisflow_intro_seen', 'irisflow.relatos.automaticos', 'irisflow.relatos.convite-visto', 'irisflow.autoRecordOnCalibrate',
      // O aceite da coleta clínica liga o registro de frases e calibrações NESTE computador (`clinicalLogger`). Viajando, o
      // computador novo passaria a registrar sem nunca ter perguntado — o mesmo que o termo de privacidade, que também não viaja.
      'irisflow_consent_clinical_data',
    ];
    for (const k of daInstalacao) expect(chaveEntraNoBackup(k), k).toBe(false);
  });

  it('o que não é do IrisFlow nunca entra — nem parecido, nem de protótipo', () => {
    for (const k of ['accuracyResult', 'i18nextLng', 'sb-abc-auth-token', '', 'IRISFLOW_settings', 'irisflowSettings', 'meu_irisflow_x', 'constructor', '__proto__', 'toString']) {
      expect(chaveEntraNoBackup(k), JSON.stringify(k)).toBe(false);
    }
  });
});

describe('chaves que ENTRAM no backup', () => {
  it('o que é da pessoa: ajustes, pacientes, frases, vocabulário, histórico de dor, lembretes, leituras, álbum, idioma', () => {
    const dados = [
      'irisflow_settings', 'irisflow_profiles', 'irisflow_auth', 'irisflow_reminders', 'irisflow_leituras', 'irisflow_captured_photos', 'irisflow_lang',
      'irisflow.assistente.desligado', 'irisflow.assistente.v1', 'irisflow_user_words', 'irisflow_user_bigrams', // o vocabulário (e o formato antigo dele)
      'irisflow_clinical_data', 'irisflow_clinical_migrado', // o histórico de dor (o aceite de registrá-lo NÃO viaja: ver "escolhas desta instalação")
    ];
    for (const k of dados) expect(chaveEntraNoBackup(k), k).toBe(true);
  });

  it('o que é de cada paciente também entra — são as frases, o vocabulário e o histórico dele', () => {
    for (const id of ['8d6f1f0a-aaaa-bbbb-cccc-000000000001', 'perfil-lq3x-ab12', 'guest']) {
      for (const k of chavesDoPaciente(id)) expect(chaveEntraNoBackup(k), k).toBe(true);
    }
  });

  it('chave nova com prefixo irisflow entra por padrão: o backup não deixa de fora o que as outras tarefas criarem', () => {
    for (const k of ['irisflow.futuro.ajuste', 'irisflow_novo_ajuste', 'irisflow.abreviacoes.dicionario', 'irisflow.voz.saida']) {
      expect(chaveEntraNoBackup(k), k).toBe(true);
    }
  });
});

describe('a saída da voz é deste computador', () => {
  it('saidaDaVoz (o id do aparelho de som, ex.: o cabo virtual) não viaja: noutro computador o id não vale', () => {
    expect(CAMPOS_PRESOS_AO_COMPUTADOR).toContain('saidaDaVoz');
  });
});

describe('as chaves de um paciente', () => {
  it('são as de cada família, com o id do paciente no fim — as frases, o vocabulário, o histórico, o tutorial, os favoritos e o painel do cuidador', () => {
    expect([...chavesDoPaciente('abc')].sort()).toEqual([
      'irisflow.abreviacoes.falas.v1.abc',
      'irisflow.abreviacoes.v1.abc',
      'irisflow.assistente.v1.abc',
      'irisflow.consulta.diario.v1.abc',
      'irisflow.consulta.perguntas.v1.abc',
      'irisflow.evolucao.uso.v1.abc',
      'irisflow.sugestoes.aceitacao.v1.abc',
      'irisflow.vozGuardada.frasesProprias.abc',
      'irisflow_caregiver_abc',
      'irisflow_clinical_data_abc',
      'irisflow_favorites_abc',
      'irisflow_tutorial_abc',
    ]);
  });

  it('o Preparo e a calibração do paciente NÃO são dele para levar: dependem da câmera e da tela', () => {
    const todas = chavesDoPaciente('abc');
    expect(todas.some((k) => k.startsWith('irisflow_setup_'))).toBe(false);
    expect(todas.some((k) => k.includes('calib'))).toBe(false);
  });
});

// Revisão final, rodada 1 (M4): remover o paciente apagava o modelo, as calibrações e as
// chaves do acompanhamento, mas deixava o painel do cuidador (diário e tarefas), os
// favoritos, o progresso do tutorial, as frases próprias da voz guardada e o Preparo.
// Eram dado de saúde sem dono, e o backup "Tudo" os levava a outro computador.
describe('tudo o que o computador guarda de um paciente (para remover o perfil)', () => {
  it('são as chaves de cada família MAIS o Preparo (que não viaja no backup, mas é dele e sai com ele)', () => {
    expect([...chavesLocaisDoPaciente('abc')].sort()).toEqual([...chavesDoPaciente('abc'), 'irisflow_setup_abc'].sort());
  });

  it('nenhuma é uma chave fixa do app nem de outro paciente: sempre termina no id do paciente', () => {
    for (const id of ['abc', 'perfil-lq3x-ab12', '8d6f1f0a-aaaa-bbbb-cccc-000000000001']) {
      for (const k of chavesLocaisDoPaciente(id)) {
        expect(k.endsWith(id), k).toBe(true);
        expect(k.slice(0, -id.length).length, k).toBeGreaterThan('irisflow'.length);
      }
    }
  });

  it('as famílias do paciente cobrem o painel do cuidador, os favoritos, o tutorial e as frases próprias da voz', () => {
    const todas = chavesLocaisDoPaciente('p1');
    for (const esperada of [
      'irisflow_caregiver_p1', 'irisflow_favorites_p1', 'irisflow_tutorial_p1', 'irisflow.vozGuardada.frasesProprias.p1', 'irisflow_setup_p1',
    ]) expect(todas, esperada).toContain(esperada);
  });
});

describe('as configurações na hora de restaurar', () => {
  const doBackup = JSON.stringify({
    schemaVersion: 1,
    dwellMs: 1800, theme: 'dark', soundEnabled: false, eyeDominance: 'left', modoDeEntrada: 'acionador', brightnessLevel: 0.7,
    // O que é do computador de ORIGEM:
    screenDiagonalIn: 15.6, viewingDistanceCm: 45, screenGeometrySource: 'manual', systemAccessGranted: true,
    cameraHorizontalFovDeg: 78, fovPorCamera: { 'cam-antiga': 78 }, ultimaCameraChave: 'cam-antiga', cameraDeviceId: 'id-da-cam-antiga',
    screenScaleFactor: 1.5, posicaoDaCamera: 'topo', monitorBrightness: 30,
  });

  it('o que a pessoa escolheu vem do backup; o que descreve a câmera e a tela fica como está NESTE computador', () => {
    const daqui = JSON.stringify({
      schemaVersion: 1,
      dwellMs: 900, theme: 'dark',
      screenDiagonalIn: 27, viewingDistanceCm: 70, screenGeometrySource: 'auto', systemAccessGranted: false,
      cameraHorizontalFovDeg: 69.7, fovPorCamera: { 'cam-nova': 69.7 }, ultimaCameraChave: 'cam-nova', cameraDeviceId: 'id-da-cam-nova',
      screenScaleFactor: 1, posicaoDaCamera: 'base', monitorBrightness: 80,
    });

    const r = JSON.parse(configuracoesParaRestaurar(doBackup, daqui));

    expect(r).toMatchObject({ dwellMs: 1800, soundEnabled: false, eyeDominance: 'left', modoDeEntrada: 'acionador', brightnessLevel: 0.7, schemaVersion: 1 });
    for (const campo of CAMPOS_PRESOS_AO_COMPUTADOR) expect(r[campo], campo).toEqual(JSON.parse(daqui)[campo]);
  });

  it('computador sem configurações próprias: os campos da câmera e da tela somem — valem os padrões, nunca os do computador de origem', () => {
    for (const daqui of [null, '{}', 'isto não é JSON', '[]']) {
      const r = JSON.parse(configuracoesParaRestaurar(doBackup, daqui));
      expect(r.dwellMs, String(daqui)).toBe(1800);
      for (const campo of CAMPOS_PRESOS_AO_COMPUTADOR) expect(campo in r, `${campo} / ${daqui}`).toBe(false);
    }
  });

  it('um valor do backup que não é um objeto JSON passa como veio: quem lê as configurações o descarta e usa os padrões', () => {
    for (const estranho of ['isto não é JSON', '[]', '42', 'null']) {
      expect(configuracoesParaRestaurar(estranho, '{"dwellMs":900,"screenDiagonalIn":27}'), estranho).toBe(estranho);
    }
  });

  it('a lista do que é preso ao computador cobre a geometria do posto, a câmera, o brilho do monitor e a saída da voz', () => {
    expect([...CAMPOS_PRESOS_AO_COMPUTADOR].sort()).toEqual([
      'cameraDeviceId', 'cameraHorizontalFovDeg', 'fovPorCamera', 'monitorBrightness', 'posicaoDaCamera', 'saidaDaVoz',
      'screenDiagonalIn', 'screenGeometrySource', 'screenScaleFactor', 'systemAccessGranted', 'ultimaCameraChave',
      'viewingDistanceCm',
    ]);
  });
});
