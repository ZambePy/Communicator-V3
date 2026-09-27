import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { brand, useTheme } from '@/theme';
import { IrisLogo } from './IrisLogo';
import { PALAVRA_CUIDADOR, PROPORCOES } from './marcaCuidador';

/** O símbolo ocupa 83 % da caixa do `IrisLogo` (symbol.png: 425 de 512 px), com 8 % de margem embaixo. */
const FRACAO_DO_SIMBOLO = 0.83;
const MARGEM_INFERIOR = 0.082;

interface Props {
  /** Lado da caixa do símbolo, como no `IrisLogo`. */
  size?: number;
  /** Versão branca para fundo escuro; omitido = acompanha o tema. */
  onDark?: boolean;
  /** Lâminas girando e pupila respirando (desligado sozinho com "reduzir movimento"). */
  animado?: boolean;
  halo?: boolean;
}

/**
 * Marca do IrisFlow Cuidador: o símbolo da IrisFlow com "cuidador" embaixo — a
 * mesma assinatura da capa do app (app/assets/images/splash-icon.png) e de
 * site/public/brand/irisflow-cuidador.svg. A palavra é a Boldonse do logotipo,
 * desenhada como caminho (sem carregar a fonte).
 */
export function MarcaCuidador({ size = 96, onDark, animado = true, halo = false }: Props) {
  const { mode } = useTheme();
  const escuro = onDark ?? mode === 'dark';
  const [, , w, h] = PALAVRA_CUIDADOR.viewBox.split(' ').map(Number);
  const larguraDoSimbolo = size * FRACAO_DO_SIMBOLO;
  const largura = larguraDoSimbolo * PROPORCOES.larguraDaPalavra;
  const altura = largura * (h / w);
  const vao = Math.max(0, larguraDoSimbolo * PROPORCOES.vao - size * MARGEM_INFERIOR);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="IrisFlow Cuidador" style={{ alignItems: 'center' }}>
      <IrisLogo size={size} onDark={escuro} spinning={animado} breathing={animado} halo={halo} />
      <View style={{ marginTop: vao }}>
        <Svg width={largura} height={altura} viewBox={PALAVRA_CUIDADOR.viewBox}>
          <Path d={PALAVRA_CUIDADOR.d} fill={escuro ? brand.white : brand.navy} />
        </Svg>
      </View>
    </View>
  );
}
