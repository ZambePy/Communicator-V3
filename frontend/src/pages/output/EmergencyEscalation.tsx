import React, { useState, useEffect } from 'react';
import { definirEmergenciaAtiva } from '../../services/estadoDeEmergencia';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, HeartPulse, ShieldAlert, Thermometer, Wind } from 'lucide-react';
import { emitirPedidoDeAjuda } from '../../cloud/eventos';
import { useCloud } from '../../cloud/CloudContext';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeButton } from '../../components/ui/GazeButton';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { playTone, getSharedAudioContext } from '../../utils/emergencyAudio';

/** Prazo local quando não há ajuste remoto (`patient_settings.emergency_timeout_s`). */
const PRAZO_PADRAO_S = 15;

const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const EMERGENCIES = [
  { id: 'pain', labelKey: 'emergency.items.pain', icon: HeartPulse },
  { id: 'breath', labelKey: 'emergency.items.breath', icon: Wind },
  { id: 'cold', labelKey: 'emergency.items.cold', icon: Thermometer },
  { id: 'other', labelKey: 'emergency.items.other', icon: ShieldAlert },
];

export const EmergencyEscalation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { ajustesRemotos, reconhecimento } = useCloud();
  const [triggered, setTriggered] = useState<string | null>(null);
  const [triggeredAt, setTriggeredAt] = useState<number | null>(null);
  const [escalated, setEscalated] = useState(false);
  /** Horário em que o cuidador confirmou ESTE pedido (chegou pelo realtime). */
  const [vistoEm, setVistoEm] = useState<string | null>(null);

  // Prazo de escalonamento: o mesmo que o cuidador configurou no app (e que
  // o cron do servidor usa), com 15 s de reserva quando não há ajuste.
  const prazoS = ajustesRemotos?.emergency_timeout_s ?? PRAZO_PADRAO_S;

  // Enquanto esta tela está aberta, há uma emergência em curso — e a correção
  // por dwell (sprint S3) não pode aprender aqui. O `EmergencyContext` só
  // marca a CONTAGEM REGRESSIVA; depois de confirmada, a navegação chega nesta
  // tela e o sinal voltaria a false justamente durante o alarme, que é o pior
  // momento possível para o sistema experimentar qualquer coisa.
  useEffect(() => {
    definirEmergenciaAtiva(true);
    return () => definirEmergenciaAtiva(false);
  }, []);

  const triggerAlert = (_id: string, label: string) => {
    setTriggered(label);
    setTriggeredAt(Date.now());
    setEscalated(false);
    setVistoEm(null);

    // Som de bip forte inicial.
    //
    // No contexto COMPARTILHADO: este era o único caminho deste arquivo que
    // ainda criava um `AudioContext` por acionamento e fechava só o oscilador.
    // Cada emergência atendida e re-disparada gastava uma vaga do mesmo
    // orçamento de ~50 contextos que o alarme de escalonamento precisa — e
    // quando ele acaba, quem para de tocar é justamente o alarme que dispara
    // quando ninguém veio.
    const audioCtx = getSharedAudioContext();
    if (audioCtx) {
      try {
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        oscillator.connect(audioCtx.destination);
        oscillator.start();
        setTimeout(() => oscillator.stop(), 2000);
      } catch {
        // Áudio indisponível não pode derrubar o alerta de emergência.
      }
    }

    if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      const u = new SpeechSynthesisUtterance(`ALERTA MÉDICO: ${label}`);
      u.lang = 'pt-BR';
      u.rate = 1.0;
      u.pitch = 1.5;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
    }

    // Celular do cuidador: tela de emergência + push (Edge Function desktop-sync).
    // É o único envio: o barramento respeita o modo apresentação e, com o
    // computador vinculado, a fila offline.
    emitirPedidoDeAjuda('emergencia', label);
  };

  // Efeito de escuta de parâmetro para auto-disparo
  useEffect(() => {
    const autoTrigger = searchParams.get('autoTrigger');
    if (autoTrigger && !triggered) {
      const item = EMERGENCIES.find((e) => e.id === autoTrigger) || EMERGENCIES[3];
      triggerAlert(item.id, t(item.labelKey));
    }
  }, [searchParams, t, triggered]);

  // Confirmação do cuidador chegou (UPDATE em help_requests com
  // acknowledged_at, via CloudContext). Só vale se for posterior ao disparo
  // desta tela — um reconhecimento antigo não é resposta a este pedido.
  useEffect(() => {
    if (!triggered || !triggeredAt || !reconhecimento) return;
    const quando = new Date(reconhecimento.acknowledged_at).getTime();
    // Tolerância de 60 s para relógios desalinhados entre PC e servidor.
    if (!Number.isFinite(quando) || quando < triggeredAt - 60_000) return;
    if (vistoEm === reconhecimento.acknowledged_at) return;
    setVistoEm(reconhecimento.acknowledged_at);
    if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(`Seu cuidador viu o pedido às ${horaCurta(reconhecimento.acknowledged_at)}.`);
      u.lang = 'pt-BR';
      u.rate = 0.95;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
    }
  }, [reconhecimento, triggered, triggeredAt, vistoEm]);

  // Timer de escalonamento LOCAL (`prazoS`, o mesmo do cuidador). Cancelado
  // quando o cuidador confirma antes do prazo.
  //
  // Quem escalona de verdade é o SERVIDOR: o pg_cron `escalar_pedidos_de_ajuda`
  // (a cada minuto) marca `escalated_at`, grava UMA mensagem de sistema na
  // conversa e reenvia o push — e faz isso mesmo com este computador
  // desligado, que é o caso que importa. Este timer só liga o alarme local e
  // muda a tela. Ele NÃO grava mais a própria mensagem "Alerta escalado" na
  // conversa: eram duas mensagens de sistema por escalonamento (uma daqui,
  // outra do servidor), com prazos e textos diferentes.
  useEffect(() => {
    if (!triggered || escalated || vistoEm) return;

    const timer = setTimeout(() => setEscalated(true), prazoS * 1000);

    return () => clearTimeout(timer);
  }, [triggered, escalated, vistoEm, prazoS]);

  // Alarme contínuo de Escalonamento Crítico — para quando o cuidador confirma.
  useEffect(() => {
    if (!escalated || vistoEm) return;

    // Bip estridente a cada 2 s, pelo contexto de áudio COMPARTILHADO.
    //
    // A versão anterior criava um `new AudioContext()` a cada tique e nunca
    // fechava nenhum. O Chromium limita ~50 contextos por documento: passado
    // o limite o construtor lança, o `catch` engolia, e o alarme emudecia
    // sozinho depois de cerca de um minuto — justamente no caso que o alarme
    // existe para cobrir, o de ninguém ter vindo. Este bug já tinha sido
    // corrigido no outro caminho de áudio (ver o comentário em
    // `context/EmergencyContext.tsx`); a correção não havia chegado aqui.
    const soundInterval = setInterval(() => {
      // Duas notas curtas em vez de uma longa: mais perceptível de outro
      // cômodo, e não depende de manter um oscilador vivo entre tiques.
      playTone(990, 0, 0.25, 0.35);
      playTone(760, 0.3, 0.25, 0.35);
    }, 2000);

    // Fala contínua a cada 5s
    const speechInterval = setInterval(() => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance("ALERTA CRÍTICO: O paciente precisa de socorro imediato!");
        u.lang = 'pt-BR';
        u.rate = 1.0;
        u.pitch = 1.3;
        u.volume = 1.0;
        window.speechSynthesis.speak(u);
      }
    }, 5000);

    return () => {
      clearInterval(soundInterval);
      clearInterval(speechInterval);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [escalated, vistoEm]);

  return (
    <GazePageLayout showBack={true} backRoute="/menu">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <h1
            style={{
              fontSize: '2.75rem',
              color: '#ef4444',
              margin: '0 0 0.5rem 0',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
            }}
          >
            <AlertOctagon size={44} /> {t('emergency.title')}
          </h1>
          <p style={{ fontSize: '1.25rem', color: 'var(--color-text-base)', opacity: 0.7, margin: 0, fontWeight: 500 }}>
            {triggered ? 'Seu alerta foi enviado. Aguarde atendimento.' : 'Selecione o tipo de ajuda necessário'}
          </p>
        </div>

        {triggered ? (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              animation: vistoEm ? 'none' : escalated ? 'pulseBgEscalated 0.5s infinite alternate' : 'pulseBg 1s infinite',
              borderRadius: '2rem',
              border: vistoEm ? '3px solid #16a34a' : escalated ? '6px dashed #b91c1c' : '3px solid #dc2626',
              background: vistoEm ? 'rgba(22, 163, 74, 0.08)' : escalated ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.05)',
              padding: '2rem',
            }}
          >
            <AlertOctagon size={100} color={vistoEm ? '#16a34a' : '#dc2626'} aria-hidden="true" style={{ animation: escalated && !vistoEm ? 'shake 0.3s infinite' : 'none' }} />
            <h2 style={{ fontSize: '3rem', color: '#dc2626', textAlign: 'center', marginTop: '1.5rem', fontWeight: 800 }}>
              {vistoEm ? 'SEU CUIDADOR VIU' : escalated ? 'ALERTA ESCALADO' : t('emergency.alertSent')}
            </h2>
            <p style={{ fontSize: '1.75rem', color: '#991b1b', textAlign: 'center', marginTop: '0.5rem', fontWeight: 600 }}>
              {vistoEm
                ? `Seu cuidador viu o pedido às ${horaCurta(vistoEm)}. Ajuda a caminho.`
                : escalated
                  ? 'Ninguém confirmou ainda. O alarme continua tocando neste computador.'
                  : t('emergency.waiting', { label: triggered })}
            </p>

            <GazeButton
              onClick={() => {
                setTriggered(null);
                setTriggeredAt(null);
                setEscalated(false);
                setVistoEm(null);
                navigate('/menu');
              }}
              style={{
                marginTop: '2.5rem',
                width: '340px',
                height: '80px',
                background: escalated ? '#dc2626' : '#3b82f6',
                border: 'none',
                borderRadius: '1.5rem',
                color: 'white',
                boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
              }}
            >
              <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                {t('emergency.cancelAndReturn')}
              </span>
            </GazeButton>
            <style>{`
              @keyframes pulseBg { 0% { background-color: rgba(220,38,38,0.05); } 50% { background-color: rgba(220,38,38,0.15); } 100% { background-color: rgba(220,38,38,0.05); } }
              @keyframes pulseBgEscalated { 0% { background-color: rgba(239, 68, 68, 0.15); } 100% { background-color: rgba(239, 68, 68, 0.4); } }
              @keyframes shake {
                0% { transform: translate(1px, 1px) rotate(0deg); }
                10% { transform: translate(-1px, -2px) rotate(-1deg); }
                20% { transform: translate(-3px, 0px) rotate(1deg); }
                30% { transform: translate(0px, 2px) rotate(0deg); }
                40% { transform: translate(1px, -1px) rotate(1deg); }
                50% { transform: translate(-1px, 2px) rotate(-1deg); }
                60% { transform: translate(-3px, 1px) rotate(0deg); }
                70% { transform: translate(2px, 1px) rotate(-1deg); }
                80% { transform: translate(-1px, -1px) rotate(1deg); }
                90% { transform: translate(2px, 2px) rotate(0deg); }
                100% { transform: translate(1px, -2px) rotate(-1deg); }
              }
            `}</style>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
            <GazeGrid columns={2} rows={2}>
              {EMERGENCIES.map((item) => {
                const label = t(item.labelKey);
                return (
                  <GazeButton
                    key={item.id}
                    onClick={() => triggerAlert(item.id, label)}
                    style={{
                      height: '100%',
                      background: '#dc2626',
                      border: '3px solid #991b1b',
                      borderRadius: '2rem',
                      color: 'white',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                      <item.icon size={80} color="white" />
                      <span style={{ fontSize: '2.2rem', fontWeight: 900 }}>{label}</span>
                    </div>
                  </GazeButton>
                );
              })}
            </GazeGrid>
          </div>
        )}
      </div>
    </GazePageLayout>
  );
};
