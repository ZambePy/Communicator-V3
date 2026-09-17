import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import { Button, Card, GradientHeader, PressableScale, Screen, SegmentedControl, Text } from '@/components';
import { useData } from '@/data/DataContext';
import { QuickPhrase } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { fonts, radius, spacing, useTheme } from '@/theme';

type Cat = QuickPhrase['category'];
const CATS: { value: Cat; label: string }[] = [
  { value: 'necessidades', label: 'Necessidades' },
  { value: 'conforto', label: 'Conforto' },
  { value: 'saude', label: 'Saúde' },
  { value: 'social', label: 'Social' },
];
const catIcon: Record<Cat, keyof typeof Ionicons.glyphMap> = { necessidades: 'water-outline', conforto: 'bed-outline', saude: 'medkit-outline', social: 'heart-outline', outra: 'ellipse-outline' };

/** Frases rápidas exibidas na tela do paciente (banco de frases do módulo Comunicação). */
export default function Frases() {
  const { colors } = useTheme();
  const router = useRouter();
  const data = useData();
  const { patient, sendMessage } = useApp();
  const [phrases, setPhrases] = useState<QuickPhrase[]>([]);
  const [text, setText] = useState('');
  const [cat, setCat] = useState<Cat>('necessidades');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (patient) data.listQuickPhrases(patient.id).then(setPhrases);
  }, [data, patient]);

  const add = async () => {
    const t = text.trim();
    if (!t || !patient) return;
    setBusy(true);
    try {
      const p = await data.saveQuickPhrase({ beneficiary_id: patient.id, text: t, category: cat, position: phrases.length });
      setPhrases((s) => [...s, p]);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await data.deleteQuickPhrase(id);
    setPhrases((s) => s.filter((p) => p.id !== id));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen padded={false} keyboardShouldPersistTaps="handled">
        <GradientHeader overlap={50}>
          <PressableScale onPress={() => router.back()} hitSlop={12} style={{ alignSelf: 'flex-start', marginBottom: spacing.md }}>
            <Ionicons name="close" size={26} color="#FFF" />
          </PressableScale>
          <Text variant="h1" tone="onPrimary">
            Frases rápidas
          </Text>
          <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
            Aparecem como alvos grandes na tela de {patient?.user_name ?? 'paciente'}. Uma fixação e a frase é falada.
          </Text>
        </GradientHeader>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: -36 }}>
          <Card index={0}>
            <Text variant="label" tone="muted">
              Nova frase
            </Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, color: colors.text }]} value={text} onChangeText={setText} placeholder="Ex.: Quero ver a Mariana" placeholderTextColor={colors.textMuted} maxLength={120} onSubmitEditing={add} returnKeyType="done" />
            <View style={{ marginTop: spacing.md }}>
              <SegmentedControl<Cat> value={cat} onChange={setCat} options={CATS} />
            </View>
            <Button title="Adicionar à tela do paciente" icon="add-circle-outline" onPress={add} loading={busy} disabled={!text.trim()} style={{ marginTop: spacing.md }} />
          </Card>

          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            {phrases.map((p, i) => (
              <Animated.View key={p.id} entering={FadeInDown.delay(i * 40).duration(320)} exiting={FadeOutLeft.duration(250)} layout={LinearTransition.springify()}>
                <Card animated={false} padding={spacing.md}>
                  <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: colors.primaryTint }]}>
                      <Ionicons name={catIcon[p.category]} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="body" weight="medium">
                        {p.text}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {CATS.find((c) => c.value === p.category)?.label ?? 'Outra'}
                      </Text>
                    </View>
                    <PressableScale onPress={() => sendMessage(p.text, 'frase')} style={[styles.miniBtn, { backgroundColor: colors.accentTint }]} accessibilityLabel="Falar agora">
                      <Ionicons name="volume-high-outline" size={18} color={colors.accentDeep} />
                    </PressableScale>
                    <PressableScale onPress={() => remove(p.id)} style={[styles.miniBtn, { backgroundColor: colors.dangerTint }]} accessibilityLabel="Remover">
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </PressableScale>
                  </View>
                </Card>
              </Animated.View>
            ))}
          </View>
          <Text variant="caption" tone="muted" center style={{ marginTop: spacing.xl }}>
            Dica: frases curtas e concretas (“Estou com sede”) são mais fáceis de acionar por fixação que frases longas.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { height: 54, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 16, fontFamily: fonts.regular, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  miniBtn: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
