import React from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';

/**
 * As duas barras do sistema: a de status (em cima) e a de navegação do Android
 * (embaixo).
 *
 * A de navegação fica ESCONDIDA (pedido de 18/10/2026: ela ficava por cima da
 * barra de abas o tempo todo). Escondida, o Android a mostra por alguns
 * segundos quando a pessoa arrasta a borda de baixo para cima e a esconde de
 * novo sozinho: o expo-navigation-bar liga o comportamento
 * `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` ao esconder. Os modais (o alerta de
 * emergência é um) abrem janelas próprias, e o módulo copia o estado para elas.
 *
 * `style` é a cor dos BOTÕES nas duas barras: `light` = ícones claros, para
 * fundo escuro. Na versão anterior a de navegação estava invertida (ícones
 * escuros no tema escuro).
 *
 * Só JavaScript: o módulo nativo já estava no APK da beta, então a mudança
 * chega por atualização OTA, sem build nativo.
 */
export function BarrasDoSistema({ fundoEscuro }: { fundoEscuro: boolean }) {
  const icones = fundoEscuro ? 'light' : 'dark';
  return (
    <>
      <StatusBar style={icones} />
      {Platform.OS === 'android' && <NavigationBar hidden style={icones} />}
    </>
  );
}
