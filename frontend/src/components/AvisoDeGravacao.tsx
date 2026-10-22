import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HardDrive, Check } from 'lucide-react';
import { GazeButton } from './ui/GazeButton';
import { useGaze } from '../context/GazeContext';
import { useEmergency } from '../context/EmergencyContext';
import { medicaoEmAndamento } from '../medicaoEmAndamento';
import { alvoMinimoPx } from '../design/gazeMetrics';
import { EVENTO_DE_GRAVACAO_DA_CALIBRACAO } from '@tracker/calibration';
import {
  EVENTO_DE_FALHA_DE_GRAVACAO,
  dispensarFalhasDeGravacao,
  falhasDeGravacaoVisiveis,
  registrarFalhaDeGravacao,
  registrarGravacaoOk,
  type OQueNaoGravou,
} from '../services/local/falhasDeGravacao';

/**
 * Rotas em que o aviso espera (as mesmas da faixa de atualização): no teclado
 * a grade encosta nas bordas; na calibração e na emergência nada compete com
 * os alvos ou com o socorro; o descanso existe para não ter estímulo. O aviso
 * não se perde: aparece na próxima tela.
 */
const ROTAS_SEM_AVISO = ['/keyboard', '/calibration-check', '/emergency', '/rest', '/retomada'];

const O_QUE: Record<OQueNaoGravou, { nome: string; consequencia: string }> = {
  calibracao: {
    nome: 'a calibração',
    consequencia: 'Na próxima vez que o IrisFlow abrir, será preciso calibrar de novo.',
  },
  ajustes: {
    nome: 'os ajustes',
    consequencia: 'Os ajustes, como o tempo do olhar, podem voltar ao padrão na próxima vez que o IrisFlow abrir.',
  },
  historico: {
    nome: 'o histórico',
    consequencia: 'As frases e medições mais recentes podem não ficar no histórico.',
  },
};

function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * "Não foi possível salvar" — calmo, visível, e sem travar nada.
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 15): calibração,
 * ajustes e histórico que o disco recusava eram tratados como salvos. Este
 * cartão diz o que não ficou gravado e o que isso muda na próxima abertura. O
 * app continua funcionando nesta sessão — o cartão só informa.
 *
 * Canto inferior ESQUERDO, longe da Emergência, abaixo dela e do alarme;
 * "Entendi" é alvo de olhar do tamanho mínimo de 5° (e botão comum para mouse
 * e teclado).
 */
export const AvisoDeGravacao: React.FC = () => {
  const [falhas, setFalhas] = useState<OQueNaoGravou[]>(() => falhasDeGravacaoVisiveis());
  const { pathname } = useLocation();
  const { state } = useGaze();
  const { isConfirming } = useEmergency();

  useEffect(() => {
    const atualizar = () => setFalhas(falhasDeGravacaoVisiveis());
    // A calibração mora no núcleo, que não conhece a interface: ela avisa por
    // evento, e a ponte para o registro das falhas fica aqui.
    const daCalibracao = (e: Event) => {
      const salvo = (e as CustomEvent<{ salvo?: boolean }>).detail?.salvo;
      if (salvo === false) registrarFalhaDeGravacao('calibracao');
      else if (salvo === true) registrarGravacaoOk('calibracao');
    };
    window.addEventListener(EVENTO_DE_FALHA_DE_GRAVACAO, atualizar);
    window.addEventListener(EVENTO_DE_GRAVACAO_DA_CALIBRACAO, daCalibracao);
    atualizar();
    return () => {
      window.removeEventListener(EVENTO_DE_FALHA_DE_GRAVACAO, atualizar);
      window.removeEventListener(EVENTO_DE_GRAVACAO_DA_CALIBRACAO, daCalibracao);
    };
  }, []);

  if (falhas.length === 0) return null;
  if (ROTAS_SEM_AVISO.some((r) => pathname.startsWith(r))) return null;
  if (isConfirming || medicaoEmAndamento(state)) return null;

  const lado = alvoMinimoPx();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="aviso-de-gravacao"
      style={{
        position: 'fixed',
        left: 24,
        bottom: 24,
        // Abaixo da Emergência (99990) e do alarme dela; logo acima da faixa
        // de atualização (99970), que divide o mesmo canto.
        zIndex: 99971,
        display: 'flex',
        alignItems: 'center',
        gap: '1.1rem',
        padding: '1rem 1.15rem',
        borderRadius: '1.25rem',
        background: '#0f172a',
        color: '#e2e8f0',
        border: '1px solid rgba(240,160,48,0.55)',
        boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
        fontFamily: 'var(--font-body)',
        maxWidth: 'min(calc(100vw - 48px - var(--reserva-emergencia-x, 0px)), 860px)',
      }}
    >
      <div data-no-dwell="true" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
          <HardDrive size={20} color="#F0A030" aria-hidden="true" />
          Não foi possível salvar {juntar(falhas.map((f) => O_QUE[f].nome))}
        </strong>
        <span style={{ fontSize: '0.95rem', lineHeight: 1.45, opacity: 0.9 }}>
          O IrisFlow continua funcionando agora.{' '}
          {falhas.map((f) => O_QUE[f].consequencia).join(' ')}{' '}
          Isso costuma acontecer quando o espaço de armazenamento do IrisFlow está cheio.
        </span>
      </div>
      <GazeButton
        type="button"
        width={Math.max(lado, 200)}
        height={lado}
        onClick={() => {
          dispensarFalhasDeGravacao();
          setFalhas(falhasDeGravacaoVisiveis());
        }}
        style={{ borderRadius: 'var(--radius-lg)', flexShrink: 0 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem', fontWeight: 800 }}>
          <Check size={22} aria-hidden="true" /> Entendi
        </span>
      </GazeButton>
    </div>
  );
};
