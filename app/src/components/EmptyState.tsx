import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from './Text';
import { spacing, useTheme } from '@/theme';

export function EmptyState({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: colors.primaryTint }]}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text variant="h3" center style={{ marginTop: spacing.md }}>
        {title}
      </Text>
      <Text variant="bodySmall" tone="muted" center style={{ marginTop: spacing.xs, maxWidth: 300 }}>
        {body}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  icon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
});
