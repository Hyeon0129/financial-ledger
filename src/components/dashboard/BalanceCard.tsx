// src/components/dashboard/BalanceCard.tsx
import React from 'react';

type Props = {
  stats: {
    balance: number;
  };
  currency: string;
  onNavigate: (view: 'transactions' | 'accounts' | 'budgets') => void;
  formatCurrency: (value: number, currency: string) => string;
};

export function BalanceCard({ stats, currency, onNavigate, formatCurrency }: Props) {
  return (
    <div className="card balance-card">
      <div className="card-header" style={{ marginBottom: 20 }}>
        <div className="card-title">잔액</div>
        <div className="card-subtitle">이번 달</div>
      </div>
      <div className="balance-info">
        <div className="balance-label">현재 잔액</div>
        <div className="balance-amount">
          {formatCurrency(stats.balance, currency)}
        </div>
        <div className="balance-currency">KRW</div>
      </div>
      <div className="balance-actions">
        <button
          className="balance-btn"
          onClick={() => onNavigate('transactions')}
        >
          입출금
        </button>
        <button
          className="balance-btn"
          onClick={() => onNavigate('accounts')}
        >
          계좌 관리
        </button>
        <button
          className="balance-btn"
          onClick={() => onNavigate('budgets')}
        >
          예산 보기
        </button>
      </div>
    </div>
  );
}