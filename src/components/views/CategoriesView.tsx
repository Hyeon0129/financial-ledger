// Categories View
import React, { useState, useMemo } from 'react';
import type { Category } from '../../api';
import { categoriesApi } from '../../api';
import { Icons } from '../common/Icons';
import { showAlert, showConfirm } from '../common/alertHelpers';
import { LiquidPanel } from '../common/LiquidPanel';

interface CategoriesViewProps {
  categories: Category[];
  onRefresh: () => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({ categories, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [collapsedParents, setCollapsedParents] = useState<Record<string, boolean>>({});

  const catOrderKey = 'my-ledger:catOrder:v1';
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(catOrderKey) || '[]'); } catch { return []; }
  });
  const [draggingCatId, setDraggingCatId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);

  const persistCatOrder = (next: string[]) => {
    setCategoryOrder(next);
    try { localStorage.setItem(catOrderKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  React.useEffect(() => {
    const existing = new Set(categories.map((c) => c.id));
    const pruned = categoryOrder.filter((id) => existing.has(id));
    if (pruned.length !== categoryOrder.length) persistCatOrder(pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const sortCategories = (cats: Category[]) => {
    const idx = new Map<string, number>();
    categoryOrder.forEach((id, i) => idx.set(id, i));
    const withIndex = cats.map((c) => ({ c, i: idx.get(c.id) ?? Number.POSITIVE_INFINITY }));
    withIndex.sort((a, c) => {
      if (a.i !== c.i) return a.i - c.i;
      return a.c.created_at < c.c.created_at ? -1 : a.c.created_at > c.c.created_at ? 1 : 0;
    });
    return withIndex.map((x) => x.c);
  };

  const moveCategory = (fromId: string, toId: string) => {
    const sorted = sortCategories(categories);
    const current = sorted.map((c) => c.id);
    const fromIdx = current.indexOf(fromId);
    const toIdx = current.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...current];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromId);
    persistCatOrder(next);
  };

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
    sortCategories(categories.filter((c) => c.type === 'income')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, categoryOrder]
  );

  const expenseCategories = useMemo(() =>
    sortCategories(categories.filter((c) => c.type === 'expense')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, categoryOrder]
  );

  const getDragProps = (catId: string) => ({
    draggable: true,
    className: `${draggingCatId === catId ? 'is-dragging' : ''} ${dragOverCatId === catId ? 'is-dropTarget' : ''}`,
    onDragStart: (e: React.DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['BUTTON', 'INPUT'].includes(target.tagName)) {
        e.preventDefault();
        return;
      }
      setDraggingCatId(catId);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDragEnter: () => {
      if (!draggingCatId || draggingCatId === catId) return;
      setDragOverCatId(catId);
    },
    onDragLeave: () => {
      if (dragOverCatId === catId) setDragOverCatId(null);
    },
    onDrop: () => {
      if (!draggingCatId || draggingCatId === catId) return;
      moveCategory(draggingCatId, catId);
      setDraggingCatId(null);
      setDragOverCatId(null);
    }
  });  
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

  const toggleParent = (parentId: string) => {
    setCollapsedParents((prev) => ({ ...prev, [parentId]: !prev[parentId] }));
  };

  return (
    <>
      <div className="categories-view">
        <div className="cat-pageTop">
          <div className="cat-pageTopInner" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingCategory(null);
                setShowForm(true);
              }}
            >
              <Icons.Plus /> 새 카테고리
            </button>
          </div>
        </div>

        <LiquidPanel className="cat-panel" contentClassName="cat-panelContent">
          <div className="panel-header" style={{ marginBottom: 24 }}>
            <div className="panel-title">전체 카테고리</div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '40px', alignItems: 'start' }}>
            
            {/* Left Column: Income */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-green)', marginBottom: 16 }}>
                수입 카테고리
              </div>
              <div className="cat-list">
                {incomeCategories.map((cat) => {
                  const dragProps = getDragProps(cat.id);
                  return (
                    <div 
                      key={cat.id} 
                      {...dragProps} 
                      className={`cat-row cat-hover-group ${dragProps.className}`}
                      style={{ cursor: 'pointer', padding: '6px 4px', borderBottom: 'none' }}
                      onClick={() => handleEdit(cat)}
                    >
                      <div className="cat-col-name" style={{ gap: 10 }}>
                        <span className="cat-dot" style={{ background: cat.color, width: 14, height: 14 }} />
                        <span className="cat-name" style={{ fontSize: 16, fontWeight: 850 }}>{cat.name}</span>
                      </div>
                    </div>
                  );
                })}
                {incomeCategories.length === 0 && (
                  <div style={{ padding: '8px 4px', color: 'var(--text-muted)', fontSize: 14 }}>없음</div>
                )}
              </div>
            </div>

            {/* Right Column: Expense */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.85)', marginBottom: 16 }}>
                지출 카테고리
              </div>
              
              <div style={{ columnCount: 3, columnGap: '32px' }}>
                {/* Expense Parent Blocks */}
                {expenseTree.grouped.map(({ parent, children }) => {
                  const dragProps = getDragProps(parent.id);
                  return (
                    <div key={parent.id} {...dragProps} className={`cat-hover-group ${dragProps.className}`} style={{ breakInside: 'avoid', marginBottom: 24 }}>
                      <div 
                        style={{ fontSize: 16, fontWeight: 850, color: 'rgba(255,255,255,0.95)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                        onClick={() => handleEdit(parent)}
                      >
                        <span className="cat-dot" style={{ background: parent.color, width: 14, height: 14 }} />
                        {parent.name}
                      </div>
                      <div className="cat-list">
                        {children.map((child) => {
                          const childDragProps = getDragProps(child.id);
                          return (
                            <div 
                              key={child.id} 
                              {...childDragProps} 
                              className={`cat-row cat-hover-group ${childDragProps.className}`}
                              style={{ cursor: 'pointer', padding: '6px 4px', borderBottom: 'none', display: 'flex', alignItems: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(child);
                              }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, flexShrink: 0 }}>
                                <path d="M8 0v12a4 4 0 004 4h12" />
                              </svg>
                              <div className="cat-col-name" style={{ gap: 8 }}>
                                <span className="cat-dot" style={{ background: child.color, width: 10, height: 10 }} />
                                <span className="cat-name" style={{ fontWeight: 650, color: 'rgba(255,255,255,0.8)', fontSize: 15 }}>{child.name}</span>
                              </div>
                            </div>
                          );
                        })}
                        {children.length === 0 && (
                          <div style={{ padding: '6px 4px', color: 'var(--text-muted)', fontSize: 14, marginLeft: 24 }}>소분류 없음</div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Orphan Expense Categories Block */}
                {expenseTree.orphans.length > 0 && (
                  <div style={{ breakInside: 'avoid', marginBottom: 24 }}>
                    <div style={{ fontSize: 16, fontWeight: 850, color: 'var(--text-muted)', marginBottom: 10 }}>
                      미분류 지출
                    </div>
                    <div className="cat-list">
                      {expenseTree.orphans.map((child) => {
                        const dragProps = getDragProps(child.id);
                        return (
                          <div 
                            key={child.id} 
                            {...dragProps} 
                            className={`cat-row cat-hover-group ${dragProps.className}`}
                            style={{ cursor: 'pointer', padding: '6px 4px', borderBottom: 'none' }}
                            onClick={() => handleEdit(child)}
                          >
                            <div className="cat-col-name">
                              <span className="cat-dot" style={{ background: child.color, width: 12, height: 12 }} />
                              <span className="cat-name" style={{ fontSize: 16, fontWeight: 750 }}>{child.name}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </LiquidPanel>
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
          onDelete={() => {
            if (editingCategory) {
              handleDelete(editingCategory.id);
              setShowForm(false);
              setEditingCategory(null);
            }
          }}
        />
      )}
    </>
  );
};

// Category Form Modal
const CategoryFormModal: React.FC<{
  categories: Category[];
  editingCategory?: Category | null;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}> = ({ categories, editingCategory, onClose, onSave, onDelete }) => {
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
    const nameKey = name.trim().toLowerCase();
    const dup = categories.find(
      (c) => c.id !== editingCategory?.id && c.type === type && c.name.trim().toLowerCase() === nameKey
    );
    if (dup) {
      showAlert('같은 이름의 카테고리가 이미 있습니다.');
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
              justifyContent: editingCategory ? 'space-between' : 'flex-end',
              marginTop: 16,
              width: '100%'
            }}
          >
            {editingCategory && onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={onDelete}
                disabled={saving}
              >
                삭제
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
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
          </div>
        </form>
      </div>
    </div>
  );
};
