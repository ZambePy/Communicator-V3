import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Plus, RotateCcw, Sparkles, Trash2, Type } from 'lucide-react';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import {
  MAX_SIGLA,
  MAX_SIGNIFICADO,
  SEMENTES,
  listarAbreviacoesDoPaciente,
  removerAbreviacao,
  restaurarSementes,
  salvarAbreviacao,
  sementesAlteradasDoPaciente,
  type ItemDaLista,
  type OrigemDaAbreviacao,
} from '../../services/abreviacoes';
import { AMOSTRA_MINIMA, TAXA_MINIMA, estaRecolhida, lerAceitacao, zerarAceitacao } from '../../services/assistente/aceitacao';
import { ouvirMudancaDoAprendizado } from '../../services/assistente/chavesPorPaciente';

/**
 * ABREVIAÇÕES E RESPOSTAS SUGERIDAS — o que o cuidador ajusta do assistente de
 * escrita (roadmap 1 e 2, rodada 3, 21/10/2026).
 *
 * Duas coisas moram aqui porque as duas são "o que o aparelho oferece sem o
 * paciente pedir": as abreviações que viram um chip no teclado ("obg" →
 * "obrigado") e a faixa de respostas sugeridas da Conversa. Nenhuma das duas
 * fala ou troca texto sozinha; aqui a pessoa vê o que há, muda, e vê se as
 * sugestões estão servindo.
 *
 * Tela do cuidador — mouse e teclado. Por isso todo botão que muda dados leva
 * `data-no-dwell`: o cursor de olhar também passa pelos ajustes, e olhar para
 * "Apagar" por acaso não pode apagar nada.
 */

const ROTULO_DA_ORIGEM: Record<OrigemDaAbreviacao, string> = {
  semente: 'de fábrica',
  minha: 'feita por você',
  aprendida: 'aprendida',
};

const FABRICA = Object.keys(SEMENTES).length;

/** Os botões desta tela: comuns, e fora do olhar. */
const SEM_OLHAR = { 'data-no-dwell': 'true' } as const;

const etiqueta: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  padding: '0.15rem 0.6rem',
  border: '1px solid var(--color-card-border)',
  borderRadius: '999px',
  whiteSpace: 'nowrap',
};

const porcentagem = (taxa: number): string => `${Math.round(taxa * 100)}%`;

export const AbreviacoesSection: React.FC<{ cardStyle?: React.CSSProperties }> = ({ cardStyle }) => {
  const [itens, setItens] = useState<ItemDaLista[]>(() => listarAbreviacoesDoPaciente());
  const [alteradas, setAlteradas] = useState(() => sementesAlteradasDoPaciente());
  const [aceitacao, setAceitacao] = useState(() => lerAceitacao());

  const [sigla, setSigla] = useState('');
  const [significado, setSignificado] = useState('');
  /** A sigla que está sendo editada; `null` quando o formulário acrescenta uma nova. */
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const significadoRef = useRef<HTMLInputElement>(null);

  const recarregar = useCallback(() => {
    setItens(listarAbreviacoesDoPaciente());
    setAlteradas(sementesAlteradasDoPaciente());
    setAceitacao(lerAceitacao());
  }, []);

  // "Apagar o aprendizado" (outra seção desta tela) esvazia as aprendidas e a
  // contagem: a lista que está na tela deixou de ser verdade.
  useEffect(() => ouvirMudancaDoAprendizado(recarregar), [recarregar]);

  // Ao começar a editar, o cursor vai para o que muda — o significado.
  useEffect(() => {
    if (editando) significadoRef.current?.focus();
  }, [editando]);

  const limparFormulario = () => {
    setSigla('');
    setSignificado('');
    setEditando(null);
  };

  const guardar = (e?: React.FormEvent) => {
    e?.preventDefault();
    const r = salvarAbreviacao(sigla, significado);
    if (!r.ok) {
      setErro(r.motivo);
      setAviso(null);
      return;
    }
    setErro(null);
    setAviso(
      editando
        ? `Alterada: “${r.sigla}” agora quer dizer “${r.significado}”.`
        : `Guardada: “${r.sigla}” quer dizer “${r.significado}”.`,
    );
    limparFormulario();
    recarregar();
  };

  const comecarEdicao = (item: ItemDaLista) => {
    setEditando(item.sigla);
    setSigla(item.sigla);
    setSignificado(item.significado);
    setErro(null);
    setAviso(null);
  };

  const cancelar = () => {
    limparFormulario();
    setErro(null);
  };

  const apagar = (item: ItemDaLista) => {
    const r = removerAbreviacao(item.sigla);
    if (!r.ok) {
      setErro(r.motivo);
      setAviso(null);
      return;
    }
    if (editando === item.sigla) limparFormulario();
    setErro(null);
    setAviso(`Apagada: “${item.sigla}”.`);
    recarregar();
  };

  const restaurar = () => {
    const r = restaurarSementes();
    if (!r.ok) {
      setErro(r.motivo);
      setAviso(null);
      return;
    }
    setErro(null);
    setAviso('As abreviações de fábrica voltaram ao que eram. As que você fez continuam.');
    recarregar();
  };

  const zerar = () => {
    // `zerarAceitacao` avisa quem ouve; `recarregar` cobre o caso de ninguém ouvir.
    zerarAceitacao();
    recarregar();
  };

  const recolhida = estaRecolhida(aceitacao);
  const nadaContado = aceitacao.mostradas === 0;

  return (
    <section aria-labelledby="abreviacoes-title" style={cardStyle} data-testid="secao-abreviacoes">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <Type size={28} color="var(--color-primary)" aria-hidden="true" />
        <h2 id="abreviacoes-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
          Abreviações
        </h2>
      </div>
      <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: '0 0 1.25rem 0', maxWidth: '64ch' }}>
        Escrever “obg” custa três letras; “obrigado”, oito. Quando o paciente escreve uma destas
        abreviações no teclado, o significado aparece como uma opção na tecla de palavras. Ele escolhe com
        o olhar, e nada é trocado sozinho. Aparecem só com as sugestões ligadas, e ficam neste computador.
      </p>

      <form onSubmit={guardar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 10rem', minWidth: 0 }}>
            <label htmlFor="abreviacao-sigla" className="campo__rotulo">
              Abreviação
            </label>
            <input
              id="abreviacao-sigla"
              type="text"
              className="campo"
              value={sigla}
              disabled={editando !== null}
              onChange={(e) => {
                setSigla(e.target.value);
                if (erro) setErro(null);
              }}
              placeholder="Ex.: obg"
              autoComplete="off"
              aria-describedby="abreviacao-dica-sigla"
            />
            <p id="abreviacao-dica-sigla" className="t-body" style={{ margin: '0.3rem 0 0', color: 'var(--color-text-muted)' }}>
              Só letras, até {MAX_SIGLA}.
            </p>
          </div>
          <div style={{ flex: '3 1 16rem', minWidth: 0 }}>
            <label htmlFor="abreviacao-significado" className="campo__rotulo">
              Significado
            </label>
            <input
              id="abreviacao-significado"
              ref={significadoRef}
              type="text"
              className="campo"
              value={significado}
              onChange={(e) => {
                setSignificado(e.target.value);
                if (erro) setErro(null);
              }}
              placeholder="Ex.: obrigado"
              autoComplete="off"
              aria-describedby="abreviacao-dica-significado"
            />
            <p id="abreviacao-dica-significado" className="t-body" style={{ margin: '0.3rem 0 0', color: 'var(--color-text-muted)' }}>
              Até {MAX_SIGNIFICADO} letras: é o que cabe, inteiro, numa tecla do teclado.
            </p>
          </div>
        </div>

        {erro && (
          <p role="alert" style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--tint-danger-text)' }}>
            {erro}
          </p>
        )}
        {aviso && !erro && (
          <p
            role="status"
            data-testid="abreviacoes-aviso"
            style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-base)' }}
          >
            {aviso}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
          {editando !== null && (
            <PrimaryButton type="button" variant="ghost" onClick={cancelar} {...SEM_OLHAR}>
              Cancelar
            </PrimaryButton>
          )}
          <PrimaryButton type="submit" {...SEM_OLHAR}>
            {editando !== null ? (
              'Salvar alteração'
            ) : (
              <>
                <Plus size={18} aria-hidden="true" /> Guardar abreviação
              </>
            )}
          </PrimaryButton>
        </div>
      </form>

      <div style={{ marginTop: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            margin: '0 0 0.75rem 0',
          }}
        >
          <h3 className="t-overline" style={{ margin: 0 }}>
            Abreviações em uso ({itens.length})
          </h3>
          <PrimaryButton
            type="button"
            variant="ghost"
            onClick={restaurar}
            disabled={alteradas === 0}
            title={
              alteradas === 0
                ? `As ${FABRICA} abreviações de fábrica estão como vieram.`
                : `Desfaz o que foi mudado ou apagado entre as ${FABRICA} de fábrica.`
            }
            {...SEM_OLHAR}
          >
            <RotateCcw size={18} aria-hidden="true" /> Restaurar abreviações de fábrica
          </PrimaryButton>
        </div>

        <ul
          data-testid="lista-de-abreviacoes"
          style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          {itens.map((item) => (
            <li
              key={item.sigla}
              data-testid={`abreviacao-${item.sigla}`}
              className="surface"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem 1rem',
                flexWrap: 'wrap',
                padding: '0.6rem 0.9rem 0.6rem 1.1rem',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div
                style={{ flex: '1 1 14rem', minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}
              >
                <strong className="t-h3" style={{ color: 'var(--color-text-base)' }}>
                  {item.sigla}
                </strong>
                <span aria-hidden="true">→</span>
                <span className="sr-only">quer dizer</span>
                <span className="t-body" style={{ color: 'var(--color-text-base)', overflowWrap: 'anywhere' }}>
                  {item.significado}
                </span>
              </div>
              <span style={etiqueta}>{ROTULO_DA_ORIGEM[item.origem]}</span>
              {item.mudada && <span style={etiqueta}>alterada</span>}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => comecarEdicao(item)}
                aria-label={`Editar a abreviação ${item.sigla}`}
                style={{ padding: '0.5rem 0.9rem', minHeight: 44 }}
                {...SEM_OLHAR}
              >
                <Pencil size={18} aria-hidden="true" /> Editar
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => apagar(item)}
                aria-label={`Apagar a abreviação ${item.sigla}`}
                style={{
                  color: 'var(--tint-danger-text)',
                  borderColor: 'var(--tint-danger-border)',
                  background: 'var(--tint-danger-bg)',
                  padding: '0.5rem 0.9rem',
                  minHeight: 44,
                }}
                {...SEM_OLHAR}
              >
                <Trash2 size={18} aria-hidden="true" /> Apagar
              </button>
            </li>
          ))}
        </ul>
        <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: '0.75rem 0 0', maxWidth: '64ch' }}>
          “Aprendida” é a sigla que o aparelho propõe quando o paciente escreve a mesma frase curta por
          extenso três vezes (“estou com dor” → “ecd”). Apagar o aprendizado, no Assistente de escrita,
          as remove; as que você fez ficam.
        </p>
      </div>

      <div style={{ marginTop: '2rem' }} data-testid="aceitacao">
        <h3 className="t-overline" style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={18} color="var(--color-accent)" aria-hidden="true" /> Respostas sugeridas
        </h3>
        <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: '0 0 0.75rem 0', maxWidth: '64ch' }}>
          Quando o cuidador faz uma pergunta, a Conversa mostra até quatro respostas marcadas como
          “sugestão”. Elas só são faladas se o paciente escolher uma, e não aparecem em emergência nem na
          tela da dor. A contagem fica só neste computador.
        </p>
        <p role="status" className="t-body" style={{ color: 'var(--color-text-base)', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
          {nadaContado
            ? 'Ainda não apareceu nenhuma sugestão de resposta.'
            : `${aceitacao.mostradas} ${aceitacao.mostradas === 1 ? 'mostrada' : 'mostradas'} · ${aceitacao.aceitas} ${
                aceitacao.aceitas === 1 ? 'escolhida' : 'escolhidas'
              }${aceitacao.taxa !== null ? ` (${porcentagem(aceitacao.taxa)})` : ''}`}
        </p>
        <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: '0 0 0.75rem 0', maxWidth: '64ch' }}>
          {recolhida
            ? `A faixa está recolhida: menos de ${porcentagem(TAXA_MINIMA)} das sugestões foram escolhidas. Na Conversa, ela traz um botão para voltar; aqui você também pode zerar a contagem.`
            : `Se menos de ${porcentagem(TAXA_MINIMA)} forem escolhidas, depois de ${AMOSTRA_MINIMA} mostradas, a faixa se recolhe sozinha.`}
        </p>
        <PrimaryButton type="button" variant="ghost" onClick={zerar} disabled={nadaContado} {...SEM_OLHAR}>
          <RotateCcw size={18} aria-hidden="true" /> {recolhida ? 'Mostrar a faixa de novo' : 'Zerar a contagem'}
        </PrimaryButton>
      </div>
    </section>
  );
};
