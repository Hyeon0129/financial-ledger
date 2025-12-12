// src/api.ts
import { supabase } from './lib/supabase';

// ================== Types (원본 그대로 유지) ==================
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  currency: string;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: 'income' | 'expense';
  parent_id: string | null;
  color: string;
  icon: string | null;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: 'cash' | 'bank' | 'card' | 'investment';
  balance: number;
  color: string;
  icon: string | null;
  created_at: string;
}

export interface Loan {
  id: string;
  user_id: string;
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
  created_at: string;
  repayment_type: 'amortized' | 'interest_only' | 'principal_equal';
  settled_at?: string | null;
  // joined
  account_name?: string;
  category_name?: string;
  category_color?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  date: string;
  memo: string | null;
  created_at: string;
  // Joined fields
  category_name?: string;
  category_color?: string;
  account_name?: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  month: string;
  created_at: string;
  // Joined fields
  category_name?: string;
  category_color?: string;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  color: string;
  icon: string | null;
  created_at: string;
}

export interface MonthlyStats {
  month: string;
  income: number;
  expense: number;
  balance: number;
  transactionCount: number;
  byCategory: Array<{
    category_id: string;
    category_name: string;
    category_color: string;
    type: 'income' | 'expense';
    total: number;
  }>;
  dailyTrend: Array<{
    date: string;
    type: 'income' | 'expense';
    total: number;
  }>;
  budgetUsage: Array<{
    id: string;
    category_id: string;
    category_name: string;
    category_color: string;
    budget_amount: number;
    spent: number;
  }>;
}

// ================== helpers ==================
type SupaError = { message: string } | null;
type SupaResult<T> = { data: T | null; error: SupaError };

async function getUserOrThrow() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message || 'Not authenticated');
  return data.user;
}

function assertNoError<T>(res: SupaResult<T>, msg: string): T {
  if (res.error) throw new Error(`${msg}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${msg}: empty data`);
  return res.data;
}

function toNum(v: unknown): number {
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  return 0;
}
function toIntMoney(v: unknown): number {
  return Math.round(toNum(v));
}

// dates
function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function clampDayToMonth(year: number, monthIndex0: number, day: number) {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return Math.min(Math.max(1, day), lastDay);
}
function addOneMonthDue(ymd: string, dueDay: number): string | null {
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m0 = d.getMonth() + 1;
  const day = clampDayToMonth(y, m0, Number(dueDay) || 1);
  return formatYMD(new Date(y, m0, day));
}

// Supabase 기본 row limit(1000) 대비 range pagination
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => Promise<SupaResult<T[]>>
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildPage(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

// ---------- Account balance delta 계산 ----------
type TxCore = Pick<Transaction, 'type' | 'amount' | 'account_id' | 'to_account_id'>;

function calcAccountDeltas(tx: TxCore): Map<string, number> {
  const deltas = new Map<string, number>();
  const amt = toIntMoney(tx.amount);
  if (amt === 0) return deltas;

  const add = (accountId: string | null, delta: number) => {
    if (!accountId) return;
    deltas.set(accountId, (deltas.get(accountId) ?? 0) + delta);
  };

  if (tx.type === 'income') add(tx.account_id, +amt);
  else if (tx.type === 'expense') add(tx.account_id, -amt);
  else if (tx.type === 'transfer') {
    add(tx.account_id, -amt);
    add(tx.to_account_id, +amt);
  }

  return deltas;
}

async function applyAccountDeltas(userId: string, deltas: Map<string, number>): Promise<void> {
  for (const [accountId, deltaRaw] of deltas.entries()) {
    const delta = toIntMoney(deltaRaw);
    if (!delta) continue;

    const curRes = await supabase
      .from('accounts')
      .select('id,balance')
      .eq('id', accountId)
      .eq('user_id', userId)
      .maybeSingle();

    if (curRes.error) throw new Error(curRes.error.message);
    if (!curRes.data) continue;

    const curBal = toIntMoney(curRes.data.balance ?? 0);
    const nextBalance = toIntMoney(curBal + delta);

    const updRes = await supabase
      .from('accounts')
      .update({ balance: nextBalance })
      .eq('id', accountId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (updRes.error) throw new Error(updRes.error.message);
  }
}

// 내부용: tx insert + 계좌잔액 반영 (중복메모 체크 포함)
async function insertExpenseTxIfNotExists(params: {
  user_id: string;
  date: string;
  amount: number;
  account_id: string;
  category_id: string | null;
  memo: string;
  dedupeKeys?: string[];
}): Promise<void> {
  const dedupeValues = Array.from(new Set([params.memo, ...(params.dedupeKeys ?? [])]));

  const existRes = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', params.user_id)
    .in('memo', dedupeValues)
    .maybeSingle();

  if (existRes.error) throw new Error(existRes.error.message);
  if (existRes.data) return;

  const insertTxRes = await supabase
    .from('transactions')
    .insert({
      user_id: params.user_id,
      type: 'expense',
      amount: toIntMoney(params.amount),
      category_id: params.category_id ?? null,
      account_id: params.account_id,
      to_account_id: null,
      date: params.date,
      memo: params.memo,
    })
    .select('*')
    .single();

  const insertedTx = assertNoError(insertTxRes, 'insert expense tx failed');
  const deltas = calcAccountDeltas(insertedTx);
  await applyAccountDeltas(params.user_id, deltas);
}

// ================== User API (profiles) ==================
type ProfilePatch = Partial<Pick<User, 'email' | 'name' | 'avatar_url' | 'currency'>>;

export const userApi = {
  get: async (): Promise<User> => {
    const user = await getUserOrThrow();

    const res = await supabase
      .from('profiles')
      .select('id,email,name,avatar_url,currency,created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (res.error) throw new Error(res.error.message);

    const row = res.data;
    return {
      id: user.id,
      email: row?.email ?? user.email ?? '',
      name: row?.name ?? '',
      avatar_url: row?.avatar_url ?? null,
      currency: row?.currency ?? '₩',
      created_at: row?.created_at ?? new Date().toISOString(),
    };
  },

  update: async (data: Partial<User>): Promise<User> => {
    const user = await getUserOrThrow();

    const payload: ProfilePatch = {};
    if (data.email !== undefined) payload.email = data.email;
    if (data.name !== undefined) payload.name = data.name;
    if (data.avatar_url !== undefined) payload.avatar_url = data.avatar_url;
    if (data.currency !== undefined) payload.currency = data.currency;

    const res = await supabase
      .from('profiles')
      .upsert({ id: user.id, ...payload }, { onConflict: 'id' })
      .select('id,email,name,avatar_url,currency,created_at')
      .single();

    const row = assertNoError(res, 'profiles upsert failed');

    return {
      id: row.id,
      email: row.email ?? user.email ?? '',
      name: row.name ?? '',
      avatar_url: row.avatar_url ?? null,
      currency: row.currency ?? '₩',
      created_at: row.created_at ?? new Date().toISOString(),
    };
  },
};

// ================== Categories API ==================
export const categoriesApi = {
  list: async (): Promise<Category[]> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('categories').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    return assertNoError(res, 'categories list failed');
  },

  create: async (data: Omit<Category, 'id' | 'user_id' | 'created_at'>): Promise<Category> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('categories').insert({ ...data, user_id: user.id }).select('*').single();
    return assertNoError(res, 'categories create failed');
  },

  update: async (id: string, data: Partial<Category>): Promise<Category> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('categories').update(data).eq('id', id).eq('user_id', user.id).select('*').single();
    return assertNoError(res, 'categories update failed');
  },

  delete: async (id: string): Promise<void> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('categories').delete().eq('id', id).eq('user_id', user.id);
    if (res.error) throw new Error(res.error.message);
  },
};

// ================== Accounts API ==================
export const accountsApi = {
  list: async (): Promise<Account[]> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    return assertNoError(res, 'accounts list failed');
  },

  create: async (data: Omit<Account, 'id' | 'user_id' | 'created_at'>): Promise<Account> => {
    const user = await getUserOrThrow();
    const payload = { ...data, user_id: user.id, balance: toIntMoney(data.balance) };
    const res = await supabase.from('accounts').insert(payload).select('*').single();
    return assertNoError(res, 'accounts create failed');
  },

  update: async (id: string, data: Partial<Account>): Promise<Account> => {
    const user = await getUserOrThrow();
    const patch: Partial<Account> = { ...data };
    if (patch.balance !== undefined) patch.balance = toIntMoney(patch.balance);

    const res = await supabase.from('accounts').update(patch).eq('id', id).eq('user_id', user.id).select('*').single();
    return assertNoError(res, 'accounts update failed');
  },

  delete: async (id: string): Promise<void> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('accounts').delete().eq('id', id).eq('user_id', user.id);
    if (res.error) throw new Error(res.error.message);
  },
};

// ================== Loan math helpers ==================
type RepaymentType = 'amortized' | 'interest_only' | 'principal_equal';

function calcMonthlyPayment(params: {
  principal: number;
  interest_rate: number; // 연이율(%)
  term_months: number;
  repayment_type: RepaymentType;
}): number {
  const P = toNum(params.principal);
  const n = Math.max(0, Math.trunc(toNum(params.term_months)));
  const annual = toNum(params.interest_rate);
  const type = params.repayment_type;

  if (P <= 0 || n <= 0) return 0;

  const r = annual / 100 / 12;

  if (r === 0) return toIntMoney(P / n);
  if (type === 'interest_only') return toIntMoney(P * r);
  if (type === 'principal_equal') return toIntMoney(P / n + P * r);

  const pow = Math.pow(1 + r, n);
  const payment = (P * r * pow) / (pow - 1);
  return toIntMoney(payment);
}

function calcNextDueDate(start_date: string, monthly_due_day: number): string | null {
  const base = new Date(start_date);
  if (Number.isNaN(base.getTime())) return null;

  const dueDay = Number(monthly_due_day) || 1;
  const y = base.getFullYear();
  const m0 = base.getMonth();

  const dayThis = clampDayToMonth(y, m0, dueDay);
  const dueThis = new Date(y, m0, dayThis);

  // start_date 이후(같은 날 포함이면 그날이 due)
  if (dueThis.getTime() >= new Date(y, m0, base.getDate()).getTime()) {
    return formatYMD(dueThis);
  }

  // 다음 달 due
  const nextMonth = new Date(y, m0 + 1, 1);
  const ny = nextMonth.getFullYear();
  const nm0 = nextMonth.getMonth();
  const dayNext = clampDayToMonth(ny, nm0, dueDay);
  const dueNext = new Date(ny, nm0, dayNext);
  return formatYMD(dueNext);
}

function calcInstallmentForDue(loan: Loan, remainingPrincipal: number): { total: number; principalPay: number } {
  const remaining = Math.max(0, toIntMoney(remainingPrincipal));
  if (remaining <= 0) return { total: 0, principalPay: 0 };

  const annual = toNum(loan.interest_rate);
  const r = annual / 100 / 12;
  const interestPay = r === 0 ? 0 : toIntMoney(remaining * r);

  if (loan.repayment_type === 'interest_only') {
    return { total: interestPay, principalPay: 0 };
  }

  if (loan.repayment_type === 'principal_equal') {
    const fixedPrincipal = toIntMoney(toNum(loan.principal) / Math.max(1, Math.trunc(toNum(loan.term_months))));
    const principalPay = Math.min(remaining, fixedPrincipal);
    return { total: toIntMoney(principalPay + interestPay), principalPay: toIntMoney(principalPay) };
  }

  // amortized
  let total = toIntMoney(loan.monthly_payment);
  if (total <= 0) {
    total = toIntMoney(
      calcMonthlyPayment({
        principal: toNum(loan.principal) || remaining,
        interest_rate: annual,
        term_months: Math.trunc(toNum(loan.term_months)),
        repayment_type: 'amortized',
      })
    );
  }

  let principalPay = Math.max(0, total - interestPay);

  if (principalPay > remaining) {
    principalPay = remaining;
    total = toIntMoney(principalPay + interestPay);
  }

  return { total: toIntMoney(total), principalPay: toIntMoney(principalPay) };
}

const buildAutoLoanMemo = (loanId: string, dueDate: string, installment: number, termMonths: number) =>
  `AUTO_LOAN|${loanId}|${dueDate}|${installment}|${termMonths}`;
const legacyAutoLoanMemo = (loanId: string, dueDate: string) => `AUTO_LOAN:${loanId}:${dueDate}`;
const buildSettleLoanMemo = (loanId: string, settledDate: string) => `SETTLE_LOAN|${loanId}|${settledDate}`;
const legacySettleLoanMemo = (loanId: string, settledDate: string) => `SETTLE_LOAN:${loanId}:${settledDate}`;

type ParsedAutoLoanMemo = {
  loanId: string;
  dueDate: string;
  installment: number;
  term: number;
};

const parseAutoLoanMemo = (memo: string | null | undefined): ParsedAutoLoanMemo | null => {
  if (!memo || !memo.startsWith('AUTO_LOAN|')) return null;
  const [, loanId, dueDate, installmentStr, termStr] = memo.split('|');
  if (!loanId || !dueDate) return null;
  const installment = Number(installmentStr);
  const term = Number(termStr);
  return {
    loanId,
    dueDate,
    installment: Number.isFinite(installment) ? installment : 0,
    term: Number.isFinite(term) ? term : 0,
  };
};

type ParsedSettleLoanMemo = {
  loanId: string;
  settledDate: string;
};

const parseSettleLoanMemo = (memo: string | null | undefined): ParsedSettleLoanMemo | null => {
  if (!memo || !memo.startsWith('SETTLE_LOAN|')) return null;
  const [, loanId, settledDate] = memo.split('|');
  if (!loanId || !settledDate) return null;
  return { loanId, settledDate };
};

// ================== Loan autopay (대출 누락 회차 자동 생성) ==================
type LoanAutopayOptions = { force?: boolean };
const loanAutopayInFlight = new Map<string, Promise<void>>();

async function processLoanAutopayIfNeeded(userId: string, options: LoanAutopayOptions = {}): Promise<void> {
  if (typeof window === 'undefined') return;

  const existing = loanAutopayInFlight.get(userId);
  if (existing) {
    if (!options.force) return existing;
    await existing;
  }

  const promise = (async () => {
    const today = formatYMD(new Date());

    const guardKey = `loan_autopay_last_run:${userId}`;
    if (!options.force) {
      try {
        const last = window.localStorage.getItem(guardKey);
        if (last === today) return;
      } catch {
        // ignore
      }
    }

    const loanRes = await supabase
      .from('loans')
      .select('*')
      .eq('user_id', userId);

    const allLoans = assertNoError(loanRes, 'loans fetch for autopay failed');
    const loans = allLoans.filter(l => !l.settled_at);
    if (loans.length === 0) return;

    for (const loan of loans) {
      let nextDue = loan.next_due_date ?? calcNextDueDate(loan.start_date, loan.monthly_due_day);
      if (!nextDue) continue;

      let remaining = toIntMoney(loan.remaining_principal);
      let paidMonths = Math.max(0, Math.trunc(toNum(loan.paid_months)));
      let changed = false;

      const term = Math.max(0, Math.trunc(toNum(loan.term_months)));

      while (nextDue && nextDue <= today && remaining > 0 && (term === 0 || paidMonths < term)) {
        const { total, principalPay } = calcInstallmentForDue(loan, remaining);
        const payTotal = toIntMoney(total);

        if (payTotal > 0) {
          const memoKey = buildAutoLoanMemo(loan.id, nextDue, paidMonths + 1, term);
          await insertExpenseTxIfNotExists({
            user_id: userId,
            date: nextDue,
            amount: payTotal,
            account_id: loan.account_id,
            category_id: loan.category_id ?? null,
            memo: memoKey,
            dedupeKeys: [legacyAutoLoanMemo(loan.id, nextDue)],
          });
        }

        remaining = Math.max(0, toIntMoney(remaining - toIntMoney(principalPay)));
        paidMonths += 1;
        nextDue = addOneMonthDue(nextDue, loan.monthly_due_day);
        changed = true;
      }

      if (changed) {
        const done = remaining <= 0 || (term > 0 && paidMonths >= term);

        const updRes = await supabase
          .from('loans')
          .update({
            remaining_principal: toIntMoney(remaining),
            paid_months: paidMonths,
            next_due_date: done ? null : nextDue,
            settled_at: done ? today : null,
          })
          .eq('id', loan.id)
          .eq('user_id', userId);

        if (updRes.error) throw new Error(updRes.error.message);
      }
    }

    try {
      window.localStorage.setItem(guardKey, today);
    } catch {
      // ignore
    }
  })();

  const tracked = promise.finally(() => {
    if (loanAutopayInFlight.get(userId) === tracked) {
      loanAutopayInFlight.delete(userId);
    }
  });
  loanAutopayInFlight.set(userId, tracked);
  return tracked;
}

const triggerLoanAutopay = (userId: string) => {
  if (typeof window === 'undefined') return;
  processLoanAutopayIfNeeded(userId, { force: true }).catch(err => {
    console.error('Loan autopay refresh failed:', err);
  });
};

// ================== Transactions API ==================
export const transactionsApi = {
  list: async (params?: { month?: string; type?: string; category_id?: string }): Promise<Transaction[]> => {
    
    const user = await getUserOrThrow();
    await processLoanAutopayIfNeeded(user.id);

    let q = supabase.from('transactions').select('*').eq('user_id', user.id);

    if (params?.month) q = q.like('date', `${params.month}%`);
    if (params?.type) q = q.eq('type', params.type);
    if (params?.category_id) q = q.eq('category_id', params.category_id);

    const res = await q.order('date', { ascending: false });
    const txs = assertNoError(res, 'transactions list failed');

    const loanMetaPromise = supabase
      .from('loans')
      .select('id,name,term_months')
      .eq('user_id', user.id);
    const [cats, accs, loanRes] = await Promise.all([categoriesApi.list(), accountsApi.list(), loanMetaPromise]);
    const loanRows = assertNoError(loanRes, 'loans fetch for memo failed');
    const catMap = new Map(cats.map(c => [c.id, c]));
    const accMap = new Map(accs.map(a => [a.id, a]));
    const loanMap = new Map(loanRows.map(l => [l.id, l]));

    return txs.map(t => {
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      const acc = t.account_id ? accMap.get(t.account_id) : undefined;
      let memo = t.memo ?? null;

      const autoMemo = parseAutoLoanMemo(memo);
      if (autoMemo) {
        const loanInfo = loanMap.get(autoMemo.loanId);
        const loanLabel = loanInfo?.name ?? '대출';
        const installmentText =
          autoMemo.term && autoMemo.term > 0
            ? `${autoMemo.installment}/${autoMemo.term}`
            : `${autoMemo.installment}회차`;
        memo = `[ ${loanLabel} ] ${installmentText}`;
      } else {
        const settleMemo = parseSettleLoanMemo(memo);
        if (settleMemo) {
          const loanInfo = loanMap.get(settleMemo.loanId);
          const loanLabel = loanInfo?.name ?? '대출';
          memo = `${loanLabel} 상환 완료`;
        }
      }

      return {
        ...t,
        amount: toIntMoney(t.amount),
        category_name: cat?.name,
        category_color: cat?.color,
        account_name: acc?.name,
        memo,
      };
    });
  },

  create: async (data: Omit<Transaction, 'id' | 'user_id' | 'created_at'>): Promise<Transaction> => {
    const user = await getUserOrThrow();

    const payload = {
      ...data,
      user_id: user.id,
      amount: toIntMoney(data.amount),
    };

    const insertRes = await supabase.from('transactions').insert(payload).select('*').single();
    const inserted = assertNoError(insertRes, 'transactions create failed');

    const deltas = calcAccountDeltas(inserted);
    try {
      await applyAccountDeltas(user.id, deltas);
    } catch (e) {
      await supabase.from('transactions').delete().eq('id', inserted.id).eq('user_id', user.id);
      throw e;
    }

    return inserted;
  },

  update: async (id: string, data: Partial<Transaction>): Promise<Transaction> => {
    const user = await getUserOrThrow();

    const oldRes = await supabase.from('transactions').select('*').eq('id', id).eq('user_id', user.id).single();
    const oldTx = assertNoError(oldRes, 'transactions fetch before update failed');

    const patch: Partial<Transaction> = { ...data };
    if (patch.amount !== undefined) patch.amount = toIntMoney(patch.amount);

    const updRes = await supabase.from('transactions').update(patch).eq('id', id).eq('user_id', user.id).select('*').single();
    const newTx = assertNoError(updRes, 'transactions update failed');

    const reverseOld = new Map<string, number>();
    for (const [k, v] of calcAccountDeltas(oldTx).entries()) reverseOld.set(k, -v);

    const applyNew = calcAccountDeltas(newTx);

    try {
      await applyAccountDeltas(user.id, reverseOld);
      await applyAccountDeltas(user.id, applyNew);
    } catch (e) {
      await supabase
        .from('transactions')
        .update({
          type: oldTx.type,
          amount: oldTx.amount,
          category_id: oldTx.category_id,
          account_id: oldTx.account_id,
          to_account_id: oldTx.to_account_id,
          date: oldTx.date,
          memo: oldTx.memo,
        })
        .eq('id', id)
        .eq('user_id', user.id);

      const reverseNew = new Map<string, number>();
      for (const [k, v] of applyNew.entries()) reverseNew.set(k, -v);

      await applyAccountDeltas(user.id, reverseNew).catch(() => {});
      await applyAccountDeltas(user.id, calcAccountDeltas(oldTx)).catch(() => {});

      throw e;
    }

    return newTx;
  },

  delete: async (id: string): Promise<void> => {
    const user = await getUserOrThrow();

    const oldRes = await supabase.from('transactions').select('*').eq('id', id).eq('user_id', user.id).single();
    const oldTx = assertNoError(oldRes, 'transactions fetch before delete failed');

    const reverse = new Map<string, number>();
    for (const [k, v] of calcAccountDeltas(oldTx).entries()) reverse.set(k, -v);

    await applyAccountDeltas(user.id, reverse);

    const delRes = await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id);
    if (delRes.error) throw new Error(delRes.error.message);
  },
};

// ================== Budgets API ==================
export const budgetsApi = {
  list: async (): Promise<Budget[]> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('budgets').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    const budgets = assertNoError(res, 'budgets list failed');

    const cats = await categoriesApi.list();
    const catMap = new Map(cats.map(c => [c.id, c]));

    return budgets.map(b => {
      const cat = catMap.get(b.category_id);
      return {
        ...b,
        amount: toIntMoney(b.amount),
        category_name: cat?.name,
        category_color: cat?.color,
      };
    });
  },

  // 원본 시그니처 유지: (category_id, amount)  + month는 옵션(안 쓰면 자동)
  create: async (data: { category_id: string; amount: number; month?: string }): Promise<Budget> => {
    const user = await getUserOrThrow();
    const month = data.month ?? getMonthKey(new Date());

    const res = await supabase
      .from('budgets')
      .insert({ user_id: user.id, category_id: data.category_id, amount: toIntMoney(data.amount), month })
      .select('*')
      .single();

    return assertNoError(res, 'budgets create failed');
  },

  delete: async (id: string): Promise<void> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('budgets').delete().eq('id', id).eq('user_id', user.id);
    if (res.error) throw new Error(res.error.message);
  },
};

// ================== Savings Goals API ==================
export const savingsGoalsApi = {
  list: async (): Promise<SavingsGoal[]> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('savings_goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    const rows = assertNoError(res, 'savings_goals list failed');

    return rows.map(r => ({
      ...r,
      target_amount: toIntMoney(r.target_amount),
      current_amount: toIntMoney(r.current_amount),
    }));
  },

  create: async (data: Omit<SavingsGoal, 'id' | 'user_id' | 'created_at'>): Promise<SavingsGoal> => {
    const user = await getUserOrThrow();
    const payload = {
      ...data,
      user_id: user.id,
      target_amount: toIntMoney(data.target_amount),
      current_amount: toIntMoney(data.current_amount),
    };

    const res = await supabase.from('savings_goals').insert(payload).select('*').single();
    return assertNoError(res, 'savings_goals create failed');
  },

  update: async (id: string, data: Partial<SavingsGoal>): Promise<SavingsGoal> => {
    const user = await getUserOrThrow();
    const patch: Partial<SavingsGoal> = { ...data };
    if (patch.target_amount !== undefined) patch.target_amount = toIntMoney(patch.target_amount);
    if (patch.current_amount !== undefined) patch.current_amount = toIntMoney(patch.current_amount);

    const res = await supabase.from('savings_goals').update(patch).eq('id', id).eq('user_id', user.id).select('*').single();
    return assertNoError(res, 'savings_goals update failed');
  },

  delete: async (id: string): Promise<void> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('savings_goals').delete().eq('id', id).eq('user_id', user.id);
    if (res.error) throw new Error(res.error.message);
  },
};

// ================== Loans API ==================
export const loansApi = {
  list: async (): Promise<Loan[]> => {
    const user = await getUserOrThrow();
    await processLoanAutopayIfNeeded(user.id);

    const res = await supabase.from('loans').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    const loans = assertNoError(res, 'loans list failed');

    const [cats, accs] = await Promise.all([categoriesApi.list(), accountsApi.list()]);
    const catMap = new Map(cats.map(c => [c.id, c]));
    const accMap = new Map(accs.map(a => [a.id, a]));

    return loans.map(l => {
      const cat = l.category_id ? catMap.get(l.category_id) : undefined;
      const acc = accMap.get(l.account_id);
      return {
        ...l,
        principal: toIntMoney(l.principal),
        remaining_principal: toIntMoney(l.remaining_principal),
        monthly_payment: toIntMoney(l.monthly_payment),
        account_name: acc?.name,
        category_name: cat?.name,
        category_color: cat?.color,
      };
    });
  },

  create: async (data: {
    name: string;
    principal: number;
    interest_rate: number;
    term_months: number;
    start_date: string;
    monthly_due_day: number;
    account_id: string;
    category_id?: string | null;
    repayment_type?: 'amortized' | 'interest_only' | 'principal_equal';
  }): Promise<Loan> => {
    const user = await getUserOrThrow();

    const principal = toIntMoney(data.principal);
    const interest = toNum(data.interest_rate);
    const term = Math.max(0, Math.trunc(toNum(data.term_months)));
    const repaymentType = (data.repayment_type ?? 'amortized') as Loan['repayment_type'];

    const monthlyPayment = toIntMoney(
      calcMonthlyPayment({
        principal,
        interest_rate: interest,
        term_months: term,
        repayment_type: repaymentType,
      })
    );

    const nextDueDate = calcNextDueDate(data.start_date, data.monthly_due_day);

    const payload: Omit<Loan, 'id' | 'created_at' | 'account_name' | 'category_name' | 'category_color'> = {
      user_id: user.id,
      name: data.name,
      principal,
      interest_rate: interest,
      term_months: term,
      start_date: data.start_date,
      monthly_due_day: Math.max(1, Math.trunc(toNum(data.monthly_due_day))),
      account_id: data.account_id,
      category_id: data.category_id ?? null,

      remaining_principal: principal,
      monthly_payment: monthlyPayment,
      paid_months: 0,
      next_due_date: nextDueDate,

      repayment_type: repaymentType,
      settled_at: null,
    };

    const res = await supabase.from('loans').insert(payload).select('*').single();
    const created = assertNoError(res, 'loans create failed');
    triggerLoanAutopay(user.id);
    return created;
  },

  update: async (id: string, data: Partial<Loan>): Promise<Loan> => {
    const user = await getUserOrThrow();

    const patch: Partial<Loan> = { ...data };
    if (patch.principal !== undefined) patch.principal = toIntMoney(patch.principal);
    if (patch.remaining_principal !== undefined) patch.remaining_principal = toIntMoney(patch.remaining_principal);
    if (patch.monthly_payment !== undefined) patch.monthly_payment = toIntMoney(patch.monthly_payment);
    if (patch.term_months !== undefined) patch.term_months = Math.max(0, Math.trunc(toNum(patch.term_months)));
    if (patch.monthly_due_day !== undefined) patch.monthly_due_day = Math.max(1, Math.trunc(toNum(patch.monthly_due_day)));

    const res = await supabase.from('loans').update(patch).eq('id', id).eq('user_id', user.id).select('*').single();
    const updated = assertNoError(res, 'loans update failed');
    triggerLoanAutopay(user.id);
    return updated;
  },

  delete: async (id: string): Promise<void> => {
    const user = await getUserOrThrow();
    const res = await supabase.from('loans').delete().eq('id', id).eq('user_id', user.id);
    if (res.error) throw new Error(res.error.message);
    triggerLoanAutopay(user.id);
  },

  // ✅ settle: loan 업데이트 + (중복방지) 지출 거래 생성 + 계좌 잔액 차감
  settle: async (id: string, params: { settled_at: string; amount?: number; account_id?: string }): Promise<Loan> => {
    const user = await getUserOrThrow();

    const curRes = await supabase.from('loans').select('*').eq('id', id).eq('user_id', user.id).single();
    const loan = assertNoError(curRes, 'loans fetch before settle failed');

    const pay = toIntMoney(params.amount ?? loan.remaining_principal ?? 0);
    const remainingBefore = toIntMoney(loan.remaining_principal ?? 0);
    const newRemaining = Math.max(0, remainingBefore - pay);
    const isDone = newRemaining <= 0;

    // 거래 생성(중복 방지)
    const settleDate = params.settled_at;
    const targetAccountId = params.account_id ?? loan.account_id;
    if (targetAccountId && pay > 0) {
      const memoKey = buildSettleLoanMemo(loan.id, settleDate);
      await insertExpenseTxIfNotExists({
        user_id: user.id,
        date: settleDate,
        amount: pay,
        account_id: targetAccountId,
        category_id: loan.category_id ?? null,
        memo: memoKey,
        dedupeKeys: [legacySettleLoanMemo(loan.id, settleDate)],
      });
    }

    const updRes = await supabase
      .from('loans')
      .update({
        remaining_principal: newRemaining,
        settled_at: isDone ? settleDate : null,
        next_due_date: isDone ? null : loan.next_due_date,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    const settledLoan = assertNoError(updRes, 'loans settle failed');
    triggerLoanAutopay(user.id);
    return settledLoan;
  },
};

// ================== Statistics API (client-side aggregation) ==================
export const statsApi = {
  monthly: async (month?: string): Promise<MonthlyStats> => {
    const m = month ?? getMonthKey(new Date());

    const [txs, cats, bds] = await Promise.all([
      transactionsApi.list({ month: m }),
      categoriesApi.list(),
      budgetsApi.list(),
    ]);

    const catMap = new Map(cats.map(c => [c.id, c]));

    let income = 0;
    let expense = 0;

    const byCategoryMap = new Map<string, { category_id: string; type: 'income' | 'expense'; total: number }>();
    const dailyMap = new Map<string, { income: number; expense: number }>();

    for (const t of txs) {
      const amt = toIntMoney(t.amount);
      if (t.type === 'income') income += amt;
      if (t.type === 'expense') expense += amt;

      if (t.type === 'income' || t.type === 'expense') {
        const key = `${t.type}:${t.category_id ?? 'uncat'}`;
        const cur = byCategoryMap.get(key) ?? { category_id: t.category_id ?? 'uncat', type: t.type, total: 0 };
        cur.total += amt;
        byCategoryMap.set(key, cur);

        const d = t.date;
        const curDay = dailyMap.get(d) ?? { income: 0, expense: 0 };
        if (t.type === 'income') curDay.income += amt;
        else curDay.expense += amt;
        dailyMap.set(d, curDay);
      }
    }

    const byCategory = Array.from(byCategoryMap.values())
      .map(row => {
        const cat = row.category_id !== 'uncat' ? catMap.get(row.category_id) : undefined;
        return {
          category_id: row.category_id,
          category_name: cat?.name ?? (row.category_id === 'uncat' ? '미분류' : '알 수 없음'),
          category_color: cat?.color ?? '#6B7280',
          type: row.type,
          total: toIntMoney(row.total),
        };
      })
      .sort((a, b) => b.total - a.total);

    const dailyTrend: MonthlyStats['dailyTrend'] = [];
    Array.from(dailyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .forEach(([date, v]) => {
        if (v.income) dailyTrend.push({ date, type: 'income', total: toIntMoney(v.income) });
        if (v.expense) dailyTrend.push({ date, type: 'expense', total: toIntMoney(v.expense) });
      });

    const monthBudgets = bds.filter(b => b.month === m);
    const spentByCategory = new Map<string, number>();
    for (const t of txs) {
      if (t.type !== 'expense') continue;
      if (!t.category_id) continue;
      spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) ?? 0) + toIntMoney(t.amount));
    }

    const budgetUsage = monthBudgets.map(b => {
      const cat = catMap.get(b.category_id);
      return {
        id: b.id,
        category_id: b.category_id,
        category_name: cat?.name ?? '알 수 없음',
        category_color: cat?.color ?? '#6B7280',
        budget_amount: toIntMoney(b.amount),
        spent: toIntMoney(spentByCategory.get(b.category_id) ?? 0),
      };
    });

    return {
      month: m,
      income: toIntMoney(income),
      expense: toIntMoney(expense),
      balance: toIntMoney(income - expense),
      transactionCount: txs.length,
      byCategory,
      dailyTrend,
      budgetUsage,
    };
  },

  yearly: async (
    year?: number
  ): Promise<{ year: number; monthlyTrend: Array<{ month: string; type: string; total: number }> }> => {
    const y = year ?? new Date().getFullYear();
    const user = await getUserOrThrow();
    await processLoanAutopayIfNeeded(user.id);

    const rows = await fetchAllRows<Transaction>(async (from, to) => {
      return supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .like('date', `${y}-%`)
        .range(from, to)
        .order('date', { ascending: true });
    });

    const monthMap = new Map<string, { income: number; expense: number }>();

    for (const t of rows) {
      if (t.type !== 'income' && t.type !== 'expense') continue;
      const monthKey = t.date.slice(0, 7);
      const cur = monthMap.get(monthKey) ?? { income: 0, expense: 0 };
      const amt = toIntMoney(t.amount);
      if (t.type === 'income') cur.income += amt;
      else cur.expense += amt;
      monthMap.set(monthKey, cur);
    }

    const monthlyTrend: Array<{ month: string; type: string; total: number }> = [];
    Array.from(monthMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .forEach(([month, v]) => {
        monthlyTrend.push({ month, type: 'income', total: toIntMoney(v.income) });
        monthlyTrend.push({ month, type: 'expense', total: toIntMoney(v.expense) });
      });

    return { year: y, monthlyTrend };
  },
};

// ================== Helper Functions (원본 그대로 유지) ==================
export function formatCurrency(amount: number, currency: string = '₩'): string {
  return `${currency} ${amount.toLocaleString('ko-KR')}`;
}

export function getMonthKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateShort(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}
