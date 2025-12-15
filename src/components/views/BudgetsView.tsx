// Budgets View
import React, { useState, useMemo } from 'react';
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
  budgets, categories, stats, currency, transactions, onRefresh 
}) => {
  const expenseCategories = useMemo(() => 
    categories.filter((c) => c.type === 'expense'),
    [categories]
  );

  const expenseSpentMap = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const key = t.category_id || 'unknown';
        map[key] = (map[key] || 0) + t.amount;
      });
    return map;
  }, [transactions]);

  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [categoryId, setCategoryId] = useState(() => expenseCategories[0]?.id ?? '');
  const [amount, setAmount] = useState('');

  const openCreate = () => {
    setEditingBudget(null);
    setCategoryId(expenseCategories[0]?.id ?? '');
    setAmount('');
    setShowModal(true);
  };

  const openEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setCategoryId(budget.category_id);
    setAmount(String(budget.amount));
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    if (!value || value <= 0) {
      showAlert('예산 금액을 입력해주세요.');
      return;
    }
    try {
      await budgetsApi.create({
        category_id: categoryId,
        amount: value,
      });
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
    () => transactions.filter((t) => t.type === 'expense'),
    [transactions]
  );

  return (
    <>
      <div className="budget-grid budgets-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
            {budgets.map((budget) => {
              const spent = stats?.budgetUsage.find(b => b.category_id === budget.category_id)?.spent ?? expenseSpentMap[budget.category_id] ?? 0;
              const remaining = Math.max(0, budget.amount - spent);
              return (
                <div key={budget.id} className="budgets-budgetRow">
                  <div className="budgets-cell budgets-cell-cat">
                    <span className="budgets-dot" style={{ background: budget.category_color || '#60a5fa' }} />
                    <span className="budgets-catName">{budget.category_name}</span>
                  </div>
                  <div className="budgets-cell budgets-cell-num">{formatCurrency(budget.amount, currency)}</div>
                  <div className="budgets-cell budgets-cell-num spent">{formatCurrency(spent, currency)}</div>
                  <div className="budgets-cell budgets-cell-num remaining">{formatCurrency(remaining, currency)}</div>
                  <div className="budgets-cell budgets-cell-actions">
                    <button className="btn btn-sm" onClick={() => openEdit(budget)}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteBudget(budget.id)}>삭제</button>
                  </div>
                </div>
		              );
		            })}
            {budgets.length === 0 && (
              <div className="text-center" style={{ padding: 40, color: 'var(--text-muted)' }}>
                예산이 없습니다. 
              </div>
            )}
          </div>
        </LiquidPanel>

        <LiquidPanel>
          <div className="panel-header">
            <div>
              <div className="panel-title">지출 내역</div>
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
            {expenseTransactions.map((t) => (
              <div key={t.id} className="budgets-expenseRow">
                <div className="budgets-cell budgets-cell-date">{formatDate(t.date)}</div>
                <div className="budgets-cell budgets-cell-catVal">{t.category_name}</div>
                <div className="budgets-cell budgets-cell-numVal">{formatCurrency(t.amount, currency)}</div>
                <div className="budgets-cell budgets-cell-accVal">{t.account_name || '-'}</div>
                <div className="budgets-cell budgets-cell-memoVal">{t.memo || '-'}</div>
              </div>
            ))}
            {expenseTransactions.length === 0 && (
              <div className="text-center" style={{ padding: 40, color: 'var(--text-muted)' }}>
                지출 내역이 없습니다.
              </div>
            )}
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
                <select
                  className="form-select"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {categories
                    .filter((p) => p.type === 'expense' && !p.parent_id)
                    .map((parent) => {
                      const children = categories.filter((c) => c.parent_id === parent.id);
                      const leafChildren = children.filter((c) => !categories.some((cc) => cc.parent_id === c.id));
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
