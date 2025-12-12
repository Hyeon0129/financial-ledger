// Savings View
import React, { useState } from 'react';
import type { SavingsGoal } from '../../api';
import { savingsGoalsApi, formatCurrency, formatDate } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';

interface SavingsViewProps {
  goals: SavingsGoal[];
  currency: string;
  onRefresh: () => void;
}

export const SavingsView: React.FC<SavingsViewProps> = ({ goals, currency, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('이 목표를 삭제할까요?');
    if (!confirmed) return;
    await savingsGoalsApi.delete(id);
    onRefresh();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div></div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icons.Plus /> 새 목표
        </button>
      </div>

      {goals.length > 0 ? (
        <div className="transactions-table-lite goals-manage-table">
          <div className="tx-row manage-head">
            <div className="tx-col-label">목표</div>
            <div className="tx-col-amount">진행률</div>
            <div className="tx-col-amount">현재 금액</div>
            <div className="tx-col-amount">목표 금액</div>
            <div className="tx-col-date">기한</div>
            <div className="tx-col-actions">작업</div>
          </div>
          {goals.map((goal) => {
            const progress = goal.target_amount > 0 ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0;
            return (
              <div key={goal.id} className="tx-row manage-row">
                <div className="tx-main tx-col-label">
                  <div className="tx-main-text">
                    <div className="tx-name">{goal.name}</div>
                  </div>
                </div>
                <div className="tx-col-amount">{progress.toFixed(0)}%</div>
                <div className="tx-amount tx-col-amount">{formatCurrency(goal.current_amount, currency)}</div>
                <div className="tx-amount tx-col-amount">{formatCurrency(goal.target_amount, currency)}</div>
                <div className="tx-col-date">{goal.deadline ? formatDate(goal.deadline) : '-'}</div>
                <div className="tx-col-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(goal.id)}>삭제</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state" style={{ borderRadius: 20, padding: 60 }}>
          <div className="empty-state-title">저축 목표가 없습니다</div>
          <div className="empty-state-text">첫 저축 목표를 만들어 진행 상황을 추적해보세요.</div>
        </div>
      )}

      {showForm && (
        <SavingsFormModal
          onClose={() => setShowForm(false)}
          onSave={() => {
            setShowForm(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

// Savings Form Modal
const SavingsFormModal: React.FC<{
  onClose: () => void;
  onSave: () => void;
}> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [color, setColor] = useState('#007AFF');
  const [saving, setSaving] = useState(false);

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('목표 이름을 입력해주세요.');
      return;
    }
    const target = Number(targetAmount.replace(/,/g, ''));
    if (!target || target <= 0) {
      showAlert('목표 금액을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      await savingsGoalsApi.create({
        name: name.trim(),
        target_amount: target,
        current_amount: Number(currentAmount.replace(/,/g, '')) || 0,
        deadline: deadline || null,
        color,
        icon: null,
      });
      onSave();
    } catch {
      showAlert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="panel-title">새 저축 목표</div>
            <div className="panel-sub">목표 정보를 입력해주세요</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">목표 이름</label>
            <input
              className="form-input"
              placeholder="예: 비상금, 여행 자금"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">목표 금액</label>
              <input
                className="form-input"
                placeholder="예: 10,000,000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">현재 금액</label>
              <input
                className="form-input"
                placeholder="예: 1,000,000"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">목표일 (선택)</label>
            <input
              type="date"
              className="form-input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">색상</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: c, border: color === c ? '3px solid #000' : 'none',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
