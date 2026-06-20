import RNFS from 'react-native-fs';
import { dbService } from './db';
import { expenseService } from './expense';
import { patternService } from './patterns';
import { useStore } from '../store/useStore';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const BACKUP_VERSION = 1;

export interface BackupData {
  version: number;
  exportedAt: string;
  expenses: any[];
  categories: any[];
  patterns: any[];
}

export const backupService = {
  /**
   * Export all app data (expenses, categories, patterns) to a JSON file
   * in the Downloads folder.
   */
  async exportAll(): Promise<string> {
    const db = dbService.getDb();

    const expensesResult = db.execute('SELECT * FROM expenses ORDER BY date DESC');
    const expenses = expensesResult.rows?._array || [];

    const categoriesResult = db.execute('SELECT * FROM categories');
    const categories = categoriesResult.rows?._array || [];

    const patternsResult = db.execute('SELECT * FROM learned_patterns');
    const patterns = patternsResult.rows?._array || [];

    const backup: BackupData = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      expenses,
      categories,
      patterns,
    };

    const json = JSON.stringify(backup, null, 2);
    const fileName = `expeno_backup_${Date.now()}.json`;
    const path = `${RNFS.DownloadDirectoryPath}/${fileName}`;

    await RNFS.writeFile(path, json, 'utf8');
    console.log('[Backup] Exported to:', path);
    return path;
  },

  /**
   * Import data from a JSON backup file.
   * mode: 'merge'   — keeps existing records, only inserts missing ones (by id)
   * mode: 'replace' — wipes all existing data and restores from backup
   */
  async importAll(filePath: string, mode: 'merge' | 'replace' = 'merge'): Promise<{ imported: number; skipped: number }> {
    const raw = await RNFS.readFile(filePath, 'utf8');
    const backup: BackupData = JSON.parse(raw);

    if (!backup.version || !backup.expenses || !backup.categories || !backup.patterns) {
      throw new Error('Invalid backup file format.');
    }

    const db = dbService.getDb();

    if (mode === 'replace') {
      db.execute('DELETE FROM expenses');
      db.execute('DELETE FROM categories');
      db.execute('DELETE FROM learned_patterns');
      console.log('[Backup] Replace mode: cleared all tables');
    }

    let imported = 0;
    let skipped = 0;

    // --- Restore expenses ---
    for (const e of backup.expenses) {
      const id = e.id || uuidv4();
      const exists = db.execute('SELECT id FROM expenses WHERE id = ?', [id]);
      if (mode === 'merge' && exists.rows?._array?.length > 0) {
        skipped++;
        continue;
      }
      db.execute(
        'INSERT OR REPLACE INTO expenses (id, amount, category, description, date, isAutoCategorized, smsSender, smsText, externalSmsId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, e.amount, e.category, e.description, e.date, e.isAutoCategorized ? 1 : 0, e.smsSender || '', e.smsText || '', e.externalSmsId || '']
      );
      imported++;
    }

    // --- Restore categories ---
    for (const c of backup.categories) {
      db.execute('INSERT OR REPLACE INTO categories (category, maxSpend) VALUES (?, ?)', [c.category, c.maxSpend ?? 0]);
    }

    // --- Restore patterns ---
    for (const p of backup.patterns) {
      const id = p.id || uuidv4();
      db.execute(
        'INSERT OR REPLACE INTO learned_patterns (id, pattern, action, category) VALUES (?, ?, ?, ?)',
        [id, p.pattern, p.action, p.category || '']
      );
    }

    // Refresh in-memory store
    await expenseService.fetchAll();
    await expenseService.fetchCategories();
    await patternService.fetchAll();

    console.log(`[Backup] Import complete. imported=${imported}, skipped=${skipped}`);
    return { imported, skipped };
  },
};
