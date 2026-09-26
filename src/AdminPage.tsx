import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { CheckSquare2, FolderMinus, FolderPlus, ImagePlus, LogOut, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { CategoryRecord, PortraitCategoryRecord, PortraitRecord } from './gallery';
import { isSupabaseConfigured, portraitBucket, supabase } from './supabase';

const portraitFields = 'id,name,prompt,image_url,created_at';
const categoryFields = 'id,name,created_at';
const relationFields = 'portrait_id,category_id,created_at';

function getExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || 'jpg';
}

function getStoragePath(imageUrl: string) {
  const marker = `/storage/v1/object/public/${portraitBucket}/`;
  const index = imageUrl.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(imageUrl.slice(index + marker.length));
}

export function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [records, setRecords] = useState<PortraitRecord[]>([]);
  const [categoryRecords, setCategoryRecords] = useState<CategoryRecord[]>([]);
  const [relations, setRelations] = useState<PortraitCategoryRecord[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [confirmCategoryId, setConfirmCategoryId] = useState<number | null>(null);
  const [confirmRecordId, setConfirmRecordId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [prompt, setPrompt] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<number | 'all'>('all');
  const [selectedPortraitIds, setSelectedPortraitIds] = useState<number[]>([]);
  const [batchAction, setBatchAction] = useState<'add' | 'remove' | null>(null);
  const [batchCategoryIds, setBatchCategoryIds] = useState<number[]>([]);
  const [batchConfirming, setBatchConfirming] = useState(false);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    const [portraitResult, categoryResult, relationResult] = await Promise.all([
      supabase.from('portraits').select(portraitFields).order('id', { ascending: true }),
      supabase.from('categories').select(categoryFields).order('id', { ascending: true }),
      supabase.from('portrait_categories').select(relationFields),
    ]);
    const loadError = portraitResult.error ?? categoryResult.error ?? relationResult.error;
    if (loadError) setError(loadError.message);
    else {
      setRecords((portraitResult.data ?? []) as PortraitRecord[]);
      setCategoryRecords((categoryResult.data ?? []) as CategoryRecord[]);
      setRelations((relationResult.data ?? []) as PortraitCategoryRecord[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = '写真内容管理｜ChatGPT 写真馆';
    window.scrollTo(0, 0);
    if (!supabase) {
      setAuthChecked(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthChecked(true);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) void loadData();
    else {
      setRecords([]);
      setCategoryRecords([]);
      setRelations([]);
    }
  }, [loadData, session]);

  const clearForm = () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setEditingId(null);
    setName('');
    setSelectedCategoryIds([]);
    setPrompt('');
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileKey((value) => value + 1);
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File) => {
    if (!supabase) throw new Error('Supabase 尚未配置');
    const path = `portraits/${crypto.randomUUID()}.${getExtension(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(portraitBucket).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(portraitBucket).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError('');
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (loginError) setError('邮箱或密码不正确');
    setSaving(false);
  };

  const toggleCategory = (categoryId: number) => {
    setSelectedCategoryIds((current) => current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId]);
  };

  const createCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !session) return;
    const cleanName = newCategoryName.trim();
    if (!cleanName) return;
    setSaving(true);
    setError('');
    setMessage('');
    const { data, error: createError } = await supabase
      .from('categories')
      .insert({ name: cleanName })
      .select(categoryFields)
      .single();
    if (createError) setError(createError.code === '23505' ? '这个分类已经存在' : createError.message);
    else {
      setCategoryRecords((items) => [...items, data as CategoryRecord].sort((a, b) => a.id - b.id));
      setNewCategoryName('');
      setMessage(`已新增分类：${cleanName}`);
    }
    setSaving(false);
  };

  const deleteCategory = async (item: CategoryRecord) => {
    if (!supabase) return;
    setSaving(true);
    setError('');
    setMessage('');
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', item.id);
    if (deleteError) setError(deleteError.message);
    else {
      setCategoryRecords((items) => items.filter((category) => category.id !== item.id));
      setRelations((items) => items.filter((relation) => relation.category_id !== item.id));
      setSelectedCategoryIds((ids) => ids.filter((id) => id !== item.id));
      setBatchCategoryIds((ids) => ids.filter((id) => id !== item.id));
      if (adminCategoryFilter === item.id) setAdminCategoryFilter('all');
      setConfirmCategoryId(null);
      setMessage(`已删除分类：${item.name}，写真内容保持不变`);
    }
    setSaving(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !session) return;
    const cleanName = name.trim();
    const cleanPrompt = prompt.trim();
    if (!cleanName || !cleanPrompt || (editingId === null && !selectedFile)) return;

    setSaving(true);
    setError('');
    setMessage('');
    let uploaded: { path: string; publicUrl: string } | null = null;
    try {
      if (selectedFile) uploaded = await uploadImage(selectedFile);

      if (editingId !== null) {
        const current = records.find((item) => item.id === editingId);
        if (!current) throw new Error('未找到要编辑的写真');
        const values = {
          name: cleanName,
          prompt: cleanPrompt,
          ...(uploaded ? { image_url: uploaded.publicUrl } : {}),
        };
        const { data, error: updateError } = await supabase
          .from('portraits')
          .update(values)
          .eq('id', editingId)
          .select(portraitFields)
          .single();
        if (updateError) throw updateError;
        const currentCategoryIds = relations.filter((relation) => relation.portrait_id === editingId).map((relation) => relation.category_id);
        const addedIds = selectedCategoryIds.filter((id) => !currentCategoryIds.includes(id));
        const removedIds = currentCategoryIds.filter((id) => !selectedCategoryIds.includes(id));
        if (addedIds.length) {
          const { error: relationInsertError } = await supabase
            .from('portrait_categories')
            .insert(addedIds.map((categoryId) => ({ portrait_id: editingId, category_id: categoryId })));
          if (relationInsertError) throw relationInsertError;
        }
        if (removedIds.length) {
          const { error: relationDeleteError } = await supabase
            .from('portrait_categories')
            .delete()
            .eq('portrait_id', editingId)
            .in('category_id', removedIds);
          if (relationDeleteError) throw relationDeleteError;
        }
        setRecords((items) => items.map((item) => item.id === editingId ? data as PortraitRecord : item));
        setRelations((items) => [
          ...items.filter((relation) => relation.portrait_id !== editingId),
          ...selectedCategoryIds.map((categoryId) => ({ portrait_id: editingId, category_id: categoryId, created_at: new Date().toISOString() })),
        ]);
        if (uploaded) {
          const oldPath = getStoragePath(current.image_url);
          if (oldPath) await supabase.storage.from(portraitBucket).remove([oldPath]);
        }
        setMessage(`已更新 #${String(editingId).padStart(3, '0')} ${cleanName}`);
      } else {
        const { data, error: insertError } = await supabase
          .from('portraits')
          .insert({ name: cleanName, prompt: cleanPrompt, image_url: uploaded!.publicUrl })
          .select(portraitFields)
          .single();
        if (insertError) throw insertError;
        if (selectedCategoryIds.length) {
          const { error: relationError } = await supabase
            .from('portrait_categories')
            .insert(selectedCategoryIds.map((categoryId) => ({ portrait_id: data.id, category_id: categoryId })));
          if (relationError) {
            await supabase.from('portraits').delete().eq('id', data.id);
            throw relationError;
          }
        }
        setRecords((items) => [...items, data as PortraitRecord].sort((a, b) => a.id - b.id));
        setRelations((items) => [
          ...items,
          ...selectedCategoryIds.map((categoryId) => ({ portrait_id: data.id, category_id: categoryId, created_at: new Date().toISOString() })),
        ]);
        setMessage(`已发布 #${String(data.id).padStart(3, '0')} ${data.name}`);
      }
      clearForm();
    } catch (submitError) {
      if (uploaded) await supabase.storage.from(portraitBucket).remove([uploaded.path]);
      setError(submitError instanceof Error ? submitError.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const editRecord = (item: PortraitRecord) => {
    clearForm();
    setEditingId(item.id);
    setName(item.name);
    setSelectedCategoryIds(relations.filter((relation) => relation.portrait_id === item.id).map((relation) => relation.category_id));
    setPrompt(item.prompt);
    setPreviewUrl(item.image_url);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteRecord = async (item: PortraitRecord) => {
    if (!supabase) return;
    setSaving(true);
    setError('');
    const { error: deleteError } = await supabase.from('portraits').delete().eq('id', item.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      const path = getStoragePath(item.image_url);
      if (path) await supabase.storage.from(portraitBucket).remove([path]);
      setRecords((items) => items.filter((record) => record.id !== item.id));
      setRelations((items) => items.filter((relation) => relation.portrait_id !== item.id));
      setSelectedPortraitIds((ids) => ids.filter((id) => id !== item.id));
      setConfirmRecordId(null);
      if (editingId === item.id) clearForm();
      setMessage(`已删除 #${String(item.id).padStart(3, '0')} ${item.name}`);
    }
    setSaving(false);
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    clearForm();
    setMessage('');
    setError('');
  };

  const visibleRecords = adminCategoryFilter === 'all'
    ? records
    : records.filter((item) => relations.some((relation) => relation.portrait_id === item.id && relation.category_id === adminCategoryFilter));
  const allVisibleSelected = visibleRecords.length > 0 && visibleRecords.every((item) => selectedPortraitIds.includes(item.id));

  const toggleBatchMode = () => {
    setBatchMode((current) => !current);
    setSelectedPortraitIds([]);
    setBatchAction(null);
    setBatchCategoryIds([]);
    setBatchConfirming(false);
  };

  const togglePortraitSelection = (portraitId: number) => {
    setSelectedPortraitIds((current) => current.includes(portraitId)
      ? current.filter((id) => id !== portraitId)
      : [...current, portraitId]);
  };

  const toggleVisibleSelection = () => {
    const visibleIds = visibleRecords.map((item) => item.id);
    setSelectedPortraitIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  };

  const openBatchPanel = (action: 'add' | 'remove') => {
    if (!selectedPortraitIds.length) {
      setError('请先选择至少一条写真');
      return;
    }
    setError('');
    setMessage('');
    setBatchAction(action);
    setBatchCategoryIds([]);
    setBatchConfirming(false);
  };

  const closeBatchPanel = () => {
    setBatchAction(null);
    setBatchCategoryIds([]);
    setBatchConfirming(false);
  };

  const toggleBatchCategory = (categoryId: number) => {
    setBatchCategoryIds((current) => current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId]);
    setBatchConfirming(false);
  };

  const applyBatchCategories = async () => {
    if (!supabase || !session || !batchAction || !selectedPortraitIds.length || !batchCategoryIds.length) return;
    const portraitCount = selectedPortraitIds.length;
    const categoryCount = batchCategoryIds.length;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (batchAction === 'add') {
        const rows = selectedPortraitIds.flatMap((portraitId) => batchCategoryIds.map((categoryId) => ({
          portrait_id: portraitId,
          category_id: categoryId,
        })));
        const { error: addError } = await supabase
          .from('portrait_categories')
          .upsert(rows, { onConflict: 'portrait_id,category_id', ignoreDuplicates: true });
        if (addError) throw addError;
        setMessage(`已为 ${portraitCount} 条写真添加 ${categoryCount} 个分类`);
      } else {
        const { error: removeError } = await supabase
          .from('portrait_categories')
          .delete()
          .in('portrait_id', selectedPortraitIds)
          .in('category_id', batchCategoryIds);
        if (removeError) throw removeError;
        setMessage(`已从 ${portraitCount} 条写真移除 ${categoryCount} 个分类`);
      }
      await loadData();
      setSelectedPortraitIds([]);
      closeBatchPanel();
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : '批量操作失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (!isSupabaseConfigured) {
    return <AdminNotice title="尚未连接 Supabase" detail="请先配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。" />;
  }
  if (!authChecked) return <AdminNotice title="正在验证登录状态" detail="请稍候…" />;

  if (!session) {
    return (
      <main className="admin-page admin-login-page">
        <header className="admin-header"><div><p>CHATGPT PORTRAIT GALLERY</p><h1>写真内容管理</h1></div><a href="/">返回前台</a></header>
        <section className="admin-panel admin-login-panel">
          <div className="admin-panel-heading"><div><span>01</span><h2>管理员登录</h2></div></div>
          <form className="admin-login-form" onSubmit={handleLogin}>
            <label className="admin-field"><span>邮箱</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
            <label className="admin-field"><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            {error && <p className="admin-error">{error}</p>}
            <button type="submit" className="admin-publish" disabled={saving}>{saving ? '登录中…' : '登录'}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><p>CHATGPT PORTRAIT GALLERY</p><h1>写真内容管理</h1></div>
        <div className="admin-header-actions"><a href="/">返回前台</a><button type="button" onClick={signOut}><LogOut size={15} />退出</button></div>
      </header>

      <section className="admin-panel admin-form-panel">
        <div className="admin-panel-heading">
          <div><span>01</span><h2>{editingId !== null ? '编辑写真' : '新增写真'}</h2></div>
          {editingId !== null && <button type="button" className="admin-cancel" onClick={clearForm}><X size={16} />取消编辑</button>}
        </div>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-field">
            <span>图片</span>
            <div className="admin-upload">
              <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage} required={editingId === null} />
              {previewUrl ? <img src={previewUrl} alt="待发布图片预览" /> : <div><ImagePlus size={28} /><strong>上传图片</strong><small>JPG、PNG 或 WebP，最大 10MB</small></div>}
            </div>
          </label>
          <label className="admin-field"><span>名称</span><input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="输入写真名称" required /></label>
          <fieldset className="admin-field admin-category-field">
            <legend>分类</legend>
            <div className="admin-category-options">
              {categoryRecords.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={selectedCategoryIds.includes(item.id)} onChange={() => toggleCategory(item.id)} />
                  <span>{item.name}</span>
                </label>
              ))}
              {!categoryRecords.length && <small>请先在下方新建分类</small>}
            </div>
          </fieldset>
          <label className="admin-field admin-prompt-field"><span>提示词</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入完整 AI 图片生成提示词" rows={6} required /></label>
          <button type="submit" className="admin-publish" disabled={saving}>{saving ? '保存中…' : '发布'}</button>
        </form>
        {message && <p className="admin-feedback">{message}</p>}
        {error && <p className="admin-error">{error}</p>}
      </section>

      <section className="admin-panel admin-category-panel">
        <div className="admin-panel-heading"><div><span>02</span><h2>分类管理</h2></div><strong>{categoryRecords.length} 个</strong></div>
        <form className="admin-category-create" onSubmit={createCategory}>
          <input type="text" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="输入分类名称" aria-label="分类名称" required />
          <button type="submit" disabled={saving}><Plus size={16} />新增分类</button>
        </form>
        <div className="admin-category-list">
          {categoryRecords.map((item) => {
            const count = relations.filter((relation) => relation.category_id === item.id).length;
            return (
              <div className="admin-category-row" key={item.id}>
                <div><strong>{item.name}</strong><span>{count} 款写真</span></div>
                <button type="button" className="danger" onClick={() => confirmCategoryId === item.id ? void deleteCategory(item) : setConfirmCategoryId(item.id)} disabled={saving}><Trash2 size={15} />{confirmCategoryId === item.id ? '确认删除' : '删除'}</button>
              </div>
            );
          })}
          {!categoryRecords.length && !loading && <p className="admin-list-state">还没有分类</p>}
        </div>
      </section>

      <section className="admin-panel admin-list-panel">
        <div className="admin-panel-heading">
          <div><span>03</span><h2>现有写真</h2></div>
          <div className="admin-list-heading-actions">
            <strong>{adminCategoryFilter === 'all' ? records.length : `${visibleRecords.length} / ${records.length}`} 条</strong>
            <button type="button" className={batchMode ? 'active' : ''} onClick={toggleBatchMode}><CheckSquare2 size={15} />{batchMode ? '退出批量' : '批量管理'}</button>
          </div>
        </div>
        <div className="admin-list-toolbar">
          <label>
            <span>筛选</span>
            <select value={adminCategoryFilter} onChange={(event) => setAdminCategoryFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
              <option value="all">全部分类</option>
              {categoryRecords.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {batchMode && (
            <div className="admin-batch-actions">
              <strong>已选择 {selectedPortraitIds.length} 条</strong>
              <button type="button" onClick={toggleVisibleSelection} disabled={!visibleRecords.length}>{allVisibleSelected ? '取消全选' : '全选当前列表'}</button>
              <button type="button" onClick={() => openBatchPanel('add')} disabled={!selectedPortraitIds.length || saving}><FolderPlus size={15} />添加分类</button>
              <button type="button" onClick={() => openBatchPanel('remove')} disabled={!selectedPortraitIds.length || saving}><FolderMinus size={15} />移除分类</button>
            </div>
          )}
        </div>
        {loading ? <p className="admin-list-state">正在加载…</p> : (
          <div className="admin-list">
            {visibleRecords.map((item) => (
              <article className={`admin-row${batchMode ? ' is-batch' : ''}${selectedPortraitIds.includes(item.id) ? ' selected' : ''}`} key={item.id}>
                {batchMode && (
                  <label className="admin-row-select" aria-label={`选择 #${String(item.id).padStart(3, '0')} ${item.name}`}>
                    <input type="checkbox" checked={selectedPortraitIds.includes(item.id)} onChange={() => togglePortraitSelection(item.id)} />
                  </label>
                )}
                <img src={item.image_url} alt="" />
                <div className="admin-row-copy"><span>#{String(item.id).padStart(3, '0')}</span><strong>{item.name}</strong><small>{relations.filter((relation) => relation.portrait_id === item.id).map((relation) => categoryRecords.find((category) => category.id === relation.category_id)?.name).filter(Boolean).join(' · ') || '未分类'}</small></div>
                <div className="admin-row-actions">
                  <button type="button" onClick={() => editRecord(item)} disabled={saving}><Pencil size={15} />编辑</button>
                  <button type="button" className="danger" onClick={() => confirmRecordId === item.id ? void deleteRecord(item) : setConfirmRecordId(item.id)} disabled={saving}><Trash2 size={15} />{confirmRecordId === item.id ? '确认删除' : '删除'}</button>
                </div>
              </article>
            ))}
            {!visibleRecords.length && <p className="admin-list-state">当前分类还没有写真内容</p>}
          </div>
        )}
      </section>

      {batchAction && (
        <div className="admin-batch-overlay" role="presentation">
          <section className="admin-batch-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-dialog-title">
            <div className="admin-batch-dialog-heading">
              <div><span>批量操作</span><h2 id="batch-dialog-title">{batchAction === 'add' ? '添加分类' : '移除分类'}</h2></div>
              <button type="button" onClick={closeBatchPanel} aria-label="关闭"><X size={18} /></button>
            </div>
            <p>为已选择的 {selectedPortraitIds.length} 条写真选择一个或多个分类。</p>
            <div className="admin-category-options admin-batch-category-options">
              {categoryRecords.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={batchCategoryIds.includes(item.id)} onChange={() => toggleBatchCategory(item.id)} />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
            {batchConfirming && (
              <p className="admin-batch-confirm">
                {batchAction === 'add' ? `确认将 ${selectedPortraitIds.length} 条写真添加到：` : `确认从 ${selectedPortraitIds.length} 条写真中移除：`}
                {categoryRecords.filter((item) => batchCategoryIds.includes(item.id)).map((item) => item.name).join('、')}？
              </p>
            )}
            <div className="admin-batch-dialog-actions">
              <button type="button" onClick={closeBatchPanel}>取消</button>
              {batchConfirming ? (
                <button type="button" className={batchAction === 'remove' ? 'danger' : 'primary'} onClick={() => void applyBatchCategories()} disabled={saving}>{saving ? '处理中…' : batchAction === 'add' ? '确认添加' : '确认移除'}</button>
              ) : (
                <button type="button" className="primary" onClick={() => setBatchConfirming(true)} disabled={!batchCategoryIds.length}>继续</button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function AdminNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="admin-page admin-login-page">
      <header className="admin-header"><div><p>CHATGPT PORTRAIT GALLERY</p><h1>写真内容管理</h1></div><a href="/">返回前台</a></header>
      <section className="admin-panel admin-login-panel"><h2>{title}</h2><p className="admin-note">{detail}</p></section>
    </main>
  );
}
