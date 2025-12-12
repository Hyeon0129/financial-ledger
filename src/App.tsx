// Main App Component
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase'
import AuthTest from './components/AuthTest'
import type {
  Transaction, Category, Account, Budget, SavingsGoal, Loan,
  MonthlyStats
} from './api';
import {
  transactionsApi, categoriesApi, accountsApi, budgetsApi,
  savingsGoalsApi, statsApi, userApi, loansApi,
  getMonthKey
} from './api';
import {
  DashboardView,
  TransactionsView,
  BudgetsView,
  CategoriesView,
  AccountsView,
  ReportsView,
  SavingsView
} from './components/views';
import { viewMeta } from './components/common/utils';
import type { View } from './components/common/utils';
import { CustomAlert } from './components/common/CustomAlert';

// Global styles
import './styles/global.css';
import './styles/layout.css';
import './styles/common.css';
import './styles/components/dashboard.css';
import './styles/components/transactions.css';
import './styles/components/budgets.css';
import './styles/components/categories.css';
import './styles/components/accounts.css';
import './styles/components/reports.css';
import './styles/components/savings.css';
import './styles/components/shared.css';

const App: React.FC = () => {
const [authReady, setAuthReady] = useState(false);
const [isLoggedIn, setIsLoggedIn] = useState(false);
const monthReqRef = useRef(0);

useEffect(() => {
  let mounted = true;

  // Supabase 세션 확인
  supabase.auth.getSession().then(({ data, error }) => {
    if (!mounted) return;
    
    if (error) {
      console.error('세션 확인 에러:', error);
    } else {
      console.log('현재 세션:', data.session ? '로그인됨' : '로그아웃됨');
    }
    
    setIsLoggedIn(!!data.session);
    setAuthReady(true);
  });

  // Auth 상태 변경 리스너
  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth 상태 변경:', event, session ? '로그인됨' : '로그아웃됨');
    setIsLoggedIn(!!session);
    setAuthReady(true);
  });

  return () => {
    mounted = false;
    authListener?.subscription?.unsubscribe();
  };
}, []);

useEffect(() => {
  if (!isLoggedIn) return;

  const ensureProfile = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      console.error('getUser error:', error);
      return;
    }

    const user = data.user;

    // profiles가 없으면 만들고, 있으면 유지(업데이트 최소화)
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert(
        { id: user.id, email: user.email ?? '' },
        { onConflict: 'id' }
      );

    if (upsertError) {
      console.error('profiles upsert error:', upsertError);
    }
  };

  ensureProfile();
}, [isLoggedIn]);


  
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
      else uniqMap[t.id] = t;
    });
    return Object.values(uniqMap).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, []);

  // Load initial data (로그인/인증 준비된 뒤에만)
useEffect(() => {
  if (!authReady) return;
  if (!isLoggedIn) return;

  const loadData = async () => {
    setLoading(true);
    try {
      const [user, cats, accs, goals, loanList] = await Promise.all([
        userApi.get(),
        categoriesApi.list(),
        accountsApi.list(),
        savingsGoalsApi.list(),
        loansApi.list(),
      ]);

      setCurrency(user.currency);
      setCategories(cats);
      setAccounts(accs);
      setSavingsGoals(goals);
      setLoans(loanList);
    } catch (e: unknown) {
      // 인증/권한 타이밍 에러를 “서버 연결”로 오해하지 않게
      const msg = e instanceof Error ? e.message : String(e);
      console.error('loadData error:', msg);

      // 필요하면 여기서만 alert 띄우고, 인증 계열은 조용히 처리
      // showAlert('데이터 로딩 실패: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  loadData();
}, [authReady, isLoggedIn]);


  const prevMonthKey = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return getMonthKey(prev);
  }, [month]);

  // Load month-specific data
  useEffect(() => {
    if (!authReady) return;
    if (!isLoggedIn) return;
  
    const reqId = ++monthReqRef.current;
  
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
  
        // ✅ “가장 마지막 요청”만 state 반영
        if (reqId !== monthReqRef.current) return;
  
        setTransactions(normalizeTransactions(txs));
        setBudgets(bds);
        setStats(monthStats);
        setPrevStats(prevMonthStats);
        setYearlyStats(yrStats);
      } catch (e) {
        if (reqId !== monthReqRef.current) return;
        console.error('loadMonthData error:', e);
      }
    };
  
    loadMonthData();
  }, [authReady, isLoggedIn, month, normalizeTransactions, prevMonthKey]);
  
  

  // Refresh functions
  const refreshTransactions = useCallback(async () => {
    const [txs, monthStats, prevMonthStats, yrStats, accs] = await Promise.all([
      transactionsApi.list({ month }),
      statsApi.monthly(month),
      statsApi.monthly(prevMonthKey),
      statsApi.yearly(Number(month.split('-')[0])),
      accountsApi.list(),
    ]);
    setTransactions(normalizeTransactions(txs));
    setStats(monthStats);
    setPrevStats(prevMonthStats);
    setYearlyStats(yrStats);
    setAccounts(accs);
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

  // Auth 준비 대기
  if (!authReady) {
    return (
      <div className="app-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div className="loading-spinner" style={{ marginBottom: 16 }} />
          <div>인증 확인 중...</div>
        </div>
      </div>
    );
  }

  // 로그인 안됨 - Auth 화면
  if (!isLoggedIn) {
    return <AuthTest />;
  }

  // 데이터 로딩 중
  if (loading) {
    return (
      <div className="app-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  // 메인 앱
  return (
    <>
      <CustomAlert />
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
        </section>
      </main>
      </div>
    </>
  );
};

export default App;