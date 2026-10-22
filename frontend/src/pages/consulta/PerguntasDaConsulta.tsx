import React, { useMemo, useState } from 'react';
import { GazeButton } from '../../components/ui/GazeButton';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { getClinicalData, perfilAtivoDoHistorico } from '../../utils/clinicalLogger';
import { mensagemDoRegistro, type ResultadoDaConsulta } from '../../services/consulta/mensagens';
import {
  MAX_PERGUNTAS, MAX_TEXTO_DA_PERGUNTA, adicionarPergunta, lerPerguntas, marcarComoFeita, perguntasDasFrases, removerPergunta,
  type PerguntaDaConsulta, type QuemPergunta,
} from '../../services/consulta/perguntas';

/**
 * Perguntas para levar ao médico (21/10/2026).
 *
 * Quem passa meses sem conseguir falar esquece, na hora da consulta, o que
 * queria perguntar. A lista tem duas origens:
 *  - o paciente escreve pelo teclado do olhar, e as frases dele que terminam em
 *    "?" aparecem aqui como alvos grandes: um toque as leva à lista, sem
 *    reescrever letra a letra (minutos de trabalho para ele);
 *  - o cuidador digita as dele, com teclado e mouse.
 * Cada pergunta diz de quem é. O que não foi gravado é dito na hora.
 */

/** Quantas sugestões do teclado aparecem de uma vez: com a lista e o campo, o paciente tem no máximo seis alvos. */
const SUGESTOES_POR_VEZ = 4;

type Aviso = { tipo: 'ok' | 'erro'; texto: string } | null;

const QUEM: Record<QuemPergunta, string> = { paciente: 'do paciente', cuidador: 'do cuidador' };

const alvo: React.CSSProperties = { width: '100%', height: '100%', borderRadius: 'var(--radius-xl, 2rem)' };
const titulo: React.CSSProperties = { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text-base)' };

export const PerguntasDaConsulta: React.FC = () => {
  const paciente = perfilAtivoDoHistorico();
  // A lista vive no armazenamento; a tela guarda a última leitura e lê de novo
  // depois de cada mudança.
  const [todas, setTodas] = useState<PerguntaDaConsulta[]>(() => (paciente ? lerPerguntas(paciente) : []));
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const pendentes = todas.filter((p) => !p.feita);
  const feitas = todas.filter((p) => p.feita);
  const sugeridas = useMemo(
    () => perguntasDasFrases(getClinicalData().sentences, todas, Date.now()),
    // As frases só mudam enquanto o paciente escreve, em outra tela; ao voltar, a tela é montada de novo.
    [todas],
  );

  const depoisDeGravar = (resultado: ResultadoDaConsulta): boolean => {
    const falha = mensagemDoRegistro(resultado);
    if (falha) {
      setAviso({ tipo: 'erro', texto: falha });
      return false;
    }
    setAviso(null);
    setTodas(paciente ? lerPerguntas(paciente) : []);
    return true;
  };

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    if (depoisDeGravar(adicionarPergunta(texto, 'cuidador'))) setTexto('');
  };

  const levar = (frase: string) => {
    depoisDeGravar(adicionarPergunta(frase, 'paciente'));
  };

  const mostradas = sugeridas.slice(0, SUGESTOES_POR_VEZ);
  const aindaHa = sugeridas.length - mostradas.length;

  const item = (p: PerguntaDaConsulta) => (
    <li key={p.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 0.75rem', padding: '0.7rem 0.9rem', borderRadius: '0.85rem', border: '1px solid var(--color-card-border)', background: 'var(--color-bg-base)' }}>
      <span style={{ flex: '1 1 16rem', minWidth: 0, overflowWrap: 'anywhere', color: 'var(--color-text-base)', lineHeight: 1.45 }}>{p.texto}</span>
      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{QUEM[p.quem]}</span>
      {p.feita ? (
        <PrimaryButton type="button" variant="secondary" data-no-dwell="true" onClick={() => depoisDeGravar(marcarComoFeita(p.id, false))}>Voltar para a lista</PrimaryButton>
      ) : (
        <PrimaryButton type="button" variant="secondary" data-no-dwell="true" onClick={() => depoisDeGravar(marcarComoFeita(p.id, true))}>Já perguntei</PrimaryButton>
      )}
      {/* Apaga sem desfazer: só por mouse ou teclado. Uma fixação acidental não pode tirar uma pergunta que custou minutos de escrita. */}
      <PrimaryButton type="button" variant="ghost" data-no-dwell="true" onClick={() => depoisDeGravar(removerPergunta(p.id))}>Tirar da lista</PrimaryButton>
    </li>
  );

  return (
    <section aria-labelledby="perguntas-title" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <h2 id="perguntas-title" style={{ margin: 0, fontSize: 'clamp(1.3rem, 2.8vh, 1.9rem)', fontWeight: 800, color: 'var(--color-text-base)' }}>
        Perguntas para o médico
      </h2>

      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'} style={{ margin: 0, fontWeight: 700, lineHeight: 1.5, color: aviso.tipo === 'erro' ? 'var(--tint-danger-text)' : 'var(--tint-ok-text)' }}>
          {aviso.texto}
        </p>
      )}

      {mostradas.length > 0 && (
        <section aria-label="Perguntas escritas no teclado" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <h3 style={titulo}>Escritas no teclado do olhar</h3>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>Olhe para uma pergunta para levá-la à consulta.</p>
          <GazeGrid columns={2} rows={Math.ceil(mostradas.length / 2)}>
            {mostradas.map((frase) => (
              <GazeButton key={frase} onClick={() => levar(frase)} style={alvo}>
                <span style={{ padding: '0.5rem', fontSize: 'clamp(1.05rem, 2.1vh, 1.4rem)', fontWeight: 800, textAlign: 'center', lineHeight: 1.2, overflowWrap: 'anywhere' }}>{frase}</span>
              </GazeButton>
            ))}
          </GazeGrid>
          {aindaHa > 0 && (
            <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Há mais {aindaHa} {aindaHa === 1 ? 'pergunta escrita' : 'perguntas escritas'} no teclado. Leve estas para ver {aindaHa === 1 ? 'a outra' : 'as outras'}.
            </p>
          )}
        </section>
      )}

      <section aria-label="Lista de perguntas" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        <h3 style={titulo}>
          Na lista ({todas.length} de {MAX_PERGUNTAS})
        </h3>
        {pendentes.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-text-base)', opacity: 0.85, lineHeight: 1.5 }}>Nenhuma pergunta na lista ainda. Escreva abaixo a primeira.</p>
        ) : (
          <ul aria-label="Perguntas para levar à consulta" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {pendentes.map(item)}
          </ul>
        )}
        {feitas.length > 0 && (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-text-base)' }}>Já feitas ({feitas.length})</summary>
            <ul aria-label="Perguntas já feitas" style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {feitas.map(item)}
            </ul>
          </details>
        )}
      </section>

      <form onSubmit={adicionar} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label htmlFor="nova-pergunta" style={{ fontWeight: 700, color: 'var(--color-text-base)' }}>Nova pergunta (para quem cuida escrever)</label>
        <input
          id="nova-pergunta"
          type="text"
          value={texto}
          maxLength={MAX_TEXTO_DA_PERGUNTA}
          onChange={(e) => setTexto(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid var(--color-card-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-base)', font: 'inherit' }}
        />
        <div><PrimaryButton type="submit" data-no-dwell="true" disabled={texto.trim() === ''}>Adicionar pergunta</PrimaryButton></div>
      </form>
    </section>
  );
};
