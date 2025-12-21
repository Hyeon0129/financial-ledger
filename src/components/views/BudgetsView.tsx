// Budgets View
import React, { useEffect, useMemo, useState } from 'react';
import type { Budget, Category, Transaction, MonthlyStats } from '../../api';
import { budgetsApi, formatCurrency, formatDate } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';
import { LiquidPanel } from '../common/LiquidPanel';

interface BudgetsViewProps {
  budgets: Budget[];
  categories: Category[];
  stats: MonthlyStats | null;
  currency: string;
  month: string;
  transactions: Transaction[];
  onRefresh: () => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({ 
  budgets, categories, stats, currency, month, transactions, onRefresh 
}) => {
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const leafExpenseCategories = useMemo(() => {
    const hasChild = new Set(categories.filter((c) => c.parent_id).map((c) => c.parent_id as string));
    return categories.filter((c) => c.type === 'expense' && !hasChild.has(c.id));
  }, [categories]);

  const budgetsForMonth = useMemo(() => budgets.filter((b) => b.month === month), [budgets, month]);

  const expenseSpentMap = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(month))
      .forEach((t) => {
        const key = t.category_id || 'unknown';
        map[key] = (map[key] || 0) + t.amount;
      });
    return map;
  }, [month, transactions]);

  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [categoryId, setCategoryId] = useState(() => leafExpenseCategories[0]?.id ?? '');
  const [amount, setAmount] = useState('');

  const openCreate = () => {
    setEditingBudget(null);
    setCategoryId(leafExpenseCategories[0]?.id ?? '');
    setAmount('');
    setShowModal(true);
  };

  const openEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setCategoryId(budget.category_id);
    setAmount(String(budget.amount));
    setShowModal(true);
  };

  const budgetOrderKey = useMemo(() => `my-ledger:budgets-order:${month}`, [month]);
  const [budgetOrder, setBudgetOrder] = useState<string[]>([]);
  const [draggingBudgetCatId, setDraggingBudgetCatId] = useState<string | null>(null);
  const [dragOverBudgetCatId, setDragOverBudgetCatId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(budgetOrderKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) setBudgetOrder(parsed.filter((v) => typeof v === 'string') as string[]);
      else setBudgetOrder([]);
    } catch {
      setBudgetOrder([]);
    }
  }, [budgetOrderKey]);

  const persistBudgetOrder = (next: string[]) => {
    setBudgetOrder(next);
    try {
      localStorage.setItem(budgetOrderKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const existing = new Set(budgetsForMonth.map((b) => b.category_id));
    const pruned = budgetOrder.filter((id) => existing.has(id));
    if (pruned.length !== budgetOrder.length) persistBudgetOrder(pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetsForMonth]);

  const budgetsSorted = useMemo(() => {
    const idx = new Map<string, number>();
    budgetOrder.forEach((id, i) => idx.set(id, i));
    const withIndex = budgetsForMonth.map((b) => ({ b, i: idx.get(b.category_id) ?? Number.POSITIVE_INFINITY }));
    withIndex.sort((a, c) => {
      if (a.i !== c.i) return a.i - c.i;
      return a.b.created_at < c.b.created_at ? -1 : a.b.created_at > c.b.created_at ? 1 : 0;
    });
    return withIndex.map((x) => x.b);
  }, [budgetOrder, budgetsForMonth]);

  const moveBudget = (fromCatId: string, toCatId: string) => {
    const current = budgetsSorted.map((b) => b.category_id);
    const fromIdx = current.indexOf(fromCatId);
    const toIdx = current.indexOf(toCatId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...current];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromCatId);
    persistBudgetOrder(next);
  };

  const budgetLabel = (catId: string) => {
    const cat = catMap.get(catId);
    const parent = cat?.parent_id ? catMap.get(cat.parent_id) : null;
    return {
      name: cat?.name ?? '-',
      parentName: parent?.name ?? '',
      color: cat?.color ?? '#60a5fa',
    };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    if (!value || value <= 0) {
      showAlert('예산 금액을 입력해주세요.');
      return;
    }
    try {
      const oldCatId = editingBudget?.category_id ?? null;
      const oldId = editingBudget?.id ?? null;

      await budgetsApi.create({
        category_id: categoryId,
        amount: value,
        month,
      });

      if (oldId && oldCatId && categoryId !== oldCatId) {
        await budgetsApi.delete(oldId);
      }

      setShowModal(false);
      await onRefresh();
    } catch {
      showAlert('예산 저장에 실패했습니다.');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    const confirmed = await showConfirm('이 예산을 삭제할까요?');
    if (!confirmed) return;
    try {
      await budgetsApi.delete(id);
      await onRefresh();
    } catch {
      showAlert('삭제에 실패했습니다.');
    }
  };

  const expenseTransactions = useMemo(
    () =>
      [...transactions]
        .filter((t) => t.type === 'expense' && t.date.startsWith(month))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [month, transactions]
  );

  const [expenseQuery, setExpenseQuery] = useState('');
  const [expensePerPage, setExpensePerPage] = useState<number>(30);
  const [expensePage, setExpensePage] = useState<number>(1);

  const expenseFiltered = useMemo(() => {
    const q = expenseQuery.trim().toLowerCase();
    if (!q) return expenseTransactions;
    return expenseTransactions.filter((t) => {
      const hay = `${t.date} ${formatDate(t.date)} ${String(t.amount)} ${formatCurrency(t.amount, currency)} ${
        t.category_name ?? ''
      } ${t.account_name ?? ''} ${t.memo ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [currency, expenseQuery, expenseTransactions]);

  const expenseTotalPages = Math.max(1, Math.ceil(expenseFiltered.length / expensePerPage));
  const expensePageSafe = Math.min(expenseTotalPages, Math.max(1, expensePage));
  const expensePageStart = (expensePageSafe - 1) * expensePerPage;
  const expensePageItems = expenseFiltered.slice(expensePageStart, expensePageStart + expensePerPage);
  const expenseShowingFrom = expenseFiltered.length === 0 ? 0 : expensePageStart + 1;
  const expenseShowingTo = Math.min(expenseFiltered.length, expensePageStart + expensePageItems.length);

  return (
    <>
      <div className="budget-grid budgets-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <LiquidPanel>
          <div className="panel-header">
            <div>
              <div className="panel-title">예산 관리</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>예산 추가</button>
          </div>

          <div className="transactions-table-lite budgets-table">
            <div className="budgets-budgetHead">
              <div className="budgets-cell budgets-cell-cat">카테고리</div>
              <div className="budgets-cell budgets-cell-num">예산</div>
              <div className="budgets-cell budgets-cell-num">사용액</div>
              <div className="budgets-cell budgets-cell-num">잔액</div>
              <div className="budgets-cell budgets-cell-actions">작업</div>
            </div>
            {budgetsSorted.map((budget) => {
              const spent = stats?.budgetUsage.find(b => b.category_id === budget.category_id)?.spent ?? expenseSpentMap[budget.category_id] ?? 0;
              const remaining = Math.max(0, budget.amount - spent);
              const label = budgetLabel(budget.category_id);
              return (
                <div
                  key={budget.id}
                  className={`budgets-budgetRow ${
                    draggingBudgetCatId === budget.category_id ? 'is-dragging' : ''
                  } ${dragOverBudgetCatId === budget.category_id ? 'is-dropTarget' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    const target = e.target as HTMLElement | null;
                    if (target?.closest('button')) {
                      e.preventDefault();
                      return;
                    }
                    setDraggingBudgetCatId(budget.category_id);
                    setDragOverBudgetCatId(null);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', budget.category_id);
                    if (e.dataTransfer.setDragImage) {
                      try {
                        e.dataTransfer.setDragImage(e.currentTarget, 16, 16);
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingBudgetCatId(null);
                    setDragOverBudgetCatId(null);
                  }}
                  onDragOver={(e) => {
                    if (!draggingBudgetCatId) return;
                    e.preventDefault();
                    setDragOverBudgetCatId(budget.category_id);
                  }}
                  onDragLeave={() => {
                    if (dragOverBudgetCatId === budget.category_id) setDragOverBudgetCatId(null);
                  }}
                  onDrop={() => {
                    if (!draggingBudgetCatId) return;
                    if (draggingBudgetCatId === budget.category_id) return;
                    moveBudget(draggingBudgetCatId, budget.category_id);
                    setDraggingBudgetCatId(null);
                    setDragOverBudgetCatId(null);
                  }}
                >
                  <div className="budgets-cell budgets-cell-cat">
                    <span className="budgets-dot" style={{ background: label.color }} />
                    <div className="budgets-catStack">
                      <div className="budgets-catName">{label.name}</div>
                      {label.parentName && <div className="budgets-catParent">{label.parentName}</div>}
                    </div>
                  </div>
                  <div className="budgets-cell budgets-cell-num">{formatCurrency(budget.amount, currency)}</div>
                  <div className="budgets-cell budgets-cell-num spent">{formatCurrency(spent, currency)}</div>
                  <div className="budgets-cell budgets-cell-num remaining">{formatCurrency(remaining, currency)}</div>
                  <div className="budgets-cell budgets-cell-actions">
                    <button className="btn btn-sm" draggable={false} onClick={() => openEdit(budget)}>수정</button>
                    <button className="btn btn-sm btn-danger" draggable={false} onClick={() => handleDeleteBudget(budget.id)}>삭제</button>
                  </div>
                </div>
		              );
		            })}
            {budgetsSorted.length === 0 && (
              <div className="text-center" style={{ padding: 40, color: 'var(--text-muted)' }}>
                예산이 없습니다. 
              </div>
            )}
          </div>
        </LiquidPanel>

        <LiquidPanel>
          <div className="panel-header">
            <div className="panel-title">지출 내역</div>
            <input
              className="budgets-search"
              type="search"
              placeholder="Search..."
              value={expenseQuery}
              onChange={(e) => {
                setExpenseQuery(e.target.value);
                setExpensePage(1);
              }}
            />
          </div>
          <div className="budgets-toolbar">
            <div className="budgets-toolbar-left">
              <span>Show</span>
              <div className="budgets-selectWrap">
                <select
                  className="budgets-select"
                  value={expensePerPage}
                  onChange={(e) => {
                    setExpensePerPage(Number(e.target.value));
                    setExpensePage(1);
                  }}
                >
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={70}>70</option>
                  <option value={100}>100</option>
                </select>
                <div className="budgets-selectArrow" aria-hidden="true">
                  <Icons.ChevronDown />
                </div>
              </div>
              <span>entries</span>
            </div>
          </div>
          <div className="transactions-table-lite budgets-expense-table manage-table">
            <div className="budgets-expenseHead">
              <div className="budgets-cell budgets-cell-dateHead">날짜</div>
              <div className="budgets-cell budgets-cell-catHead">카테고리</div>
              <div className="budgets-cell budgets-cell-numHead">금액</div>
              <div className="budgets-cell budgets-cell-accHead">계좌</div>
              <div className="budgets-cell budgets-cell-memoHead">메모</div>
            </div>
            {expensePageItems.map((t) => (
              <div key={t.id} className="budgets-expenseRow">
                <div className="budgets-cell budgets-cell-date">{formatDate(t.date)}</div>
                <div className="budgets-cell budgets-cell-catVal">{t.category_name}</div>
                <div className="budgets-cell budgets-cell-numVal">{formatCurrency(t.amount, currency)}</div>
                <div className="budgets-cell budgets-cell-accVal">{t.account_name || '-'}</div>
                <div className="budgets-cell budgets-cell-memoVal">{t.memo || '-'}</div>
              </div>
            ))}
            {expenseFiltered.length === 0 && (
              <div className="text-center" style={{ padding: 40, color: 'var(--text-muted)' }}>
                지출 내역이 없습니다.
              </div>
            )}
          </div>
          <div className="budgets-foot">
            <div className="budgets-rangeInfo">
              Showing {expenseShowingFrom} to {expenseShowingTo} of {expenseFiltered.length} entries
            </div>
            <div className="budgets-pager" aria-label="Expense table pagination">
              <button
                className="budgets-pagerBtn"
                type="button"
                onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                disabled={expensePageSafe <= 1}
                aria-label="Previous"
              >
                ‹
              </button>
              <span className="budgets-pagerText">
                {expensePageSafe}/{expenseTotalPages}
              </span>
              <button
                className="budgets-pagerBtn"
                type="button"
                onClick={() => setExpensePage((p) => Math.min(expenseTotalPages, p + 1))}
                disabled={expensePageSafe >= expenseTotalPages}
                aria-label="Next"
              >
                ›
              </button>
            </div>
          </div>
        </LiquidPanel>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="panel-title">{editingBudget ? '예산 수정' : '예산 추가'}</div>
                <div className="panel-sub">같은 카테고리는 덮어씌워집니다</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <Icons.Close />
              </button>
            </div>

            <form className="form" onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">카테고리</label>
                <select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {categories
                    .filter((p) => p.type === 'expense' && !p.parent_id)
                    .map((parent) => {
                      const leafChildren = leafExpenseCategories.filter((c) => c.parent_id === parent.id);
                      if (leafChildren.length === 0) return null;
                      return (
                        <optgroup key={parent.id} label={parent.name}>
                          {leafChildren.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                </select>
                {editingBudget && (
                  <div className="panel-sub" style={{ marginTop: 8 }}>
                    카테고리를 변경하면 기존 예산은 새 카테고리로 이동합니다.
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">예산 금액</label>
                <input
                  className="form-input"
                  placeholder="예: 300,000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">저장</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
