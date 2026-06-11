const API_BASE = '/api';

// ================== Types ==================
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
  memo_raw?: string | null;
  created_at: string;
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

// ================== Helper function ==================
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API Error: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ================== API Implementations ==================

export const userApi = {
  get: () => fetchAPI<User>('/user'),
  update: (data: Partial<User>) => 
    fetchAPI<User>('/user', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

export const categoriesApi = {
  list: () => fetchAPI<Category[]>('/categories'),
  create: (data: Omit<Category, 'id' | 'user_id' | 'created_at'>) =>
    fetchAPI<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Category>) =>
    fetchAPI<Category>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/categories/${id}`, { method: 'DELETE' }),
};

export const accountsApi = {
  list: () => fetchAPI<Account[]>('/accounts'),
  create: (data: Omit<Account, 'id' | 'user_id' | 'created_at'>) =>
    fetchAPI<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Account>) =>
    fetchAPI<Account>(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/accounts/${id}`, { method: 'DELETE' }),
};

export const loansApi = {
  list: () => fetchAPI<Loan[]>('/loans'),
  create: (data: {
    name: string;
    principal: number;
    interest_rate: number;
    term_months: number;
    start_date: string;
    monthly_due_day: number;
    account_id: string;
    category_id?: string | null;
    repayment_type?: 'amortized' | 'interest_only' | 'principal_equal';
  }) =>
    fetchAPI<Loan>('/loans', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Loan>) =>
    fetchAPI<Loan>(`/loans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => fetchAPI<void>(`/loans/${id}`, { method: 'DELETE' }),
  settle: (id: string, params: { settled_at: string; amount?: number; account_id?: string }) =>
    fetchAPI<Loan>(`/loans/${id}/settle`, {
      method: 'PUT',
      body: JSON.stringify(params),
    }),
};

export const budgetsApi = {
  list: () => fetchAPI<Budget[]>('/budgets'),
  create: (data: { category_id: string; amount: number; month?: string }) =>
    fetchAPI<Budget>('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/budgets/${id}`, { method: 'DELETE' }),
};

export const savingsGoalsApi = {
  list: () => fetchAPI<SavingsGoal[]>('/savings-goals'),
  create: (data: Omit<SavingsGoal, 'id' | 'user_id' | 'created_at'>) =>
    fetchAPI<SavingsGoal>('/savings-goals', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<SavingsGoal>) =>
    fetchAPI<SavingsGoal>(`/savings-goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/savings-goals/${id}`, { method: 'DELETE' }),
};

export const transactionsApi = {
  list: async (params?: { month?: string; year?: number; type?: string; category_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.month) query.set('month', params.month);
    if (params?.year) query.set('year', params.year.toString());
    if (params?.type) query.set('type', params.type);
    if (params?.category_id) query.set('category_id', params.category_id);
    
    const txs = await fetchAPI<Transaction[]>(`/transactions?${query.toString()}`);
    const loans = await loansApi.list().catch(() => []);
    const loanMap = new Map(loans.map(l => [l.id, l]));

    return txs.map(t => {
      const memoRaw = t.memo ?? null;
      let memo = memoRaw;

      if (memoRaw?.startsWith('AUTO_LOAN|')) {
        const [, loanId, , installmentStr, termStr] = memoRaw.split('|');
        const loanLabel = loanMap.get(loanId)?.name ?? '대출';
        const term = Number(termStr);
        const inst = Number(installmentStr);
        const installmentText = term > 0 ? `${inst}/${term}` : `${inst}회차`;
        memo = `[ ${loanLabel} ] ${installmentText}`;
      } else if (memoRaw?.startsWith('SETTLE_LOAN|')) {
        const [, loanId] = memoRaw.split('|');
        const loanLabel = loanMap.get(loanId)?.name ?? '대출';
        memo = `${loanLabel} 상환 완료`;
      } else if (memoRaw?.startsWith('AUTO_BILL|')) {
        // category_name is pre-joined from server, or fallback to '고정지출'
        memo = `[고정지출] ${t.category_name ?? '구독'}`;
      } else if (memoRaw?.startsWith('AUTO_CARD|')) {
        memo = `[카드대금] ${t.account_name ?? '신용카드'}`;
      }

      return {
        ...t,
        memo,
        memo_raw: memoRaw,
      };
    });
  },
  create: (data: Omit<Transaction, 'id' | 'user_id' | 'created_at'>) =>
    fetchAPI<Transaction>('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Transaction>) =>
    fetchAPI<Transaction>(`/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI<void>(`/transactions/${id}`, { method: 'DELETE' }),
};

export const statsApi = {
  monthly: (month?: string) => {
    const query = month ? `?month=${month}` : '';
    return fetchAPI<MonthlyStats>(`/stats/monthly${query}`);
  },
  yearly: (year?: number) => {
    const query = year ? `?year=${year}` : '';
    return fetchAPI<{ year: number; monthlyTrend: Array<{ month: string; type: string; total: number }> }>(`/stats/yearly${query}`);
  },
};

// ================== Helpers ==================
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
