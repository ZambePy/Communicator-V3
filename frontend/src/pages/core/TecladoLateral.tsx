import React, { useEffect, useMemo, useState } from 'react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { EscolhaLateral, type LadoDaEscolha } from '../../components/ui/EscolhaLateral';
import { useGaze } from '../../context/GazeContext';
import { falarDoPaciente } from '../../services/voz/falaDoPaciente';
import { registrarFalaDoPaciente, sugerirPalavras } from '../../services/assistente';
import { emitirFalaDoPaciente } from '../../cloud/eventos';
import { logSentence } from '../../utils/clinicalLogger';
import { marcarTelaLateral } from '../../services/telaLateral';
import {
  SIMBOLOS_DO_TECLADO_LATERAL,
  aplicarPrevisao,
  aplicarSimbolo,
  escolherLado,
  ladosDoTeclado,
  previsaoDoTeclado,
  simbolosDoLado,
  type EstadoDoTecladoLateral,
  type LadoDoTeclado,
  type SimboloLateral,
} from './divisaoDoTecladoLateral';

/** Mesma paleta do teclado ocular: fundo frio que recua, âmbar só para o que compromete. */
const COR = {
  tecla: '#151B24',
  borda: '#232C3A',
  glifo: '#EDF1F7',
  glifoRecuado: '#93A6BF',
  ambar: '#F0A030',
};
const FONTE_DAS_TECLAS = "'Segoe UI Variable Display', 'Segoe UI', 'Inter', system-ui, sans-serif";
const FONTE_DO_TEXTO = "'Cascadia Mono', 'Consolas', ui-monospace, 'Courier New', monospace";

/** "Falar" pelo teclado lateral: o mesmo dwell mais longo do "Falar" do teclado (falar por engano custa mais). */
const DWELL_DO_FALAR = { 'data-dwell-ms': '2000', 'data-dwell-mult': '1.3' } as const;

/** Rascunho na sessão da janela, como o do teclado: sair para a Emergência e voltar não apaga nada. */
const CHAVE_DO_RASCUNHO = 'irisflow.rascunhoDoTecladoLateral';

function lerRascunho(): string {
  try {
    return sessionStorage.getItem(CHAVE_DO_RASCUNHO) ?? '';
  } catch {
    return '';
  }
}

function gravarRascunho(texto: string): void {
  try {
    if (texto) sessionStorage.setItem(CHAVE_DO_RASCUNHO, texto.slice(0, 2000));
    else sessionStorage.removeItem(CHAVE_DO_RASCUNHO);
  } catch {
    // Sem armazenamento: o rascunho vale enquanto a tela está aberta.
  }
}

const rotuloDoComando = (s: SimboloLateral): string =>
  s.tipo === 'espaco' ? 'espaço' : s.tipo === 'apagar' ? 'apagar' : s.tipo === 'falar' ? 'falar' : s.valor;

function juntarComE(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** O nome do lado: o que o leitor de tela e a varredura do acionador anunciam. */
function nomeDoLado(lado: LadoDoTeclado): string {
  if (lado.tipo === 'previsao') return `Completar: ${lado.palavra}`;
  const simbolos = simbolosDoLado(lado);
  if (simbolos.length === SIMBOLOS_DO_TECLADO_LATERAL.length) return 'Letras e comandos';
  if (simbolos.length === 1) {
    const s = simbolos[0];
    return s.tipo === 'letra' ? `Escrever ${s.valor}` : s.tipo === 'espaco' ? 'Espaço' : s.tipo === 'apagar' ? 'Apagar' : 'Falar';
  }
  const letras = simbolos.filter((s): s is Extract<SimboloLateral, { tipo: 'letra' }> => s.tipo === 'letra').map((s) => s.valor);
  const partes: string[] = [];
  if (letras.length === 1) partes.push(`Letra ${letras[0]}`);
  else if (letras.length > 1) partes.push(`Letras de ${letras[0]} a ${letras[letras.length - 1]}`);
  partes.push(...simbolos.filter((s) => s.tipo !== 'letra').map(rotuloDoComando));
  const nome = juntarComE(partes);
  return nome.charAt(0).toLocaleUpperCase('pt-BR') + nome.slice(1);
}

/** O que aparece no lado, do tamanho que cabe: quanto menos símbolos, maior. */
function RotuloDoLado({ lado }: { lado: LadoDoTeclado }) {
  if (lado.tipo === 'previsao') {
    return (
      <>
        <span style={{ fontSize: 'clamp(1rem, 2.4vh, 1.4rem)', fontWeight: 700, color: COR.glifoRecuado, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          completar
        </span>
        <span style={{ fontSize: 'clamp(2.25rem, 8vh, 5rem)', fontWeight: 800, color: COR.glifo, wordBreak: 'break-word' }}>{lado.palavra}</span>
      </>
    );
  }
  const simbolos = simbolosDoLado(lado);
  if (simbolos.length === SIMBOLOS_DO_TECLADO_LATERAL.length) {
    return (
      <>
        <span style={{ fontSize: 'clamp(2rem, 6vh, 4rem)', fontWeight: 800, color: COR.glifo }}>A – Z</span>
        <span style={{ fontSize: 'clamp(1.1rem, 2.8vh, 1.6rem)', fontWeight: 700, color: COR.glifoRecuado }}>letras e comandos</span>
      </>
    );
  }
  if (simbolos.length === 1) {
    const s = simbolos[0];
    return (
      <span style={{ fontSize: s.tipo === 'letra' ? 'clamp(5rem, 22vh, 12rem)' : 'clamp(2.5rem, 9vh, 5.5rem)', fontWeight: 800, color: s.tipo === 'falar' ? COR.ambar : COR.glifo, textTransform: 'uppercase' }}>
        {rotuloDoComando(s)}
      </span>
    );
  }
  const letras = simbolos.filter((s) => s.tipo === 'letra');
  const comandos = simbolos.filter((s) => s.tipo !== 'letra');
  const tamanho = simbolos.length >= 10 ? 'clamp(1.75rem, 4.6vh, 3.25rem)' : simbolos.length >= 4 ? 'clamp(2.5rem, 7vh, 4.5rem)' : 'clamp(3rem, 10vh, 6rem)';
  return (
    <>
      {letras.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.15em 0.45em', fontSize: tamanho, fontWeight: 800, color: COR.glifo, lineHeight: 1.1 }}>
          {letras.map((s) => <span key={rotuloDoComando(s)}>{rotuloDoComando(s)}</span>)}
        </span>
      )}
      {comandos.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', fontSize: 'clamp(1.1rem, 3vh, 1.75rem)', fontWeight: 700, color: COR.ambar }}>
          {comandos.map((s) => <span key={s.tipo}>{rotuloDoComando(s)}</span>)}
        </span>
      )}
    </>
  );
}

/**
 * Teclado lateral (modo só horizontal, pedido de 21/10/2026): o alfabeto por
 * divisão binária, para quem só move os olhos para os lados. Cada olhar para
 * um lado escolhe a metade em que está a letra; sobrando uma, ela é escrita.
 * Espaço, apagar e falar estão no fim do alfabeto; com uma palavra começada,
 * a previsão aparece como um dos lados no começo de cada letra.
 *
 * O que sai é o mesmo do teclado: a frase falada pela voz do paciente (se nada
 * sair, `falarDoPaciente` a põe em letra grande na tela), no histórico e no
 * celular do cuidador. Falar limpa a linha — apagar letra por letra custaria
 * até cinco escolhas cada uma.
 */
export const TecladoLateral: React.FC = () => {
  const { setIsComposing } = useGaze();
  const [texto, setTexto] = useState(lerRascunho);
  const [estado, setEstado] = useState<EstadoDoTecladoLateral>(null);
  const [ultimaFala, setUltimaFala] = useState<string | null>(null);

  useEffect(() => {
    gravarRascunho(texto);
  }, [texto]);

  // A saída da tela de socorro volta para cá (revisão de 21/10/2026, Important 1).
  useEffect(() => {
    marcarTelaLateral('/teclado-lateral');
  }, []);

  useEffect(() => {
    setIsComposing(texto.trim().length > 0);
    return () => setIsComposing(false);
  }, [texto, setIsComposing]);

  // Só quando o texto muda (não a cada render): o assistente lê o disco.
  const previsao = useMemo(() => previsaoDoTeclado(texto, (t) => sugerirPalavras(t, 5)), [texto]);
  const { esquerda, direita } = ladosDoTeclado(estado, estado === null ? previsao : null);

  const falar = (frase: string) => {
    void falarDoPaciente(frase, { rate: 0.9 });
    registrarFalaDoPaciente(frase);
    logSentence(frase);
    // Vai para o celular do cuidador (se a conta estiver ligada).
    emitirFalaDoPaciente(frase, 'texto');
    setUltimaFala(frase);
  };

  const escolher = (lado: LadoDoTeclado) => {
    const r = escolherLado(lado);
    if (r.tipo === 'estreitar') {
      setEstado(r.estado);
      return;
    }
    setEstado(null);
    if (r.tipo === 'previsao') {
      setTexto((t) => aplicarPrevisao(t, r.palavra));
      setUltimaFala(null);
      return;
    }
    const efeito = aplicarSimbolo(texto, r.simbolo);
    setTexto(efeito.texto);
    if (efeito.falar) falar(efeito.falar);
    else if (r.simbolo.tipo === 'letra') setUltimaFala(null);
  };

  const ladoDaEscolha = (lado: LadoDoTeclado): LadoDaEscolha => {
    const simbolos = simbolosDoLado(lado);
    const unico = simbolos.length === 1 ? simbolos[0] : null;
    return {
      nome: nomeDoLado(lado),
      rotulo: <RotuloDoLado lado={lado} />,
      aoEscolher: () => escolher(lado),
      // Estreitar só mostra a próxima metade: o olhar parado pode seguir
      // estreitando, mas escrever, completar e falar pedem um olhar novo.
      soNavega: lado.tipo === 'faixa' && simbolos.length > 1,
      estilo: {
        background: COR.tecla,
        border: `3px solid ${lado.tipo === 'previsao' ? COR.ambar : COR.borda}`,
        color: COR.glifo,
        fontFamily: FONTE_DAS_TECLAS,
      },
      dados: unico?.tipo === 'falar' ? DWELL_DO_FALAR : unico?.tipo === 'apagar' ? { 'data-desfazer': 'true' } : undefined,
    };
  };

  return (
    <GazePageLayout showBack={true} backRoute="/menu" titulo="Teclado lateral" subtitulo="Olhe para o lado da letra">
      <EscolhaLateral
        esquerda={ladoDaEscolha(esquerda)}
        direita={ladoDaEscolha(direita)}
        larguraDoMeio={30}
        centro={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
            <span style={{ fontSize: 'clamp(0.95rem, 2.2vh, 1.2rem)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Seu texto
            </span>
            <p
              aria-live="polite"
              style={{ margin: 0, fontFamily: FONTE_DO_TEXTO, fontSize: 'clamp(1.6rem, 4.5vh, 3rem)', fontWeight: 700, color: 'var(--color-text-base)', wordBreak: 'break-word', lineHeight: 1.25, minHeight: '1.25em' }}
            >
              <span data-testid="texto-do-teclado-lateral">{texto}</span>
              <span aria-hidden="true" style={{ color: COR.ambar }}>▏</span>
            </p>
            <p style={{ margin: 0, fontSize: 'clamp(1rem, 2.6vh, 1.45rem)', fontWeight: 600, color: 'var(--color-text-muted)', lineHeight: 1.35 }}>
              {ultimaFala ? `Você falou: ${ultimaFala}` : 'Olhe para o lado em que está a sua letra.'}
            </p>
          </div>
        }
      />
    </GazePageLayout>
  );
};
