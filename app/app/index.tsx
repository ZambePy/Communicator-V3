import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { MarcaCuidador } from '@/components';
import { useApp } from '@/store/AppProvider';
import { useTheme } from '@/theme';

/** Caixa do símbolo que deixa a palavra com os 200 dp da capa (200 / (0,83 × 1,42)). */
const TAMANHO_DA_CAPA = 170;

export default function Index() {
  const { ready, user } = useApp();
  const { colors } = useTheme();
  // Enquanto a sessão guardada é lida: a marca no centro, do tamanho da capa
  // (app.json → expo-splash-screen, imageWidth 200), para a troca não pular.
  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]} accessible accessibilityLabel="Abrindo o IrisFlow Cuidador">
        <MarcaCuidador size={TAMANHO_DA_CAPA} animado={false} />
      </View>
    );
  }
  return <Redirect href={user ? '/(tabs)' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
