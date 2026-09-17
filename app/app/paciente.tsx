import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, GradientHeader, ListRow, PressableScale, Screen, SectionTitle, StatusPill, Text } from '@/components';
import { useApp } from '@/store/AppProvider';
import { radius, spacing, useTheme } from '@/theme';
import { conditionLabel, initials, relationLabel, timeAgo } from '@/utils/format';

export default function Paciente() {
  const { colors } = useTheme();
  const router = useRouter();
  const { patient, beneficiaries, selectPatient, devices, can, revokeDevice } = useApp();

  const confirmarDesvinculo = (id: string, name: string) => {
    Alert.alert(
      'Desvincular computador?',
      `${name} deixará de enviar sessões e mensagens. Para voltar, basta entrar de novo no aplicativo com o e-mail e a senha da conta criada no site.`,
      [
        { text: 'Manter', style: 'cancel' },
        { text: 'Desvincular', style: 'destructive', onPress: () => revokeDevice(id).catch((e) => Alert.alert('Não foi possível', (e as Error).message)) },
      ],
    );
  };

  return (
    <Screen padded={false}>
      <GradientHeader overlap={60}>
        <PressableScale onPress={() => router.back()} hitSlop={12} style={{ alignSelf: 'flex-start', marginBottom: spacing.md }}>
          <Ionicons name="close" size={26} color="#FFF" />
        </PressableScale>
        <View style={{ alignItems: 'center' }}>
          <View style={styles.avatar}>
            <Text variant="h1" tone="onPrimary">
              {patient ? initials(patient.user_name) : '·'}
            </Text>
          </View>
          <Text variant="h1" tone="onPrimary" style={{ marginTop: spacing.md }}>
            {patient?.user_name ?? 'Paciente'}
          </Text>
          <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {patient ? `${relationLabel[patient.relation]} · ${conditionLabel[patient.condition]}` : ''}
          </Text>
        </View>
      </GradientHeader>

      <View style={{ paddingHorizontal: spacing.xl, marginTop: -46 }}>
        {beneficiaries.length > 1 && (
          <>
            <Card index={0} padding={spacing.sm}>
              {beneficiaries.map((b, i) => (
                <ListRow key={b.id} icon="person-outline" title={b.user_name} subtitle={relationLabel[b.relation]} onPress={() => selectPatient(b.id)} right={<Ionicons name={b.id === patient?.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.primary} />} last={i === beneficiaries.length - 1} />
              ))}
            </Card>
            <SectionTitle title="Detalhes" />
          </>
        )}

        <Card index={1} padding={spacing.sm}>
          <ListRow icon="medical-outline" title="Profissional que acompanha" subtitle={patient?.prescriber_name ? `${patient.prescriber_name}${patient.prescriber_role ? ' · ' + patient.prescriber_role : ''}` : 'Não informado'} tone="accent" />
          <ListRow icon="laptop-outline" title="Sistema do computador" subtitle={patient?.os === 'nao-sei' ? 'Não informado' : (patient?.os ?? '').toUpperCase()} tone="muted" last />
        </Card>

        <SectionTitle title="Computadores pareados" />
        <Card index={2} padding={spacing.sm}>
          {devices.length === 0 ? (
            <ListRow icon="desktop-outline" title="Nenhum computador" subtitle="No computador do paciente, abra o IrisFlow Communicator e entre com o e-mail e a senha da conta criada no site. O vínculo é automático." tone="muted" last />
          ) : (
            devices.map((d, i) => (
              <ListRow
                key={d.id}
                icon={d.revoked_at ? 'close-circle-outline' : 'desktop-outline'}
                title={d.name}
                subtitle={
                  d.revoked_at
                    ? `Desvinculado ${timeAgo(d.revoked_at)}`
                    : `${d.os.toUpperCase()} · IrisFlow Communicator ${d.app_version || '—'} · ${d.online ? 'conectado' : 'visto ' + timeAgo(d.last_seen_at)}`
                }
                tone={d.revoked_at ? 'muted' : d.online ? 'accent' : 'muted'}
                onPress={d.revoked_at ? undefined : () => confirmarDesvinculo(d.id, d.name)}
                right={<StatusPill label={d.revoked_at ? 'Removido' : d.online ? 'Online' : 'Offline'} tone={d.revoked_at ? 'muted' : d.online ? 'accent' : 'muted'} live={d.online} />}
                last={i === devices.length - 1}
              />
            ))
          )}
        </Card>
        {!can('multiplos_dispositivos') && (
          <Text variant="caption" tone="muted" center style={{ marginTop: spacing.md }}>
            O plano Essencial contempla 1 computador ativo por vez: entrar em outro desvincula o anterior. Completo e Voz não têm esse limite.
          </Text>
        )}
        {devices.some((d) => !d.revoked_at) && (
          <Text variant="caption" tone="muted" center style={{ marginTop: spacing.sm }}>
            Toque em um computador para desvinculá-lo.
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  pill: { borderRadius: radius.pill },
});
