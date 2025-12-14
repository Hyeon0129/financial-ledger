// Accounts & Loans View
import React, { useState } from 'react';
import type { Account, Category, Loan } from '../../api';
import { accountsApi, loansApi, formatCurrency, formatDate } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';
import { AccountCard } from '../common/AccountCard';
import { LiquidPanel } from '../common/LiquidPanel';

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

  const handleDeleteLoan = async (id: string) => {
    const confirmed = await showConfirm('이 대출을 삭제할까요?');
    if (!confirmed) return;
    await loansApi.delete(id);
    await onRefreshLoans();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 className="panel-title">My Accounts</h2>
        <button className="btn btn-primary" onClick={() => { setEditingAccount(null); setShowForm(true); }}>
          <Icons.Plus /> 새 계좌
        </button>
      </div>

      <div className="account-grid">
        {accounts.map((account, idx) => (
          <div key={account.id} onClick={() => { setEditingAccount(account); setShowForm(true); }} style={{cursor: 'pointer'}}>
            <AccountCard 
              account={account} 
              index={idx} 
              currency={currency}
              monthlySpend={monthlySpend[account.id] || 0}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="panel-title">Loans</h2>
        <button className="btn btn-primary" onClick={() => { setEditingLoan(null); setShowLoanForm(true); }}>
          <Icons.Plus /> 새 대출
        </button>
      </div>

      <LiquidPanel>
        <div style={{ overflowX: 'auto' }}>
          <div className="loan-table">
            <div className="loan-head">
              <div className="loan-col-name">대출명</div>
              <div className="loan-col-num">남은 원금</div>
              <div className="loan-col-num">월 상환액</div>
              <div className="loan-col-rate">금리</div>
              <div className="loan-col-progress">진행률</div>
              <div className="loan-col-due">다음 납부</div>
              <div className="loan-col-actions">관리</div>
            </div>

            {loans.map((loan) => {
              const paidAmount = Math.max(0, loan.principal - (loan.remaining_principal ?? 0));
              const progress = loan.principal > 0 ? Math.min(100, (paidAmount / loan.principal) * 100) : 0;
              return (
                <div key={loan.id} className="loan-row">
                  <div className="loan-col-name">
                    <div className="loan-name">{loan.name}</div>
                    <div className="loan-sub">{loan.account_name || '계좌 없음'}</div>
                  </div>
                  <div className="loan-col-num loan-strong">{formatCurrency(Math.round(loan.remaining_principal), currency)}</div>
                  <div className="loan-col-num loan-danger">{formatCurrency(loan.monthly_payment, currency)}</div>
                  <div className="loan-col-rate">{loan.interest_rate}%</div>
                  <div className="loan-col-progress">
                    <div className="loan-progress">
                      <div className="loan-progressTrack">
                        <div className="loan-progressFill" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="loan-progressPct">{progress.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="loan-col-due">{loan.next_due_date ? formatDate(loan.next_due_date) : '완납'}</div>
                  <div className="loan-col-actions">
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettlingLoan(loan);
                        setShowSettleForm(true);
                      }}
                    >
                      상환
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLoan(loan.id);
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}

            {loans.length === 0 && <div className="loan-empty">등록된 대출이 없습니다.</div>}
          </div>
        </div>
      </LiquidPanel>

      {/* Account Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">{editingAccount ? '계좌 수정' : '새 계좌'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><Icons.Close /></button>
            </div>
            <AccountForm 
              account={editingAccount} 
              onClose={() => setShowForm(false)} 
              onSave={() => { setShowForm(false); onRefresh(); }} 
            />
          </div>
        </div>
      )}

      {/* Loan Form Modal */}
      {showLoanForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowLoanForm(false)}>
          <div className="modal-content" style={{maxWidth: 600}}>
            <div className="modal-header">
              <h3 className="modal-title">{editingLoan ? '대출 수정' : '새 대출'}</h3>
              <button className="modal-close" onClick={() => setShowLoanForm(false)}><Icons.Close /></button>
            </div>
            <LoanForm 
              loan={editingLoan} 
              accounts={accounts} 
              categories={categories}
              onClose={() => setShowLoanForm(false)} 
              onSave={async () => { setShowLoanForm(false); await onRefreshLoans(); }} 
            />
          </div>
        </div>
      )}
      
      {showSettleForm && settlingLoan && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowSettleForm(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">대출 상환</h3>
              <button className="modal-close" onClick={() => setShowSettleForm(false)}><Icons.Close /></button>
            </div>
            <SettleForm 
              loan={settlingLoan} 
              accounts={accounts} 
              onClose={() => setShowSettleForm(false)} 
              onSettled={async () => { setShowSettleForm(false); await onRefreshLoans(); onRefresh(); }} 
            />
          </div>
        </div>
      )}
    </>
  );
};

// --- Sub-components for Forms ---

const AccountForm = ({ account, onClose, onSave }: any) => {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState(account?.type ?? 'bank');
  const [balance, setBalance] = useState(account?.balance?.toString() ?? '');

  const handleDelete = async () => {
    if (!account?.id) return;
    const confirmed = await showConfirm('정말 이 계좌를 삭제하시겠습니까?');
    if (!confirmed) return;
    try {
      await accountsApi.delete(account.id);
      onSave();
    } catch {
      showAlert('삭제 실패');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { 
      name, 
      type, 
      balance: Number(balance.replace(/,/g,'')), 
      color: '#3B82F6',
      icon: null 
    };
    try {
      if (account?.id) await accountsApi.update(account.id, payload);
      else await accountsApi.create(payload);
      onSave();
    } catch {
      showAlert('저장 실패');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="modal-body">
      <div>
        <label className="form-label">계좌 이름</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div>
        <label className="form-label">유형</label>
        <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
          <option value="bank">은행</option>
          <option value="card">카드</option>
          <option value="cash">현금</option>
          <option value="investment">투자</option>
        </select>
      </div>
      <div>
        <label className="form-label">잔액</label>
        <input className="form-input" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0" />
      </div>
      <div style={{display:'flex', justifyContent:'space-between', marginTop: 20, gap: 12, flexWrap:'wrap'}}>
        {account?.id && (
          <button type="button" className="btn btn-danger" onClick={handleDelete}>삭제</button>
        )}
        <div style={{marginLeft: 'auto', display:'flex', gap: 12, flexWrap:'wrap'}}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
          <button type="submit" className="btn btn-primary">저장</button>
        </div>
      </div>
    </form>
  );
};

const LoanForm = ({ loan, accounts, categories, onClose, onSave }: any) => {
  const [name, setName] = useState(loan?.name ?? '');
  const [principal, setPrincipal] = useState(loan?.principal?.toString() ?? '');
  const [interestRate, setInterestRate] = useState(loan?.interest_rate?.toString() ?? '');
  const [termMonths, setTermMonths] = useState(loan?.term_months?.toString() ?? '');
  const [startDate, setStartDate] = useState(loan?.start_date ?? new Date().toISOString().slice(0, 10));
  const [dueDay, setDueDay] = useState(loan?.monthly_due_day ?? 1);
  const [accountId, setAccountId] = useState(loan?.account_id ?? accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(loan?.category_id ?? (categories.find((c: Category) => c.type === 'expense')?.id ?? ''));
  const [repayType, setRepayType] = useState(loan?.repayment_type ?? 'amortized');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name, 
      principal: Number(principal.replace(/,/g,'')),
      interest_rate: Number(interestRate),
      term_months: Number(termMonths),
      start_date: startDate,
      monthly_due_day: Number(dueDay),
      account_id: accountId,
      category_id: categoryId || null,
      repayment_type: repayType,
    };
    
    try {
      if (loan?.id) await loansApi.update(loan.id, payload);
      else await loansApi.create(payload);
      onSave();
    } catch (err) {
      console.error(err);
      showAlert('저장 실패');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="modal-body">
      <div className="form-row">
        <div>
          <label className="form-label">대출명</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <label className="form-label">원금</label>
          <input className="form-input" value={principal} onChange={e => setPrincipal(e.target.value)} required />
        </div>
      </div>
      <div className="form-row">
        <div>
          <label className="form-label">연 이자율 (%)</label>
          <input className="form-input" value={interestRate} onChange={e => setInterestRate(e.target.value)} required />
        </div>
        <div>
          <label className="form-label">기간 (개월)</label>
          <input className="form-input" value={termMonths} onChange={e => setTermMonths(e.target.value)} required />
        </div>
      </div>
      
      <div className="form-row">
        <div>
          <label className="form-label">대출 시작일</label>
          <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        </div>
        <div>
          <label className="form-label">매월 납부일</label>
          <input type="number" className="form-input" min="1" max="31" value={dueDay} onChange={e => setDueDay(Number(e.target.value))} required />
        </div>
      </div>

      <div className="form-row">
        <div>
          <label className="form-label">납부 계좌</label>
          <select className="form-select" value={accountId} onChange={e => setAccountId(e.target.value)}>
            {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">상환 방식</label>
          <select className="form-select" value={repayType} onChange={e => setRepayType(e.target.value)}>
            <option value="amortized">원리금균등</option>
            <option value="principal_equal">원금균등</option>
            <option value="interest_only">만기일시(이자만)</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">카테고리 (지출 분류)</label>
        <select className="form-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">선택 안 함</option>
          {categories.filter((c: Category) => c.type === 'expense').map((c: Category) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary">저장</button>
      </div>
    </form>
  );
};

const SettleForm = ({ loan, accounts, onClose, onSettled }: any) => {
  const [amount, setAmount] = useState('');
  const [accId, setAccId] = useState(loan.account_id || accounts[0]?.id || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await loansApi.settle(loan.id, {
        settled_at: new Date().toISOString().slice(0,10),
        amount: Number(amount.replace(/,/g,'')),
        account_id: accId
      });
      onSettled();
    } catch {
      showAlert('상환 실패');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="modal-body">
      <div>
        <label className="form-label">상환 금액 (남은 원금: {formatCurrency(loan.remaining_principal)})</label>
        <input className="form-input" value={amount} onChange={e => setAmount(e.target.value)} />
      </div>
      <div>
        <label className="form-label">출금 계좌</label>
        <select className="form-select" value={accId} onChange={e => setAccId(e.target.value)}>
          {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary">상환하기</button>
      </div>
    </form>
  );
};
