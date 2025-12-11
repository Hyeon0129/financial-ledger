// Database Schema for SQLite
export const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  currency TEXT DEFAULT '₩',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Categories table (supports parent / child hierarchy)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
  parent_id TEXT,
  color TEXT DEFAULT '#6B7280',
  icon TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('cash', 'bank', 'card', 'investment')) NOT NULL,
  balance REAL DEFAULT 0,
  color TEXT DEFAULT '#6B7280',
  icon TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT CHECK(type IN ('income', 'expense', 'transfer')) NOT NULL,
  amount REAL NOT NULL,
  category_id TEXT,
  account_id TEXT,
  to_account_id TEXT,
  date TEXT NOT NULL,
  memo TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  amount REAL NOT NULL,
  month TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE(user_id, category_id, month)
);

-- Savings Goals table
CREATE TABLE IF NOT EXISTS savings_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  current_amount REAL DEFAULT 0,
  deadline TEXT,
  color TEXT DEFAULT '#0A84FF',
  icon TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Recurring Payments table
CREATE TABLE IF NOT EXISTS recurring_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  category_id TEXT,
  account_id TEXT,
  cycle TEXT CHECK(cycle IN ('daily', 'weekly', 'monthly', 'yearly')) NOT NULL,
  next_billing_date TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Loans table (대출 관리)
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL, -- 연이율 (%)
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
`;

export const seedData = `
-- Minimal seed intentionally left almost empty to start from a blank state.
-- Keep only a single user row so foreign-keyed tables (accounts, categories, etc.)
-- can be used without authentication. All other demo data has been removed.
INSERT OR IGNORE INTO users (id, email, password_hash, name, currency)
VALUES ('demo-user', 'local@example.com', 'local-user', '사용자', '₩');
`;

