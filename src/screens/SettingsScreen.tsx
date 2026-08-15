import React, { useState, useEffect } from 'react';
import {
  View,
  Alert,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { Appbar, SegmentedButtons, Switch, Portal, Dialog, Menu, Button } from 'react-native-paper';
import { useStore } from '../store/useStore';
import { excelService } from '../services/excel';
import { smsService } from '../services/sms';
import { backupService } from '../services/backup';
import { dbService } from '../services/db';
import { notificationService } from '../services/notifications';
import { pick, types as DocumentPickerTypes, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { useAppTheme } from '../theme/theme';

const pad2 = (n: number) => n.toString().padStart(2, '0');

// ─── Icon helper (uses react-native-vector-icons via text emoji fallback) ──
const Icon = ({ name }: { name: string }) => {
  const icons: Record<string, string> = {
    export: '📤',
    import: '📥',
    excel: '📊',
    debug: '🛠',
    shield: '🛡',
    robot: '🤖',
    merge: '🔀',
    replace: '♻️',
    info: 'ℹ️',
  };
  return <Text style={styles.icon}>{icons[name] ?? '•'}</Text>;
};

// ─── Reusable card ──────────────────────────────────────────────────────────
const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => {
  const theme = useAppTheme();
  return <View style={[styles.card, { backgroundColor: theme.colors.surface }, style]}>{children}</View>;
};

// ─── Section header ─────────────────────────────────────────────────────────
const SectionHeader = ({ title }: { title: string }) => {
  const theme = useAppTheme();
  return <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>;
};

// ─── Action button ──────────────────────────────────────────────────────────
const ActionButton = ({
  icon,
  label,
  sublabel,
  onPress,
  color,
  loading = false,
  disabled = false,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  color?: string;
  loading?: boolean;
  disabled?: boolean;
}) => {
  const theme = useAppTheme();
  const tint = color || theme.colors.primary;
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { opacity: disabled ? 0.5 : 1 }]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
    >
      <View style={[styles.actionBtnIcon, { backgroundColor: tint + '22' }]}>
        {loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Text style={[styles.actionBtnEmoji, { color: tint }]}>{icon}</Text>
        )}
      </View>
      <View style={styles.actionBtnText}>
        <Text style={[styles.actionBtnLabel, { color: theme.colors.onSurface }]}>{label}</Text>
        {sublabel ? <Text style={[styles.actionBtnSub, { color: theme.colors.onSurfaceVariant }]}>{sublabel}</Text> : null}
      </View>
      <Text style={[styles.chevron, { color: tint }]}>›</Text>
    </TouchableOpacity>
  );
};

// ─── Main screen ────────────────────────────────────────────────────────────
const SettingsScreen = () => {
  const theme = useAppTheme();
  const expenses = useStore((state) => state.expenses);
  const categories = useStore((state) => state.categories);
  const patterns = useStore((state) => state.patterns);
  const themePreference = useStore((state) => state.themePreference);
  const setThemePreference = useStore((state) => state.setThemePreference);

  const handleThemeChange = (value: string) => {
    const preference = value as 'light' | 'dark' | 'system';
    setThemePreference(preference);
    dbService.setThemePreference(preference);
  };

  // ── Daily reminder ─────────────────────────────────────────────────────────
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [timeDialogVisible, setTimeDialogVisible] = useState(false);
  const [hourMenuVisible, setHourMenuVisible] = useState(false);
  const [minuteMenuVisible, setMinuteMenuVisible] = useState(false);
  const [draftHour, setDraftHour] = useState(9);
  const [draftMinute, setDraftMinute] = useState(0);

  useEffect(() => {
    dbService.getReminderSettings().then((saved) => {
      if (saved) {
        setReminderEnabled(saved.enabled);
        setReminderHour(saved.hour);
        setReminderMinute(saved.minute);
      }
    });
  }, []);

  const persistReminder = (enabled: boolean, hour: number, minute: number) => {
    dbService.setReminderSettings({ enabled, hour, minute });
  };

  const handleReminderToggle = (value: boolean) => {
    if (value) {
      try {
        notificationService.scheduleDailyReminder(reminderHour, reminderMinute);
        setReminderEnabled(true);
        persistReminder(true, reminderHour, reminderMinute);
      } catch {
        // Android 13+ needs the "Alarms & reminders" special access granted
        // per-app before exact-time alarms can be scheduled — react-native
        // -push-notification doesn't expose a check for it, so we only find
        // out by the schedule call throwing. Guide the user there instead
        // of leaving the toggle in a state that silently won't fire.
        Alert.alert(
          "Can't schedule reminder",
          'Android needs permission to send reminders at an exact time. Enable "Alarms & reminders" for this app in Settings, then try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } else {
      notificationService.cancelDailyReminder();
      setReminderEnabled(false);
      persistReminder(false, reminderHour, reminderMinute);
    }
  };

  const openTimeDialog = () => {
    setDraftHour(reminderHour);
    setDraftMinute(reminderMinute);
    setTimeDialogVisible(true);
  };

  const saveTime = () => {
    setReminderHour(draftHour);
    setReminderMinute(draftMinute);
    setTimeDialogVisible(false);
    if (reminderEnabled) {
      try {
        notificationService.scheduleDailyReminder(draftHour, draftMinute);
      } catch {
        // Already enabled once before, so permission was presumably granted
        // then; a failure here is unusual — the toggle above is the primary
        // place that surfaces the Settings prompt.
      }
    }
    persistReminder(reminderEnabled, draftHour, draftMinute);
  };

  const [exporting, setExporting] = useState(false);
  const [importingMerge, setImportingMerge] = useState(false);
  const [importingReplace, setImportingReplace] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // ── Excel export (existing) ───────────────────────────────────────────────
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const path = await excelService.exportExpenses(expenses);
      Alert.alert('✅ Excel Exported', `Saved to:\n${path}`);
    } catch {
      Alert.alert('Export Failed', 'Could not export Excel file.');
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Full JSON backup export ───────────────────────────────────────────────
  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const path = await backupService.exportAll();
      Alert.alert(
        '✅ Backup Exported',
        `All data saved to Downloads:\n\n📦 ${expenses.length} expenses\n🏷 ${categories.length} categories\n🧠 ${patterns.length} patterns\n\nFile: ${path.split('/').pop()}`
      );
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message || 'Unknown error.');
    } finally {
      setExporting(false);
    }
  };

  // ── Full JSON backup import ───────────────────────────────────────────────
  const handleImport = async (mode: 'merge' | 'replace') => {
    if (mode === 'replace') {
      Alert.alert(
        '⚠️ Replace All Data?',
        'This will DELETE all current expenses, categories, and patterns before importing. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: () => runImport('replace') },
        ]
      );
    } else {
      runImport('merge');
    }
  };

  const runImport = async (mode: 'merge' | 'replace') => {
    const setter = mode === 'merge' ? setImportingMerge : setImportingReplace;
    setter(true);
    try {
      const [picked] = await pick({
        type: [DocumentPickerTypes.allFiles],
        allowMultiSelection: false,
      });

      if (!picked.uri || !picked.name?.endsWith('.json')) {
        Alert.alert('Invalid File', 'Please select a valid .json backup file.');
        setter(false);
        return;
      }

      // On Android the URI might be a content:// URI — resolve to a real path
      let filePath = picked.uri;
      if (Platform.OS === 'android' && filePath.startsWith('content://')) {
        const RNFS = require('react-native-fs');
        const destPath = `${RNFS.CachesDirectoryPath}/${picked.name}`;
        await RNFS.copyFile(filePath, destPath);
        filePath = destPath;
      }

      const { imported, skipped } = await backupService.importAll(filePath, mode);
      Alert.alert(
        '✅ Import Complete',
        mode === 'replace'
          ? `${imported} records restored from backup.`
          : `${imported} new records imported.\n${skipped} duplicates skipped.`
      );
    } catch (e: any) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
        // user cancelled — silent
      } else {
        Alert.alert('Import Failed', e?.message || 'Could not read backup file.');
      }
    } finally {
      setter(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background, elevation: 0 }}>
        <Appbar.Content title="Settings" titleStyle={{ color: theme.colors.onSurface }} />
      </Appbar.Header>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Stats banner ───────────────────────────────────────────────── */}
      <Card style={[styles.statsBanner, { backgroundColor: theme.colors.primary }]}>
        <Text style={styles.statsTitle}>Current Data</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { fontFamily: theme.custom.ledgerFont }]}>{expenses.length}</Text>
            <Text style={styles.statLabel}>Expenses</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { fontFamily: theme.custom.ledgerFont }]}>{categories.length}</Text>
            <Text style={styles.statLabel}>Categories</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { fontFamily: theme.custom.ledgerFont }]}>{patterns.length}</Text>
            <Text style={styles.statLabel}>Patterns</Text>
          </View>
        </View>
      </Card>

      {/* ── Export section ─────────────────────────────────────────────── */}
      <SectionHeader title="Export" />
      <Card>
        <ActionButton
          icon="📤"
          label="Full Backup (JSON)"
          sublabel="Expenses · Categories · Patterns"
          onPress={handleExportBackup}
          color={theme.custom.accentInk}
          loading={exporting}
          disabled={exporting || importingMerge || importingReplace}
        />
        <View style={[styles.divider, { backgroundColor: theme.colors.surfaceVariant }]} />
        <ActionButton
          icon="📊"
          label="Export to Excel"
          sublabel="Expenses only (.xlsx)"
          onPress={handleExportExcel}
          color={theme.custom.good}
          loading={exportingExcel}
          disabled={exportingExcel || exporting}
        />
      </Card>

      {/* ── Import section ─────────────────────────────────────────────── */}
      <SectionHeader title="Import" />
      <Card>
        <ActionButton
          icon="🔀"
          label="Merge Import"
          sublabel="Adds new records, skips duplicates"
          onPress={() => handleImport('merge')}
          color={theme.colors.onSurfaceVariant}
          loading={importingMerge}
          disabled={exporting || importingMerge || importingReplace}
        />
        <View style={[styles.divider, { backgroundColor: theme.colors.surfaceVariant }]} />
        <ActionButton
          icon="♻️"
          label="Replace All Data"
          sublabel="Wipes current data, restores from backup"
          onPress={() => handleImport('replace')}
          color={theme.custom.critical}
          loading={importingReplace}
          disabled={exporting || importingMerge || importingReplace}
        />
      </Card>

      {/* Info box */}
      <View style={[styles.infoBox, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={[styles.infoText, { color: theme.colors.onPrimaryContainer }]}>
          <Text style={{ fontWeight: '700' }}>Full Backup</Text> exports all your data as a JSON
          file to the Downloads folder. Use <Text style={{ fontWeight: '700' }}>Merge Import</Text>{' '}
          to restore without losing existing data, or{' '}
          <Text style={{ fontWeight: '700' }}>Replace</Text> to fully restore from backup.
        </Text>
      </View>

      {/* ── Appearance section ─────────────────────────────────────────── */}
      <SectionHeader title="Appearance" />
      <Card>
        <View style={{ padding: 12 }}>
          <SegmentedButtons
            value={themePreference}
            onValueChange={handleThemeChange}
            buttons={[
              { value: 'system', label: 'System', icon: 'theme-light-dark' },
              { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
              { value: 'dark', label: 'Dark', icon: 'moon-waning-crescent' },
            ]}
          />
        </View>
      </Card>

      {/* ── Reminders section ──────────────────────────────────────────── */}
      <SectionHeader title="Reminders" />
      <Card>
        <View style={styles.infoRow}>
          <Text style={styles.infoRowIcon}>⏰</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoRowLabel, { color: theme.colors.onSurface }]}>Daily review reminder</Text>
            <Text style={[styles.infoRowSub, { color: theme.colors.onSurfaceVariant }]}>Nudge to approve pending categorizations</Text>
          </View>
          <Switch value={reminderEnabled} onValueChange={handleReminderToggle} color={theme.colors.primary} />
        </View>
        {reminderEnabled && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.colors.surfaceVariant }]} />
            <TouchableOpacity onPress={openTimeDialog}>
              <View style={styles.infoRow}>
                <Text style={styles.infoRowIcon}>🕐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoRowLabel, { color: theme.colors.onSurface }]}>Remind me at</Text>
                  <Text style={[styles.infoRowSub, { color: theme.colors.onSurfaceVariant }]}>Tap to change</Text>
                </View>
                <Text style={{ fontFamily: theme.custom.ledgerFont, fontSize: 18, fontWeight: '700', color: theme.colors.primary }}>
                  {pad2(reminderHour)}:{pad2(reminderMinute)}
                </Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </Card>

      {/* ── Account section ────────────────────────────────────────────── */}
      <SectionHeader title="Account" />
      <Card>
        <View style={styles.infoRow}>
          <Text style={styles.infoRowIcon}>🤖</Text>
          <View>
            <Text style={[styles.infoRowLabel, { color: theme.colors.onSurface }]}>AI Categorization</Text>
            <Text style={[styles.infoRowSub, { color: theme.colors.onSurfaceVariant }]}>DeepSeek API is active</Text>
          </View>
        </View>
      </Card>

      {/* ── Debug section ──────────────────────────────────────────────── */}
      <SectionHeader title="Debug Tools" />
      <Card>
        <ActionButton
          icon="🛠"
          label="Simulate Sync Popup"
          sublabel="Trigger a test expense popup"
          onPress={async () => {
            const setUnsureData = useStore.getState().setUnsureData;
            await smsService.testRecentSmsSync(setUnsureData);
          }}
          color={theme.colors.onSurfaceVariant}
        />
      </Card>

      <View style={{ height: 40 }} />
      </ScrollView>

      <Portal>
        <Dialog visible={timeDialogVisible} onDismiss={() => setTimeDialogVisible(false)}>
          <Dialog.Title>Remind me at</Dialog.Title>
          <Dialog.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Menu
                visible={hourMenuVisible}
                onDismiss={() => setHourMenuVisible(false)}
                anchor={
                  <Button mode="outlined" onPress={() => setHourMenuVisible(true)}>
                    {pad2(draftHour)}
                  </Button>
                }
              >
                <ScrollView style={{ maxHeight: 300 }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <Menu.Item key={h} title={pad2(h)} onPress={() => { setDraftHour(h); setHourMenuVisible(false); }} />
                  ))}
                </ScrollView>
              </Menu>
              <Text style={{ fontSize: 18, color: theme.colors.onSurface }}>:</Text>
              <Menu
                visible={minuteMenuVisible}
                onDismiss={() => setMinuteMenuVisible(false)}
                anchor={
                  <Button mode="outlined" onPress={() => setMinuteMenuVisible(true)}>
                    {pad2(draftMinute)}
                  </Button>
                }
              >
                {[0, 15, 30, 45].map((m) => (
                  <Menu.Item key={m} title={pad2(m)} onPress={() => { setDraftMinute(m); setMinuteMenuVisible(false); }} />
                ))}
              </Menu>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setTimeDialogVisible(false)}>Cancel</Button>
            <Button onPress={saveTime}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

export default SettingsScreen;

// ─── Styles (layout only — colors are applied inline from the theme above) ─
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },

  // Stats banner
  statsBanner: {
    marginBottom: 24,
  },
  statsTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 4,
  },

  // Section header
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    marginLeft: 4,
  },

  // Card
  card: {
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  // Action button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
  },
  actionBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionBtnEmoji: {
    fontSize: 22,
  },
  actionBtnText: {
    flex: 1,
  },
  actionBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtnSub: {
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 4,
  },

  divider: {
    height: 1,
    marginHorizontal: 14,
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    marginTop: -4,
    alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  // Info row (non-tappable)
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  infoRowIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  infoRowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoRowSub: {
    fontSize: 12,
    marginTop: 2,
  },

  icon: {
    fontSize: 20,
  },
});
