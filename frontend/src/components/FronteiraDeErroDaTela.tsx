import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { GazeButton } from './ui/GazeButton';
import type { PedidoDeSocorro } from '../services/emergencia/pedidoDeSocorro';
import { usePedidoDeSocorro } from '../services/emergencia/usePedidoDeSocorro';

const NO_MENU = 'No menu, o botão "Socorro em andamento" mostra o pedido.';

/**
 * O que a fronteira diz do socorro em andamento, pela entrega do pedido
 * (revisão de UX de 19/10/2026, achado 15). Antes era sempre "O pedido de
 * socorro já foi enviado" — também sem celular ligado, sem internet ou com o
 * envio recusado, que é justamente quando o paciente precisa saber que o
 * alarme daqui é o único aviso. Os textos seguem os da tela de emergência
 * (`emergency.entrega.*`), sem o i18n: a fronteira não pode depender de mais
 * nada que possa ter falhado.
 */
function textoDoSocorroNaFronteira(p: PedidoDeSocorro): string {
  if (p.fase === 'visto') return `Seu cuidador viu o pedido de socorro. ${NO_MENU}`;
  switch (p.entrega) {
    case 'enviado':
      return p.fase === 'escalado'
        ? `O celular do cuidador foi avisado, mas ninguém confirmou ainda: o alarme toca aqui até alguém confirmar. ${NO_MENU}`
        : `O celular do cuidador foi avisado do pedido de socorro. Se ninguém confirmar, o alarme toca aqui. ${NO_MENU}`;
    case 'na_fila':
      return `Sem internet agora: o pedido de socorro vai para o celular do cuidador assim que a internet voltar. O alarme toca aqui. ${NO_MENU}`;
    case 'sem_nuvem':
      return `Este computador não está ligado ao celular de um cuidador: o alarme de socorro toca só aqui. ${NO_MENU}`;
    case 'falhou':
      return `Não foi possível avisar o celular do cuidador. O alarme de socorro toca aqui. ${NO_MENU}`;
    case 'sem_push':
    case 'limitado':
      return `O pedido de socorro chegou ao servidor, mas nenhum celular de cuidador foi avisado. O alarme toca aqui. ${NO_MENU}`;
    case 'push_incerto':
      return `O pedido de socorro chegou ao servidor, mas não deu para confirmar se o celular do cuidador recebeu o aviso. O alarme toca aqui. ${NO_MENU}`;
    case 'ensaio':
      return `Modo apresentação: nada foi enviado ao celular do cuidador. ${NO_MENU}`;
    default:
      return `Enviando o pedido de socorro ao celular do cuidador. Se o envio não for confirmado, o alarme toca aqui. ${NO_MENU}`;
  }
}

/**
 * Componente (e não uma leitura no `render` da classe) para acompanhar a
 * entrega: o pedido costuma estar "enviando" quando a tela quebra, e a
 * resposta chega com a fronteira já na tela.
 */
const AvisoDaFronteira: React.FC<{ naEmergencia: boolean }> = ({ naEmergencia }) => {
  const pedido = usePedidoDeSocorro();
  // Na rota da emergência o botão flutuante não aparece; o que vale dizer ali
  // é o que aconteceu com o pedido, que não depende desta tela (ele sai e o
  // alarme toca antes de ela existir — services/emergencia).
  if (naEmergencia && pedido && pedido.fase !== 'encerrado') return <>{textoDoSocorroNaFronteira(pedido)}</>;
  return <>O resto do IrisFlow continua funcionando, inclusive o botão de Emergência. Volte ao menu para seguir.</>;
};

interface PropsDaFronteira {
  children: React.ReactNode;
  /** Muda a cada rota: trocar de tela limpa o erro. */
  chave: string;
  aoVoltar: () => void;
  /** A tela que falhou é a de emergência. */
  naEmergencia?: boolean;
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
          <AvisoDaFronteira naEmergencia={this.props.naEmergencia === true} />
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
    <Fronteira chave={pathname} naEmergencia={pathname.startsWith('/emergency')} aoVoltar={() => navigate('/menu', { replace: true })}>
      {children}
    </Fronteira>
  );
};
