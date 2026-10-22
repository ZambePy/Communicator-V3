import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apagarModelo,
  apagarModeloDoPerfil,
  definirPerfilDoAssistente,
  reiniciarParaTeste,
} from '../assistente/armazenamento';
import { _esquecerAvisosParaTeste } from '../assistente/avisoUnico';
import { BASE_DAS_ABREVIACOES, BASE_DAS_FALAS, chaveDoPaciente } from '../assistente/chavesPorPaciente';
import { MAX_ABREVIACOES_MINHAS, SEMENTES } from './dicionario';
import {
  aprenderAbreviacoesDaFala,
  dicionarioDasAbreviacoes,
  listarAbreviacoesDoPaciente,
  removerAbreviacao,
  restaurarSementes,
  salvarAbreviacao,
} from './armazenamento';

// O dicionário mora no computador, por paciente, e guarda SÓ o que a pessoa
// mudou: as sementes vêm do código. Nada aqui usa memória entre chamadas — cada
// leitura vai ao armazenamento —, então "reabrir o aplicativo" é só ler de novo.

beforeEach(() => {
  localStorage.clear();
  reiniciarParaTeste();
  _esquecerAvisosParaTeste();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const falar = (texto: string, vezes: number) => {
  for (let i = 0; i < vezes; i++) aprenderAbreviacoesDaFala(texto);
};

describe('o dicionário do paciente', () => {
  it('sem nada guardado são as sementes, e nada é gravado só por olhar', () => {
    expect(dicionarioDasAbreviacoes()).toEqual({ ...SEMENTES });
    expect(localStorage.length).toBe(0);
  });

  it('uma abreviação nova entra no dicionário e continua lá depois de reabrir', () => {
    expect(salvarAbreviacao('CTZ', 'certeza')).toEqual({ ok: true, sigla: 'ctz', significado: 'certeza' });
    reiniciarParaTeste();
    expect(dicionarioDasAbreviacoes().ctz).toBe('certeza');
    expect(listarAbreviacoesDoPaciente().find((i) => i.sigla === 'ctz')).toMatchObject({ origem: 'minha' });
  });

  it('mudar uma semente vale; voltar ao significado original não deixa nada guardado', () => {
    salvarAbreviacao('pq', 'porque');
    expect(dicionarioDasAbreviacoes().pq).toBe('porque');
    expect(listarAbreviacoesDoPaciente().find((i) => i.sigla === 'pq')).toMatchObject({ mudada: true });

    salvarAbreviacao('pq', 'por que');
    expect(dicionarioDasAbreviacoes().pq).toBe('por que');
    const guardado = JSON.parse(localStorage.getItem(chaveDoPaciente(BASE_DAS_ABREVIACOES, null)) ?? '{}');
    expect(guardado.editadas).toEqual({});
  });

  it('recusa o que não vale com o motivo, sem gravar nada', () => {
    const r = salvarAbreviacao('o b g', 'obrigado');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/só letras/);
    expect(localStorage.length).toBe(0);
  });

  it('o limite de abreviações escritas à mão vale para as novas; mudar uma que já existe continua valendo', () => {
    const siglas = Array.from({ length: MAX_ABREVIACOES_MINHAS }, (_, i) => `x${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);
    for (const sigla of siglas) expect(salvarAbreviacao(sigla, `significado ${sigla}`).ok).toBe(true);

    const demais = salvarAbreviacao('zzz', 'mais uma');
    expect(demais.ok).toBe(false);
    if (!demais.ok) expect(demais.motivo).toMatch(/Apague alguma/);

    expect(salvarAbreviacao(siglas[0], 'outro significado').ok).toBe(true);
  });

  it('apagar uma semente a esconde; restaurar traz de volta e deixa as minhas', () => {
    salvarAbreviacao('ctz', 'certeza');
    salvarAbreviacao('pq', 'porque');
    removerAbreviacao('vc');
    expect(dicionarioDasAbreviacoes().vc).toBeUndefined();

    restaurarSementes();
    const d = dicionarioDasAbreviacoes();
    expect(d.vc).toBe('você');
    expect(d.pq).toBe('por que');
    expect(d.ctz).toBe('certeza');
  });

  it('apagar uma abreviação minha a tira da lista de vez', () => {
    salvarAbreviacao('ctz', 'certeza');
    removerAbreviacao('ctz');
    expect(dicionarioDasAbreviacoes().ctz).toBeUndefined();
    expect(listarAbreviacoesDoPaciente().some((i) => i.sigla === 'ctz')).toBe(false);
  });

  it('acrescentar de novo uma sigla apagada a traz de volta', () => {
    removerAbreviacao('vc');
    salvarAbreviacao('vc', 'você mesmo');
    expect(dicionarioDasAbreviacoes().vc).toBe('você mesmo');
  });

  it('cada paciente tem o seu dicionário', () => {
    definirPerfilDoAssistente('ana');
    salvarAbreviacao('ctz', 'certeza');
    definirPerfilDoAssistente('bruno');
    expect(dicionarioDasAbreviacoes().ctz).toBeUndefined();
    salvarAbreviacao('ctz', 'com toda a certeza');
    definirPerfilDoAssistente('ana');
    expect(dicionarioDasAbreviacoes().ctz).toBe('certeza');
  });

  it('dado corrompido: volta às sementes e avisa no console uma vez só', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(chaveDoPaciente(BASE_DAS_ABREVIACOES, null), '{isto não é json');
    expect(dicionarioDasAbreviacoes()).toEqual({ ...SEMENTES });
    dicionarioDasAbreviacoes();
    dicionarioDasAbreviacoes();
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('dado de formato errado não derruba: o que não presta é ignorado', () => {
    localStorage.setItem(
      chaveDoPaciente(BASE_DAS_ABREVIACOES, null),
      JSON.stringify({ editadas: { ok: 'certo', 'ruim!': 'x', longa: 7, __proto__: 'x' }, removidas: ['vc', 42, '??'] }),
    );
    const d = dicionarioDasAbreviacoes();
    expect(d.ok).toBe('certo');
    expect(d['ruim!']).toBeUndefined();
    expect(d.longa).toBeUndefined();
    expect(d.vc).toBeUndefined();
    expect(d.obg).toBe('obrigado');
  });

  it('armazenamento cheio: devolve o motivo em vez de fingir que guardou', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota');
    });
    const r = salvarAbreviacao('ctz', 'certeza');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/não foi possível guardar/i);
    expect(aviso).toHaveBeenCalledTimes(1);
    salvarAbreviacao('ctz', 'certeza');
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe('abreviações aprendidas do que o paciente escreve por extenso', () => {
  it('a frase falada três vezes vira sigla; duas ainda não', () => {
    falar('Estou com dor', 2);
    expect(dicionarioDasAbreviacoes().ecd).toBeUndefined();
    falar('ESTOU COM DOR.', 1);
    expect(dicionarioDasAbreviacoes().ecd).toBe('estou com dor');
  });

  it('aparece na lista como aprendida', () => {
    falar('quero mudar de posição', 3);
    expect(listarAbreviacoesDoPaciente().find((i) => i.sigla === 'qmdp')).toMatchObject({
      origem: 'aprendida',
      significado: 'quero mudar de posição',
    });
  });

  it('texto longo, palavra solta e vazio não contam e não gravam nada', () => {
    falar('quero que você me traga um copo de água gelada por favor', 5);
    falar('obrigado', 5);
    falar('   ', 5);
    expect(localStorage.getItem(chaveDoPaciente(BASE_DAS_FALAS, null))).toBeNull();
  });

  it('a sigla de uma semente nunca é trocada pela aprendida', () => {
    falar('tenho dor', 5);
    expect(dicionarioDasAbreviacoes().td).toBe('tudo');
  });

  it('o que a pessoa escreveu para a mesma sigla vence a aprendida', () => {
    salvarAbreviacao('ecd', 'estou com desconforto');
    falar('estou com dor', 5);
    expect(dicionarioDasAbreviacoes().ecd).toBe('estou com desconforto');
  });

  it('apagar uma aprendida a esconde e ela não volta sozinha', () => {
    falar('estou com dor', 3);
    removerAbreviacao('ecd');
    expect(dicionarioDasAbreviacoes().ecd).toBeUndefined();
    falar('estou com dor', 3);
    expect(dicionarioDasAbreviacoes().ecd).toBeUndefined();
  });

  it('apagar uma abreviação que a pessoa mudou à mão esconde também a aprendida da mesma sigla', () => {
    falar('estou com dor', 3);
    salvarAbreviacao('ecd', 'estou com muita dor');
    removerAbreviacao('ecd');
    expect(dicionarioDasAbreviacoes().ecd).toBeUndefined();
  });

  it('cada paciente aprende com a própria fala', () => {
    definirPerfilDoAssistente('ana');
    falar('estou com dor', 3);
    definirPerfilDoAssistente('bruno');
    expect(dicionarioDasAbreviacoes().ecd).toBeUndefined();
  });

  it('"Apagar o aprendizado" tira as aprendidas e deixa as que a pessoa escreveu', () => {
    salvarAbreviacao('ctz', 'certeza');
    falar('estou com dor', 3);
    expect(dicionarioDasAbreviacoes().ecd).toBe('estou com dor');

    apagarModelo();
    const d = dicionarioDasAbreviacoes();
    expect(d.ecd).toBeUndefined();
    expect(d.ctz).toBe('certeza');
  });

  it('perfil removido: as abreviações dele saem do computador', () => {
    definirPerfilDoAssistente('ana');
    salvarAbreviacao('ctz', 'certeza');
    falar('estou com dor', 3);
    apagarModeloDoPerfil('ana');
    expect(localStorage.getItem(chaveDoPaciente(BASE_DAS_ABREVIACOES, 'ana'))).toBeNull();
    expect(localStorage.getItem(chaveDoPaciente(BASE_DAS_FALAS, 'ana'))).toBeNull();
    expect(dicionarioDasAbreviacoes().ctz).toBeUndefined();
  });

  it('nunca estoura: um erro ao gravar a fala não chega a quem falou', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota');
    });
    expect(() => falar('estou com dor', 1)).not.toThrow();
  });
});
