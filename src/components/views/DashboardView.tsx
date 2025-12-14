import React, { useMemo } from 'react';
import {
  BarChart, Bar, CartesianGrid, XAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import type {
  Transaction, Category, Account, Budget, SavingsGoal, MonthlyStats
} from '../../api';
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

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  stats, 
  prevStats, 
  transactions, 
  accounts,
  budgets,
  currency, 
  month,
  onNavigate
}) => {
  // --- Data Logic ---
  const income = stats?.income ?? 0;
  const expense = stats?.expense ?? 0;
  const balance = stats?.balance ?? 0;
  const txCount = stats?.transactionCount ?? 0;
  
  // Delta
  const getDelta = (curr: number, prev: number) => {
    if (!prev) return { val: 0, pct: 0 };
    const diff = curr - prev;
    const pct = (diff / prev) * 100;
    return { val: diff, pct };
  };
  const incomeDelta = getDelta(income, prevStats?.income ?? 0);
  const expenseDelta = getDelta(expense, prevStats?.expense ?? 0);
  const balanceDelta = getDelta(balance, prevStats?.balance ?? 0);

  // Budget Logic
  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const budgetProgress = totalBudget > 0 ? (expense / totalBudget) * 100 : 0;
  const budgetRemaining = Math.max(0, totalBudget - expense);

  // --- Chart Data ---
  const chartData = useMemo(() => {
    if (!stats) return [];
    const daysInMonth = new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0).getDate();
    const data = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${month}-${String(i).padStart(2, '0')}`;
      const inc = stats.dailyTrend.find(d => d.date === dateStr && d.type === 'income')?.total || 0;
      const exp = stats.dailyTrend.find(d => d.date === dateStr && d.type === 'expense')?.total || 0;
      data.push({ name: String(i), Income: inc, Expense: exp });
    }
    return data;
  }, [stats, month]);

  const categoryData = useMemo(() => {
    if (!stats?.byCategory) return [];
    return stats.byCategory
      .filter(c => c.total > 0 && c.type === 'expense')
      .slice(0, 5)
      .map(c => ({ 
        name: c.category_name, 
        value: c.total, 
        color: c.category_color || 'var(--accent-orange)' 
      }));
  }, [stats]);

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




  if (!stats) return <div className="loading-spinner" />;

  type TrendDir = 'up' | 'down';
  type KPICardProps = {
    title: string;
    value: React.ReactNode;
    iconPath: string;
    trend: TrendDir;
    trendPct: number;
    intent?: 'good' | 'bad' | 'neutral';
  };

  const KPICard: React.FC<KPICardProps> = ({ title, value, iconPath, trend, trendPct, intent }) => {
    const pctText = `${Math.abs(trendPct).toFixed(2)}%`;
    const pillClass =
      intent === 'neutral' ? 'neutral' : trend === 'up' ? 'up' : 'down';

    return (
      <LiquidPanel className="interactive kpi-card">
        <div className="kpi-top">
          <div className="kpi-iconBtn" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
              <path d={iconPath} />
            </svg>
          </div>
          <button className="kpi-menuBtn" type="button" aria-label="More">
            <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
              <circle cx="128" cy="128" r="12" />
              <circle cx="60" cy="128" r="12" />
              <circle cx="196" cy="128" r="12" />
            </svg>
          </button>
        </div>
        <div className="kpi-title">{title}</div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-sub">
          <span className={`kpi-pill ${pillClass}`}>
            {trend === 'up' ? '+' : '-'}
            {pctText}
          </span>
          <span className="kpi-subText">from last month</span>
        </div>
      </LiquidPanel>
    );
  };

  const renderRangeBar = (progress: number) => {
    const segments = 52;
    const filled = Math.min(segments, Math.round((progress / 100) * segments));
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

  return (
    <div className="dashboard-grid">
      
      {/* ROW 1: KPI CARDS */}
      <section className="grid-kpi">
        <KPICard 
          title="Total Revenue" 
          value={formatCurrency(income, currency)} 
          iconPath="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm45.66-93.66a8,8,0,0,1,0,11.32l-32,32a8,8,0,0,1-11.32,0l-32-32a8,8,0,0,1,11.32-11.32L120,132.69V88a8,8,0,0,1,16,0v44.69l10.34-10.35A8,8,0,0,1,173.66,122.34Z"
          trend={incomeDelta.pct >= 0 ? 'up' : 'down'}
          trendPct={incomeDelta.pct}
        />
        <KPICard 
          title="Total Expense" 
          value={formatCurrency(expense, currency)} 
          iconPath="M216,72H40a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H216a8,8,0,0,0,8-8V80A8,8,0,0,0,216,72Zm-8,120H48V88H208Zm-48-24a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,160,168Z"
          trend={expenseDelta.pct <= 0 ? 'up' : 'down'}
          trendPct={expenseDelta.pct}
        />
        <KPICard 
          title="Net Growth" 
          value={formatCurrency(balance, currency)} 
          iconPath="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1,0-16H224A8,8,0,0,1,232,208ZM164.24,93.42l-42.6,42.6-30.22-22.66a8,8,0,0,0-10.84,1.08l-48,56a8,8,0,1,0,12.19,10.42L88,130.63l30.22,22.66a8,8,0,0,0,10.84-1.08l48-48,35.15,29.29a8,8,0,1,0,10.25-12.3l-48-40A8,8,0,0,0,164.24,93.42Z"
          trend={balanceDelta.pct >= 0 ? 'up' : 'down'}
          trendPct={balanceDelta.pct}
        />
        <KPICard 
          title="Transactions" 
          value={txCount} 
          iconPath="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208ZM149.66,101.66a8,8,0,0,1,0,11.31l-32,32a8,8,0,0,1-11.32,0l-32-32a8,8,0,0,1,11.32-11.32L96,112.69V64a8,8,0,0,1,16,0v48.69l10.34-10.35A8,8,0,0,1,149.66,101.66Zm32,72H74.34a8,8,0,0,1,0-16H181.66a8,8,0,0,1,0,16Z"
          trend="up"
          trendPct={0}
          intent="neutral"
        />
      </section>

      {/* ROW 2: CHART & WIDGETS */}
      <section className="grid-row-2">
        
        {/* Main Chart */}
        <LiquidPanel className="interactive overview-panel">
          <div className="overview-header">
            <div className="overview-title">Sales Overview</div>
            <div className="overview-actions">
              <button className="overview-select" type="button">
                Daily Trend
                <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M128,188a8,8,0,0,1-5.66-2.34l-80-80a8,8,0,0,1,11.32-11.32L128,168.69l74.34-74.35a8,8,0,0,1,11.32,11.32l-80,80A8,8,0,0,1,128,188Z" />
                </svg>
              </button>
              <button className="overview-menuBtn" type="button" aria-label="More">
                <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
                  <circle cx="128" cy="128" r="12" />
                  <circle cx="60" cy="128" r="12" />
                  <circle cx="196" cy="128" r="12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="overview-meta">
            <div className="overview-stats">
              <div className="overview-stat">
                <div className="overview-statLabel">Total Earnings</div>
                <div className="overview-statValue">{formatCurrency(income, currency)}</div>
                <div className={`overview-statDelta ${incomeDelta.pct >= 0 ? 'positive' : 'negative'}`}>
                  {incomeDelta.pct >= 0 ? '+' : '-'}
                  {Math.abs(incomeDelta.pct).toFixed(2)}%
                </div>
              </div>
              <div className="overview-stat">
                <div className="overview-statLabel">Total Expenditure</div>
                <div className="overview-statValue">{formatCurrency(expense, currency)}</div>
                <div className={`overview-statDelta ${expenseDelta.pct <= 0 ? 'positive' : 'negative'}`}>
                  {expenseDelta.pct <= 0 ? '+' : '-'}
                  {Math.abs(expenseDelta.pct).toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="overview-legend" aria-hidden="true">
              <div className="legend-item">
                <span className="legend-dot earning" />
                <span>Earning</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot expenditure" />
                <span>Expenditure</span>
              </div>
            </div>
          </div>

          <div className="overview-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={8}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 11 }}
                  dy={10}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                  contentStyle={{
                    backgroundColor: 'rgba(10, 12, 16, 0.92)',
                    borderColor: 'rgba(255,255,255,0.12)',
                    borderRadius: 14,
                    boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
                    color: '#fff',
                  }}
                  formatter={(val: number) => formatCurrency(val, currency)}
                />
                <Bar dataKey="Income" fill="var(--accent-orange)" radius={[6, 6, 6, 6]} barSize={12} />
                <Bar dataKey="Expense" fill="rgba(255,255,255,0.14)" radius={[6, 6, 6, 6]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </LiquidPanel>

        {/* Widgets Column */}
        <div style={{display:'flex', flexDirection:'column', gap:20}}>
          
          {/* Monthly Limit Widget */}
          <LiquidPanel className="interactive" style={{flex:'0 0 auto'}}>
            <div className="panel-header">
              <div className="panel-title">Monthly Limit</div>
              <div className="panel-actions" onClick={() => onNavigate('budgets')}>Manage</div>
            </div>
            
            <div className="limit-widget">
              <div className="limit-info">
                <div className="limit-val">{Math.round(budgetProgress)}%</div>
                <div className="limit-sub">{formatCurrency(budgetRemaining, currency)} Left</div>
              </div>
              
              {renderRangeBar(budgetProgress)}
              
              <div className="limit-sub" style={{marginTop:8, textAlign:'right'}}>
                Total: {formatCurrency(totalBudget, currency)}
              </div>
            </div>
          </LiquidPanel>

          {/* Recent Transactions */}
          <LiquidPanel className="interactive" style={{flex:1, minHeight:0, display:'flex', flexDirection:'column'}}>
            <div className="panel-header">
              <div className="panel-title">Recent</div>
              <div className="panel-actions" onClick={() => onNavigate('transactions')}>All</div>
            </div>
            <div className="recent-list">
              {transactions.slice(0, 5).map(tx => (
                <div key={tx.id} className="recent-item">
                  <div className="recent-icon">
                    {tx.category_name ? tx.category_name[0] : '?'}
                  </div>
                  <div className="recent-info">
                    <div className="recent-title">{tx.category_name || 'Uncategorized'}</div>
                    <div className="recent-date">{formatDateShort(tx.date)}</div>
                  </div>
                  <div className={`recent-amount ${tx.type === 'income' ? 'income' : ''}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, currency).replace(currency, '')}
                  </div>
                </div>
              ))}
              {transactions.length === 0 && <div className="text-muted" style={{textAlign:'center', marginTop:20}}>No transactions</div>}
            </div>
          </LiquidPanel>

        </div>
      </section>

      {/* ROW 3: ACCOUNTS & TREND */}
      <section className="grid-row-3">
        
        {/* Accounts List (Grid) */}
        <LiquidPanel className="interactive">
          <div className="panel-header">
            <div className="panel-title">My Cards</div>
            <div className="panel-actions" onClick={() => onNavigate('accounts')}>Manage</div>
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
            <div className="text-muted" style={{padding:40, textAlign:'center'}}>No accounts added.</div>
          )}
        </LiquidPanel>

        {/* Top Spending Categories Trend */}
        <LiquidPanel className="interactive">
          <div className="panel-header">
            <div className="panel-title">Top Categories</div>
            <div className="panel-actions">Expenses</div>
          </div>
          
          <div className="cat-bars">
            {categoryData.length > 0 ? (
              categoryData.map((cat, i) => {
                const maxVal = Math.max(...categoryData.map(c => c.value)) || 1;
                const pct = (cat.value / maxVal) * 100;
                return (
                  <div key={i} className="cat-bar-item">
                    <div className="cat-bar-label">{cat.name}</div>
                    <div className="cat-bar-track">
                      <div className="cat-bar-fill" style={{width: `${pct}%`, background: cat.color}} />
                    </div>
                    <div className="cat-bar-val">{formatCurrency(cat.value, currency).replace(currency, '')}</div>
                  </div>
                );
              })
            ) : (
              <div className="text-muted" style={{textAlign:'center', marginTop:20}}>No expense data</div>
            )}
          </div>
        </LiquidPanel>

      </section>

    </div>
  );
};
