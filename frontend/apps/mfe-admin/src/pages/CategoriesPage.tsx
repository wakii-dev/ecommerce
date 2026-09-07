import { useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiErrorClient } from '@ecommerce/contracts';
import { useT } from '@ecommerce/i18n';
import { Button, Card, Input, Modal, Select, Skeleton, useToast } from '@ecommerce/ui-kit';
import { catalogApi } from '../lib/api';
import type { AdminCategoryNode } from '../lib/adminTypes';
import {
  flattenCategories,
  indentLabel,
  slugify,
  type CategoryNodeLike
} from '../lib/productPayload';

interface FormState {
  id?: string;
  nameVi: string;
  nameEn: string;
  slugVi: string;
  slugEn: string;
  parentId: string;
}

const EMPTY_FORM: FormState = { nameVi: '', nameEn: '', slugVi: '', slugEn: '', parentId: '' };

function TreeRows({
  nodes,
  depth,
  t,
  onEdit,
  onAddChild,
  onDelete
}: {
  // children của node generated là Category[] (không nameI18n) — render chỉ
  // cần shape tối thiểu; caller cast sang AdminCategoryNode khi edit (runtime
  // cây admin LUÔN mang i18n gốc).
  nodes: readonly CategoryNodeLike[];
  depth: number;
  t: (k: string) => string;
  onEdit: (node: CategoryNodeLike) => void;
  onAddChild: (node: CategoryNodeLike) => void;
  onDelete: (node: CategoryNodeLike) => void;
}): ReactElement {
  return (
    <>
      {nodes.map((node) => {
        const kids = node.children ?? [];
        return (
          <div key={node.id}>
            <div
              className='admin-cat-row'
              style={{ paddingInlineStart: `${depth * 24 + 12}px` }}
              data-testid='category-row'
            >
              <div>
                <span style={{ fontWeight: depth === 0 ? 700 : 500 }}>{node.name}</span>{' '}
                <span className='admin-hint'>/{node.slug}</span>
                {kids.length > 0 && <span className='admin-hint'> · {kids.length} ▸</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size='sm' variant='ghost' onClick={() => onAddChild(node)}>
                  + {t('admin.common.create')}
                </Button>
                <Button size='sm' variant='secondary' onClick={() => onEdit(node)}>
                  {t('admin.common.edit')}
                </Button>
                <Button size='sm' variant='danger' onClick={() => onDelete(node)}>
                  {t('admin.common.delete')}
                </Button>
              </div>
            </div>
            {kids.length > 0 && (
              <TreeRows
                nodes={kids}
                depth={depth + 1}
                t={t}
                onEdit={onEdit}
                onAddChild={onAddChild}
                onDelete={onDelete}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export default function CategoriesPage(): ReactElement {
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState | null>(null);
  // Slug auto-gen chỉ chạy khi user CHƯA sửa slug tay (touched flag).
  const slugTouched = useRef(false);

  const treeQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => catalogApi().adminListCategories({})
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    // Sản phẩm hiển thị tên category (resolve theo cây mới).
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
  };

  const saveMutation = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        nameI18n: { vi: state.nameVi.trim(), en: state.nameEn.trim() },
        slugVi: state.slugVi.trim(),
        slugEn: state.slugEn.trim(),
        parentId: state.parentId || undefined
      };
      return state.id
        ? catalogApi().adminUpdateCategory({ id: state.id, ...payload })
        : catalogApi().adminCreateCategory(payload);
    },
    onSuccess: (_data, state) => {
      invalidate();
      toast.toast(state.id ? t('admin.categories.updated') : t('admin.categories.created'), { variant: 'success' });
      setForm(null);
    },
    onError: (error) => {
      const detail = error instanceof ApiErrorClient && error.detail ? ` — ${error.detail}` : '';
      toast.toast(`${t('admin.common.error')}${detail}`, { variant: 'danger' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi().adminDeleteCategory({ id }),
    onSuccess: () => {
      invalidate();
      toast.toast(t('admin.categories.deleted'), { variant: 'success' });
    },
    onError: (error) => {
      // 409 (có sản phẩm/con) → chặn mềm với message từ problem+json detail.
      const detail = error instanceof ApiErrorClient && error.detail ? ` — ${error.detail}` : '';
      toast.toast(`${t('admin.categories.deleteBlocked')}${detail}`, { variant: 'danger' });
    }
  });

  // T8: node chờ confirm xóa (null = modal đóng)
  const [deleting, setDeleting] = useState<CategoryNodeLike | null>(null);

  const flat = useMemo(() => flattenCategories(treeQuery.data ?? []), [treeQuery.data]);

  const openCreate = (parentId?: string): void => {
    slugTouched.current = false;
    setForm({ ...EMPTY_FORM, parentId: parentId ?? '' });
  };

  const openEdit = (node: AdminCategoryNode): void => {
    slugTouched.current = true;
    setForm({
      id: node.id,
      nameVi: node.nameI18n.vi,
      nameEn: node.nameI18n.en,
      slugVi: node.slugVi,
      slugEn: node.slugEn,
      parentId: node.parentId ?? ''
    });
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (form) saveMutation.mutate(form);
  };

  return (
    <div>
      <div className='admin-page-head'>
        <h1>{t('admin.categories.title')}</h1>
        <div className='admin-page-head__actions'>
          <Button onClick={() => openCreate()}>{t('admin.categories.new')}</Button>
        </div>
      </div>

      {form !== null && (
        <Card style={{ marginBottom: 24 }}>
          <form onSubmit={onSubmit}>
            <div className='admin-form-grid'>
              <div className='admin-form-field'>
                <label htmlFor='cat-name-vi'>{t('admin.categories.name')}</label>
                <Input
                  id='cat-name-vi'
                  required
                  value={form.nameVi}
                  onChange={(e) => {
                    const nameVi = e.target.value;
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            nameVi,
                            slugVi: slugTouched.current ? f.slugVi : slugify(nameVi),
                            slugEn: slugTouched.current ? f.slugEn : slugify(nameVi)
                          }
                        : f
                    );
                  }}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cat-name-en'>{t('admin.categories.nameEn')}</label>
                <Input
                  id='cat-name-en'
                  value={form.nameEn}
                  onChange={(e) => setForm((f) => (f ? { ...f, nameEn: e.target.value } : f))}
                />
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cat-slug-vi'>{t('admin.categories.slugVi')}</label>
                <Input
                  id='cat-slug-vi'
                  value={form.slugVi}
                  onChange={(e) => {
                    slugTouched.current = true;
                    setForm((f) => (f ? { ...f, slugVi: e.target.value } : f));
                  }}
                />
                <span className='admin-hint'>{t('admin.products.slugAuto')}</span>
              </div>
              <div className='admin-form-field'>
                <label htmlFor='cat-slug-en'>{t('admin.categories.slugEn')}</label>
                <Input
                  id='cat-slug-en'
                  value={form.slugEn}
                  onChange={(e) => {
                    slugTouched.current = true;
                    setForm((f) => (f ? { ...f, slugEn: e.target.value } : f));
                  }}
                />
              </div>
              <div className='admin-form-field admin-form-field--full'>
                <label htmlFor='cat-parent'>{t('admin.categories.parent')}</label>
                <Select
                  id='cat-parent'
                  value={form.parentId}
                  onChange={(e) => setForm((f) => (f ? { ...f, parentId: e.target.value } : f))}
                >
                  <option value=''>{t('admin.categories.parentRoot')}</option>
                  {flat
                    .filter((c) => c.id !== form.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {indentLabel(c)}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button type='button' variant='ghost' onClick={() => setForm(null)}>
                {t('admin.common.cancel')}
              </Button>
              <Button type='submit' disabled={saveMutation.isPending}>
                {t('admin.common.save')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {treeQuery.isLoading ? (
        <Skeleton variant='rect' height={200} />
      ) : treeQuery.isError ? (
        <p className='admin-error-text'>{t('admin.common.loadFail')}</p>
      ) : (treeQuery.data ?? []).length === 0 ? (
        <p className='admin-hint'>{t('admin.categories.empty')}</p>
      ) : (
        <Card>
          <TreeRows
            nodes={treeQuery.data ?? []}
            depth={0}
            t={t}
            onEdit={(node) => openEdit(node as AdminCategoryNode)}
            onAddChild={(node) => openCreate(node.id)}
            onDelete={setDeleting /* FI-368 T8: confirm trước khi mutate */}
          />
        </Card>
      )}

      {/* T8: confirm modal xóa category — trước đây bấm là xóa ngay */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('admin.common.delete')}
      >
        <p>{t('admin.common.confirmDelete')}</p>
        <p style={{ fontWeight: 700 }}>{deleting?.name}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant='ghost' onClick={() => setDeleting(null)}>
            {t('admin.common.no')}
          </Button>
          <Button
            variant='danger'
            onClick={() => {
              if (deleting) deleteMutation.mutate(deleting.id);
              setDeleting(null);
            }}
          >
            {t('admin.common.yes')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
