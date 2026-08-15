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
            status TEXT,
            source TEXT,
            transaction_hash TEXT
          );
        `);
      console.log('DB: sms_transactions table checked');

      // Migration: add source and transaction_hash columns if they don't exist
      try {
        this.db.execute('ALTER TABLE sms_transactions ADD COLUMN source TEXT DEFAULT "sms"');
        console.log('DB: source column added to sms_transactions (migration)');
      } catch (_) {
        // Column already exists, ignore
      }

      try {
        this.db.execute('ALTER TABLE sms_transactions ADD COLUMN transaction_hash TEXT');
        console.log('DB: transaction_hash column added to sms_transactions (migration)');
      } catch (_) {
        // Column already exists, ignore
      }

      // sms_transactions accumulates every SMS/email ever processed —
      // including every pre-filtered OTP/promo (status='system_ignored'),
      // which never gets pruned and can grow into the thousands over time.
      // The pending/ignored screens filter and sort by (status, date) on
      // every load, so this index keeps that from becoming a full table
      // scan as the table grows.
      this.db.execute(
        'CREATE INDEX IF NOT EXISTS idx_sms_transactions_status_date ON sms_transactions(status, date DESC)'
      );
      console.log('DB: sms_transactions status/date index checked');

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

  /** 'light' | 'dark' | 'system' — user's manual override, independent of the OS setting. */
  async getThemePreference(): Promise<'light' | 'dark' | 'system' | null> {
    try {
      const db = this.getDb();
      const result = db.execute('SELECT value FROM settings WHERE key = ?', ['theme_preference']);
      const rows = result.rows?._array;
      if (rows && rows.length > 0) {
        return rows[0].value as 'light' | 'dark' | 'system';
      }
      return null;
    } catch (error) {
      console.error('DB: Failed to get theme preference', error);
      return null;
    }
  }

  async setThemePreference(preference: 'light' | 'dark' | 'system') {
    try {
      const db = this.getDb();
      db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['theme_preference', preference]);
    } catch (error) {
      console.error('DB: Failed to set theme preference', error);
    }
  }

  /** Daily reminder to review pending categorizations — hour/minute in 24h local time. */
  async getReminderSettings(): Promise<{ enabled: boolean; hour: number; minute: number } | null> {
    try {
      const db = this.getDb();
      const result = db.execute('SELECT value FROM settings WHERE key = ?', ['reminder_settings']);
      const rows = result.rows?._array;
      if (rows && rows.length > 0) {
        return JSON.parse(rows[0].value);
      }
      return null;
    } catch (error) {
      console.error('DB: Failed to get reminder settings', error);
      return null;
    }
  }

  async setReminderSettings(settings: { enabled: boolean; hour: number; minute: number }) {
    try {
      const db = this.getDb();
      db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['reminder_settings', JSON.stringify(settings)]);
    } catch (error) {
      console.error('DB: Failed to set reminder settings', error);
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
    source?: 'sms' | 'email';
    transactionHash?: string;
  }) {
    try {
      const db = this.getDb();
      const source = tx.source || 'sms';
      const transactionHash = tx.transactionHash || `${source}_${tx.date}_${tx.amount}`;

      db.execute(
        'INSERT OR REPLACE INTO sms_transactions (sms_id, sender, sms_text, date, amount, payee, category, description, is_spending, status, source, transaction_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
          source,
          transactionHash,
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

  /**
   * `system_ignored` covers every pre-filtered OTP/promo SMS ever seen and
   * is never pruned, so this can grow into the thousands over months of
   * use — capped to the most recent `limit` so the Ignored tab (and the
   * query itself) stays fast. This is a display cap only; nothing is
   * deleted, and confirmed/pending transactions are unaffected.
   */
  async getIgnoredSmsTransactions(limit: number = 300): Promise<any[]> {
    try {
      const db = this.getDb();
      const result = db.execute(
        "SELECT * FROM sms_transactions WHERE status IN ('user_ignored', 'system_ignored') ORDER BY date DESC LIMIT ?",
        [limit]
      );
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

  async getTransactionByHash(transactionHash: string): Promise<any | null> {
    try {
      const db = this.getDb();
      const result = db.execute("SELECT * FROM sms_transactions WHERE transaction_hash = ?", [transactionHash]);
      const rows = result.rows?._array;
      if (rows && rows.length > 0) {
        return rows[0];
      }
      return null;
    } catch (e) {
      console.error('DB: Failed to get transaction by hash', e);
      return null;
    }
  }
}

export const dbService = new DatabaseService();
