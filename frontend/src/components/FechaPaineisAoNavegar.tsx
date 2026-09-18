import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { fecharPainelDeDiagnostico } from '@tracker/accuracy';

/**
 * Fecha, a cada troca de rota, os painéis que vivem FORA da árvore do React.
 *
 * O painel de resultados do teste de precisão é anexado ao `document.body` por
 * `accuracy.ts` e registra um `keydown` no documento. Ele se desmonta quando a
 * pessoa aperta Espaço/R ou clica num dos dois botões — mas não quando ela sai
 * por outro caminho, e existe um caminho global e dwellável para sair de
 * qualquer lugar do app: o botão de emergência.
 *
 * Saindo por ali, o overlay de tela cheia ficava por cima do app e o handler de
 * teclado continuava respondendo a Espaço e a R pelo resto da sessão — sendo
 * que `R` significa "descartar a calibração e refazer". Um overlay órfão que
 * ainda escuta o teclado não é só vazamento de memória; é uma tecla que apaga
 * o modelo do paciente sem nada na tela para explicar por quê.
 *
 * Não renderiza nada. Fica dentro do Router, irmão das rotas.
 */
export const FechaPaineisAoNavegar: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    fecharPainelDeDiagnostico();
  }, [pathname]);
  return null;
};
