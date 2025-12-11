import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { schema, seedData } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/ledger.db');

// Ensure data directory exists
import { mkdirSync, existsSync } from 'fs';
const dataDir = join(__dirname, '../../data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Minimal migration for loans table (idempotent)
const loansMigration = `
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL,
  term_months INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  monthly_due_day INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  category_id TEXT,
  remaining_principal REAL NOT NULL,
  monthly_payment REAL NOT NULL,
  paid_months INTEGER DEFAULT 0,
  next_due_date TEXT,
  repayment_type TEXT CHECK(repayment_type IN ('amortized', 'interest_only', 'principal_equal')) DEFAULT 'amortized',
  settled_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_next_due ON loans(next_due_date);
`;

db.exec(loansMigration);

// Add repayment_type column if missing (idempotent)
const loanColumns = db.prepare(`PRAGMA table_info(loans)`).all() as { name: string }[];
const repaymentCol = loanColumns.find((c) => c.name === 'repayment_type');
if (!repaymentCol) {
  try {
    db.exec(`ALTER TABLE loans ADD COLUMN repayment_type TEXT CHECK(repayment_type IN ('amortized','interest_only','principal_equal')) DEFAULT 'amortized'`);
  } catch (err) {
    console.warn('repayment_type migration skipped:', err);
  }
}

const hasSettledAt = loanColumns.some((c) => c.name === 'settled_at');
if (!hasSettledAt) {
  try {
    db.exec(`ALTER TABLE loans ADD COLUMN settled_at TEXT`);
  } catch (err) {
    console.warn('settled_at migration skipped:', err);
  }
}

// Ensure loans table CHECK constraint allows principal_equal (rebuild if old schema)
const loansSchemaSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='loans'`).get() as { sql?: string } | undefined;
if (loansSchemaSql?.sql && !loansSchemaSql.sql.includes('principal_equal')) {
  console.log('Rebuilding loans table to add principal_equal constraint...');
  db.transaction(() => {
    db.exec(`ALTER TABLE loans RENAME TO loans_backup`);
    db.exec(loansMigration);
    db.exec(`
      INSERT INTO loans (
        id, user_id, name, principal, interest_rate, term_months, start_date, monthly_due_day,
        account_id, category_id, remaining_principal, monthly_payment, paid_months, next_due_date, repayment_type, settled_at, created_at
      )
      SELECT
        id, user_id, name, principal, interest_rate, term_months, start_date, monthly_due_day,
        account_id, category_id, remaining_principal, monthly_payment, paid_months, next_due_date,
        CASE WHEN repayment_type IN ('amortized','interest_only','principal_equal') THEN repayment_type ELSE 'amortized' END,
        settled_at,
        created_at
      FROM loans_backup;
    `);
    db.exec(`DROP TABLE loans_backup`);
  })();
  console.log('Loans table rebuilt.');
}

// Initialize database
export function initDatabase() {
  console.log('Initializing database...');
  
  // Run schema
  db.exec(schema);
  console.log('Schema created.');
  
  // Run seed data
  db.exec(seedData);
  console.log('Seed data inserted.');
  
  console.log('Database initialized successfully!');
}

// Check if database needs initialization
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='users'
`).get();

if (!tableExists) {
  initDatabase();
}

export default db;

