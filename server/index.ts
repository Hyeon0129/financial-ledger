import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ===== Common validators =====
const isValidDateStrict = (value: string | undefined | null): boolean => {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = value.split('-').map(Number);
  return (
    d.getFullYear() === y &&
    d.getMonth() === (m || 1) - 1 &&
    d.getDate() === (day || 1)
  );
};

const assertPositive = (num: unknown) => typeof num === 'number' && Number.isFinite(num) && num > 0;

const normalizeMoney = (num: unknown) => (typeof num === 'number' ? Number(num) : Number(num ?? 0));

// Basic transaction shape for type safety in this file
type TransactionRow = {
  id: string;
  user_id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  date: string;
  memo: string | null;
};

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Demo user ID (in production, use auth middleware)
const DEMO_USER_ID = 'demo-user';
const AUTO_PROCESS_LOANS = process.env.AUTO_PROCESS_LOANS !== 'false';



const scrubLoanMemo = (memo: string | null): string | null => {
  if (!memo) return memo;
  return memo.replace(/^\[대출상환:[^\]]+\]\s*/, '[대출상환] ');
};
// any 타입은 유지하되 lint 무시
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sanitizeTransaction = (t: any) => ({
  ...t,
  memo: scrubLoanMemo(t.memo),
});

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

const adjustAccountBalance = (accountId: string | null | undefined, delta: number) => {
  if (!accountId) return;
  db.prepare(`UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?`).run(delta, accountId, DEMO_USER_ID);
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
  const existingTx = db.prepare(`
    SELECT id, account_id FROM transactions 
    WHERE user_id = ? AND memo = ? AND date = ?
  `);
  // Broad duplicate detector for past 상환 기록 (old/new memo 형태 포함)
  // 신규 포맷: loan.id를 포함해 동일 계좌/날짜라도 대출별로 확실히 구분
  const existingTxLoanDay = db.prepare(`
    SELECT id, memo, account_id FROM transactions 
    WHERE user_id = ? AND date = ? AND memo LIKE ?
  `);
  // 레거시 포맷(loan.id 미포함)도 한 번만 업데이트하도록 탐지 (후처리에서 loan.name으로 필터)
  const existingTxLoanDayLegacy = db.prepare(`
    SELECT id, memo, account_id FROM transactions 
    WHERE user_id = ? AND date = ? AND memo LIKE '%대출상환%'
  `);

  loans.forEach((loan) => {
    const dueDay = Math.min(28, Math.max(1, loan.monthly_due_day || 1));
    const monthlyRate = loan.interest_rate / 100 / 12;
    const isInterestOnly = loan.repayment_type === 'interest_only';
    const isPrincipalEqual = loan.repayment_type === 'principal_equal';
    let remaining = loan.remaining_principal ?? loan.principal;
    let paidMonths = loan.paid_months ?? 0;
    // nextDue를 start_date 기준 paidMonths만큼 전진해 재계산
    let nextDue: string | null = getFirstDueDate(loan.start_date, dueDay);
    for (let i = 0; i < paidMonths && nextDue; i++) {
      nextDue = addMonthsKeepDay(nextDue, dueDay);
    }
    const stopDate = loan.settled_at ? formatYMD(toDate(loan.settled_at)) : today;

    // 남은 기간/금액으로 월 상환액 재계산
    const remainingMonths = Math.max(loan.term_months - paidMonths, 1);
    const monthlyPayment = calcMonthlyPayment(Math.max(remaining, 0), loan.interest_rate, remainingMonths, loan.repayment_type);

    while (nextDue && paidMonths < loan.term_months && nextDue <= stopDate) {
      if (remaining <= 0) {
        nextDue = null;
        break;
      }
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
        // 메모에 loan.id를 포함해 동일 계좌/날짜라도 대출별로 확실히 구분
        const memo = `[대출상환:${loan.id}] ${loan.name}:${paidMonths + 1}/${loan.term_months}`;
        const dupExact = existingTx.get(DEMO_USER_ID, memo, nextDue) as { id: string; account_id: string } | undefined;
        const dupSameLoan = existingTxLoanDay.get(DEMO_USER_ID, nextDue, `[대출상환:${loan.id}]%`) as { id: string; memo: string; account_id: string } | undefined;
        // 레거시: 같은 계좌/날짜라도 메모가 이 대출 이름으로 시작하는 경우만 승격 (다른 대출은 건드리지 않음)
        const legacyCandidates = existingTxLoanDayLegacy.all(DEMO_USER_ID, nextDue) as Array<{ id: string; memo: string; account_id: string }>;
        const dupLegacy = legacyCandidates.find((row) => row.memo?.startsWith(`[대출상환] ${loan.name}:`));
        if (dupExact) {
          // 동일 메모가 이미 존재하면 새로 만들지 않음
        } else if (dupSameLoan?.id) {
          // 같은 대출(신규 포맷)인데 메모만 다르면 최신 포맷으로 교체
          db.prepare(`UPDATE transactions SET memo = ? WHERE id = ?`).run(memo, dupSameLoan.id);
        } else if (dupLegacy?.id) {
          // 같은 이름의 레거시 포맷만 새 포맷으로 승격 (다른 대출은 그대로 둠)
          db.prepare(`UPDATE transactions SET memo = ? WHERE id = ?`).run(memo, dupLegacy.id);
        } else {
          insertTx.run(uuidv4(), DEMO_USER_ID, payment, loan.category_id || null, loan.account_id, nextDue, memo);
          adjustAccountBalance(loan.account_id, -payment);
        }
        // 항상 원금 감소/스케줄 진행
        if (!isInterestOnly) {
          remaining = Math.max(0, remaining - principalPortion);
        }
        paidMonths += 1;
        nextDue = paidMonths >= loan.term_months ? null : addMonthsKeepDay(nextDue!, dueDay);
        continue;
      }

      // payment가 0이면 스케줄만 진행
      paidMonths += 1;
      nextDue = paidMonths >= loan.term_months ? null : addMonthsKeepDay(nextDue!, dueDay);
    }

    const finalRemaining = Math.max(0, remaining);
    updateStmt.run(finalRemaining, paidMonths, nextDue, monthlyPayment, loan.id);
  });
};

// ========== TRANSACTIONS ==========

app.get('/api/transactions', (req, res) => {
  if (AUTO_PROCESS_LOANS) processLoans();
  const { month, type, category_id } = req.query;
  
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
  
  const transactions = db.prepare(query).all(...params).map(sanitizeTransaction);
  res.json(transactions);
});

app.post('/api/transactions', (req, res) => {
  const { type, amount, category_id, account_id, to_account_id, date, memo } = req.body;
  const cleanType = type as TransactionRow['type'];
  const numericAmount = normalizeMoney(amount);

  if (!['income', 'expense', 'transfer'].includes(cleanType)) {
    return res.status(400).json({ error: 'invalid type' });
  }
  if (!assertPositive(numericAmount)) {
    return res.status(400).json({ error: 'amount must be greater than 0' });
  }
  if (!isValidDateStrict(date)) {
    return res.status(400).json({ error: 'invalid date' });
  }

  const isTransfer = cleanType === 'transfer';
  if (isTransfer) {
    if (!account_id || !to_account_id || account_id === to_account_id) {
      return res.status(400).json({ error: 'transfer requires different from/to accounts' });
    }
  } else if (!account_id) {
    return res.status(400).json({ error: 'account is required' });
  }

  const id = uuidv4();
  const cleanCategoryId = isTransfer ? null : category_id;
  const cleanMemo = memo?.toString().trim() || null;

  db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount, category_id, account_id, to_account_id, date, memo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEMO_USER_ID, cleanType, numericAmount, cleanCategoryId, account_id, isTransfer ? to_account_id : null, date, cleanMemo);

  if (cleanType === 'income') adjustAccountBalance(account_id, numericAmount);
  else if (cleanType === 'expense') adjustAccountBalance(account_id, -numericAmount);
  else {
    adjustAccountBalance(account_id, -numericAmount);
    adjustAccountBalance(to_account_id, numericAmount);
  }
  
  const transaction = sanitizeTransaction(db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.id = ?
  `).get(id));
  
  res.status(201).json(transaction);
});

app.put('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const { type, amount, category_id, account_id, to_account_id, date, memo } = req.body;

  const existing = db.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).get(id, DEMO_USER_ID) as TransactionRow | undefined;
  if (!existing) return res.status(404).send();

  const cleanType = (type as TransactionRow['type']) ?? existing.type;
  const numericAmount = amount === undefined ? existing.amount : normalizeMoney(amount);

  if (!['income', 'expense', 'transfer'].includes(cleanType)) {
    return res.status(400).json({ error: 'invalid type' });
  }
  if (!assertPositive(numericAmount)) {
    return res.status(400).json({ error: 'amount must be greater than 0' });
  }
  if (date && !isValidDateStrict(date)) {
    return res.status(400).json({ error: 'invalid date' });
  }

  const isTransfer = cleanType === 'transfer';
  const fromAccount = account_id ?? existing.account_id;
  const toAccount = isTransfer ? (to_account_id ?? existing.to_account_id) : null;

  if (isTransfer) {
    if (!fromAccount || !toAccount || fromAccount === toAccount) {
      return res.status(400).json({ error: 'transfer requires different from/to accounts' });
    }
  } else if (!fromAccount) {
    return res.status(400).json({ error: 'account is required' });
  }

  const cleanCategoryId = isTransfer ? null : category_id ?? existing.category_id;
  const cleanMemo = memo?.toString().trim() ?? existing.memo;
  const cleanDate = date ?? existing.date;

  // revert old balance
  if (existing.type === 'income') adjustAccountBalance(existing.account_id, -existing.amount);
  else if (existing.type === 'expense') adjustAccountBalance(existing.account_id, existing.amount);
  else {
    adjustAccountBalance(existing.account_id, existing.amount);
    adjustAccountBalance(existing.to_account_id, -existing.amount);
  }
  
  db.prepare(`
    UPDATE transactions 
    SET type = ?, amount = ?, category_id = ?, account_id = ?, to_account_id = ?, date = ?, memo = ?
    WHERE id = ? AND user_id = ?
  `).run(cleanType, numericAmount, cleanCategoryId, fromAccount, toAccount, cleanDate, cleanMemo, id, DEMO_USER_ID);

  // apply new balance
  if (cleanType === 'income') adjustAccountBalance(fromAccount, numericAmount);
  else if (cleanType === 'expense') adjustAccountBalance(fromAccount, -numericAmount);
  else {
    adjustAccountBalance(fromAccount, -numericAmount);
    adjustAccountBalance(toAccount, numericAmount);
  }
  
  const transaction = sanitizeTransaction(db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.id = ?
  `).get(id));
  
  res.json(transaction);
});

app.delete('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).get(id, DEMO_USER_ID) as TransactionRow | undefined;
  if (existing) {
    if (existing.type === 'income') adjustAccountBalance(existing.account_id, -existing.amount);
    else if (existing.type === 'expense') adjustAccountBalance(existing.account_id, existing.amount);
    else {
      adjustAccountBalance(existing.account_id, existing.amount);
      adjustAccountBalance(existing.to_account_id, -existing.amount);
    }
  }
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

  if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' });
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  
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
  if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' });
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  
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
  if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' });
  if (!['cash', 'bank', 'card', 'investment'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  const cleanBalance = Number(balance ?? 0);
  
  db.prepare(`
    INSERT INTO accounts (id, user_id, name, type, balance, color, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEMO_USER_ID, name.trim(), type, cleanBalance, color || '#6B7280', icon);
  
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.status(201).json(account);
});

app.put('/api/accounts/:id', (req, res) => {
  const { id } = req.params;
  const { name, type, balance, color, icon } = req.body;
  if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' });
  if (!['cash', 'bank', 'card', 'investment'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  const cleanBalance = Number(balance ?? 0);
  
  db.prepare(`
    UPDATE accounts SET name = ?, type = ?, balance = ?, color = ?, icon = ?
    WHERE id = ? AND user_id = ?
  `).run(name.trim(), type, cleanBalance, color, icon, id, DEMO_USER_ID);
  
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
  if (AUTO_PROCESS_LOANS) processLoans();
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
  if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' });
  const principalNum = normalizeMoney(principal);
  const interestNum = Number(interest_rate ?? 0);
  const termNum = Number(term_months ?? 0);
  if (!assertPositive(principalNum)) return res.status(400).json({ error: 'principal must be greater than 0' });
  if (interestNum < 0) return res.status(400).json({ error: 'interest_rate must be >= 0' });
  if (!assertPositive(termNum)) return res.status(400).json({ error: 'term_months must be greater than 0' });
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });
  if (!isValidDateStrict(start_date)) return res.status(400).json({ error: 'invalid start_date' });
  const dueDay = Math.min(28, Math.max(1, Number(monthly_due_day || 1)));
  const repayType: 'amortized' | 'interest_only' | 'principal_equal' =
    repayment_type === 'interest_only'
      ? 'interest_only'
      : repayment_type === 'principal_equal'
      ? 'principal_equal'
      : 'amortized';
  const monthly_payment = calcMonthlyPayment(principalNum, interestNum, termNum, repayType);
  const firstDue = getFirstDueDate(start_date, dueDay);

  db.prepare(`
    INSERT INTO loans (id, user_id, name, principal, interest_rate, term_months, start_date, monthly_due_day, account_id, category_id, remaining_principal, monthly_payment, paid_months, next_due_date, repayment_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    DEMO_USER_ID,
    name.trim(),
    principalNum,
    interestNum,
    termNum,
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

  if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' });
  const principalNum = normalizeMoney(principal);
  const interestNum = Number(interest_rate ?? 0);
  const termNum = Number(term_months ?? 0);
  if (!assertPositive(principalNum)) return res.status(400).json({ error: 'principal must be greater than 0' });
  if (interestNum < 0) return res.status(400).json({ error: 'interest_rate must be >= 0' });
  if (!assertPositive(termNum)) return res.status(400).json({ error: 'term_months must be greater than 0' });
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });
  if (!isValidDateStrict(start_date)) return res.status(400).json({ error: 'invalid start_date' });

  const dueDay = Math.min(28, Math.max(1, Number(monthly_due_day || existing.monthly_due_day || 1)));
  const repayType: 'amortized' | 'interest_only' | 'principal_equal' =
    repayment_type === 'interest_only'
      ? 'interest_only'
      : repayment_type === 'principal_equal'
      ? 'principal_equal'
      : 'amortized';
  const monthly_payment = calcMonthlyPayment(principalNum, interestNum, termNum, repayType);

  // Rebuild next due date based on paid months to avoid duplicates
  let nextDue = getFirstDueDate(start_date, dueDay);
  for (let i = 0; i < existing.paid_months; i++) {
    nextDue = addMonthsKeepDay(nextDue, dueDay);
  }

  // Remaining principal handling
  let remaining_principal = existing.remaining_principal;
  if (repayType === 'interest_only') {
    remaining_principal = principalNum; // 이자만 상환 시 원금 유지
  } else if (principalNum !== existing.principal) {
    const paidRatio = existing.paid_months / Math.max(1, existing.term_months);
    const assumedPaid = principalNum * paidRatio;
    remaining_principal = Math.max(0, principalNum - assumedPaid);
  }

  db.prepare(`
    UPDATE loans
    SET name = ?, principal = ?, interest_rate = ?, term_months = ?, start_date = ?, monthly_due_day = ?, account_id = ?, category_id = ?, monthly_payment = ?, remaining_principal = ?, next_due_date = ?, repayment_type = ?, settled_at = NULL
    WHERE id = ? AND user_id = ?
  `).run(
    name.trim(),
    principalNum,
    interestNum,
    termNum,
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

// Settle (payoff) a loan: stop future generation from the given date, create payoff transaction
app.put('/api/loans/:id/settle', (req, res) => {
  const { id } = req.params;
  const { settled_at, amount, account_id } = req.body as { settled_at?: string; amount?: number; account_id?: string };
  if (!settled_at || !isValidDateStrict(settled_at)) return res.status(400).json({ error: 'valid settled_at required' });
  const loan = db.prepare(`SELECT * FROM loans WHERE id = ? AND user_id = ?`).get(id, DEMO_USER_ID) as LoanRow | undefined;
  if (!loan) return res.status(404).send();

  const payAmountRaw = amount ?? loan.remaining_principal;
  const payAmount = normalizeMoney(payAmountRaw);
  if (!assertPositive(payAmount)) return res.status(400).json({ error: 'amount must be greater than 0' });
  const payAccount = account_id || loan.account_id;
  if (payAccount) {
    const memo = `[대출상환완료] ${loan.name}`;
    const txId = uuidv4();
    db.prepare(`
      INSERT INTO transactions (id, user_id, type, amount, category_id, account_id, date, memo)
      VALUES (?, ?, 'expense', ?, ?, ?, ?, ?)
    `).run(txId, DEMO_USER_ID, payAmount, loan.category_id || null, payAccount, settled_at, memo);
    adjustAccountBalance(payAccount, -payAmount);
  }

  const remaining = Math.max(0, loan.remaining_principal - payAmount);
  const isCleared = remaining <= 0.0001;
  const remainingMonths = Math.max(loan.term_months - loan.paid_months, 1);
  const nextDue = isCleared ? null : addMonthsKeepDay(settled_at, loan.monthly_due_day);
  const newMonthly = isCleared ? 0 : calcMonthlyPayment(remaining, loan.interest_rate, remainingMonths, loan.repayment_type);

  db.prepare(`
    UPDATE loans
    SET settled_at = ?, remaining_principal = ?, next_due_date = ?, paid_months = ?, monthly_payment = ?
    WHERE id = ? AND user_id = ?
  `).run(
    settled_at,
    isCleared ? 0 : remaining,
    nextDue,
    isCleared ? loan.term_months : loan.paid_months,
    newMonthly,
    id,
    DEMO_USER_ID
  );

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
  const numericAmount = normalizeMoney(amount);
  if (!category_id) return res.status(400).json({ error: 'category_id is required' });
  if (!assertPositive(numericAmount)) return res.status(400).json({ error: 'amount must be greater than 0' });
  
  // Check if permanent budget exists for this category
  const existing = db.prepare(`
    SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = 'permanent'
  `).get(DEMO_USER_ID, category_id) as { id: string } | undefined;
  
  if (existing) {
    db.prepare(`UPDATE budgets SET amount = ? WHERE id = ?`).run(numericAmount, existing.id);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO budgets (id, user_id, category_id, amount, month)
      VALUES (?, ?, ?, ?, 'permanent')
    `).run(id, DEMO_USER_ID, category_id, numericAmount);
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
  if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' });
  const targetAmountNum = normalizeMoney(target_amount);
  const currentAmountNum = normalizeMoney(current_amount ?? 0);
  if (!assertPositive(targetAmountNum)) return res.status(400).json({ error: 'target_amount must be greater than 0' });
  if (currentAmountNum < 0) return res.status(400).json({ error: 'current_amount must be >= 0' });
  if (deadline && !isValidDateStrict(deadline)) return res.status(400).json({ error: 'invalid deadline' });
  
  db.prepare(`
    INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, deadline, color, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEMO_USER_ID, name.trim(), targetAmountNum, currentAmountNum, deadline, color || '#0A84FF', icon);
  
  const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);
  res.status(201).json(goal);
});

app.put('/api/savings-goals/:id', (req, res) => {
  const { id } = req.params;
  const { name, target_amount, current_amount, deadline, color, icon } = req.body;
  if (!name?.toString().trim()) return res.status(400).json({ error: 'name is required' });
  const targetAmountNum = normalizeMoney(target_amount);
  const currentAmountNum = normalizeMoney(current_amount ?? 0);
  if (!assertPositive(targetAmountNum)) return res.status(400).json({ error: 'target_amount must be greater than 0' });
  if (currentAmountNum < 0) return res.status(400).json({ error: 'current_amount must be >= 0' });
  if (deadline && !isValidDateStrict(deadline)) return res.status(400).json({ error: 'invalid deadline' });
  
  db.prepare(`
    UPDATE savings_goals SET name = ?, target_amount = ?, current_amount = ?, deadline = ?, color = ?, icon = ?
    WHERE id = ? AND user_id = ?
  `).run(name.trim(), targetAmountNum, currentAmountNum, deadline, color, icon, id, DEMO_USER_ID);
  
  const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);
  res.json(goal);
});

app.delete('/api/savings-goals/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(id, DEMO_USER_ID);
  res.status(204).send();
});

// ========== STATISTICS ==========

app.get('/api/stats/monthly', (req, res) => {
  if (AUTO_PROCESS_LOANS) processLoans();
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
  // 영구 예산(permanent)을 월별 집계에 매핑: 선택 월 거래만 합산
  const budgetUsage = db.prepare(`
    SELECT 
      b.id,
      b.category_id,
      c.name as category_name,
      c.color as category_color,
      b.amount as budget_amount,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) = ? THEN t.amount ELSE 0 END), 0) as spent
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    LEFT JOIN transactions t ON t.category_id = b.category_id 
      AND t.user_id = b.user_id 
      AND t.type = 'expense'
    WHERE b.user_id = ? AND b.month = 'permanent'
    GROUP BY b.id
  `).all(targetMonth, DEMO_USER_ID);
  
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
  if (AUTO_PROCESS_LOANS) processLoans();
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

