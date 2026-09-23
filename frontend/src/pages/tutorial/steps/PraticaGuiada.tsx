import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { GazeButton } from '../../../components/ui/GazeButton';

/**
 * Prática guiada.
 *
 * **Nunca reprova.** Sem tempo esgotado, sem "errou", sem pontuação. Quem está
 * aqui está aprendendo a usar os próprios olhos como ponteiro, muitas vezes com
 * uma doença que piora — um tutorial que diz "tente de novo" nessa situação é
 * uma barreira, e o paciente não tem como discordar dele.
 *
 * O alvo é um `<button>` comum de propósito: o `GazeContext` já sintetiza o
 * clique após o dwell configurado. Contar o tempo aqui criaria um segundo dwell
 * que divergiria do real no primeiro ajuste, e a prática ensinaria um tempo que
 * não é o do app.
 */

export const ALVOS_DA_PRATICA = 3;

/**
 * Posição de cada alvo dentro da arena, em fração da largura. Muda a cada
 * acerto: praticar três vezes no mesmo lugar ensina a fixar UM ponto; mudar
 * de lugar ensina a levar o olhar até o que se quer — que é o uso real.
 */
export const POSICOES_DA_PRATICA: readonly { x: number; y: number }[] = [
  { x: 0.5, y: 0.5 },
  { x: 0.2, y: 0.4 },
  { x: 0.8, y: 0.6 },
];

export type VereditoDoTempo = 'rapido' | 'bom' | 'lento' | 'indeterminado';

/** Abaixo disto foi mouse, não olhar. */
const MS_MINIMO_PARA_SER_OLHAR = 200;

/**
 * Classe que o `GazeContext` põe no alvo enquanto o olhar está sobre ele —
 * ou seja, enquanto o dwell está correndo. É o "início do dwell" que a
 * prática mede; ver `inicioDoDwell` abaixo.
 */
const CLASSE_DE_HOVER = 'gaze-hover';

/**
 * Compara o tempo DE DWELL (do olhar pousar no alvo até o clique) com o dwell
 * configurado.
 *
 * Heurística, e assumida como tal no §8 do spec: mede o que aconteceu, não o
 * conforto de quem estava olhando. A decisão continua sendo do cuidador.
 *
 * Antes media da montagem do alvo até o clique — o que, no primeiro alvo,
 * incluía o tempo de LER o título e o texto de apoio. Resultado: "você
 * segurou mais do que precisava" para quem só leu a instrução antes de olhar.
 * Conselho inventado, e no pior momento — o primeiro contato com o dwell.
 */
export function vereditoDoTempo(msAteOClique: number, dwellMs: number): VereditoDoTempo {
  // O cuidador testando com o mouse produz ~0 ms. "Disparou rápido demais,
  // aumente o tempo" a partir disso seria conselho inventado.
  if (msAteOClique < MS_MINIMO_PARA_SER_OLHAR) return 'indeterminado';
  if (msAteOClique < dwellMs * 0.6) return 'rapido';
  if (msAteOClique > dwellMs * 2.5) return 'lento';
  return 'bom';
}

export const PraticaGuiada: React.FC<{
  dwellMs: number;
  /** Chamado só quando o cuidador PEDE o ajuste. A prática não muda nada sozinha. */
  aoSugerirAjuste: () => void;
}> = ({ dwellMs, aoSugerirAjuste }) => {
  const { t } = useTranslation();
  const [feitos, setFeitos] = useState(0);
  const [veredito, setVeredito] = useState<VereditoDoTempo | null>(null);

  /**
   * Instante em que o olhar pousou no alvo corrente, ou `null` se ainda não
   * pousou (ou o clique veio do mouse, sem hover do olhar).
   *
   * Observado pela classe `gaze-hover` que o `GazeContext` põe e tira do alvo:
   * cada entrada do olhar reinicia a contagem, como o próprio dwell reinicia.
   * Sem esse instante não há veredito — "Registrado." e nada mais. É melhor
   * não opinar do que opinar sobre o tempo de leitura.
   */
  const inicioDoDwell = useRef<number | null>(null);
  const arena = useRef<HTMLDivElement>(null);

  const terminou = feitos >= ALVOS_DA_PRATICA;

  useEffect(() => {
    inicioDoDwell.current = null;
    if (terminou) return;
    const alvo = arena.current?.querySelector('button');
    if (!alvo || typeof MutationObserver === 'undefined') return;
    let sobre = alvo.classList.contains(CLASSE_DE_HOVER);
    if (sobre) inicioDoDwell.current = performance.now();
    const obs = new MutationObserver(() => {
      const agora = alvo.classList.contains(CLASSE_DE_HOVER);
      if (agora && !sobre) inicioDoDwell.current = performance.now();
      if (!agora && sobre) inicioDoDwell.current = null;
      sobre = agora;
    });
    obs.observe(alvo, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [feitos, terminou]);

  const acertou = () => {
    const inicio = inicioDoDwell.current;
    setVeredito(
      inicio === null ? 'indeterminado' : vereditoDoTempo(performance.now() - inicio, dwellMs)
    );
    inicioDoDwell.current = null;
    setFeitos((n) => n + 1);
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
          {feitos === 0 ? t('tutorial.pratica.title') : t('tutorial.pratica.deNovo')}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '1.05rem',
            lineHeight: 1.5,
            opacity: 0.8,
            color: 'var(--color-text-base)',
          }}
        >
          {t('tutorial.pratica.lead')}
        </p>
      </div>

      <div
        ref={arena}
        style={{
          position: 'relative',
          minHeight: 320,
          borderRadius: '1.25rem',
          border: '1px solid var(--color-card-border)',
          overflow: 'hidden',
        }}
      >
        {terminou ? (
          <strong
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              fontWeight: 800,
              color: 'var(--tint-ok-text)',
            }}
          >
            {t('tutorial.pratica.fim')}
          </strong>
        ) : (
          <GazeButton
            key={feitos}
            onClick={acertou}
            aria-label={t('tutorial.pratica.alvo', { n: feitos + 1 })}
            width={200}
            height={200}
            isolado
            className="animate-scale-in"
            style={{
              // Grande de propósito: a prática é sobre o TEMPO, não sobre a
              // pontaria. Um alvo pequeno mediria a calibração de novo.
              // GazeButton, e não <button>: é o anel de progresso dele que
              // mostra o dwell enchendo — a coisa que a prática ensina.
              position: 'absolute',
              left: `${POSICOES_DA_PRATICA[feitos % POSICOES_DA_PRATICA.length].x * 100}%`,
              top: `${POSICOES_DA_PRATICA[feitos % POSICOES_DA_PRATICA.length].y * 100}%`,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: '4px solid var(--color-primary)',
              background: 'var(--color-primary)',
              color: 'white',
              fontSize: '1.05rem',
              boxShadow: '0 0 0 10px rgba(27, 84, 168, 0.18), 0 0 40px rgba(27, 84, 168, 0.45)',
            }}
          >
            {t('tutorial.pratica.alvo', { n: feitos + 1 })}
          </GazeButton>
        )}
      </div>

      {/* Sem contagem de erros nem pontuação: só quanto falta, que é
          informação de progresso e não de desempenho. */}
      {!terminou && (
        <span
          role="status"
          aria-live="polite"
          style={{ fontSize: '0.9rem', opacity: 0.7, color: 'var(--color-text-base)' }}
        >
          {t('tutorial.pratica.restantes', { n: ALVOS_DA_PRATICA - feitos })}
        </span>
      )}

      {veredito && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.7rem',
            padding: '1rem 1.15rem',
            borderRadius: '1rem',
            background: veredito === 'bom' ? 'var(--tint-ok-bg)' : 'var(--tint-info-bg)',
            border: `1px solid ${veredito === 'bom' ? 'var(--tint-ok-border)' : 'var(--tint-info-border)'}`,
          }}
        >
          <span style={{ fontSize: '0.98rem', lineHeight: 1.5, color: 'var(--color-text-base)' }}>
            {t(`tutorial.pratica.${veredito}`)}
          </span>

          {/* Sugestão é sugestão: leva ao passo do ajuste, não muda o tempo.
              Mexer no dwell sem o cuidador pedir mudaria o app debaixo do
              paciente no meio do aprendizado. */}
          {(veredito === 'rapido' || veredito === 'lento') && (
            <GazeButton
              type="button"
              height={76}
              isolado
              onClick={aoSugerirAjuste}
              style={{
                width: '100%',
                background: 'var(--color-card-bg)',
                border: '2px solid var(--color-primary)',
                color: 'var(--color-primary)',
                borderRadius: '1rem',
                fontWeight: 700,
              }}
            >
              {t('tutorial.pratica.ajustar')} <ArrowRight size={18} aria-hidden="true" />
            </GazeButton>
          )}
        </div>
      )}
    </div>
  );
};
