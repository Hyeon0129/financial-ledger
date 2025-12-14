// Transactions View - Calendar & Transaction Management
import React, { useState, useMemo, useEffect } from 'react';
import type { Transaction, Category, Account } from '../../api';
import { transactionsApi, formatCurrency, formatDate, getMonthKey } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';
import { LiquidPanel } from '../common/LiquidPanel';

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

  const selectedDaySummary = useMemo(() => {
    const summary = { income: 0, expense: 0, transfer: 0 };
    for (const t of selectedDayTransactions) {
      if (t.type === 'income') summary.income += t.amount;
      else if (t.type === 'expense') summary.expense += t.amount;
      else summary.transfer += t.amount;
    }
    return summary;
  }, [selectedDayTransactions]);

  return (
    <>
      <div className="transactions-toolbar">
        <h2 className="panel-title">Transactions</h2>
        <button className="btn btn-primary" onClick={() => { setEditingTransaction(null); setShowForm(true); }}>
          <Icons.Plus /> 새 거래
        </button>
      </div>

      <div className="transactions-layout">
        <LiquidPanel className="tx-calendarPanel">
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
              const isSelected = selectedDate === day.date;
              
              return (
                <div 
                  key={idx}
                  className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
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
        </LiquidPanel>

        <LiquidPanel className="tx-dayPanel">
          <div className="tx-dayHeader">
            <div>
              <div className="tx-dayTitle">{selectedDate ? formatDate(selectedDate) : '날짜를 선택하세요'}</div>
              <div className="tx-daySub">{selectedDayTransactions.length}건의 거래</div>
            </div>
            {selectedDate && (
              <div className="tx-dayTotals">
                <div className="tx-dayTotal income">
                  <span className="tx-dayTotalLabel">수입</span>
                  <span className="tx-dayTotalVal">{formatCurrency(selectedDaySummary.income, currency)}</span>
                </div>
                <div className="tx-dayTotal expense">
                  <span className="tx-dayTotalLabel">지출</span>
                  <span className="tx-dayTotalVal">{formatCurrency(selectedDaySummary.expense, currency)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="tx-dayBody">
            {selectedDayTransactions.length > 0 ? (
              <div className="tx-dayTableWrap">
                <div className="tx-dayTableHead">
                  <div className="tx-dayCol-date">날짜</div>
                  <div className="tx-dayCol-type">유형</div>
                  <div className="tx-dayCol-cat">카테고리</div>
                  <div className="tx-dayCol-amt">금액</div>
                  <div className="tx-dayCol-acc">계좌</div>
                  <div className="tx-dayCol-memo">메모</div>
                  <div className="tx-dayCol-actions">관리</div>
                </div>

                <div className="tx-dayTableBody">
                  {selectedDayTransactions.map((t) => (
                    <div key={t.id} className="tx-dayTableRow">
                      <div className="tx-dayCol-date">{formatDate(t.date)}</div>
                      <div className="tx-dayCol-type">
                        <span className={`badge ${t.type}`}>
                          {t.type === 'income' ? '수입' : t.type === 'expense' ? '지출' : '이체'}
                        </span>
                      </div>
                      <div className="tx-dayCol-cat">{t.category_name || 'Uncategorized'}</div>
                      <div className={`tx-dayCol-amt ${t.type}`}>
                        {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                        {formatCurrency(t.amount, currency)}
                      </div>
                      <div className="tx-dayCol-acc">{t.account_name || '-'}</div>
                      <div className="tx-dayCol-memo">{t.memo || '-'}</div>
                      <div className="tx-dayCol-actions">
                        <button className="btn btn-sm" onClick={() => handleEdit(t)}>
                          수정
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="tx-dayEmpty">
                {selectedDate ? '거래 내역이 없습니다.' : '달력에서 날짜를 선택하여 상세 내역을 확인하세요.'}
              </div>
            )}
          </div>
        </LiquidPanel>
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

// Transaction Form Modal (Subcomponent) - Kept same logic but wrapped with standard modal classes
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
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>(
    (editingTransaction?.type as any) || 'expense'
  );
  // ... (Keep existing form logic)
  // Simply re-using the logic from previous file read, but applying consistent modal styles
  const [accountId, setAccountId] = useState(editingTransaction?.account_id || accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(editingTransaction?.to_account_id || '');
  const [categoryId, setCategoryId] = useState(editingTransaction?.category_id || '');
  const [amount, setAmount] = useState(editingTransaction ? String(editingTransaction.amount) : '');
  const [memo, setMemo] = useState(editingTransaction?.memo || '');
  const [saving, setSaving] = useState(false);

  // ... (Effect hooks for category filtering) ...
  const filteredCategories = useMemo(
    () => (type === 'transfer' ? [] : categories.filter((c) => c.type === type)),
    [categories, type]
  );

  useEffect(() => {
    if (type === 'transfer') return;
    if (!categoryId && filteredCategories.length > 0) {
      setCategoryId(filteredCategories[0].id);
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
    if (!value) { showAlert('금액을 입력해주세요'); return; }
    
    setSaving(true);
    try {
      const payload = {
        date, type, account_id: accountId, amount: value, memo,
        category_id: type === 'transfer' ? null : categoryId,
        to_account_id: type === 'transfer' ? toAccountId : null
      };

      if (editingTransaction) {
        await transactionsApi.update(editingTransaction.id, payload);
      } else {
        await transactionsApi.create(payload);
      }
      onSave();
    } catch {
      showAlert('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">{editingTransaction ? '거래 수정' : '새 거래'}</h3>
          <button className="modal-close" onClick={onClose}><Icons.Close /></button>
        </div>
        <form className="form" onSubmit={handleSubmit}>
          {/* Form Fields ... */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">날짜</label>
              <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">유형</label>
              <select className="form-select" value={type} onChange={e => setType(e.target.value as any)}>
                <option value="expense">지출</option>
                <option value="income">수입</option>
                <option value="transfer">이체</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">금액</label>
            <input className="form-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{type === 'transfer' ? '출금 계좌' : '계좌'}</label>
              <select className="form-select" value={accountId} onChange={e => setAccountId(e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {type === 'transfer' ? (
              <div className="form-group">
                <label className="form-label">입금 계좌</label>
                <select className="form-select" value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">카테고리</label>
                <select className="form-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">메모</label>
            <input className="form-input" value={memo} onChange={e => setMemo(e.target.value)} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
