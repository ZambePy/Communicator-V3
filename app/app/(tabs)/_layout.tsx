import React, { useEffect } from 'react';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from '@/components';
import { useApp } from '@/store/AppProvider';
import { fonts, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, active, color, badge }: { name: IconName; active: boolean; color: ColorValue; badge?: number }) {
  const { colors } = useTheme();
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withSpring(active ? 1.12 : 1, { damping: 12 });
  }, [active, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.icon, st]}>
      {active && <View style={[styles.activeBg, { backgroundColor: colors.primaryTint }]} />}
      <Ionicons name={active ? name : (`${name}-outline` as IconName)} size={24} color={color} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
          <Text variant="caption" weight="bold" style={{ color: '#FFF', fontSize: 10, lineHeight: 12 }}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { colors, mode } = useTheme();
  const { unreadCount, helpRequests } = useApp();
  const openAlerts = helpRequests.filter((h) => !h.resolved_at).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, marginTop: 2 },
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.tabBar,
          height: Platform.OS === 'ios' ? 88 : 70,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarBackground: () => (Platform.OS === 'ios' ? <BlurView intensity={70} tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: ({ focused, color }) => <TabIcon name="home" active={focused} color={color} /> }} />
      <Tabs.Screen name="conversa" options={{ title: 'Conversa', tabBarIcon: ({ focused, color }) => <TabIcon name="chatbubbles" active={focused} color={color} badge={unreadCount} /> }} />
      <Tabs.Screen name="alertas" options={{ title: 'Alertas', tabBarIcon: ({ focused, color }) => <TabIcon name="notifications" active={focused} color={color} badge={openAlerts} /> }} />
      <Tabs.Screen name="relatorios" options={{ title: 'Relatórios', tabBarIcon: ({ focused, color }) => <TabIcon name="stats-chart" active={focused} color={color} /> }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: ({ focused, color }) => <TabIcon name="options" active={focused} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { width: 44, height: 32, alignItems: 'center', justifyContent: 'center' },
  activeBg: { position: 'absolute', width: 44, height: 32, borderRadius: 12 },
  badge: { position: 'absolute', top: -2, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
