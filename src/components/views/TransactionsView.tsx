// Transactions View - Calendar & Transaction Management
import React, { useState, useMemo, useEffect } from 'react';
import type { Transaction, Category, Account } from '../../api';
import { transactionsApi, formatCurrency, formatDate, getMonthKey } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';

interface TransactionsViewProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  currency: string;
  month: string;
  onRefresh: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  categories,
  accounts,
  currency,
  month,
  onRefresh,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('이 거래를 삭제할까요?');
    if (!confirmed) return;
    await transactionsApi.delete(id);
    await onRefresh();
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number);
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();
    
    const days: Array<{ date: string; isCurrentMonth: boolean; dayNum: number }> = [];
    
    // Previous month days
    const prevMonthLastDay = new Date(year, monthNum - 1, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      days.push({
        date: `${year}-${String(monthNum - 1).padStart(2, '0')}-${String(prevMonthLastDay - i).padStart(2, '0')}`,
        isCurrentMonth: false,
        dayNum: prevMonthLastDay - i
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: `${year}-${String(monthNum).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        isCurrentMonth: true,
        dayNum: i
      });
    }
    
    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        isCurrentMonth: false,
        dayNum: i
      });
    }
    
    return days;
  }, [month]);

  // Group transactions by date
  const transactionsByDate = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};
    transactions.forEach(t => {
      if (!grouped[t.date]) grouped[t.date] = [];
      grouped[t.date].push(t);
    });
    return grouped;
  }, [transactions]);

  const selectedDayTransactions = selectedDate ? transactionsByDate[selectedDate] || [] : [];
  const today = new Date().toISOString().split('T')[0];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="panel-sub">{transactions.length}건</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingTransaction(null); setShowForm(true); }}>
          <Icons.Plus /> 새 거래
        </button>
      </div>

      <div className="panel" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="panel-main">
          <div className="calendar">
            <div className="calendar-header">일</div>
            <div className="calendar-header">월</div>
            <div className="calendar-header">화</div>
            <div className="calendar-header">수</div>
            <div className="calendar-header">목</div>
            <div className="calendar-header">금</div>
            <div className="calendar-header">토</div>
            
            {calendarDays.map((day, idx) => {
              const dayTransactions = transactionsByDate[day.date] || [];
              const isToday = day.date === today;
              
              return (
                <div 
                  key={idx}
                  className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${selectedDate === day.date ? 'selected' : ''}`}
                  onClick={() => day.isCurrentMonth && setSelectedDate(day.date)}
                >
                  <div className="calendar-day-number">{day.dayNum}</div>
                  <div className="calendar-transactions">
                    {dayTransactions.slice(0, 3).map((t, i) => (
                      <div key={i} className={`calendar-transaction-item ${t.type}`}>
                        {formatCurrency(t.amount, currency)}
                      </div>
                    ))}
                    {dayTransactions.length > 3 && (
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        +{dayTransactions.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel-side">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                {selectedDate ? formatDate(selectedDate) : '날짜를 선택하세요'}
              </div>
              <div className="panel-sub">
                {selectedDayTransactions.length} transactions
              </div>
            </div>
          </div>

          {selectedDayTransactions.length > 0 ? (
            <div className="transactions-table-lite manage-table">
              <div className="tx-row manage-head">
                <div className="tx-col-type">유형</div>
                <div className="tx-col-label">카테고리</div>
                <div className="tx-col-amount">금액</div>
                <div className="tx-col-actions">작업</div>
              </div>
              {selectedDayTransactions.map((t) => (
                <div key={t.id} className="tx-row manage-row">
                  <div className="tx-col-type">
                    <span className={`badge ${t.type}`}>
                      {t.type === 'income' ? '수입' : t.type === 'expense' ? '지출' : '이체'}
                    </span>
                  </div>
                  <div className="tx-main tx-col-label">
                    <div className="tx-main-text">
                      <div className="tx-name">{t.category_name}</div>
                      {t.memo && (
                        <div className="tx-memo">{t.memo}</div>
                      )}
                    </div>
                  </div>
                  <div className={`tx-amount tx-col-amount ${t.type === 'income' ? 'positive' : t.type === 'expense' ? 'negative' : ''}`}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '→ '}{formatCurrency(t.amount, currency)}
                  </div>
                  <div className="tx-col-actions">
                    <button className="btn btn-sm" onClick={() => handleEdit(t)}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          ) : selectedDate ? (
            <div className="empty-state">
              <div className="empty-state-text">거래가 없습니다</div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-text">날짜를 선택하면 거래를 볼 수 있습니다</div>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <TransactionFormModal
          categories={categories}
          accounts={accounts}
          defaultMonth={month}
          editingTransaction={editingTransaction}
          onClose={() => { setShowForm(false); setEditingTransaction(null); }}
          onSave={() => {
            setShowForm(false);
            setEditingTransaction(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

// Transaction Form Modal
const TransactionFormModal: React.FC<{
  categories: Category[];
  accounts: Account[];
  defaultMonth: string;
  editingTransaction?: Transaction | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ categories, accounts, defaultMonth, editingTransaction, onClose, onSave }) => {
  const today = new Date();
  const defaultDate = defaultMonth === getMonthKey(today)
    ? today.toISOString().split('T')[0]
    : `${defaultMonth}-01`;

  const [date, setDate] = useState(editingTransaction?.date || defaultDate);
  const [type, setType] = useState<Transaction['type']>((editingTransaction?.type as Transaction['type']) || 'expense');
  const [accountId, setAccountId] = useState(editingTransaction?.account_id || accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(
    editingTransaction?.to_account_id ||
      accounts.find((a) => a.id !== (editingTransaction?.account_id || accounts[0]?.id))?.id ||
      accounts[0]?.id ||
      ''
  );
  const [categoryId, setCategoryId] = useState(editingTransaction?.category_id || '');
  const [amount, setAmount] = useState(editingTransaction ? String(editingTransaction.amount) : '');
  const [memo, setMemo] = useState(editingTransaction?.memo || '');
  const [saving, setSaving] = useState(false);

  const filteredCategories = useMemo(
    () => (type === 'transfer' ? [] : categories.filter((c) => c.type === type)),
    [categories, type]
  );

  const groupedCategories = useMemo(() => {
    const parents = filteredCategories.filter((c) => !c.parent_id);
    return parents.map((parent) => ({
      parent,
      children: filteredCategories.filter((c) => c.parent_id === parent.id),
    }));
  }, [filteredCategories]);

  useEffect(() => {
    if (type === 'transfer') {
      setCategoryId('');
      return;
    }
    const first = filteredCategories.find((c) => c.id === categoryId) || filteredCategories[0];
    if (first) {
      setCategoryId(first.id);
    }
  }, [type, filteredCategories, categoryId]);

  useEffect(() => {
    if (type !== 'transfer') return;
    if (accountId && toAccountId === accountId) {
      const next = accounts.find((a) => a.id !== accountId);
      if (next?.id) setToAccountId(next.id);
    }
  }, [type, accountId, toAccountId, accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    if (!value || value <= 0) {
      showAlert('금액을 입력해주세요.');
      return;
    }
    if (type === 'transfer') {
      if (!accountId || !toAccountId || accountId === toAccountId) {
        showAlert('출금/입금 계좌를 다르게 선택해주세요.');
        return;
      }
    }
    
    setSaving(true);
    try {
      if (editingTransaction) {
        const updated = await transactionsApi.update(editingTransaction.id, {
          date,
          type,
          account_id: accountId,
          to_account_id: type === 'transfer' ? toAccountId : null,
          category_id: type === 'transfer' ? null : categoryId,
          amount: value,
          memo: memo.trim() || null,
        });
        if (updated?.id && updated.id !== editingTransaction.id) {
          try {
            await transactionsApi.delete(editingTransaction.id);
          } catch {
            // Ignore deletion errors
          }
        }
      } else {
        await transactionsApi.create({
          date,
          type,
          account_id: accountId,
          to_account_id: type === 'transfer' ? toAccountId : null,
          category_id: type === 'transfer' ? null : categoryId,
          amount: value,
          memo: memo.trim() || null,
        });
      }
      onSave();
    } catch {
      showAlert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="panel-title">{editingTransaction ? 'Edit Transaction' : 'New Transaction'}</div>
            <div className="panel-sub">{editingTransaction ? 'Update transaction details' : 'Enter transaction details'}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="form-select"
                value={type}
                onChange={(e) => setType(e.target.value as Transaction['type'])}
              >
                <option value="expense">지출</option>
                <option value="income">수입</option>
                <option value="transfer">이체</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            {type === 'transfer' ? (
              <>
                <div className="form-group">
                  <label className="form-label">출금 계좌</label>
                  <select
                    className="form-select"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">입금 계좌</label>
                  <select
                    className="form-select"
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Account</label>
                  <select
                    className="form-select"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    {groupedCategories.map((group) =>
                      group.children.length > 0 ? (
                        <optgroup key={group.parent.id} label={group.parent.name}>
                          {group.children.map((child) => (
                            <option key={child.id} value={child.id}>
                              {child.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : (
                        <option key={group.parent.id} value={group.parent.id}>
                          {group.parent.name}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Amount</label>
            <input
              className="form-input"
              placeholder="e.g. 50,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Memo</label>
            <textarea
              className="form-textarea"
              placeholder="Optional description"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

