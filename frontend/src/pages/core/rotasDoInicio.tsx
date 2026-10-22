import React from 'react';
import { Route } from 'react-router-dom';
import { MenuInicial } from './MenuInicial';

/** O que as rotas do início usam: no app, as telas de verdade (carregadas sob demanda) e o portão de acesso. */
interface TelasDoInicio {
  /** O menu completo (`MainMenu`). */
  MenuCompleto: React.ComponentType;
  /** A tela do quarto (`HospitalScreen`). */
  Hospital: React.ComponentType;
  /** O portão que envolve cada rota (no app, o `ProtectedRoute`). */
  Portao: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * As rotas do início do app (rodada 3, 21/10/2026):
 *
 * - `/menu`: o menu completo ou, com o modo hospital ligado, a tela do quarto
 *   (ver `MenuInicial`). Quase toda tela volta para `/menu`, e o desvio aqui
 *   vale para todas.
 * - `/menu-completo`: o menu sem desvio, "Mais opções" da tela do hospital. É por
 *   onde o cuidador chega às Configurações para desligar o modo.
 * - `/hospital`: a tela do quarto, com as necessidades do leito em alvos grandes.
 *
 * Mora fora do `App.tsx` para a tabela poder ser testada pelo comportamento
 * (o `App` não monta no teste: são provedores demais) sem ler o texto dele.
 *
 * É uma FUNÇÃO que devolve um fragmento de `<Route>`, e não um componente: o
 * `<Routes>` só aceita `<Route>` e fragmentos como filhos. Usa-se como
 * `<Routes>{rotasDoInicio({ ... })}</Routes>`.
 */
export function rotasDoInicio({ MenuCompleto, Hospital, Portao }: TelasDoInicio): React.ReactElement {
  return (
    <>
      <Route
        path="/menu"
        element={
          <Portao>
            <MenuInicial>
              <MenuCompleto />
            </MenuInicial>
          </Portao>
        }
      />
      <Route
        path="/menu-completo"
        element={
          <Portao>
            <MenuCompleto />
          </Portao>
        }
      />
      <Route
        path="/hospital"
        element={
          <Portao>
            <Hospital />
          </Portao>
        }
      />
    </>
  );
}
