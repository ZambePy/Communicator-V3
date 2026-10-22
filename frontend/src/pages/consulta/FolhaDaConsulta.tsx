import React, { useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { FileDown, Printer } from 'lucide-react';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { getClinicalData, perfilAtivoDoHistorico } from '../../utils/clinicalLogger';
import { agregarPorSemana } from '../../services/evolucao/agregar';
import { lerUso } from '../../services/evolucao/registroDeUso';
import { lerDiario } from '../../services/consulta/diario';
import { montarFolha, type PeriodoDaFolha } from '../../services/consulta/folha';
import { lerPerguntas } from '../../services/consulta/perguntas';
import { imprimirConsulta, ponteDaConsulta, salvarConsultaEmPdf } from '../settings/prancha/imprimir';
import { VistaDaFolha } from './VistaDaFolha';

/**
 * A folha da consulta (21/10/2026): uma página A4 em pé com os últimos 7 ou 30
 * dias, para a pessoa levar ao médico. Imprime pelo mesmo caminho da prancha de
 * letras: no app instalado, o processo principal gera o PDF e imprime, e a
 * página continua viva enquanto o cuidador escolhe a impressora; fora dele, o
 * diálogo do navegador.
 *
 * Os botões são do cuidador (`data-no-dwell`): uma janela de impressão aberta
 * por engano ficaria na frente de quem só tem o olhar, até alguém chegar para
 * fechá-la.
 */
export const FolhaDaConsulta: React.FC = () => {
  const { currentProfile } = useAuth();
  const [periodo, setPeriodo] = useState<PeriodoDaFolha>(7);
  const ponte = ponteDaConsulta();
  const [emCurso, setEmCurso] = useState<null | 'imprimir' | 'pdf'>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const nome = currentProfile?.name;
  const folha = useMemo(() => {
    const agora = Date.now();
    const paciente = perfilAtivoDoHistorico();
    const dados = getClinicalData();
    return montarFolha({
      periodo,
      agora,
      paciente: nome ?? '',
      dores: dados.dores,
      diario: paciente ? lerDiario(paciente) : [],
      evolucao: agregarPorSemana({ calibracoes: dados.calibrations, uso: paciente ? lerUso(paciente) : [], agora }),
      perguntas: paciente ? lerPerguntas(paciente) : [],
    });
  }, [periodo, nome]);

  const imprimir = async () => {
    if (emCurso) return;
    setMensagem(null);
    // A cópia de impressão entra na página ANTES de abrir o diálogo.
    flushSync(() => setEmCurso('imprimir'));
    try {
      const r = await imprimirConsulta();
      // `null`: o navegador imprimiu por conta própria e não diz o resultado.
      if (r?.ok) setMensagem({ tipo: 'ok', texto: r.impressora ? `Folha enviada para a impressora ${r.impressora}.` : 'Folha enviada para a impressora padrão.' });
      else if (r && !r.cancelado) setMensagem({ tipo: 'erro', texto: r.erro ?? 'Não foi possível imprimir agora.' });
    } finally {
      setEmCurso(null);
    }
  };

  const salvarPdf = async () => {
    if (emCurso || !ponte) return;
    setMensagem(null);
    flushSync(() => setEmCurso('pdf'));
    try {
      const r = await salvarConsultaEmPdf(ponte);
      if (r.ok) setMensagem({ tipo: 'ok', texto: `Folha salva em ${r.caminho}` });
      else if (!r.cancelado) setMensagem({ tipo: 'erro', texto: r.erro ?? 'Não foi possível salvar o PDF agora.' });
    } finally {
      setEmCurso(null);
    }
  };

  return (
    <section aria-labelledby="folha-title" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 id="folha-title" style={{ margin: 0, fontSize: 'clamp(1.3rem, 2.8vh, 1.9rem)', fontWeight: 800, color: 'var(--color-text-base)' }}>
        Folha para levar ao médico
      </h2>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="consulta-previa">
          <VistaDaFolha folha={folha} />
        </div>
        <div style={{ flex: '1 1 14rem', display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
            Uma página A4 em pé, com o dia a dia de dor, sono e humor, a evolução por semana e as perguntas que ainda não foram feitas.
            Em preto e branco ela se lê igual.
          </p>
          <div role="group" aria-label="Período da folha" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {([7, 30] as const).map((p) => (
              <PrimaryButton key={p} type="button" variant={periodo === p ? 'primary' : 'secondary'} aria-pressed={periodo === p} data-no-dwell="true" onClick={() => setPeriodo(p)}>
                {p} dias
              </PrimaryButton>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <PrimaryButton type="button" data-no-dwell="true" onClick={() => void imprimir()} disabled={emCurso !== null}>
              <Printer size={20} aria-hidden="true" /> {emCurso === 'imprimir' ? 'Abrindo a impressão…' : 'Imprimir folha'}
            </PrimaryButton>
            {ponte && (
              <PrimaryButton type="button" variant="secondary" data-no-dwell="true" onClick={() => void salvarPdf()} disabled={emCurso !== null}>
                <FileDown size={20} aria-hidden="true" /> {emCurso === 'pdf' ? 'Gerando o PDF…' : 'Salvar em PDF'}
              </PrimaryButton>
            )}
          </div>
          {mensagem && (
            <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} style={{ margin: 0, fontWeight: 700, color: mensagem.tipo === 'erro' ? 'var(--tint-danger-text)' : 'var(--tint-ok-text)', overflowWrap: 'anywhere' }}>
              {mensagem.texto}
            </p>
          )}
        </div>
      </div>
      {emCurso !== null &&
        createPortal(
          <div className="consulta-impressao" data-testid="consulta-impressao">
            <VistaDaFolha folha={folha} />
          </div>,
          document.body,
        )}
    </section>
  );
};
