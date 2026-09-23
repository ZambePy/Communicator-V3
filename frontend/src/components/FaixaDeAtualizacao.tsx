import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, RefreshCw, Clock } from 'lucide-react';
import { GazeButton } from './ui/GazeButton';
import { useGaze } from '../context/GazeContext';
import { useEmergency } from '../context/EmergencyContext';
import { medicaoEmAndamento } from '../medicaoEmAndamento';
import {
  ESTADO_SEM_PONTE,
  estadoDaAtualizacao,
  instalarAtualizacao,
  ouvirAtualizacao,
  textoDaFaixa,
  type EstadoDaAtualizacao,
} from '../services/atualizacao';

/**
 * Rotas em que a faixa NÃO aparece, nem a de progresso:
 *   - teclado: a grade encosta nas bordas e o canto inferior esquerdo é uma
 *     tecla — a faixa esconderia parte dela no meio de uma frase;
 *   - calibração e emergência: nada pode competir com os alvos ou com o
 *     pedido de socorro;
 *   - descanso: a tela existe para não ter estímulo.
 * A versão nova não se perde: ela entra sozinha quando o app fechar, e a
 * faixa volta na próxima tela.
 */
const ROTAS_SEM_FAIXA = ['/keyboard', '/calibration-check', '/emergency', '/rest', '/retomada'];

/** Dwell do "Reiniciar agora": mais longo que o padrão — reiniciar no meio de
 *  uma frase apaga a frase, então um olhar de passagem não pode bastar. */
export const DWELL_DO_REINICIAR_MS = 2500;

/**
 * Faixa de atualização: "baixando…" e, depois, "Atualização pronta —
 * Reiniciar agora / Depois".
 *
 * ## O que mudou, e por quê
 *
 * Era uma faixa de 0,9 rem com o botão marcado `data-no-dwell`: só o
 * cuidador, com o mouse, conseguia reiniciar. Para um paciente que usa o app
 * sozinho, a atualização ficava pendurada até alguém fechar o programa, e a
 * faixa não tinha como ser dispensada pelo olhar — um aviso permanente num
 * canto da tela, sem saída. Agora os dois botões são alvos de olhar grandes
 * (96 px de altura), e "Depois" some com a faixa até a próxima versão.
 *
 * ## O que continua igual
 *
 * - Não bloqueia nada: é um cartão no canto inferior ESQUERDO, longe da
 *   Emergência (canto superior direito; inferior direito na calibração, quando
 *   a faixa nem aparece). O z-index fica abaixo do botão e do alarme de
 *   emergência — antes era 2147482000 e passava por cima da confirmação de
 *   socorro.
 * - Se ninguém reiniciar, a versão entra sozinha quando o app fechar
 *   (electron/atualizacao.ts), e a faixa diz isso.
 */
export const FaixaDeAtualizacao: React.FC = () => {
  const [estado, setEstado] = useState<EstadoDaAtualizacao>(ESTADO_SEM_PONTE);
  const [reiniciando, setReiniciando] = useState(false);
  const [adiadaParaVersao, setAdiadaParaVersao] = useState<string | null>(null);
  const location = useLocation();
  const { state } = useGaze();
  const { isConfirming } = useEmergency();

  useEffect(() => {
    let vivo = true;
    estadoDaAtualizacao().then((e) => {
      if (vivo) setEstado(e);
    });
    const parar = ouvirAtualizacao((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
      parar();
    };
  }, []);

  const texto = textoDaFaixa(estado);
  if (!texto) return null;
  if (ROTAS_SEM_FAIXA.some((r) => location.pathname.startsWith(r))) return null;
  if (isConfirming || medicaoEmAndamento(state)) return null;

  const versao = 'versao' in estado ? estado.versao : '';
  if (texto.acao === 'reiniciar' && adiadaParaVersao === versao) return null;

  const reiniciar = async () => {
    setReiniciando(true);
    const ok = await instalarAtualizacao();
    if (!ok) setReiniciando(false);
  };

  // Progresso: só informação, sem alvo — não há nada a decidir ainda.
  if (texto.acao !== 'reiniciar') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-no-dwell="true"
        data-testid="faixa-atualizacao"
        style={{
          ...CAIXA,
          padding: '0.7rem 1rem',
          fontSize: '0.95rem',
          pointerEvents: 'none',
        }}
      >
        <Download size={20} color="#94a3b8" aria-hidden="true" />
        <span style={{ fontWeight: 700 }}>{texto.titulo}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="faixa-atualizacao"
      style={{ ...CAIXA, padding: '1rem 1.1rem', gap: '1rem', alignItems: 'stretch' }}
    >
      <div
        data-no-dwell="true"
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.3rem', maxWidth: 300 }}
      >
        <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
          <RefreshCw size={20} color="#F0A030" aria-hidden="true" />
          Atualização pronta
        </strong>
        <span style={{ fontSize: '0.9rem', lineHeight: 1.4, opacity: 0.85 }}>
          {versao ? `Versão ${versao}. ` : ''}
          {reiniciando
            ? 'Reiniciando…'
            : 'Reinicie quando for um bom momento — ou ela entra sozinha ao fechar o IrisFlow.'}
        </span>
      </div>
      <GazeButton
        type="button"
        variante="primaria"
        width={220}
        height={96}
        disabled={reiniciando}
        onClick={reiniciar}
        data-dwell-ms={DWELL_DO_REINICIAR_MS}
        style={{ borderRadius: 'var(--radius-lg)', flexShrink: 0 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800 }}>
          <RefreshCw size={22} aria-hidden="true" /> Reiniciar agora
        </span>
      </GazeButton>
      <GazeButton
        type="button"
        width={170}
        height={96}
        disabled={reiniciando}
        onClick={() => setAdiadaParaVersao(versao)}
        style={{ borderRadius: 'var(--radius-lg)', flexShrink: 0 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800 }}>
          <Clock size={22} aria-hidden="true" /> Depois
        </span>
      </GazeButton>
    </div>
  );
};

const CAIXA: React.CSSProperties = {
  position: 'fixed',
  left: 24,
  bottom: 24,
  // Abaixo da Emergência (99990) e do alarme dela (999999), acima do conteúdo.
  zIndex: 99970,
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  borderRadius: '1.25rem',
  background: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,0.35)',
  boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
  fontFamily: 'var(--font-body)',
  // Nunca chega à metade direita da tela, onde fica a Emergência durante a
  // medição (e onde a faixa já não aparece).
  maxWidth: 'min(calc(100vw - 48px - var(--reserva-emergencia-x)), 820px)',
};
