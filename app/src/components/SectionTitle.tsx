import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { spacing } from '@/theme';

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <Text variant="h3">{title}</Text>
      {action && (
        <PressableScale onPress={onAction} hitSlop={10}>
          <Text variant="bodySmall" tone="primary" weight="semibold">
            {action}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
});
