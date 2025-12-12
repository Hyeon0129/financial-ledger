// Dashboard View Component
import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import type {
  Transaction, Category, Account, Budget, SavingsGoal,
  MonthlyStats
} from '../../api';
import { formatCurrency, formatDate } from '../../api';
import { Icons } from '../common/Icons';
import { getCardTheme } from '../common/utils';
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
  theme: 'light' | 'dark';
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  stats, 
  prevStats, 
  transactions, 
  budgets, 
  currency, 
  month, 
  theme, 
  accounts, 
  onNavigate, 
  savingsGoals 
}) => {
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
    const pctText = change.pct === null ? 'New' : `${sign}${Math.abs(change.pct).toFixed(0)}%`;
    const amountText = type === 'count'
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
      
      data.push({ day: i, 지출: dayExpense, 수입: dayIncome });
    }
    return data;
  }, [stats, month]);

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
              {pagedAccounts.length > 0 ? (
                pagedAccounts.map((acc, index) => {
                  const usage = accountUsage[acc.id] || { spent: 0, income: 0 };
                  const globalIndex = clampedCardPage * cardsPerPage + index;
                  return (
                    <div
                      key={acc.id}
                      className={`bank-card real ${getCardTheme(acc, globalIndex)}`}
                    >
                      <div className="finance-card-title">{acc.name}</div>
                      <div className="finance-card-balance-wrap">
                        <div className="finance-card-balance">
                          {formatCurrency(acc.balance, currency)}
                        </div>
                        <div className="finance-card-sub">
                          이번 달 사용 {formatCurrency(usage.spent, currency)}
                        </div>
                      </div>
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
                <div className="tx-main" style={{ justifyContent: 'center' }}></div>
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
                <div className="tx-col-label" style={{ justifyContent: 'flex-start', fontWeight: 700 }}>증감</div>
                <div className={`tx-amount tx-col-amount ${changeClass({ diff: selectedMetric.change.diff ?? 0 })}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start', flexDirection: 'column', gap: 6, fontWeight: 700, textAlign: 'left' }}>
                  <span>{selectedMetric.change.pctText}</span>
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

