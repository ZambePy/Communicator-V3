import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { VolumeX, RotateCcw, X } from 'lucide-react';
import { GazeButton } from './ui/GazeButton';
import { EscolhaLateral } from './ui/EscolhaLateral';
import { avisarConteudoNovoSobOOlhar, useGaze } from '../context/GazeContext';
import { useEmergency } from '../context/EmergencyContext';
import { useSettings } from '../context/SettingsContext';
import { medicaoEmAndamento } from '../medicaoEmAndamento';
import { alvoMinimoPx } from '../design/gazeMetrics';
import {
  EVENTO_DE_FALA_QUE_NAO_SAIU,
  falarDoPaciente,
  falaSaiu,
  type DetalheDaFalaQueNaoSaiu,
} from '../services/voz/falaDoPaciente';

/**
 * Quanto o aviso fica na tela sem ninguém fechar. Longo o bastante para alguém
 * chegar e ler; não é para sempre porque o cartão cobre o meio da tela, e um
 * paciente que não consiga acionar "Fechar" não pode ficar com a tela tapada.
 */
export const DURACAO_DO_AVISO_DE_FALA_MS = 120_000;

/** A frase em letra grande: nunca menos de 2rem, para ser lida de longe. */
export const TAMANHO_DA_FRASE = 'clamp(2rem, 4.4vw, 3.6rem)';

/**
 * Onde o cartão espera (sem perder a frase): ele cobre o meio da tela, e ali
 * não pode tapar o pedido de socorro, os alvos da calibração nem o descanso.
 */
const ROTAS_EM_QUE_ESPERA = ['/emergency', '/calibration-check', '/rest', '/retomada'];

/** Uma linha calma sobre o porquê, sem jargão. */
function porQue(motivo: string | undefined): string {
  if (motivo === 'sem_voz') return 'O computador está sem voz para falar agora.';
  if (motivo === 'nao_comecou') return 'A voz do computador não respondeu.';
  return 'A voz do computador falhou desta vez.';
}

/**
 * "A voz não saiu" — a frase do paciente em letra grande.
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 5). Quando nada
 * sai em voz alta (sem voz instalada, sintetizador travado, motor da voz
 * clonada com erro), a frase não pode sumir: ela fica aqui, grande, para quem
 * estiver perto ler, com "Tentar falar de novo" e "Fechar" — os dois alvos de
 * olhar do tamanho mínimo de 5°, e botões comuns para mouse e teclado.
 *
 * Fica abaixo da Emergência (99990) e do alarme dela: nunca tapa o pedido de
 * socorro. Não escurece o resto da tela — o paciente continua podendo usar o
 * que está atrás.
 *
 * No modo só horizontal (revisão de 21/10/2026, Important 3) os dois botões
 * centrados pediam o olhar vertical — e o "Falar" do teclado lateral dispara
 * este aviso quando a voz não sai. Lá o aviso ocupa a altura toda, com "Fechar"
 * à esquerda e "Tentar falar de novo" à direita, pela coluna do olhar
 * (`EscolhaLateral`), e a frase no meio. Ao aparecer, avisa o despachante: o
 * olhar parado no lado do "Falar" não tenta de novo sozinho.
 */
export const AvisoDeFalaQueNaoSaiu: React.FC = () => {
  const [aviso, setAviso] = useState<(DetalheDaFalaQueNaoSaiu & { id: number }) | null>(null);
  const [tentando, setTentando] = useState(false);
  const proximoId = useRef(0);
  const { pathname } = useLocation();
  const { state } = useGaze();
  const { isConfirming } = useEmergency();
  const { settings } = useSettings();
  const horizontal = settings?.modoHorizontal === true;

  useEffect(() => {
    const ouvir = (e: Event) => {
      const d = (e as CustomEvent<DetalheDaFalaQueNaoSaiu>).detail;
      if (!d || typeof d.texto !== 'string' || !d.texto.trim()) return;
      setAviso({ ...d, id: ++proximoId.current });
      setTentando(false);
    };
    window.addEventListener(EVENTO_DE_FALA_QUE_NAO_SAIU, ouvir);
    return () => window.removeEventListener(EVENTO_DE_FALA_QUE_NAO_SAIU, ouvir);
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso((a) => (a?.id === aviso.id ? null : a)), DURACAO_DO_AVISO_DE_FALA_MS);
    return () => clearTimeout(id);
  }, [aviso]);

  // A emergência (tela e confirmação), a calibração e a medição vêm antes; o
  // cartão volta quando elas saírem, se ainda estiver no prazo.
  const visivel =
    aviso !== null &&
    !ROTAS_EM_QUE_ESPERA.some((r) => pathname.startsWith(r)) &&
    !isConfirming &&
    !medicaoEmAndamento(state);
  // No modo horizontal, ao aparecer e ao sair (também pelo prazo, sem clique):
  // a tela de baixo volta sob o olhar parado e não aciona sozinha.
  const idVisivel = visivel ? aviso.id : null;
  const idVisivelAntesRef = useRef<number | null>(null);
  useEffect(() => {
    const antes = idVisivelAntesRef.current;
    idVisivelAntesRef.current = idVisivel;
    if (horizontal && idVisivel !== antes) avisarConteudoNovoSobOOlhar();
  }, [idVisivel, horizontal]);

  if (!aviso || !visivel) return null;

  const fechar = () => setAviso((a) => (a?.id === aviso.id ? null : a));
  const tentarDeNovo = async () => {
    const atual = aviso;
    setTentando(true);
    // Se falhar de novo, `falarDoPaciente` reabre este aviso (id novo).
    const r = await falarDoPaciente(atual.texto, atual.opcoes);
    setTentando(false);
    if (falaSaiu(r)) setAviso((a) => (a?.id === atual.id ? null : a));
  };

  const explicacao = (
    <div data-no-dwell="true" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <strong
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: horizontal ? 'center' : undefined,
          gap: '0.6rem',
          fontSize: '1.35rem',
          fontWeight: 800,
          color: 'var(--tint-warn-text, #F0A030)',
        }}
      >
        <VolumeX size={26} aria-hidden="true" />
        A frase não saiu em voz alta
      </strong>
      <span style={{ fontSize: '1.05rem', lineHeight: 1.5, opacity: 0.9 }}>
        {porQue(aviso.motivo)} Mostre esta frase para quem estiver perto:
      </span>
    </div>
  );
  const frase = (
    <p
      data-no-dwell="true"
      data-testid="frase-que-nao-saiu"
      style={{
        margin: 0,
        fontFamily: 'var(--font-display)',
        fontSize: TAMANHO_DA_FRASE,
        fontWeight: 800,
        lineHeight: 1.2,
        letterSpacing: '-0.01em',
        overflowWrap: 'anywhere',
      }}
    >
      {aviso.texto}
    </p>
  );

  if (horizontal) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        data-testid="aviso-fala-que-nao-saiu"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          // A faixa da Emergência fica livre, à direita.
          right: 'calc(var(--faixa-da-emergencia-largura) + var(--emergencia-folga, 28px))',
          zIndex: 99975,
          display: 'flex',
          padding: 'clamp(1rem, 3vh, 2rem) clamp(1rem, 2vw, 2rem)',
          boxSizing: 'border-box',
          background: 'var(--color-card-bg, #0f172a)',
          color: 'var(--color-text-base, #e2e8f0)',
          borderRight: '2px solid var(--tint-warn-border, #f59e0b)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <EscolhaLateral
          larguraDoMeio={44}
          esquerda={{
            nome: 'Fechar',
            rotulo: (
              <>
                <X size={72} aria-hidden="true" />
                <span style={{ fontSize: 'clamp(1.8rem, 5vh, 3rem)', fontWeight: 900 }}>Fechar</span>
              </>
            ),
            aoEscolher: fechar,
            estilo: { background: 'var(--color-bg-elevated, #1e293b)', color: 'var(--color-text-base, #e2e8f0)', border: '3px solid var(--color-card-border, #334155)' },
          }}
          direita={{
            nome: tentando ? 'Tentando…' : 'Tentar falar de novo',
            rotulo: (
              <>
                <RotateCcw size={72} aria-hidden="true" />
                <span style={{ fontSize: 'clamp(1.5rem, 4.2vh, 2.6rem)', fontWeight: 900 }}>{tentando ? 'Tentando…' : 'Tentar falar de novo'}</span>
              </>
            ),
            aoEscolher: () => void tentarDeNovo(),
            desligado: tentando,
            estilo: { background: 'var(--color-primary)', color: '#ffffff', border: 'none' },
          }}
          centro={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.1rem', width: '100%', overflowY: 'auto' }}>
              {explicacao}
              {frase}
            </div>
          }
        />
      </div>
    );
  }

  const lado = alvoMinimoPx();
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="aviso-fala-que-nao-saiu"
      style={{
        position: 'fixed',
        left: 24,
        right: 'calc(24px + var(--reserva-emergencia-x, 0px))',
        top: '50%',
        transform: 'translateY(-50%)',
        maxHeight: '86vh',
        overflowY: 'auto',
        // Abaixo da Emergência (99990), do alarme dela e da faixa de
        // rastreamento degradado (99980); acima do conteúdo da tela.
        zIndex: 99975,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
        padding: '1.5rem 1.75rem',
        borderRadius: '1.5rem',
        background: 'var(--color-card-bg, #0f172a)',
        color: 'var(--color-text-base, #e2e8f0)',
        border: '2px solid var(--tint-warn-border, #f59e0b)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {explicacao}

      {frase}

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <GazeButton
          type="button"
          variante="primaria"
          width={Math.max(lado, 300)}
          height={lado}
          disabled={tentando}
          onClick={() => void tentarDeNovo()}
          style={{ borderRadius: 'var(--radius-lg)' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.25rem', fontWeight: 800 }}>
            <RotateCcw size={24} aria-hidden="true" /> {tentando ? 'Tentando…' : 'Tentar falar de novo'}
          </span>
        </GazeButton>
        <GazeButton
          type="button"
          width={Math.max(lado, 220)}
          height={lado}
          onClick={fechar}
          style={{ borderRadius: 'var(--radius-lg)' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.25rem', fontWeight: 800 }}>
            <X size={24} aria-hidden="true" /> Fechar
          </span>
        </GazeButton>
      </div>
    </div>
  );
};
