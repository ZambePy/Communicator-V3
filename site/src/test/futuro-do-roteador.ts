/* As future flags do React Router v6 que preparam a v7. Sem elas, cada
   <MemoryRouter> dos testes imprime dois avisos no stderr (ruído que esconde
   o que importa). Os testes novos do v3 (21/10/2026) passam isto em
   `future`; é o mesmo comportamento que o app terá na v7. */
export const FUTURO_DO_ROTEADOR = { v7_startTransition: true, v7_relativeSplatPath: true } as const
