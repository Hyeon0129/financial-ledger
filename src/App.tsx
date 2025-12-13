// Main App Component
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase'
import AuthTest from './components/AuthTest'
import type {
  Transaction, Category, Account, Budget, SavingsGoal, Loan,
  MonthlyStats, User
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
import { showAlert } from './components/common/alertHelpers';
import { LiquidPanel } from './components/common/LiquidPanel';

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

  // Authentication Setup
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error('Auth error:', error);
      setIsLoggedIn(!!data.session);
      setAuthReady(true);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
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
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase.from('profiles').upsert({ id: data.user.id, email: data.user.email ?? '' }, { onConflict: 'id' });
      }
    };
    ensureProfile();
  }, [isLoggedIn]);

  // App State
  const [view, setView] = useState<View>('dashboard');
  const [month, setMonth] = useState<string>(getMonthKey(new Date()));
  const [currency, setCurrency] = useState('₩');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false); // Sidebar collapse state
  
  // Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [prevStats, setPrevStats] = useState<MonthlyStats | null>(null);
  const [yearlyStats, setYearlyStats] = useState<{ year: number; monthlyTrend: Array<{ month: string; type: string; total: number }> } | null>(null);
  const [loading, setLoading] = useState(true);

  // Computed Data
  const monthlyAccountSpend = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(month))
      .forEach((t) => {
        if (t.account_id) map[t.account_id] = (map[t.account_id] || 0) + t.amount;
      });
    return map;
  }, [transactions, month]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  }, [month]);

  const normalizeTransactions = useCallback((txs: Transaction[]) => {
    const uniqMap: Record<string, Transaction> = {};
    txs.forEach((t) => { uniqMap[t.id] = t; });
    return Object.values(uniqMap).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, []);

  // Initial Data Load
  useEffect(() => {
    if (!authReady || !isLoggedIn) return;
    const loadData = async () => {
      setLoading(true);
      try {
        const [user, cats, accs, goals, loanList] = await Promise.all([
          userApi.get(), categoriesApi.list(), accountsApi.list(), savingsGoalsApi.list(), loansApi.list(),
        ]);
        setCurrency(user.currency);
        setUserProfile(user);
        setCategories(cats);
        setAccounts(accs);
        setSavingsGoals(goals);
        setLoans(loanList);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [authReady, isLoggedIn]);

  // Theme
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // Month Data Load
  const prevMonthKey = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return getMonthKey(prev);
  }, [month]);

  useEffect(() => {
    if (!authReady || !isLoggedIn) return;
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
        if (reqId !== monthReqRef.current) return;
        setTransactions(normalizeTransactions(txs));
        setBudgets(bds);
        setStats(monthStats);
        setPrevStats(prevMonthStats);
        setYearlyStats(yrStats);
      } catch (e) { console.error(e); }
    };
    loadMonthData();
  }, [authReady, isLoggedIn, month, normalizeTransactions, prevMonthKey]);

  // Refresh Handlers
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
    const [monthStats, prevMonthStats, yrStats] = await Promise.all([
      statsApi.monthly(month), statsApi.monthly(prevMonthKey), statsApi.yearly(Number(month.split('-')[0]))
    ]);
    setStats(monthStats);
    setPrevStats(prevMonthStats);
    setYearlyStats(yrStats);
  }, [month, prevMonthKey]);

  const refreshCategories = async () => setCategories(await categoriesApi.list());
  const refreshAccounts = async () => setAccounts(await accountsApi.list());
  const refreshLoans = async () => setLoans(await loansApi.list());
  const refreshGoals = async () => setSavingsGoals(await savingsGoalsApi.list());

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setUserProfile(null);
  };

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(getMonthKey(new Date(y, m - 1 + delta, 1)));
  };

  // Nav Item Component
  const NavItem = ({ viewKey, label, iconPath, badge, active }: any) => (
    <button 
      className={`nav-item ${active ? 'active' : ''}`} 
      onClick={() => viewKey ? setView(viewKey) : showAlert('준비 중인 기능입니다.')}
      title={isCollapsed ? label : undefined}
    >
      <svg viewBox="0 0 256 256" fill="currentColor"><path d={iconPath} /></svg>
      <span>{label}</span>
      {badge && <span className="nav-badge" style={badge.style}>{badge.text}</span>}
    </button>
  );

  if (!authReady) return <div className="app-root" style={{background:'#050505'}} />;
  if (!isLoggedIn) return <AuthTest />;
  if (loading) return <div className="app-root" style={{background:'#050505'}} />;

  return (
    <>
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <filter id="lg-dist" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.010 0.010" numOctaves="2" seed="92" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="60" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <CustomAlert />
      
      <div className="app-root">
        <div className="app-shell">
          
          {/* SIDEBAR */}
          <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            <LiquidPanel className="sidebar-panel" contentClassName="sidebar-panel-content">
              
              <div className="sidebar-header">
                <div className="user-avatar" style={{backgroundImage: userProfile?.avatar_url ? `url(${userProfile.avatar_url})` : undefined}} />
                <div className="user-info">
                  <h3>{userProfile?.name || 'Jessica'}</h3>
                  <span>My Ledger</span>
                </div>
                {/* Toggle Button */}
                <button className="sidebar-toggle-btn" onClick={() => setIsCollapsed(!isCollapsed)}>
                  {isCollapsed ? (
                    <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"/></svg>
                  )}
                </button>
              </div>

              <div className="sidebar-search">
                <svg className="sidebar-search-icon" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>
                <input type="text" placeholder="Search..." />
              </div>

              <nav className="nav-menu">
                <NavItem viewKey="dashboard" label="Dashboard" active={view === 'dashboard'} iconPath="M104,216H48a8,8,0,0,1-8-8V128a8,8,0,0,1,8-8h56a8,8,0,0,1,8,8v80A8,8,0,0,1,104,216Zm-48-16h40V136H56ZM208,216H152a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h56a8,8,0,0,1,8,8V208A8,8,0,0,1,208,216Zm-48-16h40V48H160Zm-56-80H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h56a8,8,0,0,1,8,8v72A8,8,0,0,1,104,120Zm-48-16h40V48H56Z" />
                <NavItem viewKey="transactions" label="Transactions" active={view === 'transactions'} iconPath="M223.68,66.15,135.68,18a15.88,15.88,0,0,0-15.36,0l-88,48.15a16,16,0,0,0-8.32,14v95.7a16,16,0,0,0,8.32,14l88,48.15a15.88,15.88,0,0,0,15.36,0l88-48.15a16,16,0,0,0,8.32-14V80.15A16,16,0,0,0,223.68,66.15Zm-103.36-32,80,43.77L128,117.26,55.68,77.92Zm-7.68,173.7-80-43.77V76.31l80,43.77ZM144,191.85V120.08l80-43.77v87.84Z" />
                <NavItem viewKey="budgets" label="Budgets" active={view === 'budgets'} iconPath="M216,72H182.43L170.89,37.36a16,16,0,0,0-30.34,1.35L128,88.38,115.45,38.71a16,16,0,0,0-30.9,0L68.83,104H40a8,8,0,0,0,0,16H76.47l12.75-42.5,12.23,48.29A16,16,0,0,0,117,137.64l1.45-.18A16,16,0,0,0,131.56,125l12.89-51.11L156.17,120H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16H172.66l-4.78-19.11L188,73.11V184a8,8,0,0,1-8,8H72a8,8,0,0,1-8-8V152a8,8,0,0,0-16,0v32a24,24,0,0,0,24,24H180a24,24,0,0,0,24-24V88h12a8,8,0,0,0,0-16Z" />
                <NavItem viewKey="categories" label="Categories" active={view === 'categories'} iconPath="M40,128a88,88,0,1,1,88,88A88.1,88.1,0,0,1,40,128Zm88-72a72,72,0,1,0,72,72A72.08,72.08,0,0,0,128,56Zm16,112a8,8,0,0,1-16,0V136a8,8,0,0,1,8-8h32a8,8,0,0,1,0,16H144Z" />
                <NavItem viewKey="accounts" label="Accounts" active={view === 'accounts'} iconPath="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V72H40V56Zm0,144H40V88H216V200Zm-24-40a8,8,0,1,1-8-8A8,8,0,0,1,192,160Z" />
                <NavItem viewKey="reports" label="Reports" active={view === 'reports'} iconPath="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM216,192H40V64H216V192ZM48,96a8,8,0,0,1,8-8h96a8,8,0,0,1,0,16H56A8,8,0,0,1,48,96Zm0,32a8,8,0,0,1,8-8h96a8,8,0,0,1,0,16H56A8,8,0,0,1,48,128Zm0,32a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56A8,8,0,0,1,48,160Z" badge={{text:'New', style:{background:'#e65100'}}} />
                <NavItem viewKey="savings" label="Savings" active={view === 'savings'} iconPath="M224,112h-8V80a16,16,0,0,0-16-16H168V48a16,16,0,0,0-16-16H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V128h8a8,8,0,0,0,0-16ZM152,48v16H48V48Zm0,32v32H48V80Zm-88,48v80H48V128Zm16,80V128h72v80Zm128,0H168v-8a8,8,0,0,0-8-8H160a24,24,0,0,0-24-24h16V80h48v32h8a8,8,0,0,0,0,16h-8v64h8a8,8,0,0,0,0,16Z" />
              </nav>

              <div className="upgrade-card">
                <h4>Discover New Features!</h4>
                <p>Check out the latest tools to boost your sales.</p>
                <button className="upgrade-btn" onClick={() => showAlert('준비 중인 기능입니다.')}>
                  Upgrade Now
                  <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>
                </button>
              </div>
            </LiquidPanel>
          </aside>

          {/* MAIN CONTENT */}
          <div className="app-content">
            <header className="top-header">
              <div className="header-left">
                <div className="header-breadcrumbs">
                  <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/></svg>
                  <span>{viewMeta[view]?.title || 'Dashboard'}</span>
                </div>
              </div>
              
              {/* Centered Month Nav */}
              <div className="month-nav">
                <button className="month-btn" onClick={() => changeMonth(-1)}>
                  <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"/></svg>
                </button>
                <div className="month-label">{monthLabel}</div>
                <button className="month-btn" onClick={() => changeMonth(1)}>
                  <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/></svg>
                </button>
              </div>

              <div className="header-right">
                <div className="top-actions">
                  <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
                    {theme === 'dark' ? 
                      <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-12-12A8,8,0,0,0,46.34,58.34ZM197.66,58.34a8,8,0,0,0,11.31-11.32l-12-12a8,8,0,0,0-11.31,11.32ZM224,120H248a8,8,0,0,0,0-16H224a8,8,0,0,0,0,16ZM48,120H24a8,8,0,0,0,0,16H48a8,8,0,0,0,0-16ZM197.66,197.66a8,8,0,0,0-11.31,11.31l12,12a8,8,0,0,0,11.31-11.31ZM58.34,186.34l-12,12a8,8,0,0,0,11.32,11.32l12-12a8,8,0,0,0-11.32-11.32ZM120,216v24a8,8,0,0,0,16,0V216a8,8,0,0,0-16,0Z"/></svg> 
                      : 
                      <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M216.24,137.11a8,8,0,0,1-3.66,6.88,119.76,119.76,0,0,1-112.53,17.9,119.72,119.72,0,0,1-56.16-56.33A119.76,119.76,0,0,1,61.79,7.56a8,8,0,0,1,10.78-4.07,8,8,0,0,1,4.07,10.78,104,104,0,0,0,136.14,136.14,8,8,0,0,1,10.78,4.07A8,8,0,0,1,216.24,137.11Z"/></svg>
                    }
                  </button>
                  <button className="icon-btn" onClick={handleLogout} title="Logout">
                    <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm45.66-93.66a8,8,0,0,1,0,11.32l-32,32a8,8,0,0,1-11.32,0l-32-32a8,8,0,0,1,11.32-11.32L120,132.69V88a8,8,0,0,1,16,0v44.69l10.34-10.35A8,8,0,0,1,173.66,122.34Z"/></svg>
                  </button>
                </div>
              </div>
            </header>

            <div className="main-scroll">
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
                />
              )}
              {view === 'transactions' && <TransactionsView transactions={transactions} categories={categories} accounts={accounts} currency={currency} month={month} onRefresh={refreshTransactions} />}
              {view === 'budgets' && <BudgetsView budgets={budgets} categories={categories} stats={stats} currency={currency} month={month} transactions={transactions} onRefresh={refreshBudgets} />}
              {view === 'categories' && <CategoriesView categories={categories} onRefresh={refreshCategories} />}
              {view === 'accounts' && <AccountsView accounts={accounts} currency={currency} monthlySpend={monthlyAccountSpend} categories={categories} loans={loans} onRefresh={refreshAccounts} onRefreshLoans={refreshLoans} />}
              {view === 'reports' && <ReportsView stats={stats} yearlyStats={yearlyStats} currency={currency} />}
              {view === 'savings' && <SavingsView goals={savingsGoals} currency={currency} onRefresh={refreshGoals} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default App;
