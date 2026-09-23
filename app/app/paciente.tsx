import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Card, EmptyState, ListRow, Notice, Screen, ScreenHeader, SectionTitle, StatusPill, Text } from '@/components';
import { useApp } from '@/store/AppProvider';
import { sizes, spacing, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { conditionLabel, firstName, relationLabel, timeAgo } from '@/utils/format';

export default function Paciente() {
  const { colors } = useTheme();
  const router = useRouter();
  const { patient, beneficiaries, selectPatient, devices, can, revokeDevice } = useApp();
  const [falha, setFalha] = useState<string | null>(null);
  const nome = patient ? firstName(patient.user_name) : 'o paciente';

  const desvincular = (id: string) => {
    setFalha(null);
    revokeDevice(id).catch((e: unknown) => setFalha(mensagemDeErro(e, 'Não foi possível desvincular agora.')));
  };

  const confirmarDesvinculo = (id: string, name: string) => {
    const texto = `${name} deixa de enviar sessões e mensagens. Para voltar, é só entrar de novo no IrisFlow do computador com esta conta.`;
    if (Platform.OS === 'web') return desvincular(id);
    Alert.alert('Desvincular este computador?', texto, [
      { text: 'Manter', style: 'cancel' },
      { text: 'Desvincular', style: 'destructive', onPress: () => desvincular(id) },
    ]);
  };

  const ativos = devices.filter((d) => !d.revoked_at);
  const detalhes = patient ? [relationLabel[patient.relation], conditionLabel[patient.condition]].filter(Boolean).join(' · ') : '';

  return (
    <Screen modal>
      <ScreenHeader onClose={() => router.back()} />

      <View style={styles.hero}>
        <Avatar name={patient?.user_name} size="lg" />
        <Text variant="h2" center accessibilityRole="header">
          {patient?.user_name ?? 'Paciente'}
        </Text>
        {detalhes ? (
          <Text variant="bodySmall" tone="muted" center>
            {detalhes}
          </Text>
        ) : null}
      </View>

      {beneficiaries.length > 1 && (
        <>
          <SectionTitle title="Quem você acompanha" />
          <Card padding={0}>
            {beneficiaries.map((b, i) => {
              const atual = b.id === patient?.id;
              return (
                <ListRow
                  key={b.id}
                  icon="person-outline"
                  title={b.user_name}
                  subtitle={relationLabel[b.relation]}
                  onPress={() => selectPatient(b.id)}
                  right={<Ionicons name={atual ? 'radio-button-on' : 'radio-button-off'} size={sizes.icon.md} color={atual ? colors.primary : colors.textMuted} />}
                  accessibilityHint={atual ? 'Selecionado' : 'Toque para acompanhar'}
                  last={i === beneficiaries.length - 1}
                />
              );
            })}
          </Card>
        </>
      )}

      <SectionTitle title="Detalhes" />
      <Card padding={0}>
        <ListRow icon="medical-outline" title="Profissional que acompanha" subtitle={patient?.prescriber_name ? `${patient.prescriber_name}${patient.prescriber_role ? ` · ${patient.prescriber_role}` : ''}` : 'Não informado'} tone="accent" />
        <ListRow icon="laptop-outline" title="Sistema do computador" subtitle={!patient || patient.os === 'nao-sei' ? 'Não informado' : patient.os === 'macos' ? 'macOS' : patient.os === 'windows' ? 'Windows' : 'Linux'} tone="muted" last />
      </Card>

      <SectionTitle title="Computadores" />
      {falha ? <Notice tone="danger" title="Não foi possível desvincular" text={falha} style={styles.notice} /> : null}
      {devices.length === 0 ? (
        <Card>
          <EmptyState icon="desktop-outline" title="Nenhum computador ainda" body={`No computador de ${nome}, abra o IrisFlow e entre com esta mesma conta. O vínculo é automático.`} compact />
        </Card>
      ) : (
        <Card padding={0}>
          {devices.map((d, i) => (
            <ListRow
              key={d.id}
              icon={d.revoked_at ? 'close-circle-outline' : 'desktop-outline'}
              title={d.name}
              subtitle={d.revoked_at ? `Desvinculado ${timeAgo(d.revoked_at)}` : `${d.app_version ? `Versão ${d.app_version} · ` : ''}${d.online ? 'ligado agora' : `visto ${timeAgo(d.last_seen_at)}`}`}
              tone={d.revoked_at ? 'muted' : d.online ? 'accent' : 'muted'}
              onPress={d.revoked_at ? undefined : () => confirmarDesvinculo(d.id, d.name)}
              accessibilityHint={d.revoked_at ? undefined : 'Toque para desvincular'}
              right={<StatusPill label={d.revoked_at ? 'Removido' : d.online ? 'Ligado' : 'Desligado'} tone={d.revoked_at ? 'muted' : d.online ? 'accent' : 'muted'} live={d.online} />}
              last={i === devices.length - 1}
            />
          ))}
        </Card>
      )}
      {ativos.length > 0 ? (
        <Text variant="caption" tone="muted" style={styles.hint}>
          Toque num computador para desvinculá-lo.
          {!can('multiplos_dispositivos') ? ' No plano Essencial, entrar em outro computador desvincula o anterior.' : ''}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  notice: { marginBottom: spacing.md },
  hint: { marginTop: spacing.sm, paddingHorizontal: spacing.xs },
});
