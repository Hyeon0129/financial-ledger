// Categories View
import React, { useState, useMemo } from 'react';
import type { Category } from '../../api';
import { categoriesApi } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';

interface CategoriesViewProps {
  categories: Category[];
  onRefresh: () => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({ categories, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const handleEdit = (cat: Category) => {
    setEditingCategory(cat);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('이 카테고리를 삭제할까요?');
    if (!confirmed) return;
    await categoriesApi.delete(id);
    onRefresh();
  };

  const incomeCategories = useMemo(() => 
    categories.filter((c) => c.type === 'income'),
    [categories]
  );
  
  const expenseCategories = useMemo(() => 
    categories.filter((c) => c.type === 'expense'),
    [categories]
  );
  
  const expenseTree = useMemo(() => {
    const parents = expenseCategories.filter((c) => !c.parent_id);
    const children = expenseCategories.filter((c) => c.parent_id);
    const grouped = parents.map((parent) => ({
      parent,
      children: children.filter((c) => c.parent_id === parent.id),
    }));
    const orphans = children.filter(
      (child) => !parents.some((p) => p.id === child.parent_id)
    );
    return { grouped, orphans };
  }, [expenseCategories]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div></div>
        <button className="btn btn-primary" onClick={() => { setEditingCategory(null); setShowForm(true); }}>
          <Icons.Plus /> 새 카테고리
        </button>
      </div>

      <CategoryList 
        items={incomeCategories} 
        title="수입 카테고리" 
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <div className="panel-main categories-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">지출 카테고리</div>
          </div>
        </div>
        <div className="transactions-table-lite categories-table">
          <div className="tx-row categories-head">
            <div className="tx-col-label">대분류</div>
            <div className="tx-col-child">소분류</div>
            <div className="tx-col-type">구분</div>
            <div className="tx-col-actions">작업</div>
          </div>

          {expenseTree.grouped.map(({ parent, children }) => (
            <React.Fragment key={parent.id}>
              <div className="tx-row category-parent-row">
                <div className="tx-main tx-col-label">
                  <span className="tx-dot" style={{ background: parent.color }} />
                  <div className="tx-main-text">
                    <div className="tx-name">{parent.name}</div>
                  </div>
                </div>
                <div className="tx-col-child muted">-</div>
                <div className="tx-col-type">대분류</div>
                <div className="tx-col-actions">
                  <button className="btn btn-sm" onClick={() => handleEdit(parent)}>수정</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(parent.id)}>삭제</button>
                </div>
              </div>

              {children.map((child) => (
                <div key={child.id} className="tx-row category-child-row">
                  <div className="tx-main tx-col-label">
                    <span className="tx-dot" style={{ background: child.color }} />
                    <div className="tx-main-text">
                      <div className="tx-name">{child.name}</div>
                    </div>
                  </div>
                  <div className="tx-col-child">{parent.name}</div>
                  <div className="tx-col-type">소분류</div>
                  <div className="tx-col-actions">
                    <button className="btn btn-sm" onClick={() => handleEdit(child)}>수정</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(child.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </React.Fragment>
          ))}

          {expenseTree.orphans.map((child) => (
            <div key={child.id} className="tx-row category-child-row">
              <div className="tx-main tx-col-label">
                <span className="tx-dot" style={{ background: child.color }} />
                <div className="tx-main-text">
                  <div className="tx-name">{child.name}</div>
                </div>
              </div>
              <div className="tx-col-child">미분류</div>
              <div className="tx-col-type">소분류</div>
              <div className="tx-col-actions">
                <button className="btn btn-sm" onClick={() => handleEdit(child)}>수정</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(child.id)}>삭제</button>
              </div>
            </div>
          ))}

          {expenseCategories.length === 0 && (
            <div className="tx-row" style={{ justifyContent: 'center' }}>
              <div className="tx-main" style={{ justifyContent: 'center' }}>
                <div className="tx-name" style={{ color: 'var(--text-tertiary)' }}>
                  지출 카테고리가 없습니다. 상단 버튼으로 추가하세요.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <CategoryFormModal
          categories={categories}
          editingCategory={editingCategory}
          onClose={() => { setShowForm(false); setEditingCategory(null); }}
          onSave={() => {
            setShowForm(false);
            setEditingCategory(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
};

// Category List Component
const CategoryList: React.FC<{ 
  items: Category[]; 
  title: string; 
  onEdit: (cat: Category) => void;
  onDelete: (id: string) => void;
}> = ({ items, title, onEdit, onDelete }) => (
  <div className="panel-main" style={{ marginBottom: 20 }}>
    <div className="panel-header">
      <div className="panel-title">{title}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {items.map((cat) => (
        <div key={cat.id} className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ 
              width: 12, height: 12, borderRadius: 4, 
              background: cat.color 
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{cat.name}</div>
              {cat.parent_id && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  소분류
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => onEdit(cat)} style={{ flex: 1 }}>
              수정
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(cat.id)} style={{ flex: 1 }}>
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Category Form Modal
const CategoryFormModal: React.FC<{
  categories: Category[];
  editingCategory?: Category | null;
  onClose: () => void;
  onSave: () => void;
}> = ({ categories, editingCategory, onClose, onSave }) => {
  const [name, setName] = useState(editingCategory?.name || '');
  const [type, setType] = useState<'income' | 'expense'>(
    editingCategory?.type || 'expense'
  );
  const [parentId, setParentId] = useState<string>(editingCategory?.parent_id || '');
  const [color, setColor] = useState(editingCategory?.color || '#007AFF');
  const [saving, setSaving] = useState(false);

  const colors = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
    '#F97316',
  ];

  const parentOptions = useMemo(
    () => categories.filter((c) => c.type === type && !c.parent_id),
    [categories, type]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('카테고리 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await categoriesApi.update(editingCategory.id, {
          name: name.trim(),
          type,
          parent_id: parentId || null,
          color,
        });
      } else {
        await categoriesApi.create({
          name: name.trim(),
          type,
          parent_id: parentId || null,
          color,
          icon: null,
        });
      }
      onSave();
    } catch {
      showAlert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <div className="panel-title">
              {editingCategory ? '카테고리 수정' : '새 카테고리'}
            </div>
            <div className="panel-sub">
              {editingCategory
                ? '카테고리 정보를 수정합니다'
                : '수입/지출 카테고리를 추가합니다'}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">카테고리 이름</label>
            <input
              className="form-input"
              placeholder="예: 식비, 월급, 교통비"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">구분</label>
              <select
                className="form-select"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'income' | 'expense')
                }
              >
                <option value="expense">지출</option>
                <option value="income">수입</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">상위 카테고리 (선택)</label>
              <select
                className="form-select"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={type === 'income'}
              >
                <option value="">없음</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">색상</label>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border:
                      color === c
                        ? '2px solid #ffffff'
                        : '1px solid rgba(0,0,0,0.08)',
                    boxShadow:
                      color === c
                        ? '0 0 0 2px rgba(59,130,246,0.6)'
                        : 'none',
                    background: c,
                    cursor: 'pointer',
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: 40,
                  height: 28,
                  borderRadius: 8,
                  border: '1px solid var(--border-hover)',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 8,
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              취소
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving
                ? '저장 중...'
                : editingCategory
                ? '수정 완료'
                : '카테고리 추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
