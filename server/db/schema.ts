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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
`;

export const seedData = `
-- Default demo user
INSERT OR IGNORE INTO users (id, email, password_hash, name, currency)
VALUES ('demo-user', 'demo@example.com', 'demo123', '사용자', '₩');

-- Default expense categories (parent + child structure)
INSERT OR IGNORE INTO categories (id, user_id, name, type, parent_id, color) VALUES
-- top-level
('cat_food', 'demo-user', '식비', 'expense', NULL, '#6B7280'),
('cat_living', 'demo-user', '주거/생활', 'expense', NULL, '#6B7280'),
('cat_transport_top', 'demo-user', '교통/이동', 'expense', NULL, '#6B7280'),
('cat_shopping_top', 'demo-user', '쇼핑/취미', 'expense', NULL, '#6B7280'),
('cat_others_top', 'demo-user', '기타 지출', 'expense', NULL, '#6B7280'),
-- 식비 상세
('cat_food_out', 'demo-user', '외식', 'expense', 'cat_food', '#6B7280'),
('cat_food_snack', 'demo-user', '간식/디저트', 'expense', 'cat_food', '#6B7280'),
('cat_food_groceries', 'demo-user', '마트/장보기', 'expense', 'cat_food', '#6B7280'),
-- 주거/생활
('cat_rent', 'demo-user', '월세/관리비', 'expense', 'cat_living', '#6B7280'),
('cat_utility', 'demo-user', '통신/공과금', 'expense', 'cat_living', '#6B7280'),
-- 교통/이동
('cat_transport', 'demo-user', '교통비', 'expense', 'cat_transport_top', '#6B7280'),
('cat_travel', 'demo-user', '여행', 'expense', 'cat_transport_top', '#6B7280'),
-- 쇼핑/취미
('cat_shopping', 'demo-user', '일반 쇼핑', 'expense', 'cat_shopping_top', '#6B7280'),
('cat_entertainment', 'demo-user', '문화/여가', 'expense', 'cat_shopping_top', '#6B7280'),
('cat_beauty', 'demo-user', '미용/건강', 'expense', 'cat_shopping_top', '#6B7280'),
-- 기타
('cat_medical', 'demo-user', '의료비', 'expense', 'cat_others_top', '#6B7280'),
('cat_education', 'demo-user', '교육/도서', 'expense', 'cat_others_top', '#6B7280'),
('cat_gift', 'demo-user', '경조사/선물', 'expense', 'cat_others_top', '#6B7280'),
('cat_other_expense', 'demo-user', '기타지출', 'expense', 'cat_others_top', '#6B7280');

-- Default income categories
INSERT OR IGNORE INTO categories (id, user_id, name, type, parent_id, color) VALUES
('cat_salary', 'demo-user', '급여', 'income', NULL, '#6B7280'),
('cat_bonus', 'demo-user', '상여금', 'income', 'cat_salary', '#6B7280'),
('cat_investment', 'demo-user', '투자수익', 'income', NULL, '#6B7280'),
('cat_side', 'demo-user', '부수입', 'income', NULL, '#6B7280'),
('cat_other_income', 'demo-user', '기타수입', 'income', 'cat_side', '#6B7280');

-- Default accounts
INSERT OR IGNORE INTO accounts (id, user_id, name, type, balance, color) VALUES
('acc_cash', 'demo-user', '현금', 'cash', 100000, '#10B981'),
('acc_main', 'demo-user', '주거래통장', 'bank', 2500000, '#3B82F6'),
('acc_savings', 'demo-user', '저축통장', 'bank', 5000000, '#8B5CF6'),
('acc_card', 'demo-user', '신용카드', 'card', 0, '#EF4444'),
('acc_check', 'demo-user', '체크카드', 'card', 0, '#F59E0B');

-- Sample transactions for current month
INSERT OR IGNORE INTO transactions (id, user_id, type, amount, category_id, account_id, date, memo) VALUES
('tx_1', 'demo-user', 'income', 3500000, 'cat_salary', 'acc_main', date('now', 'start of month', '+4 days'), '12월 급여'),
('tx_2', 'demo-user', 'expense', 850000, 'cat_rent', 'acc_main', date('now', 'start of month', '+1 days'), '월세'),
('tx_3', 'demo-user', 'expense', 150000, 'cat_utility', 'acc_main', date('now', 'start of month', '+5 days'), '전기/가스/수도'),
('tx_4', 'demo-user', 'expense', 89000, 'cat_subscription', 'acc_card', date('now', 'start of month', '+3 days'), '넷플릭스/스포티파이'),
('tx_5', 'demo-user', 'expense', 45000, 'cat_food', 'acc_card', date('now', 'start of month', '+6 days'), '배달음식'),
('tx_6', 'demo-user', 'expense', 32000, 'cat_cafe', 'acc_card', date('now', 'start of month', '+7 days'), '스타벅스'),
('tx_7', 'demo-user', 'expense', 180000, 'cat_mart', 'acc_check', date('now', 'start of month', '+8 days'), '이마트 장보기'),
('tx_8', 'demo-user', 'expense', 52000, 'cat_transport', 'acc_check', date('now', 'start of month', '+9 days'), '지하철/버스 충전'),
('tx_9', 'demo-user', 'expense', 120000, 'cat_shopping', 'acc_card', date('now', 'start of month', '+10 days'), '의류 구매'),
('tx_10', 'demo-user', 'expense', 65000, 'cat_entertainment', 'acc_card', date('now', 'start of month', '+11 days'), '영화/공연'),
('tx_11', 'demo-user', 'income', 250000, 'cat_side', 'acc_main', date('now', 'start of month', '+12 days'), '프리랜서 수입'),
('tx_12', 'demo-user', 'expense', 38000, 'cat_food', 'acc_card', date('now', 'start of month', '+13 days'), '외식'),
('tx_13', 'demo-user', 'expense', 28000, 'cat_beauty', 'acc_card', date('now', 'start of month', '+14 days'), '미용실');

-- Sample budgets for current month
INSERT OR REPLACE INTO budgets (id, user_id, category_id, amount, month) VALUES
('budget_1', 'demo-user', 'cat_food', 500000, strftime('%Y-%m', 'now')),
('budget_2', 'demo-user', 'cat_cafe', 150000, strftime('%Y-%m', 'now')),
('budget_3', 'demo-user', 'cat_mart', 350000, strftime('%Y-%m', 'now')),
('budget_4', 'demo-user', 'cat_transport', 150000, strftime('%Y-%m', 'now')),
('budget_5', 'demo-user', 'cat_shopping', 200000, strftime('%Y-%m', 'now')),
('budget_6', 'demo-user', 'cat_entertainment', 150000, strftime('%Y-%m', 'now'));

-- Sample savings goals
INSERT OR IGNORE INTO savings_goals (id, user_id, name, target_amount, current_amount, deadline, color) VALUES
('goal_1', 'demo-user', '비상금', 10000000, 5000000, '2025-12-31', '#10B981'),
('goal_2', 'demo-user', '해외여행', 3000000, 800000, '2025-06-30', '#3B82F6'),
('goal_3', 'demo-user', '노트북 구매', 2000000, 1200000, '2025-03-31', '#8B5CF6');

-- Sample recurring payments
INSERT OR IGNORE INTO recurring_payments (id, user_id, name, amount, category_id, account_id, cycle, next_billing_date) VALUES
('rec_1', 'demo-user', '넷플릭스', 17000, 'cat_subscription', 'acc_card', 'monthly', date('now', 'start of month', '+1 month', '+2 days')),
('rec_2', 'demo-user', '스포티파이', 10900, 'cat_subscription', 'acc_card', 'monthly', date('now', 'start of month', '+1 month', '+5 days')),
('rec_3', 'demo-user', '헬스장', 80000, 'cat_beauty', 'acc_card', 'monthly', date('now', 'start of month', '+1 month', '+1 days')),
('rec_4', 'demo-user', '휴대폰 요금', 55000, 'cat_utility', 'acc_main', 'monthly', date('now', 'start of month', '+1 month', '+15 days'));
`;

