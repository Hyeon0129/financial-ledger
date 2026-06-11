// Main App Component
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase'
import AuthTest from './components/AuthTest'
import appLogo from './assets/mac_black.jpg';
import type {
  Transaction, Category, Account, Budget, SavingsGoal, Loan,
  MonthlyStats, User
} from './api';
import {
  transactionsApi, categoriesApi, accountsApi, budgetsApi,
  savingsGoalsApi, statsApi, userApi, loansApi,
  getMonthKey
} from './api';
import { dueDateForMonth, loadBills, type RecurringBill } from './components/views/billsStore';
import { creditCardCycleRange, isoInMonth, loadAccountMeta } from './components/views/accountMetaStore';
import {
  DashboardView,
  TransactionsView,
  BudgetsView,
  CategoriesView,
  AccountsView,
  ReportsView,
  BillsView,
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
import './styles/components/bills.css';
import './styles/components/shared.css';

const App: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const monthReqRef = useRef(0);
  const formatLocalISO = useCallback((d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

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
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  type LocalPrefs = {
    timezone: string;
    monthStartMode: 'day1' | 'payday';
    paydayDay: number;
    budgetAlertEnabled: boolean;
    budgetAlertRate: number; // 0..100
    monthEndReminderEnabled: boolean; // (future: email)
  };

  const PREFS_KEY = 'my-ledger:prefs:v1';
  const loadPrefs = (): LocalPrefs => {
    if (typeof window === 'undefined') {
      return {
        timezone: 'Asia/Seoul',
        monthStartMode: 'day1',
        paydayDay: 1,
        budgetAlertEnabled: true,
        budgetAlertRate: 80,
        monthEndReminderEnabled: false,
      };
    }
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) throw new Error('no prefs');
      const parsed = JSON.parse(raw) as Partial<LocalPrefs>;
      return {
        timezone: typeof parsed.timezone === 'string' ? parsed.timezone : 'Asia/Seoul',
        monthStartMode: parsed.monthStartMode === 'payday' ? 'payday' : 'day1',
        paydayDay: Math.max(1, Math.min(31, Math.floor(Number(parsed.paydayDay) || 1))),
        budgetAlertEnabled: parsed.budgetAlertEnabled !== false,
        budgetAlertRate: Math.max(0, Math.min(100, Math.floor(Number(parsed.budgetAlertRate) || 80))),
        monthEndReminderEnabled: !!parsed.monthEndReminderEnabled,
      };
    } catch {
      return {
        timezone: 'Asia/Seoul',
        monthStartMode: 'day1',
        paydayDay: 1,
        budgetAlertEnabled: true,
        budgetAlertRate: 80,
        monthEndReminderEnabled: false,
      };
    }
  };

  const [prefs, setPrefs] = useState<LocalPrefs>(() => loadPrefs());

  const savePrefs = useCallback((next: LocalPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);
  
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
  const [showAlarm, setShowAlarm] = useState(false);
  const [monthDataReady, setMonthDataReady] = useState(false);
  const autopayInFlightRef = useRef(false);

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
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('my-ledger:theme');
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
    }
    try {
      window.localStorage.setItem('my-ledger:theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (!showProfileMenu) return;
    const onDown = (e: MouseEvent) => {
      const el = profileMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setShowProfileMenu(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [showProfileMenu]);

  // Month Data Load
  const prevMonthKey = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    return getMonthKey(prev);
  }, [month]);

  useEffect(() => {
    if (!authReady || !isLoggedIn) return;
    const reqId = ++monthReqRef.current;
    setMonthDataReady(false);
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
      finally {
        if (reqId === monthReqRef.current) setMonthDataReady(true);
      }
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

  // Autopay (MVP): create due transactions automatically (idempotent by memo).
  useEffect(() => {
    if (!authReady || !isLoggedIn) return;
    if (!userProfile?.id) return;
    if (!monthDataReady) return;
    if (!accounts.length) return;
    if (autopayInFlightRef.current) return;

    const todayISO = formatLocalISO(new Date());
    const currentMonth = todayISO.slice(0, 7);
    if (month !== currentMonth) return;

    const bills = loadBills();
    const memoSet = new Set(transactions.map((t) => (t.memo_raw ?? t.memo ?? '')));

    const [yy, mm] = currentMonth.split('-').map(Number);
    const monthEnd = `${currentMonth}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
    const limit = todayISO < monthEnd ? todayISO : monthEnd;

    const dueDatesForAutopay = (bill: RecurringBill) => {
      const first = dueDateForMonth(bill, currentMonth);
      if (!first) return [];
      if (bill.cadence === 'monthly' || bill.cadence === 'yearly') return first <= limit ? [first] : [];
      const step = bill.cadence === 'weekly' ? 7 : Math.max(1, Math.floor(bill.customEveryDays ?? 0));
      if (bill.cadence === 'custom_days' && (!Number.isFinite(step) || step <= 0)) return [];
      const out: string[] = [];
      let cursor = first;
      let guard = 0;
      while (cursor <= limit && guard < 4000) {
        out.push(cursor);
        const d = new Date(`${cursor}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + step);
        cursor = d.toISOString().slice(0, 10);
        guard += 1;
      }
      return out;
    };

		    const run = async () => {
	        autopayInFlightRef.current = true;
		      let createdAny = false;
		      for (const b of bills) {
		        if (!b.id || !b.categoryId || !b.accountId) continue;
		        const dueDates = dueDatesForAutopay(b);
		        for (const dueDate of dueDates) {
		          const memo = `AUTO_BILL|${b.id}|${dueDate}`;
		          if (memoSet.has(memo)) continue;
		          await transactionsApi.create({
		            type: 'expense',
		            amount: b.amount,
		            category_id: b.categoryId,
		            account_id: b.accountId,
		            to_account_id: null,
		            date: dueDate,
		            memo,
		          });
		          memoSet.add(memo);
		          createdAny = true;
		        }
		      }

	      // Credit card autopay (MVP)
	      const ensureCardPaymentCategory = async (): Promise<string | null> => {
	        try {
	          const cats = await categoriesApi.list();
	          const norm = (s: string) => s.trim().toLowerCase();
	          const parentName = '카드';
	          const childName = '카드대금';

	          let parent = cats.find((c) => c.type === 'expense' && !c.parent_id && norm(c.name) === norm(parentName));
	          if (!parent) {
	            parent = await categoriesApi.create({
	              name: parentName,
	              type: 'expense',
	              parent_id: null,
	              color: '#22C55E',
	              icon: null,
	            });
	          }

	          let child = cats.find(
	            (c) => c.type === 'expense' && c.parent_id === parent!.id && norm(c.name) === norm(childName),
	          );
	          if (!child) {
	            child = await categoriesApi.create({
	              name: childName,
	              type: 'expense',
	              parent_id: parent!.id,
	              color: '#22C55E',
	              icon: null,
	            });
	          }
	          return child.id;
	        } catch {
	          return null;
	        }
	      };

	      let cardPaymentCategoryId: string | null = null;
	      const meta = loadAccountMeta();
	      const creditAccounts = accounts.filter((a) => meta[a.id]?.kind === 'credit_card');
	      for (const card of creditAccounts) {
	        const m = meta[card.id];
	        if (!m || m.kind !== 'credit_card') continue;
	        if (!m.withdrawAccountId) continue;
	        const dueDate = isoInMonth(currentMonth, Number(m.paymentDay) || 1);
	        if (dueDate > todayISO) continue;

        const cycle = creditCardCycleRange(currentMonth, m);
        const amount = transactions
          .filter((t) => t.type === 'expense' && t.account_id === card.id && t.date >= cycle.start && t.date <= cycle.end)
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        if (amount <= 0) continue;

		        const memo = `AUTO_CARD|${card.id}|${currentMonth}|${dueDate}`;
		        if (memoSet.has(memo)) continue;

		        if (!cardPaymentCategoryId) {
		          cardPaymentCategoryId = await ensureCardPaymentCategory();
		        }

		        await transactionsApi.create({
		          type: 'transfer',
		          amount,
		          category_id: cardPaymentCategoryId,
		          account_id: m.withdrawAccountId,
		          to_account_id: card.id,
		          date: dueDate,
		          memo,
		        });
		        memoSet.add(memo);
		        createdAny = true;
		      }
		      if (createdAny) await refreshTransactions();
		    };

    run().catch(() => {}).finally(() => {
      autopayInFlightRef.current = false;
    });
  }, [accounts, authReady, formatLocalISO, isLoggedIn, month, monthDataReady, refreshTransactions, transactions, userProfile?.id]);

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

  // Logout is currently not shown in the top-right UI.

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(getMonthKey(new Date(y, m - 1 + delta, 1)));
  };

  // Nav Item Component
  type NavItemBadge = { text: string; style?: React.CSSProperties };
  type NavItemProps = { viewKey?: View; label: string; iconPath: string; badge?: NavItemBadge; active?: boolean };
  const NavItem: React.FC<NavItemProps> = ({ viewKey, label, iconPath, badge, active }) => (
    <button 
      className={`nav-item ${active ? 'active' : ''}`} 
      onClick={() => viewKey ? setView(viewKey) : showAlert('준비 중인 기능입니다.')}
    >
      <svg viewBox="0 0 256 256" fill="currentColor"><path d={iconPath} /></svg>
      <span>{label}</span>
      {badge && <span className="nav-badge" style={badge.style}>{badge.text}</span>}
    </button>
  );

  const getPageSubtitle = (v: View) => {
    switch(v) {
      case 'dashboard': return '한눈에 확인해보세요';
      case 'transactions': return '모든 수입과 지출 내역';
      case 'budgets': return '예산 설정 및 관리';
      case 'accounts': return '내 자산과 계좌 현황';
      case 'bills': return '정기 결제/납부 관리';
      default: return 'Finance Overview';
    }
  };

  if (!authReady) return <div className="app-root" style={{background:'#050505'}} />;
  if (!isLoggedIn) return <AuthTest />;
  if (loading) return <div className="app-root" style={{background:'#050505'}} />;

  const alarmItems = (() => {
    const today = new Date();
    const todayISO = formatLocalISO(today);
    const currentMonth = todayISO.slice(0, 7);
    const diffs = new Set([0, 1, 3]);

    const diffDays = (iso: string) => {
      const a = new Date(`${todayISO}T00:00:00Z`).getTime();
      const b = new Date(`${iso}T00:00:00Z`).getTime();
      return Math.round((b - a) / 86400000);
    };

    const meta = loadAccountMeta();
    const out: Array<{ kind: 'bill' | 'loan' | 'budget' | 'card'; title: string; when?: string; badge?: string }> = [];

    // Bills D-3/D-1/D0
    for (const b of loadBills()) {
      const due = dueDateForMonth(b, currentMonth);
      if (!due) continue;
      const d = diffDays(due);
      if (d < 0) continue;
      if (!diffs.has(d)) continue;
      out.push({
        kind: 'bill',
        title: `[고정지출] ${b.name}`,
        when: due,
        badge: d === 0 ? 'D-DAY' : `D-${d}`,
      });
    }

    // Loans D-3/D-1/D0
    for (const l of loans) {
      if (!l.next_due_date) continue;
      const due = l.next_due_date.slice(0, 10);
      const d = diffDays(due);
      if (d < 0) continue;
      if (!diffs.has(d)) continue;
      out.push({
        kind: 'loan',
        title: `[대출] ${l.name}`,
        when: due,
        badge: d === 0 ? 'D-DAY' : `D-${d}`,
      });
    }

    // Credit card payments D-3/D-1/D0
    for (const a of accounts) {
      const m = meta[a.id];
      if (!m || m.kind !== 'credit_card') continue;
      const due = isoInMonth(currentMonth, Number(m.paymentDay) || 1);
      const d = diffDays(due);
      if (d < 0) continue;
      if (!diffs.has(d)) continue;
      const cycle = creditCardCycleRange(currentMonth, m);
      const amount = transactions
        .filter((t) => t.type === 'expense' && t.account_id === a.id && t.date >= cycle.start && t.date <= cycle.end)
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      if (amount <= 0) continue;
      out.push({
        kind: 'card',
        title: `[카드대금] ${a.name}`,
        when: due,
        badge: d === 0 ? 'D-DAY' : `D-${d}`,
      });
    }

    // Budget threshold alert (default 80%)
    if (stats && stats.month === currentMonth) {
      const totalBudget = stats.budgetUsage.reduce((sum, b) => sum + (b.budget_amount || 0), 0);
      const totalSpent = stats.budgetUsage.reduce((sum, b) => sum + (b.spent || 0), 0);
      const threshold = Math.max(0, Math.min(100, prefs.budgetAlertRate || 80)) / 100;
      if (prefs.budgetAlertEnabled && totalBudget > 0 && totalSpent / totalBudget >= threshold) {
        const pct = Math.round(threshold * 100);
        out.push({ kind: 'budget', title: `[예산] 사용률 ${pct}% 도달` });
      }
    }

    return out.slice(0, 20);
  })();

  return (
    <>
      <div className="bg" aria-hidden="true" />
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
          <aside className="sidebar">
            <LiquidPanel className="sidebar-panel" contentClassName="sidebar-panel-content">
              
              <div className="sidebar-header">
                <img className="app-logo" src={appLogo} alt="" aria-hidden="true" />
                <div className="user-info">
                  <h3>My Ledger</h3>
                  <span>가계부</span>
                </div>
              </div>

              {/* Month Nav in Sidebar (Replaces Search) */}
              <div className="sidebar-month-nav">
                <button className="month-btn-sm" onClick={() => changeMonth(-1)}>
                  <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"/></svg>
                </button>
                <div className="month-label-sm">{monthLabel}</div>
                <button className="month-btn-sm" onClick={() => changeMonth(1)}>
                  <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/></svg>
                </button>
              </div>

              <nav className="nav-menu">
                <NavItem viewKey="dashboard" label="대시보드" active={view === 'dashboard'} iconPath="M104,216H48a8,8,0,0,1-8-8V128a8,8,0,0,1,8-8h56a8,8,0,0,1,8,8v80A8,8,0,0,1,104,216Zm-48-16h40V136H56ZM208,216H152a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h56a8,8,0,0,1,8,8V208A8,8,0,0,1,208,216Zm-48-16h40V48H160Zm-56-80H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h56a8,8,0,0,1,8,8v72A8,8,0,0,1,104,120Zm-48-16h40V48H56Z" />
                <NavItem viewKey="transactions" label="거래 내역" active={view === 'transactions'} iconPath="M223.68,66.15,135.68,18a15.88,15.88,0,0,0-15.36,0l-88,48.15a16,16,0,0,0-8.32,14v95.7a16,16,0,0,0,8.32,14l88,48.15a15.88,15.88,0,0,0,15.36,0l88-48.15a16,16,0,0,0,8.32-14V80.15A16,16,0,0,0,223.68,66.15Zm-103.36-32,80,43.77L128,117.26,55.68,77.92Zm-7.68,173.7-80-43.77V76.31l80,43.77ZM144,191.85V120.08l80-43.77v87.84Z" />
                <NavItem viewKey="categories" label="카테고리" active={view === 'categories'} iconPath="M40,128a88,88,0,1,1,88,88A88.1,88.1,0,0,1,40,128Zm88-72a72,72,0,1,0,72,72A72.08,72.08,0,0,0,128,56Zm16,112a8,8,0,0,1-16,0V136a8,8,0,0,1,8-8h32a8,8,0,0,1,0,16H144Z" />
                <NavItem viewKey="accounts" label="계좌" active={view === 'accounts'} iconPath="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V72H40V56Zm0,144H40V88H216V200Zm-24-40a8,8,0,1,1-8-8A8,8,0,0,1,192,160Z" />
                <NavItem viewKey="budgets" label="예산" active={view === 'budgets'} iconPath="M216,72H182.43L170.89,37.36a16,16,0,0,0-30.34,1.35L128,88.38,115.45,38.71a16,16,0,0,0-30.9,0L68.83,104H40a8,8,0,0,0,0,16H76.47l12.75-42.5,12.23,48.29A16,16,0,0,0,117,137.64l1.45-.18A16,16,0,0,0,131.56,125l12.89-51.11L156.17,120H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16H172.66l-4.78-19.11L188,73.11V184a8,8,0,0,1-8,8H72a8,8,0,0,1-8-8V152a8,8,0,0,0-16,0v32a24,24,0,0,0,24,24H180a24,24,0,0,0,24-24V88h12a8,8,0,0,0,0-16Z" badge={{text:'16', style:{}}} />
                <NavItem viewKey="reports" label="리포트" active={view === 'reports'} iconPath="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM216,192H40V64H216V192ZM48,96a8,8,0,0,1,8-8h96a8,8,0,0,1,0,16H56A8,8,0,0,1,48,96Zm0,32a8,8,0,0,1,8-8h96a8,8,0,0,1,0,16H56A8,8,0,0,1,48,128Zm0,32a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56A8,8,0,0,1,48,160Z" badge={{text:'신규', style:{background:'#e65100'}}} />
                <NavItem viewKey="bills" label="고정지출" active={view === 'bills'} iconPath="M208,40H48A16,16,0,0,0,32,56V200a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V56A16,16,0,0,0,208,40ZM48,56H208V80H48Zm160,144H48V96H208v104Zm-28-72H76a8,8,0,0,1,0-16H180a8,8,0,0,1,0,16Zm0,40H76a8,8,0,0,1,0-16H180a8,8,0,0,1,0,16Z" />
                <NavItem viewKey="savings" label="저축 목표" active={view === 'savings'} iconPath="M224,112h-8V80a16,16,0,0,0-16-16H168V48a16,16,0,0,0-16-16H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V128h8a8,8,0,0,0,0-16ZM152,48v16H48V48Zm0,32v32H48V80Zm-88,48v80H48V128Zm16,80V128h72v80Zm128,0H168v-8a8,8,0,0,0-8-8H160a24,24,0,0,0-24-24h16V80h48v32h8a8,8,0,0,0,0,16h-8v64h8a8,8,0,0,0,0,16Z" />
                {/* 설정/로그아웃은 상단 우측 프로필 메뉴에서 제공합니다. */}
              </nav>

              <div className="upgrade-card">
                <h4>새로운 기능을 확인하세요!</h4>
                <p>최신 기능을 확인하고 더 편하게 관리해보세요.</p>
                <button className="upgrade-btn" onClick={() => showAlert('준비 중인 기능입니다.')}>
                  업그레이드
                  <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>
                </button>
              </div>
            </LiquidPanel>
          </aside>

          {/* MAIN CONTENT */}
          <div className="app-content">
            <header className="top-header">
              <div className="header-left">
                <h1>{viewMeta[view]?.title || '대시보드'}</h1>
                <div className="header-subtitle">{getPageSubtitle(view)}</div>
              </div>
              
		              <div className="header-right">
		                <button className="icon-btn" onClick={() => setShowAlarm(true)} aria-label="알림">
		                  <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.9,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z"/></svg>
		                  {alarmItems.length > 0 && <div className="notif-dot" />}
		                </button>
                    <div className="profileMenu" ref={profileMenuRef}>
                      <button
                        type="button"
                        className="profileBtn"
                        aria-label="프로필 메뉴"
                        onClick={() => setShowProfileMenu((v) => !v)}
                      >
                        <div
                          className="profileAvatar"
                          style={{
                            backgroundImage: userProfile?.avatar_url ? `url(${userProfile.avatar_url})` : undefined,
                          }}
                        >
                          {!userProfile?.avatar_url && (
                            <span className="profileInitial">
                              {(userProfile?.name?.trim() || userProfile?.email || 'U').slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </button>
                      {showProfileMenu && (
                        <LiquidPanel className="profileDropdown" contentClassName="profileDropdownContent">
                          <button
                            type="button"
                            className="profileMenuItem"
                            onClick={() => {
                              setShowProfileMenu(false);
                              setShowSettings(true);
                            }}
                          >
                            설정
                          </button>
                          <button
                            type="button"
                            className="profileMenuItem danger"
                            onClick={async () => {
                              setShowProfileMenu(false);
                              await supabase.auth.signOut();
                            }}
                          >
                            로그아웃
                          </button>
                        </LiquidPanel>
                      )}
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
                  yearlyStats={yearlyStats}
                  currency={currency}
                  month={month}
                  onNavigate={setView}
                />
              )}
              {view === 'transactions' && <TransactionsView transactions={transactions} categories={categories} accounts={accounts} currency={currency} month={month} onRefresh={refreshTransactions} />}
              {view === 'budgets' && <BudgetsView budgets={budgets} categories={categories} stats={stats} currency={currency} month={month} transactions={transactions} onRefresh={refreshBudgets} />}
              {view === 'categories' && <CategoriesView categories={categories} onRefresh={refreshCategories} />}
              {view === 'accounts' && <AccountsView accounts={accounts} currency={currency} monthlySpend={monthlyAccountSpend} categories={categories} loans={loans} userEmail={userProfile?.email ?? ''} userName={userProfile?.name ?? ''} onRefresh={refreshAccounts} onRefreshLoans={refreshLoans} />}
              {view === 'reports' && <ReportsView stats={stats} yearlyStats={yearlyStats} budgets={budgets} currency={currency} />}
              {view === 'bills' && (
                <BillsView
                  currency={currency}
                  month={month}
                  accounts={accounts}
                  onRefreshCategories={refreshCategories}
                  transactions={transactions}
                  onRefreshTransactions={refreshTransactions}
                />
              )}
              {view === 'savings' && <SavingsView goals={savingsGoals} currency={currency} onRefresh={refreshGoals} />}
            </div>
          </div>
        </div>
	      </div>
        {showSettings && (
          <SettingsModal
            theme={theme}
            currency={currency}
            user={userProfile}
            prefs={prefs}
	            onClose={() => setShowSettings(false)}
	            onChangeTheme={setTheme}
	            onChangeCurrency={async (cur) => {
                try {
                  const updated = await userApi.update({ currency: cur });
                  setUserProfile(updated);
                  setCurrency(updated.currency);
                  showAlert('저장되었습니다.');
                } catch {
                  showAlert('저장에 실패했습니다. (통화)');
                }
	            }}
	            onSaveProfile={async (patch) => {
                try {
                  const updated = await userApi.update(patch);
                  setUserProfile(updated);
                } catch {
                  showAlert('저장에 실패했습니다. (프로필)');
                }
	            }}
	            onSavePrefs={savePrefs}
	          />
	        )}
	      {showAlarm && (
	        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAlarm(false)}>
	          <div className="modal-content" style={{ maxWidth: 560 }}>
	            <div className="modal-header">
	              <h3 className="modal-title">알림</h3>
	              <button className="modal-close" onClick={() => setShowAlarm(false)}>
	                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
	                  <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/>
	                </svg>
	              </button>
	            </div>
	            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
	              {alarmItems.map((a, idx) => (
	                <LiquidPanel key={`${a.kind}-${idx}`} className="interactive" style={{ cursor: 'default' }}>
	                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
	                    <div style={{ minWidth: 0 }}>
	                      <div style={{ fontWeight: 750, color: 'var(--text-primary)' }}>{a.title}</div>
	                      {a.when && <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>{a.when}</div>}
	                    </div>
	                    {a.badge && (
	                      <div style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid var(--stroke)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontWeight: 750, fontSize: 12 }}>
	                        {a.badge}
	                      </div>
	                    )}
	                  </div>
	                </LiquidPanel>
	              ))}
	              {alarmItems.length === 0 && <div style={{ padding: 12, color: 'var(--text-muted)' }}>알림이 없습니다.</div>}
	            </div>
	          </div>
	        </div>
	      )}
	    </>
	  );
};

export default App;

type SettingsModalProps = {
  theme: 'light' | 'dark';
  currency: string;
  user: User | null;
  prefs: {
    timezone: string;
    monthStartMode: 'day1' | 'payday';
    paydayDay: number;
    budgetAlertEnabled: boolean;
    budgetAlertRate: number;
    monthEndReminderEnabled: boolean;
  };
  onClose: () => void;
  onChangeTheme: (t: 'light' | 'dark') => void;
  onChangeCurrency: (c: string) => Promise<void>;
  onSaveProfile: (patch: Partial<User>) => Promise<void>;
  onSavePrefs: (p: SettingsModalProps['prefs']) => void;
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  theme,
  currency,
  user,
  prefs,
  onClose,
  onChangeTheme,
  onChangeCurrency,
  onSaveProfile,
  onSavePrefs,
}) => {
  const [tab, setTab] = useState<'general' | 'theme' | 'data' | 'prefs' | 'notifications'>('general');
  const [name, setName] = useState(user?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setAvatarUrl(user?.avatar_url ?? '');
  }, [user?.avatar_url, user?.name]);

  const applyPrefs = async (next: SettingsModalProps['prefs']) => {
    setSavingPrefs(true);
    try {
      onSavePrefs(next);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleFile = async (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setAvatarUrl(reader.result);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content settingsModal">
        <div className="modal-header">
          <h3 className="modal-title">설정</h3>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
              <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
            </svg>
          </button>
        </div>

        <div className="settingsLayout">
          <div className="settingsNav">
            <button className={`settingsNavItem ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>일반</button>
            <button className={`settingsNavItem ${tab === 'theme' ? 'active' : ''}`} onClick={() => setTab('theme')}>테마</button>
            <button className={`settingsNavItem ${tab === 'prefs' ? 'active' : ''}`} onClick={() => setTab('prefs')}>통화/시간</button>
            <button className={`settingsNavItem ${tab === 'notifications' ? 'active' : ''}`} onClick={() => setTab('notifications')}>알림</button>
            <button className={`settingsNavItem ${tab === 'data' ? 'active' : ''}`} onClick={() => setTab('data')}>데이터</button>
          </div>

          <div className="settingsBody">
            {tab === 'general' && (
              <>
                <div className="settingsSectionTitle">프로필</div>
                <div className="form">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">이름</label>
                      <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름을 입력하세요" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">이메일</label>
                      <input className="form-input" value={user?.email ?? ''} readOnly />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">프로필 사진</label>
                    <div className="settingsAvatarRow">
                      <div className="settingsAvatarPreview" style={{ backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined }}>
                        {!avatarUrl && <span>{(name.trim() || user?.email || 'U').slice(0, 1).toUpperCase()}</span>}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input className="form-input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="이미지 URL 또는 파일 업로드" />
                        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
                      </div>
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={savingProfile}
                      onClick={async () => {
                        setSavingProfile(true);
                        try {
                          await onSaveProfile({ name: name.trim(), avatar_url: avatarUrl.trim() || null });
                          showAlert('저장되었습니다.');
                        } catch {
                          showAlert('저장에 실패했습니다.');
                        } finally {
                          setSavingProfile(false);
                        }
                      }}
                    >
                      {savingProfile ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {tab === 'theme' && (
              <>
                <div className="settingsSectionTitle">테마</div>
                <div className="settingsRadioGroup">
                  <label className="settingsRadio">
                    <input type="radio" name="theme" checked={theme === 'dark'} onChange={() => onChangeTheme('dark')} />
                    <span>다크</span>
                  </label>
                  <label className="settingsRadio">
                    <input type="radio" name="theme" checked={theme === 'light'} onChange={() => onChangeTheme('light')} />
                    <span>라이트</span>
                  </label>
                </div>
              </>
            )}

            {tab === 'prefs' && (
              <>
                <div className="settingsSectionTitle">통화 / 시간 / 월 시작일</div>
                <div className="form">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">기본 통화</label>
                      <select className="form-select" value={currency} onChange={(e) => void onChangeCurrency(e.target.value)}>
                        <option value="₩">KRW (₩)</option>
                        <option value="$">USD ($)</option>
                        <option value="¥">JPY (¥)</option>
                        <option value="€">EUR (€)</option>
                        <option value="£">GBP (£)</option>
                      </select>
                      <div className="panel-sub">기본 통화는 금액 표시에 사용됩니다.</div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">타임존</label>
                      <select
                        className="form-select"
                        value={prefs.timezone}
                        onChange={(e) => void applyPrefs({ ...prefs, timezone: e.target.value })}
                        disabled={savingPrefs}
                      >
                        <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                        <option value="UTC">UTC</option>
                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                        <option value="Europe/London">Europe/London</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">월 시작일 기준</label>
                      <select
                        className="form-select"
                        value={prefs.monthStartMode}
                        onChange={(e) => void applyPrefs({ ...prefs, monthStartMode: e.target.value === 'payday' ? 'payday' : 'day1' })}
                        disabled={savingPrefs}
                      >
                        <option value="day1">1일 기준</option>
                        <option value="payday">급여일 기준</option>
                      </select>
                      {prefs.monthStartMode === 'payday' && (
                        <div style={{ marginTop: 10 }}>
                          <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>급여일(일)</label>
                          <input
                            className="form-input"
                            type="number"
                            min={1}
                            max={31}
                            value={prefs.paydayDay}
                            onChange={(e) => void applyPrefs({ ...prefs, paydayDay: Math.max(1, Math.min(31, Number(e.target.value || 1))) })}
                            disabled={savingPrefs}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {tab === 'notifications' && (
              <>
                <div className="settingsSectionTitle">알림</div>
                <div className="form">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">예산 사용률 알림</label>
                      <div className="settingsSwitchRow">
                        <label className="settingsSwitch">
                          <input
                            type="checkbox"
                            checked={prefs.budgetAlertEnabled}
                            onChange={(e) => void applyPrefs({ ...prefs, budgetAlertEnabled: e.target.checked })}
                            disabled={savingPrefs}
                          />
                          <span>사용</span>
                        </label>
                        <select
                          className="form-select"
                          value={prefs.budgetAlertRate}
                          onChange={(e) => void applyPrefs({ ...prefs, budgetAlertRate: Math.max(0, Math.min(100, Number(e.target.value || 80))) })}
                          disabled={savingPrefs || !prefs.budgetAlertEnabled}
                        >
                          <option value={70}>70%</option>
                          <option value={80}>80%</option>
                          <option value={90}>90%</option>
                        </select>
                      </div>
                      <div className="panel-sub">알림 아이콘에서 확인할 수 있습니다.</div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">월말 정산 리마인드</label>
                      <div className="settingsSwitchRow">
                        <label className="settingsSwitch">
                          <input
                            type="checkbox"
                            checked={prefs.monthEndReminderEnabled}
                            onChange={(e) => void applyPrefs({ ...prefs, monthEndReminderEnabled: e.target.checked })}
                            disabled={savingPrefs}
                          />
                          <span>사용</span>
                        </label>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => showAlert('이메일 전송은 추후 지원합니다.')}>
                          이메일 설정
                        </button>
                      </div>
                      <div className="panel-sub">이메일 전송 기능은 추후 지원합니다.</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {tab === 'data' && (
              <>
                <div className="settingsSectionTitle">데이터 내보내기</div>
                <div className="panel-sub">CSV/JSON/TXT/Excel 내보내기는 추후 지원합니다.</div>
                <div className="settingsExportGrid">
                  {['CSV', 'JSON', 'TXT', 'Excel'].map((t) => (
                    <button key={t} type="button" className="btn btn-ghost" onClick={() => showAlert('준비 중인 기능입니다.')}>
                      {t} 내보내기
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
