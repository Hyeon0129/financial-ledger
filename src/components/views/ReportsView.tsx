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
