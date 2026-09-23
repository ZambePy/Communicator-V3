import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, IconButton, ListRow, Notice, PressableScale, Screen, ScreenHeader, SectionTitle, SegmentedControl, StatusPill, Text, TextField } from '@/components';
import { DwellMs, FilterPreset, isBetaPlan, KeyboardLayout } from '@/data/types';
import { buildInfo } from '@/lib/buildInfo';
import { legalLinks } from '@/lib/config';
import { haptics } from '@/lib/haptics';
import { useApp } from '@/store/AppProvider';
import { layout, opacity, radius, sizes, spacing, ThemePreference, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { brl, firstName, formatDate, timeAgo } from '@/utils/format';

/** Abre um link externo sem derrubar a tela se não houver navegador/e-mail. */
function abrirLink(url: string, alternativa?: string) {
  Linking.openURL(url).catch(() => {
    if (alternativa) Linking.openURL(alternativa).catch(() => undefined);
    else Alert.alert('Não foi possível abrir', url);
  });
}

export default function Ajustes() {
  const { colors, preference, setPreference } = useTheme();
  const router = useRouter();
  const { settings, updateSettings, profile, patient, plan, subscription, signOut, devices, patientLoaded } = useApp();
  const beta = isBetaPlan(plan, subscription);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [novoContato, setNovoContato] = useState(false);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  /**
   * Sem linha em `patient_settings` NADA é criado por conta própria: se a
   * primeira abertura desta tela gravasse os padrões do app, o computador do
   * paciente — que assina a tabela — aplicaria esses padrões por cima do que
   * estava configurado localmente. A linha nasce só quando o cuidador salva um
   * ajuste, e só com o campo que ele mudou (upsert parcial). Linha existente com
   * os dois campos que o computador aplica (fixação e suavização) vazios conta
   * como "ainda não sincronizado" também: os controles aparecem sem seleção.
   * Teclado e sensibilidade não entram na conta: o computador ainda não os lê.
   */
  const semLinha = patientLoaded && (!settings || (settings.dwell_ms == null && settings.filter_preset == null));
  const nome = patient ? firstName(patient.user_name) : 'o paciente';
  const device = devices.find((d) => !d.revoked_at);
  const online = device?.online ?? false;

  /**
   * Aplica uma mudança. Devolve `true` só quando o banco confirmou; na falha o
   * controle volta ao valor anterior (AppProvider) E a tela explica o porquê.
   */
  const apply = async (p: Parameters<typeof updateSettings>[0]): Promise<boolean> => {
    setSaving(true);
    setFalha(null);
    try {
      await updateSettings(p);
      setSavedAt(Date.now());
      return true;
    } catch (e) {
      haptics.erro();
      setFalha(mensagemDeErro(e, 'Não foi possível salvar esta mudança.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const status = saving ? (
    <StatusPill label="Salvando…" tone="primary" />
  ) : falha ? (
    <StatusPill label="Não salvo" tone="danger" />
  ) : savedAt ? (
    <StatusPill label={online ? 'Aplicado' : 'Salvo'} tone="accent" />
  ) : undefined;

  const sair = () =>
    Alert.alert('Sair da conta?', 'Este celular deixa de receber os alertas desta conta.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void signOut() },
    ]);

  const excluir = () =>
    Alert.alert(
      'Excluir conta e dados',
      'Apagamos dos nossos servidores a conta, o paciente vinculado, as mensagens, os alertas e os ajustes. O que ficou no computador do paciente sai ao desinstalar o IrisFlow Communicator. Vamos abrir um e-mail já preenchido para a equipe; a confirmação chega em até 15 dias.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Escrever e-mail',
          style: 'destructive',
          onPress: () =>
            abrirLink(
              `mailto:${legalLinks.supportEmail}?subject=${encodeURIComponent('Excluir minha conta IrisFlow')}&body=${encodeURIComponent(`Quero excluir minha conta IrisFlow e todos os dados dela.\n\nE-mail da conta: ${profile?.email ?? ''}`)}`,
              legalLinks.accountDeletion,
            ),
        },
      ],
    );

  return (
    <>
      <Screen>
        <ScreenHeader eyebrow={patient?.user_name} title="Ajustes" right={status} />

        {/* A mudança não chegou ao banco: dizer isso, em vez de deixar o
            controle voltar sozinho ao valor antigo sem explicação. */}
        {falha ? <Notice tone="danger" title="Mudança não salva" text={`${falha} Os controles mostram o que continua valendo. Toque de novo para tentar.`} style={styles.notice} /> : null}
        {semLinha ? (
          <Notice tone="info" icon="cloud-outline" title="Ainda não sincronizado" text={`O computador de ${nome} usa os próprios ajustes. O que você mudar aqui passa a valer lá — só o que mudar.`} style={styles.notice} />
        ) : null}

        <SectionTitle title={`Computador de ${nome}`} first />
        <View style={styles.stack}>
          <Card>
            <Setting icon="timer-outline" title="Tempo de fixação" hint="Quanto tempo o olhar fica no alvo para selecionar." />
            <SegmentedControl<DwellMs>
              value={settings?.dwell_ms ?? null}
              onChange={(v) => void apply({ dwell_ms: v })}
              accessibilityLabel="Tempo de fixação"
              options={[
                { value: 800, label: '800 ms', hint: 'rápido', accessibilityLabel: '800 milissegundos' },
                { value: 1500, label: '1500 ms', hint: 'padrão', accessibilityLabel: '1500 milissegundos' },
                { value: 2500, label: '2500 ms', hint: 'seguro', accessibilityLabel: '2500 milissegundos' },
              ]}
            />
          </Card>

          <Card>
            <Setting icon="pulse-outline" title="Suavização do olhar" hint="Estável ajuda com tremor; responsivo, com controle firme." />
            <SegmentedControl<FilterPreset>
              value={settings?.filter_preset ?? null}
              onChange={(v) => void apply({ filter_preset: v })}
              accessibilityLabel="Suavização do olhar"
              options={[
                { value: 'estavel', label: 'Estável' },
                { value: 'balanceado', label: 'Balanceado' },
                { value: 'responsivo', label: 'Responsivo' },
              ]}
            />
          </Card>

          {/* Teclado e sensibilidade: o campo existe em patient_settings, mas o
              computador ainda não aplica nenhum dos dois. Mostrados desligados,
              com "Em breve", em vez de fingir que um toque aqui muda algo lá. */}
          <Card>
            <Setting icon="keypad-outline" title="Teclado" hint="O computador ainda não aplica este ajuste; o teclado segue como está configurado lá." emBreve />
            <SegmentedControl<KeyboardLayout>
              value={null}
              onChange={() => undefined}
              disabled
              accessibilityLabel="Layout do teclado, em breve"
              options={[
                { value: 'frequencia', label: 'Frequência' },
                { value: 'alfabetico', label: 'A–Z', accessibilityLabel: 'Alfabético' },
                { value: 'qwerty', label: 'QWERTY' },
              ]}
            />
          </Card>

          <Card>
            <Setting icon="speedometer-outline" title="Sensibilidade" hint="O computador ainda não aplica este ajuste." emBreve />
            {/* Dez níveis em duas fileiras de cinco: cada alvo tem pelo menos
                48 dp nas duas direções (dez barras numa fileira ficariam com
                metade disso na largura). */}
            <View style={[styles.sens, { opacity: opacity.disabled }]} accessibilityRole="radiogroup" accessibilityLabel="Sensibilidade, de 1 a 10, em breve" accessibilityState={{ disabled: true }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <PressableScale
                  key={n}
                  disabled
                  haptic={false}
                  style={[styles.sensItem, { backgroundColor: colors.surfaceAlt }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: false, checked: false, disabled: true }}
                  accessibilityLabel={`Nível ${n} de 10`}
                >
                  <Text variant="body" weight="semibold" style={{ color: colors.textMuted }}>
                    {n}
                  </Text>
                </PressableScale>
              ))}
            </View>
            <View style={styles.sensLegend}>
              <Text variant="caption" tone="muted">
                Menos
              </Text>
              <Text variant="caption" tone="muted">
                Mais
              </Text>
            </View>
          </Card>
        </View>

        {/* Emergência — o prazo é lido pela função agendada do servidor: passado
            sem confirmação, ela reenvia o alerta a todos os celulares da conta. */}
        <SectionTitle title="Emergência" />
        <Card padding={0}>
          <View style={[styles.prazo, { borderBottomColor: colors.border }]}>
            <View style={styles.prazoTop}>
              <View style={[styles.prazoIcon, { backgroundColor: colors.warningTint }]}>
                <Ionicons name="hourglass-outline" size={sizes.icon.sm} color={colors.warningText} />
              </View>
              <View style={styles.flex}>
                <Text variant="body" weight="medium">
                  Prazo para responder
                </Text>
                <Text variant="caption" tone="muted">
                  Sem confirmação, o alerta é reenviado a todos os celulares.
                </Text>
              </View>
            </View>
            <Stepper value={settings?.emergency_timeout_s ?? 45} step={15} min={15} max={300} onChange={(v) => void apply({ emergency_timeout_s: v })} />
          </View>
          {(settings?.emergency_contacts ?? []).map((c, i) => (
            // Índice na chave: o mesmo telefone pode estar cadastrado duas vezes.
            <ListRow key={`${c.phone}-${i}`} icon="call-outline" title={c.name} subtitle={c.phone} tone="danger" role="link" accessibilityHint="Liga para este contato" onPress={() => abrirLink(`tel:${c.phone}`)} right={<Ionicons name="call" size={sizes.icon.sm} color={colors.dangerText} />} />
          ))}
          <ListRow
            icon="person-add-outline"
            title="Adicionar contato"
            subtitle="Fica a um toque no alerta de socorro"
            tone="primary"
            last
            onPress={() => {
              setFalha(null);
              setNovoContato(true);
            }}
          />
        </Card>
        <Text variant="caption" tone="muted" style={styles.footnote}>
          Ligar é sempre com você: o app não telefona sozinho.
        </Text>

        <SectionTitle title="Paciente" />
        <Card padding={0}>
          <ListRow icon="person-circle-outline" title={patient?.user_name ?? 'Paciente'} subtitle="Perfil e computadores" onPress={() => router.push('/paciente')} />
          <ListRow icon="albums-outline" title="Frases rápidas" subtitle={`O que aparece na tela de ${nome}`} tone="accent" onPress={() => router.push('/frases')} />
          <ListRow
            icon="desktop-outline"
            title={device?.name ?? 'Nenhum computador'}
            subtitle={device ? `${online ? 'Ligado agora' : `Visto ${timeAgo(device.last_seen_at)}`}${device.app_version ? ` · versão ${device.app_version}` : ''}` : 'Entre com esta conta no IrisFlow do computador'}
            tone={online ? 'accent' : 'muted'}
            onPress={() => router.push('/paciente')}
          />
          <ListRow icon="mic-outline" title="Voz" subtitle={settings?.voice ?? 'O computador informa depois do primeiro ajuste'} tone="muted" last />
        </Card>

        <SectionTitle title="Conta" />
        <Card padding={0}>
          <ListRow
            icon={beta ? 'sparkles-outline' : 'card-outline'}
            title={beta ? 'Programa beta' : plan ? `Plano ${plan.name}` : 'Sem assinatura'}
            subtitle={beta && subscription ? `Acesso completo até ${formatDate(subscription.next_charge_at)}` : subscription ? `${brl(subscription.price_brl)}/mês · ${subscription.status === 'avaliacao' ? 'período de avaliação' : subscription.status}` : undefined}
            onPress={() => router.push('/assinatura')}
          />
          <ListRow icon="mail-outline" title={profile?.buyer_name ?? '—'} subtitle={profile?.email} tone="muted" last />
        </Card>

        <SectionTitle title="Aparência" />
        <SegmentedControl<ThemePreference>
          value={preference}
          onChange={setPreference}
          accessibilityLabel="Tema do app"
          options={[
            { value: 'system', label: 'Automático', accessibilityLabel: 'Automático, igual ao celular' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
        />

        {/* Links exigidos pelas lojas: a política precisa estar acessível DE
            DENTRO do app, e a exclusão de conta precisa de um caminho claro. As
            URLs vêm de app.json > extra — as mesmas cadastradas nas lojas. */}
        <SectionTitle title="Privacidade" />
        <Card padding={0}>
          <ListRow icon="shield-checkmark-outline" title="Política de privacidade" subtitle="Como tratamos os dados (LGPD)" role="link" onPress={() => abrirLink(legalLinks.privacy)} />
          <ListRow icon="reader-outline" title="Termos de uso" tone="muted" role="link" onPress={() => abrirLink(legalLinks.terms)} />
          <ListRow icon="trash-outline" title="Excluir conta e dados" subtitle="Pedido por e-mail, em até 15 dias" tone="danger" last onPress={excluir} />
        </Card>

        <Button title="Sair da conta" variant="dangerOutline" icon="log-out-outline" onPress={sair} style={styles.logout} />

        <View style={styles.about}>
          <Ionicons name="lock-closed-outline" size={sizes.icon.xs} color={colors.textMuted} />
          <Text variant="caption" tone="muted" center style={styles.flexShrink}>
            Imagens da câmera ficam só no computador do paciente.
          </Text>
        </View>
        <Text variant="caption" tone="muted" center>
          IrisFlow Cuidador {buildInfo()}
        </Text>
      </Screen>

      <NovoContato
        visivel={novoContato}
        salvando={saving}
        falha={falha}
        onFechar={() => setNovoContato(false)}
        onSalvar={async (c) => {
          const ok = await apply({ emergency_contacts: [...(settings?.emergency_contacts ?? []), c] });
          // Na falha o modal fica aberto com o que foi digitado e o erro dentro
          // dele — fechar aqui apagaria o trabalho do cuidador.
          if (ok) setNovoContato(false);
          return ok;
        }}
      />
    </>
  );
}

function Setting({ icon, title, hint, emBreve = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; emBreve?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.setting}>
      <View style={styles.settingTitle}>
        <Ionicons name={icon} size={sizes.icon.md} color={emBreve ? colors.textMuted : colors.primary} />
        <Text variant="h3" accessibilityRole="header" style={styles.flexShrink}>
          {title}
        </Text>
        {emBreve ? <StatusPill label="Em breve" tone="muted" /> : null}
      </View>
      <Text variant="caption" tone="muted">
        {hint}
      </Text>
    </View>
  );
}

function Stepper({ value, step, min, max, onChange }: { value: number; step: number; min: number; max: number; onChange: (v: number) => void }) {
  const { colors } = useTheme();
  // No limite o toque não grava nada: cada toque em "−" no mínimo faria um
  // upsert idêntico no banco e piscaria "Salvando…".
  return (
    <View style={[styles.stepper, { backgroundColor: colors.surfaceAlt }]}>
      <IconButton icon="remove" variant="plain" accessibilityLabel={`Diminuir prazo, agora ${value} segundos`} disabled={value <= min} onPress={() => value > min && onChange(Math.max(min, value - step))} />
      <Text variant="h3" center style={styles.stepperValue} accessibilityLiveRegion="polite">
        {value} s
      </Text>
      <IconButton icon="add" variant="plain" accessibilityLabel={`Aumentar prazo, agora ${value} segundos`} disabled={value >= max} onPress={() => value < max && onChange(Math.min(max, value + step))} />
    </View>
  );
}

/**
 * Cadastro de contato de emergência. `Alert.prompt` só existe no iOS; este
 * modal funciona nas duas plataformas.
 */
function NovoContato({ visivel, salvando, falha, onFechar, onSalvar }: { visivel: boolean; salvando: boolean; falha: string | null; onFechar: () => void; onSalvar: (c: { name: string; phone: string }) => Promise<boolean> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [nomeContato, setNomeContato] = useState('');
  const [foneContato, setFoneContato] = useState('');
  const foneLimpo = foneContato.replace(/[^\d+]/g, '');
  const valido = nomeContato.trim().length > 0 && foneLimpo.length >= 8;

  const salvar = async () => {
    if (!valido || salvando) return;
    const ok = await onSalvar({ name: nomeContato.trim(), phone: foneLimpo });
    if (ok) {
      setNomeContato('');
      setFoneContato('');
    }
  };

  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]} accessibilityViewIsModal>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text variant="h2" accessibilityRole="header">
            Novo contato de emergência
          </Text>
          <Text variant="bodySmall" tone="muted" style={styles.sheetHint}>
            Aparece a um toque no alerta de socorro.
          </Text>
          <View style={styles.sheetForm}>
            <TextField label="Nome" icon="person-outline" placeholder="Ex.: Lucas, filho" value={nomeContato} onChangeText={setNomeContato} autoFocus returnKeyType="next" autoCapitalize="words" />
            <TextField label="Telefone" icon="call-outline" placeholder="Ex.: 11 91234-5678" value={foneContato} onChangeText={setFoneContato} keyboardType="phone-pad" returnKeyType="done" onSubmitEditing={() => void salvar()} />
            {falha ? <Notice tone="danger" title="Não foi salvo" text={falha} /> : null}
          </View>
          <View style={styles.sheetActions}>
            <Button title="Cancelar" variant="outline" onPress={onFechar} style={styles.flex} />
            <Button title="Salvar" icon="checkmark" loading={salvando} disabled={!valido} onPress={() => void salvar()} style={styles.flex} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  notice: { marginBottom: spacing.md },
  stack: { gap: spacing.md },
  setting: { marginBottom: spacing.md, gap: spacing.xs },
  settingTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sens: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // 5 por fileira nos celulares comuns (base de 16% + 4 vãos; o que sobra é
  // repartido igualmente). `minWidth` garante os 48 dp mesmo em tela estreita,
  // onde a fileira passa a ter 4.
  sensItem: { flexBasis: '16%', flexGrow: 1, minWidth: sizes.touch, minHeight: sizes.touch, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sensLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  prazo: { gap: spacing.md, padding: spacing.lg, borderBottomWidth: sizes.hairline },
  prazoTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  prazoIcon: { width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.pill, padding: spacing.xxs },
  stepperValue: { flex: 1 },
  footnote: { marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  logout: { marginTop: spacing.xxxl },
  about: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xxl, marginBottom: spacing.xs },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: layout.gutter, paddingTop: spacing.md },
  grabber: { alignSelf: 'center', width: sizes.touch - spacing.sm, height: spacing.xs, borderRadius: radius.pill, marginBottom: spacing.lg },
  sheetHint: { marginTop: spacing.xs },
  sheetForm: { marginTop: spacing.xl, gap: spacing.lg },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
});
