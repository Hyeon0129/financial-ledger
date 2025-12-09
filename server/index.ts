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

// ========== TRANSACTIONS ==========

app.get('/api/transactions', (req, res) => {
  const { month, type, category_id } = req.query;
  
  // Auto-generate transactions from recurring payments for the requested month
  if (month) {
    const recurringPayments = db.prepare(`
      SELECT * FROM recurring_payments 
      WHERE user_id = ? AND is_active = 1
    `).all(DEMO_USER_ID) as any[];
    
    for (const payment of recurringPayments) {
      const startDate = new Date(payment.next_billing_date);
      const [year, monthNum] = (month as string).split('-').map(Number);
      
      // Calculate if this payment should occur in the requested month
      let shouldGenerate = false;
      let transactionDate = '';
      
      if (payment.cycle === 'monthly') {
        // Check if start date is before or in this month
        if (startDate <= new Date(year, monthNum, 0)) {
          // Generate transaction for this month
          const day = startDate.getDate();
          transactionDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          shouldGenerate = true;
        }
      }
      
      if (shouldGenerate) {
        // Check if transaction already exists
        const existing = db.prepare(`
          SELECT id FROM transactions 
          WHERE user_id = ? 
          AND category_id = ? 
          AND amount = ? 
          AND date = ?
          AND memo LIKE ?
        `).get(DEMO_USER_ID, payment.category_id, payment.amount, transactionDate, `%${payment.name}%`);
        
        if (!existing) {
          // Create transaction
          const txId = uuidv4();
          db.prepare(`
            INSERT INTO transactions (id, user_id, type, amount, category_id, account_id, date, memo)
            VALUES (?, ?, 'expense', ?, ?, ?, ?, ?)
          `).run(txId, DEMO_USER_ID, payment.amount, payment.category_id, payment.account_id, transactionDate, `[자동] ${payment.name}`);
        }
      }
    }
  }
  
  let query = `
    SELECT t.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = ?
  `;
  const params: any[] = [DEMO_USER_ID];
  
  if (month) {
    query += ` AND strftime('%Y-%m', t.date) = ?`;
    params.push(month);
  }
  if (type && type !== 'all') {
    query += ` AND t.type = ?`;
    params.push(type);
  }
  if (category_id && category_id !== 'all') {
    query += ` AND t.category_id = ?`;
    params.push(category_id);
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

// ========== BUDGETS ==========

app.get('/api/budgets', (req, res) => {
  // Budgets are now permanent (not month-specific)
  let query = `
    SELECT b.*, c.name as category_name, c.color as category_color
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = ? AND b.month = 'permanent'
  `;
  const params: any[] = [DEMO_USER_ID];
  
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

