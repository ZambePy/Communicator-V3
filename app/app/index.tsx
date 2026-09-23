import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { IrisLogo } from '@/components';
import { useApp } from '@/store/AppProvider';
import { sizes, useTheme } from '@/theme';

export default function Index() {
  const { ready, user } = useApp();
  const { colors } = useTheme();
  // Enquanto a sessão guardada é lida: o símbolo no centro, como o splash.
  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]} accessible accessibilityLabel="Abrindo o IrisFlow">
        <IrisLogo size={sizes.logo.xl} breathing spinning={false} />
      </View>
    );
  }
  return <Redirect href={user ? '/(tabs)' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
