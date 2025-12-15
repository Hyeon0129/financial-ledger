import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Account, Budget, Category, MonthlyStats, SavingsGoal, Transaction } from '../../api';
import { formatCurrency, formatDate, formatDateShort } from '../../api';
import { LiquidPanel } from '../common/LiquidPanel';
import type { View } from '../common/utils';
import { deriveBill, dueDateForMonth, loadBills } from './billsStore';
import { creditCardCycleRange, isoInMonth, loadAccountMeta } from './accountMetaStore';

interface DashboardViewProps {
  stats: MonthlyStats | null;
  prevStats: MonthlyStats | null;
  transactions: Transaction[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  categories: Category[];
  accounts: Account[];
  yearlyStats?: { year: number; monthlyTrend: Array<{ month: string; type: string; total: number }> } | null;
  currency: string;
  month: string;
  onNavigate: (v: View) => void;
}

type TrendDir = 'up' | 'down';

function getDelta(curr: number, prev: number) {
  if (!prev) return { val: 0, pct: 0 };
  const diff = curr - prev;
  return { val: diff, pct: (diff / prev) * 100 };
}

type BillsPreviewStatus = 'paid' | 'scheduled';
type BillsPreviewGroupKey = 'subscription' | 'living' | 'utility' | 'custom' | 'card';
type BillsPreviewItem = {
  id: string;
  name: string;
  dueDate: string;
  amount: number;
  status: BillsPreviewStatus;
  statusLabel: 'Paid' | 'Scheduled';
  group: BillsPreviewGroupKey;
  groupLabel?: string | null;
};

type BillsPreviewGroup = { groupKey: BillsPreviewGroupKey; groupTitle: string; items: BillsPreviewItem[] };

const TrendPill: React.FC<{ dir: TrendDir; pct: number }> = ({ dir, pct }) => (
  <span className={`trend ${dir}`}>
    <i className={`ph ${dir === 'up' ? 'ph-trend-up' : 'ph-trend-down'}`} />
    {dir === 'up' ? '+' : '-'}
    {Math.abs(pct).toFixed(2)}%
  </span>
);

const SmallKpiCard: React.FC<{
  title: string;
  value: React.ReactNode;
  trendPct?: number;
  trendDir?: TrendDir;
  children?: React.ReactNode;
}> = ({ title, value, trendPct, trendDir, children }) => (
  <LiquidPanel className="interactive dash-kpiCard">
    <div className="dash-kpiTitle">{title}</div>
    <div className="dash-kpiValue">{value}</div>
    <div className="dash-kpiSub">
      {typeof trendPct === 'number' && trendDir ? <TrendPill dir={trendDir} pct={trendPct} /> : <span />}
      <span className="dash-kpiSubText">vs last month</span>
    </div>
    {children}
  </LiquidPanel>
);

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  prevStats,
  transactions,
  accounts,
  budgets,
  categories,
  yearlyStats,
  currency,
  month,
  onNavigate,
}) => {
  const income = stats?.income ?? 0;
  const expense = stats?.expense ?? 0;
  const balance = stats?.balance ?? 0;
  const txCount = stats?.transactionCount ?? 0;

  const incomeDelta = getDelta(income, prevStats?.income ?? 0);
  const expenseDelta = getDelta(expense, prevStats?.expense ?? 0);
  const balanceDelta = getDelta(balance, prevStats?.balance ?? 0);

  const hasBudgetUsage = (stats?.budgetUsage?.length ?? 0) > 0;
  const budgetUsageTotal = (stats?.budgetUsage ?? []).reduce((sum, b) => sum + (b.budget_amount ?? 0), 0);
  const budgetUsageSpent = (stats?.budgetUsage ?? []).reduce((sum, b) => sum + (b.spent ?? 0), 0);

  const totalBudget = hasBudgetUsage
    ? budgetUsageTotal
    : budgets.filter((b) => b.month === month).reduce((sum, b) => sum + b.amount, 0);
  const budgetSpent = hasBudgetUsage ? budgetUsageSpent : expense;
  const budgetProgress = totalBudget > 0 ? (budgetSpent / totalBudget) * 100 : 0;
  const budgetRemaining = Math.max(0, totalBudget - budgetSpent);

  const totalAssets = useMemo(() => accounts.reduce((sum, acc) => sum + (acc.balance ?? 0), 0), [accounts]);

  const categoryData = useMemo(() => {
    if (!stats?.byCategory) return [];
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const rootOf = (id: string): Category | null => {
      let cur = catMap.get(id) ?? null;
      let guard = 0;
      while (cur?.parent_id && guard < 20) {
        const next = catMap.get(cur.parent_id);
        if (!next) break;
        cur = next;
        guard += 1;
      }
      return cur;
    };

    const totals = new Map<string, { name: string; color: string; value: number }>();
    for (const row of stats.byCategory) {
      if (row.type !== 'expense') continue;
      if (!row.total || row.total <= 0) continue;
      if (!row.category_id || row.category_id === 'uncat') continue;
      const root = rootOf(row.category_id);
      const key = root?.id ?? row.category_id;
      const name = root?.name ?? row.category_name;
      const color = root?.color ?? row.category_color ?? 'var(--accent-orange)';
      const cur = totals.get(key) ?? { name, color, value: 0 };
      cur.value += row.total;
      totals.set(key, cur);
    }

    const items = Array.from(totals.values()).sort((a, b) => b.value - a.value);
    const total = items.reduce((sum, c) => sum + c.value, 0) || 1;
    return items.slice(0, 12).map((c) => ({
      name: c.name,
      value: c.value,
      pct: (c.value / total) * 100,
      color: c.color || 'var(--accent-orange)',
    }));
  }, [categories, stats]);

  const largestCategoryPct = categoryData[0]?.pct ?? 0;

  const [range, setRange] = useState<'7D' | '30D' | 'YTD'>('7D');

  const dailyTotals = useMemo(() => {
    if (!stats) return new Map<string, { income: number; expense: number }>();
    const map = new Map<string, { income: number; expense: number }>();
    for (const row of stats.dailyTrend) {
      const curr = map.get(row.date) ?? { income: 0, expense: 0 };
      if (row.type === 'income') curr.income = row.total;
      else curr.expense = row.total;
      map.set(row.date, curr);
    }
    return map;
  }, [stats]);

  const expenseChartData = useMemo(() => {
    if (!stats) return [] as Array<{ name: string; value: number }>;

    const [yy, mm] = month.split('-').map(Number);
    const daysInMonth = new Date(yy, mm, 0).getDate();

    const getISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (range === 'YTD') {
      const map = new Map<string, number>();
      for (const row of yearlyStats?.monthlyTrend ?? []) {
        if (row.type !== 'expense') continue;
        map.set(row.month, row.total);
      }

      return Array.from({ length: 12 }).map((_, i) => {
        const key = `${yy}-${String(i + 1).padStart(2, '0')}`;
        const val = map.get(key) ?? 0;
        const name = new Date(yy, i, 1).toLocaleDateString('en-US', { month: 'short' });
        return { name, value: val };
      });
    }

    if (range === '30D') {
      return Array.from({ length: daysInMonth }).map((_, idx) => {
        const day = idx + 1;
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        const totals = dailyTotals.get(dateStr) ?? { income: 0, expense: 0 };
        return { name: String(day), value: totals.expense };
      });
    }

    // 7D (Mon..Sun)
    const end = new Date(yy, mm - 1, daysInMonth);
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === yy && now.getMonth() + 1 === mm;
    const endDate = isCurrentMonth ? new Date(yy, mm - 1, Math.min(now.getDate(), daysInMonth)) : end;

    const dayOfWeek = endDate.getDay(); // 0 Sun ... 6 Sat
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(endDate);
    monday.setDate(endDate.getDate() - diffToMonday);

    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      const iso = getISO(d);
      const totals = dailyTotals.get(iso) ?? { income: 0, expense: 0 };
      const name = d.toLocaleDateString('en-US', { weekday: 'short' });
      return { name, value: totals.expense };
    });
  }, [dailyTotals, month, range, stats, yearlyStats?.monthlyTrend]);

  const renderSpeedometer = (progressPct: number) => {
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    const pct = clamp(progressPct);
    const ticks = 32;
    const filled = Math.round((pct / 100) * ticks);
    const centerX = 130;
    const centerY = 140;
    const rOuter = 96;
    const rInner = 82;
    const needleR = 74;
    const angleForTick = (i: number) => Math.PI - (Math.PI * i) / (ticks - 1); // pi..0

    const needleAngle = Math.PI - (Math.PI * pct) / 100;
    const needleX = centerX + Math.cos(needleAngle) * needleR;
    const needleY = centerY - Math.sin(needleAngle) * needleR;

    return (
      <div className="dash-speedoWrap" aria-label={`Monthly limit ${pct.toFixed(0)}%`}>
        <svg className="dash-speedo" viewBox="0 0 260 170" role="img" aria-hidden="true">
          <path
            d="M34,140 A96,96 0 0 1 226,140"
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="14"
            strokeLinecap="round"
          />

          {Array.from({ length: ticks }).map((_, i) => {
            const a = angleForTick(i);
            const x1 = centerX + Math.cos(a) * rInner;
            const y1 = centerY - Math.sin(a) * rInner;
            const x2 = centerX + Math.cos(a) * rOuter;
            const y2 = centerY - Math.sin(a) * rOuter;
            const isActive = i < filled;
            const hue = 120 - (120 * i) / (ticks - 1);
            const stroke = isActive ? `hsl(${hue} 90% 55%)` : 'rgba(255,255,255,0.16)';
            const strokeWidth = i % 4 === 0 ? 3 : 2;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            );
          })}

          <line
            x1={centerX}
            y1={centerY}
            x2={needleX}
            y2={needleY}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={centerX} cy={centerY} r="6" fill="rgba(255,255,255,0.85)" />
        </svg>
      </div>
    );
  };

  const recentExpensesAll = useMemo(() => {
    return [...transactions]
      .filter((t) => t.type === 'expense' && t.date.startsWith(month))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, month]);
  const recentPageSize = 10;
  const [recentPageByMonth, setRecentPageByMonth] = useState<Record<string, number>>({});
  const recentPage = recentPageByMonth[month] ?? 1;
  const setRecentPage = (updater: number | ((prev: number) => number)) => {
    setRecentPageByMonth((prev) => {
      const prevValue = prev[month] ?? 1;
      const nextValue = typeof updater === 'function' ? updater(prevValue) : updater;
      if (nextValue === prevValue) return prev;
      return { ...prev, [month]: nextValue };
    });
  };
  const recentTotalPages = Math.max(1, Math.ceil(recentExpensesAll.length / recentPageSize));
  const recentPageSafe = Math.min(recentTotalPages, Math.max(1, recentPage));
  const recentPageItems = recentExpensesAll.slice(
    (recentPageSafe - 1) * recentPageSize,
    recentPageSafe * recentPageSize,
  );

  const billsPreview = useMemo((): BillsPreviewGroup[] => {
    const recurring = loadBills();
    const txMemoSet = new Set(transactions.map((t) => (t.memo_raw ?? t.memo ?? '')));

    const formatLocalISO = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const addDaysISO = (iso: string, days: number) => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      const base = new Date(Date.UTC(yy, mm - 1, dd));
      base.setUTCDate(base.getUTCDate() + days);
      return base.toISOString().slice(0, 10);
    };

    const todayISO = formatLocalISO(new Date());
    const dayMinus1 = addDaysISO(todayISO, -1);
    const dayMinus2 = addDaysISO(todayISO, -2);
    const nowMonth = todayISO.slice(0, 7);

    const showPaid = (dueDate: string) => dueDate === todayISO || dueDate === dayMinus1 || dueDate === dayMinus2;

    const billItems: BillsPreviewItem[] = recurring
      .filter((b) => !!dueDateForMonth(b, month))
      .map((b) => {
        const base = deriveBill(b, month, accounts);
        const memo = base.id && base.dueDate ? `AUTO_BILL|${base.id}|${base.dueDate}` : '';
        const paidByTx = memo && txMemoSet.has(memo);
        const status: BillsPreviewStatus = paidByTx || base.status === 'paid' ? 'paid' : 'scheduled';
        return {
          id: base.id,
          name: base.name,
          dueDate: base.dueDate,
          amount: base.amount,
          status,
          statusLabel: (status === 'paid' ? 'Paid' : 'Scheduled') as 'Paid' | 'Scheduled',
          group: base.group as BillsPreviewGroupKey,
          groupLabel: base.groupLabel ?? null,
        };
      })
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

    const meta = loadAccountMeta();

    const cardItems: BillsPreviewItem[] = accounts
      .map((a) => {
        const m = meta[a.id];
        if (!m || m.kind !== 'credit_card') return null;
        const dueDate = isoInMonth(month, Number(m.paymentDay) || 1);
        const cycle = creditCardCycleRange(month, m);
        const amount = transactions
          .filter((t) => t.type === 'expense' && t.account_id === a.id && t.date >= cycle.start && t.date <= cycle.end)
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        if (amount <= 0) return null;
        const memo = `AUTO_CARD|${a.id}|${month}|${dueDate}`;
        const paidByTx = txMemoSet.has(memo);
        const status: BillsPreviewStatus =
          paidByTx
            ? 'paid'
            : month < nowMonth
              ? 'paid'
              : month > nowMonth
                ? 'scheduled'
                : todayISO < dueDate
                  ? 'scheduled'
                  : 'paid';
        return {
          id: `card:${a.id}`,
          name: a.name,
          dueDate,
          amount,
          status,
          statusLabel: (status === 'paid' ? 'Paid' : 'Scheduled') as 'Paid' | 'Scheduled',
          group: 'card',
          groupLabel: null,
        };
      })
      .filter(Boolean) as BillsPreviewItem[];

    const allItems = [...billItems, ...cardItems];
    const candidates = allItems.filter((b) => b.status !== 'paid' || showPaid(b.dueDate));

    const groupOrder: BillsPreviewGroupKey[] = ['living', 'utility', 'subscription', 'custom', 'card'];
    const groupTitle = (g: BillsPreviewGroupKey, customLabel?: string | null) => {
      if (g === 'subscription') return '구독';
      if (g === 'living') return '생활비';
      if (g === 'utility') return '공과금';
      if (g === 'card') return '카드대금';
      return customLabel?.trim() || '기타';
    };

    const byGroup = new Map<BillsPreviewGroupKey, BillsPreviewItem[]>();
    for (const g of groupOrder) byGroup.set(g, []);
    for (const b of candidates) {
      byGroup.get(b.group)?.push(b);
    }

    const maxTotal = 12;
    const maxPerGroup = 4;
    const selected: BillsPreviewGroup[] = [];
    let remaining = maxTotal;
    for (const g of groupOrder) {
      if (remaining <= 0) break;
      const items = (byGroup.get(g) ?? []).slice(0, Math.min(maxPerGroup, remaining));
      if (items.length === 0) continue;
      selected.push({ groupKey: g, groupTitle: groupTitle(g, items[0]?.groupLabel), items });
      remaining -= items.length;
    }

    return selected;
  }, [accounts, month, transactions]);
  const netChange = income - expense;
  const prevNetChange = (prevStats?.income ?? 0) - (prevStats?.expense ?? 0);
  const netChangeDelta = getDelta(netChange, prevNetChange);

  if (!stats) return <div className="loading-spinner" />;

  return (
    <div className="dashboard-layout">
      <LiquidPanel className="interactive dash-chartPanel">
        <div className="dash-chartHeader">
          <div className="dash-chartTitle">Expense Trend</div>
          <div className="dash-rangeTabs" role="tablist" aria-label="Range">
            {(['7D', '30D', 'YTD'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`dash-rangeTab ${range === k ? 'active' : ''}`}
                onClick={() => setRange(k)}
                role="tab"
                aria-selected={range === k}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="dash-chartWrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={expenseChartData} margin={{ top: 18, right: 18, left: 10, bottom: 8 }}>
              <defs>
                <linearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-expense-fill-1)" />
                  <stop offset="95%" stopColor="var(--chart-expense-fill-2)" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 10" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                minTickGap={8}
                interval={range === '30D' ? 'preserveStartEnd' : 0}
                padding={{ left: 14, right: 14 }}
                tickMargin={10}
                tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1 }}
                contentStyle={{
                  background: 'rgba(10, 12, 16, 0.92)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 14,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
                  color: 'rgba(255,255,255,0.92)',
                }}
                labelStyle={{
                  color: 'rgba(255,255,255,0.78)',
                  fontWeight: 750,
                  marginBottom: 6,
                }}
                itemStyle={{
                  color: 'rgba(255,255,255,0.92)',
                  fontWeight: 750,
                }}
                formatter={(val: unknown) => formatCurrency(Number(val) || 0, currency)}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--chart-expense-stroke)"
                strokeWidth={3}
                fill="url(#expenseArea)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: 'rgba(12, 12, 14, 0.95)',
                  stroke: 'var(--chart-expense-dot-stroke)',
                  strokeWidth: 3,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </LiquidPanel>

      <div className="dash-kpiGrid">
        <SmallKpiCard
          title="Total Asset"
          value={formatCurrency(totalAssets, currency)}
          trendDir={balanceDelta.pct >= 0 ? 'up' : 'down'}
          trendPct={balanceDelta.pct}
        />
        <SmallKpiCard
          title="Total Revenue"
          value={formatCurrency(income, currency)}
          trendDir={incomeDelta.pct >= 0 ? 'up' : 'down'}
          trendPct={incomeDelta.pct}
        />
        <SmallKpiCard
          title="Total Expense"
          value={formatCurrency(expense, currency)}
          trendDir={expenseDelta.pct >= 0 ? 'up' : 'down'}
          trendPct={expenseDelta.pct}
        />
        <SmallKpiCard
          title="Net Change"
          value={formatCurrency(netChange, currency)}
          trendDir={netChangeDelta.pct >= 0 ? 'up' : 'down'}
          trendPct={netChangeDelta.pct}
        />
        <SmallKpiCard title="Budget Left" value={formatCurrency(budgetRemaining, currency)} trendDir="up" trendPct={0} />
        <SmallKpiCard title="Transactions" value={txCount} trendDir="up" trendPct={0} />
      </div>

      <LiquidPanel className="interactive dash-limitPanel">
        <div className="dash-subHeader">
          <div className="dash-subTitle">Monthly Limit</div>
          <div className="dash-limitHeaderRight">
            <div className="dash-limitLabel">Budget Left</div>
            <div className="dash-limitValue">{formatCurrency(budgetRemaining, currency)}</div>
          </div>
        </div>
        <div className="dash-limitBody">
          <div className="dash-limitGauge">{renderSpeedometer(budgetProgress)}</div>
          <div className="dash-limitPct">{Math.round(Math.max(0, Math.min(100, budgetProgress)))}%</div>
        </div>
      </LiquidPanel>

      <LiquidPanel className="interactive dash-activityPanel">
        <div className="dash-subHeader">
          <div className="dash-subTitle">Recent Spending</div>
          <button className="dash-linkBtn" type="button" onClick={() => onNavigate('transactions')}>
            View details
          </button>
        </div>
        <div className="dash-activityGrid">
          <div className="dash-recentTableWrap">
            <div className="dash-recentScroll">
              <div className="dash-recentHead">
                <div className="dash-recentColDate">날짜</div>
                <div className="dash-recentColCat">카테고리</div>
                <div className="dash-recentColAmt">금액</div>
                <div className="dash-recentColAcc">계좌</div>
                <div className="dash-recentColMemo">메모</div>
              </div>
              <div className="dash-recentBody">
                {recentPageItems.map((t) => (
                  <div key={t.id} className="dash-recentRow">
                    <div className="dash-recentColDate">{formatDate(t.date)}</div>
                    <div className="dash-recentColCat">
                      <span className="dash-recentDot" style={{ background: t.category_color || 'rgba(255,255,255,0.18)' }} />
                      <span className="dash-recentCatName">{t.category_name || 'Uncategorized'}</span>
                    </div>
                    <div className="dash-recentColAmt">{formatCurrency(t.amount, currency)}</div>
                    <div className="dash-recentColAcc">{t.account_name || '-'}</div>
                    <div className="dash-recentColMemo">{t.memo || '-'}</div>
                  </div>
                ))}
                {recentExpensesAll.length === 0 && <div className="dash-empty">No expenses</div>}
              </div>
            </div>
            <div className="dash-recentPager" aria-label="Recent spending pagination">
              <button
                className="dash-pagerBtn"
                type="button"
                onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                disabled={recentPageSafe <= 1}
                aria-label="Previous"
              >
                ‹
              </button>
              <span className="dash-pagerText">
                {recentPageSafe}/{recentTotalPages}
              </span>
              <button
                className="dash-pagerBtn"
                type="button"
                onClick={() => setRecentPage((p) => Math.min(recentTotalPages, p + 1))}
                disabled={recentPageSafe >= recentTotalPages}
                aria-label="Next"
              >
                ›
              </button>
            </div>
          </div>

          <div className="dash-donutBox">
            <div className="dash-subHeader" style={{ marginBottom: 10 }}>
              <div className="dash-subTitle">By Category</div>
              <div className="dash-subHint">expenses</div>
            </div>
            <div className="dash-donutWrap">
              <div className="dash-donutChart">
	                <ResponsiveContainer width="100%" height="100%">
	                  <PieChart>
	                    <Pie
	                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="70%"
                      outerRadius="92%"
                      paddingAngle={3}
                      stroke="rgba(255,255,255,0.10)"
                      strokeWidth={1}
                    >
	                      {categoryData.map((entry, idx) => (
	                        <Cell key={idx} fill={entry.color} />
	                      ))}
	                    </Pie>
	                    <Tooltip
	                      cursor={false}
	                      content={({ active, payload }) => {
	                        const p = payload?.[0]?.payload as { name?: string; value?: number; pct?: number } | undefined;
	                        if (!active || !p) return null;
	                        return (
	                          <div
	                            style={{
	                              background: 'rgba(10, 12, 16, 0.92)',
	                              border: '1px solid rgba(255,255,255,0.12)',
	                              borderRadius: 14,
	                              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
	                              padding: '10px 12px',
	                              color: 'rgba(255,255,255,0.92)',
	                              fontSize: 12,
	                              fontWeight: 750,
	                            }}
	                          >
	                            <div style={{ marginBottom: 6, color: 'rgba(255,255,255,0.80)', fontWeight: 800 }}>
	                              {p.name ?? '-'}
	                            </div>
	                            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
	                              <span>{formatCurrency(Number(p.value) || 0, currency)}</span>
	                              <span style={{ color: 'rgba(255,255,255,0.66)', fontWeight: 750 }}>
	                                {(Number(p.pct) || 0).toFixed(0)}%
	                              </span>
	                            </div>
	                          </div>
	                        );
	                      }}
	                    />
	                  </PieChart>
	                </ResponsiveContainer>
                <div className="dash-donutCenter">
                  <div className="dash-donutPct">{largestCategoryPct.toFixed(0)}%</div>
                  <div className="dash-donutLabel">top category</div>
                </div>
              </div>
              <div className="dash-donutLegend">
                {categoryData.map((c) => (
                  <div key={c.name} className="dash-legendRow">
                    <span className="dash-legendDot" style={{ background: c.color }} />
                    <span className="dash-legendName">{c.name}</span>
                    <span className="dash-legendPct">{c.pct.toFixed(0)}%</span>
                  </div>
                ))}
                {categoryData.length === 0 && <div className="dash-empty">No data</div>}
              </div>
            </div>
          </div>
        </div>
      </LiquidPanel>

      <LiquidPanel className="interactive dash-billsPanel">
        <div className="dash-billsHeader">
          <div className="dash-subTitle">Bill &amp; Payment</div>
          <button className="dash-linkBtn" type="button" onClick={() => onNavigate('bills')}>
            View All
          </button>
        </div>

        <div className="dash-billsBody">
          {billsPreview.map((g) => (
            <div key={g.groupKey} className="dash-billGroup">
              <div className="dash-billGroupTitle">{g.groupTitle}</div>
              <div className="dash-billRows">
                {g.items.map((b) => (
                  <div key={b.id} className="dash-billItem">
                    <div className="dash-billItemName">{b.name}</div>
                    <div className="dash-billItemDue">{formatDateShort(b.dueDate)}</div>
                    <div className="dash-billItemAmount">{formatCurrency(b.amount, currency)}</div>
                    <div className={`dash-billItemStatus ${b.status}`}>{b.statusLabel}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {billsPreview.length === 0 && <div className="dash-empty">No bills</div>}
        </div>
      </LiquidPanel>
    </div>
  );
};
