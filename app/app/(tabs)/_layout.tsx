import React, { useEffect } from 'react';
import { ColorValue, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from '@/components';
import { useApp } from '@/store/AppProvider';
import { motion, radius, sizes, spacing, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Ícone da aba com a "pílula" de aba ativa (padrão Material 3) e selo.
 * `badgeTone`: `primary` para o que é só novidade (mensagens não lidas),
 * `danger` reservado ao que exige ação (alertas abertos) — dois vermelhos na
 * barra faziam uma mensagem carinhosa parecer um socorro.
 */
function TabIcon({ name, active, color, badge, badgeTone = 'primary' }: { name: IconName; active: boolean; color: ColorValue; badge?: number; badgeTone?: 'primary' | 'danger' }) {
  const { colors, reduceMotion } = useTheme();
  const s = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    s.value = reduceMotion ? (active ? 1 : 0) : withSpring(active ? 1 : 0, motion.spring.slide);
  }, [active, s, reduceMotion]);
  const pill = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scaleX: 0.6 + s.value * 0.4 }] }));
  return (
    <View style={styles.icon}>
      <Animated.View style={[styles.pill, { backgroundColor: colors.primaryTint }, pill]} />
      <Ionicons name={active ? name : (`${name}-outline` as IconName)} size={sizes.icon.md} color={color} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: badgeTone === 'danger' ? colors.dangerStrong : colors.primaryStrong, borderColor: colors.tabBar }]}>
          <Text variant="badge" style={{ color: colors.onPrimary }} maxFontSizeMultiplier={1}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TabLabel({ children, focused, color }: { children: string; focused: boolean; color: ColorValue }) {
  return (
    <Text variant="tab" weight={focused ? 'bold' : 'semibold'} style={{ color: color as string }} numberOfLines={1}>
      {children}
    </Text>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { unreadCount, helpRequests } = useApp();
  const openAlerts = helpRequests.filter((h) => !h.resolved_at).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
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
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: ({ focused, color }) => <TabIcon name="home" active={focused} color={color} /> }} />
      <Tabs.Screen
        name="conversa"
        options={{
          title: 'Conversa',
          tabBarAccessibilityLabel: unreadCount ? `Conversa, ${unreadCount} ${unreadCount === 1 ? 'mensagem nova' : 'mensagens novas'}` : 'Conversa',
          tabBarIcon: ({ focused, color }) => <TabIcon name="chatbubbles" active={focused} color={color} badge={unreadCount} />,
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
      <Tabs.Screen name="relatorios" options={{ title: 'Relatórios', tabBarIcon: ({ focused, color }) => <TabIcon name="stats-chart" active={focused} color={color} /> }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: ({ focused, color }) => <TabIcon name="settings" active={focused} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { width: sizes.touch + spacing.md, height: sizes.icon.md + spacing.sm + spacing.xxs, alignItems: 'center', justifyContent: 'center' },
  pill: { ...StyleSheet.absoluteFill, borderRadius: radius.pill },
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
