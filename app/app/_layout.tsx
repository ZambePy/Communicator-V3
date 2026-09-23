import React, { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationBar } from 'expo-navigation-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';
import { DataProviderRoot } from '@/data/DataContext';
import { AppProvider, useApp } from '@/store/AppProvider';
import { PushPayload, usePushNotifications } from '@/hooks/usePushNotifications';
import { EmergencyOverlay } from '@/features/EmergencyOverlay';
import { ServicoIndisponivel } from '@/features/ServicoIndisponivel';
import { ErrorBanner } from '@/components';
import { hasSupabaseConfig } from '@/lib/supabase';
import { initSentry, wrapRoot } from '@/lib/sentry';

// Relatório de falhas: não faz nada sem EXPO_PUBLIC_SENTRY_DSN (src/lib/sentry.ts).
initSentry();

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootLayout() {
  // Inter em cinco pesos; a 800 é a fonte de destaque (display).
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  // Se a fonte falhar, seguimos com a do sistema: a tela nunca fica presa no splash.
  const fontsReady = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* Sem as variáveis do Supabase (build mal configurado) não há camada de
              dados: um aviso neutro no lugar do app — nunca um modo de demonstração. */}
          {hasSupabaseConfig ? (
            <DataProviderRoot>
              <AppProvider>
                <Navigation />
              </AppProvider>
            </DataProviderRoot>
          ) : (
            <ServicoIndisponivel />
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);

function Navigation() {
  const { colors, mode } = useTheme();
  const { ready, user, beneficiaries, selectPatient, refresh, reportPushError } = useApp();
  const segments = useSegments();
  const router = useRouter();

  // Toque no push: seleciona o paciente do alerta, recarrega (o AppProvider
  // deriva `pendingAlert` do pedido aberto → overlay) e abre a aba de Alertas.
  const abrirPeloPush = useCallback(
    (payload: PushPayload) => {
      if (payload.beneficiary_id && beneficiaries.some((b) => b.id === payload.beneficiary_id)) selectPatient(payload.beneficiary_id);
      void refresh();
      router.push('/(tabs)/alertas');
    },
    [beneficiaries, selectPatient, refresh, router],
  );
  usePushNotifications(Boolean(user), { onOpen: abrirPeloPush, onRegisterError: reportPushError });

  // Guarda de autenticação: redireciona conforme o estado de login.
  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)' || segments[0] === 'onboarding';
    if (!user && !inAuth) router.replace('/onboarding');
    if (user && inAuth) router.replace('/(tabs)');
  }, [ready, user, segments, router]);

  // Boas-vindas é a única tela sobre gradiente escuro: ícones claros na barra.
  const telaEscura = segments[0] === 'onboarding';

  return (
    <>
      <StatusBar style={telaEscura || mode === 'dark' ? 'light' : 'dark'} />
      {/* Barra de navegação do Android VISÍVEL: o app do cuidador é um app
          comum (esconder a barra é coisa da tela do paciente, em quiosque).
          Só o estilo dos botões acompanha o tema. */}
      {Platform.OS === 'android' && <NavigationBar hidden={false} style={mode === 'dark' ? 'dark' : 'light'} />}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)/login" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="frases" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paciente" options={{ presentation: 'modal' }} />
        <Stack.Screen name="assinatura" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sessao/[id]" options={{ animation: 'slide_from_right' }} />
      </Stack>
      {user && <ErrorBanner />}
      {/* Por último: o alerta de emergência fica acima de tudo, inclusive dos modais. */}
      <EmergencyOverlay />
    </>
  );
}
