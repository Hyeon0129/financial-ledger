import React, { useMemo, useState } from 'react';
import type { Account, Category, Transaction } from '../../api';
import { categoriesApi, formatCurrency, formatDateShort, getMonthKey, transactionsApi } from '../../api';
import { LiquidPanel } from '../common/LiquidPanel';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';
import type { BillCategoryGroup, BillCadence, BillItem, RecurringBill } from './billsStore';
import { billGroupLabel, deriveBill, dueDateForMonth, loadBills, newBillId, saveBills } from './billsStore';

type BillsViewProps = {
  currency: string;
  month: string; // selected month (YYYY-MM)
  accounts: Account[];
  onRefreshCategories: () => void;
  transactions: Transaction[];
  onRefreshTransactions: () => Promise<void>;
};

const groupDisplay = (g: BillCategoryGroup) => {
  if (g === 'living') return '생활비';
  if (g === 'utility') return '공과금';
  if (g === 'subscription') return '구독';
  return '기타';
};

const groupColor = (g: BillCategoryGroup) => {
  if (g === 'living') return '#22C55E';
  if (g === 'utility') return '#38BDF8';
  if (g === 'subscription') return '#A855F7';
  return '#94A3B8';
};

export const BillsView: React.FC<BillsViewProps> = ({
  currency,
  month,
  accounts,
  onRefreshCategories,
  transactions,
  onRefreshTransactions,
}) => {
  const formatLocalISO = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [items, setItems] = useState<RecurringBill[]>(() => loadBills());
  const [editing, setEditing] = useState<RecurringBill | null>(null);
  const [showModal, setShowModal] = useState(false);

  const derived = useMemo(() => {
    const txMemoSet = new Set(transactions.map((t) => (t.memo_raw ?? t.memo ?? '')));

    return items
      .filter((b) => !!dueDateForMonth(b, month))
      .map((b) => {
        const base = deriveBill(b, month, accounts);
        const memo = base.id && base.dueDate ? `AUTO_BILL|${base.id}|${base.dueDate}` : '';
        const paidByTx = memo && txMemoSet.has(memo);

        if (paidByTx) {
          return { ...base, status: 'paid' as const, statusLabel: 'Paid' };
        }

        return base;
      })
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  }, [accounts, items, month, transactions]);

  const groupedTables = useMemo(() => {
    const order: BillCategoryGroup[] = ['living', 'utility', 'subscription', 'custom'];
    const groups = new Map<BillCategoryGroup, BillItem[]>();
    for (const k of order) groups.set(k, []);
    for (const b of derived) {
      const list = groups.get(b.group) ?? [];
      list.push(b);
      groups.set(b.group, list);
    }
    return order.map((g) => ({
      group: g,
      title: groupDisplay(g),
      items: groups.get(g) ?? [],
    }));
  }, [derived]);

  const openNew = () => {
    const today = new Date();
    const defaultDate = month === getMonthKey(today) ? formatLocalISO(today) : `${month}-01`;
    setEditing({
      id: '',
      name: '',
      group: 'living',
      groupLabel: null,
      amount: 0,
      cadence: 'monthly',
      customEveryDays: null,
      firstPaymentDate: defaultDate,
      accountId: accounts[0]?.id ?? '',
      categoryId: null,
    });
    setShowModal(true);
  };

  const openEdit = (b: BillItem) => {
    setEditing({
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
    });
    setShowModal(true);
  };

  const remove = async (id: string) => {
    const ok = await showConfirm('이 고정지출을 삭제할까요?');
    if (!ok) return;
    const target = items.find((b) => b.id === id);
    const next = items.filter((b) => b.id !== id);
    setItems(next);
    saveBills(next);

    if (target?.categoryId) {
      try {
        await categoriesApi.delete(target.categoryId);
        onRefreshCategories();
      } catch {
        // keep local removal even if category cleanup fails
      }
    }
  };

  const ensureParentCategory = async (label: string, group: BillCategoryGroup, cats: Category[]) => {
    const existing = cats.find((c) => c.type === 'expense' && !c.parent_id && c.name === label);
    if (existing) return existing;
    return categoriesApi.create({
      name: label,
      type: 'expense',
      parent_id: null,
      color: groupColor(group),
      icon: null,
    });
  };

  const autoMemo = (billId: string, dueDate: string) => `AUTO_BILL|${billId}|${dueDate}`;

  const dueDatesForAutopay = (bill: RecurringBill, monthKey: string, maxISO: string) => {
    const first = dueDateForMonth(bill, monthKey);
    if (!first) return [];
    if (bill.cadence === 'monthly' || bill.cadence === 'yearly') {
      return first <= maxISO ? [first] : [];
    }
    const step =
      bill.cadence === 'weekly' ? 7 : Math.max(1, Math.floor(bill.customEveryDays ?? 0));
    if (bill.cadence === 'custom_days' && (!Number.isFinite(step) || step <= 0)) return [];

    const monthEnd = `${monthKey}-${String(new Date(Number(monthKey.split('-')[0]), Number(monthKey.split('-')[1]), 0).getDate()).padStart(2, '0')}`;
    const limit = maxISO < monthEnd ? maxISO : monthEnd;

    const out: string[] = [];
    let cursor = first;
    let guard = 0;
    while (cursor <= limit && guard < 4000) {
      out.push(cursor);
      const d = new Date(`${cursor}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + step);
      cursor = d.toISOString().slice(0, 10);
      guard += 1;
    }
    return out;
  };

  const upsert = async (nextItem: RecurringBill) => {
    const finalItem: RecurringBill = nextItem.id ? nextItem : { ...nextItem, id: newBillId() };
    const nameKey = finalItem.name.trim().toLowerCase();
    const dup = items.find((b) => b.id !== finalItem.id && b.name.trim().toLowerCase() === nameKey);
    if (dup) {
      showAlert('같은 이름의 고정지출이 이미 있습니다.');
      return;
    }

    // Ensure (parent -> child) categories for expense leaf selection.
    try {
      const latestCats = await categoriesApi.list();
      const parentLabel = billGroupLabel(finalItem);
      const parent = await ensureParentCategory(parentLabel, finalItem.group, latestCats);

      const sameNameLeaf = latestCats.find(
        (c) => c.type === 'expense' && !!c.parent_id && c.name.toLowerCase() === finalItem.name.toLowerCase(),
      );

      if (finalItem.categoryId || sameNameLeaf) {
        const targetId = finalItem.categoryId ?? sameNameLeaf?.id ?? '';
        finalItem.categoryId = targetId;
        await categoriesApi.update(targetId, {
          name: finalItem.name,
          type: 'expense',
          parent_id: parent.id,
          color: groupColor(finalItem.group),
        });
      } else {
        const created = await categoriesApi.create({
          name: finalItem.name,
          type: 'expense',
          parent_id: parent.id,
          color: groupColor(finalItem.group),
          icon: null,
        });
        finalItem.categoryId = created.id;
      }
      onRefreshCategories();
    } catch {
      showAlert('카테고리 자동 생성/연결에 실패했습니다.');
    }

    const next = nextItem.id ? items.map((b) => (b.id === finalItem.id ? finalItem : b)) : [finalItem, ...items];
    setItems(next);
    saveBills(next);

    // Auto-create transactions for past-due occurrences in the current month.
    try {
      if (!finalItem.categoryId || !finalItem.accountId) return;
      const todayISO = formatLocalISO(new Date());
      const currentMonth = todayISO.slice(0, 7);
      const dueDates = dueDatesForAutopay(finalItem, currentMonth, todayISO);
      if (dueDates.length === 0) return;

      const existing = new Set(
        transactions
          .filter((t) => (t.memo_raw ?? t.memo)?.startsWith(`AUTO_BILL|${finalItem.id}|`))
          .map((t) => (t.memo_raw ?? t.memo) as string),
      );

      let createdAny = false;
      for (const dueDate of dueDates) {
        const memo = autoMemo(finalItem.id, dueDate);
        if (existing.has(memo)) continue;
        await transactionsApi.create({
          type: 'expense',
          amount: finalItem.amount,
          category_id: finalItem.categoryId,
          account_id: finalItem.accountId,
          to_account_id: null,
          date: dueDate,
          memo,
        });
        createdAny = true;
      }
      if (createdAny) {
        await onRefreshTransactions();
      }
    } catch {
      // do not block bill save flow
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 className="panel-title">고정지출</h2>
        <button className="btn btn-primary" onClick={openNew}>
          <Icons.Plus /> 새 고정지출
        </button>
      </div>

      <div className="bills-tableGrid">
        {groupedTables.map((g) => (
          <LiquidPanel key={g.group} className="bills-tablePanel">
            <div className="bills-tableHeader">
              <div className="bills-tableTitle">{g.title}</div>
            </div>

            <div className="bills-tableHead">
              <div className="bills-col-item">항목</div>
              <div className="bills-col-date">결제일</div>
              <div className="bills-col-acc">계좌</div>
              <div className="bills-col-amt">금액</div>
              <div className="bills-col-status">상태</div>
              <div className="bills-col-actions">관리</div>
            </div>

            <div className="bills-tableBody">
              {g.items.map((b) => (
                  <div key={b.id} className="bills-tableRow">
                    <div className="bills-col-item">
                      <span className="bills-itemName" title={b.name}>{b.name}</span>
                      {b.group === 'custom' && b.groupLabel && (
                        <span className="bills-itemTag">{b.groupLabel}</span>
                      )}
                    </div>
                  <div className="bills-col-date">{formatDateShort(b.dueDate)}</div>
                  <div className="bills-col-acc">{b.accountName ?? '-'}</div>
                  <div className="bills-col-amt">{formatCurrency(b.amount, currency)}</div>
                  <div className="bills-col-status">
                    <span className={`bill-card-status ${b.status}`}>{b.statusLabel}</span>
                  </div>
                  <div className="bills-col-actions">
                    <button className="btn btn-sm" type="button" onClick={() => openEdit(b)}>
                      수정
                    </button>
                    <button className="btn btn-sm btn-danger" type="button" onClick={() => void remove(b.id)}>
                      삭제
                    </button>
                  </div>
                </div>
              ))}
              {g.items.length === 0 && <div className="bills-empty">등록된 항목이 없습니다.</div>}
            </div>
          </LiquidPanel>
        ))}
      </div>

      {showModal && editing && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editing.id ? '고정지출 수정' : '고정지출 추가'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <Icons.Close />
              </button>
            </div>

            <BillForm
              initial={editing}
              accounts={accounts}
              onCancel={() => setShowModal(false)}
              onSave={async (v) => {
                await upsert(v);
                setShowModal(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};

const BillForm: React.FC<{
  initial: RecurringBill;
  accounts: Account[];
  onCancel: () => void;
  onSave: (v: RecurringBill) => Promise<void>;
}> = ({ initial, accounts, onCancel, onSave }) => {
  const [name, setName] = useState(initial.name);
  const [group, setGroup] = useState<BillCategoryGroup>(initial.group);
  const [groupLabel, setGroupLabel] = useState(initial.groupLabel ?? '');
  const [amount, setAmount] = useState(String(initial.amount || ''));
  const [cadence, setCadence] = useState<BillCadence>(initial.cadence);
  const [customEveryDays, setCustomEveryDays] = useState(String(initial.customEveryDays ?? ''));
  const [firstPaymentDate, setFirstPaymentDate] = useState(initial.firstPaymentDate);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('항목명을 입력해주세요.');
      return;
    }
    if (group === 'custom' && !groupLabel.trim()) {
      showAlert('분류명을 입력해주세요.');
      return;
    }
    if (!firstPaymentDate) {
      showAlert('첫 결제일을 입력해주세요.');
      return;
    }
    if (!accountId) {
      showAlert('출금 계좌를 선택해주세요.');
      return;
    }

    const v = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(v) || v <= 0) {
      showAlert('금액을 입력해주세요.');
      return;
    }
    const everyDays = (() => {
      if (cadence !== 'custom_days') return null;
      const raw = Math.floor(Number(customEveryDays));
      if (!Number.isFinite(raw) || raw <= 0) return null;
      return raw;
    })();
    if (cadence === 'custom_days' && !everyDays) {
      showAlert('사용자 지정 주기를 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initial.id,
        name: name.trim(),
        group,
        groupLabel: group === 'custom' ? groupLabel.trim() : null,
        amount: v,
        cadence,
        customEveryDays: cadence === 'custom_days' ? everyDays : null,
        firstPaymentDate,
        accountId,
        categoryId: initial.categoryId ?? null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="bills-form-grid">
        <div className="form-group bills-form-span2">
          <label className="form-label">항목명</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: Netflix" />
        </div>

        <div className="form-group">
          <label className="form-label">분류</label>
          <select className="form-select" value={group} onChange={(e) => setGroup(e.target.value as BillCategoryGroup)}>
            <option value="living">생활비</option>
            <option value="utility">공과금</option>
            <option value="subscription">구독</option>
            <option value="custom">기타(직접입력)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">금액</label>
          <input className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예: 25,000" />
        </div>

        {group === 'custom' && (
          <div className="form-group bills-form-span2">
            <label className="form-label">기타 분류명</label>
            <input
              className="form-input"
              value={groupLabel}
              onChange={(e) => setGroupLabel(e.target.value)}
              placeholder="예: 보험 / 교육 / 기타"
            />
          </div>
        )}

        <div className="form-group bills-form-span2">
          <label className="form-label">주기</label>
          <select className="form-select" value={cadence} onChange={(e) => setCadence(e.target.value as BillCadence)}>
            <option value="weekly">매주</option>
            <option value="monthly">매월</option>
            <option value="yearly">매년</option>
            <option value="custom_days">사용자 지정</option>
          </select>
        </div>

        {cadence === 'custom_days' && (
          <div className="form-group bills-form-span2">
            <label className="form-label">사용자 지정</label>
            <input
              className="form-input"
              inputMode="numeric"
              value={customEveryDays}
              onChange={(e) => setCustomEveryDays(e.target.value)}
              placeholder="예: 10 (10일마다)"
            />
          </div>
        )}

        <div className="form-group bills-form-span2">
          <label className="form-label">첫 결제일</label>
          <input className="form-input" type="date" value={firstPaymentDate} onChange={(e) => setFirstPaymentDate(e.target.value)} />
        </div>

        <div className="form-group bills-form-span2">
          <label className="form-label">출금 계좌</label>
          <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">계좌 선택</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={saving}>
          취소
        </button>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </form>
  );
};
