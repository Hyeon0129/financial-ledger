// src/App.tsx - Premium Personal Finance App with Apple Liquid Glass UI
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import type {
  Transaction, Category, Account, Budget, SavingsGoal, RecurringPayment,
  MonthlyStats
} from './api';
import {
  transactionsApi, categoriesApi, accountsApi, budgetsApi,
  savingsGoalsApi, recurringPaymentsApi, statsApi, userApi,
  formatCurrency, getMonthKey, formatDate
} from './api';
import './styles.css';

// ========== Types ==========
type View = 'dashboard' | 'transactions' | 'budgets' | 'categories' | 'accounts' | 'reports' | 'savings' | 'recurring' | 'profile';

// ========== Design Tokens (Charts & Icons) ==========
// (unused palette removed)

const Icons = {
  Plus: () => <span style={{ fontSize: 16, fontWeight: 600 }}>+</span>,
  Close: () => <span style={{ fontSize: 18, fontWeight: 300 }}>×</span>,
};

// ========== Main App ==========
const App: React.FC = () => {
  const [view, setView] = useState<View>('dashboard');
  const [month, setMonth] = useState<string>(getMonthKey(new Date()));
  const [currency, setCurrency] = useState('₩');
  const [theme] = useState<'light' | 'dark'>('dark');
  
  // Data states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply theme
  useEffect(() => {
    document.body.setAttribute('data-theme', 'dark');
  }, []);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  }, [month]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [user, cats, accs, goals, recurring] = await Promise.all([
          userApi.get(),
          categoriesApi.list(),
          accountsApi.list(),
          savingsGoalsApi.list(),
          recurringPaymentsApi.list(),
        ]);
        setCurrency(user.currency);
        setCategories(cats);
        setAccounts(accs);
        setSavingsGoals(goals);
        setRecurringPayments(recurring);
      } catch (error) {
        console.error('Failed to load data:', error);
        alert('서버 연결에 실패했습니다. 서버가 실행 중인지 확인해주세요.\n\n터미널에서 다음 명령어를 실행하세요:\nnpm install\nnpm run dev');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Load month-specific data
  useEffect(() => {
    const loadMonthData = async () => {
      try {
        const [txs, bds, monthStats] = await Promise.all([
          transactionsApi.list({ month }),
          budgetsApi.list(),
          statsApi.monthly(month),
        ]);
        setTransactions(txs);
        setBudgets(bds);
        setStats(monthStats);
      } catch (error) {
        console.error('Failed to load month data:', error);
      }
    };
    loadMonthData();
  }, [month]);

  // Refresh functions
  const refreshTransactions = useCallback(async () => {
    const txs = await transactionsApi.list({ month });
    setTransactions(txs);
    const monthStats = await statsApi.monthly(month);
    setStats(monthStats);
  }, [month]);

  const refreshBudgets = useCallback(async () => {
    const bds = await budgetsApi.list();
    setBudgets(bds);
    const monthStats = await statsApi.monthly(month);
    setStats(monthStats);
  }, [month]);

  const refreshCategories = useCallback(async () => {
    const cats = await categoriesApi.list();
    setCategories(cats);
  }, []);

  const refreshAccounts = useCallback(async () => {
    const accs = await accountsApi.list();
    setAccounts(accs);
  }, []);

  const refreshGoals = useCallback(async () => {
    const goals = await savingsGoalsApi.list();
    setSavingsGoals(goals);
  }, []);

  const refreshRecurring = useCallback(async () => {
    const recurring = await recurringPaymentsApi.list();
    setRecurringPayments(recurring);
  }, []);

  if (loading) {
  return (
      <div className="app-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading-spinner" />
        </div>
    );
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-left">
          <img src="https://pyron.dev/_next/image?url=%2Fimages%2Flogo.png&w=48&q=75" alt="Logo" className="header-logo" />
      </div>
        <nav className="header-center">
          <button 
            className={view === 'dashboard' ? 'active' : ''} 
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={view === 'transactions' ? 'active' : ''} 
            onClick={() => setView('transactions')}
          >
            Transactions
          </button>
          <button 
            className={view === 'budgets' ? 'active' : ''} 
            onClick={() => setView('budgets')}
          >
            Budgets
          </button>
          <button 
            className={view === 'reports' ? 'active' : ''} 
            onClick={() => setView('reports')}
          >
            Reports
          </button>
          <button 
            className={view === 'categories' ? 'active' : ''} 
            onClick={() => setView('categories')}
          >
            Categories
          </button>
          <button 
            className={view === 'accounts' ? 'active' : ''} 
            onClick={() => setView('accounts')}
          >
            Accounts
          </button>
          <button 
            className={view === 'savings' ? 'active' : ''} 
            onClick={() => setView('savings')}
          >
            My Goals
          </button>
        </nav>
        <div className="header-right">
          <div className="month-nav">
            <button onClick={() => {
              const [y, m] = month.split('-').map(Number);
              const prev = new Date(y, m - 2, 1);
              setMonth(getMonthKey(prev));
            }}>{'<'}</button>
            <div className="month-label">{monthLabel}</div>
            <button onClick={() => {
              const [y, m] = month.split('-').map(Number);
              const next = new Date(y, m, 1);
              setMonth(getMonthKey(next));
            }}>{'>'}</button>
        </div>
        </div>
      </header>
      <main className="app-main">
        <section className="content">
          <div className="content-header">
            <h1 className="page-title">{view.charAt(0).toUpperCase() + view.slice(1)}</h1>
        </div>
          {view === 'dashboard' && (
            <DashboardView 
              stats={stats}
              transactions={transactions}
              budgets={budgets}
              savingsGoals={savingsGoals}
              recurringPayments={recurringPayments}
              categories={categories}
              accounts={accounts}
              currency={currency}
              month={month}
              onNavigate={setView}
              theme={theme}
            />
          )}
          {view === 'transactions' && (
            <TransactionsView
              transactions={transactions}
              categories={categories}
              accounts={accounts}
              currency={currency}
              month={month}
              onRefresh={refreshTransactions}
            />
          )}
          {view === 'budgets' && (
            <BudgetsView
              budgets={budgets}
              categories={categories}
              stats={stats}
              currency={currency}
              month={month}
            transactions={transactions}
              onRefresh={refreshBudgets}
            />
          )}
          {view === 'categories' && (
            <CategoriesView
              categories={categories}
              onRefresh={refreshCategories}
            />
          )}
          {view === 'accounts' && (
            <AccountsView
              accounts={accounts}
              onRefresh={refreshAccounts}
            />
          )}
          {view === 'reports' && (
            <ReportsView
              stats={stats}
              currency={currency}
            />
          )}
          {view === 'savings' && (
            <SavingsView
              goals={savingsGoals}
              currency={currency}
              onRefresh={refreshGoals}
            />
          )}
          {view === 'recurring' && (
            <RecurringView
              payments={recurringPayments}
              categories={categories}
              accounts={accounts}
              currency={currency}
              onRefresh={refreshRecurring}
            />
          )}
      {view === 'profile' && <ProfileView />}
        </section>
      </main>
      </div>
  );
};

// ========== Dashboard View ==========
const DashboardView: React.FC<{
  stats: MonthlyStats | null;
  transactions: Transaction[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  recurringPayments: RecurringPayment[];
  categories: Category[];
  accounts: Account[];
  currency: string;
  month: string;
  onNavigate: (v: View) => void;
  theme: 'light' | 'dark';
}> = ({ stats, transactions, budgets, currency, month, theme, accounts, onNavigate, savingsGoals }) => {
  const isDark = theme === 'dark';
  const axisColor = isDark ? '#d4d4d8' : '#999999';
  const gridColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const totalIncome = stats?.income ?? 0;
  const totalExpense = stats?.expense ?? 0;
  const netRevenue = stats ? stats.balance : 0;
  const totalBudget = budgets.reduce((sum: number, b: Budget) => sum + b.amount, 0);
  
  // Daily trend chart data
  const chartData = useMemo(() => {
    if (!stats) return [];
    

    const daysInMonth = new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0).getDate();
    const data = [];
    
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${month}-${String(i).padStart(2, '0')}`;
      const dayExpense = stats.dailyTrend
        .filter(d => d.date === dateStr && d.type === 'expense')
        .reduce((sum, d) => sum + d.total, 0);
      const dayIncome = stats.dailyTrend
        .filter(d => d.date === dateStr && d.type === 'income')
        .reduce((sum, d) => sum + d.total, 0);
      
      data.push({
        day: i,
        지출: dayExpense,
        수입: dayIncome,
      });
    }
    return data;
  }, [stats, month]);

  // Category pie chart data
  const expenseByCategory = useMemo(() => {
    if (!stats) return [];
    return stats.byCategory
      .filter(c => c.type === 'expense')
      .slice(0, 6)
      .map(c => ({
        name: c.category_name,
        value: c.total,
      }));
  }, [stats]);

  const accountUsage = useMemo(() => {
    const map: Record<string, { spent: number; income: number }> = {};
    transactions.forEach((t) => {
      const key = t.account_id || 'unknown';
      if (!map[key]) map[key] = { spent: 0, income: 0 };
      if (t.type === 'expense') map[key].spent += t.amount;
      if (t.type === 'income') map[key].income += t.amount;
    });
    return map;
  }, [transactions]);

  if (!stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <>
      {/* First Row: Balance + Earnings Report */}
      <div className="dashboard-row">
        <div className="card balance-card">
          <div className="card-header" style={{ marginBottom: 20 }}>
            <div className="card-title">잔액</div>
            <div className="card-subtitle">이번 달</div>
            </div>
          <div className="balance-info">
            <div className="balance-label">현재 잔액</div>
            <div className="balance-amount">{formatCurrency(stats.balance, currency)}</div>
            <div className="balance-currency">KRW</div>
          </div>
          <div className="balance-actions">
            <button className="balance-btn" onClick={() => onNavigate('transactions')}>입출금</button>
            <button className="balance-btn" onClick={() => onNavigate('accounts')}>계좌 관리</button>
            <button className="balance-btn" onClick={() => onNavigate('budgets')}>예산 보기</button>
          </div>
        </div>

        <div className="card earnings-chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Expense Report</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>1 Year</span>
            </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4} margin={{ left: -10, right: 10 }} barCategoryGap={10}>
                <defs>
                  <linearGradient id="dashboardExpenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#cfd2d7" />
                    <stop offset="100%" stopColor="#4b5563" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fontWeight: 500, fill: axisColor }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: axisColor, fontWeight: 500 }} 
                  tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} 
                />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    background: 'rgba(20,20,22,0.92)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    color: '#f8fafc',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
                    padding: '10px 14px',
                  }}
                  labelStyle={{ color: '#e5e7eb', fontWeight: 700 }}
                  formatter={(value: number) => formatCurrency(value, currency)}
                />
                <Bar dataKey="지출" fill="url(#dashboardExpenseGradient)" radius={[6, 6, 0, 0]} activeBar={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          </div>
        </div>

      {/* Second Row: Metrics + Currencies + Transactions */}
      <div className="dashboard-row-2">
        <div className="metrics-grid">
          <div className="card metric-card-small">
            <div className="metric-title">Total Earnings</div>
            <div className="metric-value">{formatCurrency(totalIncome, currency)}</div>
            <div className="metric-change positive">+6% This week</div>
            </div>
          <div className="card metric-card-small metric-spending">
            <div className="metric-title">Total Spending</div>
            <div className="metric-value">{formatCurrency(totalExpense, currency)}</div>
            <div className="metric-change negative">-16% This week</div>
          </div>
          <div className="card metric-card-small">
            <div className="metric-title">Net Balance</div>
            <div className="metric-value">{formatCurrency(netRevenue, currency)}</div>
            <div className="metric-change positive">+2% This week</div>
          </div>
          <div className="card metric-card-small">
            <div className="metric-title">Transactions</div>
            <div className="metric-value">{stats.transactionCount.toLocaleString()} 건</div>
            <div className="metric-change positive">+60% This year</div>
          </div>
          <div className="card monthly-limit-card">
            <div className="metric-title">Monthly Spending Limit</div>
            <div className="progress-bar-wrapper">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: totalBudget > 0 ? `${Math.min(100, (stats.expense / totalBudget) * 100)}%` : '0%' }}></div>
              </div>
              <div className="progress-labels">
                <span>{formatCurrency(stats.expense, currency)}</span>
                <span>{formatCurrency(totalBudget, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card currencies-card">
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Highlighted currencies
            </div>
          <div className="crypto-list">
            {expenseByCategory.slice(0, 5).map((item, idx) => (
              <div key={idx} className="crypto-item">
                <div className="crypto-icon">{item.name.charAt(0)}</div>
                <div className="crypto-info">
                  <div className="crypto-name">{item.name}</div>
                  <div className="crypto-symbol">{item.name.substring(0, 3).toUpperCase()}</div>
          </div>
                <div className="crypto-price">
                  <div className="crypto-amount">{formatCurrency(item.value, currency)}</div>
                  <div className="crypto-time">Now</div>
          </div>
          </div>
            ))}
        </div>
        </div>

        <div className="card transactions-card">
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Last Transactions
              </div>
          <div className="transactions-list">
            {transactions.slice(0, 6).map((tx) => (
              <div key={tx.id} className="transaction-item">
                <div className="transaction-icon">→</div>
                <div className="transaction-info">
                  <div className="transaction-name">{tx.memo || tx.category_name || 'Transaction'}</div>
                  <div className="transaction-detail">{formatDate(tx.date)}</div>
            </div>
                <div className={`transaction-amount ${tx.type === 'income' ? 'positive' : 'negative'}`}>
                  {tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount, currency)}
          </div>
            </div>
            ))}
          </div>
        </div>
      </div>

      {/* Third Row: Cards + Goals */}
      <div className="dashboard-row-3">
        <div className="card cards-board">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">Your cards</div>
              <div className="card-subtitle">이번 달 카드 현황</div>
                      </div>
            <button className="btn btn-sm" onClick={() => onNavigate('accounts')}>Manage</button>
          </div>
          <div className="cards-list">
            {accounts.length > 0 ? (
              accounts.map((acc) => {
                const usage = accountUsage[acc.id] || { spent: 0, income: 0 };
                return (
                  <div
                    key={acc.id}
                    className="bank-card real"
                  >
                    <div className="bank-card-top">
                      <div className="bank-card-brand">{acc.name}</div>
                      <div className="bank-card-chip">💳</div>
                      </div>
                    <div className="bank-card-balance">{formatCurrency(acc.balance, currency)}</div>
                    <div className="bank-card-bottom">
                      <div>
                        <div className="bank-card-label">TYPE</div>
                        <div className="bank-card-value">{acc.type.toUpperCase()}</div>
                      </div>
                      <div>
                        <div className="bank-card-label">Spending this month</div>
                        <div className="bank-card-value">{formatCurrency(usage.spent, currency)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state" style={{ padding: 24, alignItems: 'flex-start' }}>
                <div className="empty-state-text">등록된 카드가 없습니다.</div>
                <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => onNavigate('accounts')}>
                  카드 등록하기
                </button>
            </div>
          )}
          </div>
        </div>

        <div className="card goals-board">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">My Goals</div>
              <div className="card-subtitle">목표 진행률</div>
            </div>
            <button className="btn btn-sm" onClick={() => onNavigate('savings')}>Add Goals</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: 13, minWidth: 320 }}>
              <thead>
                <tr>
                  <th>목표</th>
                  <th style={{ textAlign: 'right' }}>진행률</th>
                  <th style={{ textAlign: 'right' }}>현재/목표</th>
                </tr>
              </thead>
              <tbody>
                {savingsGoals.map((goal) => {
                  const progress = goal.target_amount > 0 ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0;
                  return (
                    <tr key={goal.id}>
                      <td>{goal.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{progress.toFixed(0)}%</td>
                      <td style={{ textAlign: 'right' }}>
                        {formatCurrency(goal.current_amount, currency)} / {formatCurrency(goal.target_amount, currency)}
                      </td>
                    </tr>
                  );
                })}
                {savingsGoals.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: 16, color: 'var(--text-tertiary)' }}>
                      저축 목표가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </div>
    </>
  );
};

// ========== Transactions View ==========
const TransactionsView: React.FC<{
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  currency: string;
  month: string;
  onRefresh: () => void;
}> = ({ transactions, categories, accounts, currency, month, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 거래를 삭제할까요?')) return;
    await transactionsApi.delete(id);
    await onRefresh();
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number);
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();
    
    const days: Array<{ date: string; isCurrentMonth: boolean; dayNum: number }> = [];
    
    // Previous month days
    const prevMonthLastDay = new Date(year, monthNum - 1, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      days.push({
        date: `${year}-${String(monthNum - 1).padStart(2, '0')}-${String(prevMonthLastDay - i).padStart(2, '0')}`,
        isCurrentMonth: false,
        dayNum: prevMonthLastDay - i
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: `${year}-${String(monthNum).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        isCurrentMonth: true,
        dayNum: i
      });
    }
    
    // Next month days
    const remaining = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        isCurrentMonth: false,
        dayNum: i
      });
    }
    
    return days;
  }, [month]);

  // Group transactions by date
  const transactionsByDate = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};
    transactions.forEach(t => {
      if (!grouped[t.date]) grouped[t.date] = [];
      grouped[t.date].push(t);
    });
    return grouped;
  }, [transactions]);

  const selectedDayTransactions = selectedDate ? transactionsByDate[selectedDate] || [] : [];
  const today = new Date().toISOString().split('T')[0];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
          <div className="panel-title">Transactions</div>
          <div className="panel-sub">{month} · {transactions.length} entries</div>
            </div>
        <button className="btn btn-primary" onClick={() => { setEditingTransaction(null); setShowForm(true); }}>
          <Icons.Plus /> New Transaction
        </button>
        </div>

      <div className="panel" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="panel-main">
          <div className="calendar">
            <div className="calendar-header">Sun</div>
            <div className="calendar-header">Mon</div>
            <div className="calendar-header">Tue</div>
            <div className="calendar-header">Wed</div>
            <div className="calendar-header">Thu</div>
            <div className="calendar-header">Fri</div>
            <div className="calendar-header">Sat</div>
            
            {calendarDays.map((day, idx) => {
              const dayTransactions = transactionsByDate[day.date] || [];
              const isToday = day.date === today;
              
              return (
                <div 
                  key={idx}
                  className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${selectedDate === day.date ? 'selected' : ''}`}
                  onClick={() => day.isCurrentMonth && setSelectedDate(day.date)}
          >
                  <div className="calendar-day-number">{day.dayNum}</div>
                  <div className="calendar-transactions">
                    {dayTransactions.slice(0, 3).map((t, i) => (
                      <div key={i} className={`calendar-transaction-item ${t.type}`}>
                        {formatCurrency(t.amount, currency)}
                      </div>
            ))}
                    {dayTransactions.length > 3 && (
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        +{dayTransactions.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel-side">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                {selectedDate ? formatDate(selectedDate) : '날짜를 선택하세요'}
              </div>
              <div className="panel-sub">
                {selectedDayTransactions.length} transactions
              </div>
            </div>
          </div>

          {selectedDayTransactions.length > 0 ? (
            <table className="data-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
                  <th>Type</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
                {selectedDayTransactions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className={`badge ${t.type}`}>
                        {t.type === 'income' ? 'IN' : 'OUT'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.category_name}</div>
                      {t.memo && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {t.memo}
                        </div>
                      )}
                    </td>
                    <td style={{ 
                      textAlign: 'right', 
                      fontWeight: 700,
                      color: t.type === 'income' ? 'var(--success)' : 'var(--danger)',
                      fontFeatureSettings: '"tnum"'
                    }}>
                      {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount, currency)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => handleEdit(t)}>
                          수정
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>
                        삭제
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
          ) : selectedDate ? (
            <div className="empty-state">
              <div className="empty-state-text">No transactions</div>
      </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-text">Select a date to view transactions</div>
          </div>
          )}
        </div>
      </div>

      {showForm && (
        <TransactionFormModal
          categories={categories}
          accounts={accounts}
          defaultMonth={month}
          editingTransaction={editingTransaction}
          onClose={() => { setShowForm(false); setEditingTransaction(null); }}
          onSave={() => {
          setShowForm(false);
          setEditingTransaction(null);
          onRefresh();
        }}
        />
      )}
    </>
  );
};

// ========== Transaction Form Modal ==========
const TransactionFormModal: React.FC<{
  categories: Category[];
  accounts: Account[];
  defaultMonth: string;
  editingTransaction?: Transaction | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ categories, accounts, defaultMonth, editingTransaction, onClose, onSave }) => {
  const today = new Date();
  const defaultDate = defaultMonth === getMonthKey(today)
    ? today.toISOString().split('T')[0]
    : `${defaultMonth}-01`;

  const [date, setDate] = useState(editingTransaction?.date || defaultDate);
  const [type, setType] = useState<'income' | 'expense'>((editingTransaction?.type === 'transfer' ? 'expense' : editingTransaction?.type) || 'expense');
  const [accountId, setAccountId] = useState(editingTransaction?.account_id || accounts[0]?.id || '');
  const [categoryId, setCategoryId] = useState(editingTransaction?.category_id || '');
  const [amount, setAmount] = useState(editingTransaction ? String(editingTransaction.amount) : '');
  const [memo, setMemo] = useState(editingTransaction?.memo || '');
  const [saving, setSaving] = useState(false);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type]
  );

  const groupedCategories = useMemo(() => {
    const parents = filteredCategories.filter((c) => !c.parent_id);
    return parents.map((parent) => ({
      parent,
      children: filteredCategories.filter((c) => c.parent_id === parent.id),
    }));
  }, [filteredCategories]);

  useEffect(() => {
    const first =
      filteredCategories.find((c) => c.id === categoryId) ||
      filteredCategories[0];
    if (first) {
      setCategoryId(first.id);
    }
  }, [type, filteredCategories, categoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    if (!value || value <= 0) {
      alert('금액을 입력해주세요.');
      return;
    }
    
    setSaving(true);
    try {
      if (editingTransaction) {
        await transactionsApi.update(editingTransaction.id, {
      date,
      type,
          account_id: accountId,
          category_id: categoryId,
      amount: value,
          memo: memo.trim() || null,
    });
      } else {
        await transactionsApi.create({
          date,
          type,
          account_id: accountId,
          category_id: categoryId,
          amount: value,
          memo: memo.trim() || null,
          to_account_id: null,
        });
      }
      onSave();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
    setSaving(false);
  }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="panel-title">{editingTransaction ? 'Edit Transaction' : 'New Transaction'}</div>
            <div className="panel-sub">{editingTransaction ? 'Update transaction details' : 'Enter transaction details'}</div>
            </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="form-select"
                value={type}
                onChange={(e) => setType(e.target.value as 'income' | 'expense')}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Account</label>
              <select
                className="form-select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {groupedCategories.map((group) =>
                  group.children.length > 0 ? (
                    <optgroup key={group.parent.id} label={group.parent.name}>
                      {group.children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                  </option>
                ))}
                    </optgroup>
                  ) : (
                    <option key={group.parent.id} value={group.parent.id}>
                      {group.parent.name}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Amount</label>
            <input
              className="form-input"
              placeholder="e.g. 50,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Memo</label>
            <textarea
              className="form-textarea"
              placeholder="Optional description"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========== Budgets View ==========
const BudgetsView: React.FC<{
  budgets: Budget[];
  categories: Category[];
  stats: MonthlyStats | null;
  currency: string;
  month: string;
  transactions: Transaction[];
  onRefresh: () => void;
}> = ({ budgets, categories, stats, currency, month, transactions, onRefresh }) => {
  const expenseCategories = useMemo(() => 
    categories.filter((c) => c.type === 'expense'),
    [categories]
  );

  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [categoryId, setCategoryId] = useState(() => expenseCategories[0]?.id ?? '');
  const [amount, setAmount] = useState('');

  const openCreate = () => {
    setEditingBudget(null);
    setCategoryId(expenseCategories[0]?.id ?? '');
    setAmount('');
    setShowModal(true);
  };

  const openEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setCategoryId(budget.category_id);
    setAmount(String(budget.amount));
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    if (!value || value <= 0) {
      alert('예산 금액을 입력해주세요.');
      return;
    }
    try {
      await budgetsApi.create({
        category_id: categoryId,
        amount: value,
      });
      setShowModal(false);
      await onRefresh();
    } catch {
      alert('예산 저장에 실패했습니다.');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (!window.confirm('이 예산을 삭제할까요?')) return;
    try {
      await budgetsApi.delete(id);
      await onRefresh();
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  const expenseTransactions = useMemo(
    () => transactions.filter((t) => t.type === 'expense'),
    [transactions]
  );

  return (
    <>
      <div className="panel budget-grid">
        <div className="panel-main budget-half">
          <div className="panel-header">
            <div>
              <div className="panel-title">예산 관리</div>
              <div className="panel-sub">{month} 카테고리별 예산</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>예산 추가</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table glass-table" style={{ minWidth: 680 }}>
              <thead>
                <tr>
                  <th>카테고리</th>
                  <th style={{ textAlign: 'right' }}>예산</th>
                  <th style={{ textAlign: 'right' }}>사용액</th>
                  <th style={{ textAlign: 'right' }}>잔액</th>
                  <th style={{ textAlign: 'center', width: 120 }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((budget) => {
                  const spent = stats?.budgetUsage.find(b => b.id === budget.id)?.spent ?? 0;
                  const remaining = Math.max(0, budget.amount - spent);
                  return (
                    <tr key={budget.id}>
                      <td>{budget.category_name}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(budget.amount, currency)}</td>
                      <td style={{ textAlign: 'right', color: '#EF4444', fontWeight: 700 }}>{formatCurrency(spent, currency)}</td>
                      <td style={{ textAlign: 'right', color: '#10B981', fontWeight: 700 }}>{formatCurrency(remaining, currency)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button className="btn btn-sm" onClick={() => openEdit(budget)}>수정</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteBudget(budget.id)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {budgets.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                      예산이 없습니다. 추가 버튼을 눌러 등록하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-side budget-half">
          <div className="panel-header">
            <div>
              <div className="panel-title">지출 내역</div>
              <div className="panel-sub">Reports 하단 테이블을 예산 화면에 배치했습니다</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table glass-table" style={{ fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>Type</th>
                  <th>카테고리</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                  <th>Account</th>
                  <th>Memo</th>
                </tr>
              </thead>
              <tbody>
                {expenseTransactions.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.date)}</td>
                    <td>{t.type.toUpperCase()}</td>
                    <td>{t.category_name}</td>
                    <td style={{ textAlign: 'right', color: '#EF4444', fontWeight: 700 }}>{formatCurrency(t.amount, currency)}</td>
                    <td>{t.account_name || '-'}</td>
                    <td>{t.memo || '-'}</td>
                  </tr>
                ))}
                {expenseTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                      지출 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="panel-title">{editingBudget ? '예산 수정' : '예산 추가'}</div>
                <div className="panel-sub">같은 카테고리는 덮어씌워집니다</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <Icons.Close />
              </button>
            </div>

            <form className="form" onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">카테고리</label>
                <select
                  className="form-select"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">예산 금액</label>
                <input
                  className="form-input"
                  placeholder="예: 300,000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">저장</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

// Category List Component
const CategoryList: React.FC<{ 
  items: Category[]; 
  title: string; 
  onEdit: (cat: Category) => void;
  onDelete: (id: string) => void;
}> = ({ items, title, onEdit, onDelete }) => (
  <div className="panel-main" style={{ marginBottom: 20 }}>
    <div className="panel-header">
      <div className="panel-title">{title}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {items.map((cat) => (
        <div key={cat.id} className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ 
              width: 12, height: 12, borderRadius: 4, 
              background: cat.color 
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{cat.name}</div>
              {cat.parent_id && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  소분류
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => onEdit(cat)} style={{ flex: 1 }}>
              수정
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(cat.id)} style={{ flex: 1 }}>
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ========== Categories View ==========
const CategoriesView: React.FC<{
  categories: Category[];
  onRefresh: () => void;
}> = ({ categories, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const handleEdit = (cat: Category) => {
    setEditingCategory(cat);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 카테고리를 삭제할까요?')) return;
    await categoriesApi.delete(id);
    onRefresh();
  };

  const incomeCategories = useMemo(() => 
    categories.filter((c) => c.type === 'income'),
    [categories]
  );
  const expenseCategories = useMemo(() => 
    categories.filter((c) => c.type === 'expense'),
    [categories]
  );
  const expenseTree = useMemo(() => {
    const parents = expenseCategories.filter((c) => !c.parent_id);
    const children = expenseCategories.filter((c) => c.parent_id);
    const grouped = parents.map((parent) => ({
      parent,
      children: children.filter((c) => c.parent_id === parent.id),
    }));
    const orphans = children.filter(
      (child) => !parents.some((p) => p.id === child.parent_id)
    );
    return { grouped, orphans };
  }, [expenseCategories]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="panel-title">카테고리 관리</div>
          <div className="panel-sub">수입/지출 카테고리를 관리합니다</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingCategory(null); setShowForm(true); }}>
          <Icons.Plus /> 새 카테고리
        </button>
      </div>

      <CategoryList 
        items={incomeCategories} 
        title="수입 카테고리" 
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <div className="panel-main" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">지출 카테고리</div>
            <div className="panel-sub">대분류와 소분류를 테이블로 구분해 보여줍니다</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table glass-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>대분류</th>
                <th>소분류</th>
                <th>구분</th>
                <th style={{ width: 160, textAlign: 'center' }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {expenseTree.grouped.map(({ parent, children }) => (
                <React.Fragment key={parent.id}>
                  <tr className="category-parent-row">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="color-dot" style={{ background: parent.color }} />
                        <span>{parent.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-tertiary)' }}>-</td>
                    <td>대분류</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button className="btn btn-sm" onClick={() => handleEdit(parent)}>수정</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(parent.id)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                  {children.map((child) => (
                    <tr key={child.id} className="category-child-row">
                      <td style={{ color: 'var(--text-tertiary)' }}>{parent.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="color-dot" style={{ background: child.color }} />
                          <span>{child.name}</span>
                        </div>
                      </td>
                      <td>소분류</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button className="btn btn-sm" onClick={() => handleEdit(child)}>수정</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(child.id)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {expenseTree.orphans.map((child) => (
                <tr key={child.id} className="category-child-row">
                  <td style={{ color: 'var(--text-tertiary)' }}>미분류</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="color-dot" style={{ background: child.color }} />
                      <span>{child.name}</span>
                    </div>
                  </td>
                  <td>소분류</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button className="btn btn-sm" onClick={() => handleEdit(child)}>수정</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(child.id)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenseCategories.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)' }}>
                    지출 카테고리가 없습니다. 상단 버튼으로 추가하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <CategoryFormModal
          categories={categories}
          editingCategory={editingCategory}
          onClose={() => { setShowForm(false); setEditingCategory(null); }}
          onSave={() => {
            setShowForm(false);
            setEditingCategory(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

// ========== Category Form Modal ==========
const CategoryFormModal: React.FC<{
  categories: Category[];
  editingCategory?: Category | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ categories, editingCategory, onClose, onSave }) => {
  const [name, setName] = useState(editingCategory?.name || '');
  const [type, setType] = useState<'income' | 'expense'>(editingCategory?.type || 'expense');
  const [parentId, setParentId] = useState<string>(editingCategory?.parent_id || '');
  const [color, setColor] = useState(editingCategory?.color || '#007AFF');
  const [saving, setSaving] = useState(false);

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'
  ];

  const parentOptions = useMemo(
    () => categories.filter((c) => c.type === type && !c.parent_id),
    [categories, type]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('카테고리 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await categoriesApi.update(editingCategory.id, {
          name: name.trim(),
          type,
          parent_id: parentId || null,
          color,
        });
      } else {
        await categoriesApi.create({
          name: name.trim(),
          type,
          parent_id: parentId || null,
          color,
          icon: null,
        });
      }
      onSave();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
      <div>
            <div className="panel-title">새 카테고리</div>
            <div className="panel-sub">카테고리 정보를 입력해주세요</div>
        </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
      </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">이름</label>
            <input
              className="form-input"
              placeholder="카테고리 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">유형</label>
            <select
              className="form-select"
              value={type}
              onChange={(e) => {
                setType(e.target.value as 'income' | 'expense');
                setParentId('');
                }}
              >
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
              </div>

          <div className="form-group">
            <label className="form-label">상위 카테고리 (선택)</label>
            <select
              className="form-select"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">상위 없음 (대분류)</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">색상</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: c,
                    border: color === c ? '2px solid #F9FAFB' : '1px solid rgba(148,163,184,0.5)',
                    cursor: 'pointer',
                  }}
                />
              ))}
              </div>
            </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
              </div>
            </div>
          );
};

// ========== Accounts View ==========
const AccountsView: React.FC<{
  accounts: Account[];
  onRefresh: () => void;
}> = ({ accounts, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 계좌를 삭제할까요?')) return;
    await accountsApi.delete(id);
    onRefresh();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="panel-title">계좌 관리</div>
          <div className="panel-sub">저축통장, 신용카드, 체크카드 등을 관리합니다</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icons.Plus /> 새 계좌
        </button>
      </div>

      <div className="panel" style={{ gridTemplateColumns: '1fr' }}>
        <div className="panel-main">
          <table className="data-table">
            <thead>
              <tr>
                <th>유형</th>
                <th>계좌명</th>
                <th style={{ textAlign: 'right' }}>잔액</th>
                <th style={{ width: 120 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <span className="badge" style={{ 
                      background: `${account.color}20`, 
                      color: account.color 
                    }}>
                      {account.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{account.name}</td>
                  <td style={{ 
                    textAlign: 'right', 
                    fontWeight: 700,
                    color: account.balance >= 0 ? 'var(--success)' : 'var(--danger)',
                    fontFeatureSettings: '"tnum"'
                  }}>
                    ₩ {account.balance.toLocaleString()}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(account.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <AccountFormModal
          onClose={() => setShowForm(false)}
          onSave={() => {
            setShowForm(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

// ========== Account Form Modal ==========
const AccountFormModal: React.FC<{
  onClose: () => void;
  onSave: () => void;
}> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'cash' | 'bank' | 'card' | 'investment'>('bank');
  const [balance, setBalance] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [saving, setSaving] = useState(false);

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('계좌 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      await accountsApi.create({
        name: name.trim(),
        type,
        balance: Number(balance.replace(/,/g, '')) || 0,
        color,
        icon: null,
      });
      onSave();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="panel-title">새 계좌</div>
            <div className="panel-sub">계좌 정보를 입력해주세요</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">이름</label>
            <input
              className="form-input"
              placeholder="예: 주거래 통장, 신용카드"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">유형</label>
            <select
              className="form-select"
              value={type}
              onChange={(e) => setType(e.target.value as 'cash' | 'bank' | 'card' | 'investment')}
            >
              <option value="cash">현금</option>
              <option value="bank">은행 계좌</option>
              <option value="card">카드</option>
              <option value="investment">투자</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">잔액</label>
            <input
              className="form-input"
              placeholder="예: 1,000,000"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">색상</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: c, border: color === c ? '3px solid #000' : 'none',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========== Reports View ==========
const ReportsView: React.FC<{
  stats: MonthlyStats | null;
  currency: string;
}> = ({ stats, currency }) => {
  const expenseByCategory = stats?.byCategory
    .filter((c) => c.type === 'expense')
    .sort((a, b) => b.total - a.total) ?? [];

  const lineData = useMemo(() => {
    if (!stats) return [];
    const daysInMonth = new Date(Number(stats.month.split('-')[0]), Number(stats.month.split('-')[1]), 0).getDate();
    const data: Array<{ day: number; income: number; expense: number }> = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${stats.month}-${String(i).padStart(2, '0')}`;
      const inc = stats.dailyTrend.filter(d => d.date === dateStr && d.type === 'income').reduce((s, d) => s + d.total, 0);
      const exp = stats.dailyTrend.filter(d => d.date === dateStr && d.type === 'expense').reduce((s, d) => s + d.total, 0);
      data.push({ day: i, income: inc, expense: exp });
    }
    return data;
  }, [stats]);

  const axisColor = '#d4d4d8';
  const gridColor = 'rgba(255,255,255,0.12)';
  const tooltipBg = 'rgba(20, 20, 22, 0.92)';
  const tooltipBorder = 'rgba(255,255,255,0.08)';
  const tooltipLabel = '#f4f4f5';
  const tooltipText = '#e5e7eb';
  const incomeColor = '#5B6CF7';
  const expenseColor = '#39D353';

  if (!stats) return <div className="loading-spinner" />;

  return (
    <div className="reports-stack">
      <div className="card-grid card-grid-3">
        <div className="card">
          <div className="card-title">총 거래 건수</div>
          <div className="card-value">{stats.transactionCount}건</div>
          <div className="card-sub">이번 달 전체 거래</div>
        </div>
        <div className="card">
          <div className="card-title">일평균 지출</div>
          <div className="card-value expense">
            {formatCurrency(Math.round(stats.expense / new Date().getDate()), currency)}
          </div>
          <div className="card-sub">하루 평균 지출 금액</div>
        </div>
        <div className="card">
          <div className="card-title">최고 지출 카테고리</div>
          <div className="card-value">
            {expenseByCategory[0]?.category_name || '-'}
          </div>
          <div className="card-sub">
            {expenseByCategory[0] ? formatCurrency(expenseByCategory[0].total, currency) : '-'}
          </div>
        </div>
      </div>

      <div className="reports-chart-grid">
        <div className="card" style={{ padding: 24 }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">Activity Summary</div>
              <div className="card-subtitle">수입/지출 추이</div>
            </div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fontWeight: 500, fill: axisColor }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: axisColor, fontWeight: 500 }}
                  tickFormatter={(v) => `${(v/10000).toFixed(0)}만`}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: 12,
                    color: tooltipText,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
                    padding: '10px 14px',
                  }}
                  labelStyle={{ color: tooltipLabel, fontWeight: 700 }}
                  formatter={(value: number) => formatCurrency(value, currency)}
                />
                <Line type="monotone" dataKey="income" stroke={incomeColor} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="expense" stroke={expenseColor} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">지출 카테고리 분석</div>
              <div className="card-subtitle">카테고리별 지출</div>
            </div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseByCategory.slice(0, 10)} layout="vertical" margin={{ left: 12, right: 12 }}>
                <defs>
                  <linearGradient id="reportsCategoryGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#d1d5db" />
                    <stop offset="100%" stopColor="#4b5563" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal vertical={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${(v/10000).toFixed(0)}만`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fontWeight: 500, fill: axisColor }}
                />
                <YAxis
                  type="category"
                  dataKey="category_name"
                  width={120}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 13, fontWeight: 600, fill: axisColor }}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value, currency)}
                  contentStyle={{
                    borderRadius: 8,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                    padding: '12px 16px',
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    color: tooltipText,
                  }}
                  labelStyle={{ color: tooltipLabel, fontWeight: 600, marginBottom: 8 }}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]} fill="url(#reportsCategoryGradient)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========== Savings View ==========
const SavingsView: React.FC<{
  goals: SavingsGoal[];
  currency: string;
  onRefresh: () => void;
}> = ({ goals, currency, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 목표를 삭제할까요?')) return;
    await savingsGoalsApi.delete(id);
    onRefresh();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="panel-title">Savings Goals</div>
          <div className="panel-sub">Track your savings progress</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icons.Plus /> New Goal
        </button>
      </div>

      {goals.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table glass-table goals-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>목표</th>
                <th style={{ textAlign: 'right' }}>진행률</th>
                <th style={{ textAlign: 'right' }}>현재 금액</th>
                <th style={{ textAlign: 'right' }}>목표 금액</th>
                <th>기한</th>
                <th style={{ textAlign: 'center', width: 120 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => {
                const progress = goal.target_amount > 0 ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0;
                return (
                  <tr key={goal.id}>
                    <td>{goal.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{progress.toFixed(0)}%</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(goal.current_amount, currency)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(goal.target_amount, currency)}</td>
                    <td>{goal.deadline ? formatDate(goal.deadline) : '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(goal.id)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state" style={{ borderRadius: 20, padding: 60 }}>
          <div className="empty-state-title">No Savings Goals</div>
          <div className="empty-state-text">Create your first savings goal to start tracking progress.</div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowForm(true)}>
            <Icons.Plus /> New Goal
          </button>
        </div>
      )}

      {showForm && (
        <SavingsFormModal
          onClose={() => setShowForm(false)}
          onSave={() => {
            setShowForm(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

// ========== Savings Form Modal ==========
const SavingsFormModal: React.FC<{
  onClose: () => void;
  onSave: () => void;
}> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [color, setColor] = useState('#007AFF');
  const [saving, setSaving] = useState(false);

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('목표 이름을 입력해주세요.');
      return;
    }
    const target = Number(targetAmount.replace(/,/g, ''));
    if (!target || target <= 0) {
      alert('목표 금액을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      await savingsGoalsApi.create({
        name: name.trim(),
        target_amount: target,
        current_amount: Number(currentAmount.replace(/,/g, '')) || 0,
        deadline: deadline || null,
        color,
        icon: null,
      });
      onSave();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="panel-title">새 저축 목표</div>
            <div className="panel-sub">목표 정보를 입력해주세요</div>
            </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
          </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">목표 이름</label>
            <input
              className="form-input"
              placeholder="예: 비상금, 여행 자금"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
        </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">목표 금액</label>
              <input
                className="form-input"
                placeholder="예: 10,000,000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">현재 금액</label>
              <input
                className="form-input"
                placeholder="예: 1,000,000"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">목표일 (선택)</label>
            <input
              type="date"
              className="form-input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">색상</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: c, border: color === c ? '3px solid #000' : 'none',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
          </form>
      </div>
    </div>
  );
};

// ========== Recurring View ==========
const RecurringView: React.FC<{
  payments: RecurringPayment[];
  categories: Category[];
  accounts: Account[];
  currency: string;
  onRefresh: () => void;
}> = ({ payments, categories, accounts, currency, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null);

  const handleEdit = (payment: RecurringPayment) => {
    setEditingPayment(payment);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 정기 결제를 삭제할까요?')) return;
    await recurringPaymentsApi.delete(id);
    onRefresh();
  };

  const cycleLabels: Record<string, string> = {
    daily: '매일',
    weekly: '매주',
    monthly: '매월',
    yearly: '매년',
  };

  const totalMonthly = payments
    .filter(p => p.is_active && p.cycle === 'monthly')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
          <div className="panel-title">정기 결제</div>
          <div className="panel-sub">월 예상 결제액: {formatCurrency(totalMonthly, currency)}</div>
            </div>
        <button className="btn btn-primary" onClick={() => { setEditingPayment(null); setShowForm(true); }}>
          <Icons.Plus /> 새 정기결제
        </button>
          </div>

      {payments.length > 0 ? (
        <div className="card-grid card-grid-3">
          {payments.map((payment) => (
            <div key={payment.id} className="card">
              <div className="card-header">
                <span className="card-title">{cycleLabels[payment.cycle]}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => handleEdit(payment)}>
                    수정
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(payment.id)}>
                    삭제
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {payment.name}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                {payment.category_name} · {payment.account_name || '-'}
              </div>
              <div style={{ 
                fontSize: 24, 
                fontWeight: 700, 
                color: '#EF4444',
                marginBottom: 8,
                fontFeatureSettings: '"tnum"'
              }}>
                {formatCurrency(payment.amount, currency)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                시작일: {formatDate(payment.next_billing_date)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state" style={{ background: 'var(--glass-bg)', borderRadius: 20, padding: 60 }}>
          <div className="empty-state-icon">🔄</div>
          <div className="empty-state-title">정기 결제가 없습니다</div>
          <div className="empty-state-text">구독 서비스나 정기 결제를 추가해보세요</div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => { setEditingPayment(null); setShowForm(true); }}>
            <Icons.Plus /> 새 정기결제 추가
          </button>
        </div>
      )}

      {showForm && (
        <RecurringFormModal
          categories={categories}
          accounts={accounts}
          editingPayment={editingPayment}
          onClose={() => { setShowForm(false); setEditingPayment(null); }}
          onSave={() => {
            setShowForm(false);
            setEditingPayment(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

// ========== Recurring Form Modal ==========
const RecurringFormModal: React.FC<{
  categories: Category[];
  accounts: Account[];
  editingPayment?: RecurringPayment | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ categories, accounts, editingPayment, onClose, onSave }) => {
  const [name, setName] = useState(editingPayment?.name || '');
  const [amount, setAmount] = useState(editingPayment ? String(editingPayment.amount) : '');
  const [categoryId, setCategoryId] = useState(editingPayment?.category_id || categories.find(c => c.type === 'expense')?.id || '');
  const [accountId, setAccountId] = useState(editingPayment?.account_id || accounts[0]?.id || '');
  const [cycle, setCycle] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>(editingPayment?.cycle || 'monthly');
  const [nextBillingDate, setNextBillingDate] = useState(editingPayment?.next_billing_date || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    const amountValue = Number(amount.replace(/,/g, ''));
    if (!amountValue || amountValue <= 0) {
      alert('금액을 입력해주세요.');
      return;
    }
    if (!nextBillingDate) {
      alert('시작 결제일을 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      if (editingPayment) {
        await recurringPaymentsApi.update(editingPayment.id, {
          name: name.trim(),
          amount: amountValue,
          category_id: categoryId,
          account_id: accountId,
          cycle,
          next_billing_date: nextBillingDate,
          is_active: true,
        });
      } else {
        await recurringPaymentsApi.create({
          name: name.trim(),
          amount: amountValue,
          category_id: categoryId,
          account_id: accountId,
          cycle,
          next_billing_date: nextBillingDate,
          is_active: true,
        });
      }
      onSave();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="panel-title">{editingPayment ? '정기 결제 수정' : '새 정기 결제'}</div>
            <div className="panel-sub">결제 정보를 입력해주세요</div>
            </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
          </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">이름</label>
            <input
              className="form-input"
              placeholder="예: 넷플릭스, 헬스장"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
        </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">금액</label>
              <input
                className="form-input"
                placeholder="예: 17,000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
      </div>
            <div className="form-group">
              <label className="form-label">결제 주기</label>
              <select
                className="form-select"
                value={cycle}
                onChange={(e) => setCycle(e.target.value as typeof cycle)}
              >
                <option value="monthly">매월</option>
                <option value="weekly">매주</option>
                <option value="yearly">매년</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">카테고리</label>
              <select
                className="form-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.filter(c => c.type === 'expense').map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">결제 계좌</label>
              <select
                className="form-select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">시작 결제일</label>
            <input
              type="date"
              className="form-input"
              value={nextBillingDate}
              onChange={(e) => setNextBillingDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========== Profile View ==========
const ProfileView: React.FC = () => {
  return (
    <div className="panel" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="panel-main">
        <div className="panel-header">
          <div>
            <div className="panel-title">프로필</div>
            <div className="panel-sub">계정 정보를 관리합니다</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 32 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 24,
            background: 'linear-gradient(135deg, #007AFF, #5AC8FA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, color: 'white',
          }}>
            👤
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>사용자</h2>
            <p style={{ color: 'var(--text-tertiary)' }}>demo@example.com</p>
          </div>
        </div>

        <form className="form">
          <div className="form-group">
            <label className="form-label">이름</label>
            <input className="form-input" defaultValue="사용자" />
          </div>
          <div className="form-group">
            <label className="form-label">이메일</label>
            <input className="form-input" defaultValue="demo@example.com" disabled />
          </div>
          <button type="button" className="btn btn-primary">프로필 저장</button>
        </form>
      </div>

      <div className="panel-side">
        <div className="panel-header">
          <div>
            <div className="panel-title">보안</div>
            <div className="panel-sub">계정 보안 설정</div>
          </div>
        </div>

        <div className="settings-list">
          <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }}>
            비밀번호 변경
          </button>
          <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }}>
            2단계 인증 설정
          </button>
          <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'flex-start' }}>
            계정 삭제
          </button>
        </div>
      </div>
    </div>
);
};

export default App;
