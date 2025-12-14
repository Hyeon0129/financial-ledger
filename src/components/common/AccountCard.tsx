import React from 'react';
import { formatCurrency } from '../../api';
import type { Account } from '../../api';
import { LiquidPanel } from './LiquidPanel';

interface AccountCardProps {
  account: Account;
  index: number;
  currency?: string;
  className?: string;
  monthlySpend?: number;
}

const getCardBg = (index: number) => {
  const bgs = ['6.jpeg', '13.jpeg', '18.jpeg', '23.jpeg', '24.jpeg', '25.jpeg'];
  return new URL(`../../assets/card-bg/${bgs[index % bgs.length]}`, import.meta.url).href;
};

export const AccountCard: React.FC<AccountCardProps> = ({ account, index, currency = '₩', className, monthlySpend }) => {
  const bgUrl = getCardBg(index);

  return (
    <LiquidPanel 
      className={`account-card-glass ${className || ''}`}
      style={{
        backgroundImage: `url(${bgUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
      contentClassName="account-card-content"
    >
      <div className="account-card-overlay" aria-hidden="true" />

      <div className="account-card-topRow">
        <div className="account-card-name">{account.name}</div>
        <div className="account-card-type">{account.type}</div>
      </div>

      <div className="account-card-balanceBlock">
        <div className="account-card-balanceLabel">Current Balance</div>
        <div className="account-card-balance">{formatCurrency(account.balance, currency)}</div>
        {monthlySpend !== undefined && (
          <div className="account-card-monthlySpend">
            이번달 사용: {formatCurrency(monthlySpend, currency)}
          </div>
        )}
      </div>
    </LiquidPanel>
  );
};
