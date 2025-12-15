import React from 'react';
import { formatCurrency } from '../../api';
import type { Account } from '../../api';

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
  const preset = getPresetByIndex(index);
  const icon = getIconByName(account.name || '');
  const remaining = Number(account.balance) || 0;
  const spent = Number(monthlySpend) || 0;
  const holder = userEmail || '-';

  return (
    <div className={`bank-card ${preset} ${className || ''}`} role="button" tabIndex={0}>
      <div className="card-top">
        <div className="bank-logo">
          <i className={`ph ${icon}`} />
          <span className="bank-name">{account.name}</span>
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

        <div className="card-metrics">
          <div className="card-block right">
            <div className="card-label">남은금액</div>
            <div className="card-val">{formatCurrency(remaining, currency)}</div>
          </div>
          <div className="card-block right">
            <div className="card-label">이번달 사용</div>
            <div className="card-val">{formatCurrency(spent, currency)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
