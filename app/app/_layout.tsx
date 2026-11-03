import React, { useCallback, useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';
import { DataProviderRoot } from '@/data/DataContext';
import { AppProvider, useApp } from '@/store/AppProvider';
import { destinoDoToque, PushPayload, usePushNotifications } from '@/hooks/usePushNotifications';
import { useTutorialVisto } from '@/lib/tutorial';
import { EmergencyOverlay } from '@/features/EmergencyOverlay';
import { ServicoIndisponivel } from '@/features/ServicoIndisponivel';
import { ErrorBanner, EspacoDoTopoProvider } from '@/components';
import { BarrasDoSistema } from '@/components/BarrasDoSistema';
import { hasSupabaseConfig } from '@/lib/supabase';
import { initSentry, wrapRoot } from '@/lib/sentry';

// Relatório de falhas: não faz nada sem EXPO_PUBLIC_SENTRY_DSN (src/lib/sentry.ts).
initSentry();

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootLayout() {
  // Inter em cinco pesos para o texto; Sora (a fonte do site e do app do
  // computador) nos títulos. Os arquivos da Sora estão em assets/fonts (OFL).
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Sora_600SemiBold: require('../assets/fonts/Sora-SemiBold.ttf'),
    Sora_700Bold: require('../assets/fonts/Sora-Bold.ttf'),
  });
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

  // Toque no push. Mensagem do paciente (31/10/2026): seleciona a pessoa e
  // abre a Conversa — a recarga ao voltar para a frente traz a mensagem.
  // Alerta: seleciona o paciente, recarrega (o AppProvider deriva
  // `pendingAlert` do pedido aberto → overlay) e abre a aba de Alertas.
  // Com o app fechado, o toque chega antes da lista de pessoas: o id fica
  // guardado e a pessoa é escolhida quando a lista carregar (antes, com mais
  // de uma pessoa na conta, abria a primeira da lista).
  const pacienteDoToque = useRef<string | null>(null);
  useEffect(() => {
    const id = pacienteDoToque.current;
    if (!id || !beneficiaries.some((b) => b.id === id)) return;
    pacienteDoToque.current = null;
    selectPatient(id);
  }, [beneficiaries, selectPatient]);
  const abrirPeloPush = useCallback(
    (payload: PushPayload) => {
      const { pacienteId, rota } = destinoDoToque(payload);
      if (pacienteId && beneficiaries.some((b) => b.id === pacienteId)) selectPatient(pacienteId);
      else if (pacienteId) pacienteDoToque.current = pacienteId;
      if (rota === '/(tabs)/alertas') void refresh();
      router.push(rota);
    },
    [beneficiaries, selectPatient, refresh, router],
  );
  usePushNotifications(Boolean(user), { onOpen: abrirPeloPush, onRegisterError: reportPushError });

  // O tutorial aparece só na primeira abertura; depois, sem conta, o login.
  const tutorialVisto = useTutorialVisto();

  // Guarda de autenticação: redireciona conforme o estado de login.
  useEffect(() => {
    if (!ready || tutorialVisto === null) return;
    // `parear` (código QR do computador, 19/10/2026) vale com e sem conta: a
    // própria tela decide para onde ir — sem conta ela não pode cair nas
    // boas-vindas, e depois de entrar mostra a confirmação antes do início.
    if (segments[0] === 'parear') return;
    const inAuth = segments[0] === '(auth)' || segments[0] === 'onboarding';
    // O cadastro (31/10/2026) abre a sessão no passo 2 e segue no passo 3 na
    // mesma tela: ela mesma leva ao início quando termina.
    const noCadastro = segments[0] === '(auth)' && (segments as string[])[1] === 'criar-conta';
    if (!user && !inAuth) router.replace(tutorialVisto ? '/(auth)/login' : '/onboarding');
    if (user && inAuth && !noCadastro) router.replace('/(tabs)');
  }, [ready, user, segments, router, tutorialVisto]);

  // Boas-vindas é a única tela sobre gradiente escuro: ícones claros na barra.
  const telaEscura = segments[0] === 'onboarding';

  return (
    // A faixa do alerta minimizado informa a altura dela; as telas e o aviso
    // de erro descem por baixo (revisão de UX de 19/10/2026: ela cobria o
    // Voltar/Fechar das telas).
    <EspacoDoTopoProvider>
      {/* A barra de navegação do Android fica escondida e só aparece quando a
          pessoa arrasta a borda de baixo (ver BarrasDoSistema). */}
      <BarrasDoSistema fundoEscuro={telaEscura || mode === 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)/login" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(auth)/criar-conta" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="frases" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paciente" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="perfil" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="relatorios" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="assinatura" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sessao/[id]" options={{ animation: 'slide_from_right' }} />
      </Stack>
      {user && <ErrorBanner />}
      {/* Por último: o alerta de emergência fica acima de tudo, inclusive dos modais. */}
      <EmergencyOverlay />
    </EspacoDoTopoProvider>
  );
}
