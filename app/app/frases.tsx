import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Button, Card, ChoiceChips, EmptyState, IconButton, Notice, Screen, ScreenHeader, Shimmer, Text, TextField } from '@/components';
import { useData } from '@/data/DataContext';
import { QuickPhrase } from '@/data/types';
import { haptics } from '@/lib/haptics';
import { useApp } from '@/store/AppProvider';
import { radius, sizes, spacing, useEntrada, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { firstName } from '@/utils/format';

type Cat = QuickPhrase['category'];
const NOME_CAT: Record<Cat, string> = { necessidades: 'Necessidades', conforto: 'Conforto', saude: 'Saúde', social: 'Social', outra: 'Outra' };
const catIcon: Record<Cat, keyof typeof Ionicons.glyphMap> = { necessidades: 'water-outline', conforto: 'bed-outline', saude: 'medkit-outline', social: 'heart-outline', outra: 'ellipse-outline' };
const CATS = (['necessidades', 'conforto', 'saude', 'social'] as const).map((value) => ({ value, label: NOME_CAT[value], icon: catIcon[value] }));

/** Frases rápidas exibidas na tela do paciente (banco de frases do módulo Comunicação). */
export default function Frases() {
  const { colors } = useTheme();
  const router = useRouter();
  const entrada = useEntrada();
  const data = useData();
  const { patient, sendMessage } = useApp();
  const [phrases, setPhrases] = useState<QuickPhrase[] | null>(null);
  const [text, setText] = useState('');
  const [cat, setCat] = useState<Cat>('necessidades');
  const [busy, setBusy] = useState(false);
  /** Frase sendo removida agora (desabilita o botão dela). */
  const [removendo, setRemovendo] = useState<string | null>(null);
  /** Falha da última operação (adicionar, remover, carregar), mostrada na tela. */
  const [falha, setFalha] = useState<string | null>(null);
  const [falada, setFalada] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const nome = patient ? firstName(patient.user_name) : 'o paciente';

  useEffect(() => {
    if (!patient) return;
    let vivo = true;
    data
      .listQuickPhrases(patient.id)
      .then((lista) => {
        if (vivo) setPhrases(lista);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setFalha(mensagemDeErro(e, 'Não foi possível carregar as frases.'));
        setPhrases((atual) => atual ?? []);
      });
    return () => {
      vivo = false;
    };
  }, [data, patient, tentativa]);

  useEffect(() => {
    if (!falada) return;
    const t = setTimeout(() => setFalada(null), 2500);
    return () => clearTimeout(t);
  }, [falada]);

  // A falha diz o que NÃO aconteceu: a frase não chegou à tela do paciente
  // (ou, na remoção, continua lá).
  const add = async () => {
    const t = text.trim();
    if (!t || !patient || busy) return;
    setBusy(true);
    setFalha(null);
    try {
      const p = await data.saveQuickPhrase({ beneficiary_id: patient.id, text: t, category: cat, position: phrases?.length ?? 0 });
      haptics.sucesso();
      setPhrases((s) => [...(s ?? []), p]);
      setText('');
    } catch (e) {
      haptics.erro();
      setFalha(`A frase não foi adicionada: ${mensagemDeErro(e, 'falha ao falar com o servidor.')} O texto continua no campo.`);
    } finally {
      setBusy(false);
    }
  };

  const remover = async (id: string) => {
    if (removendo) return;
    setRemovendo(id);
    setFalha(null);
    try {
      await data.deleteQuickPhrase(id);
      haptics.aviso();
      setPhrases((s) => (s ?? []).filter((p) => p.id !== id));
    } catch (e) {
      setFalha(`A frase não foi removida e continua na tela de ${nome}: ${mensagemDeErro(e, 'falha ao falar com o servidor.')}`);
    } finally {
      setRemovendo(null);
    }
  };

  // Confirmação antes de remover: mão trêmula ou toque sem querer não pode
  // apagar uma frase da tela do paciente. (No web, Alert não tem botões.)
  const confirmarRemocao = (p: QuickPhrase) => {
    if (Platform.OS === 'web') return void remover(p.id);
    Alert.alert('Remover esta frase?', `“${p.text}” sai da tela de ${nome}.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => void remover(p.id) },
    ]);
  };

  const falar = (p: QuickPhrase) => {
    setFalha(null);
    sendMessage(p.text, 'frase')
      .then(() => setFalada(p.id))
      .catch((e: unknown) => setFalha(`A frase não foi falada: ${mensagemDeErro(e, 'falha ao enviar.')}`));
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Screen modal>
        <ScreenHeader onClose={() => router.back()} title="Frases rápidas" subtitle={`Aparecem na tela de ${nome}. Um olhar, e a frase é falada.`} />

        <Card>
          <TextField label="Nova frase" icon="create-outline" value={text} onChangeText={setText} placeholder="Ex.: Estou com sede" maxLength={120} onSubmitEditing={() => void add()} returnKeyType="done" />
          <Text variant="caption" tone="muted" style={styles.catLabel}>
            Tipo
          </Text>
          <ChoiceChips<Cat> value={cat} onChange={setCat} options={CATS} accessibilityLabel="Tipo da frase" />
          <Button title="Adicionar" icon="add" onPress={() => void add()} loading={busy} disabled={!text.trim()} style={styles.add} />
        </Card>

        {falha ? (
          <Notice
            tone="danger"
            text={falha}
            action={phrases?.length === 0 ? { label: 'Tentar de novo', onPress: () => setTentativa((n) => n + 1) } : undefined}
            style={styles.gapTop}
          />
        ) : null}

        <View style={styles.list}>
          {phrases === null ? (
            <>
              <Shimmer height={sizes.row} style={styles.round} />
              <Shimmer height={sizes.row} style={styles.round} />
            </>
          ) : phrases.length === 0 ? (
            <EmptyState icon="albums-outline" title="Nenhuma frase ainda" body="Frases curtas e concretas, como “Estou com sede”, são as mais fáceis de acionar com o olhar." />
          ) : (
            phrases.map((p, i) => (
              <Animated.View key={p.id} entering={entrada.cascata(i)} exiting={entrada.saida()} layout={entrada.reduzir ? undefined : LinearTransition}>
                <Card padding={spacing.md}>
                  <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: colors.primaryTint }]}>
                      <Ionicons name={catIcon[p.category]} size={sizes.icon.sm} color={colors.primary} />
                    </View>
                    <View style={styles.flex} accessible accessibilityLabel={`${p.text}. ${NOME_CAT[p.category] ?? 'Outra'}.`}>
                      <Text variant="body" weight="medium">
                        {p.text}
                      </Text>
                      <Text variant="caption" tone={falada === p.id ? 'accent' : 'muted'}>
                        {falada === p.id ? 'Enviada para ser falada' : NOME_CAT[p.category] ?? 'Outra'}
                      </Text>
                    </View>
                    <IconButton icon="volume-high-outline" variant="primary" accessibilityLabel={`Falar “${p.text}” agora`} onPress={() => falar(p)} />
                    <IconButton icon="trash-outline" accessibilityLabel={`Remover “${p.text}”`} disabled={removendo === p.id} onPress={() => confirmarRemocao(p)} />
                  </View>
                </Card>
              </Animated.View>
            ))
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapTop: { marginTop: spacing.md },
  catLabel: { marginTop: spacing.lg, marginBottom: spacing.xs },
  add: { marginTop: spacing.lg },
  list: { marginTop: spacing.xl, gap: spacing.sm },
  round: { borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs },
});
