import { useEffect, useState, useRef } from 'react';
import MasterLayout from "../masterLayout/MasterLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useAuthContext } from '../context/AuthContext';
import {
  listAdminBanners,
  createAdminBanner,
  updateAdminBanner,
  deleteAdminBanner,
} from '../services/adminBanners';
import { convertToWebP } from '../utils/imageUtils';

const initialFormState = {
  title: '',
  subtitle: '',
  ctaLabel: '',
  ctaUrl: '',
  order: 0,
  active: true,
  desktopFile: null,
  mobileFile: null,
};

const BannersPage = () => {
  const { token } = useAuthContext();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '',
    subtitle: '',
    ctaLabel: '',
    ctaUrl: '',
    order: 0,
  });
  const [dragging, setDragging] = useState({ desktop: false, mobile: false });
  const [previewUrl, setPreviewUrl] = useState({ desktop: '', mobile: '' });
  const desktopFileInputRef = useRef(null);
  const mobileFileInputRef = useRef(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await listAdminBanners({ token });
      setItems(data);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    return () => {
      Object.values(previewUrl || {}).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [previewUrl]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    if (isFormModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isFormModalOpen]);

  useEffect(() => {
    if (!isFormModalOpen || typeof document === 'undefined') {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsFormModalOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFormModalOpen]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.desktopFile) return;
    try {
      setSaving(true);
      await createAdminBanner({
        token,
        desktopFile: form.desktopFile,
        mobileFile: form.mobileFile,
        title: form.title,
        subtitle: form.subtitle,
        ctaLabel: form.ctaLabel,
        ctaUrl: form.ctaUrl,
        order: Number(form.order || 0),
        active: form.active,
      });
      setForm(initialFormState);
      setPreviewUrl((current) => {
        Object.values(current || {}).forEach((url) => {
          if (url) URL.revokeObjectURL(url);
        });
        return { desktop: '', mobile: '' };
      });
      if (desktopFileInputRef.current) {
        desktopFileInputRef.current.value = '';
      }
      if (mobileFileInputRef.current) {
        mobileFileInputRef.current.value = '';
      }
      await load();
    } catch (e) {
      setError(e?.message || 'Failed to create banner');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this banner?')) return;
    try {
      await deleteAdminBanner({ token, id });
      await load();
    } catch (e) {
      setError(e?.message || 'Failed to delete banner');
    }
  };

  const onToggle = async (item) => {
    try {
      await updateAdminBanner({ token, id: item.id, patch: { active: !item.active } });
      await load();
    } catch (e) {
      setError(e?.message || 'Failed to update banner');
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      title: item.title || '',
      subtitle: item.subtitle || '',
      ctaLabel: item.ctaLabel || '',
      ctaUrl: item.ctaUrl || '',
      order: Number(item.order || 0),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ title: '', subtitle: '', ctaLabel: '', ctaUrl: '', order: 0 });
  };

  const saveEdit = async (id) => {
    try {
      setSaving(true);
      await updateAdminBanner({
        token,
        id,
        patch: {
          title: editForm.title,
          subtitle: editForm.subtitle,
          ctaLabel: editForm.ctaLabel,
          ctaUrl: editForm.ctaUrl,
          order: Number(editForm.order || 0),
        },
      });
      await load();
      cancelEdit();
    } catch (e) {
      setError(e?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const replaceImage = async (id, variant, file) => {
    if (!file) return;
    try {
      setSaving(true);
      await updateAdminBanner({
        token,
        id,
        desktopFile: variant === 'desktop' ? file : undefined,
        mobileFile: variant === 'mobile' ? file : undefined,
      });
      await load();
    } catch (e) {
      setError(e?.message || 'Failed to replace image');
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelection = async (file, variant) => {
    if (!file) return;

    let processedFile = file;
    if (file.type.startsWith('image/')) {
      try {
        processedFile = await convertToWebP(file);
      } catch (e) {
        console.error('WebP conversion failed, using original:', e);
      }
    }

    setForm((s) => ({ ...s, [`${variant}File`]: processedFile }));
    setPreviewUrl((current) => {
      const next = { ...current };
      if (current?.[variant]) {
        URL.revokeObjectURL(current[variant]);
      }
      next[variant] = processedFile ? URL.createObjectURL(processedFile) : '';
      return next;
    });
  };

  const onFileChange = (e, variant) => {
    const nextFile = e.target.files?.[0] || null;
    handleFileSelection(nextFile, variant);
  };

  const onDropFile = (event, variant) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging((prev) => ({ ...prev, [variant]: false }));
    let file = event.dataTransfer?.files?.[0];
    if (!file && event.dataTransfer?.items?.length) {
      const item = Array.from(event.dataTransfer.items).find((it) => it.kind === 'file');
      if (item) {
        file = item.getAsFile();
      }
    }
    if (file) {
      handleFileSelection(file, variant);
    }
  };

  const onDragOver = (event, variant) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging((prev) => (prev[variant] ? prev : { ...prev, [variant]: true }));
  };

  const onDragLeave = (event, variant) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragging((prev) => ({ ...prev, [variant]: false }));
  };

  const openFormModal = () => setIsFormModalOpen(true);
  const closeFormModal = () => {
    setIsFormModalOpen(false);
    setDragging({ desktop: false, mobile: false });
  };

  const renderAddBannerForm = () => (
    <form onSubmit={onSubmit}>
      <div className='row g-3'>
        <div className='col-12'>
          <label className='form-label'>Title</label>
          <input
            className='form-control'
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
          />
        </div>
        <div className='col-12'>
          <label className='form-label'>Subtitle</label>
          <input
            className='form-control'
            value={form.subtitle}
            onChange={(e) => setForm((s) => ({ ...s, subtitle: e.target.value }))}
          />
        </div>
        <div className='col-6'>
          <label className='form-label'>CTA Label</label>
          <input
            className='form-control'
            value={form.ctaLabel}
            onChange={(e) => setForm((s) => ({ ...s, ctaLabel: e.target.value }))}
          />
        </div>
        <div className='col-6'>
          <label className='form-label'>CTA URL</label>
          <input
            className='form-control'
            value={form.ctaUrl}
            onChange={(e) => setForm((s) => ({ ...s, ctaUrl: e.target.value }))}
            placeholder='https://...'
          />
        </div>
        <div className='col-md-6 col-12'>
          <label className='form-label'>Active</label>
          <select
            className='form-select'
            value={String(form.active)}
            onChange={(e) => setForm((s) => ({ ...s, active: e.target.value === 'true' }))}
          >
            <option value='true'>Yes</option>
            <option value='false'>No</option>
          </select>
        </div>
        <div className='col-md-6 col-12'>
          <label className='form-label'>Order</label>
          <input
            type='number'
            className='form-control'
            value={form.order}
            onChange={(e) => setForm((s) => ({ ...s, order: Number(e.target.value || 0) }))}
          />
        </div>
        <div className='col-12'>
          <label className='form-label'>Desktop Banner Image (JPG/PNG/WebP)</label>
          <div
            className='border rounded-3 p-4 text-center'
            style={{
              cursor: 'pointer',
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor: dragging.desktop ? 'var(--bs-primary, #0d6efd)' : 'rgba(15,23,42,0.2)',
              backgroundColor: dragging.desktop ? 'rgba(13,110,253,0.08)' : '#fff',
              transition: 'background-color 0.2s ease, border-color 0.2s ease',
            }}
            onDragOver={(event) => onDragOver(event, 'desktop')}
            onDragEnter={(event) => onDragOver(event, 'desktop')}
            onDragLeave={(event) => onDragLeave(event, 'desktop')}
            onDrop={(event) => onDropFile(event, 'desktop')}
            onClick={() => desktopFileInputRef.current?.click()}
          >
            <p className='fw-semibold mb-2'>Drag & drop your banner here</p>
            <p className='text-sm text-neutral-600 mb-3'>or click to browse</p>
            {form.desktopFile ? (
              <>
                {previewUrl.desktop ? (
                  <div className='mb-3'>
                    <img
                      src={previewUrl.desktop}
                      alt='Desktop banner preview'
                      style={{ maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 20px rgba(15,23,42,0.08)' }}
                    />
                  </div>
                ) : null}
                <div className='text-sm text-neutral-900'>
                  Selected: <span className='fw-medium'>{form.desktopFile.name}</span>
                </div>
              </>
            ) : (
              <div className='text-sm text-neutral-500'>Recommended size: 1920x720px</div>
            )}
          </div>
          <input
            type='file'
            accept='image/*'
            className='d-none'
            ref={desktopFileInputRef}
            onChange={(e) => onFileChange(e, 'desktop')}
          />
        </div>
        <div className='col-12'>
          <label className='form-label'>Mobile Banner Image (Optional)</label>
          <div
            className='border rounded-3 p-4 text-center'
            style={{
              cursor: 'pointer',
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor: dragging.mobile ? 'var(--bs-primary, #0d6efd)' : 'rgba(15,23,42,0.2)',
              backgroundColor: dragging.mobile ? 'rgba(13,110,253,0.08)' : '#fff',
              transition: 'background-color 0.2s ease, border-color 0.2s ease',
            }}
            onDragOver={(event) => onDragOver(event, 'mobile')}
            onDragEnter={(event) => onDragOver(event, 'mobile')}
            onDragLeave={(event) => onDragLeave(event, 'mobile')}
            onDrop={(event) => onDropFile(event, 'mobile')}
            onClick={() => mobileFileInputRef.current?.click()}
          >
            <p className='fw-semibold mb-2'>Drag & drop your mobile banner here</p>
            <p className='text-sm text-neutral-600 mb-3'>or tap to browse</p>
            {form.mobileFile ? (
              <>
                {previewUrl.mobile ? (
                  <div className='mb-3'>
                    <img
                      src={previewUrl.mobile}
                      alt='Mobile banner preview'
                      style={{ maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 20px rgba(15,23,42,0.08)' }}
                    />
                  </div>
                ) : null}
                <div className='text-sm text-neutral-900'>
                  Selected: <span className='fw-medium'>{form.mobileFile.name}</span>
                </div>
              </>
            ) : (
              <div className='text-sm text-neutral-500'>Recommended size: 1080x1350px</div>
            )}
          </div>
          <input
            type='file'
            accept='image/*'
            className='d-none'
            ref={mobileFileInputRef}
            onChange={(e) => onFileChange(e, 'mobile')}
          />
          <div className='form-text text-neutral-500 mt-2'>Leave empty to reuse the desktop hero on mobile screens.</div>
        </div>
      </div>
      <div className='mt-16 d-flex gap-3 align-items-center'>
        <button type='submit' className='btn btn-primary-600' disabled={saving || !form.desktopFile}>
          Upload Banner
        </button>
        {saving ? <span className='text-sm text-neutral-500'>Saving...</span> : null}
      </div>
      <p className='text-sm text-neutral-500 mt-12 mb-0'>
        Images upload straight to Cloudinary and are served on gradusindia.in automatically.
      </p>
    </form>
  );

  return (
    <MasterLayout>
      <Breadcrumb title='Homepage Banners' />
      {error ? <div className='alert alert-danger mt-3'>{error}</div> : null}
      <div className='row gy-4'>
        <div className='col-12'>
          <div className='card h-100'>
            <div className='card-header bg-base py-16 px-24 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-3'>
              <h6 className='text-lg fw-semibold mb-0'>Existing Banners</h6>
              <div className='d-flex align-items-center gap-2 flex-wrap'>
                <button type='button' className='btn btn-outline-secondary btn-sm' onClick={load} disabled={loading}>
                  Refresh
                </button>
                <button type='button' className='btn btn-primary btn-sm' onClick={openFormModal}>
                  Add Banner
                </button>
              </div>
            </div>
            <div className='card-body p-0'>
              <div className='table-responsive'>
                <table className='table table-striped mb-0'>
                  <thead>
                    <tr>
                      <th style={{ width: 220 }}>Images</th>
                      <th>Title</th>
                      <th>CTA</th>
                      <th style={{ width: 80 }}>Order</th>
                      <th>Active</th>
                      <th style={{ width: 260 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items || []).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className='d-flex flex-column gap-2'>
                            <div className='d-flex align-items-center gap-2'>
                              <span className='badge bg-base text-neutral-700'>Desktop</span>
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={`${item.title || 'banner'} desktop`}
                                  style={{ width: 110, height: 60, objectFit: 'cover', borderRadius: 8 }}
                                />
                              ) : (
                                <span className='text-neutral-500 text-sm'>No image</span>
                              )}
                            </div>
                            <div className='d-flex align-items-center gap-2'>
                              <span className='badge bg-base text-neutral-700'>Mobile</span>
                              {item.mobileImageUrl ? (
                                <img
                                  src={item.mobileImageUrl}
                                  alt={`${item.title || 'banner'} mobile`}
                                  style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8 }}
                                />
                              ) : (
                                <span className='text-neutral-500 text-sm'>Using desktop fallback</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          {editingId === item.id ? (
                            <>
                              <input
                                className='form-control form-control-sm mb-2'
                                value={editForm.title}
                                onChange={(e) => setEditForm((s) => ({ ...s, title: e.target.value }))}
                                placeholder='Title'
                              />
                              <input
                                className='form-control form-control-sm'
                                value={editForm.subtitle}
                                onChange={(e) => setEditForm((s) => ({ ...s, subtitle: e.target.value }))}
                                placeholder='Subtitle'
                              />
                            </>
                          ) : (
                            <>
                              <div className='fw-semibold'>{item.title || <span className='text-neutral-500'>Untitled</span>}</div>
                              <div className='text-sm text-neutral-600'>{item.subtitle}</div>
                            </>
                          )}
                        </td>
                        <td>
                          {editingId === item.id ? (
                            <>
                              <input
                                className='form-control form-control-sm mb-2'
                                value={editForm.ctaLabel}
                                onChange={(e) => setEditForm((s) => ({ ...s, ctaLabel: e.target.value }))}
                                placeholder='CTA label'
                              />
                              <input
                                className='form-control form-control-sm'
                                value={editForm.ctaUrl}
                                onChange={(e) => setEditForm((s) => ({ ...s, ctaUrl: e.target.value }))}
                                placeholder='CTA URL'
                              />
                            </>
                          ) : (
                            <>
                              <div>{item.ctaLabel || <span className='text-neutral-500'>--</span>}</div>
                              <div className='text-xs text-neutral-500 text-break' style={{ maxWidth: 160 }}>
                                {item.ctaUrl}
                              </div>
                            </>
                          )}
                        </td>
                        <td style={{ width: 80 }}>
                          {editingId === item.id ? (
                            <input
                              type='number'
                              className='form-control form-control-sm'
                              value={editForm.order}
                              onChange={(e) => setEditForm((s) => ({ ...s, order: e.target.value }))}
                            />
                          ) : (
                            item.order || 0
                          )}
                        </td>
                        <td>
                          <span className={`badge ${item.active ? 'bg-success-600' : 'bg-neutral-400'}`}>
                            {item.active ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>
                          <div className='d-flex flex-column gap-2'>
                            {editingId === item.id ? (
                              <div className='d-flex gap-2 flex-wrap'>
                                <button
                                  className='btn btn-sm btn-success'
                                  disabled={saving}
                                  onClick={() => saveEdit(item.id)}
                                >
                                  Save
                                </button>
                                <button className='btn btn-sm btn-outline-secondary' onClick={cancelEdit}>
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button className='btn btn-sm btn-outline-primary' onClick={() => startEdit(item)}>
                                Edit
                              </button>
                            )}
                            <div className='d-flex flex-wrap gap-2'>
                              <label className='btn btn-sm btn-outline-info mb-0'>
                                Replace Desktop
                                <input
                                  type='file'
                                  accept='image/*'
                                  hidden
                                  onChange={(e) => {
                                    replaceImage(item.id, 'desktop', e.target.files?.[0]);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <label className='btn btn-sm btn-outline-info mb-0'>
                                Replace Mobile
                                <input
                                  type='file'
                                  accept='image/*'
                                  hidden
                                  onChange={(e) => {
                                    replaceImage(item.id, 'mobile', e.target.files?.[0]);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            </div>
                            <div className='d-flex gap-2 flex-wrap'>
                              <button className='btn btn-sm btn-outline-secondary' onClick={() => onToggle(item)}>
                                Toggle
                              </button>
                              <button className='btn btn-sm btn-outline-danger' onClick={() => onDelete(item.id)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!items?.length ? (
                      <tr>
                        <td colSpan={6} className='text-center py-24 text-neutral-500'>
                          {loading ? 'Loading...' : 'No banners uploaded yet'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      {isFormModalOpen ? (
        <>
          <div className='modal-backdrop fade show' onClick={closeFormModal} />
          <div className='modal fade show d-block' tabIndex='-1' role='dialog' aria-modal='true'>
            <div className='modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable'>
              <div className='modal-content'>
                <div className='modal-header'>
                  <h5 className='modal-title'>Add New Banner</h5>
                  <button type='button' className='btn-close' aria-label='Close' onClick={closeFormModal} />
                </div>
                <div className='modal-body'>
                  {renderAddBannerForm()}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </MasterLayout>
  );
};

export default BannersPage;

