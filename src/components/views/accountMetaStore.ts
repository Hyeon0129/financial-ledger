export type AccountKind = 'bank' | 'cash' | 'debit_card' | 'credit_card';

type LegacyCreditCardMeta = {
  kind: 'credit_card';
  paymentDay: number; // 1..31
  statementDay: number; // 1..31 (billing cut-off day)
  withdrawAccountId: string; // bank/cash account id
  creditLimit?: number; // optional legacy
};

export type CreditCardMeta = {
  kind: 'credit_card';
  paymentDay: number; // 1..31 (payment due day)
  cycleStartDay: number; // 1..31 (inclusive)
  cycleEndDay: number; // 1..31 (inclusive)
  withdrawAccountId: string; // bank/cash account id
  creditLimit: number; // credit limit (for UI)
};

export type DebitCardMeta = { kind: 'debit_card' };
export type BankMeta = { kind: 'bank' };
export type CashMeta = { kind: 'cash' };

export type AccountMeta = CreditCardMeta | DebitCardMeta | BankMeta | CashMeta;

export type AccountMetaMap = Record<string, AccountMeta>;

const STORAGE_KEY = 'my-ledger:account-meta:v1';

const clampDay = (day: number) => Math.max(1, Math.min(31, Math.floor(Number(day) || 1)));

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const migrateCreditCardMeta = (raw: unknown): CreditCardMeta | null => {
  if (!isRecord(raw)) return null;
  if (raw.kind !== 'credit_card') return null;

  // v2 (cycleStartDay/cycleEndDay)
  if ('cycleStartDay' in raw && 'cycleEndDay' in raw) {
    const paymentDay = clampDay(raw.paymentDay as number);
    const cycleStartDay = clampDay(raw.cycleStartDay as number);
    const cycleEndDay = clampDay(raw.cycleEndDay as number);
    const withdrawAccountId = String(raw.withdrawAccountId ?? '');
    const creditLimit = Number(raw.creditLimit ?? 0);
    return { kind: 'credit_card', paymentDay, cycleStartDay, cycleEndDay, withdrawAccountId, creditLimit: Number.isFinite(creditLimit) ? creditLimit : 0 };
  }

  // v1 (statementDay)
  if ('statementDay' in raw) {
    const legacy = raw as unknown as LegacyCreditCardMeta;
    const paymentDay = clampDay(legacy.paymentDay);
    const cycleEndDay = clampDay(legacy.statementDay);
    const cycleStartDay = cycleEndDay === 31 ? 1 : cycleEndDay + 1;
    const withdrawAccountId = String(legacy.withdrawAccountId ?? '');
    const creditLimit = Number(legacy.creditLimit ?? 0);
    return { kind: 'credit_card', paymentDay, cycleStartDay, cycleEndDay, withdrawAccountId, creditLimit: Number.isFinite(creditLimit) ? creditLimit : 0 };
  }

  return null;
};

export const loadAccountMeta = (): AccountMetaMap => {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: AccountMetaMap = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isRecord(v)) continue;
      if (v.kind === 'credit_card') {
        const migrated = migrateCreditCardMeta(v);
        if (migrated) out[id] = migrated;
        continue;
      }
      if (v.kind === 'bank' || v.kind === 'cash' || v.kind === 'debit_card') {
        out[id] = { kind: v.kind } as BankMeta | CashMeta | DebitCardMeta;
      }
    }
    return out;
  } catch {
    return {};
  }
};

export const saveAccountMeta = (meta: AccountMetaMap) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
};

export const getAccountKindLabelKR = (kind: AccountKind) => {
  if (kind === 'bank') return '은행';
  if (kind === 'cash') return '현금';
  if (kind === 'debit_card') return '체크카드';
  return '신용카드';
};

export const formatAccountDisplayName = (accountName: string, kind: AccountKind) => {
  return `[${getAccountKindLabelKR(kind)}]${accountName}`;
};

export const inferKindFallback = (accountType: string): AccountKind => {
  if (accountType === 'cash') return 'cash';
  if (accountType === 'bank') return 'bank';
  if (accountType === 'card') return 'credit_card';
  return 'bank';
};

export const prevMonthKey = (monthKey: string) => {
  const [yy, mm] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(yy, mm - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const isoInMonth = (monthKey: string, day: number) => {
  const [yy, mm] = monthKey.split('-').map(Number);
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const clamped = Math.max(1, Math.min(last, Math.floor(Number(day) || 1)));
  return `${monthKey}-${String(clamped).padStart(2, '0')}`;
};

export const creditCardCycleRange = (dueMonthKey: string, meta: CreditCardMeta) => {
  const startMonthKey = meta.cycleStartDay > meta.cycleEndDay ? prevMonthKey(dueMonthKey) : dueMonthKey;
  return {
    start: isoInMonth(startMonthKey, meta.cycleStartDay),
    end: isoInMonth(dueMonthKey, meta.cycleEndDay),
  };
};
