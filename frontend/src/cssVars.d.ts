import 'react';

/**
 * Custom properties (`--alguma-coisa`) no `style` do React sem `as` a cada uso.
 * O app passa variáveis de CSS por `style` em vários pontos — a reserva do
 * botão de Emergência (`--reserva-margem`) e as paletas do teclado, por
 * exemplo — e o tipo padrão do React não aceita chaves com `--`.
 */
declare module 'react' {
  interface CSSProperties {
    [variavel: `--${string}`]: string | number | undefined;
  }
}
