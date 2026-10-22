import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { modoHospitalEmVigor } from './hospital/modoHospitalEmVigor';

/**
 * A tela inicial do app (rodada 3, 21/10/2026): o menu de sempre, ou, com o
 * modo hospital ligado, a tela do quarto (`/hospital`).
 *
 * O desvio mora na rota `/menu`, e não nas telas, porque quase todas voltam
 * para ela — `backRoute="/menu"` e `navigate('/menu')` aparecem em 25 pontos, e
 * a rota desconhecida também cai ali. Trocar todos por uma função que decide
 * deixaria o modo hospital dependente de ninguém esquecer nenhum; desviando
 * aqui, qualquer caminho de volta chega à tela do quarto.
 *
 * O menu completo continua a um olhar, em `/menu-completo` ("Mais opções" na
 * tela do hospital): é por onde o cuidador chega às Configurações para
 * desligar o modo.
 *
 * Com o modo só horizontal também ligado, o desvio NÃO acontece (M8, 21/10/2026):
 * a grade do quarto pede o olhar vertical que essa pessoa perdeu. Ver
 * `modoHospitalEmVigor`.
 *
 * `replace`: o desvio não deixa `/menu` no histórico, senão o "voltar" do
 * navegador cairia nele de novo e seria desviado outra vez.
 */
export const MenuInicial: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  if (modoHospitalEmVigor(settings)) return <Navigate to="/hospital" replace />;
  return <>{children}</>;
};
