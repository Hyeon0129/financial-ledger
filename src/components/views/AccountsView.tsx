// Accounts & Loans View
import React, { useState, useMemo } from 'react';
import type { Account, Category, Loan } from '../../api';
import { accountsApi, loansApi, formatCurrency, formatDate } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';

interface AccountsViewProps {
  accounts: Account[];
  currency: string;
  monthlySpend: Record<string, number>;
  categories: Category[];
  loans: Loan[];
  onRefresh: () => void;
  onRefreshLoans: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ 
  accounts, currency, monthlySpend, categories, loans, onRefresh, onRefreshLoans 
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [showSettleForm, setShowSettleForm] = useState(false);
  const [settlingLoan, setSettlingLoan] = useState<Loan | null>(null);

  const cardThemes = [
    'card-theme-emerald',
    'card-theme-carbon',
    'card-theme-gold',
    'card-theme-slate',
    'card-theme-midnight',
    'card-theme-obsidian',
  ];

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('이 계좌를 삭제할까요?');
    if (!confirmed) return;
    await accountsApi.delete(id);
    onRefresh();
  };

  const handleDeleteLoan = async (id: string) => {
    const confirmed = await showConfirm('이 대출을 삭제할까요?');
    if (!confirmed) return;
    await loansApi.delete(id);
    await onRefreshLoans();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div></div>
        <button className="btn btn-primary" onClick={() => { setEditingAccount(null); setShowForm(true); }}>
          <Icons.Plus /> 새 계좌
        </button>
      </div>

      <div className="account-grid">
        {accounts.map((account, idx) => {
          const theme = cardThemes[idx % cardThemes.length];
          return (
            <div
              key={account.id}
              className={`account-card bank-card real ${theme}`}
              onClick={() => { setEditingAccount(account); setShowForm(true); }}
            >
              <div className="account-card-top">
                <div className="account-title">{account.name}</div>
              </div>
              <div className="account-card-bottom">
                <div className="account-balance-big">
                  {formatCurrency(account.balance, currency)}
                </div>
                <div className="account-balance-sub">
                  이번 달 사용: {formatCurrency(monthlySpend[account.id] ?? 0, currency)}
                </div>
              </div>
              <div className="account-card-actions">
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingAccount(account);
                    setShowForm(true);
                  }}
                >
                  수정
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(account.id);
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel-block loans-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">대출</div>
            <div className="panel-sub">상환 일정과 잔액을 관리합니다</div>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditingLoan(null); setShowLoanForm(true); }}>
            <Icons.Plus /> 새 대출
          </button>
        </div>

        <div className="transactions-table-lite manage-table">
          <div className="tx-row manage-head" style={{ gridTemplateColumns: '1.4fr 0.8fr 0.9fr 0.9fr 0.9fr 1fr 0.9fr 0.9fr 0.9fr 1fr' }}>
            <div className="tx-col-label">대출명</div>
            <div className="tx-col-amount">금리(연)</div>
            <div className="tx-col-amount">남은 원금</div>
            <div className="tx-col-amount">월 상환액</div>
            <div className="tx-col-amount">대출금액</div>
            <div className="tx-col-progress">진행률</div>
            <div className="tx-col-amount">남은 개월</div>
            <div className="tx-col-amount">상환 방식</div>
            <div className="tx-col-date">다음 납부일</div>
            <div className="tx-col-actions">작업</div>
          </div>

          {loans.map((loan) => {
            const monthsLeft = Math.max(0, loan.term_months - loan.paid_months);
            const paidAmount = Math.max(0, loan.principal - (loan.remaining_principal ?? 0));
            const progress = loan.principal > 0 ? Math.min(100, (paidAmount / loan.principal) * 100) : 0;
            return (
              <div
                key={loan.id}
                className="tx-row manage-row loan-row-with-tooltip"
                data-tooltip={`매달 납부일: 매월 ${loan.monthly_due_day}일`}
                style={{ gridTemplateColumns: '1.4fr 0.8fr 0.9fr 0.9fr 0.9fr 1fr 0.9fr 0.9fr 0.9fr 1fr' }}
              >
                <div className="tx-main tx-col-label">
                  <div className="tx-main-text">
                    <div className="tx-name">{loan.name}</div>
                    <div className="tx-memo" style={{ marginTop: 2 }}>
                      {loan.account_name || '계좌 없음'}{loan.category_name ? ` · ${loan.category_name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="tx-col-amount">{loan.interest_rate}%</div>
                <div className="tx-amount tx-col-amount">{formatCurrency(Math.round(loan.remaining_principal), currency)}</div>
                <div className="tx-amount tx-col-amount negative">{formatCurrency(loan.monthly_payment, currency)}</div>
                <div className="tx-col-amount">{formatCurrency(loan.principal, currency)}</div>
                <div className="tx-col-progress">
                  <div className="tx-progress-bar">
                    <div className="tx-progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="tx-progress-text">{progress.toFixed(0)}%</div>
                </div>
                <div className="tx-col-amount">{monthsLeft}개월</div>
                <div className="tx-col-amount">
                  {loan.repayment_type === 'interest_only'
                    ? '이자만'
                    : loan.repayment_type === 'principal_equal'
                      ? '원금균등'
                      : '원리금'}
                </div>
                <div className="tx-col-date">{loan.next_due_date ? formatDate(loan.next_due_date) : '완납'}</div>
                <div className="tx-col-actions">
                  <button className="btn btn-sm" onClick={() => { setEditingLoan(loan); setShowLoanForm(true); }}>수정</button>
                  <button className="btn btn-sm" onClick={() => { setSettlingLoan(loan); setShowSettleForm(true); }}>상환</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteLoan(loan.id)}>삭제</button>
                </div>
              </div>
            );
          })}

          {loans.length === 0 && (
            <div className="tx-row" style={{ justifyContent: 'center' }}>
              <div className="tx-main" style={{ justifyContent: 'center' }}>
                <div className="tx-name" style={{ color: 'var(--text-tertiary)' }}>
                  등록된 대출이 없습니다. 상단 버튼으로 추가하세요.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <AccountFormModal
          account={editingAccount}
          onClose={() => { setShowForm(false); setEditingAccount(null); }}
          onSave={() => {
            setShowForm(false);
            setEditingAccount(null);
            onRefresh();
          }}
        />
      )}

      {showLoanForm && (
        <LoanFormModal
          categories={categories}
          accounts={accounts}
          loan={editingLoan}
          onClose={() => { setShowLoanForm(false); setEditingLoan(null); }}
          onSave={async () => {
            setShowLoanForm(false);
            setEditingLoan(null);
            await onRefreshLoans();
          }}
        />
      )}
      
      {showSettleForm && settlingLoan && (
        <LoanSettleModal
          loan={settlingLoan}
          accounts={accounts}
          onClose={() => { setShowSettleForm(false); setSettlingLoan(null); }}
          onSettled={async () => {
            setShowSettleForm(false);
            setSettlingLoan(null);
            await onRefreshLoans();
            await onRefresh();
          }}
        />
      )}
    </>
  );
};

// Account Form Modal
const AccountFormModal: React.FC<{
  account?: Account | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ account, onClose, onSave }) => {
  const isEdit = !!account?.id;
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<'cash' | 'bank' | 'card' | 'investment'>(account?.type ?? 'bank');
  const [balance, setBalance] = useState(account ? String(account.balance) : '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('계좌 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const color = account?.color ?? '#3B82F6';
      const payload = {
        name: name.trim(),
        type,
        balance: Number(balance.replace(/,/g, '')) || 0,
        color,
        icon: account?.icon ?? null,
      };
      if (account?.id) {
        await accountsApi.update(account.id, payload);
      } else {
        await accountsApi.create(payload);
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
            <div className="panel-title">{isEdit ? '계좌 수정' : '새 계좌'}</div>
            <div className="panel-sub">{isEdit ? '계좌 정보를 수정합니다' : '계좌 정보를 입력해주세요'}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">이름</label>
            <input
              className="form-input"
              placeholder="예: 주거래 통장, 신용카드"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">유형</label>
            <select
              className="form-select"
              value={type}
              onChange={(e) => setType(e.target.value as 'cash' | 'bank' | 'card' | 'investment')}
            >
              <option value="cash">현금</option>
              <option value="bank">은행 계좌</option>
              <option value="card">카드</option>
              <option value="investment">투자</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">잔액</label>
            <input
              className="form-input"
              placeholder="예: 1,000,000"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Loan Form Modal
const LoanFormModal: React.FC<{
  loan?: Loan | null;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSave: () => void;
}> = ({ loan, categories, accounts, onClose, onSave }) => {
  const isEdit = !!loan?.id;
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(loan?.name ?? '');
  const [principal, setPrincipal] = useState(loan ? String(loan.principal) : '');
  const [interestRate, setInterestRate] = useState(loan ? String(loan.interest_rate) : '');
  const [termMonths, setTermMonths] = useState(loan ? String(loan.term_months) : '');
  const [startDate, setStartDate] = useState(loan?.start_date ?? today);
  const [dueDay, setDueDay] = useState(loan?.monthly_due_day ?? 1);
  const [accountId, setAccountId] = useState(loan?.account_id ?? accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(loan?.category_id ?? (categories.find((c) => c.type === 'expense')?.id ?? ''));
  const [repayType, setRepayType] = useState<'amortized' | 'interest_only' | 'principal_equal'>(loan?.repayment_type ?? 'amortized');
  const [saving, setSaving] = useState(false);

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('대출 이름을 입력해주세요.');
      return;
    }
    const principalNum = Number(principal.replace(/,/g, ''));
    if (!principalNum || principalNum <= 0) {
      showAlert('대출 금액을 입력해주세요.');
      return;
    }
    const rateNum = Number(interestRate);
    if (Number.isNaN(rateNum) || rateNum < 0) {
      showAlert('금리를 입력해주세요.');
      return;
    }
    const termNum = Number(termMonths);
    if (!termNum || termNum <= 0) {
      showAlert('기간(개월)을 입력해주세요.');
      return;
    }
    if (!accountId) {
      showAlert('납부 계좌를 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && loan) {
        await loansApi.update(loan.id, {
          name: name.trim(),
          principal: principalNum,
          interest_rate: rateNum,
          term_months: termNum,
          start_date: startDate,
          monthly_due_day: dueDay,
          account_id: accountId,
          category_id: categoryId || null,
          repayment_type: repayType,
        });
      } else {
        await loansApi.create({
          name: name.trim(),
          principal: principalNum,
          interest_rate: rateNum,
          term_months: termNum,
          start_date: startDate,
          monthly_due_day: dueDay,
          account_id: accountId,
          category_id: categoryId || null,
          repayment_type: repayType,
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
            <div className="panel-title">{isEdit ? '대출 수정' : '새 대출'}</div>
            <div className="panel-sub">상환 일정과 금리를 입력하세요</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">대출 이름</label>
            <input
              className="form-input"
              placeholder="예: 주택담보대출"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">대출 금액</label>
              <input
                className="form-input"
                placeholder="예: 100,000,000"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">연 이자율 (%)</label>
              <input
                className="form-input"
                placeholder="예: 4.5"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">기간 (개월)</label>
              <input
                className="form-input"
                placeholder="예: 360"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">대출 시작일</label>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">상환 방식</label>
              <select
                className="form-select"
                value={repayType}
                onChange={(e) => setRepayType(e.target.value as 'amortized' | 'interest_only' | 'principal_equal')}
              >
                <option value="amortized">원리금 균등</option>
                <option value="interest_only">이자만 상환</option>
                <option value="principal_equal">원금 균등</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">매월 납부일</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={28}
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">납부 계좌</label>
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
          </div>

          <div className="form-group">
            <label className="form-label">카테고리 (선택)</label>
            <select
              className="form-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">선택 안 함</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Loan Settle Modal
const LoanSettleModal: React.FC<{
  loan: Loan;
  accounts: Account[];
  onClose: () => void;
  onSettled: () => void;
}> = ({ loan, accounts, onClose, onSettled }) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(loan.account_id || accounts[0]?.id || '');
  const [saving, setSaving] = useState(false);

  const remaining = loan.remaining_principal;
  const parsedAmount = amount.trim().length > 0 ? Number(amount.replace(/,/g, '')) : remaining;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pay = parsedAmount;
    if (!pay || pay <= 0) {
      showAlert('상환 금액을 입력해주세요.');
      return;
    }
    if (!accountId) {
      showAlert('상환 계좌를 선택해주세요.');
      return;
    }
    setSaving(true);
    try {
      await loansApi.settle(loan.id, {
        settled_at: date,
        amount: pay,
        account_id: accountId,
      });
      onSettled();
    } catch {
      showAlert('상환 처리에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div className="panel-title">대출 상환</div>
            <div className="panel-sub">상환 일자, 금액, 계좌를 선택하세요</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">상환 일자</label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">상환 금액 (남은 원금: {formatCurrency(remaining, '₩')})</label>
            <input
              className="form-input"
              placeholder={formatCurrency(remaining, '₩')}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">상환 계좌</label>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '상환 중...' : '상환 완료'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
