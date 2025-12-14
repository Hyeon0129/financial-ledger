import React, { useMemo, useState } from 'react';
import { formatCurrency, formatDateShort } from '../../api';
import { LiquidPanel } from '../common/LiquidPanel';
import { Icons } from '../common/Icons';
import { showConfirm } from '../common/alertHelpers';

export type BillStatus = 'scheduled' | 'paid' | 'overdue';

export type BillItem = {
  id: string;
  name: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  status: BillStatus;
  statusLabel: string;
};

const STORAGE_KEY = 'my-ledger:bills:v1';

const statusLabel = (status: BillStatus) => {
  if (status === 'paid') return 'Paid';
  if (status === 'overdue') return 'Overdue';
  return 'Scheduled';
};

const normalize = (raw: any): BillItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.name || !raw.dueDate) return null;
  const status: BillStatus = raw.status === 'paid' || raw.status === 'overdue' ? raw.status : 'scheduled';
  return {
    id: String(raw.id),
    name: String(raw.name),
    dueDate: String(raw.dueDate),
    amount: Number(raw.amount ?? 0),
    status,
    statusLabel: statusLabel(status),
  };
};

export const getBills = (): BillItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter(Boolean) as BillItem[];
  } catch {
    return [];
  }
};

const saveBills = (items: BillItem[]) => {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      items.map((b) => ({
        id: b.id,
        name: b.name,
        dueDate: b.dueDate,
        amount: b.amount,
        status: b.status,
      })),
    ),
  );
};

const newId = () => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

type BillsViewProps = {
  currency: string;
};

export const BillsView: React.FC<BillsViewProps> = ({ currency }) => {
  const [items, setItems] = useState<BillItem[]>(() => getBills());
  const [editing, setEditing] = useState<BillItem | null>(null);
  const [showModal, setShowModal] = useState(false);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)),
    [items],
  );

  const openNew = () => {
    setEditing({
      id: '',
      name: '',
      dueDate: new Date().toISOString().slice(0, 10),
      amount: 0,
      status: 'scheduled',
      statusLabel: 'Scheduled',
    });
    setShowModal(true);
  };

  const openEdit = (b: BillItem) => {
    setEditing(b);
    setShowModal(true);
  };

  const remove = async (id: string) => {
    const ok = await showConfirm('이 고정지출을 삭제할까요?');
    if (!ok) return;
    const next = items.filter((b) => b.id !== id);
    setItems(next);
    saveBills(next);
  };

  const upsert = (nextItem: Omit<BillItem, 'statusLabel'>) => {
    const status = nextItem.status;
    const finalItem: BillItem = { ...nextItem, statusLabel: statusLabel(status) };
    const next = finalItem.id
      ? items.map((b) => (b.id === finalItem.id ? finalItem : b))
      : [{ ...finalItem, id: newId() }, ...items];
    setItems(next);
    saveBills(next);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 className="panel-title">고정지출</h2>
        <button className="btn btn-primary" onClick={openNew}>
          <Icons.Plus /> 새 고정지출
        </button>
      </div>

      <div className="bills-grid">
        {sorted.map((b) => (
          <LiquidPanel key={b.id} className="interactive bill-card" onClick={() => openEdit(b)}>
            <div className="bill-card-top">
              <div className="bill-card-icon">{b.name[0] ?? 'B'}</div>
              <div className="bill-card-meta">
                <div className="bill-card-name">{b.name}</div>
                <div className="bill-card-date">{formatDateShort(b.dueDate)}</div>
              </div>
              <div className={`bill-card-status ${b.status}`}>{b.statusLabel}</div>
            </div>
            <div className="bill-card-bottom">
              <div className="bill-card-amount">{formatCurrency(b.amount, currency)}</div>
              <button
                className="btn btn-icon bill-card-delete"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(b.id);
                }}
                aria-label="Delete"
                title="Delete"
              >
                <Icons.Close />
              </button>
            </div>
          </LiquidPanel>
        ))}
        {sorted.length === 0 && (
          <LiquidPanel>
            <div style={{ padding: 24, color: 'var(--text-muted)' }}>등록된 고정지출이 없습니다.</div>
          </LiquidPanel>
        )}
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
              onCancel={() => setShowModal(false)}
              onSave={(val) => {
                upsert(val);
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
  initial: BillItem;
  onSave: (v: Omit<BillItem, 'statusLabel'>) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [name, setName] = useState(initial.name);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [amount, setAmount] = useState(String(initial.amount || 0));
  const [status, setStatus] = useState<BillStatus>(initial.status);

  return (
    <form
      className="modal-body bills-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: initial.id,
          name: name.trim(),
          dueDate,
          amount: Number(amount.replace(/,/g, '')) || 0,
          status,
        } as Omit<BillItem, 'statusLabel'>);
      }}
    >
      <div className="bills-form-grid">
        <div className="bills-form-field bills-form-span2">
          <label className="form-label">이름</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="bills-form-field">
          <label className="form-label">납부일</label>
          <input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="bills-form-field">
          <label className="form-label">금액</label>
          <input className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="bills-form-field bills-form-span2">
          <label className="form-label">상태</label>
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as BillStatus)}>
            <option value="scheduled">Scheduled</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn" type="button" onClick={onCancel}>
          취소
        </button>
        <button className="btn btn-primary" type="submit">
          저장
        </button>
      </div>
    </form>
  );
};
