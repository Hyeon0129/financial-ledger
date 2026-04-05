PRAGMA foreign_keys = ON;

-- UUID v4-ish helper (inline default expression)
-- Each id column uses this expression as DEFAULT.
-- Example: lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  currency TEXT NOT NULL DEFAULT '₩',

  -- preferences (local-first; keeps parity with UI settings)
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  month_start_mode TEXT NOT NULL DEFAULT 'day1' CHECK (month_start_mode IN ('day1','payday')),
  payday_day INTEGER NOT NULL DEFAULT 1 CHECK (payday_day BETWEEN 1 AND 31),
  budget_alert_enabled INTEGER NOT NULL DEFAULT 1 CHECK (budget_alert_enabled IN (0,1)),
  budget_alert_rate INTEGER NOT NULL DEFAULT 80 CHECK (budget_alert_rate BETWEEN 0 AND 100),
  month_end_reminder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (month_end_reminder_enabled IN (0,1)),

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||
    '-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))
  ),
  user_id TEXT NOT NULL,

  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#6B7280',
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||
    '-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))
  ),
  user_id TEXT NOT NULL,

  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','bank','card','investment')),
  balance REAL DEFAULT 0,
  color TEXT DEFAULT '#6B7280',
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||
    '-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))
  ),
  user_id TEXT NOT NULL,

  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  amount REAL NOT NULL,

  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,

  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  memo TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||
    '-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))
  ),
  user_id TEXT NOT NULL,

  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  month TEXT NOT NULL, -- 'YYYY-MM'

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(user_id, category_id, month),
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);

CREATE TABLE IF NOT EXISTS savings_goals (
  id TEXT PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||
    '-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))
  ),
  user_id TEXT NOT NULL,

  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  current_amount REAL DEFAULT 0,
  deadline TEXT,
  color TEXT DEFAULT '#0A84FF',
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON savings_goals(user_id);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||
    '-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))
  ),
  user_id TEXT NOT NULL,

  name TEXT NOT NULL,
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL,
  term_months INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  monthly_due_day INTEGER NOT NULL,

  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,

  remaining_principal REAL NOT NULL,
  monthly_payment REAL NOT NULL,
  paid_months INTEGER DEFAULT 0,
  next_due_date TEXT,

  repayment_type TEXT DEFAULT 'amortized' CHECK (repayment_type IN ('amortized','interest_only','principal_equal')),

  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_next_due ON loans(next_due_date);

CREATE TABLE IF NOT EXISTS recurring_payments (
  id TEXT PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||
    '-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))
  ),
  user_id TEXT NOT NULL,

  name TEXT NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('living','utility','subscription','custom')),
  group_label TEXT,

  amount REAL NOT NULL CHECK (amount > 0),

  cadence TEXT NOT NULL CHECK (cadence IN ('weekly','monthly','yearly','custom_days')),
  interval_days INTEGER,

  first_payment_date TEXT NOT NULL, -- 'YYYY-MM-DD'
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,

  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,

  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  CHECK (group_type <> 'custom' OR (group_label IS NOT NULL AND length(trim(group_label)) > 0)),
  CHECK (cadence <> 'custom_days' OR (interval_days IS NOT NULL AND interval_days >= 1)),

  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recurring_payments_user ON recurring_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_user_first ON recurring_payments(user_id, first_payment_date);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_user_account ON recurring_payments(user_id, account_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_payments_user_name
ON recurring_payments(user_id, lower(name));

DROP VIEW IF EXISTS recurring_payments_next_due;
CREATE VIEW recurring_payments_next_due AS
SELECT
  rp.*,
  CASE
    WHEN rp.cadence = 'weekly' THEN
      date(
        rp.first_payment_date,
        printf(
          '+%d days',
          CAST(((max(0, CAST(julianday('now') - julianday(rp.first_payment_date) AS INTEGER)) + 6) / 7) AS INTEGER) * 7
        )
      )
    WHEN rp.cadence = 'custom_days' THEN
      date(
        rp.first_payment_date,
        printf(
          '+%d days',
          CAST(
            (
              (max(0, CAST(julianday('now') - julianday(rp.first_payment_date) AS INTEGER)) + (max(1, COALESCE(rp.interval_days, 1)) - 1))
              / max(1, COALESCE(rp.interval_days, 1))
            ) AS INTEGER
          ) * max(1, COALESCE(rp.interval_days, 1))
        )
      )
    WHEN rp.cadence = 'monthly' THEN
      (
        CASE
          WHEN date(
            date('now', 'start of month'),
            printf(
              '+%d days',
              min(
                CAST(strftime('%d', rp.first_payment_date) AS INTEGER),
                CAST(strftime('%d', date('now', 'start of month', '+1 month', '-1 day')) AS INTEGER)
              ) - 1
            )
          ) >= date('now')
          THEN date(
            date('now', 'start of month'),
            printf(
              '+%d days',
              min(
                CAST(strftime('%d', rp.first_payment_date) AS INTEGER),
                CAST(strftime('%d', date('now', 'start of month', '+1 month', '-1 day')) AS INTEGER)
              ) - 1
            )
          )
          ELSE date(
            date('now', 'start of month', '+1 month'),
            printf(
              '+%d days',
              min(
                CAST(strftime('%d', rp.first_payment_date) AS INTEGER),
                CAST(strftime('%d', date('now', 'start of month', '+2 month', '-1 day')) AS INTEGER)
              ) - 1
            )
          )
        END
      )
    ELSE
      (
        CASE
          WHEN date(
            printf(
              '%04d-%02d-01',
              CAST(strftime('%Y', 'now') AS INTEGER),
              CAST(strftime('%m', rp.first_payment_date) AS INTEGER)
            ),
            printf(
              '+%d days',
              min(
                CAST(strftime('%d', rp.first_payment_date) AS INTEGER),
                CAST(
                  strftime(
                    '%d',
                    date(
                      printf(
                        '%04d-%02d-01',
                        CAST(strftime('%Y', 'now') AS INTEGER),
                        CAST(strftime('%m', rp.first_payment_date) AS INTEGER)
                      ),
                      '+1 month',
                      '-1 day'
                    )
                  ) AS INTEGER
                )
              ) - 1
            )
          ) >= date('now')
          THEN date(
            printf(
              '%04d-%02d-01',
              CAST(strftime('%Y', 'now') AS INTEGER),
              CAST(strftime('%m', rp.first_payment_date) AS INTEGER)
            ),
            printf(
              '+%d days',
              min(
                CAST(strftime('%d', rp.first_payment_date) AS INTEGER),
                CAST(
                  strftime(
                    '%d',
                    date(
                      printf(
                        '%04d-%02d-01',
                        CAST(strftime('%Y', 'now') AS INTEGER),
                        CAST(strftime('%m', rp.first_payment_date) AS INTEGER)
                      ),
                      '+1 month',
                      '-1 day'
                    )
                  ) AS INTEGER
                )
              ) - 1
            )
          )
          ELSE date(
            printf(
              '%04d-%02d-01',
              CAST(strftime('%Y', 'now') AS INTEGER) + 1,
              CAST(strftime('%m', rp.first_payment_date) AS INTEGER)
            ),
            printf(
              '+%d days',
              min(
                CAST(strftime('%d', rp.first_payment_date) AS INTEGER),
                CAST(
                  strftime(
                    '%d',
                    date(
                      printf(
                        '%04d-%02d-01',
                        CAST(strftime('%Y', 'now') AS INTEGER) + 1,
                        CAST(strftime('%m', rp.first_payment_date) AS INTEGER)
                      ),
                      '+1 month',
                      '-1 day'
                    )
                  ) AS INTEGER
                )
              ) - 1
            )
          )
        END
      )
  END AS next_due_date
FROM recurring_payments rp
WHERE rp.is_active = 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_user_memo_autopay
ON transactions(user_id, memo)
WHERE memo LIKE 'AUTO_BILL|%' OR memo LIKE 'AUTO_CARD|%';
