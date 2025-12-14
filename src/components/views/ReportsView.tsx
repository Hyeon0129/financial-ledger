// Reports View
import React, { useMemo } from 'react';
import type { MonthlyStats } from '../../api';
import { formatCurrency } from '../../api';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { LiquidPanel } from '../common/LiquidPanel';

type YearlyStats = { year: number; monthlyTrend: Array<{ month: string; type: string; total: number }> };

interface ReportsViewProps {
  stats: MonthlyStats | null;
  yearlyStats: YearlyStats | null;
  currency: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ stats, yearlyStats, currency }) => {
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

  const KPICard = ({ title, value, sub }: any) => (
    <LiquidPanel className="interactive">
      <div className="kpi-head">
        <div className="kpi-label">{title}</div>
      </div>
      <div className="kpi-value" style={{fontSize: 20}}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </LiquidPanel>
  );

  return (
    <div className="reports-stack" style={{display:'flex', flexDirection:'column', gap:24}}>
      
      {/* KPI Grid */}
      <div className="grid-kpi" style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:16}}>
        <KPICard title="이번 달 수입" value={formatCurrency(stats.income, currency)} sub={stats.month} />
        <KPICard title="이번 달 지출" value={formatCurrency(stats.expense, currency)} sub={stats.month} />
        <KPICard title="일평균 지출" value={formatCurrency(Math.round(stats.expense / daysInMonth), currency)} sub="하루 평균" />
        <KPICard title="총 거래 건수" value={`${stats.transactionCount}건`} sub="월간 합계" />
        <KPICard title="최고 지출" value={topExpense?.category_name || '-'} sub={topExpense ? formatCurrency(topExpense.total, currency) : '-'} />
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
        {/* Activity Summary */}
        <LiquidPanel>
          <div className="panel-header">
            <div className="panel-title">이번달 지출 추이</div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={lineData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-green)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--accent-green)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    background: 'rgba(20,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12
                  }}
                  formatter={(value: number) => formatCurrency(value, currency)}
                />
                <Area type="monotone" dataKey="expense" stroke="none" fill="url(#activityArea)" />
                <Line type="monotone" dataKey="expense" stroke="var(--accent-green)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </LiquidPanel>

        {/* Yearly Trend */}
        <LiquidPanel>
          <div className="panel-header">
            <div className="panel-title">연간 지출/수입 추이</div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={yearlyCombined} margin={{ left: -8, right: 8, top: 10 }}>
                <defs>
                  <linearGradient id="yearExpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-red)" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="var(--accent-red)" stopOpacity={0.2}/>
                  </linearGradient>
                  <linearGradient id="yearIncGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity={0.2}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    background: 'rgba(20,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12
                  }}
                  formatter={(v: number) => formatCurrency(v, currency)}
                />
                <Bar dataKey="expense" fill="url(#yearExpGrad)" radius={[4, 4, 0, 0]} barSize={12} />
                <Bar dataKey="income" fill="url(#yearIncGrad)" radius={[4, 4, 0, 0]} barSize={12} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </LiquidPanel>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
        {/* Category Analysis */}
        <LiquidPanel>
          <div className="panel-header">
            <div className="panel-title">지출 카테고리 분석</div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseByCategory.slice(0, 10)} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal vertical={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis type="category" dataKey="category_name" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <Tooltip
                  cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  contentStyle={{
                    background: 'rgba(20,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12
                  }}
                  formatter={(value: number) => formatCurrency(value, currency)}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} fill="var(--accent-purple)" barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </LiquidPanel>

        {/* Monthly Table */}
        <LiquidPanel>
          <div className="panel-header">
            <div className="panel-title">월별 요약</div>
          </div>
          <div className="transactions-table-lite manage-table" style={{ padding: 8 }}>
            <div className="tx-row manage-head" style={{ gridTemplateColumns: '1fr 1fr 1fr', borderBottom:'1px solid rgba(255,255,255,0.1)', paddingBottom:8 }}>
              <div className="tx-col-label" style={{ justifyContent: 'center' }}>월</div>
              <div className="tx-col-amount" style={{ justifyContent: 'flex-end', textAlign: 'right' }}>수입</div>
              <div className="tx-col-amount" style={{ justifyContent: 'flex-end', textAlign: 'right' }}>지출</div>
            </div>
            <div style={{maxHeight: 280, overflowY:'auto'}}>
              {yearlyCombined.map((m, idx) => (
                <div key={idx} className="tx-row manage-row" style={{ gridTemplateColumns: '1fr 1fr 1fr', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <div className="tx-col-label" style={{ justifyContent: 'center' }}>{Number(m.month)}월</div>
                  <div className="tx-amount tx-col-amount" style={{ justifyContent: 'flex-end', textAlign: 'right', color:'var(--accent-green)' }}>
                    {formatCurrency(m.income, currency)}
                  </div>
                  <div className="tx-amount tx-col-amount" style={{ justifyContent: 'flex-end', textAlign: 'right', color:'var(--accent-red)' }}>
                    {formatCurrency(m.expense, currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </LiquidPanel>
      </div>
    </div>
  );
};