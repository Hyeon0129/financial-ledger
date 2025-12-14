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
import { formatCurrency, formatDateShort } from '../../api';
import { LiquidPanel } from '../common/LiquidPanel';
import { AccountCard } from '../common/AccountCard';
import type { View } from '../common/utils';

interface DashboardViewProps {
  stats: MonthlyStats | null;
  prevStats: MonthlyStats | null;
  transactions: Transaction[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  categories: Category[];
  accounts: Account[];
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

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  prevStats,
  transactions,
  accounts,
  budgets,
  savingsGoals,
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

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const budgetProgress = totalBudget > 0 ? (expense / totalBudget) * 100 : 0;
  const budgetRemaining = Math.max(0, totalBudget - expense);
  const prevBudgetProgress = totalBudget > 0 ? ((prevStats?.expense ?? 0) / totalBudget) * 100 : 0;
  const budgetProgressDelta = getDelta(budgetProgress, prevBudgetProgress);

  const totalAssets = useMemo(() => accounts.reduce((sum, acc) => sum + (acc.balance ?? 0), 0), [accounts]);

  const monthlySpendByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(month))
      .forEach((t) => {
        if (!t.account_id) return;
        map[t.account_id] = (map[t.account_id] ?? 0) + t.amount;
      });
    return map;
  }, [transactions, month]);

  const recentExpenseTx = useMemo(() => transactions.filter((t) => t.type === 'expense').slice(0, 5), [transactions]);

  const categoryData = useMemo(() => {
    if (!stats?.byCategory) return [];
    const items = stats.byCategory
      .filter((c) => c.total > 0 && c.type === 'expense')
      .sort((a, b) => b.total - a.total);
    const total = items.reduce((sum, c) => sum + c.total, 0) || 1;
    return items.slice(0, 5).map((c) => ({
      name: c.category_name,
      value: c.total,
      pct: (c.total / total) * 100,
      color: c.category_color || 'var(--accent-orange)',
    }));
  }, [stats]);

  const largestCategoryPct = categoryData[0]?.pct ?? 0;

  const [range, setRange] = useState<'24H' | '7D' | '30D' | 'YTD'>('7D');
  const rangeDays = range === '24H' ? 1 : range === '7D' ? 7 : range === '30D' ? 30 : 365;

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

  const assetTrendData = useMemo(() => {
    if (!stats) return [];
    const [yy, mm] = month.split('-').map(Number);
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === yy && now.getMonth() + 1 === mm;
    const endDay = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
    const startDay = Math.max(1, endDay - rangeDays + 1);

    let cumulative = 0;
    const out: Array<{ name: string; value: number }> = [];
    for (let day = startDay; day <= endDay; day++) {
      const dateStr = `${month}-${String(day).padStart(2, '0')}`;
      const totals = dailyTotals.get(dateStr) ?? { income: 0, expense: 0 };
      cumulative += totals.income - totals.expense;
      const label =
        rangeDays <= 7
          ? new Date(yy, mm - 1, day).toLocaleDateString('en-US', { weekday: 'short' })
          : String(day);
      out.push({ name: label, value: cumulative });
    }
    return out;
  }, [dailyTotals, month, rangeDays, stats]);

  const TrendPill: React.FC<{ dir: TrendDir; pct: number }> = ({ dir, pct }) => (
    <span className={`trend ${dir}`}>
      <i className={`ph ${dir === 'up' ? 'ph-trend-up' : 'ph-trend-down'}`} />
      {dir === 'up' ? '+' : '-'}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );

  const renderRangeBar = (progressPct: number) => {
    const segments = 52;
    const filled = Math.min(segments, Math.round((progressPct / 100) * segments));
    return (
      <div className="limit-range">
        <div className="limit-range-label">52 week range</div>
        <div className="limit-range-bar" aria-hidden="true">
          {Array.from({ length: segments }).map((_, i) => {
            const isActive = i < filled;
            const hue = 10 + (110 * i) / (segments - 1); // red -> green
            const activeColor = `hsl(${hue} 90% 55%)`;
            return (
              <span
                key={i}
                className={`limit-tick ${isActive ? 'active' : ''}`}
                style={isActive ? { background: activeColor } : undefined}
              />
            );
          })}
        </div>
      </div>
    );
  };

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
        <span className="dash-kpiSubText">from last month</span>
      </div>
      {children}
    </LiquidPanel>
  );

  if (!stats) return <div className="loading-spinner" />;

  return (
    <div className="dashboard-layout">
      <LiquidPanel className="interactive dash-mainPanel">
        <div className="dash-mainHeader">
          <div className="dash-mainTitleBlock">
            <div className="dash-mainTitle">Total Asset Value</div>
            <div className="dash-mainValueRow">
              <div className="dash-mainValue">{formatCurrency(totalAssets, currency)}</div>
              <TrendPill dir={balanceDelta.pct >= 0 ? 'up' : 'down'} pct={balanceDelta.pct} />
            </div>
          </div>
          <div className="dash-rangeTabs" role="tablist" aria-label="Range">
            {(['24H', '7D', '30D', 'YTD'] as const).map((k) => (
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
            <AreaChart data={assetTrendData} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="assetArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(178, 109, 255, 0.35)" />
                  <stop offset="95%" stopColor="rgba(178, 109, 255, 0.00)" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1 }}
                contentStyle={{
                  backgroundColor: 'rgba(10, 12, 16, 0.92)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  borderRadius: 14,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
                  color: '#fff',
                }}
                formatter={(val: number) => formatCurrency(val, currency)}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="rgba(205, 130, 255, 0.95)"
                strokeWidth={3}
                fill="url(#assetArea)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="dash-divider" />

        <div className="dash-bottomGrid">
          <div className="dash-recentBox">
            <div className="dash-subHeader">
              <div className="dash-subTitle">Recent Spending</div>
              <button className="dash-linkBtn" type="button" onClick={() => onNavigate('transactions')}>
                View details
              </button>
            </div>
            <div className="dash-miniTable">
              {recentExpenseTx.map((t) => (
                <div key={t.id} className="dash-miniRow">
                  <div className="dash-miniLeft">
                    <div className="dash-miniIcon">{t.category_name?.[0] ?? '?'}</div>
                    <div className="dash-miniMeta">
                      <div className="dash-miniName">{t.category_name || 'Uncategorized'}</div>
                      <div className="dash-miniDate">{formatDateShort(t.date)}</div>
                    </div>
                  </div>
                  <div className="dash-miniRight">
                    <div className="dash-miniAmount">{formatCurrency(t.amount, currency)}</div>
                  </div>
                </div>
              ))}
              {recentExpenseTx.length === 0 && <div className="dash-empty">No expenses</div>}
            </div>
          </div>

          <div className="dash-donutBox">
            <div className="dash-subHeader">
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
                      innerRadius="68%"
                      outerRadius="88%"
                      paddingAngle={3}
                      stroke="rgba(0,0,0,0)"
                    >
                      {categoryData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
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

      <div className="dash-kpiGrid">
        <SmallKpiCard
          title="Total Revenue"
          value={formatCurrency(income, currency)}
          trendDir={incomeDelta.pct >= 0 ? 'up' : 'down'}
          trendPct={incomeDelta.pct}
        />
        <SmallKpiCard
          title="Total Expense"
          value={formatCurrency(expense, currency)}
          trendDir={expenseDelta.pct <= 0 ? 'up' : 'down'}
          trendPct={expenseDelta.pct}
        />
        <SmallKpiCard
          title="Net Growth"
          value={formatCurrency(balance, currency)}
          trendDir={balanceDelta.pct >= 0 ? 'up' : 'down'}
          trendPct={balanceDelta.pct}
        />
        <SmallKpiCard title="Transactions" value={txCount} trendDir="up" trendPct={0} />
        <SmallKpiCard
          title="Budget Left"
          value={formatCurrency(budgetRemaining, currency)}
          trendDir={expenseDelta.pct <= 0 ? 'up' : 'down'}
          trendPct={expenseDelta.pct}
        />
        <SmallKpiCard
          title="Monthly Limit"
          value={`${Math.round(budgetProgress)}%`}
          trendDir={budgetProgressDelta.pct <= 0 ? 'up' : 'down'}
          trendPct={budgetProgressDelta.pct}
        >
          <div className="dash-kpiExtra">{renderRangeBar(budgetProgress)}</div>
        </SmallKpiCard>
      </div>

      <LiquidPanel className="interactive dash-cardsPanel">
        <div className="dash-subHeader">
          <div className="dash-subTitle">My Cards</div>
          <button className="dash-linkBtn" type="button" onClick={() => onNavigate('accounts')}>
            Manage
          </button>
        </div>
        {accounts.length > 0 ? (
          <div className="accounts-grid">
            {accounts.map((acc, idx) => (
              <AccountCard
                key={acc.id}
                account={acc}
                index={idx}
                currency={currency}
                monthlySpend={monthlySpendByAccount[acc.id] ?? 0}
              />
            ))}
          </div>
        ) : (
          <div className="dash-empty">No accounts added.</div>
        )}
      </LiquidPanel>

      <LiquidPanel className="interactive dash-goalsPanel">
        <div className="dash-subHeader">
          <div className="dash-subTitle">Saving Goals</div>
          <button className="dash-linkBtn" type="button" onClick={() => onNavigate('savings')}>
            View
          </button>
        </div>
        <div className="dash-goalsList">
          {savingsGoals.slice(0, 3).map((g) => {
            const progress = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
            return (
              <div key={g.id} className="dash-goalRow">
                <div className="dash-goalTop">
                  <div className="dash-goalName">{g.name}</div>
                  <div className="dash-goalPct">{progress.toFixed(0)}%</div>
                </div>
                <div className="dash-goalAmounts">
                  <span>{formatCurrency(g.current_amount, currency)}</span>
                  <span className="dash-goalSep">/</span>
                  <span className="dash-goalTarget">{formatCurrency(g.target_amount, currency)}</span>
                </div>
                <div className="dash-goalTrack">
                  <div className="dash-goalFill" style={{ width: `${progress}%`, background: g.color || 'var(--accent-purple)' }} />
                </div>
              </div>
            );
          })}
          {savingsGoals.length === 0 && <div className="dash-empty">No goals</div>}
        </div>
      </LiquidPanel>
    </div>
  );
};

