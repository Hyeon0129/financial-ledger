// Budgets View
import React, { useState, useMemo } from 'react';
import type { Budget, Category, Transaction, MonthlyStats } from '../../api';
import { budgetsApi, formatCurrency, formatDate } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';

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
      <div className="panel budget-grid">
        <div className="panel-main budget-half">
          <div className="panel-header">
            <div>
              <div className="panel-title">예산 관리</div>
              <div className="panel-sub">{month}  예산</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>예산 추가</button>
          </div>

          <div className="transactions-table-lite budgets-table">
            <div className="tx-row manage-head">
              <div className="tx-col-label">카테고리</div>
              <div className="tx-col-amount">예산</div>
              <div className="tx-col-amount">사용액</div>
              <div className="tx-col-amount">잔액</div>
              <div className="tx-col-actions">작업</div>
            </div>
            {budgets.map((budget) => {
              const spent = stats?.budgetUsage.find(b => b.category_id === budget.category_id)?.spent ?? expenseSpentMap[budget.category_id] ?? 0;
              const remaining = Math.max(0, budget.amount - spent);
              return (
                <div key={budget.id} className="tx-row manage-row">
                  <div className="tx-main tx-col-label">
                    <span className="tx-dot" style={{ background: budget.category_color || '#60a5fa' }} />
                    <div className="tx-main-text">
                      <div className="tx-name">{budget.category_name}</div>
                    </div>
                  </div>
                  <div className="tx-amount tx-col-amount">{formatCurrency(budget.amount, currency)}</div>
                  <div className="tx-amount tx-col-amount negative">{formatCurrency(spent, currency)}</div>
                  <div className="tx-amount tx-col-amount positive">{formatCurrency(remaining, currency)}</div>
                  <div className="tx-col-actions">
                    <button className="btn btn-sm" onClick={() => openEdit(budget)}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteBudget(budget.id)}>삭제</button>
                  </div>
                </div>
              );
            })}
            {budgets.length === 0 && (
              <div className="tx-row" style={{ justifyContent: 'center' }}>
                <div className="tx-main" style={{ justifyContent: 'center' }}>
                  <div className="tx-name" style={{ color: 'var(--text-tertiary)' }}>
                    예산이 없습니다. 
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="panel-side budget-half">
          <div className="panel-header">
            <div>
              <div className="panel-title">지출 내역</div>
            </div>
          </div>
          <div className="transactions-table-lite budgets-expense-table manage-table">
            <div className="tx-row manage-head">
              <div className="tx-col-date">날짜</div>
              <div className="tx-col-label">카테고리</div>
              <div className="tx-col-amount">금액</div>
              <div className="tx-col-account">계좌</div>
              <div className="tx-col-memo">메모</div>
            </div>
            {expenseTransactions.map((t) => (
              <div key={t.id} className="tx-row manage-row">
                <div className="tx-col-date">{formatDate(t.date)}</div>
                <div className="tx-main tx-col-label">
                  <div className="tx-main-text">
                    <div className="tx-name">{t.category_name}</div>
                  </div>
                </div>
                <div className="tx-amount tx-col-amount negative">{formatCurrency(t.amount, currency)}</div>
                <div className="tx-col-account">{t.account_name || '-'}</div>
                <div className="tx-col-memo">{t.memo || '-'}</div>
              </div>
            ))}
            {expenseTransactions.length === 0 && (
              <div className="tx-row" style={{ justifyContent: 'center' }}>
                <div className="tx-main" style={{ justifyContent: 'center' }}>
                  <div className="tx-name" style={{ color: 'var(--text-tertiary)' }}>
                    지출 내역이 없습니다.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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

