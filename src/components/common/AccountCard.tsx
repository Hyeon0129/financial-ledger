import React from 'react';
import { formatCurrency } from '../../api';
import type { Account } from '../../api';
import { formatAccountDisplayName, inferKindFallback, loadAccountMeta } from '../views/accountMetaStore';

interface AccountCardProps {
  account: Account;
  index: number;
  currency?: string;
  className?: string;
  monthlySpend?: number;
  userEmail?: string;
}

const getPresetByIndex = (index: number) => {
  const order = ['style-silver', 'style-green', 'style-black', 'style-amber', 'style-purple', 'style-blue'] as const;
  return order[index % order.length];
};

const getIconByName = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('kakao') || lower.includes('kb')) return 'ph-chat-circle-dots';
  if (lower.includes('toss') || lower.includes('internet')) return 'ph-planet';
  if (lower.includes('shinhan') || lower.includes('woori') || lower.includes('samsung')) return 'ph-waves';
  if (lower.includes('naver') || lower.includes('hana') || lower.includes('nong')) return 'ph-plant';
  if (lower.includes('black') || lower.includes('premium') || lower.includes('hyundai')) return 'ph-crown';
  return 'ph-bank';
};

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  index,
  currency = '₩',
  className,
  monthlySpend,
  userEmail,
}) => {
  const meta = loadAccountMeta();
  const kind = meta[account.id]?.kind ?? inferKindFallback(account.type);
  const cardMeta = kind === 'credit_card' && meta[account.id]?.kind === 'credit_card' ? meta[account.id] : null;
  const preset = getPresetByIndex(index);
  const icon = getIconByName(account.name || '');
  const remaining = Number(account.balance) || 0;
  const spent = Number(monthlySpend) || 0;
  const holder = (userEmail || '-').split('@')[0] || '-';
  const creditLimit = cardMeta && cardMeta.kind === 'credit_card' ? Number(cardMeta.creditLimit) || 0 : 0;

  return (
    <div className={`bank-card ${preset} ${className || ''}`} role="button" tabIndex={0}>
      <div className="card-top">
        <div className="bank-logo">
          <i className={`ph ${icon}`} />
          <span className="bank-name">{formatAccountDisplayName(account.name, kind)}</span>
        </div>
        <img
          className="bank-chip"
          src="https://raw.githubusercontent.com/muhammederdem/credit-card-form/master/src/assets/images/chip.png"
          alt=""
          aria-hidden="true"
        />
      </div>

      <div className="card-mid" />

      <div className="card-bottom">
        <div className="card-block">
          <div className="card-label">Holder</div>
          <div className="card-val holder">{holder}</div>
        </div>

        <div className="card-block">
          <div className="card-label">{kind === 'credit_card' ? 'Limit' : 'Remaining'}</div>
          <div className="card-val">
            {formatCurrency(kind === 'credit_card' ? creditLimit : remaining, currency)}
          </div>
        </div>
        <div className="card-block">
          <div className="card-label">This month spent</div>
          <div className="card-val">{formatCurrency(spent, currency)}</div>
        </div>
      </div>
    </div>
  );
};
