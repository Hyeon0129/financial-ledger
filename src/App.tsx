// src/App.tsx - Premium Personal Finance App with Apple Liquid Glass UI
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Area, Line
} from 'recharts';
import type {
  Transaction, Category, Account, Budget, SavingsGoal, RecurringPayment, Loan,
  MonthlyStats
} from './api';
import {
  transactionsApi, categoriesApi, accountsApi, budgetsApi,
  savingsGoalsApi, recurringPaymentsApi, statsApi, userApi, loansApi,
  formatCurrency, getMonthKey, formatDate
} from './api';
import './styles.css';




// ========== Types ==========
type View = 'dashboard' | 'transactions' | 'budgets' | 'categories' | 'accounts' | 'reports' | 'savings' | 'recurring' | 'profile';

// ========== View Meta (Localized Titles) ==========
const viewMeta: Record<View, { title: string; subtitle?: string }> = {
  dashboard: { title: '대시보드', subtitle: '자산과 지출을 한눈에 확인하세요' },
  transactions: { title: '거래 내역', subtitle: '월별 거래를 캘린더로 확인합니다' },
  budgets: { title: '예산 관리', subtitle: '카테고리별 예산을 설정하고 추적합니다' },
  categories: { title: '카테고리', subtitle: '수입/지출 카테고리를 관리합니다' },
  accounts: { title: '계좌 관리', subtitle: '저축통장, 신용카드, 체크카드 등을 관리합니다' },
  reports: { title: '리포트', subtitle: '월간/연간 리포트를 확인하세요' },
  savings: { title: '저축 목표', subtitle: '목표 달성 상황을 추적합니다' },
  recurring: { title: '정기 결제', subtitle: '구독·정기 결제를 관리합니다' },
  profile: { title: '프로필', subtitle: '계정 정보를 관리합니다' },
};

// ========== Design Tokens (Charts & Icons) ==========
// (unused palette removed)





const Icons = {
  Plus: () => <span style={{ fontSize: 16, fontWeight: 600 }}>+</span>,
  Close: () => <span style={{ fontSize: 18, fontWeight: 300 }}>×</span>,
};

const getCardTheme = (_account: Account, index: number): string => {
  // 카드 순서에 따라 테마를 순환 적용 (1번째는 업로드한 그린 디자인)
  const themes = [
    'card-theme-emerald',  // 업로드된 그린 톤
    'card-theme-carbon',   // 다크 + 다크그레이
    'card-theme-gold',     // 골드 그라디언트
    'card-theme-slate',    // 블루 그레이 다크
    'card-theme-midnight', // 딥 블루/그린 다크
    'card-theme-obsidian', // 완전 다크
  ];
  return themes[index % themes.length];
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
  const [loans, setLoans] = useState<Loan[]>([]);
  const monthlyAccountSpend = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(month))
      .forEach((t) => {
        if (!t.account_id) return;
        map[t.account_id] = (map[t.account_id] || 0) + t.amount;
      });
    return map;
  }, [transactions, month]);

  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [prevStats, setPrevStats] = useState<MonthlyStats | null>(null);
  const [yearlyStats, setYearlyStats] = useState<{ year: number; monthlyTrend: Array<{ month: string; type: string; total: number }> } | null>(null);
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

  const normalizeTransactions = useCallback((txs: Transaction[]) => {
    const uniqMap: Record<string, Transaction> = {};
    txs.forEach((t) => {
      if (!uniqMap[t.id]) uniqMap[t.id] = t;
      else uniqMap[t.id] = t; // overwrite with latest
    });
    return Object.values(uniqMap).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, []);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [user, cats, accs, goals, recurring, loanList] = await Promise.all([
          userApi.get(),
          categoriesApi.list(),
          accountsApi.list(),
          savingsGoalsApi.list(),
          recurringPaymentsApi.list(),
          loansApi.list(),
        ]);
        setCurrency(user.currency);
        setCategories(cats);
        setAccounts(accs);
        setSavingsGoals(goals);
        setRecurringPayments(recurring);
        setLoans(loanList);
      } catch (error) {
        console.error('Failed to load data:', error);
        alert('서버 연결에 실패했습니다. 서버가 실행 중인지 확인해주세요.\n\n터미널에서 다음 명령어를 실행하세요:\nnpm install\nnpm run dev');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const prevMonthKey = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return getMonthKey(prev);
  }, [month]);

  // Load month-specific data
  useEffect(() => {
    const loadMonthData = async () => {
      try {
        const year = Number(month.split('-')[0]);
        const [txs, bds, monthStats, prevMonthStats, yrStats] = await Promise.all([
          transactionsApi.list({ month }),
          budgetsApi.list(),
          statsApi.monthly(month),
          statsApi.monthly(prevMonthKey),
          statsApi.yearly(year),
        ]);
        setTransactions(normalizeTransactions(txs));
        setBudgets(bds);
        setStats(monthStats);
        setPrevStats(prevMonthStats);
        setYearlyStats(yrStats);
      } catch (error) {
        console.error('Failed to load month data:', error);
      }
    };
    loadMonthData();
  }, [month, normalizeTransactions, prevMonthKey]);

  // Refresh functions
  const refreshTransactions = useCallback(async () => {
    const txs = await transactionsApi.list({ month });
    setTransactions(normalizeTransactions(txs));
    const monthStats = await statsApi.monthly(month);
    const prevMonthStats = await statsApi.monthly(prevMonthKey);
    const yrStats = await statsApi.yearly(Number(month.split('-')[0]));
    setStats(monthStats);
    setPrevStats(prevMonthStats);
    setYearlyStats(yrStats);
  }, [month, normalizeTransactions, prevMonthKey]);

  const refreshBudgets = useCallback(async () => {
    const bds = await budgetsApi.list();
    setBudgets(bds);
    const monthStats = await statsApi.monthly(month);
    const prevMonthStats = await statsApi.monthly(prevMonthKey);
    const yrStats = await statsApi.yearly(Number(month.split('-')[0]));
    setStats(monthStats);
    setPrevStats(prevMonthStats);
    setYearlyStats(yrStats);
  }, [month, prevMonthKey]);

  const refreshCategories = useCallback(async () => {
    const cats = await categoriesApi.list();
    setCategories(cats);
  }, []);

  const refreshAccounts = useCallback(async () => {
    const accs = await accountsApi.list();
    setAccounts(accs);
  }, []);

  const refreshLoans = useCallback(async () => {
    const loanList = await loansApi.list();
    setLoans(loanList);
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
            대시보드
          </button>
          <button 
            className={view === 'transactions' ? 'active' : ''} 
            onClick={() => setView('transactions')}
          >
            거래 내역
          </button>
          <button 
            className={view === 'budgets' ? 'active' : ''} 
            onClick={() => setView('budgets')}
          >
            예산 관리
          </button>
          <button 
            className={view === 'reports' ? 'active' : ''} 
            onClick={() => setView('reports')}
          >
            리포트
          </button>
          <button 
            className={view === 'categories' ? 'active' : ''} 
            onClick={() => setView('categories')}
          >
            카테고리
          </button>
          <button 
            className={view === 'accounts' ? 'active' : ''} 
            onClick={() => setView('accounts')}
          >
            계좌 관리
          </button>
          <button 
            className={view === 'savings' ? 'active' : ''} 
            onClick={() => setView('savings')}
          >
            저축 목표
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
            <div className="page-heading" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h1 className="page-title">{viewMeta[view].title}</h1>
              {viewMeta[view].subtitle && (
                <div className="page-subtitle">{viewMeta[view].subtitle}</div>
              )}
            </div>
        </div>
          {view === 'dashboard' && (
            <DashboardView 
              stats={stats}
            prevStats={prevStats}
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
              currency={currency}
              monthlySpend={monthlyAccountSpend}
              categories={categories}
              loans={loans}
              onRefresh={refreshAccounts}
              onRefreshLoans={refreshLoans}
            />
          )}
          {view === 'reports' && (
            <ReportsView
              stats={stats}
              yearlyStats={yearlyStats}
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
  prevStats: MonthlyStats | null;
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
}> = ({ stats, prevStats, transactions, budgets, currency, month, theme, accounts, onNavigate, savingsGoals }) => {
  const isDark = theme === 'dark';
  const axisColor = isDark ? '#d4d4d8' : '#999999';
  const gridColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const tooltipBgDash = '#11151b';
  const tooltipBorderDash = '#242a32';
  const tooltipLabelDash = '#e2e7ef';
  const tooltipTextDash = '#d6dce6';
  const totalIncome = stats?.income ?? 0;
  const totalExpense = stats?.expense ?? 0;
  const netRevenue = stats ? stats.balance : 0;
  const totalBudget = budgets.reduce((sum: number, b: Budget) => sum + b.amount, 0);
  const metricChanges = useMemo(() => {
    const build = (current: number, previous: number | undefined) => {
      if (previous == null) return null;
      const diff = current - previous;
      const pct = previous !== 0 ? (diff / previous) * 100 : null;
      return { diff, pct };
    };
    return {
      income: build(stats?.income ?? 0, prevStats?.income),
      expense: build(stats?.expense ?? 0, prevStats?.expense),
      balance: build(stats?.balance ?? 0, prevStats?.balance),
      txCount: build(stats?.transactionCount ?? 0, prevStats?.transactionCount),
    };
  }, [stats, prevStats]);

  const changeClass = (change: { diff: number } | null, invert = false) => {
    if (!change) return '';
    const positive = change.diff >= 0;
    const isPositive = invert ? !positive : positive;
    return isPositive ? 'positive' : 'negative';
  };

  const changeDisplay = (
    change: { diff: number; pct: number | null } | null,
    type: 'money' | 'count' = 'money'
  ) => {
    if (!change) return { pctText: '전월 데이터 없음', amountText: '', diff: null, pct: null };
    const sign = change.diff >= 0 ? '+' : '-';
    const pctText =
      change.pct === null ? 'New' : `${sign}${Math.abs(change.pct).toFixed(0)}%`;
    const amountText =
      type === 'count'
        ? `${sign}${Math.abs(change.diff)}건`
        : `${sign}${formatCurrency(Math.abs(change.diff), currency)}`;
    return { pctText, amountText, diff: change.diff, pct: change.pct };
  };

  const incomeChange = changeDisplay(metricChanges.income, 'money');
  const expenseChange = changeDisplay(metricChanges.expense, 'money');
  const balanceChange = changeDisplay(metricChanges.balance, 'money');
  const txChange = changeDisplay(metricChanges.txCount, 'count');

  const prevMonthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return prev.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  }, [month]);
  const currentMonthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const cur = new Date(y, m - 1, 1);
    return cur.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  }, [month]);
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
        type: c.type,
        category_id: c.category_id,
        color: c.category_color,
      }));
  }, [stats]);

  // Fallback spent by category (current month)
  const expenseSpentMap = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const key = t.category_id || 'unknown';
        map[key] = (map[key] || 0) + t.amount;
      });
    return map;
  }, [transactions]);

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


  const [cardPage, setCardPage] = useState(0);
  const [selectedMetric, setSelectedMetric] = useState<{
    title: string;
    current: number;
    previous: number;
    change: { pctText: string; amountText: string; diff: number | null; pct: number | null };
    type: 'money' | 'count';
  } | null>(null);
  const cardsPerPage = 3;
  const totalCardPages = Math.max(1, Math.ceil(accounts.length / cardsPerPage));
  const clampedCardPage = Math.min(cardPage, totalCardPages - 1);

  const pagedAccounts = useMemo(
    () => accounts.slice(clampedCardPage * cardsPerPage, clampedCardPage * cardsPerPage + cardsPerPage),
    [accounts, clampedCardPage]
  );

  const handleCardPrev = () => setCardPage((p) => Math.max(0, p - 1));
  const handleCardNext = () => setCardPage((p) => Math.min(totalCardPages - 1, p + 1));

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
        <div className="card balance-card premium-balance">
          <div className="balance-hero compact">
            <div className="balance-hero-label">이번 달 남은 돈</div>
            <div className="balance-hero-amount main">{formatCurrency(stats.balance, currency)}</div>
          </div>

          <div className="balance-breakdown sleek glassy">
            <div className="balance-row">
              <div className="balance-row-label">이번 달 수입</div>
              <div className="balance-row-value positive">{formatCurrency(totalIncome, currency)}</div>
            </div>
            <div className="balance-row">
              <div className="balance-row-label">이번 달 쓴 돈</div>
              <div className="balance-row-value negative">{formatCurrency(totalExpense, currency)}</div>
            </div>
            <div className="balance-row highlight">
              <div className="balance-row-label">현재 잔액</div>
              <div className="balance-row-value">{formatCurrency(stats.balance, currency)}</div>
            </div>
          </div>
          <div className="balance-actions">
            <button className="balance-btn" onClick={() => onNavigate('transactions')}>입출금</button>
            <button className="balance-btn" onClick={() => onNavigate('accounts')}>계좌 관리</button>
            <button className="balance-btn" onClick={() => onNavigate('budgets')}>예산 보기</button>
          </div>
        </div>

        <div className="card earnings-chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>소비 리포트</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>1 Month</span>
            </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={6} margin={{ left: -10, right: 10 }} barCategoryGap={14}>
                <defs>
                  <linearGradient id="barGreen3D" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3ce596" />
                    <stop offset="45%" stopColor="#22c874" />
                    <stop offset="100%" stopColor="#0d5d3c" />
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
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    background: tooltipBgDash,
                    border: `1px solid ${tooltipBorderDash}`,
                    borderRadius: 12,
                    color: tooltipTextDash,
                    boxShadow: '0 14px 36px rgba(0,0,0,0.75)',
                    padding: '12px 14px',
                    minWidth: 180,
                  }}
                  labelStyle={{ color: tooltipLabelDash, fontWeight: 700 }}
                  formatter={(value: number) => formatCurrency(value, currency)}
                />
                <Bar dataKey="지출" radius={[6, 6, 0, 0]} activeBar={false} fill="url(#barGreen3D)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          </div>
        </div>

      {/* Second Row: Metrics + Currencies + Transactions */}
      <div className="dashboard-row-2">
        <div className="metrics-grid">
        <div
          className="card metric-card-small"
          style={{ cursor: prevStats ? 'pointer' : 'default' }}
          onClick={() => {
            if (!prevStats) return;
            setSelectedMetric({
              title: 'Total Earnings',
              current: stats.income,
              previous: prevStats.income,
              change: incomeChange,
              type: 'money',
            });
          }}
        >
            <div className="metric-title">총 수입</div>
            <div className="metric-value">{formatCurrency(totalIncome, currency)}</div>
            <div className={`metric-change metric-change-row ${changeClass(metricChanges.income)}`}>
              <span className="metric-change-main">{incomeChange.pctText}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12, marginLeft: 6 }}>저번달 대비</span>
            </div>
          </div>
        <div
          className="card metric-card-small metric-spending"
          style={{ cursor: prevStats ? 'pointer' : 'default' }}
          onClick={() => {
            if (!prevStats) return;
            setSelectedMetric({
              title: 'Total Spending',
              current: stats.expense,
              previous: prevStats.expense,
              change: expenseChange, 
              type: 'money',
            });
          }}
        >
            <div className="metric-title">총 지출</div>
            <div className="metric-value">{formatCurrency(totalExpense, currency)}</div>
            <div className={`metric-change metric-change-row ${changeClass(metricChanges.expense, true)}`}>
              <span className="metric-change-main">{expenseChange.pctText}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12, marginLeft: 6 }}>저번달 대비</span>
            </div>
          </div>
        <div
          className="card metric-card-small"
          style={{ cursor: prevStats ? 'pointer' : 'default' }}
          onClick={() => {
            if (!prevStats) return;
            setSelectedMetric({
              title: 'Net Balance',
              current: stats.balance,
              previous: prevStats.balance,
              change: balanceChange,
              type: 'money',
            });
          }}
        >
            <div className="metric-title">순잔액</div>
            <div className="metric-value">{formatCurrency(netRevenue, currency)}</div>
            <div className={`metric-change metric-change-row ${changeClass(metricChanges.balance)}`}>
              <span className="metric-change-main">{balanceChange.pctText}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12, marginLeft: 6 }}>저번달 대비</span>
            </div>
          </div>
        <div
          className="card metric-card-small"
          style={{ cursor: prevStats ? 'pointer' : 'default' }}
          onClick={() => {
            if (!prevStats) return;
            setSelectedMetric({
              title: 'Transactions',
              current: stats.transactionCount,
              previous: prevStats.transactionCount,
              change: txChange,
              type: 'count',
            });
          }}
        >
            <div className="metric-title">거래 건수</div>
            <div className="metric-value">{stats.transactionCount.toLocaleString()} 건</div>
            <div className={`metric-change metric-change-row ${changeClass(metricChanges.txCount)}`}>
              <span className="metric-change-main">{txChange.pctText}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12, marginLeft: 6 }}>저번달 대비</span>
            </div>
          </div>
          <div className="card monthly-limit-card">
            <div className="wallet-header">
              <div className="metric-title">월 지출 한도</div>
              <div className="wallet-amount">{formatCurrency(totalBudget, currency)}</div>
            </div>
            <div className="wallet-bar">
              <div
                className="wallet-bar-fill"
                style={{
                  width: totalBudget > 0 ? `${Math.min(100, (stats.expense / totalBudget) * 100)}%` : '0%',
                }}
              />
            </div>
            <div className="wallet-sub">
              <span>사용액 {formatCurrency(stats.expense, currency)}</span>
              <span>남은 한도 {formatCurrency(Math.max(0, totalBudget - stats.expense), currency)}</span>
            </div>
          </div>
        </div>

        <div className="currencies-card">
          <div className="transactions-header">
            <div>
              <div className="transactions-title">Highlighted currencies</div>
              <div className="transactions-sub">상위 5 카테고리</div>
            </div>
          </div>
          <div className="transactions-table-lite">
            <div className="tx-row tx-head">
              <div className="tx-main tx-col-label">CATEGORY</div>
              <div className="tx-amount-head tx-col-amount">Amount</div>
              <div className="tx-progress-head tx-col-progress">Progress</div>
            </div>
            {expenseByCategory.slice(0, 6).map((item, idx) => {
              const title = item.name;
              const budgetEntry = stats?.budgetUsage.find((b) => b.category_id === item.category_id);
              const fallbackBudget = budgets.find((b) => b.category_id === item.category_id)?.amount ?? 0;
              const budget = budgetEntry?.budget_amount ?? fallbackBudget;
              const spent = budgetEntry?.spent ?? expenseSpentMap[item.category_id] ?? item.value;
              const remaining = Math.max(0, budget - spent);
              const percent = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
              return (
                <div key={idx} className="tx-row">
                  <div className="tx-main tx-col-label">
                    <span className="tx-dot" style={{ background: item.color || '#60a5fa' }} />
                    <div className="tx-main-text">
                      <div className="tx-name">{title}</div>
                    </div>
                  </div>
                  <div className="tx-amount negative tx-col-amount">
                    -{formatCurrency(item.value, currency)}
                  </div>
                  <div className="tx-progress tx-col-progress">
                    <div className="tx-progress-bar">
                      <div className="tx-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                    {budget > 0 && (
                      <div className="tx-progress-text">
                        {percent.toFixed(0)}% of {formatCurrency(budget, currency)} / {formatCurrency(remaining, currency)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="transactions-card">
          <div className="transactions-header">
            <div>
              <div className="transactions-title">Transaction history</div>
              <div className="transactions-sub">최근 6건</div>
            </div>
            <button className="transactions-menu" type="button" aria-label="More options">⋯</button>
          </div>
          <div className="transactions-table-lite">
            <div className="tx-row tx-head">
              <div className="tx-main tx-col-label">Category</div>
              <div className="tx-date-head">Date</div>
              <div className="tx-amount-head tx-col-amount">Amount</div>
              <div className="tx-cat-head tx-col-memo">Memo</div>
            </div>
            {transactions.slice(0, 6).map((tx) => {
              const title = tx.category_name || 'Category';
              const memoText = tx.memo && tx.memo.trim().length > 0 ? tx.memo : '-';
              const dotColor = tx.category_color || '#60a5fa';
              return (
                <div key={tx.id} className="tx-row">
                  <div className="tx-main tx-col-label">
                    <span className="tx-dot" style={{ background: dotColor }} />
                    <div className="tx-main-text">
                      <div className="tx-name">{title}</div>
                    </div>
                  </div>
                  <div className="tx-date">{formatDate(tx.date)}</div>
                  <div className={`tx-amount ${tx.type === 'income' ? 'positive' : 'negative'} tx-col-amount`}>
                    {tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount, currency)}
                  </div>
                  <div className="tx-category tx-col-memo">
                    <span>{memoText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Third Row: Cards + Goals */}
      <div className="dashboard-row-3">
        <div className="card cards-board">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">Your cards</div>
              
            </div>
            <button className="btn btn-sm" onClick={() => onNavigate('accounts')}>Manage</button>
          </div>
          <div className="cards-stage">
            <button className="cards-nav-btn edge left" onClick={handleCardPrev} disabled={clampedCardPage === 0}>‹</button>
            <div className="cards-list">


            {/* 카드 리스트 */}
{pagedAccounts.length > 0 ? (
  pagedAccounts.map((acc, index) => {
    const usage = accountUsage[acc.id] || { spent: 0, income: 0 };
    const globalIndex = clampedCardPage * cardsPerPage + index;
    return (
      <div
        key={acc.id}
        className={`bank-card real ${getCardTheme(acc, globalIndex)}`}
      >
        {/* 좌측 상단: 카드 이름만 표시 (칩 제거) */}
        <div className="finance-card-title">{acc.name}</div>

        {/* 하단: 금액 / 이번 달 사용 */}
        <div className="finance-card-balance-wrap">
          <div className="finance-card-balance">
            {formatCurrency(acc.balance, currency)}
          </div>
          <div className="finance-card-sub">
            이번 달 사용 {formatCurrency(usage.spent, currency)}
          </div>
        </div>

        {/* 우측 하단 VISA 로고 */}
        <div className="finance-card-logo" />
      </div>
    );
  })
) : (
  <div className="empty-state" style={{ padding: 24, alignItems: 'flex-start' }}>
    <div className="empty-state-text">등록된 카드가 없습니다.</div>
    <button
      className="btn btn-primary"
      style={{ marginTop: 8 }}
      onClick={() => onNavigate('accounts')}
    >
      카드 등록하기
    </button>
  </div>
)}


          </div>
            <button className="cards-nav-btn edge right" onClick={handleCardNext} disabled={clampedCardPage >= totalCardPages - 1}>›</button>
          </div>
        </div>

        <div className="goals-board">
          
          <div className="transactions-table-lite goals-table-lite">
            <div className="tx-row tx-head">
              <div className="tx-main tx-col-label">Goal</div>
              <div className="tx-date-head tx-col-progress">Progress</div>
              <div className="tx-amount-head tx-col-amount">
                <span>Current / Target</span>
              </div>
            </div>
            {savingsGoals.length > 0 ? (
              savingsGoals.slice(0, 6).map((goal) => {
                const progress = goal.target_amount > 0 ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0;
                return (
                  <div key={goal.id} className="tx-row">
                    <div className="tx-main">
                      <div className="tx-main-text">
                        <div className="tx-name">{goal.name}</div>
                      </div>
                    </div>
                    <div className="tx-date">
  <div className="goal-progress-cell">
    <div className="goal-progress-bar">
      <div
        className="goal-progress-fill"
        style={{ width: `${progress}%` }}
      />
    </div>
    <span className="goal-progress-text">
      {progress.toFixed(0)}%
    </span>
  </div>
</div>
                    <div className="tx-amount goal-amount">
                      <span className="goal-current">{formatCurrency(goal.current_amount, currency)}</span>
                      <span className="goal-sep"> / </span>
                      <span className="goal-target">{formatCurrency(goal.target_amount, currency)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="tx-row" style={{ justifyContent: 'center' }}>
                <div className="tx-main" style={{ justifyContent: 'center' }}>
                </div>
                <div className="tx-date" />
                <div className="tx-amount" />
              </div>
            )}
          </div>
        </div>
          </div>

      {/* Metric detail modal */}
      {selectedMetric && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedMetric(null)}>
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="panel-title">{selectedMetric.title}</div>
                <div className="panel-sub">{prevMonthLabel} → {currentMonthLabel}</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedMetric(null)}>
                <Icons.Close />
              </button>
            </div>

            <div className="transactions-table-lite manage-table" style={{ padding: 12, marginBottom: 12 }}>
              <div className="tx-row manage-head" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="tx-col-label" style={{ justifyContent: 'flex-start' }}>구분</div>
                <div className="tx-col-amount" style={{ justifyContent: 'flex-end' }}>값</div>
              </div>
              <div className="tx-row manage-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="tx-col-label" style={{ justifyContent: 'flex-start' }}>{prevMonthLabel}</div>
                <div className="tx-amount tx-col-amount" style={{ justifyContent: 'flex-end' }}>
                  {selectedMetric.type === 'count'
                    ? `${selectedMetric.previous.toLocaleString()} 건`
                    : formatCurrency(selectedMetric.previous, currency)}
                </div>
              </div>
              <div className="tx-row manage-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="tx-col-label" style={{ justifyContent: 'flex-start' }}>{currentMonthLabel}</div>
                <div className="tx-amount tx-col-amount" style={{ justifyContent: 'flex-end' }}>
                  {selectedMetric.type === 'count'
                    ? `${selectedMetric.current.toLocaleString()} 건`
                    : formatCurrency(selectedMetric.current, currency)}
                </div>
              </div>
              <div className="tx-row manage-row" style={{ gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="tx-col-label" style={{ justifyContent: 'flex-start', fontWeight: 700 }}>증감</div><br/>
                <div className={`tx-amount tx-col-amount ${changeClass({ diff: selectedMetric.change.diff ?? 0 })}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start', flexDirection: 'column', gap: 6, fontWeight: 700, textAlign: 'left' }}>
                  <span>{selectedMetric.change.pctText}</span><br/>
                  <span>{(selectedMetric.change.amountText || formatCurrency(selectedMetric.change.diff ?? 0, currency)).replace(/^\+/, '')}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => setSelectedMetric(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
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
          
          <div className="panel-sub">{transactions.length}건</div>
            </div>
        <button className="btn btn-primary" onClick={() => { setEditingTransaction(null); setShowForm(true); }}>
          <Icons.Plus /> 새 거래
        </button>
        </div>

      <div className="panel" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="panel-main">
          <div className="calendar">
            <div className="calendar-header">일</div>
            <div className="calendar-header">월</div>
            <div className="calendar-header">화</div>
            <div className="calendar-header">수</div>
            <div className="calendar-header">목</div>
            <div className="calendar-header">금</div>
            <div className="calendar-header">토</div>
            
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
            <div className="transactions-table-lite manage-table">
              <div className="tx-row manage-head">
                <div className="tx-col-type">유형</div>
                <div className="tx-col-label">카테고리</div>
                <div className="tx-col-amount">금액</div>
                <div className="tx-col-actions">작업</div>
              </div>
              {selectedDayTransactions.map((t) => (
                <div key={t.id} className="tx-row manage-row">
                  <div className="tx-col-type">
                    <span className={`badge ${t.type}`}>
                      {t.type === 'income' ? '수입' : '지출'}
                    </span>
                  </div>
                  <div className="tx-main tx-col-label">
                    <div className="tx-main-text">
                      <div className="tx-name">{t.category_name}</div>
                      {t.memo && (
                        <div className="tx-memo">{t.memo}</div>
                      )}
                    </div>
                  </div>
                  <div className={`tx-amount tx-col-amount ${t.type === 'income' ? 'positive' : 'negative'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount, currency)}
                  </div>
                  <div className="tx-col-actions">
                    <button className="btn btn-sm" onClick={() => handleEdit(t)}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          ) : selectedDate ? (
            <div className="empty-state">
              <div className="empty-state-text">거래가 없습니다</div>
      </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-text">날짜를 선택하면 거래를 볼 수 있습니다</div>
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
        const updated = await transactionsApi.update(editingTransaction.id, {
      date,
      type,
          account_id: accountId,
          category_id: categoryId,
      amount: value,
          memo: memo.trim() || null,
    });
        // 일부 백엔드에서 update 시 새로운 id로 추가되는 경우가 있어 기존 건 제거
        if (updated?.id && updated.id !== editingTransaction.id) {
          try {
            await transactionsApi.delete(editingTransaction.id);
          } catch {
            /* 삭제 실패 시 무시하고 최신 데이터로 이어감 */
          }
        }
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
                <option value="expense">지출</option>
                <option value="income">수입</option>
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

  const expenseSpentMap = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const key = t.category_id || 'unknown';
        map[key] = (map[key] || 0) + t.amount;
      });
    return map;
  }, [transactions]);

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
              <div className="panel-sub">{month}  예산</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>예산 추가</button>
          </div>

          <div className="transactions-table-lite budgets-table">
            <div className="tx-row manage-head">
              <div className="tx-col-label">카테고리</div>
              <div className="tx-col-amount">예산</div>
              <div className="tx-col-amount">사용액</div>
              <div className="tx-col-amount">잔액</div>
              <div className="tx-col-actions">작업</div>
            </div>
            {budgets.map((budget) => {
              const spent = stats?.budgetUsage.find(b => b.category_id === budget.category_id)?.spent ?? expenseSpentMap[budget.category_id] ?? 0;
              const remaining = Math.max(0, budget.amount - spent);
              return (
                <div key={budget.id} className="tx-row manage-row">
                  <div className="tx-main tx-col-label">
                    <span className="tx-dot" style={{ background: budget.category_color || '#60a5fa' }} />
                    <div className="tx-main-text">
                      <div className="tx-name">{budget.category_name}</div>
                    </div>
                  </div>
                  <div className="tx-amount tx-col-amount">{formatCurrency(budget.amount, currency)}</div>
                  <div className="tx-amount tx-col-amount negative">{formatCurrency(spent, currency)}</div>
                  <div className="tx-amount tx-col-amount positive">{formatCurrency(remaining, currency)}</div>
                  <div className="tx-col-actions">
                    <button className="btn btn-sm" onClick={() => openEdit(budget)}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteBudget(budget.id)}>삭제</button>
                  </div>
                </div>
              );
            })}
            {budgets.length === 0 && (
              <div className="tx-row" style={{ justifyContent: 'center' }}>
                <div className="tx-main" style={{ justifyContent: 'center' }}>
                  <div className="tx-name" style={{ color: 'var(--text-tertiary)' }}>
                    예산이 없습니다. 
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="panel-side budget-half">
          <div className="panel-header">
            <div>
              <div className="panel-title">지출 내역</div>
            </div>
          </div>
          <div className="transactions-table-lite budgets-expense-table manage-table">
            <div className="tx-row manage-head">
              <div className="tx-col-date">날짜</div>
              <div className="tx-col-label">카테고리</div>
              <div className="tx-col-amount">금액</div>
              <div className="tx-col-account">계좌</div>
              <div className="tx-col-memo">메모</div>
            </div>
            {expenseTransactions.map((t) => (
              <div key={t.id} className="tx-row manage-row">
                <div className="tx-col-date">{formatDate(t.date)}</div>
                <div className="tx-main tx-col-label">
                  <div className="tx-main-text">
                    <div className="tx-name">{t.category_name}</div>
                  </div>
                </div>
                <div className="tx-amount tx-col-amount negative">{formatCurrency(t.amount, currency)}</div>
                <div className="tx-col-account">{t.account_name || '-'}</div>
                <div className="tx-col-memo">{t.memo || '-'}</div>
              </div>
            ))}
            {expenseTransactions.length === 0 && (
              <div className="tx-row" style={{ justifyContent: 'center' }}>
                <div className="tx-main" style={{ justifyContent: 'center' }}>
                  <div className="tx-name" style={{ color: 'var(--text-tertiary)' }}>
                    지출 내역이 없습니다.
                  </div>
                </div>
              </div>
            )}
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
                  {categories
                    .filter((p) => p.type === 'expense' && !p.parent_id)
                    .map((parent) => {
                      const children = categories.filter((c) => c.parent_id === parent.id);
                      const leafChildren = children.filter((c) => !categories.some((cc) => cc.parent_id === c.id));
                      if (leafChildren.length === 0) return null;
                      return (
                        <optgroup key={parent.id} label={parent.name}>
                          {leafChildren.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
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

      <div className="panel-main categories-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">지출 카테고리</div>
          </div>
        </div>
        <div className="transactions-table-lite categories-table">
          <div className="tx-row categories-head">
            <div className="tx-col-label">대분류</div>
            <div className="tx-col-child">소분류</div>
            <div className="tx-col-type">구분</div>
            <div className="tx-col-actions">작업</div>
          </div>

          {expenseTree.grouped.map(({ parent, children }) => (
            <React.Fragment key={parent.id}>
              <div className="tx-row category-parent-row">
                <div className="tx-main tx-col-label">
                  <span className="tx-dot" style={{ background: parent.color }} />
                  <div className="tx-main-text">
                    <div className="tx-name">{parent.name}</div>
                  </div>
                </div>
                <div className="tx-col-child muted">-</div>
                <div className="tx-col-type">대분류</div>
                <div className="tx-col-actions">
                  <button className="btn btn-sm" onClick={() => handleEdit(parent)}>수정</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(parent.id)}>삭제</button>
                </div>
              </div>

              {children.map((child) => (
                <div key={child.id} className="tx-row category-child-row">
                  <div className="tx-main tx-col-label">
                    <span className="tx-dot" style={{ background: child.color }} />
                    <div className="tx-main-text">
                      <div className="tx-name">{child.name}</div>
                    </div>
                  </div>
                  <div className="tx-col-child">{parent.name}</div>
                  <div className="tx-col-type">소분류</div>
                  <div className="tx-col-actions">
                    <button className="btn btn-sm" onClick={() => handleEdit(child)}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(child.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </React.Fragment>
          ))}

          {expenseTree.orphans.map((child) => (
            <div key={child.id} className="tx-row category-child-row">
              <div className="tx-main tx-col-label">
                <span className="tx-dot" style={{ background: child.color }} />
                <div className="tx-main-text">
                  <div className="tx-name">{child.name}</div>
                </div>
              </div>
              <div className="tx-col-child">미분류</div>
              <div className="tx-col-type">소분류</div>
              <div className="tx-col-actions">
                <button className="btn btn-sm" onClick={() => handleEdit(child)}>수정</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(child.id)}>삭제</button>
              </div>
            </div>
          ))}

          {expenseCategories.length === 0 && (
            <div className="tx-row" style={{ justifyContent: 'center' }}>
              <div className="tx-main" style={{ justifyContent: 'center' }}>
                <div className="tx-name" style={{ color: 'var(--text-tertiary)' }}>
                  지출 카테고리가 없습니다. 상단 버튼으로 추가하세요.
                </div>
              </div>
            </div>
          )}
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
  const [type, setType] = useState<'income' | 'expense'>(
    editingCategory?.type || 'expense'
  );
  const [parentId, setParentId] = useState<string>(editingCategory?.parent_id || '');
  const [color, setColor] = useState(editingCategory?.color || '#007AFF');
  const [saving, setSaving] = useState(false);

  const colors = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
    '#F97316',
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
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <div className="panel-title">
              {editingCategory ? '카테고리 수정' : '새 카테고리'}
            </div>
            <div className="panel-sub">
              {editingCategory
                ? '카테고리 정보를 수정합니다'
                : '수입/지출 카테고리를 추가합니다'}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          {/* 이름 */}
          <div className="form-group">
            <label className="form-label">카테고리 이름</label>
            <input
              className="form-input"
              placeholder="예: 식비, 월급, 교통비"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* 타입 + 상위 카테고리 */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">구분</label>
              <select
                className="form-select"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'income' | 'expense')
                }
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
                disabled={type === 'income'}
              >
                <option value="">없음</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 색상 선택 */}
          <div className="form-group">
            <label className="form-label">색상</label>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border:
                      color === c
                        ? '2px solid #ffffff'
                        : '1px solid rgba(0,0,0,0.08)',
                    boxShadow:
                      color === c
                        ? '0 0 0 2px rgba(59,130,246,0.6)'
                        : 'none',
                    background: c,
                    cursor: 'pointer',
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: 40,
                  height: 28,
                  borderRadius: 8,
                  border: '1px solid var(--border-hover)',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            </div>
          </div>

          {/* 버튼 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 8,
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              취소
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving
                ? '저장 중...'
                : editingCategory
                ? '수정 완료'
                : '카테고리 추가'}
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
  currency: string;
  monthlySpend: Record<string, number>;
  categories: Category[];
  loans: Loan[];
  onRefresh: () => void;
  onRefreshLoans: () => void;
}> = ({ accounts, currency, monthlySpend, categories, loans, onRefresh, onRefreshLoans }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);

  const cardThemes = [
    'card-theme-emerald',
    'card-theme-carbon',
    'card-theme-gold',
    'card-theme-slate',
    'card-theme-midnight',
    'card-theme-obsidian',
  ];

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 계좌를 삭제할까요?')) return;
    await accountsApi.delete(id);
    onRefresh();
  };

  const handleDeleteLoan = async (id: string) => {
    if (!window.confirm('이 대출을 삭제할까요?')) return;
    await loansApi.delete(id);
    await onRefreshLoans();
  };

  const handleSettleLoan = async (loan: Loan) => {
    const defaultDate = new Date().toISOString().slice(0, 10);
    const date = window.prompt('상환일을 입력하세요 (YYYY-MM-DD)', defaultDate);
    if (!date) return;
    try {
      await loansApi.settle(loan.id, date);
      await onRefreshLoans();
    } catch {
      alert('상환 처리에 실패했습니다.');
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingAccount(null); setShowForm(true); }}>
          <Icons.Plus /> 새 계좌
        </button>
      </div>

      <div className="account-grid">
        {accounts.map((account, idx) => {
          const theme = cardThemes[idx % cardThemes.length];
          return (
            <div
              key={account.id}
              className={`account-card bank-card real ${theme}`}
              onClick={() => { setEditingAccount(account); setShowForm(true); }}
            >
              <div className="account-card-top">
                <div className="account-title">{account.name}</div>
              </div>
              <div className="account-card-bottom">
                <div className="account-balance-big">
                  {formatCurrency(account.balance, currency)}
                </div>
                <div className="account-balance-sub">
                  이번 달 사용: {formatCurrency(monthlySpend[account.id] ?? 0, currency)}
                </div>
              </div>
              <div className="account-card-actions">
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingAccount(account);
                    setShowForm(true);
                  }}
                >
                  수정
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(account.id);
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel-block loans-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">대출</div>
            <div className="panel-sub">상환 일정과 잔액을 관리합니다</div>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditingLoan(null); setShowLoanForm(true); }}>
            <Icons.Plus /> 새 대출
          </button>
        </div>

        <div className="transactions-table-lite manage-table">
          <div className="tx-row manage-head" style={{ gridTemplateColumns: '1.4fr 0.8fr 0.9fr 0.9fr 0.9fr 1fr 0.9fr 0.9fr 0.9fr 1fr' }}>
            <div className="tx-col-label">대출명</div>
            <div className="tx-col-amount">금리(연)</div>
            <div className="tx-col-amount">남은 원금</div>
            <div className="tx-col-amount">월 상환액</div>
            <div className="tx-col-amount">대출금액</div>
            <div className="tx-col-progress">진행률</div>
            <div className="tx-col-amount">남은 개월</div>
            <div className="tx-col-amount">상환 방식</div>
            <div className="tx-col-date">다음 납부일</div>
            <div className="tx-col-actions">작업</div>
          </div>

          {loans.map((loan) => {
            const monthsLeft = Math.max(0, loan.term_months - loan.paid_months);
            const paidAmount = Math.max(0, loan.principal - (loan.remaining_principal ?? 0));
            const progress = loan.principal > 0 ? Math.min(100, (paidAmount / loan.principal) * 100) : 0;
            return (
              <div
                key={loan.id}
                className="tx-row manage-row loan-row-with-tooltip"
                data-tooltip={`매달 납부일: 매월 ${loan.monthly_due_day}일`}
                style={{ gridTemplateColumns: '1.4fr 0.8fr 0.9fr 0.9fr 0.9fr 1fr 0.9fr 0.9fr 0.9fr 1fr' }}
              >
                <div className="tx-main tx-col-label">
                  <div className="tx-main-text">
                    <div className="tx-name">{loan.name}</div>
                    <div className="tx-memo" style={{ marginTop: 2 }}>
                      {loan.account_name || '계좌 없음'}{loan.category_name ? ` · ${loan.category_name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="tx-col-amount">{loan.interest_rate}%</div>
                <div className="tx-amount tx-col-amount">{formatCurrency(Math.round(loan.remaining_principal), currency)}</div>
                <div className="tx-amount tx-col-amount negative">{formatCurrency(loan.monthly_payment, currency)}</div>
                <div className="tx-col-amount">{formatCurrency(loan.principal, currency)}</div>
                <div className="tx-col-progress">
                  <div className="tx-progress-bar">
                    <div className="tx-progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="tx-progress-text">{progress.toFixed(0)}%</div>
                </div>
                <div className="tx-col-amount">{monthsLeft}개월</div>
                <div className="tx-col-amount">
                  {loan.repayment_type === 'interest_only'
                    ? '이자만'
                    : loan.repayment_type === 'principal_equal'
                      ? '원금균등'
                      : '원리금'}
                </div>
                <div className="tx-col-date">{loan.next_due_date ? formatDate(loan.next_due_date) : '완납'}</div>
                <div className="tx-col-actions">
                  <button className="btn btn-sm" onClick={() => { setEditingLoan(loan); setShowLoanForm(true); }}>수정</button>
                  <button className="btn btn-sm" onClick={() => handleSettleLoan(loan)}>상환</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteLoan(loan.id)}>삭제</button>
                </div>
              </div>
            );
          })}

          {loans.length === 0 && (
            <div className="tx-row" style={{ justifyContent: 'center' }}>
              <div className="tx-main" style={{ justifyContent: 'center' }}>
                <div className="tx-name" style={{ color: 'var(--text-tertiary)' }}>
                  등록된 대출이 없습니다. 상단 버튼으로 추가하세요.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <AccountFormModal
          account={editingAccount}
          onClose={() => { setShowForm(false); setEditingAccount(null); }}
          onSave={() => {
            setShowForm(false);
            setEditingAccount(null);
            onRefresh();
          }}
        />
      )}

      {showLoanForm && (
        <LoanFormModal
          categories={categories}
          accounts={accounts}
          loan={editingLoan}
          onClose={() => { setShowLoanForm(false); setEditingLoan(null); }}
          onSave={async () => {
            setShowLoanForm(false);
            setEditingLoan(null);
            await onRefreshLoans();
          }}
        />
      )}
    </>
  );
};

// ========== Account Form Modal ==========
const AccountFormModal: React.FC<{
  account?: Account | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ account, onClose, onSave }) => {
  const isEdit = !!account?.id;
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<'cash' | 'bank' | 'card' | 'investment'>(account?.type ?? 'bank');
  const [balance, setBalance] = useState(account ? String(account.balance) : '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('계좌 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const color = account?.color ?? '#3B82F6';
      const payload = {
        name: name.trim(),
        type,
        balance: Number(balance.replace(/,/g, '')) || 0,
        color,
        icon: account?.icon ?? null,
      };
      if (account?.id) {
        await accountsApi.update(account.id, payload);
      } else {
        await accountsApi.create(payload);
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
            <div className="panel-title">{isEdit ? '계좌 수정' : '새 계좌'}</div>
            <div className="panel-sub">{isEdit ? '계좌 정보를 수정합니다' : '계좌 정보를 입력해주세요'}</div>
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

// ========== Loan Form Modal ==========
const LoanFormModal: React.FC<{
  loan?: Loan | null;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSave: () => void;
}> = ({ loan, categories, accounts, onClose, onSave }) => {
  const isEdit = !!loan?.id;
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(loan?.name ?? '');
  const [principal, setPrincipal] = useState(loan ? String(loan.principal) : '');
  const [interestRate, setInterestRate] = useState(loan ? String(loan.interest_rate) : '');
  const [termMonths, setTermMonths] = useState(loan ? String(loan.term_months) : '');
  const [startDate, setStartDate] = useState(loan?.start_date ?? today);
  const [dueDay, setDueDay] = useState(loan?.monthly_due_day ?? 1);
  const [accountId, setAccountId] = useState(loan?.account_id ?? accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(loan?.category_id ?? (categories.find((c) => c.type === 'expense')?.id ?? ''));
  const [repayType, setRepayType] = useState<'amortized' | 'interest_only' | 'principal_equal'>(loan?.repayment_type ?? 'amortized');
  const [saving, setSaving] = useState(false);

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('대출 이름을 입력해주세요.');
      return;
    }
    const principalNum = Number(principal.replace(/,/g, ''));
    if (!principalNum || principalNum <= 0) {
      alert('대출 금액을 입력해주세요.');
      return;
    }
    const rateNum = Number(interestRate);
    if (Number.isNaN(rateNum) || rateNum < 0) {
      alert('금리를 입력해주세요.');
      return;
    }
    const termNum = Number(termMonths);
    if (!termNum || termNum <= 0) {
      alert('기간(개월)을 입력해주세요.');
      return;
    }
    if (!accountId) {
      alert('납부 계좌를 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && loan) {
        await loansApi.update(loan.id, {
          name: name.trim(),
          principal: principalNum,
          interest_rate: rateNum,
          term_months: termNum,
          start_date: startDate,
          monthly_due_day: dueDay,
          account_id: accountId,
          category_id: categoryId || null,
          repayment_type: repayType,
        });
      } else {
        await loansApi.create({
          name: name.trim(),
          principal: principalNum,
          interest_rate: rateNum,
          term_months: termNum,
          start_date: startDate,
          monthly_due_day: dueDay,
          account_id: accountId,
          category_id: categoryId || null,
          repayment_type: repayType,
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
            <div className="panel-title">{isEdit ? '대출 수정' : '새 대출'}</div>
            <div className="panel-sub">상환 일정과 금리를 입력하세요</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">대출 이름</label>
            <input
              className="form-input"
              placeholder="예: 주택담보대출"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">대출 금액</label>
              <input
                className="form-input"
                placeholder="예: 100,000,000"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">연 이자율 (%)</label>
              <input
                className="form-input"
                placeholder="예: 4.5"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">기간 (개월)</label>
              <input
                className="form-input"
                placeholder="예: 360"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">대출 시작일</label>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">상환 방식</label>
              <select
                className="form-select"
                value={repayType}
                onChange={(e) => setRepayType(e.target.value as 'amortized' | 'interest_only' | 'principal_equal')}
              >
                <option value="amortized">원리금 균등</option>
                <option value="interest_only">이자만 상환</option>
                <option value="principal_equal">원금 균등</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">매월 납부일</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={28}
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">납부 계좌</label>
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
            <label className="form-label">카테고리 (선택)</label>
            <select
              className="form-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">선택 안 함</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
type YearlyStats = { year: number; monthlyTrend: Array<{ month: string; type: string; total: number }> };

const ReportsView: React.FC<{
  stats: MonthlyStats | null;
  yearlyStats: YearlyStats | null;
  currency: string;
}> = ({ stats, yearlyStats, currency }) => {
  const expenseByCategory = stats?.byCategory
    .filter((c) => c.type === 'expense')
    .sort((a, b) => b.total - a.total) ?? [];

  const daysInMonth = useMemo(() => {
    if (!stats) return 30;
    const [y, m] = stats.month.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }, [stats]);

  const lineData = useMemo(() => {
    if (!stats) return [];
    const daysInMonth = new Date(
      Number(stats.month.split('-')[0]),
      Number(stats.month.split('-')[1]),
      0
    ).getDate();

    const data: Array<{ day: number; income: number; expense: number }> = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${stats.month}-${String(i).padStart(2, '0')}`;
      const inc = stats.dailyTrend
        .filter((d) => d.date === dateStr && d.type === 'income')
        .reduce((s, d) => s + d.total, 0);
      const exp = stats.dailyTrend
        .filter((d) => d.date === dateStr && d.type === 'expense')
        .reduce((s, d) => s + d.total, 0);
      data.push({ day: i, income: inc, expense: exp });
    }
    return data;
  }, [stats]);

 

  const axisColor = '#9ef3c5';
  const axisColorGeneral = '#94a3b8';
  const tooltipBg = '#0c1117';
  const tooltipBorder = 'rgba(74,222,128,0.24)';
  const tooltipLabel = '#e2e8f0';
  const tooltipText = '#cbd5e1';
  const expenseColor = '#22d3a6';
  const matrixBarDark = '#0f172a';
  const matrixBarLight = '#8bffd6';

  const yearForTable = stats ? (yearlyStats?.year ?? Number(stats.month.split('-')[0])) : new Date().getFullYear();
  const monthKeys = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${yearForTable}-${String(i + 1).padStart(2, '0')}`),
    [yearForTable]
  );
  const yearlyCombined = useMemo(() => {
    if (!stats) return [];
    const yearlyExpense = (yearlyStats?.monthlyTrend || []).filter((m) => m.type === 'expense');
    const yearlyIncome = (yearlyStats?.monthlyTrend || []).filter((m) => m.type === 'income');
    return monthKeys.map((m) => {
      const exp = yearlyExpense.find((e) => e.month === m)?.total || 0;
      const inc = yearlyIncome.find((i) => i.month === m)?.total || 0;
      return { month: m.split('-')[1], expense: exp, income: inc };
    });
  }, [monthKeys, yearlyStats, stats]);

  if (!stats) return <div className="loading-spinner" />;

  const topExpense = expenseByCategory[0];

  return (
    <div className="reports-stack">
      <div
        className="card-grid"
        style={{
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gridAutoRows: '1fr',
        }}
      >
        <div className="card">
          <div className="card-title">이번 달 수입</div>
          <div className="card-value">{formatCurrency(stats.income, currency)}</div>
          <div className="card-sub">{stats.month}</div>
        </div>
        <div className="card">
          <div className="card-title">이번 달 지출</div>
          <div className="card-value expense">{formatCurrency(stats.expense, currency)}</div>
          <div className="card-sub">{stats.month}</div>
        </div>
        <div className="card">
          <div className="card-title">일평균 지출</div>
          <div className="card-value expense">
            {formatCurrency(Math.round(stats.expense / daysInMonth), currency)}
          </div>
          <div className="card-sub">하루 평균</div>
        </div>
        <div className="card">
          <div className="card-title">총 거래 건수</div>
          <div className="card-value">{stats.transactionCount}건</div>
          <div className="card-sub">월간 합계</div>
        </div>
        <div className="card">
          <div className="card-title">최고 지출 카테고리</div>
          <div className="card-value">{topExpense?.category_name || '-'}</div>
          <div className="card-sub">
            {topExpense ? formatCurrency(topExpense.total, currency) : '-'}
          </div>
        </div>
      </div>

      <div className="reports-chart-grid">
        {/* 1행: Activity Summary & 연간 추이 */}
        <div className="card" style={{ padding: 24 }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">이번달 지출 추이</div>
            </div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={lineData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                    <stop offset="50%" stopColor="#22c55e" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 500, fill: axisColor }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: axisColor, fontWeight: 500 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                <Tooltip
                  cursor={false}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const first = payload[0];
                    if (!first || first.value == null) return null;
                    return (
                      <div
                        style={{
                          background: 'rgba(12,17,23,0.96)',
                          borderRadius: 14,
                          border: '1px solid rgba(148,163,184,0.35)',
                          boxShadow: '0 18px 45px rgba(0,0,0,0.85)',
                          padding: '10px 12px',
                          color: '#d6dce6',
                          backdropFilter: 'blur(14px)',
                          WebkitBackdropFilter: 'blur(14px)',
                        }}
                      >
                        <div style={{ color: '#e2e7ef', fontWeight: 600, fontSize: 11, marginBottom: 4 }}>{label}일</div>
                        <div style={{ fontSize: 12 }}>expense : {formatCurrency(first.value as number, currency)}</div>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="expense" stroke="none" fill="url(#activityArea)" activeDot={false} />
                <Line type="monotone" dataKey="expense" stroke={expenseColor} strokeWidth={1.4} dot={false} activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">연간 지출/수입 추이</div>
              
            </div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={yearlyCombined} margin={{ left: -8, right: 8, top: 10 }}>
                <defs>
                  <linearGradient id="yearExpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={matrixBarLight} />
                    <stop offset="45%" stopColor="#1f2937" />
                    <stop offset="100%" stopColor={matrixBarDark} />
                  </linearGradient>
                  <linearGradient id="yearIncGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a7f3d0" />
                    <stop offset="45%" stopColor="#1f2937" />
                    <stop offset="100%" stopColor="#0b1220" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(74,222,128,0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: axisColorGeneral, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: axisColorGeneral, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Math.round(v / 10000)}만`}
                />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    color: tooltipText,
                    borderRadius: 12,
                    boxShadow: '0 18px 45px rgba(0,0,0,0.85)',
                  }}
                  labelStyle={{ color: tooltipLabel, fontWeight: 700 }}
                  formatter={(v: number, n) => [formatCurrency(v, currency), n === 'expense' ? '지출' : '수입']}
                  labelFormatter={(l) => `${l}월`}
                />
                <Bar dataKey="expense" fill="url(#yearExpGrad)" radius={[10, 10, 0, 0]} />
                <Bar dataKey="income" fill="url(#yearIncGrad)" radius={[10, 10, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2행: 지출 카테고리 분석 + 우측 월별 테이블 */}
        <div className="card" style={{ padding: 24 }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">지출 카테고리 분석</div>
            </div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseByCategory.slice(0, 10)} layout="vertical" margin={{ left: 12, right: 12 }}>
                <defs>
                  <linearGradient id="reportsBar3D" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3ce596" />
                    <stop offset="45%" stopColor="#22c874" />
                    <stop offset="100%" stopColor="#0d5d3c" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(74,222,128,0.08)" horizontal vertical={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${(v/10000).toFixed(0)}만`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fontWeight: 500, fill: axisColorGeneral }}
                />
                <YAxis
                  type="category"
                  dataKey="category_name"
                  width={120}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 13, fontWeight: 600, fill: axisColorGeneral }}
                />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    color: tooltipText,
                    borderRadius: 12,
                    boxShadow: '0 18px 45px rgba(0,0,0,0.85)',
                  }}
                  labelStyle={{ color: tooltipLabel, fontWeight: 700, marginBottom: 6 }}
                  formatter={(value: number) => formatCurrency(value, currency)}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]} fill="url(#reportsBar3D)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ width: '100%', minWidth: 260 }}>
          <div className="transactions-table-lite manage-table" style={{ padding: 8 }}>
            <div className="tx-row manage-head" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="tx-col-label" style={{ justifyContent: 'center' }}>월</div>
              <div className="tx-col-amount" style={{ justifyContent: 'flex-end', textAlign: 'right' }}>수입</div>
              <div className="tx-col-amount" style={{ justifyContent: 'flex-end', textAlign: 'right' }}>지출</div>
            </div>
            {yearlyCombined.map((m, idx) => (
              <div key={idx} className="tx-row manage-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="tx-col-label" style={{ justifyContent: 'center' }}>{Number(m.month)}월</div>
                <div className="tx-amount tx-col-amount" style={{ justifyContent: 'flex-end', textAlign: 'right' }}>
                  {formatCurrency(m.income, currency)}
                </div>
                <div className="tx-amount tx-col-amount negative" style={{ justifyContent: 'flex-end', textAlign: 'right' }}>
                  {formatCurrency(m.expense, currency)}
                </div>
              </div>
            ))}
            <div className="tx-row manage-row" style={{ gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="tx-col-label" style={{ justifyContent: 'center', fontWeight: 700 }}>합계</div>
              <div className="tx-amount tx-col-amount" style={{ justifyContent: 'flex-end', textAlign: 'right', fontWeight: 700 }}>
                {formatCurrency(yearlyCombined.reduce((s, m) => s + m.income, 0), currency)}
              </div>
              <div className="tx-amount tx-col-amount negative" style={{ justifyContent: 'flex-end', textAlign: 'right', fontWeight: 700 }}>
                {formatCurrency(yearlyCombined.reduce((s, m) => s + m.expense, 0), currency)}
              </div>
            </div>
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
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icons.Plus /> 새 목표
        </button>
      </div>

      {goals.length > 0 ? (
        <div className="transactions-table-lite goals-manage-table">
          <div className="tx-row manage-head">
            <div className="tx-col-label">목표</div>
            <div className="tx-col-amount">진행률</div>
            <div className="tx-col-amount">현재 금액</div>
            <div className="tx-col-amount">목표 금액</div>
            <div className="tx-col-date">기한</div>
            <div className="tx-col-actions">작업</div>
          </div>
          {goals.map((goal) => {
            const progress = goal.target_amount > 0 ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0;
            return (
              <div key={goal.id} className="tx-row manage-row">
                <div className="tx-main tx-col-label">
                  <div className="tx-main-text">
                    <div className="tx-name">{goal.name}</div>
                  </div>
                </div>
                <div className="tx-col-amount">{progress.toFixed(0)}%</div>
                <div className="tx-amount tx-col-amount">{formatCurrency(goal.current_amount, currency)}</div>
                <div className="tx-amount tx-col-amount">{formatCurrency(goal.target_amount, currency)}</div>
                <div className="tx-col-date">{goal.deadline ? formatDate(goal.deadline) : '-'}</div>
                <div className="tx-col-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(goal.id)}>삭제</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state" style={{ borderRadius: 20, padding: 60 }}>
          <div className="empty-state-title">저축 목표가 없습니다</div>
          <div className="empty-state-text">첫 저축 목표를 만들어 진행 상황을 추적해보세요.</div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowForm(true)}>
            <Icons.Plus /> 새 목표
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


