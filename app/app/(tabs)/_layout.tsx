import React, { useEffect, useRef } from 'react';
import { ColorValue, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components';
import { useApp } from '@/store/AppProvider';
import { SemPaciente } from '@/features/SemPaciente';
import { motion, radius, sizes, spacing, useReduceMotion, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Ícone da aba e selo. A aba ativa se marca pelo ícone cheio e pelo rótulo na
 * cor de ação — sem a "pílula" atrás do ícone (19/10/2026): era o padrão do
 * Material 3 copiado sem motivo, e somava um terceiro sinal ao mesmo estado.
 * `badgeTone`: `primary` para o que é só novidade (mensagens não lidas),
 * `danger` reservado ao que exige ação (alertas abertos) — dois vermelhos na
 * barra faziam uma mensagem carinhosa parecer um socorro.
 */
function TabIcon({ name, active, color, badge, badgeTone = 'primary' }: { name: IconName; active: boolean; color: ColorValue; badge?: number; badgeTone?: 'primary' | 'danger' }) {
  const { colors } = useTheme();
  const reduzir = useReduceMotion();
  // A troca de aba em si não anima (são telas irmãs, usadas dezenas de vezes
  // por dia); só o ícone escolhido dá um pequeno salto, e o selo novo, um pulso.
  const escala = useSharedValue(1);
  const selo = useSharedValue(1);
  const antes = useRef(active);
  const seloAntes = useRef(badge ?? 0);
  useEffect(() => {
    if (!reduzir && active && !antes.current) escala.value = withSequence(withTiming(0.86, { duration: motion.duration.press }), withSpring(1, motion.spring.pop));
    antes.current = active;
  }, [active, reduzir, escala]);
  useEffect(() => {
    if (!reduzir && (badge ?? 0) > seloAntes.current) selo.value = withSequence(withTiming(1.25, { duration: motion.duration.press }), withSpring(1, motion.spring.pop));
    seloAntes.current = badge ?? 0;
  }, [badge, reduzir, selo]);
  const estiloDoIcone = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));
  const estiloDoSelo = useAnimatedStyle(() => ({ transform: [{ scale: selo.value }] }));
  return (
    <View style={styles.icon}>
      <Animated.View style={estiloDoIcone}>
        <Ionicons name={active ? name : (`${name}-outline` as IconName)} size={sizes.icon.lg - 2} color={color} />
      </Animated.View>
      {badge ? (
        <Animated.View style={[styles.badge, { backgroundColor: badgeTone === 'danger' ? colors.danger : colors.selected, borderColor: colors.tabBar }, estiloDoSelo]}>
          <Text variant="badge" style={{ color: badgeTone === 'danger' ? colors.background : colors.onSelected }} maxFontSizeMultiplier={1}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Rótulo da aba. Cinco rótulos numa barra de 320 dp (ou com a fonte do
 * sistema grande) eram cortados — "Conve…", "Relató…": o texto encolhe até
 * caber (até 70%). O nome acessível da aba continua completo.
 */
function TabLabel({ children, focused, color }: { children: string; focused: boolean; color: ColorValue }) {
  return (
    <Text variant="tab" weight={focused ? 'bold' : 'semibold'} style={{ color: color as string }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      {children}
    </Text>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { unreadCount, helpRequests, accountLoaded, beneficiaries } = useApp();
  const openAlerts = helpRequests.filter((h) => !h.resolved_at).length;

  // Conta carregada e sem paciente: nada nas abas teria o que mostrar.
  if (accountLoaded && beneficiaries.length === 0) return <SemPaciente />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabel: ({ children, focused, color }) => <TabLabel focused={focused} color={color}>{children}</TabLabel>,
        // A barra não flutua sobre o conteúdo: nada fica escondido atrás dela,
        // e a altura soma a área segura (barra de gestos do Android, iPhone).
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: sizes.hairline,
          height: sizes.tabBar + insets.bottom,
          paddingTop: spacing.xs,
          paddingBottom: insets.bottom + spacing.xs,
          elevation: 0,
        },
        tabBarItemStyle: { minHeight: sizes.touch },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Quatro abas (31/10/2026). Relatórios saiu da barra: abre pelo Início ("Ver relatórios"), rota /relatorios. */}
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: ({ focused, color }) => <TabIcon name="home" active={focused} color={color} /> }} />
      <Tabs.Screen
        name="conversa"
        options={{
          title: 'Conversa',
          tabBarAccessibilityLabel: unreadCount ? `Conversa, ${unreadCount} ${unreadCount === 1 ? 'mensagem nova' : 'mensagens novas'}` : 'Conversa',
          tabBarIcon: ({ focused, color }) => <TabIcon name="chatbox" active={focused} color={color} badge={unreadCount} />,
        }}
      />
      <Tabs.Screen
        name="alertas"
        options={{
          title: 'Alertas',
          tabBarAccessibilityLabel: openAlerts ? `Alertas, ${openAlerts} ${openAlerts === 1 ? 'aberto' : 'abertos'}` : 'Alertas',
          tabBarIcon: ({ focused, color }) => <TabIcon name="notifications" active={focused} color={color} badge={openAlerts} badgeTone="danger" />,
        }}
      />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: ({ focused, color }) => <TabIcon name="settings" active={focused} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { width: sizes.touch + spacing.md, height: sizes.icon.md + spacing.sm + spacing.xxs, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -spacing.xs,
    right: spacing.xs,
    minWidth: sizes.badge,
    height: sizes.badge,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: sizes.borderThick,
  },
});
