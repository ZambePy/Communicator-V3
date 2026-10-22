import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Info, TrendingUp } from 'lucide-react';
import { BackButton } from '../../components/ui/BackButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useSettings } from '../../context/SettingsContext';
import { getClinicalData, hasConsent, perfilAtivoDoHistorico } from '../../utils/clinicalLogger';
import { agregarPorSemana, type SemanaDeEvolucao } from '../../services/evolucao/agregar';
import { baixarCsv, nomeDoArquivoCsv } from '../../services/evolucao/csv';
import { emGraus, emMinutos, emSegundosCurtos, numeroBr, periodoDaSemana } from '../../services/evolucao/formatar';
import { lerUso } from '../../services/evolucao/registroDeUso';
import { AVISO_NAO_E_DIAGNOSTICO, sugerir } from '../../services/evolucao/sugestoes';
import {
  PALAVRA_DA_DIRECAO, SETA_DA_DIRECAO, leituraDaTendencia, type Metrica,
} from '../../services/evolucao/tendencia';

/**
 * Configurações → Evolução semanal (21/10/2026).
 *
 * Para o cuidador e para a consulta: o erro da calibração, o tempo de fixação,
 * a velocidade de escrita, o tempo de uso, os avisos de cansaço e as vezes em
 * que foi preciso desfazer — semana a semana, com a seta do que mudou desde a
 * semana anterior.
 *
 * Três regras que não cedem:
 *  - é DADO DE ACOMPANHAMENTO, não diagnóstico: a frase está no alto e em cada
 *    sugestão;
 *  - esta tela NUNCA muda um ajuste. Mostra, sugere e leva à tela onde o
 *    cuidador decide; nem o botão de ir até lá grava nada;
 *  - a seta traz a palavra ("subiu", "caiu"): a cor só ajuda.
 */

const COLUNAS: { metrica: Metrica; titulo: string }[] = [
  { metrica: 'erro', titulo: 'Erro da calibração' },
  { metrica: 'dwell', titulo: 'Tempo de fixação' },
  { metrica: 'cpm', titulo: 'Caracteres por minuto' },
  { metrica: 'minutos', titulo: 'Minutos úteis' },
  { metrica: 'fadiga', titulo: 'Avisos de fadiga' },
  { metrica: 'desfazer', titulo: 'Vezes em que desfez' },
];

const TRAVESSAO = '–';

/** O texto de cada célula; semana sem registro de uso mostra travessão, nunca um zero que pareça medido. */
function valorDaCelula(metrica: Metrica, s: SemanaDeEvolucao): string {
  switch (metrica) {
    case 'erro':
      return emGraus(s.erroMedioDeg);
    case 'dwell':
      return s.usoRegistrado ? emSegundosCurtos(s.dwellMedioMs) : TRAVESSAO;
    case 'cpm':
      return s.caracteresPorMinuto === null ? TRAVESSAO : numeroBr(s.caracteresPorMinuto, 1);
    case 'minutos':
      return s.usoRegistrado ? emMinutos(s.minutosUteis) : TRAVESSAO;
    case 'fadiga':
      return s.usoRegistrado ? String(s.avisosDeFadiga) : TRAVESSAO;
    case 'desfazer':
      return s.usoRegistrado ? String(s.desfazer) : TRAVESSAO;
  }
}

const COR_DA_LEITURA = {
  favoravel: 'var(--tint-ok-text)',
  desfavoravel: 'var(--tint-warn-text)',
  neutra: 'var(--color-text-muted)',
} as const;

const Seta: React.FC<{ metrica: Metrica; semana: SemanaDeEvolucao }> = ({ metrica, semana }) => {
  const { direcao } = semana.tendencias[metrica];
  // Sem comparação não há o que dizer: a célula fica só com o número.
  if (direcao === 'sem-dados') return null;
  return (
    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: COR_DA_LEITURA[leituraDaTendencia(metrica, direcao)] }}>
      <span aria-hidden="true">{SETA_DA_DIRECAO[direcao]}</span> {PALAVRA_DA_DIRECAO[direcao]}
    </span>
  );
};

const celula: React.CSSProperties = { padding: '0.6rem 0.75rem', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' };
const cabecalho: React.CSSProperties = { ...celula, fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'normal' };

export const EvolucaoScreen: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [incluirHerdadas, setIncluirHerdadas] = useState(false);
  const [csv, setCsv] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const autorizado = hasConsent();
  const evolucao = useMemo(() => {
    const paciente = perfilAtivoDoHistorico();
    return agregarPorSemana({
      calibracoes: getClinicalData().calibrations,
      uso: paciente ? lerUso(paciente) : [],
      agora: Date.now(),
      incluirHerdadas,
    });
    // Lê o armazenamento a cada abertura da tela e a cada mudança de escolha.
  }, [incluirHerdadas]);
  const sugestoes = useMemo(() => sugerir(evolucao, { dwellMs: settings.dwellMs }), [evolucao, settings.dwellMs]);

  const herdadas = evolucao.herdadasDeFora + evolucao.herdadasIncluidas;
  const semanas = [...evolucao.semanas].reverse();
  const faltaUso = semanas.some((s) => !s.usoRegistrado);

  const exportar = () => {
    try {
      const agora = Date.now();
      baixarCsv(evolucao, agora);
      setCsv({ tipo: 'ok', texto: `Arquivo ${nomeDoArquivoCsv(agora)} gerado. Procure na pasta de downloads; abre no Excel.` });
    } catch (e) {
      console.warn('[evolucao] não foi possível gerar o CSV', e);
      setCsv({ tipo: 'erro', texto: 'Não foi possível gerar o arquivo agora. Tente de novo em instantes.' });
    }
  };

  return (
    <main
      role="main"
      aria-labelledby="evolucao-title"
      style={{ minHeight: '100vh', background: 'var(--settings-bg)', display: 'flex', justifyContent: 'center', padding: '2rem 1.5rem', overflowY: 'auto' }}
    >
      <div
        className="glass-card coluna-livre-da-emergencia"
        style={{
          '--coluna-largura': '1040px',
          width: '100%',
          maxWidth: 1040,
          height: 'fit-content',
          background: 'var(--color-card-bg)',
          border: '1px solid var(--color-card-border)',
          borderRadius: '1.5rem',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        } as React.CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <BackButton to="/settings" />
          <h1 id="evolucao-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-base)' }}>
            <TrendingUp size={22} color="var(--color-primary)" aria-hidden="true" />
            Evolução semanal
          </h1>
        </div>

        <div
          role="note"
          style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', padding: '0.8rem 1rem', borderRadius: '0.9rem', background: 'var(--tint-info-bg)', border: '1px solid var(--tint-info-border)', color: 'var(--tint-info-text)', lineHeight: 1.5 }}
        >
          <Info size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
          <span>{AVISO_NAO_E_DIAGNOSTICO}</span>
        </div>

        {!autorizado && (
          <p role="status" style={{ margin: 0, padding: '0.8rem 1rem', borderRadius: '0.9rem', background: 'var(--tint-warn-bg)', border: '1px solid var(--tint-warn-border)', color: 'var(--tint-warn-text)', lineHeight: 1.5 }}>
            O histórico clínico está desligado neste computador, então nada novo está sendo guardado. Quem cuida pode ligá-lo em Configurações.
          </p>
        )}

        {!evolucao.temDados ? (
          <p style={{ margin: 0, color: 'var(--color-text-base)', opacity: 0.85, lineHeight: 1.55 }}>
            Ainda não há medições nem uso registrado. Os números aparecem depois da primeira calibração e de alguns dias de uso.
          </p>
        ) : (
          <>
            {/* Rolagem horizontal em janela estreita: o Chromium recente já deixa a área rolável alcançável pelo teclado. */}
            <div role="region" aria-label="Tabela da evolução por semana" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--color-text-base)', fontSize: '0.98rem' }}>
                <caption style={{ textAlign: 'left', padding: '0 0 0.6rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  Da semana mais recente para a mais antiga. As setas comparam com a semana completa anterior.
                </caption>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-card-border)' }}>
                    <th scope="col" style={{ ...cabecalho, textAlign: 'left' }}>Semana</th>
                    {COLUNAS.map((c) => (
                      <th key={c.metrica} scope="col" style={cabecalho}>{c.titulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {semanas.map((s) => (
                    <tr key={s.inicio} style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                      <th scope="row" style={{ ...celula, textAlign: 'left', fontWeight: 700 }}>
                        {periodoDaSemana(s)}
                        {!s.completa && <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>em andamento</span>}
                      </th>
                      {COLUNAS.map((c) => (
                        <td key={c.metrica} style={celula}>
                          <span style={{ fontWeight: 700 }}>{valorDaCelula(c.metrica, s)}</span>
                          <Seta metrica={c.metrica} semana={s} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
              A cor só ajuda; as palavras dizem o que mudou. Menos erro, menos avisos de fadiga e menos desfazer costumam ser bons sinais, e mais caracteres por minuto também. Tempo de fixação e minutos úteis não têm lado melhor: o tempo de fixação é uma escolha de quem cuida.
              {faltaUso && ' Minutos úteis, velocidade, avisos de fadiga e desfazer só aparecem a partir de quando o registro de uso foi ligado; antes disso o app não guardava esses números.'}
            </p>

            {herdadas > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-start' }}>
                <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--color-text-base)' }}>
                  Há {herdadas} {herdadas === 1 ? 'medição anterior' : 'medições anteriores'} à separação por paciente. {herdadas === 1 ? 'Pode ser' : 'Podem ser'} de outra pessoa que usou este computador, por isso {incluirHerdadas ? 'estão sendo contadas a seu pedido' : 'ficam fora da curva'}.
                </p>
                <PrimaryButton type="button" variant="secondary" aria-pressed={incluirHerdadas} onClick={() => setIncluirHerdadas((v) => !v)}>
                  {incluirHerdadas ? `Parar de contar as ${herdadas} ${herdadas === 1 ? 'medição' : 'medições'}` : `Contar as ${herdadas} ${herdadas === 1 ? 'medição' : 'medições'}`}
                </PrimaryButton>
              </div>
            )}

            <section aria-labelledby="sugestoes-title" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h2 id="sugestoes-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text-base)' }}>
                Para conversar com a equipe
              </h2>
              {sugestoes.map((s) => (
                <article key={s.id} style={{ padding: '1rem 1.1rem', borderRadius: '1rem', border: '1px solid var(--color-card-border)', background: 'var(--color-bg-base)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-base)' }}>{s.titulo}</h3>
                  <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--color-text-base)' }}>{s.observacao}</p>
                  <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--color-text-base)' }}>{s.sugestao}</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.45, color: 'var(--color-text-muted)' }}>{s.aviso}</p>
                  {s.ir && (
                    <div>
                      <PrimaryButton type="button" variant="secondary" onClick={() => navigate(s.ir!.rota)}>
                        {s.ir.rotulo}
                      </PrimaryButton>
                    </div>
                  )}
                </article>
              ))}
            </section>
          </>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {evolucao.temDados && (
            <PrimaryButton type="button" onClick={exportar}>
              <Download size={18} aria-hidden="true" /> Exportar CSV
            </PrimaryButton>
          )}
          <PrimaryButton type="button" variant="secondary" onClick={() => navigate('/consulta')}>
            <FileText size={18} aria-hidden="true" /> Abrir a folha da consulta
          </PrimaryButton>
        </div>
        {csv && (
          <p role={csv.tipo === 'erro' ? 'alert' : 'status'} style={{ margin: 0, fontWeight: 700, color: csv.tipo === 'erro' ? 'var(--tint-danger-text)' : 'var(--tint-ok-text)', overflowWrap: 'anywhere' }}>
            {csv.texto}
          </p>
        )}
      </div>
    </main>
  );
};
