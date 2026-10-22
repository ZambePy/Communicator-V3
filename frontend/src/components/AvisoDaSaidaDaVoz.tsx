import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TriangleAlert, Check } from 'lucide-react';
import { GazeButton } from './ui/GazeButton';
import { useGaze } from '../context/GazeContext';
import { useEmergency } from '../context/EmergencyContext';
import { useSettings } from '../context/SettingsContext';
import { medicaoEmAndamento } from '../medicaoEmAndamento';
import { alvoMinimoPx } from '../design/gazeMetrics';
import { usarSaidaDaVoz } from '../services/voz/local';
import { EVENTO_DA_SAIDA_DA_VOZ, saidaDaVozPerdida, type DetalheDaSaidaDaVoz } from '../services/voz/saida';

/**
 * Quanto o aviso fica na tela sem ninguém tocar em "Entendi" (o mesmo prazo do
 * aviso de "a voz não saiu"). Ele aparece também no teclado, onde cobre um
 * canto da grade; um paciente que não consiga acionar "Entendi" não pode ficar
 * com esse canto tapado.
 */
export const DURACAO_DO_AVISO_DA_SAIDA_MS = 120_000;

/**
 * Rotas em que o aviso espera: na calibração e na emergência nada compete com
 * os alvos ou com o socorro; o descanso existe para não ter estímulo. O aviso
 * não se perde: aparece na próxima tela.
 *
 * O teclado NÃO está aqui, ao contrário do aviso de gravação: é no teclado que
 * o paciente escreve durante uma chamada, e um aviso que esperasse ele sair do
 * teclado não seria visto — ele falaria no vazio, achando que a outra pessoa o
 * ouve.
 */
const ROTAS_SEM_AVISO = ['/calibration-check', '/emergency', '/rest', '/retomada'];

/**
 * A saída da voz para as chamadas (roadmap 3, rodada 3, de 21/10/2026): põe o
 * ajuste "saída da voz" em vigor — ao abrir o app e a cada mudança, em
 * qualquer tela — e AVISA, uma vez, quando o aparelho escolhido (o cabo de
 * áudio virtual) deixa de abrir.
 *
 * Ao abrir o app o ajuste é SEMPRE a saída padrão: a escolha do cabo vale só para a
 * sessão e não vem do disco (revisão final, rodada 2, B1, 21/10/2026; ver
 * `SettingsContext`). Sem isso, quem esquecesse o cabo escolhido depois de uma
 * chamada abriria o app no dia seguinte falando "no vazio", e nada na tela diria.
 *
 * Por que o aviso importa: com o cabo fora, a voz do paciente volta para o
 * alto-falante e a fala segue normal para quem está na sala — mas a outra
 * ponta da chamada deixou de ouvi-lo, e ninguém perceberia sem um aviso. A fala
 * nunca quebra por isso; só o destino dela muda.
 *
 * Calmo e sem travar nada: canto inferior esquerdo, abaixo da Emergência e do
 * alarme, e "Entendi" é alvo de olhar do tamanho mínimo de 5° (e botão comum
 * para mouse e teclado). "Uma vez" quer dizer uma vez por perda: depois do
 * "Entendi" (ou de `DURACAO_DO_AVISO_DA_SAIDA_MS` na tela) ele só volta se a
 * saída abrir de novo e sumir outra vez.
 */
export const AvisoDaSaidaDaVoz: React.FC = () => {
  const { settings } = useSettings();
  // `visto`: a pessoa já tocou em "Entendi" para esta perda.
  const [estado, setEstado] = useState<'oculto' | 'visivel' | 'visto'>(() =>
    saidaDaVozPerdida() ? 'visivel' : 'oculto',
  );
  const { pathname } = useLocation();
  const { state } = useGaze();
  const { isConfirming } = useEmergency();

  // Primeiro o ouvido, depois o ajuste: aplicar o ajuste pode avisar na hora.
  useEffect(() => {
    const ouvir = (e: Event) => {
      const perdida = (e as CustomEvent<DetalheDaSaidaDaVoz>).detail?.perdida === true;
      setEstado((atual) => (perdida ? (atual === 'visto' ? 'visto' : 'visivel') : 'oculto'));
    };
    window.addEventListener(EVENTO_DA_SAIDA_DA_VOZ, ouvir);
    return () => window.removeEventListener(EVENTO_DA_SAIDA_DA_VOZ, ouvir);
  }, []);

  // O ajuste vale no boot (a primeira fala já sai pelo lugar certo — no boot, sempre o
  // alto-falante, B1) e a cada mudança feita na sessão.
  useEffect(() => {
    usarSaidaDaVoz(settings.saidaDaVoz);
  }, [settings.saidaDaVoz]);

  const naTela =
    estado === 'visivel' &&
    !ROTAS_SEM_AVISO.some((r) => pathname.startsWith(r)) &&
    !isConfirming &&
    !medicaoEmAndamento(state);

  // O prazo só corre enquanto o aviso está de fato na tela: esperar a
  // calibração acabar não o gasta.
  useEffect(() => {
    if (!naTela) return;
    const id = setTimeout(() => setEstado('visto'), DURACAO_DO_AVISO_DA_SAIDA_MS);
    return () => clearTimeout(id);
  }, [naTela]);

  if (!naTela) return null;

  const lado = alvoMinimoPx();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="aviso-saida-da-voz"
      style={{
        position: 'fixed',
        left: 24,
        bottom: 24,
        // Abaixo da Emergência (99990) e do alarme dela; logo acima do aviso de
        // gravação (99971), que divide o mesmo canto.
        zIndex: 99972,
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
          <TriangleAlert size={20} color="#F0A030" aria-hidden="true" />
          A voz está saindo pelo alto-falante do computador
        </strong>
        <span style={{ fontSize: '0.95rem', lineHeight: 1.45, opacity: 0.9 }}>
          A saída de áudio escolhida para as chamadas não abriu: o cabo de áudio pode ter sido desligado ou
          desinstalado. Numa chamada, a outra pessoa não vai ouvir o paciente. Para arrumar, abra Configurações e
          procure “Voz nas chamadas”.
        </span>
      </div>
      <GazeButton
        type="button"
        width={Math.max(lado, 200)}
        height={lado}
        onClick={() => setEstado('visto')}
        style={{ borderRadius: 'var(--radius-lg)', flexShrink: 0 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem', fontWeight: 800 }}>
          <Check size={22} aria-hidden="true" /> Entendi
        </span>
      </GazeButton>
    </div>
  );
};
