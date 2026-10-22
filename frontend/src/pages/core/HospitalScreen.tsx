import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BedDouble, BellRing, CheckCircle2, GlassWater, LayoutGrid, PersonStanding,
  ThermometerSnowflake, ThermometerSun, Users, Wind, type LucideIcon,
} from 'lucide-react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { GazeButton } from '../../components/ui/GazeButton';
import { emitirFalaDoPaciente } from '../../cloud/eventos';
import { falaFalhou, falaSaiu, falarDoPaciente } from '../../services/voz/falaDoPaciente';
import { logSentence } from '../../utils/clinicalLogger';
import { useChamadoDaEnfermagem } from './hospital/chamadoDaEnfermagem';
import { ESPACO_DO_QUARTO, colunasDoQuarto, useMedidaDaGrade } from './hospital/colunasDoQuarto';
import { FRASES_DAS_NECESSIDADES } from './hospital/frasesDoHospital';

interface CartaoBase {
  id: string;
  /** O nome do botão: é também o que a varredura falada diz ao passar por ele. */
  titulo: string;
  Icone: LucideIcon;
  /** Cor do selo atrás do ícone. */
  cor: string;
}

/** Abre outra tela. */
interface CartaoDeRota extends CartaoBase { tipo: 'rota'; rota: string; descricao: string }
/** Fala uma frase pelo paciente, anota no histórico e manda ao celular do cuidador. */
interface CartaoDeFrase extends CartaoBase { tipo: 'frase'; frase: string }
/** Chama a enfermagem: pedido de ajuda ao celular, não a Emergência. */
interface CartaoDeChamado extends CartaoBase { tipo: 'chamado'; descricao: string }

export type CartaoDoHospital = CartaoDeRota | CartaoDeFrase | CartaoDeChamado;

/**
 * Os botões do quarto, na ordem em que a varredura passa e o olhar lê: primeiro
 * o que mais pesa (a dor e a enfermagem), por último a saída para o menu
 * completo, que ninguém aciona sem querer no meio de uma necessidade.
 *
 * Dez alvos, acima dos seis que a `GazeGrid` recomenda por tela, de propósito: é
 * o pedido do modo hospital (as nove necessidades do leito mais a saída). O
 * piso de 5° e o afastamento de 1,5° entre eles valem como em qualquer tela, na
 * largura e na altura: a grade tem cinco colunas e duas linhas quando a janela
 * comporta, e menos colunas (e mais linhas, que rolam se não couberem) quando
 * não comporta ou quando o piso é maior (`colunasDoQuarto`). A ordem é a mesma.
 *
 * As frases (em `frasesDoHospital.ts`, para a voz clonada deixá-las prontas no
 * cache) são ditas na primeira pessoa e sem pedir nada além do que o botão diz:
 * "Estou com sede" não é "traga água" — em jejum, pode não poder beber.
 */
export const CARTOES_DO_HOSPITAL: readonly CartaoDoHospital[] = [
  { id: 'dor', tipo: 'rota', titulo: 'Dor', descricao: 'Mostrar onde e quanto dói', rota: '/dor', Icone: PersonStanding, cor: '#FDBA74' },
  { id: 'enfermagem', tipo: 'chamado', titulo: 'Chamar a enfermagem', descricao: 'Toca o chamado e avisa o celular', Icone: BellRing, cor: '#B54708' },
  { id: 'aspirar', tipo: 'frase', titulo: 'Aspirar', frase: FRASES_DAS_NECESSIDADES.aspirar, Icone: Wind, cor: '#7DB4F5' },
  // Sim · Não é a tela que já existe (`/sim-nao`): a do modo só horizontal está
  // sendo escrita à parte, e a ligação a ela cabe depois.
  { id: 'sim-nao', tipo: 'rota', titulo: 'Sim · Não', descricao: 'Responder com um olhar', rota: '/sim-nao', Icone: CheckCircle2, cor: '#6EE7A0' },
  { id: 'posicao', tipo: 'frase', titulo: 'Posição', frase: FRASES_DAS_NECESSIDADES.posicao, Icone: BedDouble, cor: '#C4A5F5' },
  { id: 'sede', tipo: 'frase', titulo: 'Sede', frase: FRASES_DAS_NECESSIDADES.sede, Icone: GlassWater, cor: '#67E0E0' },
  { id: 'frio', tipo: 'frase', titulo: 'Frio', frase: FRASES_DAS_NECESSIDADES.frio, Icone: ThermometerSnowflake, cor: '#93C5FD' },
  { id: 'calor', tipo: 'frase', titulo: 'Calor', frase: FRASES_DAS_NECESSIDADES.calor, Icone: ThermometerSun, cor: '#FBBF5B' },
  { id: 'familia', tipo: 'frase', titulo: 'Família', frase: FRASES_DAS_NECESSIDADES.familia, Icone: Users, cor: '#FF8A8A' },
  { id: 'mais', tipo: 'rota', titulo: 'Mais opções', descricao: 'O menu completo', rota: '/menu-completo', Icone: LayoutGrid, cor: '#C89BF7' },
];

/** Quanto tempo o botão mostra o que aconteceu com a fala, antes de voltar ao texto de sempre. */
const DESTAQUE_DA_FALA_MS = 3000;

type EstadoDaFala = 'falando' | 'falou' | 'nao_falou';

const TEXTO_DA_FALA: Record<EstadoDaFala, string> = {
  falando: 'Falando…',
  falou: 'Falei em voz alta',
  nao_falou: 'Sem som. O texto está na tela',
};

const SOMENTE_PARA_LEITOR_DE_TELA: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)',
};

/**
 * A tela inicial do modo hospital (rodada 3, 21/10/2026): para quem está num
 * leito de UTI ou enfermaria, a pergunta de sempre é curta — dor, sede, aspirar,
 * posição, frio, calor, chamar a enfermagem, família, sim/não. O menu comum
 * pede dois passos até a primeira frase; aqui é um olhar.
 *
 * - Cada necessidade fala UMA frase pelo paciente (na voz dele, se houver), anota
 *   no histórico e manda ao celular do cuidador. Se a voz não sai, o texto vai
 *   para a tela em letra grande (`falarDoPaciente`) e o botão diz "Sem som":
 *   num quarto de UTI, o barulho dos monitores pode cobrir a voz.
 * - "Dor" abre o mapa da dor; "Sim · Não", a tela que já existe; "Mais opções",
 *   o menu completo, de onde se desliga o modo hospital.
 * - "Chamar a enfermagem" é o pedido de ajuda (ver `chamadoDaEnfermagem.ts`).
 *
 * Não há botão Voltar: esta é a tela de onde se parte. Tampouco há Emergência
 * própria: o botão de socorro é global (`EmergencyProvider`) e continua a um
 * olhar em todas as telas, esta incluída.
 */
export const HospitalScreen: React.FC = () => {
  const navigate = useNavigate();
  const { chamando, linha, linhaCompleta, chamar } = useChamadoDaEnfermagem();

  // As colunas saem da largura de que a grade dispõe (e do piso do alvo), para a
  // célula nunca ficar abaixo do piso de 5° na largura.
  const areaDaGrade = useRef<HTMLDivElement>(null);
  const medida = useMedidaDaGrade(areaDaGrade);
  const colunas = colunasDoQuarto({ ...medida, alvos: CARTOES_DO_HOSPITAL.length });
  const linhas = Math.ceil(CARTOES_DO_HOSPITAL.length / colunas);

  // Uma fala por vez em destaque: a mais recente toma o lugar da anterior e o
  // resultado de uma fala velha, que termina depois, não mexe no que se vê.
  const [fala, setFala] = useState<{ id: string; estado: EstadoDaFala } | null>(null);
  const turnoDaFala = useRef(0);
  const limparFala = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (limparFala.current) clearTimeout(limparFala.current); }, []);

  const dizer = (c: CartaoDeFrase) => {
    const meu = ++turnoDaFala.current;
    if (limparFala.current) { clearTimeout(limparFala.current); limparFala.current = null; }
    setFala({ id: c.id, estado: 'falando' });
    // O histórico e o celular do cuidador não esperam a voz: se ela falhar, o
    // pedido continua valendo (e o texto aparece em letra grande na tela).
    logSentence(c.frase);
    emitirFalaDoPaciente(c.frase, 'frase');
    void falarDoPaciente(c.frase, { rate: 0.9 }).then((r) => {
      if (turnoDaFala.current !== meu) return;
      // Outra fala do paciente que toma o lugar desta, ou uma fala parada de
      // propósito, não é "falei" nem "sem som": o botão simplesmente volta ao normal.
      const estado: EstadoDaFala | null = falaSaiu(r) ? 'falou' : falaFalhou(r) ? 'nao_falou' : null;
      if (!estado) { setFala(null); return; }
      setFala({ id: c.id, estado });
      limparFala.current = setTimeout(() => {
        limparFala.current = null;
        if (turnoDaFala.current === meu) setFala(null);
      }, DESTAQUE_DA_FALA_MS);
    });
  };

  const aoEscolher = (c: CartaoDoHospital) => {
    if (c.tipo === 'rota') navigate(c.rota);
    else if (c.tipo === 'frase') dizer(c);
    else chamar();
  };

  const cartao = (c: CartaoDoHospital) => {
    const daFala = fala?.id === c.id ? fala.estado : null;
    const ehChamado = c.tipo === 'chamado';
    const titulo = ehChamado && chamando ? 'CHAMANDO…' : c.titulo;
    const subtexto = c.tipo === 'frase'
      ? (daFala ? TEXTO_DA_FALA[daFala] : `“${c.frase}”`)
      : c.tipo === 'chamado'
        ? (linha ?? c.descricao)
        : c.descricao;
    return (
      <GazeButton
        key={c.id}
        onClick={() => aoEscolher(c)}
        aria-label={c.titulo}
        style={{
          height: '100%',
          borderRadius: 'var(--radius-xl, 2rem)',
          // O chamado é o único cartão cheio: laranja, nunca o vermelho, que o
          // app reserva para a Emergência.
          ...(ehChamado ? { background: '#B54708', color: '#ffffff', border: '2px solid #B54708' } : {}),
        }}
      >
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 'clamp(0.4rem, 1.2vh, 0.8rem)', textAlign: 'center', padding: '0.75rem', width: '100%',
            boxSizing: 'border-box', overflowWrap: 'anywhere',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 'clamp(52px, 8vh, 84px)', height: 'clamp(52px, 8vh, 84px)', borderRadius: '30%',
              background: ehChamado
                ? 'rgba(255, 255, 255, 0.2)'
                : `linear-gradient(155deg, color-mix(in srgb, ${c.cor} 72%, #ffffff), ${c.cor})`,
              color: ehChamado ? '#ffffff' : '#0B1B33',
            }}
          >
            <c.Icone size={40} strokeWidth={2.2} />
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 3.1vh, 2.2rem)', fontWeight: 800, lineHeight: 1.1,
              color: ehChamado ? '#ffffff' : 'var(--color-text-base)',
            }}
          >
            {titulo}
          </span>
          <span
            style={{
              fontSize: 'clamp(1rem, 1.9vh, 1.3rem)', fontWeight: 600, lineHeight: 1.3,
              color: ehChamado ? '#ffffff' : 'var(--color-text-muted)',
            }}
          >
            {subtexto}
          </span>
        </div>
      </GazeButton>
    );
  };

  // O que um leitor de tela anuncia: só os resultados, não "falando…".
  const cartaoFalado = fala ? CARTOES_DO_HOSPITAL.find((c) => c.id === fala.id) : undefined;
  const anuncioDaFala = cartaoFalado && fala && fala.estado !== 'falando'
    ? `${cartaoFalado.titulo}: ${fala.estado === 'falou' ? 'falei em voz alta.' : 'sem som. O texto está na tela.'}`
    : '';
  const anuncio = [anuncioDaFala, chamando ? 'Chamando a enfermagem.' : '', linhaCompleta ?? ''].filter(Boolean).join(' ');

  return (
    <GazePageLayout showBack={false} titulo="O que você precisa?" subtitulo="Escolha o botão que quiser">
      <div ref={areaDaGrade} style={{ height: '100%', width: '100%' }}>
        {/* `rolarSoSeNaoCouber`: com as linhas cabendo, a grade não recorta
            a zona de acerto da primeira linha nem o anel do dwell. */}
        <GazeGrid columns={colunas} rows={linhas} gap={ESPACO_DO_QUARTO} rolarSoSeNaoCouber>
          {CARTOES_DO_HOSPITAL.map(cartao)}
        </GazeGrid>
      </div>
      <p role="status" aria-live="assertive" style={SOMENTE_PARA_LEITOR_DE_TELA}>{anuncio}</p>
    </GazePageLayout>
  );
};
