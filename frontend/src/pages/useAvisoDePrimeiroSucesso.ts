import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../context/ToastContext';

/**
 * Mostra UMA vez "Você acabou de controlar o IrisFlow usando apenas o olhar."
 * quando o módulo foi aberto a partir do primeiro sucesso (`/welcome`).
 *
 * O sinal vem no `state` da navegação e é apagado logo em seguida, para o
 * aviso não voltar num F5 nem numa volta pelo histórico.
 */
export function useAvisoDePrimeiroSucesso(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation();

  const veioDoPrimeiroSucesso =
    (location.state as { primeiroSucesso?: boolean } | null)?.primeiroSucesso === true;

  // Guarda por montagem: o aviso sai uma vez, independentemente de quantas
  // vezes o efeito rodar (o toast re-renderiza a árvore e a limpeza do
  // `state` chega um ciclo depois — sem a guarda, cada ciclo emitia outro).
  const jaAvisou = useRef(false);

  useEffect(() => {
    if (!veioDoPrimeiroSucesso || jaAvisou.current) return;
    jaAvisou.current = true;
    toast.success(t('primeiroSucesso.aviso'), 7000);
    navigate(location.pathname, { replace: true, state: null });
  }, [veioDoPrimeiroSucesso, toast, t, navigate, location.pathname]);
}
