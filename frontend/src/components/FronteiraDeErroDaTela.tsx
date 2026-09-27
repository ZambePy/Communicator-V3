import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { GazeButton } from './ui/GazeButton';

interface PropsDaFronteira {
  children: React.ReactNode;
  /** Muda a cada rota: trocar de tela limpa o erro. */
  chave: string;
  aoVoltar: () => void;
}

interface EstadoDaFronteira {
  erro: Error | null;
}

class Fronteira extends React.Component<PropsDaFronteira, EstadoDaFronteira> {
  state: EstadoDaFronteira = { erro: null };

  static getDerivedStateFromError(erro: Error): EstadoDaFronteira {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    console.error('[tela] erro ao desenhar a tela:', erro, info.componentStack);
  }

  componentDidUpdate(anterior: PropsDaFronteira) {
    if (anterior.chave !== this.props.chave && this.state.erro) this.setState({ erro: null });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <main
        role="alert"
        aria-live="assertive"
        data-testid="fronteira-de-erro-da-tela"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '2rem',
          background: 'var(--page-bg)',
          color: 'var(--color-text-base)',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={56} color="var(--color-accent)" aria-hidden="true" />
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Esta tela encontrou um problema</h1>
        <p style={{ margin: 0, maxWidth: 560, fontSize: '1.15rem', lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          O resto do IrisFlow continua funcionando, inclusive o botão de Emergência. Volte ao menu para seguir.
        </p>
        <GazeButton
          onClick={this.props.aoVoltar}
          aria-label="Voltar ao menu"
          recovery
          style={{
            width: 360,
            minHeight: 200,
            borderRadius: '1.5rem',
            background: 'var(--color-primary)',
            border: 'none',
            color: '#ffffff',
            fontSize: '1.5rem',
            fontWeight: 800,
          }}
        >
          Voltar ao menu
        </GazeButton>
      </main>
    );
  }
}

/**
 * Fronteira de erro POR TELA (FE-8).
 *
 * A única fronteira ficava na raiz, por fora do olhar e da Emergência: um erro
 * de render em qualquer tela desmontava o app inteiro — sem cursor, sem botão
 * de socorro, com um "Recarregar" que só o mouse acionava. Aqui a falha fica
 * na tela: o rastreamento e a Emergência seguem montados, e a saída ("Voltar
 * ao menu") é um alvo grande do olhar, aceito também com o rastreamento
 * degradado. Trocar de rota limpa o erro.
 */
export const FronteiraDeErroDaTela: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <Fronteira chave={pathname} aoVoltar={() => navigate('/menu', { replace: true })}>
      {children}
    </Fronteira>
  );
};
