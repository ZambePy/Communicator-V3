import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { GazeButton } from '../../../components/ui/GazeButton';
import {
  iniciarMissao,
  missaoCumprida,
  guardarPasso,
  type Missao,
} from '../missao';

/**
 * Um passo do tutorial que se cumpre NA TELA REAL.
 *
 * Todos os passos da segunda metade do tutorial têm a mesma forma: explicam o
 * que aquela parte do app faz, convidam a ir até lá, e reconhecem quando a
 * pessoa voltou tendo feito. O que muda entre eles é o texto, a rota e a
 * missão — então isso é o que vem por parâmetro.
 *
 * **Não é uma tela explicativa.** O botão leva ao teclado de verdade, às
 * frases de verdade, ao jogo de verdade. A alternativa — desenhar miniaturas
 * dentro do tutorial — ensinaria uma interface que não existe, e o paciente
 * estaria de novo no zero na primeira vez que abrisse a de verdade.
 */
export const PassoDeMissao: React.FC<{
  missao: Missao;
  /** Passo do tutorial a retomar quando a pessoa voltar. */
  passo: string;
  rota: string;
  titulo: string;
  texto: string;
  /** Rótulo do botão que leva à tela real. */
  convite: string;
  /** Confirmação mostrada quando a missão foi cumprida. */
  feito: string;
  /** Avisado quando a missão está cumprida, para o wizard liberar o Continuar. */
  aoCumprir?: (cumprida: boolean) => void;
}> = ({ missao, passo, rota, titulo, texto, convite, feito, aoCumprir }) => {
  const navigate = useNavigate();
  const [cumprida, setCumprida] = useState(false);

  useEffect(() => {
    const ok = missaoCumprida(missao);
    setCumprida(ok);
    aoCumprir?.(ok);
  }, [missao, aoCumprir]);

  const ir = () => {
    // A ordem importa: guardar o passo ANTES de navegar. Se a pessoa der F5 na
    // tela de destino, é este valor que a traz de volta ao passo certo.
    guardarPasso(passo);
    iniciarMissao(missao);
    navigate(rota);
  };

  return (
    <div
      className="entrada-encadeada"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 800,
            color: 'var(--color-text-base)',
          }}
        >
          {titulo}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '1.05rem',
            lineHeight: 1.5,
            opacity: 0.85,
            color: 'var(--color-text-base)',
          }}
        >
          {texto}
        </p>
      </div>

      <GazeButton type="button" height={96} onClick={ir} style={{ width: '100%' }}>
        {convite} <ArrowRight size={20} aria-hidden="true" />
      </GazeButton>

      {cumprida && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '1rem 1.15rem',
            borderRadius: '1rem',
            background: 'var(--tint-ok-bg)',
            border: '1px solid var(--tint-ok-border)',
            color: 'var(--tint-ok-text)',
            fontSize: '1rem',
            lineHeight: 1.5,
          }}
        >
          <Check size={20} aria-hidden="true" /> {feito}
        </div>
      )}
    </div>
  );
};
