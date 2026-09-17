import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';
import { DataProviderRoot } from '@/data/DataContext';
import { AppProvider, useApp } from '@/store/AppProvider';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { EmergencyOverlay } from '@/features/EmergencyOverlay';

import { AppState, Platform } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Só Inter é carregada. Os títulos de destaque usam a fonte do sistema (fonts.display),
  // por isso nada aqui depende de um .ttf empacotado no projeto.
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  // Se a fonte falhar, seguimos com a do sistema: a tela nunca fica presa no splash.
  const fontsReady = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const configureNavBar = () => {
      try {
        NavigationBar.setHidden(true);
      } catch {
        // Ignora caso o SO ou dispositivo não permita
      }
    };

    configureNavBar();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        configureNavBar();
      }
    });

    return () => subscription.remove();
  }, []);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <DataProviderRoot>
            <AppProvider>
              <Navigation />
            </AppProvider>
          </DataProviderRoot>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigation() {
  const { colors, mode } = useTheme();
  const { ready, user } = useApp();
  const segments = useSegments();
  const router = useRouter();
  usePushNotifications(Boolean(user));

  // Guarda de autenticação: redireciona conforme o estado de login.
  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)' || segments[0] === 'onboarding';
    if (!user && !inAuth) router.replace('/onboarding');
    if (user && inAuth) router.replace('/(tabs)');
  }, [ready, user, segments, router]);

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {Platform.OS === 'android' && <NavigationBar hidden={true} />}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)/login" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="frases" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paciente" options={{ presentation: 'modal' }} />
        <Stack.Screen name="assinatura" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sessao/[id]" />
      </Stack>
      <EmergencyOverlay />
    </>
  );
}
