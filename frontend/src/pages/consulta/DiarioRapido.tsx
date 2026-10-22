import React, { useMemo, useState } from 'react';
import { GazeButton } from '../../components/ui/GazeButton';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { diaDeBrasilia } from '../../services/evolucao/fuso';
import { getRegistrosDeDor, perfilAtivoDoHistorico } from '../../utils/clinicalLogger';
import {
  MAX_NOTA, ROTULOS_DO_HUMOR, ROTULOS_DO_SONO, dorPorDia, entradaDoDia, salvarNoDiario, type EntradaDoDiario,
} from '../../services/consulta/diario';
import { mensagemDoRegistro } from '../../services/consulta/mensagens';
import { RostoDeHumor } from './RostoDeHumor';

/**
 * Diário rápido (21/10/2026): o sono e o humor do dia em DOIS toques de olhar,
 * sem digitar. A dor não se digita aqui — vem do mapa da dor, que já guarda
 * lugar e nível. A nota é de quem cuida (mouse e teclado): escrever uma frase
 * letra a letra pelo olhar tem o seu lugar no teclado, e não numa tela de
 * registro.
 *
 * Cada passo tem no máximo seis alvos (cinco opções e "Pular"), todos
 * GazeButton em grade de alvo mínimo de 5°. O que não foi gravado é dito na
 * hora, no mesmo passo — nunca se avança como se tivesse dado certo.
 */

type Passo = 'sono' | 'humor' | 'resumo';
type Aviso = { tipo: 'ok' | 'erro'; texto: string } | null;

const hojeEmBrasilia = (): string => diaDeBrasilia(Date.now()) ?? '';

function lerHoje(): EntradaDoDiario {
  const paciente = perfilAtivoDoHistorico();
  const dia = hojeEmBrasilia();
  return paciente ? entradaDoDia(paciente, dia) : { dia, sono: null, humor: null, nota: '' };
}

const passoInicial = (e: EntradaDoDiario): Passo => (e.sono === null ? 'sono' : e.humor === null ? 'humor' : 'resumo');

const alvo: React.CSSProperties = { width: '100%', height: '100%', borderRadius: 'var(--radius-xl, 2rem)' };
const pilha: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem' };
const palavra: React.CSSProperties = { fontSize: 'clamp(1.1rem, 2.2vh, 1.5rem)', fontWeight: 800, textAlign: 'center', lineHeight: 1.15 };

export const DiarioRapido: React.FC = () => {
  // O diário vive no armazenamento; a tela guarda a última leitura de hoje e lê de novo depois de cada mudança.
  const [entrada, setEntrada] = useState<EntradaDoDiario>(lerHoje);
  const [passo, setPasso] = useState<Passo>(() => passoInicial(entrada));
  // Veio do resumo por "Mudar o ...": ao escolher, volta ao resumo em vez de seguir para o próximo passo.
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [nota, setNota] = useState(entrada.nota);

  // A dor de hoje, lida do mapa da dor (relatos de verdade, não digitados aqui).
  const dorDeHoje = useMemo(() => dorPorDia(getRegistrosDeDor()).get(hojeEmBrasilia()) ?? null, []);

  const escolher = (campo: 'sono' | 'humor', valor: number) => {
    const falha = mensagemDoRegistro(salvarNoDiario({ [campo]: valor }));
    if (falha) {
      setAviso({ tipo: 'erro', texto: falha });
      return;
    }
    setAviso(null);
    setEntrada(lerHoje());
    setPasso(editando ? 'resumo' : campo === 'sono' ? 'humor' : 'resumo');
    setEditando(false);
  };

  const pular = () => {
    setAviso(null);
    setPasso(passo === 'sono' ? 'humor' : 'resumo');
  };

  const mudar = (qual: 'sono' | 'humor') => {
    setAviso(null);
    setEditando(true);
    setPasso(qual);
  };

  const salvarNota = () => {
    const falha = mensagemDoRegistro(salvarNoDiario({ nota }));
    if (falha) {
      setAviso({ tipo: 'erro', texto: falha });
      return;
    }
    setEntrada(lerHoje());
    setAviso({ tipo: 'ok', texto: 'Nota guardada.' });
  };

  const mensagem = aviso && (
    <p role={aviso.tipo === 'erro' ? 'alert' : 'status'} style={{ margin: 0, fontWeight: 700, lineHeight: 1.5, color: aviso.tipo === 'erro' ? 'var(--tint-danger-text)' : 'var(--tint-ok-text)' }}>
      {aviso.texto}
    </p>
  );

  if (passo === 'sono' || passo === 'humor') {
    const ehSono = passo === 'sono';
    const atual = ehSono ? entrada.sono : entrada.humor;
    const rotulos = ehSono ? ROTULOS_DO_SONO : ROTULOS_DO_HUMOR;
    return (
      <section aria-labelledby="diario-passo" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 id="diario-passo" style={{ margin: 0, fontSize: 'clamp(1.3rem, 2.8vh, 1.9rem)', fontWeight: 800, color: 'var(--color-text-base)' }}>
          {ehSono ? 'Como foi o sono esta noite?' : 'Como você está hoje?'}
        </h2>
        {mensagem}
        <GazeGrid columns={3} rows={2}>
          {rotulos.map((rotulo, i) => {
            const valor = i + 1;
            return (
              <GazeButton
                key={rotulo}
                aria-label={`${rotulo} (${valor})`}
                aria-pressed={atual === valor}
                variante={atual === valor ? 'primaria' : 'secundaria'}
                onClick={() => escolher(passo, valor)}
                style={alvo}
              >
                <span style={pilha}>
                  {ehSono ? (
                    <span aria-hidden="true" style={{ fontSize: 'clamp(2rem, 6vh, 3.6rem)', fontWeight: 900, lineHeight: 1 }}>{valor}</span>
                  ) : (
                    <RostoDeHumor nivel={valor as 1 | 2 | 3 | 4 | 5} />
                  )}
                  <span style={palavra}>{rotulo}</span>
                </span>
              </GazeButton>
            );
          })}
          <GazeButton aria-label="Pular" onClick={pular} style={alvo}>
            <span style={pilha}><span style={palavra}>Pular</span></span>
          </GazeButton>
        </GazeGrid>
      </section>
    );
  }

  const palavraDe = (rotulos: readonly string[], valor: number | null) => (valor === null ? 'não marcado' : `${rotulos[valor - 1]} (${valor})`);
  return (
    <section aria-labelledby="diario-resumo" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 id="diario-resumo" style={{ margin: 0, fontSize: 'clamp(1.3rem, 2.8vh, 1.9rem)', fontWeight: 800, color: 'var(--color-text-base)' }}>
        Resumo de hoje
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '1.15rem', color: 'var(--color-text-base)' }}>
        <span>Sono: {palavraDe(ROTULOS_DO_SONO, entrada.sono)}</span>
        <span>Humor: {palavraDe(ROTULOS_DO_HUMOR, entrada.humor)}</span>
        <span>
          Dor: {dorDeHoje ? `${dorDeHoje.nivelMaximo} de 10${dorDeHoje.lugares.length ? ` · ${dorDeHoje.lugares.join(', ')}` : ''}` : 'nenhum relato no mapa da dor hoje'}
        </span>
      </div>
      <GazeGrid columns={2} rows={1}>
        <GazeButton onClick={() => mudar('sono')} style={alvo}>
          <span style={pilha}><span style={palavra}>Mudar o sono</span></span>
        </GazeButton>
        <GazeButton onClick={() => mudar('humor')} style={alvo}>
          <span style={pilha}><span style={palavra}>Mudar o humor</span></span>
        </GazeButton>
      </GazeGrid>
      <label htmlFor="diario-nota" style={{ fontWeight: 700, color: 'var(--color-text-base)' }}>Nota do dia (para quem cuida escrever)</label>
      <textarea
        id="diario-nota"
        value={nota}
        maxLength={MAX_NOTA}
        rows={3}
        onChange={(e) => setNota(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid var(--color-card-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-base)', font: 'inherit', resize: 'vertical' }}
      />
      <div><PrimaryButton type="button" data-no-dwell="true" onClick={salvarNota}>Salvar nota</PrimaryButton></div>
      {mensagem}
    </section>
  );
};
