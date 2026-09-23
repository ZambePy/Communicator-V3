import React from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

/**
 * Estados de tela — vazio, erro e carregando — com UM padrão visual.
 *
 * Cada tela tinha o seu: um parágrafo apagado aqui, uma caixa vermelha ali,
 * um spinner solto acolá. O padrão é sempre o mesmo: ícone num círculo,
 * título em display, uma frase que diz o que fazer e (opcional) a ação.
 *
 * `quieto` troca o giro contínuo do carregando por um ponto que apenas
 * escurece e clareia. É obrigatório nas telas do PACIENTE: movimento
 * contínuo na área dele atrai o olhar e pode disparar dwell por engano.
 */
interface Base {
  titulo: string;
  texto?: string;
  acao?: React.ReactNode;
  icone?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

const Caixa: React.FC<
  Base & { tom: 'vazio' | 'erro' | 'carregando'; quieto?: boolean; role?: string }
> = ({ titulo, texto, acao, icone, className = '', style, tom, quieto, role, ...rest }) => (
  <div
    role={role}
    aria-live={tom === 'vazio' ? undefined : 'polite'}
    className={`estado-da-tela estado-da-tela--${tom} ${quieto ? 'estado-da-tela--quieto' : ''} ${className}`.trim()}
    style={style}
    data-testid={rest['data-testid']}
  >
    <div className="estado-da-tela__icone" aria-hidden="true">
      {icone}
    </div>
    <h2 className="estado-da-tela__titulo">{titulo}</h2>
    {texto && <p className="estado-da-tela__texto">{texto}</p>}
    {acao && <div className="estado-da-tela__acao">{acao}</div>}
  </div>
);

export const EstadoVazio: React.FC<Base> = (p) => (
  <Caixa tom="vazio" icone={<Inbox size={30} />} {...p} />
);

export const EstadoDeErro: React.FC<Base> = (p) => (
  <Caixa tom="erro" role="alert" icone={<AlertTriangle size={30} />} {...p} />
);

export const EstadoCarregando: React.FC<Base & { quieto?: boolean }> = ({ quieto, ...p }) => (
  <Caixa
    tom="carregando"
    role="status"
    quieto={quieto}
    icone={<Loader2 size={30} className="estado-da-tela__giro" />}
    {...p}
  />
);
