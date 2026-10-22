import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Circle, Mic, RotateCcw, Square, Volume2 } from 'lucide-react';
import { consentimentoDoPerfil, type ConsentimentoDaVozGuardada, type GravacaoGuardada } from '@tracker/voz/vozGuardada';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { GazeButton } from '../../components/ui/GazeButton';
import { useConfirmacao } from '../../components/ui/DialogoDeConfirmacao';
import { useAuth } from '../../context/AuthContext';
import { pararFala, useEstadoDaVoz, vozClonadaLiberadaPelaLicenca } from '../../services/voz';
import { tocarWav } from '../../services/voz/local';
import { armazemDaVozGuardada, gravacoesDoPerfil } from '../../services/voz/vozGuardada/armazem';
import {
  TERMO_DA_VOZ_GUARDADA, TEXTO_PARA_A_VOZ_DO_COMPUTADOR, gravarFrasesProprias, lerFrasesProprias,
  mesmaFrase, montarListaDeFrases, normalizarFrase,
} from '../../services/voz/vozGuardada/frases';
import {
  MENSAGEM_DA_FALHA, abrirMicrofone, fecharMicrofone, iniciarGravacao, type FalhaDoMicrofone, type GravacaoEmCurso,
} from '../../services/voz/vozGuardada/gravador';
import { MENSAGENS, analisarGravacao, apararSilencio, resumoDaQualidade, type AnaliseDaGravacao } from '../../services/voz/vozGuardada/qualidade';
import { tocarMensagemGuardada } from '../../services/voz/vozGuardada/tocar';
import { codificarWav } from '../../services/voz/vozGuardada/wav';
import { TERMO_DE_CONSENTIMENTO } from '../settings/VozScreen';
import { linhaDoPlano } from './MinhaVozScreen';

/** Teto de uma gravação: frase curta e o texto longo (quem tem disartria lê devagar). */
export const MAX_DA_FRASE_MS = 20_000;
export const MAX_DO_TEXTO_LONGO_MS = 60_000;
/**
 * O motor de voz recusa referência com menos de 2 s
 * (`voice-engine/irisflow_voz/audio.py`, `preparar_referencia`). Uma frase
 * curta ("Sim.") nem é oferecida como base: o cuidador esperaria o preparo
 * para receber um erro.
 */
export const DURACAO_MINIMA_DA_BASE_S = 2;

type Fase = 'pronta' | 'abrindo' | 'gravando' | 'conferindo' | 'revisao' | 'guardando';

interface Tomada {
  frase: string;
  wav: ArrayBuffer;
  analise: AnaliseDaGravacao;
  duracaoS: number;
}

const alvo: React.CSSProperties = { height: '100%', width: '100%', borderRadius: 'var(--radius-xl, 2rem)' };
const rotulo: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 'clamp(1.3rem, 2.7vh, 1.9rem)', fontWeight: 800, lineHeight: 1.15, textAlign: 'center',
};
const conteudo = (icone: React.ReactNode, texto: string, detalhe?: string) => (
  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.55rem', padding: '0.75rem' }}>
    {icone}
    <span style={rotulo}>{texto}</span>
    {detalhe && <span style={{ fontSize: 'clamp(0.95rem, 1.7vh, 1.15rem)', fontWeight: 600, opacity: 0.85, textAlign: 'center' }}>{detalhe}</span>}
  </span>
);
const botaoDoCuidador: React.CSSProperties = {
  padding: '0.7rem 1.1rem', borderRadius: '0.9rem', border: '2px solid var(--color-card-border)',
  background: 'var(--color-card-bg)', color: 'var(--color-text-base)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
};

/** Barra do nível do microfone: de -60 dBFS (vazia) a -10 dBFS (cheia). */
export function nivelEmFracao(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 60) / 50));
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Guardar a própria voz (voice banking, pedido de 19/10/2026), enquanto a
 * pessoa ainda fala: uma frase por vez, gravar, conferir em palavras simples
 * (baixinho, estourado, barulho, cortada) e guardar — ou gravar de novo. Tudo
 * pelo olhar, pelo mouse ou pelo teclado. O cuidador acrescenta frases
 * próprias e decide, com o mouse, apagar uma gravação ou usá-la como base da
 * voz do computador (pelo caminho da voz personalizada, com o termo dela).
 *
 * Gravar e tocar é SEMPRE grátis; o plano só aparece numa linha calma.
 */
export const GravarVozScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentProfile } = useAuth();
  const perfilId = currentProfile?.id ?? null;
  const armazem = useMemo(() => armazemDaVozGuardada(), []);
  const estadoDaVoz = useEstadoDaVoz();
  const vozLiberada = vozClonadaLiberadaPelaLicenca();
  const { confirmar, dialogo } = useConfirmacao();

  const [carregado, setCarregado] = useState(false);
  const [erroDeLeitura, setErroDeLeitura] = useState<string | null>(null);
  // O termo é de cada paciente (revisão de segurança de 20/10/2026): a tela
  // guarda os termos de todos os perfis e confere, a cada desenho, o do perfil
  // ATUAL. Antes valia qualquer termo do computador — quem nunca viu o termo ia
  // direto para gravar — e, derivado assim, trocar de perfil não herda nem por
  // um instante o "Concordo" do anterior.
  const [consentimentos, setConsentimentos] = useState<ConsentimentoDaVozGuardada[]>([]);
  const consentido = consentimentoDoPerfil(consentimentos, perfilId) !== null;
  const [gravacoes, setGravacoes] = useState<GravacaoGuardada[]>([]);
  const [proprias, setProprias] = useState<string[]>(() => lerFrasesProprias(perfilId));
  const frases = useMemo(() => montarListaDeFrases(proprias, gravacoes.map((g) => g.texto)), [proprias, gravacoes]);
  const [indice, setIndice] = useState(0);
  const posicao = Math.min(indice, frases.length - 1);
  const frase = frases[posicao];
  const guardada = gravacoes.find((g) => mesmaFrase(g.texto, frase)) ?? null;
  const textoLongo = mesmaFrase(frase, TEXTO_PARA_A_VOZ_DO_COMPUTADOR);

  const [fase, setFase] = useState<Fase>('pronta');
  const [tomada, setTomada] = useState<Tomada | null>(null);
  const [nivel, setNivel] = useState(0);
  const [inicioMs, setInicioMs] = useState<number | null>(null);
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  const [falhaDoMicrofone, setFalhaDoMicrofone] = useState<FalhaDoMicrofone | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'alerta'; texto: string } | null>(null);
  const [novaFrase, setNovaFrase] = useState('');
  const [termoDaBase, setTermoDaBase] = useState<'fechado' | 'aberto' | 'enviando'>('fechado');
  const [aceitouBase, setAceitouBase] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const gravacaoRef = useRef<GravacaoEmCurso | null>(null);
  const cancelarAberturaRef = useRef(false);
  const vivoRef = useRef(true);
  /** A frase que está sendo gravada (a tela pode mudar de frase depois). */
  const fraseDaGravacaoRef = useRef(frase);

  const carregar = useCallback(async () => {
    const r = await armazem.listar();
    if (!vivoRef.current) return;
    if (!r.ok) {
      setErroDeLeitura(r.erro);
    } else {
      setErroDeLeitura(null);
      setConsentimentos(r.consentimentos);
      setGravacoes(gravacoesDoPerfil(r.gravacoes, perfilId));
    }
    setCarregado(true);
  }, [armazem, perfilId]);

  useEffect(() => {
    vivoRef.current = true;
    void carregar();
    return () => {
      vivoRef.current = false;
      gravacaoRef.current?.cancelar();
      gravacaoRef.current = null;
      fecharMicrofone(streamRef.current);
      streamRef.current = null;
      pararFala();
    };
  }, [carregar]);

  // Relógio da gravação (4 vezes por segundo basta para "0:03").
  useEffect(() => {
    if (fase !== 'gravando') return;
    const id = setInterval(() => setAgoraMs(Date.now()), 250);
    return () => clearInterval(id);
  }, [fase]);

  const irPara = (i: number) => {
    if (frases.length === 0) return;
    setIndice(((i % frases.length) + frases.length) % frases.length);
    setTomada(null);
    setAviso(null);
    setFalhaDoMicrofone(null);
    setTermoDaBase('fechado');
    setAceitouBase(false);
  };

  const consentir = async () => {
    const termo = { texto: TERMO_DA_VOZ_GUARDADA, aceitoEm: new Date().toISOString(), perfilId };
    const r = await armazem.consentir(termo);
    if (!vivoRef.current) return;
    if (!r.ok) {
      setAviso({ tipo: 'alerta', texto: r.erro });
      return;
    }
    // O termo vale para o perfil que aceitou; os dos outros ficam como estavam.
    setConsentimentos((lista) => [...lista.filter((c) => c.perfilId !== termo.perfilId), termo]);
    setAviso(null);
  };

  const parar = async () => {
    const g = gravacaoRef.current;
    gravacaoRef.current = null;
    if (!g) {
      // Ainda abrindo o microfone: desiste da abertura.
      cancelarAberturaRef.current = true;
      setFase('pronta');
      return;
    }
    setFase('conferindo');
    const audio = await g.parar();
    fecharMicrofone(streamRef.current);
    streamRef.current = null;
    if (!vivoRef.current) return;
    if (!audio) {
      setAviso({ tipo: 'alerta', texto: 'Não consegui ler a gravação. Tente gravar de novo.' });
      setFase('pronta');
      return;
    }
    const fraseGravada = fraseDaGravacaoRef.current;
    const analise = analisarGravacao(audio.amostras, audio.taxa, fraseGravada);
    const aparada = apararSilencio(audio.amostras, audio.taxa, analise);
    setTomada({ frase: fraseGravada, wav: codificarWav(aparada, audio.taxa), analise, duracaoS: aparada.length / audio.taxa });
    setFase('revisao');
  };
  const pararRef = useRef(parar);
  pararRef.current = parar;

  const gravar = async () => {
    setAviso(null);
    setTomada(null);
    setFalhaDoMicrofone(null);
    pararFala();
    cancelarAberturaRef.current = false;
    fraseDaGravacaoRef.current = frase;
    setFase('abrindo');
    const mic = await abrirMicrofone();
    if (!vivoRef.current || cancelarAberturaRef.current) {
      if (mic.ok) fecharMicrofone(mic.stream);
      return;
    }
    if (!mic.ok) {
      setFalhaDoMicrofone(mic.motivo);
      setFase('pronta');
      return;
    }
    streamRef.current = mic.stream;
    try {
      gravacaoRef.current = iniciarGravacao(mic.stream, {
        maxMs: textoLongo ? MAX_DO_TEXTO_LONGO_MS : MAX_DA_FRASE_MS,
        aoNivel: (rms) => { if (vivoRef.current) setNivel(rms); },
        aoLimite: () => { void pararRef.current(); },
      });
    } catch (e) {
      console.warn('[voz-guardada] não foi possível começar a gravar:', e);
      fecharMicrofone(mic.stream);
      streamRef.current = null;
      setFalhaDoMicrofone('outro');
      setFase('pronta');
      return;
    }
    setNivel(0);
    setInicioMs(Date.now());
    setAgoraMs(Date.now());
    setFase('gravando');
  };

  const ouvirTomada = () => {
    if (!tomada) return;
    pararFala();
    void tocarWav(tomada.wav.slice(0)).catch((e) => {
      console.warn('[voz-guardada] não foi possível tocar a gravação nova:', e);
      setAviso({ tipo: 'alerta', texto: 'Não consegui tocar a gravação agora.' });
    });
  };

  const ouvirGuardada = async () => {
    if (!guardada) return;
    const r = await tocarMensagemGuardada(guardada, armazem);
    if (r.como === 'voz_do_computador') setAviso({ tipo: 'alerta', texto: 'A gravação não abriu agora; falei a frase com a voz do computador.' });
    else if (r.como === 'nada' && r.motivo !== 'substituida') setAviso({ tipo: 'alerta', texto: 'Não consegui tocar a gravação agora.' });
  };

  const guardar = async () => {
    if (!tomada) return;
    setFase('guardando');
    const anterior = gravacoes.find((g) => mesmaFrase(g.texto, tomada.frase)) ?? null;
    const r = await armazem.salvar({
      id: crypto.randomUUID(),
      texto: tomada.frase,
      wav: tomada.wav,
      duracaoS: tomada.duracaoS,
      qualidade: tomada.analise.qualidade,
      perfilId,
      ...(anterior ? { substitui: anterior.id } : {}),
    });
    if (!vivoRef.current) return;
    if (!r.ok) {
      setAviso({ tipo: 'alerta', texto: r.erro });
      setFase('revisao');
      return;
    }
    setTomada(null);
    await carregar();
    setAviso({ tipo: 'ok', texto: 'Guardada! Agora ela toca em Minha voz.' });
    setFase('pronta');
  };

  const acrescentarFrase = () => {
    const f = normalizarFrase(novaFrase);
    if (!f) return;
    setNovaFrase('');
    const existente = frases.findIndex((x) => mesmaFrase(x, f));
    if (existente >= 0) {
      irPara(existente);
      return;
    }
    const lista = [...proprias, f];
    setProprias(lista);
    const ok = gravarFrasesProprias(perfilId, lista);
    // A tela vai para a frase nova, onde quer que ela caia na lista.
    const novaLista = montarListaDeFrases(lista, gravacoes.map((g) => g.texto));
    setIndice(Math.max(0, novaLista.findIndex((x) => mesmaFrase(x, f))));
    setTomada(null);
    setAviso(ok ? null : { tipo: 'alerta', texto: 'Não consegui guardar a frase neste computador: ela fica só até fechar o IrisFlow.' });
  };

  const apagarGuardada = async () => {
    if (!guardada) return;
    const ok = await confirmar({
      titulo: 'Apagar esta gravação?',
      descricao: `"${guardada.texto}" some deste computador. Se a voz mudar, talvez não dê para gravar igual de novo.`,
      confirmar: 'Apagar gravação',
    });
    if (!ok) return;
    const r = await armazem.apagar(guardada.id);
    if (!r.ok) {
      setAviso({ tipo: 'alerta', texto: r.erro });
      return;
    }
    await carregar();
    setAviso({ tipo: 'ok', texto: 'Gravação apagada.' });
  };

  /** O "posso apagar quando quiser" do termo, de uma vez — decisão do cuidador, com confirmação. */
  const apagarTodas = async () => {
    if (gravacoes.length === 0) return;
    const ok = await confirmar({
      titulo: `Apagar todas as ${gravacoes.length} gravações?`,
      descricao: 'Todas as mensagens guardadas com a voz desta pessoa somem deste computador. Se a voz mudar, talvez não dê para gravar igual de novo.',
      confirmar: 'Apagar todas',
    });
    if (!ok) return;
    let falhas = 0;
    for (const g of gravacoes) if (!(await armazem.apagar(g.id)).ok) falhas++;
    await carregar();
    setAviso(falhas === 0 ? { tipo: 'ok', texto: 'Todas as gravações foram apagadas.' } : { tipo: 'alerta', texto: `Não consegui apagar ${falhas} ${falhas === 1 ? 'gravação' : 'gravações'}. Tente de novo.` });
  };

  const usarComoBase = async () => {
    if (!guardada || !armazem.usarComoReferencia || !aceitouBase) return;
    setTermoDaBase('enviando');
    const r = await armazem.usarComoReferencia(guardada.id, { texto: TERMO_DE_CONSENTIMENTO, aceitoEm: new Date().toISOString(), perfilId });
    if (!vivoRef.current) return;
    setTermoDaBase('fechado');
    setAceitouBase(false);
    setAviso(
      r.ok
        ? { tipo: 'ok', texto: `Pronto: esta gravação é a base da voz do computador (qualidade ${r.qualidade === 'boa' ? 'boa' : r.qualidade === 'aceitavel' ? 'aceitável' : 'fraca'}).` }
        : { tipo: 'alerta', texto: r.erro },
    );
  };

  const podeVirarBase = !!guardada && !!armazem.usarComoReferencia && vozLiberada && estadoDaVoz?.disponivel === true;
  const curtaParaBase = podeVirarBase && !!guardada && guardada.duracaoS < DURACAO_MINIMA_DA_BASE_S;
  const ocupado = fase !== 'pronta' && fase !== 'revisao';

  // ── Telas ────────────────────────────────────────────────────────────────

  if (!carregado) {
    return (
      <GazePageLayout showBack={true} backRoute="/minha-voz" titulo="Gravar a minha voz">
        <p role="status" style={{ fontSize: '1.3rem', color: 'var(--color-text-muted)' }}>Abrindo…</p>
      </GazePageLayout>
    );
  }

  if (!consentido) {
    return (
      <GazePageLayout showBack={true} backRoute="/minha-voz" titulo="Gravar a minha voz" subtitulo="Antes de gravar">
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: 'clamp(1rem, 2.5vh, 1.75rem)', borderRadius: 'var(--radius-xl, 2rem)',
              background: 'var(--color-card-bg)', border: '1px solid var(--color-card-border)', overflowY: 'auto', minHeight: 0,
            }}
          >
            {TERMO_DA_VOZ_GUARDADA.split('\n\n').map((p, i) => (
              <p key={i} style={{ margin: 0, fontSize: i === 0 ? 'clamp(1.4rem, 3vh, 2rem)' : 'clamp(1.1rem, 2.2vh, 1.45rem)', fontWeight: i === 0 ? 800 : 500, lineHeight: 1.45, color: 'var(--color-text-base)' }}>
                {p}
              </p>
            ))}
          </div>
          {aviso && <p role="alert" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--tint-warn-text)' }}>{aviso.texto}</p>}
          <div style={{ flex: 1, minHeight: 0 }}>
            <GazeGrid columns={2} rows={1} rolarSoSeNaoCouber>
              <GazeButton onClick={() => void consentir()} variante="primaria" aria-label="Concordo e quero gravar" style={alvo}>
                {conteudo(<Check size={52} aria-hidden="true" />, 'Concordo e quero gravar')}
              </GazeButton>
              <GazeButton onClick={() => navigate('/minha-voz')} aria-label="Agora não" style={alvo}>
                {conteudo(<ArrowLeft size={48} aria-hidden="true" />, 'Agora não')}
              </GazeButton>
            </GazeGrid>
          </div>
        </div>
      </GazePageLayout>
    );
  }

  const tamanhoDaFrase = frase.length > 120 ? 'clamp(1.15rem, 2.6vh, 1.7rem)' : frase.length > 50 ? 'clamp(1.6rem, 3.8vh, 2.6rem)' : 'clamp(2.2rem, 6.5vh, 4.4rem)';
  const refazer = tomada?.analise.qualidade === 'refazer';

  const botoes: React.ReactNode[] = (() => {
    if (fase === 'abrindo' || fase === 'gravando') {
      return [
        <GazeButton key="parar" onClick={() => void parar()} variante="primaria" aria-label="Parar a gravação" style={alvo}>
          {conteudo(<Square size={52} aria-hidden="true" fill="currentColor" />, 'Parar', 'quando terminar de falar')}
        </GazeButton>,
      ];
    }
    if (fase === 'conferindo' || fase === 'guardando') return [];
    if (fase === 'revisao' && tomada) {
      return [
        <GazeButton key="regravar" onClick={() => void gravar()} variante={refazer ? 'primaria' : 'secundaria'} aria-label="Gravar de novo" style={alvo}>
          {conteudo(<RotateCcw size={48} aria-hidden="true" />, 'Gravar de novo')}
        </GazeButton>,
        <GazeButton key="ouvir" onClick={ouvirTomada} aria-label="Ouvir a gravação" style={alvo}>
          {conteudo(<Volume2 size={48} aria-hidden="true" />, 'Ouvir')}
        </GazeButton>,
        <GazeButton
          key="guardar"
          onClick={() => void guardar()}
          variante={refazer ? 'secundaria' : 'primaria'}
          aria-label={guardada ? 'Guardar no lugar da anterior' : refazer ? 'Guardar assim mesmo' : 'Guardar'}
          style={alvo}
        >
          {conteudo(<Check size={52} aria-hidden="true" />, refazer ? 'Guardar assim mesmo' : 'Guardar', guardada ? 'no lugar da anterior' : undefined)}
        </GazeButton>,
      ];
    }
    return [
      <GazeButton key="anterior" onClick={() => irPara(posicao - 1)} aria-label="Frase anterior" style={alvo}>
        {conteudo(<ArrowLeft size={48} aria-hidden="true" />, 'Anterior')}
      </GazeButton>,
      ...(guardada
        ? [
            <GazeButton key="ouvir-guardada" onClick={() => void ouvirGuardada()} aria-label="Ouvir a gravação guardada" style={alvo}>
              {conteudo(<Volume2 size={48} aria-hidden="true" />, 'Ouvir')}
            </GazeButton>,
          ]
        : []),
      <GazeButton key="gravar" onClick={() => void gravar()} variante={guardada ? 'secundaria' : 'primaria'} aria-label={guardada ? 'Gravar de novo' : 'Gravar'} style={alvo}>
        {conteudo(<Circle size={48} aria-hidden="true" fill="#F87171" color="#F87171" />, guardada ? 'Gravar de novo' : 'Gravar')}
      </GazeButton>,
      <GazeButton key="proxima" onClick={() => irPara(posicao + 1)} variante={guardada ? 'primaria' : 'secundaria'} aria-label="Próxima frase" style={alvo}>
        {conteudo(<ArrowRight size={48} aria-hidden="true" />, 'Próxima')}
      </GazeButton>,
    ];
  })();

  const status = (() => {
    if (falhaDoMicrofone) return { tipo: 'alerta' as const, linhas: [MENSAGEM_DA_FALHA[falhaDoMicrofone]] };
    if (fase === 'abrindo') return { tipo: 'info' as const, linhas: ['Abrindo o microfone…'] };
    if (fase === 'gravando') return { tipo: 'info' as const, linhas: ['Gravando. Fale a frase com calma; depois, olhe para Parar.'] };
    if (fase === 'conferindo') return { tipo: 'info' as const, linhas: ['Conferindo a gravação…'] };
    if (fase === 'guardando') return { tipo: 'info' as const, linhas: ['Guardando…'] };
    if (fase === 'revisao' && tomada) {
      const revisao = [resumoDaQualidade(tomada.analise), ...tomada.analise.problemas.map((p) => `${MENSAGENS[p.tipo].titulo} ${MENSAGENS[p.tipo].dica}`)];
      // O erro do "Guardar" ou do "Ouvir" vem PRIMEIRO, na linha grande
      // (revisão de UX de 20/10/2026, achado 2). A falha volta para a revisão,
      // e o resumo ("Ficou boa!") tomava o lugar do aviso: a gravação não era
      // guardada — ou não tocava — e a tela não dizia.
      if (aviso?.tipo === 'alerta') return { tipo: 'alerta' as const, linhas: [aviso.texto, ...revisao] };
      return {
        tipo: tomada.analise.qualidade === 'boa' ? ('ok' as const) : ('alerta' as const),
        linhas: revisao,
      };
    }
    if (aviso) return { tipo: aviso.tipo, linhas: [aviso.texto] };
    return { tipo: 'info' as const, linhas: [guardada ? 'Esta frase já está guardada. Dá para ouvir ou gravar de novo.' : 'Olhe para Gravar e fale a frase.'] };
  })();
  const corDoStatus = status.tipo === 'ok' ? 'var(--tint-ok-text)' : status.tipo === 'alerta' ? 'var(--tint-warn-text)' : 'var(--color-text-muted)';

  return (
    <GazePageLayout showBack={true} backRoute="/minha-voz" titulo="Gravar a minha voz" subtitulo={`Frase ${posicao + 1} de ${frases.length}`}>
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: '0.8rem', minHeight: 0 }}>
        {erroDeLeitura && <p role="alert" style={{ margin: 0, fontSize: '1.15rem', color: 'var(--tint-warn-text)' }}>{erroDeLeitura}</p>}

        {/* A frase, grande: é ela que a pessoa vai ler em voz alta. */}
        <div
          data-testid="frase-para-gravar"
          style={{
            display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: 'clamp(0.8rem, 2vh, 1.4rem) clamp(1rem, 2.5vw, 2rem)',
            borderRadius: 'var(--radius-xl, 2rem)', background: 'var(--color-card-bg)',
            border: `2px solid ${fase === 'gravando' ? '#F87171' : 'var(--color-card-border)'}`, minHeight: 0,
          }}
        >
          <span style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', fontSize: 'clamp(1rem, 1.9vh, 1.25rem)', fontWeight: 700 }}>
            <span style={{ color: guardada ? 'var(--tint-ok-text)' : 'var(--color-text-muted)' }}>{guardada ? '✓ Já guardada' : 'Ainda não gravada'}</span>
            {textoLongo && <span style={{ color: 'var(--color-accent)' }}>Texto longo: o melhor para a voz do computador</span>}
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.2, fontSize: tamanhoDaFrase, color: 'var(--color-text-base)' }}>
            {frase}
          </span>
        </div>

        {/* O que está acontecendo, em palavras (e o nível do microfone ao gravar). */}
        <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {fase === 'gravando' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#F87171', fontWeight: 800, fontSize: '1.2rem' }}>
                <Mic size={24} /> {inicioMs !== null ? mmss(agoraMs - inicioMs) : '0:00'}
              </span>
              <span aria-hidden="true" data-testid="nivel-do-microfone" style={{ flex: 1, height: 18, borderRadius: 9, background: 'rgba(159,176,200,0.22)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round(nivelEmFracao(nivel) * 100)}%`, background: 'var(--color-ok)', transition: 'width 80ms linear' }} />
              </span>
            </div>
          )}
          {status.linhas.map((l, i) => (
            <p key={i} style={{ margin: 0, fontSize: i === 0 ? 'clamp(1.15rem, 2.3vh, 1.5rem)' : 'clamp(1.02rem, 2vh, 1.25rem)', fontWeight: i === 0 ? 800 : 600, color: corDoStatus }}>
              {l}
            </p>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          {botoes.length > 0 && (
            <GazeGrid columns={botoes.length} rows={1} rolarSoSeNaoCouber>
              {botoes}
            </GazeGrid>
          )}
        </div>

        {/* Para o cuidador (mouse e teclado): frases próprias, apagar, virar base da voz do computador. */}
        <details data-no-dwell="true" style={{ fontSize: '1rem', color: 'var(--color-text-base)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-text-muted)' }}>Para o cuidador: frases próprias e gravações</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
            <form
              onSubmit={(e) => { e.preventDefault(); acrescentarFrase(); }}
              style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}
            >
              <label htmlFor="frase-propria" style={{ fontWeight: 700 }}>Frase própria</label>
              <input
                id="frase-propria"
                data-no-dwell="true"
                value={novaFrase}
                maxLength={160}
                onChange={(e) => setNovaFrase(e.target.value)}
                placeholder="Ex.: Oi, Joana, que saudade!"
                style={{ flex: '1 1 18rem', minHeight: '2.75rem', padding: '0 0.9rem', borderRadius: '0.75rem', border: '1px solid var(--field-border)', background: 'var(--field-bg)', color: 'var(--color-text-base)', fontSize: '1rem' }}
              />
              <button type="submit" data-no-dwell="true" disabled={!novaFrase.trim() || ocupado} style={botaoDoCuidador}>Acrescentar</button>
            </form>
            {gravacoes.length > 0 && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {guardada && (
                  <button type="button" data-no-dwell="true" onClick={() => void apagarGuardada()} disabled={ocupado} style={{ ...botaoDoCuidador, color: 'var(--tint-danger-text)', borderColor: 'var(--tint-danger-border)' }}>
                    Apagar esta gravação
                  </button>
                )}
                <button type="button" data-no-dwell="true" onClick={() => void apagarTodas()} disabled={ocupado} style={{ ...botaoDoCuidador, color: 'var(--tint-danger-text)', borderColor: 'var(--tint-danger-border)' }}>
                  Apagar todas as gravações ({gravacoes.length})
                </button>
                {podeVirarBase && !curtaParaBase && termoDaBase === 'fechado' && (
                  <button type="button" data-no-dwell="true" onClick={() => setTermoDaBase('aberto')} disabled={ocupado} style={botaoDoCuidador}>
                    Usar como base da voz do computador
                  </button>
                )}
              </div>
            )}
            {curtaParaBase && (
              <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                Para virar a base da voz do computador, a gravação precisa ter pelo menos {DURACAO_MINIMA_DA_BASE_S} segundos. A
                melhor para isso é a do texto longo, a última da lista.
              </p>
            )}
            {podeVirarBase && termoDaBase !== 'fechado' && (
              <section aria-labelledby="termo-da-base" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1rem', borderRadius: '1rem', border: '2px solid var(--color-primary)' }}>
                <h3 id="termo-da-base" style={{ margin: 0, fontSize: '1.05rem' }}>Termo da voz personalizada</h3>
                {estadoDaVoz?.voz.importada && (
                  <p style={{ margin: 0, color: 'var(--tint-warn-text)', fontWeight: 700 }}>Isto troca a voz do computador que está em uso agora.</p>
                )}
                {TERMO_DE_CONSENTIMENTO.split('\n\n').map((p, i) => <p key={i} style={{ margin: 0, lineHeight: 1.5 }}>{p}</p>)}
                <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontWeight: 700 }}>
                  <input type="checkbox" data-no-dwell="true" checked={aceitouBase} onChange={(e) => setAceitouBase(e.target.checked)} style={{ width: 22, height: 22 }} />
                  Li e aceito o termo. Tenho autorização para usar esta voz.
                </label>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button type="button" data-no-dwell="true" onClick={() => void usarComoBase()} disabled={!aceitouBase || termoDaBase === 'enviando'} style={botaoDoCuidador}>
                    {termoDaBase === 'enviando' ? 'Preparando a voz…' : 'Usar esta gravação'}
                  </button>
                  <button type="button" data-no-dwell="true" onClick={() => { setTermoDaBase('fechado'); setAceitouBase(false); }} disabled={termoDaBase === 'enviando'} style={botaoDoCuidador}>
                    Cancelar
                  </button>
                </div>
              </section>
            )}
          </div>
        </details>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {armazem.onde === 'memoria' && (
            <p style={{ margin: 0, fontSize: '1.02rem', color: 'var(--tint-warn-text)' }}>Neste modo de teste, as gravações ficam só até fechar o IrisFlow.</p>
          )}
          <p data-testid="linha-do-plano" style={{ margin: 0, fontSize: '1.02rem', color: 'var(--color-text-muted)' }}>{linhaDoPlano(vozLiberada)}</p>
        </div>
      </div>
      {dialogo}
    </GazePageLayout>
  );
};
