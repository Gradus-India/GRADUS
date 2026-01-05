import { useEffect, useState } from 'react';
import MasterLayout from "../masterLayout/MasterLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useAuthContext } from '../context/AuthContext';
import {
  listAdminTestimonials,
  createAdminTestimonial,
  deleteAdminTestimonial,
  updateAdminTestimonial,
} from '../services/adminTestimonials';
import { convertToWebP } from '../utils/imageUtils';

const TestimonialsPage = () => {
  const { token } = useAuthContext();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', active: true, order: 0, file: null, thumbnailFile: null });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', order: 0, thumbnailFile: null });
  const [dragging, setDragging] = useState({ video: false, thumbnail: false });

  const load = async () => {
    try {
      setLoading(true);
      const data = await listAdminTestimonials({ token });
      setItems(data);
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.file || !form.name) return;
    try {
      setSaving(true);
      await createAdminTestimonial({
        token,
        file: form.file,
        thumbnailFile: form.thumbnailFile,
        name: form.name,
        role: form.role,
        active: form.active,
        order: form.order,
      });
      setForm({ name: '', role: '', active: true, order: 0, file: null, thumbnailFile: null });
      await load();
    } catch (e) {
      setError(e?.message || 'Failed to upload');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this testimonial?')) return;
    try {
      await deleteAdminTestimonial({ token, id });
      await load();
    } catch (e) {
      setError(e?.message || 'Failed to delete');
    }
  };

  const onToggle = async (it) => {
    try {
      await updateAdminTestimonial({ token, id: it.id, patch: { active: !it.active } });
      await load();
    } catch (e) {
      setError(e?.message || 'Failed to update');
    }
  };

  const startEdit = (it) => {
    setEditingId(it.id);
    setEditForm({ name: it.name || '', role: it.role || '', order: Number(it.order || 0), thumbnailFile: null });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', role: '', order: 0, thumbnailFile: null });
  };

  const saveEdit = async (id) => {
    try {
      setSaving(true);
      await updateAdminTestimonial({
        token,
        id,
        patch: { name: editForm.name, role: editForm.role, order: Number(editForm.order || 0) },
        thumbnailFile: editForm.thumbnailFile,
      });
      await load();
      cancelEdit();
    } catch (e) {
      setError(e?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelection = async (file, variant) => {
    if (!file) return;

    let processedFile = file;
    if (variant === 'thumbnail' && file.type.startsWith('image/')) {
      try {
        processedFile = await convertToWebP(file);
      } catch (e) {
        console.error('WebP conversion failed, using original:', e);
      }
    }

    if (editingId) {
      if (variant === 'thumbnail') {
        setEditForm((s) => ({ ...s, thumbnailFile: processedFile }));
      }
    } else {
      setForm((s) => ({ ...s, [variant === 'video' ? 'file' : 'thumbnailFile']: processedFile }));
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
    setDragging((prev) => ({ ...prev, [variant]: false }));
  };

  const onDropFile = (event, variant) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging((prev) => ({ ...prev, [variant]: false }));
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFileSelection(file, variant);
  };

  return (
    <MasterLayout>
      <Breadcrumb title='Testimonials (Supabase Storage)' />

      <div className='row gy-4'>
        <div className='col-xxl-5'>
          <div className='card h-100'>
            <div className='card-header bg-base py-16 px-24 border-bottom'>
              <h6 className='text-lg fw-semibold mb-0'>Upload New</h6>
            </div>
            <div className='card-body p-24'>
              <form onSubmit={onSubmit}>
                <div className='row g-3'>
                  <div className='col-12'>
                    <label className='form-label'>Name</label>
                    <input className='form-control' value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>Role</label>
                    <input className='form-control' value={form.role} onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))} />
                  </div>
                  <div className='col-6'>
                    <label className='form-label'>Active</label>
                    <select className='form-select' value={String(form.active)} onChange={(e) => setForm((s) => ({ ...s, active: e.target.value === 'true' }))}>
                      <option value='true'>Yes</option>
                      <option value='false'>No</option>
                    </select>
                  </div>
                  <div className='col-6'>
                    <label className='form-label'>Order</label>
                    <input type='number' className='form-control' value={form.order} onChange={(e) => setForm((s) => ({ ...s, order: Number(e.target.value || 0) }))} />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>Video File (mp4/webm/mov)</label>
                    <div
                      className='border rounded-3 p-20 text-center'
                      style={{
                        cursor: 'pointer',
                        borderStyle: 'dashed',
                        borderWidth: 2,
                        borderColor: dragging.video ? 'var(--bs-primary, #0d6efd)' : 'rgba(15,23,42,0.2)',
                        backgroundColor: dragging.video ? 'rgba(13,110,253,0.08)' : '#fff',
                        transition: '0.2s',
                        borderRadius: 12,
                      }}
                      onDragOver={(e) => onDragOver(e, 'video')}
                      onDragLeave={(e) => onDragLeave(e, 'video')}
                      onDrop={(e) => onDropFile(e, 'video')}
                      onClick={() => document.getElementById('videoInput').click()}
                    >
                      {form.file ? (
                        <div className='text-sm fw-medium text-neutral-900'>Selected: {form.file.name}</div>
                      ) : (
                        <div className='text-sm text-neutral-500'>Drag & drop video or click to browse</div>
                      )}
                    </div>
                    <input
                      id='videoInput'
                      type='file'
                      accept='video/*'
                      className='d-none'
                      onChange={(e) => handleFileSelection(e.target.files?.[0], 'video')}
                    />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>Thumbnail (converted to WebP)</label>
                    <div
                      className='border rounded-3 p-20 text-center'
                      style={{
                        cursor: 'pointer',
                        borderStyle: 'dashed',
                        borderWidth: 2,
                        borderColor: dragging.thumbnail ? 'var(--bs-primary, #0d6efd)' : 'rgba(15,23,42,0.2)',
                        backgroundColor: dragging.thumbnail ? 'rgba(13,110,253,0.08)' : '#fff',
                        transition: '0.2s',
                        borderRadius: 12,
                      }}
                      onDragOver={(e) => onDragOver(e, 'thumbnail')}
                      onDragLeave={(e) => onDragLeave(e, 'thumbnail')}
                      onDrop={(e) => onDropFile(e, 'thumbnail')}
                      onClick={() => document.getElementById('thumbInput').click()}
                    >
                      {form.thumbnailFile ? (
                        <div className='text-sm fw-medium text-neutral-900'>Selected: {form.thumbnailFile.name}</div>
                      ) : (
                        <div className='text-sm text-neutral-500'>Drag & drop image or click to browse</div>
                      )}
                    </div>
                    <input
                      id='thumbInput'
                      type='file'
                      accept='image/*'
                      className='d-none'
                      onChange={(e) => handleFileSelection(e.target.files?.[0], 'thumbnail')}
                    />
                    <small className='text-muted d-block mt-2'>Uploads a custom poster instead of the auto-generated frame.</small>
                  </div>
                </div>
                <div className='mt-16 d-flex gap-2'>
                  <button type='submit' className='btn btn-primary-600' disabled={saving || !form.file || !form.name}>Upload</button>
                  {saving ? <span className='text-sm text-neutral-500'>Uploading…</span> : null}
                </div>
                {error ? <div className='text-danger mt-12'>{error}</div> : null}
              </form>
            </div>
          </div>
        </div>

        <div className='col-xxl-7'>
          <div className='card h-100'>
            <div className='card-header bg-base py-16 px-24 border-bottom d-flex align-items-center justify-content-between'>
              <h6 className='text-lg fw-semibold mb-0'>Existing Items</h6>
              <button type='button' className='btn btn-outline-secondary btn-sm' onClick={load} disabled={loading}>Refresh</button>
            </div>
            <div className='card-body p-0'>
              <div className='table-responsive'>
                <table className='table table-striped mb-0'>
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>Preview</th>
                      <th style={{ width: 120 }}>Thumbnail</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Active</th>
                      <th>Order</th>
                      <th style={{ width: 140 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items || []).map((it) => (
                      <tr key={it.id}>
                        <td>
                          <video src={it.secureUrl} style={{ width: 80, height: 80 }} muted playsInline />
                        </td>
                        <td>
                          <div className='d-flex flex-column gap-2'>
                            {it.thumbnailUrl ? (
                              <img
                                src={it.thumbnailUrl}
                                alt={`${it.name || 'thumbnail'}`}
                                style={{ width: 96, height: 80, objectFit: 'cover', borderRadius: 8 }}
                              />
                            ) : (
                              <span className='text-neutral-500 text-sm'>Auto</span>
                            )}
                            {editingId === it.id ? (
                              <input
                                type='file'
                                accept='image/*'
                                className='form-control form-control-sm'
                                onChange={(e) => setEditForm((s) => ({ ...s, thumbnailFile: e.target.files?.[0] || null }))}
                              />
                            ) : null}
                          </div>
                        </td>
                        <td>
                          {editingId === it.id ? (
                            <input
                              className='form-control form-control-sm'
                              value={editForm.name}
                              onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))}
                            />
                          ) : (
                            it.name
                          )}
                        </td>
                        <td>
                          {editingId === it.id ? (
                            <input
                              className='form-control form-control-sm'
                              value={editForm.role}
                              onChange={(e) => setEditForm((s) => ({ ...s, role: e.target.value }))}
                            />
                          ) : (
                            it.role
                          )}
                        </td>
                        <td>
                          <span className={`badge ${it.active ? 'bg-success-600' : 'bg-neutral-400'}`}>{it.active ? 'Yes' : 'No'}</span>
                        </td>
                        <td>
                          {editingId === it.id ? (
                            <input
                              type='number'
                              className='form-control form-control-sm'
                              style={{ width: 72 }}
                              value={editForm.order}
                              onChange={(e) => setEditForm((s) => ({ ...s, order: e.target.value }))}
                            />
                          ) : (
                            it.order || 0
                          )}
                        </td>
                        <td className='d-flex gap-2'>
                          {editingId === it.id ? (
                            <>
                              <button className='btn btn-sm btn-success' disabled={saving || !editForm.name} onClick={() => saveEdit(it.id)}>Save</button>
                              <button className='btn btn-sm btn-outline-secondary' onClick={cancelEdit}>Cancel</button>
                            </>
                          ) : (
                            <button className='btn btn-sm btn-outline-primary' onClick={() => startEdit(it)}>Edit</button>
                          )}
                          <button className='btn btn-sm btn-outline-secondary' onClick={() => onToggle(it)}>Toggle</button>
                          <button className='btn btn-sm btn-outline-danger' onClick={() => onDelete(it.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    {!items?.length ? (
                      <tr>
                        <td colSpan={7} className='text-center py-24 text-neutral-500'>No items</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MasterLayout>
  );
};

export default TestimonialsPage;
