import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button, Card, GradientHeader, ListRow, PressableScale, Screen, SectionTitle, SegmentedControl, StatusPill, Text } from '@/components';
import { DwellMs, FilterPreset, isBetaPlan, KeyboardLayout } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { fonts, radius, spacing, ThemePreference, useTheme } from '@/theme';
import { brl, formatDate, timeAgo } from '@/utils/format';

export default function Ajustes() {
  const { colors, preference, setPreference } = useTheme();
  const router = useRouter();
  const { settings, updateSettings, ensureSettings, profile, patient, plan, subscription, signOut, devices, isDemo } = useApp();
  const beta = isBetaPlan(plan, subscription);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const ensuredFor = useRef<string | null>(null);
  /** Impede duas garantias simultâneas sem bloquear tentativas futuras. */
  const ensuring = useRef(false);
  const [ensureFalha, setEnsureFalha] = useState<string | null>(null);
  const [ensureTentativa, setEnsureTentativa] = useState(0);
  const [novoContato, setNovoContato] = useState(false);
  const [nomeContato, setNomeContato] = useState('');
  const [foneContato, setFoneContato] = useState('');

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  // Primeira abertura dos Ajustes: grava a linha de ajustes do paciente com o que está na tela.
  // O computador do paciente envia o rótulo da voz por UPDATE — sem a linha, o rótulo se perde.
  //
  // A marca em `ensuredFor` só é posta DEPOIS do sucesso. Antes ela era posta
  // logo na entrada, e como é um useRef nada a limpava enquanto a tela não
  // desmontasse: a primeira falha — justamente aquilo que esta função existe
  // para evitar — ficava sem nova tentativa e o erro era descartado.
  useEffect(() => {
    if (!patient || !settings) return;
    if (ensuredFor.current === patient.id || ensuring.current) return;

    ensuring.current = true;
    let vivo = true;
    ensureSettings()
      .then(() => {
        if (!vivo) return;
        ensuredFor.current = patient.id;
        setEnsureFalha(null);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setEnsureFalha(e instanceof Error ? e.message : 'Falha ao preparar os ajustes deste paciente.');
      })
      .finally(() => {
        ensuring.current = false;
      });

    return () => {
      vivo = false;
    };
  }, [patient, settings, ensureSettings, ensureTentativa]);

  /**
   * Aplica uma mudança. Devolve `true` só quando o banco confirmou.
   *
   * Sem o `catch` (só havia `finally`) o controle voltava sozinho ao valor
   * antigo, sem explicação alguma: grave no `emergency_timeout_s`, em que o
   * cuidador saía da tela achando que tinha reduzido o tempo de espera.
   */
  const apply = async (p: Parameters<typeof updateSettings>[0]): Promise<boolean> => {
    setSaving(true);
    setFalha(null);
    try {
      await updateSettings(p);
      setSavedAt(Date.now());
      return true;
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível salvar esta mudança.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const foneLimpo = foneContato.replace(/[^\d+]/g, '');
  const contatoValido = nomeContato.trim().length > 0 && foneLimpo.length >= 8;

  const salvarContato = async () => {
    if (!contatoValido) return;
    const ok = await apply({
      emergency_contacts: [...(settings?.emergency_contacts ?? []), { name: nomeContato.trim(), phone: foneLimpo }],
    });
    // Em caso de falha o modal fica aberto com o que foi digitado, e o erro
    // aparece dentro dele — fechar aqui apagaria o trabalho do cuidador.
    if (!ok) return;
    setNovoContato(false);
    setNomeContato('');
    setFoneContato('');
  };

  const online = devices[0]?.online ?? false;

  return (
    <>
    <Screen padded={false}>
      <GradientHeader overlap={50}>
        <View style={styles.rowBetween}>
          <View>
            <Text variant="label" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {patient?.user_name ?? 'Paciente'}
            </Text>
            <Text variant="h1" tone="onPrimary">
              Ajustes
            </Text>
          </View>
          {saving ? (
            <StatusPill label="Salvando…" tone="primary" onDark />
          ) : falha ? (
            <Animated.View entering={FadeIn.duration(250)}>
              <StatusPill label="Não salvo" tone="danger" onDark />
            </Animated.View>
          ) : savedAt ? (
            <Animated.View entering={FadeIn.duration(250)}>
              <StatusPill label={online ? 'Aplicado no computador' : 'Aplica na próxima sessão'} tone="accent" onDark />
            </Animated.View>
          ) : null}
        </View>
        <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
          Ajuste remoto de parâmetros — o que você muda aqui vale na tela do paciente.
        </Text>
      </GradientHeader>

      <View style={{ paddingHorizontal: spacing.xl, marginTop: -36 }}>
        {/* A mudança não chegou ao banco. Dizer isso, em vez de deixar o
            controle voltar sozinho ao valor antigo sem explicação. */}
        {falha && (
          <Card tone="danger" style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Ionicons name="alert-circle" size={22} color={colors.danger} />
              <Text variant="bodySmall" style={{ flex: 1 }}>
                A mudança <Text variant="bodySmall" weight="bold">não</Text> foi salva: {falha} Os controles abaixo mostram o que continua valendo no computador do paciente. Toque de novo para tentar outra vez.
              </Text>
            </View>
          </Card>
        )}

        {ensureFalha && (
          <Card tone="warning" style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <Ionicons name="warning" size={22} color={colors.warning} />
              <Text variant="bodySmall" style={{ flex: 1 }}>
                Não foi possível preparar os ajustes deste paciente: {ensureFalha} Enquanto isso o rótulo da voz enviado pelo computador pode se perder.
              </Text>
              <PressableScale onPress={() => setEnsureTentativa((n) => n + 1)} hitSlop={10}>
                <Text variant="bodySmall" tone="primary" weight="semibold">
                  Tentar de novo
                </Text>
              </PressableScale>
            </View>
          </Card>
        )}

        {/* Tempo de fixação */}
        <Card index={0}>
          <Setting icon="timer-outline" title="Tempo de fixação" hint="Quanto tempo o olhar precisa ficar sobre um alvo para selecionar. Menor = mais rápido, maior = menos acionamentos acidentais." />
          <SegmentedControl<DwellMs>
            value={settings?.dwell_ms ?? 1500}
            onChange={(v) => apply({ dwell_ms: v })}
            options={[
              { value: 800, label: '800 ms', hint: 'rápido' },
              { value: 1500, label: '1500 ms', hint: 'padrão' },
              { value: 2500, label: '2500 ms', hint: 'seguro' },
            ]}
          />
        </Card>

        {/* Suavização */}
        <Card index={1} style={{ marginTop: spacing.md }}>
          <Setting icon="options-outline" title="Suavização do olhar" hint="Estável para quem tem tremor ocular residual; Responsivo para quem tem controle firme e prefere menos atraso." />
          <SegmentedControl<FilterPreset>
            value={settings?.filter_preset ?? 'balanceado'}
            onChange={(v) => apply({ filter_preset: v })}
            options={[
              { value: 'estavel', label: 'Estável' },
              { value: 'balanceado', label: 'Balanceado' },
              { value: 'responsivo', label: 'Responsivo' },
            ]}
          />
        </Card>

        {/* Teclado */}
        <Card index={2} style={{ marginTop: spacing.md }}>
          <Setting icon="keypad-outline" title="Layout do teclado" hint="Por frequência das letras do português (A, E, O, S, R, I…) reduz a distância entre teclas. QWERTY aproveita a memória de quem já digitava." />
          <SegmentedControl<KeyboardLayout>
            value={settings?.keyboard_layout ?? 'frequencia'}
            onChange={(v) => apply({ keyboard_layout: v })}
            options={[
              { value: 'frequencia', label: 'Frequência' },
              { value: 'alfabetico', label: 'A–Z' },
              { value: 'qwerty', label: 'QWERTY' },
            ]}
          />
        </Card>

        {/* Sensibilidade */}
        <Card index={3} style={{ marginTop: spacing.md }}>
          <Setting icon="speedometer-outline" title="Sensibilidade" hint={`Nível ${settings?.sensitivity ?? 5} de 10`} />
          <View style={styles.sens}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const active = n <= (settings?.sensitivity ?? 5);
              return (
                <PressableScale key={n} onPress={() => apply({ sensitivity: n })} style={[styles.sensDot, { backgroundColor: active ? colors.primary : colors.surfaceAlt, height: 14 + n * 2.2 }]} accessibilityLabel={`Sensibilidade ${n}`} />
              );
            })}
          </View>
        </Card>

        {/* Emergência */}
        <SectionTitle title="Emergência" />
        <Card index={4} padding={spacing.sm}>
          {/* Este valor é lido pela função agendada do servidor: passado o prazo
              sem confirmação, ela marca o pedido como escalado, avisa na conversa
              e reenvia o push a todos os celulares da conta. Ela não telefona. */}
          <ListRow icon="hourglass-outline" title="Prazo para responder" subtitle={`${settings?.emergency_timeout_s ?? 45} s. Sem confirmação nesse prazo, o servidor reenvia o alerta a todos os celulares — ligar continua sendo com você`} tone="warning" right={<Stepper value={settings?.emergency_timeout_s ?? 45} step={15} min={15} max={300} onChange={(v) => apply({ emergency_timeout_s: v })} />} />
          {(settings?.emergency_contacts ?? []).map((c) => (
            <ListRow key={c.phone} icon="call-outline" title={c.name} subtitle={c.phone} tone="danger" onPress={() => Linking.openURL(`tel:${c.phone}`)} />
          ))}
          {/* `Alert.prompt` só existe no iOS. No Android o caminho alternativo
              mandava o usuário "para a tela do paciente ou o site" — e o site
              não tem essa tela, então não havia como cadastrar contato nenhum.
              O modal abaixo funciona nas duas plataformas. */}
          <ListRow
            icon="person-add-outline"
            title="Adicionar contato"
            subtitle="Fica a um toque de distância no alerta de socorro"
            tone="muted"
            last
            onPress={() => {
              setFalha(null);
              setNovoContato(true);
            }}
          />
        </Card>

        {/* Paciente e frases */}
        <SectionTitle title="Paciente" />
        <Card index={5} padding={spacing.sm}>
          <ListRow icon="person-circle-outline" title={patient?.user_name ?? '—'} subtitle="Perfil e computador pareado" onPress={() => router.push('/paciente')} />
          <ListRow icon="albums-outline" title="Frases rápidas" subtitle="Edite o que aparece na tela do paciente" tone="accent" onPress={() => router.push('/frases')} />
          <ListRow icon="mic-outline" title="Voz" subtitle={settings?.voice ?? 'pt-BR padrão'} tone="muted" last />
        </Card>

        {/* Conta */}
        <SectionTitle title="Conta" />
        <Card index={6} padding={spacing.sm}>
          <ListRow
            icon={beta ? 'flask-outline' : 'card-outline'}
            title={beta ? 'Programa beta' : plan ? `Plano ${plan.name}` : 'Sem assinatura'}
            subtitle={beta && subscription ? `acesso até ${formatDate(subscription.next_charge_at)} · sem cobrança` : subscription ? `${brl(subscription.price_brl)}/mês · ${subscription.status === 'avaliacao' ? 'período de avaliação' : subscription.status}` : ''}
            onPress={() => router.push('/assinatura')}
          />
          <ListRow icon="mail-outline" title={profile?.buyer_name ?? '—'} subtitle={profile?.email} tone="muted" />
          <ListRow icon="desktop-outline" title={devices[0]?.name ?? 'Nenhum computador'} subtitle={devices[0] ? `IrisFlow Communicator ${devices[0].app_version} · visto ${timeAgo(devices[0].last_seen_at)}` : 'Abra o IrisFlow Communicator no computador do paciente e entre com a conta criada no site'} tone={online ? 'accent' : 'muted'} last />
        </Card>

        {/* Aparência */}
        <SectionTitle title="Aparência" />
        <Card index={7}>
          <SegmentedControl<ThemePreference>
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: 'Sistema' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Escuro' },
            ]}
          />
        </Card>

        <SectionTitle title="Privacidade" />
        <Card index={8} tone="primary">
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
            <Text variant="bodySmall" style={{ flex: 1 }}>
              Os quadros da câmera, a posição da íris e os coeficientes de calibração ficam exclusivamente no computador do paciente. Este app recebe apenas mensagens, alertas e métricas agregadas. Consentimento e retenção seguem a LGPD.
            </Text>
          </View>
        </Card>

        <PressableScale onPress={() => Alert.alert('Sair', 'Deseja sair da conta?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: () => signOut() }])} style={[styles.logout, { borderColor: colors.border }]}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text variant="body" tone="danger" weight="semibold">
            Sair da conta
          </Text>
        </PressableScale>
        <Text variant="caption" tone="muted" center style={{ marginTop: spacing.md }}>
          IrisFlow Cuidador 1.0.0 {isDemo ? '· modo demonstração' : ''}
        </Text>
      </View>
    </Screen>

    <Modal visible={novoContato} transparent animationType="fade" onRequestClose={() => setNovoContato(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text variant="h3">Novo contato de emergência</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            Ele aparece a um toque de distância no alerta de socorro. Quem liga é você: o app não chama ninguém sozinho.
          </Text>

          <TextInput
            style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
            placeholder="Nome (ex.: Lucas, filho)"
            placeholderTextColor={colors.textMuted}
            value={nomeContato}
            onChangeText={setNomeContato}
            autoFocus
            returnKeyType="next"
          />
          <TextInput
            style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
            placeholder="Telefone (ex.: 11912345678)"
            placeholderTextColor={colors.textMuted}
            value={foneContato}
            onChangeText={setFoneContato}
            keyboardType="phone-pad"
            returnKeyType="done"
            onSubmitEditing={() => void salvarContato()}
          />

          {falha && (
            <Text variant="caption" tone="danger" style={{ marginTop: spacing.sm }}>
              Não foi salvo: {falha}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancelar" variant="outline" onPress={() => setNovoContato(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Salvar" loading={saving} disabled={!contatoValido} onPress={() => void salvarContato()} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

function Setting({ icon, title, hint }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <Text variant="h3">{title}</Text>
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
        {hint}
      </Text>
    </View>
  );
}

function Stepper({ value, step, min, max, onChange }: { value: number; step: number; min: number; max: number; onChange: (v: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepper}>
      <PressableScale onPress={() => onChange(Math.max(min, value - step))} style={[styles.stepBtn, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel="Diminuir">
        <Ionicons name="remove" size={18} color={colors.text} />
      </PressableScale>
      <PressableScale onPress={() => onChange(Math.min(max, value + step))} style={[styles.stepBtn, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel="Aumentar">
        <Ionicons name="add" size={18} color={colors.text} />
      </PressableScale>
    </View>
  );
}

/** mantido para uso futuro (ex.: alternar notificações) */
export function ToggleRow({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#FFF" />;
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sens: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 40 },
  sensDot: { flex: 1, borderRadius: 4 },
  stepper: { flexDirection: 'row', gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.xxl },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: spacing.xl },
  modalCard: { borderRadius: radius.lg, padding: spacing.xl },
  modalInput: { height: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 16, fontFamily: fonts.regular, borderWidth: 1, marginTop: spacing.md },
});
