import { describe, it, expect } from 'vitest';
import {
  PASSOS_DO_TUTORIAL,
  MISSAO_DO_PASSO,
  PASSO_COM_TRAVA,
  ESPERA_MAXIMA_MS,
  ehPassoDoTutorial,
  proximoPassoDoTutorial,
  passoAnteriorDoTutorial,
} from './passos';
import { MISSOES } from './missao';

// -----------------------------------------------------------------------------
// A ordem é a do aprendizado: primeiro COMO se clica com o olhar (entender,
// praticar, ajustar o tempo à luz da prática), depois O QUE se faz com isso, na
// ordem em que importa para quem não consegue falar — dizer algo pronto,
// escrever algo próprio, responder, e por fim brincar. A emergência fica no
// fim porque é dwell mais longo e não faz sentido antes de o dwell comum estar
// entendido.
// -----------------------------------------------------------------------------

describe('a ordem dos passos', () => {
  it('vai da interação básica até o resto do app, na ordem do aprendizado', () => {
    expect(PASSOS_DO_TUTORIAL).toEqual([
      'oQueEDwell',
      'pratica',
      'ajuste',
      'comunicacao',
      'digitacao',
      'conversa',
      'lazer',
      'recursos',
      'emergencia',
      'concluido',
    ]);
  });

  it('interação vem antes de comunicação, e comunicação antes de escrever', () => {
    const i = (p: string) => (PASSOS_DO_TUTORIAL as readonly string[]).indexOf(p);
    expect(i('oQueEDwell')).toBeLessThan(i('pratica'));
    expect(i('pratica')).toBeLessThan(i('ajuste'));
    expect(i('ajuste')).toBeLessThan(i('comunicacao'));
    expect(i('comunicacao')).toBeLessThan(i('digitacao'));
    expect(i('digitacao')).toBeLessThan(i('conversa'));
    expect(i('conversa')).toBeLessThan(i('lazer'));
    expect(i('lazer')).toBeLessThan(i('recursos'));
    expect(i('emergencia')).toBe(PASSOS_DO_TUTORIAL.length - 2);
  });

  it('CONFIGURAÇÕES não é passo da jornada do paciente', () => {
    // Deliberado: é a tela em que uma escolha errada quebra o rastreamento que
    // o paciente acabou de calibrar, e ele não tem como saber disso. O
    // tutorial cita Ajustes como informação para o cuidador (ver
    // `MaisRecursos`), nunca como destino obrigatório.
    expect(PASSOS_DO_TUTORIAL).not.toContain('ajustes');
    expect(PASSOS_DO_TUTORIAL).not.toContain('configuracoes');
    expect(PASSOS_DO_TUTORIAL).not.toContain('settings');
  });
});

describe('missões — os passos que se cumprem na tela real', () => {
  it('cada missão declarada existe de fato', () => {
    for (const m of Object.values(MISSAO_DO_PASSO)) {
      expect(MISSOES).toContain(m);
    }
  });

  it('toda missão tem um passo que a pede — nenhuma sobra', () => {
    const pedidas = new Set(Object.values(MISSAO_DO_PASSO));
    for (const m of MISSOES) expect(pedidas.has(m)).toBe(true);
  });

  it('as quatro grandes partes do app estão na jornada', () => {
    expect(MISSAO_DO_PASSO.comunicacao).toBe('comunicacao');
    expect(MISSAO_DO_PASSO.digitacao).toBe('digitacao');
    expect(MISSAO_DO_PASSO.conversa).toBe('conversa');
    expect(MISSAO_DO_PASSO.lazer).toBe('lazer');
  });

  it('todo passo com missão é um passo que existe', () => {
    for (const p of Object.keys(MISSAO_DO_PASSO)) {
      expect(ehPassoDoTutorial(p)).toBe(true);
    }
  });
});

describe('a trava', () => {
  it('é a de ESCREVER UMA FRASE, e só ela', () => {
    // Escrever a primeira frase é o que transforma "o app responde ao meu
    // olhar" em "eu consigo dizer o que eu quiser" — e é a única coisa do
    // tutorial que ninguém aprende assistindo.
    expect(PASSO_COM_TRAVA).toBe('digitacao');
  });

  it('tem escapatória por tempo, e ela é generosa', () => {
    // Uma trava sem saída num app assistivo é uma armadilha: se o
    // rastreamento estiver ruim naquele minuto, a pessoa fica presa numa tela
    // sem poder nem pedir ajuda. 90 s é bem mais que o tempo de escrever uma
    // palavra curta pelo olhar.
    expect(ESPERA_MAXIMA_MS).toBeGreaterThanOrEqual(60_000);
    expect(ESPERA_MAXIMA_MS).toBeLessThanOrEqual(180_000);
  });
});

describe('navegação', () => {
  it('avança até o fim', () => {
    expect(proximoPassoDoTutorial('oQueEDwell')).toBe('pratica');
    expect(proximoPassoDoTutorial('concluido')).toBeNull();
  });

  it('volta é sempre livre', () => {
    for (const p of PASSOS_DO_TUTORIAL.slice(1)) {
      expect(passoAnteriorDoTutorial(p)).not.toBeNull();
    }
  });

  it('do primeiro não volta', () => {
    expect(passoAnteriorDoTutorial('oQueEDwell')).toBeNull();
  });

  it('a cadeia percorre todos os passos, sem buraco nem repetição', () => {
    const vistos: string[] = ['oQueEDwell'];
    let p = proximoPassoDoTutorial('oQueEDwell');
    while (p) {
      expect(vistos).not.toContain(p);
      vistos.push(p);
      p = proximoPassoDoTutorial(p);
    }
    expect(vistos).toEqual([...PASSOS_DO_TUTORIAL]);
  });
});

describe('ehPassoDoTutorial', () => {
  it('aceita os passos e recusa o resto — é ele que valida o que veio do storage', () => {
    for (const p of PASSOS_DO_TUTORIAL) expect(ehPassoDoTutorial(p)).toBe(true);
    expect(ehPassoDoTutorial('ajustes')).toBe(false);
    expect(ehPassoDoTutorial('')).toBe(false);
    expect(ehPassoDoTutorial(null)).toBe(false);
    expect(ehPassoDoTutorial(3)).toBe(false);
  });
});
