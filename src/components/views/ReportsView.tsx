// Reports View (Analytics)
import React, { useEffect, useMemo, useState } from 'react';
import type { Budget, MonthlyStats, Transaction } from '../../api';
import { categoriesApi, formatCurrency, statsApi } from '../../api';
import { supabase } from '../../lib/supabase';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LiquidPanel } from '../common/LiquidPanel';

type YearlyStats = { year: number; monthlyTrend: Array<{ month: string; type: string; total: number }> };

interface ReportsViewProps {
  stats: MonthlyStats | null;
  yearlyStats: YearlyStats | null;
  budgets: Budget[];
  currency: string;
}

type YearRow = { month: string; monthNum: string; income: number; expense: number; net: number };
type YearCategoryRow = { name: string; value: number; pct: number; color: string };
type TrendDir = 'up' | 'down';

const VerticalLineCursor: React.FC<any> = ({ points, height }) => {
  const p = points?.[0];
  if (!p) return null;
  return (
    <line x1={p.x} y1={0} x2={p.x} y2={height} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
  );
};

export const ReportsView: React.FC<ReportsViewProps> = ({ stats, yearlyStats, budgets, currency }) => {
  const initialYear = yearlyStats?.year ?? (stats ? Number(stats.month.split('-')[0]) : new Date().getFullYear());
  const [year, setYear] = useState<number>(initialYear);
  const [yearly, setYearly] = useState<YearlyStats | null>(yearlyStats);
  const [prevYearly, setPrevYearly] = useState<YearlyStats | null>(null);
  const [yearExpenseByCategory, setYearExpenseByCategory] = useState<YearCategoryRow[]>([]);
  const [yearCatTopPct, setYearCatTopPct] = useState<number>(0);
  const [loadingYear, setLoadingYear] = useState(false);
  const [insightStats, setInsightStats] = useState<MonthlyStats | null>(null);
  const [insightPrevStats, setInsightPrevStats] = useState<MonthlyStats | null>(null);

  const monthKeys = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
    [year],
  );

  const yearlyCombined: YearRow[] = useMemo(() => {
    const source = yearly?.monthlyTrend || [];
    const yearlyExpense = source.filter((m) => m.type === 'expense');
    const yearlyIncome = source.filter((m) => m.type === 'income');
    return monthKeys.map((m) => {
      const exp = yearlyExpense.find((e) => e.month === m)?.total || 0;
      const inc = yearlyIncome.find((i) => i.month === m)?.total || 0;
      const monthIdx = Number(m.split('-')[1]) - 1;
      const label = new Date(year, monthIdx, 1).toLocaleDateString('en-US', { month: 'short' });
      return { month: label, monthNum: m.split('-')[1], expense: exp, income: inc, net: inc - exp };
    });
  }, [monthKeys, year, yearly?.monthlyTrend]);

  if (!stats) return <div className="loading-spinner" />;

  const ytdIncome = yearlyCombined.reduce((sum, m) => sum + m.income, 0);
  const ytdExpense = yearlyCombined.reduce((sum, m) => sum + m.expense, 0);
  const ytdNet = ytdIncome - ytdExpense;
  const savingsRate = ytdIncome > 0 ? (ytdNet / ytdIncome) * 100 : 0;

  const monthsCount = Math.max(1, yearlyCombined.filter((m) => (m.income || m.expense) > 0).length || 12);
  const avgMonthlyExpense = ytdExpense / monthsCount;

  const prevTotals = useMemo(() => {
    const source = prevYearly?.monthlyTrend || [];
    let income = 0;
    let expense = 0;
    for (const r of source) {
      if (r.type === 'income') income += r.total;
      else if (r.type === 'expense') expense += r.total;
    }
    return { income, expense, net: income - expense };
  }, [prevYearly?.monthlyTrend]);

  const deltaPct = (curr: number, prev: number) => {
    if (!prev) return 0;
    return ((curr - prev) / prev) * 100;
  };

  const TrendPill: React.FC<{ dir: TrendDir; pct: number }> = ({ dir, pct }) => (
    <span className={`trend ${dir}`}>
      <i className={`ph ${dir === 'up' ? 'ph-trend-up' : 'ph-trend-down'}`} />
      {dir === 'up' ? '+' : '-'}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );

  const KPICard: React.FC<{ title: string; value: React.ReactNode; sub?: React.ReactNode }> = ({ title, value, sub }) => (
    <LiquidPanel className="interactive dash-kpiCard">
      <div className="dash-kpiTitle">{title}</div>
      <div className="dash-kpiValue">{value}</div>
      <div className="dash-kpiSub">
        {sub}
      </div>
    </LiquidPanel>
  );

  const getPrevMonthKey = (m: string) => {
    const [yy, mm] = m.split('-').map(Number);
    const d = new Date(yy, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const getInsightMonthKey = (targetYear: number, y: YearlyStats | null) => {
    const currentMonthKey = stats.month;
    const currentYear = Number(currentMonthKey.split('-')[0]);
    if (targetYear === currentYear) return currentMonthKey;

    const months = Array.from({ length: 12 }, (_, i) => `${targetYear}-${String(i + 1).padStart(2, '0')}`);
    const source = y?.monthlyTrend ?? [];
    const totals = new Map<string, { income: number; expense: number }>();
    for (const r of source) {
      const curr = totals.get(r.month) ?? { income: 0, expense: 0 };
      if (r.type === 'income') curr.income = r.total;
      else if (r.type === 'expense') curr.expense = r.total;
      totals.set(r.month, curr);
    }
    const lastNonEmpty = [...months]
      .reverse()
      .find((k) => (totals.get(k)?.income ?? 0) > 0 || (totals.get(k)?.expense ?? 0) > 0);
    return lastNonEmpty ?? `${targetYear}-12`;
  };

  const loadYearData = async (targetYear: number) => {
    setLoadingYear(true);
    try {
      const [y, prevY, catsRes] = await Promise.all([
        statsApi.yearly(targetYear),
        statsApi.yearly(targetYear - 1),
        categoriesApi.list(),
      ]);
      setYearly(y);
      setPrevYearly(prevY);

      const insightMonthKey = getInsightMonthKey(targetYear, y);
      const insightPrevKey = getPrevMonthKey(insightMonthKey);
      const [m, pm] = await Promise.all([statsApi.monthly(insightMonthKey), statsApi.monthly(insightPrevKey)]);
      setInsightStats(m);
      setInsightPrevStats(pm);

      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      if (!userId) {
        setYearExpenseByCategory([]);
        setYearCatTopPct(0);
        return;
      }

      const catMap = new Map(
        catsRes.map((c) => [
          c.id,
          { name: c.name, color: c.color || '#6B7280', type: c.type as 'income' | 'expense' },
        ]),
      );

      const totals = new Map<string, number>();
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const to = from + pageSize - 1;
        const res = await supabase
          .from('transactions')
          .select('type,amount,category_id,date')
          .eq('user_id', userId)
          .like('date', `${targetYear}-%`)
          .range(from, to)
          .order('date', { ascending: true });

        if (res.error) throw new Error(res.error.message);
        const rows = (res.data ?? []) as Array<Pick<Transaction, 'type' | 'amount' | 'category_id' | 'date'>>;
        if (rows.length === 0) break;

        for (const t of rows) {
          if (t.type !== 'expense') continue;
          const key = t.category_id ?? 'uncat';
          totals.set(key, (totals.get(key) ?? 0) + (Number(t.amount) || 0));
        }

        if (rows.length < pageSize) break;
        from += pageSize;
      }

      const items = Array.from(totals.entries())
        .map(([categoryId, total]) => {
          const cat = categoryId !== 'uncat' ? catMap.get(categoryId) : undefined;
          return {
            name: cat?.name ?? (categoryId === 'uncat' ? '미분류' : '알 수 없음'),
            value: total,
            color: cat?.color ?? '#6B7280',
          };
        })
        .sort((a, b) => b.value - a.value);

      const total = items.reduce((sum, it) => sum + it.value, 0) || 1;
      const top = items[0]?.value ?? 0;
      setYearCatTopPct((top / total) * 100);

      const topN = 6;
      const head = items.slice(0, topN);
      const tail = items.slice(topN);
      const other = tail.reduce((sum, it) => sum + it.value, 0);
      const merged = other > 0 ? [...head, { name: 'Other', value: other, color: 'rgba(255,255,255,0.26)' }] : head;

      setYearExpenseByCategory(
        merged.map((it) => ({
          ...it,
          pct: (it.value / total) * 100,
        })),
      );
    } finally {
      setLoadingYear(false);
    }
  };

  useEffect(() => {
    loadYearData(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const insightMonthKey = useMemo(
    () => getInsightMonthKey(year, yearly ?? yearlyStats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, yearly, yearlyStats, stats.month],
  );
  const insightThis = insightMonthKey === stats.month ? stats : insightStats;
  const insightPrev = insightPrevStats;

  const thisIncome = insightThis?.income ?? 0;
  const thisExpense = insightThis?.expense ?? 0;
  const lastExpense = insightPrev?.expense ?? 0;
  const thisNet = thisIncome - thisExpense;

  const formatSignedCurrency = (val: number) => `${val >= 0 ? '+' : '-'}${formatCurrency(Math.abs(val), currency)}`;

  const budgetTotal = useMemo(
    () => budgets.filter((b) => b.month === insightMonthKey).reduce((sum, b) => sum + (b.amount ?? 0), 0),
    [budgets, insightMonthKey],
  );
  const budgetLeft = Math.max(0, budgetTotal - thisExpense);
  const budgetUsedRatePct = budgetTotal > 0 ? ((budgetTotal - budgetLeft) / budgetTotal) * 100 : 0;

  const topCategory = useMemo(() => {
    const rows = (insightThis?.byCategory ?? []).filter((c) => c.type === 'expense' && c.total > 0);
    const top = rows.sort((a, b) => b.total - a.total)[0];
    const amount = top?.total ?? 0;
    const sharePct = thisExpense > 0 ? (amount / thisExpense) * 100 : 0;
    return { name: top?.category_name ?? '-', amount, sharePct };
  }, [insightThis?.byCategory, thisExpense]);

  const avgExpense = useMemo(() => {
    const targetIdx = Math.max(0, Number(insightMonthKey.split('-')[1]) - 1);
    const currYearExpenses = yearlyCombined.map((m) => m.expense);
    const prevExpenses = (() => {
      const source = prevYearly?.monthlyTrend ?? [];
      const map = new Map<string, number>();
      for (const r of source) if (r.type === 'expense') map.set(r.month, r.total);
      return Array.from({ length: 12 }, (_, i) => map.get(`${year - 1}-${String(i + 1).padStart(2, '0')}`) ?? 0);
    })();
    const series = [...prevExpenses, ...currYearExpenses];
    const end = 12 + targetIdx;
    const start = Math.max(0, end - 5);
    const window = series.slice(start, end + 1).filter((v) => v > 0);
    if (window.length === 0) return 0;
    return window.reduce((s, v) => s + v, 0) / window.length;
  }, [insightMonthKey, prevYearly?.monthlyTrend, year, yearlyCombined]);

  const insights = useMemo(() => {
    const delta = lastExpense > 0 ? ((thisExpense - lastExpense) / lastExpense) * 100 : 0;
    const deltaAbs = Math.round(Math.abs(delta));
    const deltaDir = thisExpense >= lastExpense ? '증가' : '감소';

    const gap = avgExpense > 0 ? ((thisExpense - avgExpense) / avgExpense) * 100 : 0;
    const gapAbs = Math.round(Math.abs(gap));
    const gapDir = thisExpense >= avgExpense ? '높음' : '낮음';

    const topShareAbs = Math.round(Math.max(0, topCategory.sharePct));
    const usedAbs = Math.round(Math.max(0, budgetUsedRatePct));

    const headline = (() => {
      if (budgetTotal > 0 && budgetUsedRatePct >= 90) return `🚨 이번 달은 예산 초과 위험이 큽니다. (사용률 ${usedAbs}%)`;
      if (lastExpense > 0 && delta >= 30) return `⚠️ 이번 달 지출이 지난달보다 크게 증가했습니다. (+${deltaAbs}%)`;
      if (topCategory.amount > 0 && topCategory.sharePct >= 70)
        return `💡 이번 달 지출이 '${topCategory.name}'에 집중되었습니다. (${topShareAbs}%)`;
      if (thisNet < 0) return `⚠️ 이번 달은 적자 흐름입니다. (${formatSignedCurrency(thisNet)})`;
      return '📌 이번 달 지출은 비교적 안정적입니다.';
    })();

    const all = [
      {
        key: 'mom',
        ok: lastExpense > 0,
        text: `📈 이번 달 지출은 지난달보다 ${deltaAbs}% ${deltaDir}했습니다.`,
      },
      {
        key: 'avg',
        ok: avgExpense > 0,
        text: `📊 평균 월 지출(${formatCurrency(Math.round(avgExpense), currency)}) 대비 ${gapAbs}% ${gapDir}입니다.`,
      },
      {
        key: 'top',
        ok: topCategory.amount > 0,
        text: `🏷️ 가장 많이 쓴 카테고리는 '${topCategory.name}'입니다. (${formatCurrency(topCategory.amount, currency)}, ${topShareAbs}%)`,
      },
      {
        key: 'budget',
        ok: budgetTotal > 0,
        text: `🎯 예산 사용률은 ${usedAbs}%입니다. (남은 예산 ${formatCurrency(budgetLeft, currency)})`,
      },
      {
        key: 'net',
        ok: true,
        text: `🧾 이번 달 순증감은 ${formatSignedCurrency(thisNet)}입니다. (수입 ${formatCurrency(thisIncome, currency)} − 지출 ${formatCurrency(thisExpense, currency)})`,
      },
    ] as const;

    const picked: string[] = [];
    const used = new Set<string>();

    for (const c of all) {
      if (!c.ok) continue;
      if (picked.length >= 3) break;
      picked.push(c.text);
      used.add(c.key);
    }
    for (const c of all) {
      if (picked.length >= 3) break;
      if (used.has(c.key)) continue;
      picked.push(c.text);
      used.add(c.key);
    }
    while (picked.length < 3) picked.push(all[all.length - 1].text);

    return { headline, bullets: picked.slice(0, 3) };
  }, [
    avgExpense,
    budgetLeft,
    budgetTotal,
    budgetUsedRatePct,
    currency,
    formatSignedCurrency,
    lastExpense,
    thisExpense,
    thisIncome,
    thisNet,
    topCategory.amount,
    topCategory.name,
    topCategory.sharePct,
  ]);

  const renderInsightText = (text: string) => {
    const tokenRe = /([+-]?₩\s?[\d,]+|\d+%)/g;
    const tokenCheckRe = /^([+-]?₩\s?[\d,]+|\d+%)$/;
    const parts = text.split(tokenRe);
    return parts
      .filter((p) => p.length > 0)
      .map((part, idx) => {
        if (tokenCheckRe.test(part)) {
          const isBad = part.trim().startsWith('-');
          return (
            <span key={`${idx}-${part}`} className={`reports-insightEmph${isBad ? ' bad' : ''}`}>
              {part}
            </span>
          );
        }
        return <React.Fragment key={`${idx}-${part}`}>{part}</React.Fragment>;
      });
  };

  return (
    <div className="reports-layout">
      <div className="reports-kpiGrid">
        <KPICard
          title="YTD Income"
          value={formatCurrency(ytdIncome, currency)}
          sub={
            <>
              <TrendPill dir={deltaPct(ytdIncome, prevTotals.income) >= 0 ? 'up' : 'down'} pct={deltaPct(ytdIncome, prevTotals.income)} />
              <span className="dash-kpiSubText">from last year</span>
            </>
          }
        />
        <KPICard
          title="YTD Expense"
          value={formatCurrency(ytdExpense, currency)}
          sub={
            <>
              <TrendPill dir={deltaPct(ytdExpense, prevTotals.expense) >= 0 ? 'up' : 'down'} pct={deltaPct(ytdExpense, prevTotals.expense)} />
              <span className="dash-kpiSubText">from last year</span>
            </>
          }
        />
        <KPICard
          title="YTD Net"
          value={formatCurrency(ytdNet, currency)}
          sub={
            <>
              <TrendPill dir={deltaPct(ytdNet, prevTotals.net) >= 0 ? 'up' : 'down'} pct={deltaPct(ytdNet, prevTotals.net)} />
              <span className="dash-kpiSubText">savings rate {savingsRate.toFixed(1)}%</span>
            </>
          }
        />
        <KPICard
          title="Avg Monthly Expense"
          value={formatCurrency(Math.round(avgMonthlyExpense), currency)}
          sub={<span className="dash-kpiSubText">estimation</span>}
        />
        <KPICard
          title="Top Category (YTD)"
          value={yearExpenseByCategory[0]?.name ?? '-'}
          sub={<span className="dash-kpiSubText">{yearExpenseByCategory.length ? `${yearCatTopPct.toFixed(0)}% of expense` : '-'}</span>}
        />
      </div>

      <div className="reports-mainGrid">
        <LiquidPanel className="interactive reports-yearPanel">
          <div className="reports-panelHeader">
            <div>
              <div className="reports-panelTitle">Annual Income / Expense</div>
              <div className="reports-panelSub">{year}</div>
            </div>
            <div className="reports-panelRight">
              <div className="reports-yearNav" aria-label="Year navigation">
                <button
                  className="reports-yearBtn"
                  type="button"
                  onClick={() => setYear((y) => y - 1)}
                  aria-label="Previous year"
                >
                  ‹
                </button>
                <div className="reports-yearLabel">{year}</div>
                <button
                  className="reports-yearBtn"
                  type="button"
                  onClick={() => setYear((y) => Math.min(new Date().getFullYear(), y + 1))}
                  aria-label="Next year"
                  disabled={year >= new Date().getFullYear()}
                >
                  ›
                </button>
              </div>

              <div className="reports-legend">
                <span className="reports-legendItem">
                  <span className="reports-legendDot income" /> Earning
                </span>
                <span className="reports-legendItem">
                  <span className="reports-legendDot expense" /> Expenditure
                </span>
              </div>
            </div>
          </div>

          <div className="reports-chartWrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={yearlyCombined}
                margin={{ top: 18, right: 18, left: 10, bottom: 10 }}
                barCategoryGap={18}
                barGap={2}
              >
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 10" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.58)', fontSize: 11 }}
                  padding={{ left: 10, right: 10 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.38)', fontSize: 11 }}
                  width={42}
                />
                <Tooltip
                  cursor={<VerticalLineCursor />}
                  contentStyle={{
                    background: 'rgba(10, 12, 16, 0.92)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 14,
                    boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
                  }}
                  formatter={(v: number) => formatCurrency(v, currency)}
                />
                <Bar dataKey="income" fill="rgba(148, 163, 184, 0.62)" radius={[4, 4, 0, 0]} barSize={12} />
                <Bar dataKey="expense" fill="rgba(245, 124, 0, 0.92)" radius={[4, 4, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </LiquidPanel>

        <LiquidPanel className="interactive reports-catPanel">
          <div className="reports-panelHeader">
            <div>
              <div className="reports-panelTitle">Expense by Category</div>
              <div className="reports-panelSub">{year}</div>
            </div>
          </div>

          <div className="reports-pieWrap" aria-busy={loadingYear}>
            <div className="reports-pieChart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={yearExpenseByCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="68%"
                    outerRadius="92%"
                    paddingAngle={3}
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth={1}
                  >
                    {yearExpenseByCategory.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="reports-pieCenter">
                <div className="reports-piePct">{yearCatTopPct ? yearCatTopPct.toFixed(0) : '0'}%</div>
                <div className="reports-pieLabel">top share</div>
              </div>
            </div>
            <div className="reports-pieLegend" aria-hidden={yearExpenseByCategory.length === 0}>
              {yearExpenseByCategory.slice(0, 6).map((c) => (
                <div key={c.name} className="reports-pieLegendRow">
                  <span className="reports-pieDot" style={{ background: c.color }} />
                  <span className="reports-pieName">{c.name}</span>
                  <span className="reports-piePctSmall">{c.pct.toFixed(0)}%</span>
                </div>
              ))}
              {yearExpenseByCategory.length === 0 && <div className="reports-empty">No data</div>}
            </div>
          </div>
        </LiquidPanel>
      </div>

      <div className="reports-bottomGrid">
        <LiquidPanel className="interactive reports-tablePanel">
          <div className="reports-panelHeader">
            <div>
              <div className="reports-panelTitle">Monthly Summary</div>
              <div className="reports-panelSub">{year}</div>
            </div>
          </div>

          <div className="reports-table">
            <div className="reports-tableHead">
              <div className="reports-col-month">월</div>
              <div className="reports-col-num">수입</div>
              <div className="reports-col-num">지출</div>
              <div className="reports-col-num">순증감</div>
            </div>
            {yearlyCombined.map((m) => (
              <div key={m.monthNum} className="reports-tableRow">
                <div className="reports-col-month">{Number(m.monthNum)}월</div>
                <div className="reports-col-num income">{formatCurrency(m.income, currency)}</div>
                <div className="reports-col-num expense">{formatCurrency(m.expense, currency)}</div>
                <div className={`reports-col-num ${m.net >= 0 ? 'income' : 'expense'}`}>{formatCurrency(m.net, currency)}</div>
              </div>
            ))}
          </div>
        </LiquidPanel>

        <LiquidPanel className="interactive reports-insightsPanel">
          <div className="reports-panelHeader">
            <div>
              <div className="reports-panelTitle">Insights</div>
              <div className="reports-panelSub">Quick read</div>
            </div>
          </div>
          <div className="reports-insightsBox" aria-label={`Insights for ${insightMonthKey}`}>
            <div className="reports-insightsHeadline">{renderInsightText(insights.headline)}</div>
            <ul className="reports-insightsBullets">
              {insights.bullets.map((t) => (
                <li key={t} className="reports-insightsBullet">
                  {renderInsightText(t)}
                </li>
              ))}
            </ul>
          </div>
        </LiquidPanel>
      </div>
    </div>
  );
};
