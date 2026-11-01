import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { MarcaCuidador } from '@/components';
import { useTutorialVisto } from '@/lib/tutorial';
import { useApp } from '@/store/AppProvider';
import { useTheme } from '@/theme';

/** Caixa do símbolo que deixa a palavra com os 200 dp da capa (200 / (0,83 × 1,42)). */
const TAMANHO_DA_CAPA = 170;

/**
 * Abertura. Com conta, o início; sem conta, o tutorial na PRIMEIRA vez
 * (31/10/2026) e o login nas seguintes.
 */
export default function Index() {
  const { ready, user } = useApp();
  const tutorialVisto = useTutorialVisto();
  const { colors } = useTheme();
  // Enquanto a sessão guardada é lida: a marca no centro, do tamanho da capa
  // (app.json → expo-splash-screen, imageWidth 200), para a troca não pular.
  if (!ready || (!user && tutorialVisto === null)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]} accessible accessibilityLabel="Abrindo o IrisFlow Cuidador">
        <MarcaCuidador size={TAMANHO_DA_CAPA} animado={false} />
      </View>
    );
  }
  return <Redirect href={user ? '/(tabs)' : tutorialVisto ? '/(auth)/login' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
