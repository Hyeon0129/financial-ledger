import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Demo user ID (in production, use auth middleware)
const DEMO_USER_ID = 'demo-user';

// ===== Loans helpers =====
const clampDay = (year: number, monthIndex: number, day: number) => {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, daysInMonth);
};

const toDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const formatYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addMonthsKeepDay = (dateStr: string, targetDay: number) => {
  const d = toDate(dateStr);
  d.setMonth(d.getMonth() + 1, 1);
  const day = clampDay(d.getFullYear(), d.getMonth(), targetDay);
  d.setDate(day);
  return formatYMD(d);
};

const getFirstDueDate = (startDate: string, dueDay: number) => {
  const start = toDate(startDate);
  const candidate = new Date(start.getFullYear(), start.getMonth(), clampDay(start.getFullYear(), start.getMonth(), dueDay));
  if (candidate < start) {
    return addMonthsKeepDay(formatYMD(start), dueDay);
  }
  return formatYMD(candidate);
};

const calcMonthlyPayment = (principal: number, annualRate: number, termMonths: number, repaymentType: 'amortized' | 'interest_only' | 'principal_equal') => {
  const r = annualRate / 100 / 12;
  if (repaymentType === 'interest_only') {
    if (r === 0) return 0;
    return Math.round(principal * r);
  }
  if (repaymentType === 'principal_equal') {
    const principalPortion = principal / termMonths;
    const firstInterest = principal * r;
    return Math.round(principalPortion + firstInterest);
  }
  if (r === 0) return Math.round(principal / termMonths);
  const payment = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return Math.round(payment);
};

type LoanRow = {
  id: string;
  name: string;
  principal: number;
  interest_rate: number;
  term_months: number;
  start_date: string;
  monthly_due_day: number;
  account_id: string;
  category_id: string | null;
  remaining_principal: number;
  monthly_payment: number;
  paid_months: number;
  next_due_date: string | null;
  repayment_type: 'amortized' | 'interest_only' | 'principal_equal';
  settled_at: string | null;
};

const processLoans = () => {
  const today = formatYMD(new Date());
  const currentYear = String(new Date().getFullYear());
  // Clean incorrect/old generated loan repayments for this year (Jan~Dec)
  db.prepare(`DELETE FROM transactions WHERE user_id = ? AND memo LIKE '[대출상환]%' AND strftime('%Y', date) = ?`).run(DEMO_USER_ID, currentYear);
  const loans = db.prepare(`SELECT * FROM loans WHERE user_id = ?`).all(DEMO_USER_ID) as LoanRow[];
  const updateStmt = db.prepare(`
    UPDATE loans 
    SET remaining_principal = ?, paid_months = ?, next_due_date = ?, monthly_payment = ?
    WHERE id = ?
  `);
  const insertTx = db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount, category_id, account_id, date, memo)
    VALUES (?, ?, 'expense', ?, ?, ?, ?, ?)
  `);

  loans.forEach((loan) => {
    const dueDay = Math.min(28, Math.max(1, loan.monthly_due_day || 1));
    const monthlyRate = loan.interest_rate / 100 / 12;
    const isInterestOnly = loan.repayment_type === 'interest_only';
    const isPrincipalEqual = loan.repayment_type === 'principal_equal';
    const monthlyPayment = calcMonthlyPayment(loan.principal, loan.interest_rate, loan.term_months, loan.repayment_type);

    let remaining = loan.principal;
    let paidMonths = 0;
    let nextDue = getFirstDueDate(loan.start_date, dueDay);
    const stopDate = loan.settled_at ? formatYMD(toDate(loan.settled_at)) : today;

    while (nextDue && paidMonths < loan.term_months && nextDue <= stopDate) {
      const interestPortion = Math.round(remaining * monthlyRate);
      let principalPortion = 0;
      let payment = 0;
      if (isInterestOnly) {
        principalPortion = 0;
        payment = interestPortion;
      } else if (isPrincipalEqual) {
        const basePrincipal = loan.principal / loan.term_months;
        principalPortion = paidMonths + 1 === loan.term_months ? remaining : basePrincipal;
        payment = Math.round(principalPortion + interestPortion);
      } else {
        // amortized
        payment = Math.round(monthlyPayment);
        principalPortion = Math.max(0, payment - interestPortion);
      }

      if (payment > 0) {
        const memo = `[대출상환] ${loan.name} ${paidMonths + 1}/${loan.term_months}`;
        insertTx.run(uuidv4(), DEMO_USER_ID, payment, loan.category_id || null, loan.account_id, nextDue, memo);
      }

      if (!isInterestOnly) {
        remaining = Math.max(0, remaining - principalPortion);
      }

      paidMonths += 1;
      nextDue = paidMonths >= loan.term_months ? null : addMonthsKeepDay(nextDue, dueDay);
    }

    let finalRemaining = isInterestOnly ? loan.principal : remaining;
    if (loan.settled_at && stopDate <= today) {
      finalRemaining = 0;
      paidMonths = loan.term_months;
      nextDue = null;
    }

    updateStmt.run(finalRemaining, paidMonths, nextDue, monthlyPayment, loan.id);
  });
};

// ========== TRANSACTIONS ==========

app.get('/api/transactions', (req, res) => {
  processLoans();
  const { month, type, category_id } = req.query;
  // Cleanup any legacy auto-generated recurring transactions and skip auto-generation
  if (month) {
    db.prepare(`DELETE FROM transactions WHERE user_id = ? AND memo LIKE '[자동] %'`).run(DEMO_USER_ID);
  }
  
  let query = `
    SELECT t.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = ?
  `;
  const params: (string | number)[] = [DEMO_USER_ID];
  
  if (month) {
    query += ` AND strftime('%Y-%m', t.date) = ?`;
    params.push(String(month));
  }
  if (type && type !== 'all') {
    query += ` AND t.type = ?`;
    params.push(String(type));
  }
  if (category_id && category_id !== 'all') {
    query += ` AND t.category_id = ?`;
    params.push(String(category_id));
  }
  
  query += ` ORDER BY t.date DESC, t.created_at DESC`;
  
  const transactions = db.prepare(query).all(...params);
  res.json(transactions);
});

app.post('/api/transactions', (req, res) => {
  const { type, amount, category_id, account_id, date, memo } = req.body;
  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount, category_id, account_id, date, memo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEMO_USER_ID, type, amount, category_id, account_id, date, memo);
  
  const transaction = db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.id = ?
  `).get(id);
  
  res.status(201).json(transaction);
});

app.put('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const { type, amount, category_id, account_id, date, memo } = req.body;
  
  db.prepare(`
    UPDATE transactions 
    SET type = ?, amount = ?, category_id = ?, account_id = ?, date = ?, memo = ?
    WHERE id = ? AND user_id = ?
  `).run(type, amount, category_id, account_id, date, memo, id, DEMO_USER_ID);
  
  const transaction = db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.id = ?
  `).get(id);
  
  res.json(transaction);
});

app.delete('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, DEMO_USER_ID);
  res.status(204).send();
});

// ========== CATEGORIES ==========

app.get('/api/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT * FROM categories WHERE user_id = ? ORDER BY type, name
  `).all(DEMO_USER_ID);
  res.json(categories);
});

app.post('/api/categories', (req, res) => {
  const { name, type, parent_id, color, icon } = req.body;
  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO categories (id, user_id, name, type, parent_id, color, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEMO_USER_ID, name, type, parent_id || null, color || '#6B7280', icon);
  
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.status(201).json(category);
});

app.put('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  const { name, type, parent_id, color, icon } = req.body;
  
  db.prepare(`
    UPDATE categories SET name = ?, type = ?, parent_id = ?, color = ?, icon = ?
    WHERE id = ? AND user_id = ?
  `).run(name, type, parent_id || null, color, icon, id, DEMO_USER_ID);
  
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.json(category);
});

app.delete('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(id, DEMO_USER_ID);
  res.status(204).send();
});

// ========== ACCOUNTS ==========

app.get('/api/accounts', (req, res) => {
  const accounts = db.prepare(`
    SELECT * FROM accounts WHERE user_id = ? ORDER BY type, name
  `).all(DEMO_USER_ID);
  res.json(accounts);
});

app.post('/api/accounts', (req, res) => {
  const { name, type, balance, color, icon } = req.body;
  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO accounts (id, user_id, name, type, balance, color, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEMO_USER_ID, name, type, balance || 0, color || '#6B7280', icon);
  
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.status(201).json(account);
});

app.put('/api/accounts/:id', (req, res) => {
  const { id } = req.params;
  const { name, type, balance, color, icon } = req.body;
  
  db.prepare(`
    UPDATE accounts SET name = ?, type = ?, balance = ?, color = ?, icon = ?
    WHERE id = ? AND user_id = ?
  `).run(name, type, balance, color, icon, id, DEMO_USER_ID);
  
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json(account);
});

app.delete('/api/accounts/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, DEMO_USER_ID);
  res.status(204).send();
});

// ========== LOANS ==========
app.get('/api/loans', (req, res) => {
  processLoans();
  const loans = db.prepare(`
    SELECT l.*, a.name as account_name, c.name as category_name, c.color as category_color
    FROM loans l
    LEFT JOIN accounts a ON l.account_id = a.id
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.user_id = ?
    ORDER BY l.created_at DESC
  `).all(DEMO_USER_ID);
  res.json(loans);
});

app.post('/api/loans', (req, res) => {
  const { name, principal, interest_rate, term_months, start_date, monthly_due_day, account_id, category_id, repayment_type } = req.body;
  const id = uuidv4();
  const dueDay = Math.min(28, Math.max(1, Number(monthly_due_day || 1)));
  const repayType: 'amortized' | 'interest_only' | 'principal_equal' =
    repayment_type === 'interest_only'
      ? 'interest_only'
      : repayment_type === 'principal_equal'
      ? 'principal_equal'
      : 'amortized';
  const monthly_payment = calcMonthlyPayment(principal, interest_rate, term_months, repayType);
  const firstDue = getFirstDueDate(start_date, dueDay);

  db.prepare(`
    INSERT INTO loans (id, user_id, name, principal, interest_rate, term_months, start_date, monthly_due_day, account_id, category_id, remaining_principal, monthly_payment, paid_months, next_due_date, repayment_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    DEMO_USER_ID,
    name,
    principal,
    interest_rate,
    term_months,
    start_date,
    dueDay,
    account_id,
    category_id || null,
    principal,
    monthly_payment,
    firstDue,
    repayType
  );

  const loan = db.prepare(`
    SELECT l.*, a.name as account_name, c.name as category_name, c.color as category_color
    FROM loans l
    LEFT JOIN accounts a ON l.account_id = a.id
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.id = ?
  `).get(id);

  res.status(201).json(loan);
});

app.put('/api/loans/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM loans WHERE id = ? AND user_id = ?`).get(id, DEMO_USER_ID) as LoanRow | undefined;
  if (!existing) return res.status(404).send();

  const {
    name = existing.name,
    principal = existing.principal,
    interest_rate = existing.interest_rate,
    term_months = existing.term_months,
    start_date = existing.start_date,
    monthly_due_day = existing.monthly_due_day,
    account_id = existing.account_id,
    category_id = existing.category_id,
    repayment_type = existing.repayment_type
  } = req.body;

  const dueDay = Math.min(28, Math.max(1, Number(monthly_due_day || existing.monthly_due_day || 1)));
  const repayType: 'amortized' | 'interest_only' | 'principal_equal' =
    repayment_type === 'interest_only'
      ? 'interest_only'
      : repayment_type === 'principal_equal'
      ? 'principal_equal'
      : 'amortized';
  const monthly_payment = calcMonthlyPayment(principal, interest_rate, term_months, repayType);

  // Rebuild next due date based on paid months to avoid duplicates
  let nextDue = getFirstDueDate(start_date, dueDay);
  for (let i = 0; i < existing.paid_months; i++) {
    nextDue = addMonthsKeepDay(nextDue, dueDay);
  }

  // Remaining principal handling
  let remaining_principal = existing.remaining_principal;
  if (repayType === 'interest_only') {
    remaining_principal = principal; // 이자만 상환 시 원금 유지
  } else if (principal !== existing.principal) {
    const paidRatio = existing.paid_months / Math.max(1, existing.term_months);
    const assumedPaid = principal * paidRatio;
    remaining_principal = Math.max(0, principal - assumedPaid);
  }

  db.prepare(`
    UPDATE loans
    SET name = ?, principal = ?, interest_rate = ?, term_months = ?, start_date = ?, monthly_due_day = ?, account_id = ?, category_id = ?, monthly_payment = ?, remaining_principal = ?, next_due_date = ?, repayment_type = ?, settled_at = NULL
    WHERE id = ? AND user_id = ?
  `).run(
    name,
    principal,
    interest_rate,
    term_months,
    start_date,
    dueDay,
    account_id,
    category_id || null,
    monthly_payment,
    remaining_principal,
    nextDue,
    repayType,
    id,
    DEMO_USER_ID
  );

  const loan = db.prepare(`
    SELECT l.*, a.name as account_name, c.name as category_name, c.color as category_color
    FROM loans l
    LEFT JOIN accounts a ON l.account_id = a.id
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.id = ?
  `).get(id);

  res.json(loan);
});

// Settle (payoff) a loan: stop future generation from the given date
app.put('/api/loans/:id/settle', (req, res) => {
  const { id } = req.params;
  const { settled_at } = req.body as { settled_at?: string };
  if (!settled_at) return res.status(400).json({ error: 'settled_at required' });
  const loan = db.prepare(`SELECT * FROM loans WHERE id = ? AND user_id = ?`).get(id, DEMO_USER_ID) as LoanRow | undefined;
  if (!loan) return res.status(404).send();
  db.prepare(`
    UPDATE loans
    SET settled_at = ?, remaining_principal = 0, next_due_date = NULL, paid_months = term_months
    WHERE id = ? AND user_id = ?
  `).run(settled_at, id, DEMO_USER_ID);

  const updated = db.prepare(`
    SELECT l.*, a.name as account_name, c.name as category_name, c.color as category_color
    FROM loans l
    LEFT JOIN accounts a ON l.account_id = a.id
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.id = ?
  `).get(id);
  res.json(updated);
});

app.delete('/api/loans/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM loans WHERE id = ? AND user_id = ?').run(id, DEMO_USER_ID);
  res.status(204).send();
});

// ========== BUDGETS ==========

app.get('/api/budgets', (req, res) => {
  // Budgets are now permanent (not month-specific)
  let query = `
    SELECT b.*, c.name as category_name, c.color as category_color
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = ? AND b.month = 'permanent'
  `;
  const params: (string | number)[] = [DEMO_USER_ID];
  
  query += ` ORDER BY c.name`;
  
  const budgets = db.prepare(query).all(...params);
  res.json(budgets);
});

app.post('/api/budgets', (req, res) => {
  const { category_id, amount } = req.body;
  
  // Check if permanent budget exists for this category
  const existing = db.prepare(`
    SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = 'permanent'
  `).get(DEMO_USER_ID, category_id) as { id: string } | undefined;
  
  if (existing) {
    db.prepare(`UPDATE budgets SET amount = ? WHERE id = ?`).run(amount, existing.id);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO budgets (id, user_id, category_id, amount, month)
      VALUES (?, ?, ?, ?, 'permanent')
    `).run(id, DEMO_USER_ID, category_id, amount);
  }
  
  const budget = db.prepare(`
    SELECT b.*, c.name as category_name, c.color as category_color
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = ? AND b.category_id = ? AND b.month = 'permanent'
  `).get(DEMO_USER_ID, category_id);
  
  res.status(201).json(budget);
});

app.delete('/api/budgets/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(id, DEMO_USER_ID);
  res.status(204).send();
});

// ========== SAVINGS GOALS ==========

app.get('/api/savings-goals', (req, res) => {
  const goals = db.prepare(`
    SELECT * FROM savings_goals WHERE user_id = ? ORDER BY deadline
  `).all(DEMO_USER_ID);
  res.json(goals);
});

app.post('/api/savings-goals', (req, res) => {
  const { name, target_amount, current_amount, deadline, color, icon } = req.body;
  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, deadline, color, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEMO_USER_ID, name, target_amount, current_amount || 0, deadline, color || '#0A84FF', icon);
  
  const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);
  res.status(201).json(goal);
});

app.put('/api/savings-goals/:id', (req, res) => {
  const { id } = req.params;
  const { name, target_amount, current_amount, deadline, color, icon } = req.body;
  
  db.prepare(`
    UPDATE savings_goals SET name = ?, target_amount = ?, current_amount = ?, deadline = ?, color = ?, icon = ?
    WHERE id = ? AND user_id = ?
  `).run(name, target_amount, current_amount, deadline, color, icon, id, DEMO_USER_ID);
  
  const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);
  res.json(goal);
});

app.delete('/api/savings-goals/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(id, DEMO_USER_ID);
  res.status(204).send();
});

// ========== RECURRING PAYMENTS ==========

app.get('/api/recurring-payments', (req, res) => {
  const payments = db.prepare(`
    SELECT r.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM recurring_payments r
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN accounts a ON r.account_id = a.id
    WHERE r.user_id = ?
    ORDER BY r.next_billing_date
  `).all(DEMO_USER_ID);
  res.json(payments);
});

app.post('/api/recurring-payments', (req, res) => {
  const { name, amount, category_id, account_id, cycle, next_billing_date, is_active } = req.body;
  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO recurring_payments (id, user_id, name, amount, category_id, account_id, cycle, next_billing_date, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEMO_USER_ID, name, amount, category_id, account_id, cycle, next_billing_date, is_active !== false ? 1 : 0);
  
  const payment = db.prepare(`
    SELECT r.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM recurring_payments r
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN accounts a ON r.account_id = a.id
    WHERE r.id = ?
  `).get(id);
  
  res.status(201).json(payment);
});

app.put('/api/recurring-payments/:id', (req, res) => {
  const { id } = req.params;
  const { name, amount, category_id, account_id, cycle, next_billing_date, is_active } = req.body;
  
  db.prepare(`
    UPDATE recurring_payments 
    SET name = ?, amount = ?, category_id = ?, account_id = ?, cycle = ?, next_billing_date = ?, is_active = ?
    WHERE id = ? AND user_id = ?
  `).run(name, amount, category_id, account_id, cycle, next_billing_date, is_active ? 1 : 0, id, DEMO_USER_ID);
  
  const payment = db.prepare(`
    SELECT r.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM recurring_payments r
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN accounts a ON r.account_id = a.id
    WHERE r.id = ?
  `).get(id);
  
  res.json(payment);
});

app.delete('/api/recurring-payments/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM recurring_payments WHERE id = ? AND user_id = ?').run(id, DEMO_USER_ID);
  res.status(204).send();
});

// ========== STATISTICS ==========

app.get('/api/stats/monthly', (req, res) => {
  processLoans();
  const { month } = req.query;
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  
  // Income/Expense summary
  const summary = db.prepare(`
    SELECT 
      type,
      SUM(amount) as total,
      COUNT(*) as count
    FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    GROUP BY type
  `).all(DEMO_USER_ID, targetMonth) as { type: string; total: number; count: number }[];
  
  // Category breakdown
  const byCategory = db.prepare(`
    SELECT 
      t.category_id,
      c.name as category_name,
      c.color as category_color,
      t.type,
      SUM(t.amount) as total
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND strftime('%Y-%m', t.date) = ?
    GROUP BY t.category_id, t.type
    ORDER BY total DESC
  `).all(DEMO_USER_ID, targetMonth);
  
  // Daily spending trend
  const dailyTrend = db.prepare(`
    SELECT 
      date,
      type,
      SUM(amount) as total
    FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    GROUP BY date, type
    ORDER BY date
  `).all(DEMO_USER_ID, targetMonth);
  
  // Budget usage
  const budgetUsage = db.prepare(`
    SELECT 
      b.id,
      b.category_id,
      c.name as category_name,
      c.color as category_color,
      b.amount as budget_amount,
      COALESCE(SUM(t.amount), 0) as spent
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    LEFT JOIN transactions t ON t.category_id = b.category_id 
      AND t.user_id = b.user_id 
      AND strftime('%Y-%m', t.date) = b.month
      AND t.type = 'expense'
    WHERE b.user_id = ? AND b.month = ?
    GROUP BY b.id
  `).all(DEMO_USER_ID, targetMonth);
  
  const income = summary.find(s => s.type === 'income')?.total || 0;
  const expense = summary.find(s => s.type === 'expense')?.total || 0;
  
  res.json({
    month: targetMonth,
    income,
    expense,
    balance: income - expense,
    transactionCount: summary.reduce((sum, s) => sum + s.count, 0),
    byCategory,
    dailyTrend,
    budgetUsage
  });
});

app.get('/api/stats/yearly', (req, res) => {
  processLoans();
  const year = req.query.year || new Date().getFullYear();
  
  const monthlyTrend = db.prepare(`
    SELECT 
      strftime('%Y-%m', date) as month,
      type,
      SUM(amount) as total
    FROM transactions
    WHERE user_id = ? AND strftime('%Y', date) = ?
    GROUP BY month, type
    ORDER BY month
  `).all(DEMO_USER_ID, String(year));
  
  res.json({ year, monthlyTrend });
});

// ========== USER ==========

app.get('/api/user', (req, res) => {
  const user = db.prepare(`
    SELECT id, email, name, avatar_url, currency, created_at 
    FROM users WHERE id = ?
  `).get(DEMO_USER_ID);
  res.json(user);
});

app.put('/api/user', (req, res) => {
  const { name, currency } = req.body;
  
  db.prepare(`
    UPDATE users SET name = ?, currency = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name, currency, DEMO_USER_ID);
  
  const user = db.prepare(`
    SELECT id, email, name, avatar_url, currency, created_at 
    FROM users WHERE id = ?
  `).get(DEMO_USER_ID);
  
  res.json(user);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

