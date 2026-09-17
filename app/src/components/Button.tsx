import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { radius, shadows, spacing, useTheme } from '@/theme';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'accent' | 'danger' | 'ghost' | 'outline';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, size = 'md' }: Props) {
  const { colors } = useTheme();
  const gradient =
    variant === 'primary' ? [colors.primaryDeep, colors.primary] : variant === 'accent' ? colors.gradientAccent : variant === 'danger' ? colors.gradientDanger : null;
  const textTone = gradient ? 'onPrimary' : variant === 'outline' ? 'primary' : 'primary';
  const height = size === 'lg' ? 58 : 50;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptic="medium"
      style={[{ opacity: disabled ? 0.5 : 1 }, gradient && shadows.float(variant === 'danger' ? colors.danger : colors.primary), style]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {gradient ? (
        <LinearGradient colors={[gradient[0], gradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.base, { height }]}>
          <Content title={title} icon={icon} loading={loading} tone={textTone} color="#FFFFFF" />
        </LinearGradient>
      ) : (
        <View style={[styles.base, { height, backgroundColor: variant === 'ghost' ? colors.primaryTint : 'transparent', borderWidth: variant === 'outline' ? 1.5 : 0, borderColor: colors.primary }]}>
          <Content title={title} icon={icon} loading={loading} tone={textTone} color={colors.primary} />
        </View>
      )}
    </PressableScale>
  );
}

function Content({ title, icon, loading, tone, color }: { title: string; icon?: keyof typeof Ionicons.glyphMap; loading?: boolean; tone: 'onPrimary' | 'primary'; color: string }) {
  if (loading) return <ActivityIndicator color={color} />;
  return (
    <View style={styles.row}>
      {icon && <Ionicons name={icon} size={20} color={color} />}
      <Text variant="body" weight="semibold" tone={tone}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
