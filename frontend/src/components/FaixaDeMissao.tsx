import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GazeButton } from './ui/GazeButton';
import { missaoAtiva, abandonarMissao, type Missao } from '../pages/tutorial/missao';

/**
 * Faixa de "você está no tutorial" — mostrada NA TELA REAL enquanto uma missão
 * do tutorial está em curso.
 *
 * Existe por um motivo bem concreto: o tutorial manda a pessoa para o teclado
 * de verdade, e sem esta faixa ela chega lá sem saber por quê, sem saber o que
 * precisa fazer para o tutorial continuar, e — o pior — sem caminho de volta
 * que não seja adivinhar. Um paciente que só tem o olhar como entrada não pode
 * ficar sem saída visível.
 *
 * Três coisas, e só três: o que fazer, que isto é parte do tutorial, e como
 * voltar. A instrução vem de quem chamou, porque só o passo sabe o que pediu.
 *
 * O botão de voltar é `GazeButton` e ALTO (76 px, o mesmo dos outros alvos de
 * olhar do app): uma faixa fina é exatamente o formato em que o dwell zera com
 * um tremor vertical.
 */
export const FaixaDeMissao: React.FC<{
  /** A missão que esta tela cumpre. A faixa só aparece se for a ativa. */
  missao: Missao;
  /** O que a pessoa precisa fazer aqui, em uma frase. */
  instrucao: string;
  /**
   * Tom visual. `'escuro'` existe para o teclado ocular, que tem paleta
   * própria (quase-preto) e onde o azul claro do tom padrão vira uma mancha
   * clara na periferia — e movimento/contraste periférico dispara sacada
   * reflexa, que é exatamente o que aquela tela foi desenhada para evitar.
   */
  tom?: 'padrao' | 'escuro';
}> = ({ missao, instrucao, tom = 'padrao' }) => {
  const navigate = useNavigate();
  // Lido uma vez na montagem e depois só quando a tela avisa: `sessionStorage`
  // não emite eventos para a própria aba, então observar em intervalo seria
  // custo por quadro para uma coisa que muda no máximo duas vezes por sessão.
  const [ativa, setAtiva] = useState<Missao | null>(null);

  useEffect(() => {
    setAtiva(missaoAtiva());
  }, []);

  if (ativa !== missao) return null;

  const escuro = tom === 'escuro';
  const cores = escuro
    ? { fundo: '#151B24', borda: '#232C3A', texto: '#EDF1F7' }
    : { fundo: 'var(--tint-info-bg)', borda: 'var(--tint-info-border)', texto: 'var(--tint-info-text)' };

  const voltar = () => {
    // Voltar sem cumprir é legítimo e não é fracasso: o passo continua lá,
    // com o convite, e a pessoa pode tentar de novo ou seguir em frente.
    abandonarMissao();
    navigate('/tutorial');
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        padding: '1rem 1.25rem',
        borderRadius: '1rem',
        background: cores.fundo,
        border: `1px solid ${cores.borda}`,
        color: cores.texto,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <span style={{ fontSize: '1.05rem', lineHeight: 1.45, fontWeight: 700, flex: 1 }}>
        {instrucao}
      </span>
      <GazeButton
        type="button"
        height={76}
        isolado
        onClick={voltar}
        style={{
          background: 'transparent',
          border: '2px solid currentColor',
          color: 'inherit',
          padding: '0 1.4rem',
          borderRadius: '1rem',
          fontWeight: 700,
        }}
      >
        Voltar ao tutorial
      </GazeButton>
    </div>
  );
};
