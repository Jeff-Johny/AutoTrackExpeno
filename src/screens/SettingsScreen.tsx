import React, { useState } from 'react';
import {
  View,
  Alert,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Appbar } from 'react-native-paper';
import { useStore } from '../store/useStore';
import { excelService } from '../services/excel';
import { smsService } from '../services/sms';
import { backupService } from '../services/backup';
import { pick, types as DocumentPickerTypes, isErrorWithCode, errorCodes } from '@react-native-documents/picker';

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
const Card = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <View style={[styles.card, style]}>{children}</View>
);

// ─── Section header ─────────────────────────────────────────────────────────
const SectionHeader = ({ title }: { title: string }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

// ─── Action button ──────────────────────────────────────────────────────────
const ActionButton = ({
  icon,
  label,
  sublabel,
  onPress,
  color = '#6C63FF',
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
}) => (
  <TouchableOpacity
    style={[styles.actionBtn, { opacity: disabled ? 0.5 : 1 }]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.75}
  >
    <View style={[styles.actionBtnIcon, { backgroundColor: color + '22' }]}>
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Text style={[styles.actionBtnEmoji, { color }]}>{icon}</Text>
      )}
    </View>
    <View style={styles.actionBtnText}>
      <Text style={styles.actionBtnLabel}>{label}</Text>
      {sublabel ? <Text style={styles.actionBtnSub}>{sublabel}</Text> : null}
    </View>
    <Text style={[styles.chevron, { color }]}>›</Text>
  </TouchableOpacity>
);

// ─── Main screen ────────────────────────────────────────────────────────────
const SettingsScreen = () => {
  const expenses = useStore((state) => state.expenses);
  const categories = useStore((state) => state.categories);
  const patterns = useStore((state) => state.patterns);

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
    <View style={{ flex: 1, backgroundColor: '#F0F2F8' }}>
      <Appbar.Header style={{ backgroundColor: '#F0F2F8', elevation: 0 }}>
        <Appbar.Content title="Settings" />
      </Appbar.Header>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Stats banner ───────────────────────────────────────────────── */}
      <Card style={styles.statsBanner}>
        <Text style={styles.statsTitle}>Current Data</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{expenses.length}</Text>
            <Text style={styles.statLabel}>Expenses</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{categories.length}</Text>
            <Text style={styles.statLabel}>Categories</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{patterns.length}</Text>
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
          color="#6C63FF"
          loading={exporting}
          disabled={exporting || importingMerge || importingReplace}
        />
        <View style={styles.divider} />
        <ActionButton
          icon="📊"
          label="Export to Excel"
          sublabel="Expenses only (.xlsx)"
          onPress={handleExportExcel}
          color="#22B07D"
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
          color="#F59E0B"
          loading={importingMerge}
          disabled={exporting || importingMerge || importingReplace}
        />
        <View style={styles.divider} />
        <ActionButton
          icon="♻️"
          label="Replace All Data"
          sublabel="Wipes current data, restores from backup"
          onPress={() => handleImport('replace')}
          color="#EF4444"
          loading={importingReplace}
          disabled={exporting || importingMerge || importingReplace}
        />
      </Card>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          <Text style={{ fontWeight: '700' }}>Full Backup</Text> exports all your data as a JSON
          file to the Downloads folder. Use <Text style={{ fontWeight: '700' }}>Merge Import</Text>{' '}
          to restore without losing existing data, or{' '}
          <Text style={{ fontWeight: '700' }}>Replace</Text> to fully restore from backup.
        </Text>
      </View>

      {/* ── Account section ────────────────────────────────────────────── */}
      <SectionHeader title="Account" />
      <Card>
        <View style={styles.infoRow}>
          <Text style={styles.infoRowIcon}>🤖</Text>
          <View>
            <Text style={styles.infoRowLabel}>AI Categorization</Text>
            <Text style={styles.infoRowSub}>Gemini API is active</Text>
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
          color="#64748B"
        />
      </Card>

      <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

export default SettingsScreen;

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F8',
  },
  content: {
    padding: 16,
  },

  // Stats banner
  statsBanner: {
    backgroundColor: '#6C63FF',
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
    fontSize: 28,
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
    color: '#94A3B8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    marginLeft: 4,
  },

  // Card
  card: {
    backgroundColor: '#fff',
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
    color: '#1E293B',
  },
  actionBtnSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 4,
  },

  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 14,
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
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
    color: '#475569',
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
    color: '#1E293B',
  },
  infoRowSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },

  icon: {
    fontSize: 20,
  },
});
