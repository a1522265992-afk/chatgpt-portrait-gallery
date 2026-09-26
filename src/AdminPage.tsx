import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, LogOut, Pencil, Trash2, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { categories, type PortraitRecord } from './gallery';
import { isSupabaseConfigured, portraitBucket, supabase } from './supabase';

const contentCategories = categories.filter((category) => category !== '全部' && category !== '热门');
const portraitFields = 'id,name,category,prompt,image_url,created_at';

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(contentCategories[0]);
  const [prompt, setPrompt] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadRecords = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('portraits')
      .select(portraitFields)
      .order('id', { ascending: true });
    if (loadError) setError(loadError.message);
    else setRecords((data ?? []) as PortraitRecord[]);
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
    if (session) void loadRecords();
    else setRecords([]);
  }, [loadRecords, session]);

  const clearForm = () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setEditingId(null);
    setName('');
    setCategory(contentCategories[0]);
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
          category,
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
        setRecords((items) => items.map((item) => item.id === editingId ? data as PortraitRecord : item));
        if (uploaded) {
          const oldPath = getStoragePath(current.image_url);
          if (oldPath) await supabase.storage.from(portraitBucket).remove([oldPath]);
        }
        setMessage(`已更新 #${String(editingId).padStart(3, '0')} ${cleanName}`);
      } else {
        const { data, error: insertError } = await supabase
          .from('portraits')
          .insert({ name: cleanName, category, prompt: cleanPrompt, image_url: uploaded!.publicUrl })
          .select(portraitFields)
          .single();
        if (insertError) throw insertError;
        setRecords((items) => [...items, data as PortraitRecord].sort((a, b) => a.id - b.id));
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
    setCategory(item.category);
    setPrompt(item.prompt);
    setPreviewUrl(item.image_url);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteRecord = async (item: PortraitRecord) => {
    if (!supabase || !window.confirm(`确定删除 #${String(item.id).padStart(3, '0')} ${item.name} 吗？`)) return;
    setSaving(true);
    setError('');
    const { error: deleteError } = await supabase.from('portraits').delete().eq('id', item.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      const path = getStoragePath(item.image_url);
      if (path) await supabase.storage.from(portraitBucket).remove([path]);
      setRecords((items) => items.filter((record) => record.id !== item.id));
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
          <label className="admin-field"><span>分类</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{contentCategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="admin-field admin-prompt-field"><span>提示词</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入完整 AI 图片生成提示词" rows={6} required /></label>
          <button type="submit" className="admin-publish" disabled={saving}>{saving ? '保存中…' : '发布'}</button>
        </form>
        {message && <p className="admin-feedback">{message}</p>}
        {error && <p className="admin-error">{error}</p>}
      </section>

      <section className="admin-panel admin-list-panel">
        <div className="admin-panel-heading"><div><span>02</span><h2>现有写真</h2></div><strong>{records.length} 条</strong></div>
        {loading ? <p className="admin-list-state">正在加载…</p> : (
          <div className="admin-list">
            {records.map((item) => (
              <article className="admin-row" key={item.id}>
                <img src={item.image_url} alt="" />
                <div className="admin-row-copy"><span>#{String(item.id).padStart(3, '0')}</span><strong>{item.name}</strong><small>{item.category}</small></div>
                <div className="admin-row-actions">
                  <button type="button" onClick={() => editRecord(item)} disabled={saving}><Pencil size={15} />编辑</button>
                  <button type="button" className="danger" onClick={() => void deleteRecord(item)} disabled={saving}><Trash2 size={15} />删除</button>
                </div>
              </article>
            ))}
            {!records.length && <p className="admin-list-state">还没有写真内容</p>}
          </div>
        )}
      </section>
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
