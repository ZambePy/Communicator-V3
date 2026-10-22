import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
// O `React` em escopo: os testes daqui rodam com o JSX clássico.
import React from 'react';
import { GazeStatusBanner, escolherAvisoDoOlhar, problemaPersistenteDoOlhar, type EntradasDoAviso } from './GazeStatusBanner';

// A regra de qual aviso vale (relato de 19/10/2026). É pura e compartilhada:
// o banner mostra o aviso escolhido, e o serviço de problema persistente usa o
// MESMO aviso para decidir se avisa o cuidador. Os avisos de rastreamento têm
// um tipo; os de configuração, não.

const base: EntradasDoAviso = { state: 'tracking', cameraError: null, calibrationInvalidated: null };
const MODELO = { titulo: 'O modelo do olhar parou de responder', detalhe: 'Estou reiniciando ele sozinho.' };

describe('escolherAvisoDoOlhar — precedência', () => {
  it('nada a dizer: null', () => {
    expect(escolherAvisoDoOlhar(base)).toBeNull();
  });

  it('a contraluz vence o rosto perdido e os olhos fechados (a causa dos dois é a luz)', () => {
    const a = escolherAvisoDoOlhar({
      ...base,
      avisoDeContraluz: 'Há uma luz forte atrás de você.',
      gazeLostMessage: 'Não estou vendo seu rosto, tentando de novo…',
      avisoDeOlhosFechados: 'Os olhos parecem fechados.',
    });
    expect(a).toMatchObject({ titulo: 'Luz forte atrás de você', problema: 'contraluz', tom: 'aviso' });
  });

  it('o acionamento que falhou é erro, acima da contraluz e da calibração inválida', () => {
    const a = escolherAvisoDoOlhar({
      ...base,
      avisoDeAcionamento: 'Estou tentando de novo.',
      avisoDeContraluz: 'Luz.',
      calibrationInvalidated: 'A janela mudou.',
    });
    expect(a).toMatchObject({ titulo: 'O acionamento pelo olhar falhou', tom: 'erro', problema: 'acionamento_falhou' });
  });

  it('a câmera vence tudo', () => {
    const a = escolherAvisoDoOlhar({
      ...base,
      state: 'error',
      cameraError: 'A câmera está ocupada.',
      avisoDeAcionamento: 'x',
      avisoDeContraluz: 'y',
    });
    expect(a).toMatchObject({ problema: 'camera', tom: 'erro' });
    expect(escolherAvisoDoOlhar({ ...base, state: 'sem_camera' })?.problema).toBe('camera');
    expect(escolherAvisoDoOlhar({ ...base, state: 'error' })?.problema).toBe('rastreamento_parado');
  });

  it('o modelo do olhar parado fica abaixo dos olhos fechados e acima da borda', () => {
    expect(escolherAvisoDoOlhar({ ...base, avisoDoModelo: MODELO, avisoDeOlhosFechados: 'Olhos.' })?.problema)
      .toBe('olhos_fechados');
    const a = escolherAvisoDoOlhar({ ...base, avisoDoModelo: MODELO, avisoDeBorda: 'Borda.' });
    expect(a).toMatchObject({ titulo: MODELO.titulo, detalhe: MODELO.detalhe, problema: 'modelo_do_olhar', tom: 'aviso' });
  });

  it('o rosto perdido tem tipo, e o título é o texto calmo do fallback', () => {
    const a = escolherAvisoDoOlhar({ ...base, gazeLostMessage: 'Não estou vendo seu rosto, tentando de novo…' });
    expect(a).toMatchObject({ titulo: 'Não estou vendo seu rosto, tentando de novo…', problema: 'rosto_perdido' });
  });

  it('avisos de configuração não são problema de rastreamento', () => {
    const semTipo: EntradasDoAviso[] = [
      { ...base, calibrationInvalidated: 'A janela mudou.' },
      { ...base, avisoDeTela: 'A janela saiu da tela cheia.' },
      { ...base, avisoDeBorda: 'Olhe um pouco para cima.' },
      { ...base, distanceAdvice: 'Você está mais perto.' },
      { ...base, avisoDePostura: true },
      { ...base, avisoDeRecalibracao: 'bcea' },
      { ...base, avisoDeCamera: 'Outra câmera.' },
    ];
    for (const e of semTipo) {
      const a = escolherAvisoDoOlhar(e);
      expect(a).not.toBeNull();
      expect(a!.problema).toBeNull();
    }
  });

  it('o modo reduzido da janela vence a contraluz (a janela é a causa de ele estar reduzido)', () => {
    const a = escolherAvisoDoOlhar({ ...base, avisoDeTela: 'Reduzido.', avisoDeContraluz: 'Luz.' });
    expect(a).toMatchObject({ titulo: 'O olhar está em modo reduzido', problema: null });
  });
});

// Revisão de UX de 19/10/2026: o problema que persiste (e vira aviso ao
// cuidador) não é o que o banner mostra. Os avisos de configuração na frente
// do banner calavam o aviso justamente com a calibração perdida.
describe('problemaPersistenteDoOlhar — o que conta para o cuidador', () => {
  it('a calibração que deixou de valer não esconde o problema de rastreamento', () => {
    expect(problemaPersistenteDoOlhar({ ...base, calibrationInvalidated: 'O modelo reiniciou.', gazeLostMessage: 'Não estou vendo seu rosto.' })?.tipo)
      .toBe('rosto_perdido');
    expect(problemaPersistenteDoOlhar({ ...base, avisoDeTela: 'Reduzido.', avisoDePoucaLuz: 'Escuro.' })?.tipo).toBe('pouca_luz');
    expect(problemaPersistenteDoOlhar({ ...base, avisoDeTela: 'Reduzido.', avisoDeContraluz: 'Luz.' })?.tipo).toBe('contraluz');
    expect(problemaPersistenteDoOlhar({ ...base, cameraError: 'Ocupada.', calibrationInvalidated: 'x' })?.tipo).toBe('camera');
  });

  it('sem problema de rastreamento, a calibração perdida é o problema (o rosto está lá e nada aciona)', () => {
    const p = problemaPersistenteDoOlhar({ ...base, calibrationInvalidated: 'O modelo do olhar reiniciou em outro tamanho.' });
    expect(p).toMatchObject({ tipo: 'calibracao_perdida' });
    expect(p!.mensagem).toMatch(/calibrar de novo/);
    // Mas olhos fechados (descanso, sono) continuam sendo o que vale.
    expect(problemaPersistenteDoOlhar({ ...base, calibrationInvalidated: 'x', avisoDeOlhosFechados: 'Olhos.' })?.tipo).toBe('olhos_fechados');
  });

  it('calibração suspensa pelo recorte do modelo é problema (não volta sozinha); pela janela, não', () => {
    expect(problemaPersistenteDoOlhar({ ...base, avisoDeTela: 'O IrisFlow precisou reiniciar a leitura do rosto.', suspensaoPeloRecorte: true }))
      .toMatchObject({ tipo: 'olhar_reduzido' });
    expect(problemaPersistenteDoOlhar({ ...base, avisoDeTela: 'A janela não está do tamanho.', suspensaoPeloRecorte: false })).toBeNull();
    // Problema de rastreamento continua vencendo.
    expect(problemaPersistenteDoOlhar({ ...base, avisoDeTela: 'x', suspensaoPeloRecorte: true, avisoDePoucaLuz: 'Escuro.' })?.tipo).toBe('pouca_luz');
  });

  it('os avisos de configuração sozinhos não são problema; a escolha do banner não muda', () => {
    for (const e of [
      { ...base, avisoDeTela: 'A janela saiu da tela cheia.' },
      { ...base, avisoDeBorda: 'Olhe um pouco para cima.' },
      { ...base, distanceAdvice: 'Você está mais perto.' },
      { ...base, avisoDePostura: true },
    ] as EntradasDoAviso[]) {
      expect(problemaPersistenteDoOlhar(e)).toBeNull();
    }
    expect(problemaPersistenteDoOlhar(base)).toBeNull();
    // O banner continua mostrando a calibração na frente.
    expect(escolherAvisoDoOlhar({ ...base, calibrationInvalidated: 'x', gazeLostMessage: 'Rosto.' })?.titulo).toBe('A calibração deixou de valer');
  });
});

describe('o banner mostra o aviso escolhido', () => {
  it('contraluz: o título da luz, sem botão de reajuste (reajustar não tira a janela de trás)', () => {
    render(<GazeStatusBanner {...base} avisoDeContraluz="Há uma luz forte atrás de você." onReancorar={() => {}} />);
    expect(screen.getByText('Luz forte atrás de você')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('acionamento que falhou: o título e o detalhe, com o tom de erro', () => {
    render(<GazeStatusBanner {...base} avisoDeAcionamento="O mouse e o teclado continuam funcionando." />);
    expect(screen.getByText('O acionamento pelo olhar falhou')).toBeInTheDocument();
    expect(screen.getByText(/o mouse e o teclado continuam funcionando/i)).toBeInTheDocument();
  });
});
