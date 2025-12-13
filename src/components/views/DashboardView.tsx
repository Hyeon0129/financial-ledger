import React, { useMemo } from 'react';
import {
  BarChart, Bar, CartesianGrid, XAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import type {
  Transaction, Category, Account, Budget, SavingsGoal, MonthlyStats
} from '../../api';
import { formatCurrency, formatDateShort } from '../../api';
import { LiquidPanel } from '../common/LiquidPanel';
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
    if (!prev) return { val: 0, pct: '0.0' };
    const diff = curr - prev;
    return { val: diff, pct: ((diff / prev) * 100).toFixed(1) };
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

  if (!stats) return <div className="loading-spinner" />;

  const KPICard = ({ title, value, iconPath, trend, trendVal, color }: any) => (
    <LiquidPanel className="interactive">
      <div className="kpi-head">
        <div className="kpi-icon" style={{color: color || 'var(--text-muted)'}}>
          <svg width="24" height="24" viewBox="0 0 256 256" fill="currentColor"><path d={iconPath} /></svg>
        </div>
        <svg width="20" height="20" viewBox="0 0 256 256" fill="var(--text-muted)" style={{opacity:0.5}}><circle cx="128" cy="128" r="12"/><circle cx="60" cy="128" r="12"/><circle cx="196" cy="128" r="12"/></svg>
      </div>
      <div className="kpi-label">{title}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">
        <span className={`trend ${trend === 'up' ? 'up' : 'down'}`}>
          {trend === 'up' ? '+' : ''}{trendVal}%
        </span>
        <span>from last month</span>
      </div>
    </LiquidPanel>
  );

  return (
    <div className="dashboard-grid">
      
      {/* ROW 1: KPI CARDS */}
      <section className="grid-kpi">
        <KPICard 
          title="Total Revenue" 
          value={formatCurrency(income, currency)} 
          iconPath="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm45.66-93.66a8,8,0,0,1,0,11.32l-32,32a8,8,0,0,1-11.32,0l-32-32a8,8,0,0,1,11.32-11.32L120,132.69V88a8,8,0,0,1,16,0v44.69l10.34-10.35A8,8,0,0,1,173.66,122.34Z"
          trend={Number(incomeDelta.pct) >= 0 ? 'up' : 'down'}
          trendVal={incomeDelta.pct}
          color="var(--accent-green)"
        />
        <KPICard 
          title="Total Expense" 
          value={formatCurrency(expense, currency)} 
          iconPath="M216,72H40a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H216a8,8,0,0,0,8-8V80A8,8,0,0,0,216,72Zm-8,120H48V88H208Zm-48-24a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,160,168Z"
          trend={Number(expenseDelta.pct) <= 0 ? 'up' : 'down'}
          trendVal={expenseDelta.pct}
          color="var(--accent-red)"
        />
        <KPICard 
          title="Net Growth" 
          value={formatCurrency(balance, currency)} 
          iconPath="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1,0-16H224A8,8,0,0,1,232,208ZM164.24,93.42l-42.6,42.6-30.22-22.66a8,8,0,0,0-10.84,1.08l-48,56a8,8,0,1,0,12.19,10.42L88,130.63l30.22,22.66a8,8,0,0,0,10.84-1.08l48-48,35.15,29.29a8,8,0,1,0,10.25-12.3l-48-40A8,8,0,0,0,164.24,93.42Z"
          trend={Number(balanceDelta.pct) >= 0 ? 'up' : 'down'}
          trendVal={balanceDelta.pct}
          color="var(--accent-blue)"
        />
        <KPICard 
          title="Transactions" 
          value={txCount} 
          iconPath="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208ZM149.66,101.66a8,8,0,0,1,0,11.31l-32,32a8,8,0,0,1-11.32,0l-32-32a8,8,0,0,1,11.32-11.32L96,112.69V64a8,8,0,0,1,16,0v48.69l10.34-10.35A8,8,0,0,1,149.66,101.66Zm32,72H74.34a8,8,0,0,1,0-16H181.66a8,8,0,0,1,0,16Z"
          trend="up"
          trendVal="0.0"
          color="var(--accent-orange)"
        />
      </section>

      {/* ROW 2: CHART & WIDGETS */}
      <section className="grid-row-2">
        
        {/* Main Chart (Sales Overview) */}
        <LiquidPanel className="interactive">
          <div className="panel-header">
            <div className="panel-title">Sales Overview</div>
            <div className="panel-actions">Daily Trend</div>
          </div>
          
          <div className="sales-stats">
            <div className="stat-item">
              <h4>Total Income</h4>
              <p>{formatCurrency(income, currency)}</p>
            </div>
            <div className="stat-item">
              <h4>Total Expense</h4>
              <p>{formatCurrency(expense, currency)}</p>
            </div>
          </div>

          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={6}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill:'var(--text-muted)', fontSize:11}} 
                  dy={10}
                />
                <Tooltip 
                  cursor={{fill:'rgba(255,255,255,0.05)'}}
                  contentStyle={{
                    backgroundColor: 'rgba(20, 20, 35, 0.95)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    color: '#fff'
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}
                  formatter={(val: number) => formatCurrency(val, currency)}
                />
                <Bar 
                  dataKey="Income" 
                  fill="var(--accent-orange)" 
                  radius={[4,4,4,4]} 
                  barSize={12} 
                />
                <Bar 
                  dataKey="Expense" 
                  fill="rgba(255,255,255,0.15)" 
                  radius={[4,4,4,4]} 
                  barSize={12} 
                />
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
              <div className="panel-actions" onClick={() => onNavigate('budgets')}>Set</div>
            </div>
            
            <div className="limit-widget">
              <div className="limit-info">
                <div className="limit-val">{formatCurrency(budgetRemaining, currency)}</div>
                <div className="limit-sub">Remaining</div>
              </div>
              <div className="limit-bar-bg">
                <div className="limit-bar-fill" style={{width: `${Math.min(100, budgetProgress)}%`}} />
              </div>
              <div className="limit-sub" style={{marginTop:8, display:'flex', justifyContent:'space-between'}}>
                <span>{Math.round(budgetProgress)}% Used</span>
                <span>Total: {formatCurrency(totalBudget, currency)}</span>
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
        
        {/* Accounts List (Cards) */}
        <LiquidPanel className="interactive">
          <div className="panel-header">
            <div className="panel-title">My Cards</div>
            <div className="panel-actions" onClick={() => onNavigate('accounts')}>All</div>
          </div>
          <div className="account-grid">
            {accounts.map(acc => (
              <div key={acc.id} className="account-card">
                <div className="acc-icon">
                  <svg width="24" height="24" viewBox="0 0 256 256" fill="currentColor"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V72H40V56Zm0,144H40V88H216V200Zm-24-40a8,8,0,1,1-8-8A8,8,0,0,1,192,160Z"/></svg>
                </div>
                <div>
                  <div className="acc-name">{acc.name}</div>
                  <div className="acc-bal">{formatCurrency(acc.balance, currency)}</div>
                </div>
              </div>
            ))}
            {accounts.length === 0 && <div className="text-muted" style={{padding:20}}>No accounts added.</div>}
          </div>
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