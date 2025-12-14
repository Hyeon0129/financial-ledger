import type { Account } from '../../api';

// View types
export type View =
  | 'dashboard'
  | 'transactions'
  | 'budgets'
  | 'categories'
  | 'accounts'
  | 'reports'
  | 'bills'
  | 'savings'
  | 'profile';

// View metadata
export const viewMeta: Record<View, { title: string; subtitle?: string }> = {
  dashboard: { title: '대시보드', subtitle: '자산과 지출을 한눈에 확인하세요' },
  transactions: { title: '거래 내역', subtitle: '월별 거래를 캘린더로 확인합니다' },
  budgets: { title: '예산 관리', subtitle: '카테고리별 예산을 설정하고 추적합니다' },
  categories: { title: '카테고리', subtitle: '수입/지출 카테고리를 관리합니다' },
  accounts: { title: '계좌 관리', subtitle: '저축통장, 신용카드, 체크카드 등을 관리합니다' },
  reports: { title: '리포트', subtitle: '월간/연간 리포트를 확인하세요' },
  bills: { title: '고정지출', subtitle: '정기 결제와 납부 일정을 관리합니다' },
  savings: { title: '저축 목표', subtitle: '목표 달성 상황을 추적합니다' },
  profile: { title: '프로필', subtitle: '계정 정보를 관리합니다' },
};

// Card theme helper
export const getCardTheme = (_account: Account, index: number): string => {
  const themes = [
    'card-theme-emerald',
    'card-theme-carbon',
    'card-theme-gold',
    'card-theme-slate',
    'card-theme-midnight',
    'card-theme-obsidian',
  ];
  return themes[index % themes.length];
};
