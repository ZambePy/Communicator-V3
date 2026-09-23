import React from 'react';
import { Info, Maximize, RefreshCw, FlaskConical } from 'lucide-react';
import {
  instalarAtualizacao,
  verificarAtualizacao,
  type EstadoDaAtualizacao,
} from '../../services/atualizacao';
import {
  FASE_DO_PRODUTO,
  POR_QUE_TELA_CHEIA,
  SOBRE_ATUALIZACOES,
  SOBRE_O_BETA,
  detectarPlataforma,
  instrucaoDeSaida,
} from '../../services/telaCheia';

/** Uma linha sobre o estado da atualização, para quem abre esta seção. */
export function descreverAtualizacao(e: EstadoDaAtualizacao): string {
  switch (e.fase) {
    case 'inativa':
      return `Atualização automática indisponível aqui (${e.motivo}).`;
    case 'verificando':
      return 'Procurando uma versão nova…';
    case 'em_dia':
      return `Você está na versão mais recente (${e.versao}).`;
    case 'baixando':
      return `Baixando a versão ${e.versao}: ${e.progresso}%. Pode continuar usando.`;
    case 'pronta':
      return `A versão ${e.versao} está pronta. Entra ao reiniciar ou ao fechar o aplicativo.`;
    case 'erro':
      return `Não foi possível verificar agora (${e.mensagem}). O aplicativo segue normalmente.`;
  }
}

/**
 * Configurações → Sobre o IrisFlow.
 *
 * Três coisas que o cuidador precisa saber e que não estavam escritas em
 * lugar nenhum da interface: que o produto é Beta, que ele se atualiza
 * sozinho (e quando a versão nova entra), e por que a tela cheia — com a saída
 * pelo teclado, que é o que evita alguém desligar o computador no botão por
 * achar que o app "travou".
 *
 * Os botões aqui são do cuidador (mouse): `data-no-dwell`, como os demais
 * controles desta tela. O paciente tem a faixa de atualização, com alvos de
 * olhar, fora de Configurações.
 */
export const SobreOIrisFlow: React.FC<{
  versao: string | null;
  atualizacao: EstadoDaAtualizacao;
  cardStyle: React.CSSProperties;
}> = ({ versao, atualizacao, cardStyle }) => {
  const saida = instrucaoDeSaida(detectarPlataforma());
  const linha: React.CSSProperties = {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
    color: 'var(--color-text-base)',
    lineHeight: 1.6,
    fontSize: '0.98rem',
  };
  return (
    <section aria-labelledby="sobre-title" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <Info size={28} color="var(--color-primary)" aria-hidden="true" />
        <h2 id="sobre-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
          Sobre o IrisFlow
        </h2>
        <span
          data-testid="selo-beta"
          style={{
            padding: '0.2rem 0.7rem',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--tint-warn-bg)',
            border: '1px solid var(--tint-warn-border)',
            color: 'var(--color-text-base)',
            fontWeight: 800,
            fontSize: '0.85rem',
          }}
        >
          {FASE_DO_PRODUTO}
        </span>
        {versao && (
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 700, fontSize: '0.95rem' }}>
            Versão {versao}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={linha}>
          <FlaskConical size={20} color="var(--color-primary)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 4 }} />
          <span>{SOBRE_O_BETA}</span>
        </p>

        <p style={linha} data-testid="sobre-tela-cheia">
          <Maximize size={20} color="var(--color-primary)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 4 }} />
          <span>
            {POR_QUE_TELA_CHEIA} {saida.texto}
          </span>
        </p>

        <div style={linha}>
          <RefreshCw size={20} color="var(--color-primary)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 4 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <span>{SOBRE_ATUALIZACOES}</span>
            <strong data-testid="sobre-estado-atualizacao" style={{ fontWeight: 700 }}>
              {descreverAtualizacao(atualizacao)}
            </strong>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {atualizacao.fase === 'pronta' ? (
                <button
                  type="button"
                  data-no-dwell="true"
                  onClick={() => void instalarAtualizacao()}
                  className="btn"
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: 'var(--color-accent)',
                    color: '#1a1205',
                    border: 'none',
                    borderRadius: '0.85rem',
                    cursor: 'pointer',
                    fontWeight: 800,
                  }}
                >
                  Reiniciar e atualizar agora
                </button>
              ) : atualizacao.fase !== 'inativa' ? (
                <button
                  type="button"
                  data-no-dwell="true"
                  disabled={atualizacao.fase === 'verificando' || atualizacao.fase === 'baixando'}
                  onClick={() => void verificarAtualizacao()}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: 'transparent',
                    color: 'var(--color-text-base)',
                    border: '2px solid var(--field-border)',
                    borderRadius: '0.85rem',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Procurar atualização agora
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
