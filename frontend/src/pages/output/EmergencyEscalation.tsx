import React, { useState, useEffect, useRef } from 'react';
import { definirEmergenciaAtiva } from '../../services/estadoDeEmergencia';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, HeartPulse, ShieldAlert, Thermometer, Wind } from 'lucide-react';
import { useCloud } from '../../cloud/CloudContext';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeButton } from '../../components/ui/GazeButton';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { EscolhaLateral, type LadoDaEscolha } from '../../components/ui/EscolhaLateral';
import { avisarConteudoNovoSobOOlhar } from '../../context/GazeContext';
import { useSettings } from '../../context/SettingsContext';
import { telaLateralDeOrigem } from '../../services/telaLateral';
import {
  dispararPedidoDeSocorro, encerrarPedido, registrarReconhecimento, definirPrazoDoCuidador,
} from '../../services/emergencia/pedidoDeSocorro';
import { usePedidoDeSocorro } from '../../services/emergencia/usePedidoDeSocorro';
import { degToPx, GAZE_TOKENS } from '../../design/gazeMetrics';

/**
 * O alvo mínimo de 5° como o token do design system (`--gaze-target-min`, o
 * mesmo valor que `alvoMinimoPx()` lê), e não um número calculado no render:
 * a geometria do usuário (distância, tamanho da tela) chega depois do
 * primeiro desenho, e o token acompanha sem esperar outro render.
 */
const ALVO_MINIMO = `var(--gaze-target-min, ${Math.round(degToPx(GAZE_TOKENS.targetMinDeg))}px)`;

const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** A pergunta "parar o alarme?" fecha sozinha se ninguém responder. */
const PRAZO_DA_PERGUNTA_MS = 15_000;

const EMERGENCIES = [
  { id: 'pain', labelKey: 'emergency.items.pain', icon: HeartPulse },
  { id: 'breath', labelKey: 'emergency.items.breath', icon: Wind },
  { id: 'cold', labelKey: 'emergency.items.cold', icon: Thermometer },
  { id: 'other', labelKey: 'emergency.items.other', icon: ShieldAlert },
];

/** As animações e o ajuste de janela baixa da tela (nos dois layouts). */
const estilosDaTela = (
  <style>{`
    /* Janela baixa: o octógono grande sai (o título já tem o dele) e
       a altura vai para os textos e os botões. */
    @media (max-height: 720px) { .socorro-icone { display: none; } }
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
    @media (prefers-reduced-motion: reduce) {
      [role="alert"], [role="alert"] svg { animation: none !important; }
    }
  `}</style>
);

/** Marca de recuperação nas metades da escolha lateral (ver o comentário dos botões, abaixo). */
const RECUPERACAO = { 'data-recovery': 'true' } as const;

/**
 * Tela do pedido de socorro.
 *
 * Desde 19/10/2026 ela só MOSTRA: o envio, o alarme local e a confirmação do
 * cuidador moram em `services/emergencia/pedidoDeSocorro.ts`, fora do React
 * (ver o cabeçalho de lá). Sair desta tela não cala o alarme; quem para é a
 * confirmação do cuidador ou o paciente, em dois passos.
 *
 * No modo só horizontal (revisão de 21/10/2026, Important 1) as saídas são as
 * duas metades de uma `EscolhaLateral`, pela coluna do olhar: os botões
 * centrados pediam o olhar vertical, e o paciente ficava preso aqui até alguém
 * usar o mouse. "Parar o alarme" à esquerda abre a pergunta; nela, NÃO
 * (continuar pedindo ajuda) à esquerda e SIM, parar à direita — os dois passos
 * continuam, e o segundo pede um olhar para o outro lado. Depois de o cuidador
 * ver, "Voltar" à esquerda. A saída volta para a tela lateral de onde o
 * paciente veio (`telaLateral.ts`), e não para o menu, que esse olhar não usa.
 */
export const EmergencyEscalation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const { ajustesRemotos, reconhecimento, mensagens } = useCloud();
  const { settings } = useSettings();
  const horizontal = settings?.modoHorizontal === true;
  const pedido = usePedidoDeSocorro();
  const ativo = pedido !== null && pedido.fase !== 'encerrado';
  const [perguntandoParada, setPerguntandoParada] = useState(false);

  // O prazo do cuidador chega pela nuvem; o provider já o repassa, e a tela
  // repete (idempotente) para valer também com um provider antigo.
  useEffect(() => {
    if (ajustesRemotos) definirPrazoDoCuidador(ajustesRemotos.emergency_timeout_s);
  }, [ajustesRemotos]);

  // Idem para a confirmação do cuidador: o pedido a reconhece pelo id.
  useEffect(() => {
    if (reconhecimento) registrarReconhecimento(reconhecimento);
  }, [reconhecimento]);

  // Enquanto esta tela está aberta, há uma emergência em curso — e a correção
  // por dwell (sprint S3) não pode aprender aqui (ver estadoDeEmergencia).
  useEffect(() => {
    definirEmergenciaAtiva(true, 'tela');
    return () => definirEmergenciaAtiva(false, 'tela');
  }, []);

  // A resposta do cuidador durante o socorro fica NA tela de emergência (o
  // cartão global de mensagens não aparece aqui): a mais recente desde pouco
  // antes do pedido — 5 min de tolerância para relógios desalinhados.
  const disparadoEm = ativo ? pedido.disparadoEm : null;
  const mensagemDoCuidador = disparadoEm
    ? [...(mensagens ?? [])]
        .reverse()
        .find((m) => m.sender === 'cuidador' && m.kind !== 'sistema' && Date.parse(m.created_at) >= disparadoEm - 5 * 60_000) ?? null
    : null;

  const disparar = (id: string, label: string) => {
    setPerguntandoParada(false);
    dispararPedidoDeSocorro(id, label);
  };

  // Link antigo com `?autoTrigger=` (versões anteriores do Modo Computador e do
  // botão flutuante): dispara UMA vez por montagem, só se não houver pedido em
  // andamento, e o parâmetro sai da URL logo em seguida — com ele na URL, um
  // segundo render mandava outro pedido (FE-2).
  const autoDisparoFeitoRef = useRef(false);
  useEffect(() => {
    const autoTrigger = searchParams.get('autoTrigger');
    if (!autoTrigger || autoDisparoFeitoRef.current) return;
    autoDisparoFeitoRef.current = true;
    const item = EMERGENCIES.find((e) => e.id === autoTrigger) || EMERGENCIES[3];
    disparar(item.id, t(item.labelKey));
    setSearchParams(
      (atual) => {
        const sem = new URLSearchParams(atual);
        sem.delete('autoTrigger');
        return sem;
      },
      { replace: true }
    );
    // Só o parâmetro importa: `t` muda a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // A pergunta de parada não fica aberta para sempre.
  useEffect(() => {
    if (!perguntandoParada) return;
    const id = setTimeout(() => setPerguntandoParada(false), PRAZO_DA_PERGUNTA_MS);
    return () => clearTimeout(id);
  }, [perguntandoParada]);

  // No modo só horizontal, de volta à tela lateral de origem: o menu pede o
  // olhar vertical.
  const saida = () => (horizontal ? telaLateralDeOrigem() : '/menu');
  const pararEVoltar = () => {
    encerrarPedido('paciente_parou');
    navigate(saida(), { replace: true });
  };
  const voltarDepoisDeVisto = () => {
    encerrarPedido('concluido');
    navigate(saida(), { replace: true });
  };

  const vistoEm = ativo ? pedido.vistoEm : null;

  // Modo só horizontal: cada troca de fase muda o que está sob o olhar parado
  // na MESMA metade (o "Parar o alarme" vira o NÃO; o cuidador vê e ele vira
  // "Voltar"). O olhar que estava ali não aciona a opção nova sozinho: precisa
  // sair e voltar, como numa tela nova. A primeira fase não conta — a troca de
  // rota já faz isso.
  const faseDasSaidas = !ativo ? 'sem-pedido' : vistoEm ? 'visto' : perguntandoParada ? 'pergunta' : 'pedido';
  const faseAnteriorRef = useRef(faseDasSaidas);
  useEffect(() => {
    if (faseAnteriorRef.current === faseDasSaidas) return;
    faseAnteriorRef.current = faseDasSaidas;
    if (horizontal) avisarConteudoNovoSobOOlhar();
  }, [faseDasSaidas, horizontal]);
  const escalated = ativo && pedido.fase === 'escalado';
  const entrega = ativo ? pedido.entrega : null;
  const escaladoPorPrazo = escalated && pedido.motivoDoEscalonamento === 'prazo';
  // Alarme ligado porque o envio nunca respondeu: "enviando…" na tela, com o
  // alarme tocando, seria contradição.
  const chaveDaEntrega = escalated && (!entrega || entrega === 'enviando') ? 'sem_resposta' : (entrega ?? 'enviando');
  const titulo = vistoEm
    ? t('emergency.visto.titulo')
    : escaladoPorPrazo
      ? t('emergency.escalado.titulo')
      : t(`emergency.entrega.${chaveDaEntrega}.titulo`);
  const detalhe = vistoEm
    ? t('emergency.visto.detalhe', { hora: horaCurta(vistoEm) })
    : escaladoPorPrazo
      ? t('emergency.escalado.detalhe')
      : t(`emergency.entrega.${chaveDaEntrega}.detalhe`, { label: ativo ? pedido.rotulo : '' });

  // O que aconteceu: encolhe (e rola) quando falta altura; os botões, logo
  // abaixo, nunca saem da tela. As cores vêm do tema: o vermelho-escuro fixo
  // (#991b1b) sumia no fundo escuro, o padrão do app — e é este texto que diz
  // se o celular foi avisado. No modo só horizontal, é o meio da escolha lateral.
  const situacao = (
    <div
      style={{
        minHeight: 0,
        flexShrink: 1,
        overflowY: 'auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <AlertOctagon
        className="socorro-icone"
        aria-hidden="true"
        style={{
          width: 'clamp(40px, 9vh, 100px)',
          height: 'clamp(40px, 9vh, 100px)',
          flexShrink: 0,
          color: vistoEm ? 'var(--color-ok)' : 'var(--color-danger)',
          animation: escalated && !vistoEm ? 'shake 0.3s infinite' : 'none',
        }}
      />
      <h2
        style={{
          fontSize: 'clamp(1.5rem, 4.8vh, 3rem)',
          lineHeight: 1.15,
          color: vistoEm ? 'var(--tint-ok-text)' : 'var(--color-danger)',
          textAlign: 'center',
          margin: 'clamp(0.25rem, 1.2vh, 1.5rem) 0 0',
          fontWeight: 800,
        }}
      >
        {titulo}
      </h2>
      <p
        style={{
          fontSize: 'clamp(1.05rem, 3vh, 1.75rem)',
          lineHeight: 1.35,
          color: vistoEm ? 'var(--tint-ok-text)' : 'var(--tint-danger-text)',
          textAlign: 'center',
          margin: '0.35rem 0 0',
          fontWeight: 600,
        }}
      >
        {detalhe}
      </p>

      {mensagemDoCuidador && (
        <div
          role="status"
          aria-live="polite"
          data-testid="mensagem-do-cuidador-na-emergencia"
          style={{
            marginTop: 'clamp(0.5rem, 2vh, 1.5rem)',
            width: 'min(760px, 100%)',
            padding: 'clamp(0.5rem, 1.6vh, 1rem) 1.5rem',
            borderRadius: '1.25rem',
            background: '#1B54A8',
            color: '#ffffff',
            textAlign: 'left',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: '0.95rem', opacity: 0.85, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Mensagem do cuidador
          </div>
          <div style={{ fontSize: 'clamp(1.15rem, 3vh, 1.6rem)', fontWeight: 800, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {mensagemDoCuidador.text}
          </div>
        </div>
      )}
    </div>
  );

  // Revisão de UX de 19/10/2026 (achado 10): os botões tinham 340×96 px —
  // ~2,4° de altura, metade do alvo mínimo de 5° —, e o "Não" e o "Sim, parar"
  // ficavam a 24 px um do outro. Agora o alvo mínimo nos dois eixos, e um alvo
  // inteiro entre os dois.
  const estiloDoBotao = (fundo: string, cor = '#ffffff'): React.CSSProperties => ({
    width: 'min(400px, 32vw)',
    minWidth: ALVO_MINIMO,
    height: ALVO_MINIMO,
    background: fundo,
    border: 'none',
    borderRadius: '1.5rem',
    color: cor,
    boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
  });

  // As saídas no modo só horizontal: as mesmas, como metades da escolha lateral.
  const rotuloDoLado = (texto: string) => (
    <span style={{ fontSize: 'clamp(1.5rem, 4.4vh, 2.6rem)', fontWeight: 900, lineHeight: 1.15 }}>{texto}</span>
  );
  const lado = (texto: string, aoEscolher: () => void, fundo: string, cor = '#ffffff', dados?: LadoDaEscolha['dados']): LadoDaEscolha => ({
    nome: texto,
    rotulo: rotuloDoLado(texto),
    aoEscolher,
    estilo: { background: fundo, color: cor, border: 'none' },
    dados: { ...RECUPERACAO, ...dados },
  });
  const saidasLaterais: { esquerda: LadoDaEscolha | null; direita: LadoDaEscolha | null; instrucao: string } = vistoEm
    ? { esquerda: lado(t('emergency.voltar'), voltarDepoisDeVisto, '#16a34a'), direita: null, instrucao: t('emergency.horizontal.voltar') }
    : perguntandoParada
      ? {
          esquerda: lado(t('emergency.pararAlarme.nao'), () => setPerguntandoParada(false), '#dc2626'),
          // Pelo acionador, só com um aperto curto (ver o botão da tela comum).
          direita: lado(t('emergency.pararAlarme.sim'), pararEVoltar, '#e5e7eb', '#111827', { 'data-acionador-aperto-curto': 'true' }),
          instrucao: t('emergency.horizontal.pergunta'),
        }
      : {
          esquerda: lado(t('emergency.cancelAndReturn'), () => setPerguntandoParada(true), escalated ? '#dc2626' : '#3b82f6'),
          direita: null,
          instrucao: t('emergency.horizontal.parar'),
        };

  return (
    // Com um pedido em andamento não há "Voltar" no cabeçalho: um olhar nele
    // desmontava a tela e calava o alarme sem perguntar nada (auditoria de
    // 18/10/2026, item 2). Sair é pelos botões de baixo, em dois passos.
    <GazePageLayout showBack={!ativo} backRoute={saida()}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Cabeçalho e textos encolhem com a altura da janela (revisão de UX
            de 19/10/2026): a 1024×640 os botões de baixo saíam da tela — o
            "Parar o alarme" ia até y = 715 numa janela de 640. */}
        <div style={{ marginBottom: 'clamp(0.4rem, 1.6vh, 2.5rem)', textAlign: 'center', flexShrink: 0 }}>
          <h1
            style={{
              fontSize: 'clamp(1.5rem, 4.2vh, 2.75rem)',
              color: '#ef4444',
              margin: '0 0 0.25rem 0',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6em',
            }}
          >
            <AlertOctagon aria-hidden="true" style={{ width: '1.1em', height: '1.1em', flexShrink: 0 }} /> {t('emergency.title')}
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 2.4vh, 1.25rem)', color: 'var(--color-text-base)', opacity: 0.7, margin: 0, fontWeight: 500 }}>
            {ativo ? 'Alerta disparado. Aguarde atendimento.' : 'Selecione o tipo de ajuda necessário'}
          </p>
        </div>

        {ativo && horizontal ? (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              animation: vistoEm ? 'none' : escalated ? 'pulseBgEscalated 0.5s infinite alternate' : 'pulseBg 1s infinite',
              borderRadius: '2rem',
              border: vistoEm ? '3px solid #16a34a' : escalated ? '6px dashed #b91c1c' : '3px solid #dc2626',
              background: vistoEm ? 'rgba(22, 163, 74, 0.08)' : escalated ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.05)',
              padding: 'clamp(0.5rem, 1.5vh, 1.25rem)',
              boxSizing: 'border-box',
            }}
          >
            <EscolhaLateral
              larguraDoMeio={42}
              esquerda={saidasLaterais.esquerda}
              direita={saidasLaterais.direita}
              centro={
                // `maxHeight`: com pouca altura, a situação rola (ela tem
                // `overflowY: auto`) em vez de ser cortada pelo meio da escolha.
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(0.5rem, 2vh, 1.25rem)', width: '100%', minHeight: 0, maxHeight: '100%' }}>
                  {situacao}
                  {perguntandoParada && !vistoEm && (
                    <p style={{ margin: 0, fontSize: 'clamp(1.05rem, 3vh, 1.6rem)', fontWeight: 800, color: 'var(--tint-danger-text)', textAlign: 'center' }}>
                      {t('emergency.pararAlarme.pergunta')}
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: 'clamp(1rem, 2.6vh, 1.4rem)', fontWeight: 700, color: 'var(--color-text-base)', textAlign: 'center', lineHeight: 1.35 }}>
                    {saidasLaterais.instrucao}
                  </p>
                </div>
              }
            />
            {estilosDaTela}
          </div>
        ) : ativo ? (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              animation: vistoEm ? 'none' : escalated ? 'pulseBgEscalated 0.5s infinite alternate' : 'pulseBg 1s infinite',
              borderRadius: '2rem',
              border: vistoEm ? '3px solid #16a34a' : escalated ? '6px dashed #b91c1c' : '3px solid #dc2626',
              background: vistoEm ? 'rgba(22, 163, 74, 0.08)' : escalated ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.05)',
              padding: 'clamp(0.5rem, 2vh, 2rem)',
              boxSizing: 'border-box',
            }}
          >
            {situacao}

            {/* Os botões são alvos de RECUPERAÇÃO: com o rastreamento
                degradado o dwell só aceita Emergência e recuperação
                (src/interaction/dwell.ts), e parar um alarme falso — ou sair
                depois de o cuidador ver — não funcionava pelo olhar (revisão
                de UX de 19/10/2026, achado 10). Em degradado o dwell deles é
                o mais longo (2,5×). */}
            <div style={{ flexShrink: 0, marginTop: 'clamp(0.5rem, 2vh, 2.5rem)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {vistoEm ? (
                <GazeButton recovery onClick={voltarDepoisDeVisto} style={estiloDoBotao('#16a34a')}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('emergency.voltarAoMenu')}</span>
                </GazeButton>
              ) : perguntandoParada ? (
                // Dois passos para parar: o alarme é o único aviso quando o
                // celular não foi avisado, e um olhar que escorrega no botão não
                // pode calá-lo.
                <div role="group" aria-labelledby="pergunta-parar-alarme" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(0.4rem, 1.4vh, 1rem)' }}>
                  <p id="pergunta-parar-alarme" style={{ margin: 0, fontSize: 'clamp(1.05rem, 3vh, 1.6rem)', fontWeight: 800, color: 'var(--tint-danger-text)', textAlign: 'center' }}>
                    {t('emergency.pararAlarme.pergunta')}
                  </p>
                  {/* Um alvo inteiro (5°) entre o "Não" e o "Sim, parar": um
                      erro de mira no primeiro não pode completar o segundo.
                      Sem quebra de linha — empilhados, os dois não caberiam
                      na altura de 640. */}
                  <div style={{ display: 'flex', columnGap: ALVO_MINIMO, flexWrap: 'nowrap', justifyContent: 'center' }}>
                    <GazeButton recovery onClick={() => setPerguntandoParada(false)} style={estiloDoBotao('#dc2626')}>
                      <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>{t('emergency.pararAlarme.nao')}</span>
                    </GazeButton>
                    {/* Pelo acionador, só com um aperto curto: segurar é o
                        gesto do socorro, e dois "segurar" seguidos chegavam
                        aqui e calavam o alarme (revisão de UX de 20/10/2026,
                        achado 1 — ver `ATRIBUTO_SO_APERTO_CURTO`). */}
                    <GazeButton recovery onClick={pararEVoltar} data-acionador-aperto-curto="true" style={estiloDoBotao('#e5e7eb', '#111827')}>
                      <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>{t('emergency.pararAlarme.sim')}</span>
                    </GazeButton>
                  </div>
                </div>
              ) : (
                <GazeButton
                  recovery
                  onClick={() => setPerguntandoParada(true)}
                  style={estiloDoBotao(escalated ? '#dc2626' : '#3b82f6')}
                >
                  <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    {t('emergency.cancelAndReturn')}
                  </span>
                </GazeButton>
              )}
            </div>
            {estilosDaTela}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
            <GazeGrid columns={2} rows={2}>
              {EMERGENCIES.map((item) => {
                const label = t(item.labelKey);
                return (
                  <GazeButton
                    key={item.id}
                    onClick={() => disparar(item.id, label)}
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
