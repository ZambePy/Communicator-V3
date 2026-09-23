import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { GazeButton } from './ui/GazeButton';
import {
  abandonarMissao,
  aoMudarMissao,
  missaoAtiva,
  missaoCumprida,
  passoGuardado,
  type Missao,
} from '../pages/tutorial/missao';
import { passoDaMissao } from '../pages/tutorial/passos';

/**
 * Faixa de "você está no tutorial" — mostrada NA TELA REAL enquanto a pessoa
 * está no passo do tutorial que pede esta missão.
 *
 * Existe por um motivo bem concreto: o tutorial manda a pessoa para o teclado
 * de verdade, e sem esta faixa ela chega lá sem saber por quê, sem saber o que
 * precisa fazer para o tutorial continuar, e — o pior — sem caminho de volta
 * que não seja adivinhar. Um paciente que só tem o olhar como entrada não pode
 * ficar sem saída visível.
 *
 * ## Por que ela é REATIVA e olha o PASSO, não só a missão ativa
 *
 * A versão anterior lia `missaoAtiva()` uma vez na montagem. Dois defeitos:
 *
 *   1. `cumprirMissao` zera a missão ativa. A tela que cumpre a missão (os
 *      jogos, o teclado) é a mesma em que a faixa está montada — então, no
 *      instante em que a pessoa fazia a coisa certa, a faixa ou ficava com o
 *      texto velho ou, ao remontar (jogo → voltar ao menu de jogos), sumia.
 *      Resultado: a pessoa cumpria a missão e ficava fora do tutorial, sem
 *      volta pelo olhar.
 *   2. Nada avisava a faixa quando o estado mudava.
 *
 * Agora ela aparece enquanto `passoGuardado()` for o passo desta missão (o
 * passo só é esquecido quando a pessoa sai do tutorial), troca o rótulo para
 * "Feito — voltar ao tutorial" quando a missão foi cumprida, e assina o evento
 * que `missao.ts` dispara a cada mudança.
 *
 * Três coisas, e só três: o que fazer, que isto é parte do tutorial, e como
 * voltar. A instrução vem de quem chamou, porque só o passo sabe o que pediu.
 *
 * O botão de voltar é `GazeButton` e ALTO (76 px, o mesmo dos outros alvos de
 * olhar do app): uma faixa fina é exatamente o formato em que o dwell zera com
 * um tremor vertical.
 */
export const FaixaDeMissao: React.FC<{
  /** A missão que esta tela cumpre. A faixa só aparece no passo dela. */
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
  /**
   * Classe e estilo extras no contêiner. Existe para a tela que põe a faixa
   * no TOPO (o teclado, sem cabeçalho canônico) passar `reserva-emergencia`:
   * sem isso o botão "Voltar ao tutorial" caía exatamente embaixo do botão de
   * Emergência, que é fixo no canto superior direito.
   */
  className?: string;
  style?: React.CSSProperties;
}> = ({ missao, instrucao, tom = 'padrao', className, style }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const lerEstado = useCallback(() => {
    const passo = passoGuardado();
    const nestePasso = passo !== null && passo === passoDaMissao(missao);
    // `missaoAtiva()` cobre o caso de um passo guardado divergente (não deve
    // acontecer, mas custa nada): se a missão ativa é esta, a faixa aparece.
    return {
      visivel: nestePasso || missaoAtiva() === missao,
      cumprida: missaoCumprida(missao),
    };
  }, [missao]);

  const [estado, setEstado] = useState(lerEstado);

  useEffect(() => {
    setEstado(lerEstado());
    return aoMudarMissao(() => setEstado(lerEstado()));
  }, [lerEstado]);

  if (!estado.visivel) return null;

  const escuro = tom === 'escuro';
  const cores = escuro
    ? { fundo: '#151B24', borda: '#232C3A', texto: '#EDF1F7' }
    : estado.cumprida
      ? { fundo: 'var(--tint-ok-bg)', borda: 'var(--tint-ok-border)', texto: 'var(--tint-ok-text)' }
      : { fundo: 'var(--tint-info-bg)', borda: 'var(--tint-info-border)', texto: 'var(--tint-info-text)' };

  const voltar = () => {
    // Voltar sem cumprir é legítimo e não é fracasso: o passo continua lá,
    // com o convite, e a pessoa pode tentar de novo ou seguir em frente.
    if (!estado.cumprida) abandonarMissao();
    navigate('/tutorial');
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={className}
      style={{
        ...style,
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
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '1.05rem',
          lineHeight: 1.45,
          fontWeight: 700,
          flex: 1,
        }}
      >
        {estado.cumprida && <Check size={22} aria-hidden="true" />}
        {estado.cumprida ? t('tutorial.faixa.cumprida') : instrucao}
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
        {estado.cumprida ? t('tutorial.faixa.feito') : t('tutorial.faixa.voltar')}
      </GazeButton>
    </div>
  );
};
