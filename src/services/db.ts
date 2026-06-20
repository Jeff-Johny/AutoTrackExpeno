import { QuickSQLiteConnection, open } from 'react-native-quick-sqlite';

class DatabaseService {
  private db: QuickSQLiteConnection | null = null;

  async init() {
    console.log('DB: Initializing database...');
    try {
      this.db = open({ name: 'expeno.db' });
      console.log('DB: Database opened');

      // Create expenses table
      this.db.execute(`
          CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            amount REAL,
            category TEXT,
            description TEXT,
            date TEXT,
            isAutoCategorized INTEGER,
            smsSender TEXT,
            smsText TEXT,
            externalSmsId TEXT
          );
        `);
      console.log('DB: Expenses table checked');

      // Migration: add smsText column if it doesn't exist yet
      try {
        this.db.execute('ALTER TABLE expenses ADD COLUMN smsText TEXT');
        console.log('DB: smsText column added (migration)');
      } catch (_) {
        // Column already exists, ignore
      }

      try {
        this.db.execute('ALTER TABLE expenses ADD COLUMN externalSmsId TEXT');
        console.log('DB: externalSmsId column added (migration)');
      } catch (_) {
        // Column already exists, ignore
      }

      // Create categories table (with max spend)
      this.db.execute(`
          CREATE TABLE IF NOT EXISTS categories (
            category TEXT PRIMARY KEY,
            maxSpend REAL DEFAULT 0
          );
        `);
      console.log('DB: Categories table checked');

      // Create learned patterns table
      this.db.execute(`
          CREATE TABLE IF NOT EXISTS learned_patterns (
            id TEXT PRIMARY KEY,
            pattern TEXT,
            action TEXT,
            category TEXT
          );
        `);
      console.log('DB: Patterns table checked');

      // Create settings table for persistence
      this.db.execute(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
          );
        `);
      console.log('DB: Settings table checked');

      // Create sms_transactions table for tracking all incoming & synced messages
      this.db.execute(`
          CREATE TABLE IF NOT EXISTS sms_transactions (
            sms_id TEXT PRIMARY KEY,
            sender TEXT,
            sms_text TEXT,
            date INTEGER,
            amount REAL,
            payee TEXT,
            category TEXT,
            description TEXT,
            is_spending INTEGER,
            status TEXT
          );
        `);
      console.log('DB: sms_transactions table checked');


      // Initialize default categories
      const categories = [
        'Food & Stationary',
        'Petrol + transport',
        'Household',
        'cloth + cosmetics',
        'Medical',
        'Gift + Natilekku',
        'outing',
        'Car/bike maintenance',
      ];

      for (const cat of categories) {
        this.db.execute('INSERT OR IGNORE INTO categories (category, maxSpend) VALUES (?, ?)', [cat, 0]);
      }
      console.log('DB: Initialization complete');
    } catch (error) {
      console.error('DB: Initialization failed', error);
      throw error;
    }
  }

  getDb() {
    if (!this.db) {
        console.error('DB: getDb called but this.db is null!');
        throw new Error('Database not initialized');
    }
    return this.db;
  }

  async getLastSyncTimestamp(): Promise<number | null> {
    try {
      const db = this.getDb();
      const result = db.execute('SELECT value FROM settings WHERE key = ?', ['last_sync_timestamp']);
      const rows = result.rows?._array;
      if (rows && rows.length > 0) {
        return parseInt(rows[0].value, 10);
      }
      return null;
    } catch (error) {
      console.error('DB: Failed to get last sync timestamp', error);
      return null;
    }
  }

  async setLastSyncTimestamp(timestamp: number) {
    try {
      const db = this.getDb();
      db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['last_sync_timestamp', timestamp.toString()]);
    } catch (error) {
      console.error('DB: Failed to set last sync timestamp', error);
    }
  }

  async saveSmsTransaction(tx: {
    smsId: string;
    sender: string;
    smsText: string;
    date: number;
    amount: number;
    payee: string | null;
    category: string | null;
    description: string | null;
    isSpending: boolean;
    status: 'pending' | 'confirmed' | 'user_ignored' | 'system_ignored';
  }) {
    try {
      const db = this.getDb();
      db.execute(
        'INSERT OR REPLACE INTO sms_transactions (sms_id, sender, sms_text, date, amount, payee, category, description, is_spending, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          tx.smsId,
          tx.sender,
          tx.smsText,
          tx.date,
          tx.amount,
          tx.payee || '',
          tx.category || '',
          tx.description || '',
          tx.isSpending ? 1 : 0,
          tx.status,
        ]
      );
    } catch (e) {
      console.error('DB: Failed to save SMS transaction', e);
    }
  }

  async updateSmsTransactionStatus(smsId: string, status: 'confirmed' | 'user_ignored' | 'system_ignored') {
    try {
      const db = this.getDb();
      db.execute('UPDATE sms_transactions SET status = ? WHERE sms_id = ?', [status, smsId]);
    } catch (e) {
      console.error('DB: Failed to update SMS transaction status', e);
    }
  }

  async getPendingSmsTransactions(): Promise<any[]> {
    try {
      const db = this.getDb();
      const result = db.execute("SELECT * FROM sms_transactions WHERE status = 'pending' ORDER BY date DESC");
      return result.rows?._array || [];
    } catch (e) {
      console.error('DB: Failed to get pending SMS transactions', e);
      return [];
    }
  }

  async getIgnoredSmsTransactions(): Promise<any[]> {
    try {
      const db = this.getDb();
      const result = db.execute("SELECT * FROM sms_transactions WHERE status IN ('user_ignored', 'system_ignored') ORDER BY date DESC");
      return result.rows?._array || [];
    } catch (e) {
      console.error('DB: Failed to get ignored SMS transactions', e);
      return [];
    }
  }

  async getSmsTransaction(smsId: string): Promise<any | null> {
    try {
      const db = this.getDb();
      const result = db.execute("SELECT * FROM sms_transactions WHERE sms_id = ?", [smsId]);
      const rows = result.rows?._array;
      if (rows && rows.length > 0) {
        return rows[0];
      }
      return null;
    } catch (e) {
      console.error('DB: Failed to get SMS transaction', e);
      return null;
    }
  }
}

export const dbService = new DatabaseService();
