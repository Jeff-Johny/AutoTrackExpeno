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
}

export const dbService = new DatabaseService();
