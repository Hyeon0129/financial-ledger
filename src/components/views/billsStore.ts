import type { Account } from '../../api';

export type BillStatus = 'scheduled' | 'paid' | 'overdue';

export type BillCategoryGroup = 'living' | 'utility' | 'subscription' | 'custom';

export type BillCadence = 'weekly' | 'monthly' | 'yearly' | 'custom_days';

export type RecurringBill = {
  id: string;
  name: string;
  group: BillCategoryGroup;
  groupLabel?: string | null; // required when group === 'custom'
  amount: number;
  cadence: BillCadence;
  customEveryDays?: number | null; // required when cadence === 'custom_days'
  firstPaymentDate: string; // YYYY-MM-DD
  accountId: string;
  categoryId?: string | null; // created child category id (expense, leaf)
};

export type BillItem = RecurringBill & {
  dueDate: string; // YYYY-MM-DD for the selected month (first due in month)
  status: BillStatus;
  statusLabel: string;
  accountName?: string;
};

const STORAGE_KEY = 'my-ledger:bills:v3';
const LEGACY_KEYS = ['my-ledger:bills:v2', 'my-ledger:bills:v1'] as const;

const statusLabel = (status: BillStatus) => {
  if (status === 'paid') return 'Paid';
  if (status === 'overdue') return 'Overdue';
  return 'Scheduled';
};

const parseISODate = (iso: string) => {
  const [yy, mm, dd] = iso.split('-').map(Number);
  return { yy, mm, dd };
};

const addDaysISO = (iso: string, days: number) => {
  const { yy, mm, dd } = parseISODate(iso);
  const base = new Date(Date.UTC(yy, mm - 1, dd));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

const clampDayInMonth = (yy: number, mm: number, dd: number) => {
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return Math.max(1, Math.min(last, dd));
};

const monthEndISO = (month: string) => {
  const [yy, mm] = month.split('-').map(Number);
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

export const billGroupLabel = (bill: RecurringBill) => {
  if (bill.group === 'living') return '생활비';
  if (bill.group === 'utility') return '공과금';
  if (bill.group === 'subscription') return '구독';
  return bill.groupLabel?.trim() || '기타';
};

export const dueDateForMonth = (bill: RecurringBill, month: string) => {
  const monthStart = `${month}-01`;
  const monthEnd = monthEndISO(month);

  const firstMonth = bill.firstPaymentDate.slice(0, 7);
  if (month < firstMonth) return null;

  if (bill.cadence === 'monthly') {
    const { dd } = parseISODate(bill.firstPaymentDate);
    const [yy, mm] = month.split('-').map(Number);
    const day = clampDayInMonth(yy, mm, dd);
    const due = `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return due < bill.firstPaymentDate ? bill.firstPaymentDate : due;
  }

  if (bill.cadence === 'yearly') {
    const { mm: dueM, dd: dueD } = parseISODate(bill.firstPaymentDate);
    const [yy, mm] = month.split('-').map(Number);
    if (mm !== dueM) return null;
    const day = clampDayInMonth(yy, mm, dueD);
    const due = `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return due < bill.firstPaymentDate ? bill.firstPaymentDate : due;
  }

  const step =
    bill.cadence === 'weekly' ? 7 : Math.max(1, Math.floor(bill.customEveryDays ?? 0));
  if (bill.cadence === 'custom_days' && !Number.isFinite(step)) return null;
  if (bill.cadence === 'custom_days' && step <= 0) return null;

  // Find the first occurrence >= monthStart.
  let cursor = bill.firstPaymentDate;
  if (cursor > monthEnd) return null;

  // Fast-forward in coarse steps (safe enough for UI: loop capped).
  let guard = 0;
  while (cursor < monthStart && guard < 4000) {
    cursor = addDaysISO(cursor, step);
    guard += 1;
  }
  if (cursor < monthStart || cursor > monthEnd) return null;
  return cursor;
};

const normalize = (raw: unknown): RecurringBill | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.id || !r.name) return null;

  // v3
  const firstPaymentDate = typeof r.firstPaymentDate === 'string' ? r.firstPaymentDate.slice(0, 10) : '';
  const cadence = (r.cadence as BillCadence) || null;
  const group = (r.group as BillCategoryGroup) || null;
  const accountId = String(r.accountId ?? '');
  const amount = Number(r.amount ?? 0);
  const categoryId = r.categoryId == null ? null : String(r.categoryId);

  if (firstPaymentDate && cadence && group) {
    const customEveryDays =
      r.customEveryDays == null ? null : Math.max(1, Math.floor(Number(r.customEveryDays)));
    const groupLabel = r.groupLabel == null ? null : String(r.groupLabel);

    return {
      id: String(r.id),
      name: String(r.name),
      group,
      groupLabel,
      amount: Number.isFinite(amount) ? amount : 0,
      cadence,
      customEveryDays,
      firstPaymentDate,
      accountId,
      categoryId,
    };
  }

  // v2 -> v3 migration (monthly, using startMonth/dayOfMonth)
  const day = Math.max(1, Math.min(31, Number(r.dayOfMonth ?? r.day ?? 1)));
  const startMonth = String(r.startMonth ?? '').slice(0, 7);
  if (!startMonth || startMonth.length !== 7) return null;
  const [yy, mm] = startMonth.split('-').map(Number);
  const clamped = clampDayInMonth(yy, mm, day);
  return {
    id: String(r.id),
    name: String(r.name),
    group: 'living',
    groupLabel: null,
    amount: Number.isFinite(amount) ? amount : 0,
    cadence: 'monthly',
    customEveryDays: null,
    firstPaymentDate: `${startMonth}-${String(clamped).padStart(2, '0')}`,
    accountId,
    categoryId,
  };
};

export const loadBills = (): RecurringBill[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(normalize).filter(Boolean) as RecurringBill[];
    }

    // One-time migration from legacy keys (keep user data).
    for (const k of LEGACY_KEYS) {
      const legacyRaw = window.localStorage.getItem(k);
      if (!legacyRaw) continue;
      const legacyParsed = JSON.parse(legacyRaw);
      if (!Array.isArray(legacyParsed) || legacyParsed.length === 0) continue;
      const migrated = legacyParsed.map(normalize).filter(Boolean) as RecurringBill[];
      if (migrated.length > 0) {
        saveBills(migrated);
        return migrated;
      }
    }

    return [];
  } catch {
    return [];
  }
};

export const saveBills = (items: RecurringBill[]) => {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      items.map((b) => ({
        id: b.id,
        name: b.name,
        group: b.group,
        groupLabel: b.groupLabel ?? null,
        amount: b.amount,
        cadence: b.cadence,
        customEveryDays: b.customEveryDays ?? null,
        firstPaymentDate: b.firstPaymentDate,
        accountId: b.accountId,
        categoryId: b.categoryId ?? null,
      })),
    ),
  );
};

export const newBillId = () => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const currentMonthKey = () => todayISO().slice(0, 7);

export const deriveBill = (bill: RecurringBill, month: string, accounts: Account[]): BillItem => {
  const dueDate = dueDateForMonth(bill, month) ?? `${month}-01`;
  const account = accounts.find((a) => a.id === bill.accountId);
  const acctBal = account?.balance ?? 0;

  let status: BillStatus = 'scheduled';
  const nowMonth = currentMonthKey();

  if (month < nowMonth) {
    status = 'paid';
  } else if (month > nowMonth) {
    status = 'scheduled';
  } else {
    const today = todayISO();
    if (today < dueDate) {
      status = 'scheduled';
    } else {
      status = acctBal >= bill.amount ? 'paid' : 'overdue';
    }
  }

  return {
    ...bill,
    dueDate,
    status,
    statusLabel: statusLabel(status),
    accountName: account?.name,
  };
};
