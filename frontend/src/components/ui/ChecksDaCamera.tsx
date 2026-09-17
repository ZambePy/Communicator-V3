import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Circle } from 'lucide-react';
import { useGaze } from '../../context/GazeContext';
import { useSettings } from '../../context/SettingsContext';
import {
  evaluateReadiness,
  type ReadinessCheck,
  type ReadinessReport,
} from '@tracker/setupReadiness';
import { snapshotFromDiagnostics, lerViewport } from '@tracker/setupReadinessAdapter';
import { guardarProntidao } from '../../ultimaProntidao';

/**
 * Lista viva de checks da câmera, para o PACIENTE.
 *
 * O `ReadinessPanel` lista os onze checks do `evaluateReadiness` com as
 * mensagens do cuidador. Aqui são três linhas — rosto, luz, enquadramento —
 * com ✓ ou ○, porque quem está sentado na frente da câmera não precisa de
 * "viewport" nem de "cintilação": precisa ver o sistema entendendo-o.
 *
 * Não mede nada por conta própria: resume os mesmos checks. Um segundo
 * avaliador aqui divergiria do primeiro no primeiro ajuste de limiar.
 *
 * `pronto` sai `true` quando os três passam — ou, depois de `esperaMaximaMs`
 * com algum ainda pendente, com um aviso. E sai `true` também quando NADA foi
 * medido (câmera ainda abrindo, engine sem diagnóstico): prender a pessoa
 * numa tela porque o software não conseguiu medir é o beco sem saída que este
 * projeto proíbe.
 */

export type EstadoDoItem = 'ok' | 'pendente';

export interface ItemDeCheck {
  id: 'rosto' | 'iluminacao' | 'enquadramento';
  estado: EstadoDoItem;
  /** O que fazer, quando o core disse algo acionável. */
  dica: string | null;
}

const IDS: Record<ItemDeCheck['id'], readonly ReadinessCheck['id'][]> = {
  rosto: ['face'],
  iluminacao: ['lighting', 'contrast'],
  enquadramento: ['distance', 'centering', 'headPose'],
};

export const ESPERA_MAXIMA_MS = 15_000;

/** Reduz o relatório a três linhas. `null` = ainda nada medido. */
export function resumirChecks(relatorio: ReadinessReport | null): ItemDeCheck[] | null {
  if (!relatorio) return null;
  return (Object.keys(IDS) as ItemDeCheck['id'][]).map((id) => {
    const doItem = relatorio.checks.filter((c) => IDS[id].includes(c.id));
    const ok = doItem.length > 0 && doItem.every((c) => c.status === 'ok');
    const problema =
      doItem.find((c) => c.status === 'fail') ?? doItem.find((c) => c.status === 'warn');
    return { id, estado: ok ? 'ok' : 'pendente', dica: ok ? null : (problema?.message ?? null) };
  });
}

export const ChecksDaCamera: React.FC<{
  onPronto?: (pronto: boolean) => void;
  esperaMaximaMs?: number;
  /** Injetável para teste; sem ele lê do engine. */
  avaliar?: () => ReadinessReport | null;
}> = ({ onPronto, esperaMaximaMs = ESPERA_MAXIMA_MS, avaliar }) => {
  const { t } = useTranslation();
  const { getDiagnostics } = useGaze();
  const { settings } = useSettings();
  const [itens, setItens] = useState<ItemDeCheck[] | null>(null);
  const [esperouDemais, setEsperouDemais] = useState(false);

  // Refs, e não deps: `getDiagnostics` muda de identidade a cada transição do
  // engine, e recriar o intervalo a cada uma delas era o que deixava o painel
  // antigo preso em "medindo…" com o rosto entrando e saindo.
  const diagRef = useRef(getDiagnostics);
  diagRef.current = getDiagnostics;
  const fovRef = useRef(settings.cameraHorizontalFovDeg);
  fovRef.current = settings.cameraHorizontalFovDeg;
  const avaliarRef = useRef(avaliar);
  avaliarRef.current = avaliar;
  const prontoRef = useRef(onPronto);
  prontoRef.current = onPronto;

  useEffect(() => {
    const inicio = Date.now();
    const tick = () => {
      let relatorio: ReadinessReport | null;
      if (avaliarRef.current) {
        relatorio = avaliarRef.current();
      } else {
        const d = diagRef.current();
        const snap = d ? snapshotFromDiagnostics(d, lerViewport()) : null;
        relatorio = snap ? evaluateReadiness(snap, { horizontalFovDeg: fovRef.current }) : null;
        if (relatorio) guardarProntidao(relatorio);
      }
      const resumo = resumirChecks(relatorio);
      setItens(resumo);
      const tudoOk = resumo !== null && resumo.every((i) => i.estado === 'ok');
      const estourou = resumo !== null && !tudoOk && Date.now() - inicio >= esperaMaximaMs;
      setEsperouDemais(estourou);
      prontoRef.current?.(resumo === null || tudoOk || estourou);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [esperaMaximaMs]);

  const lista: ItemDeCheck[] = itens ?? [
    { id: 'rosto', estado: 'pendente', dica: null },
    { id: 'iluminacao', estado: 'pendente', dica: null },
    { id: 'enquadramento', estado: 'pendente', dica: null },
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="checks-da-camera"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        width: '100%',
        maxWidth: 420,
        textAlign: 'left',
      }}
    >
      {lista.map((item) => {
        const ok = item.estado === 'ok';
        return (
          <div
            key={item.id}
            data-check={item.id}
            data-estado={item.estado}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.9rem',
              padding: '0.85rem 1.1rem',
              borderRadius: '1rem',
              background: ok ? 'var(--tint-ok-bg)' : 'var(--color-card-bg)',
              border: `1px solid ${ok ? 'var(--tint-ok-border)' : 'var(--color-card-border)'}`,
              transition: 'background 0.35s ease, border-color 0.35s ease',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: ok ? 'var(--color-ok)' : 'transparent',
                color: ok ? '#0f172a' : 'var(--color-text-muted)',
                transform: ok ? 'scale(1)' : 'scale(0.9)',
                transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s',
              }}
            >
              {ok ? <Check size={20} strokeWidth={3} /> : <Circle size={18} />}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}>
              <span
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--color-text-base)',
                }}
              >
                {t(`checksCamera.${item.id}`)}
                <span className="sr-only">
                  {' '}
                  {t(ok ? 'checksCamera.ok' : 'checksCamera.pendente')}
                </span>
              </span>
              {item.dica && (
                <span
                  style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}
                >
                  {item.dica}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {esperouDemais && (
        <span
          data-testid="checks-aviso"
          style={{ fontSize: '0.92rem', color: 'var(--tint-warn-text)', lineHeight: 1.45 }}
        >
          {t('checksCamera.aviso')}
        </span>
      )}
    </div>
  );
};
