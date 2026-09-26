import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Copy, ImagePlus, Pencil, Trash2, X } from 'lucide-react';
import { categories, templates, type PhotoTemplate } from './gallery';

const contentCategories = categories.filter((category) => category !== '全部' && category !== '热门');

function getExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || 'jpg';
}

export function AdminPage() {
  const [records, setRecords] = useState<PhotoTemplate[]>(() => templates.map((item) => ({ ...item, images: [...item.images], tags: [...item.tags] })));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(contentCategories[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewById, setPreviewById] = useState<Record<string, string>>({});
  const [syncVisible, setSyncVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [imageInstruction, setImageInstruction] = useState<string | null>(null);
  const nextId = useRef(Math.max(...templates.map((item) => Number(item.id)), 0) + 1);

  useEffect(() => {
    document.title = '写真内容管理｜ChatGPT 写真馆';
    window.scrollTo(0, 0);
  }, []);

  const generatedJson = useMemo(() => JSON.stringify(records, null, 2), [records]);

  const clearForm = () => {
    setEditingId(null);
    setName('');
    setCategory(contentCategories[0]);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || (!editingId && !selectedFile)) return;

    if (editingId) {
      const current = records.find((item) => item.id === editingId);
      if (!current) return;
      const imagePath = selectedFile ? `/images/${editingId}.${getExtension(selectedFile.name)}` : current.images[0];
      setRecords((items) => items.map((item) => item.id === editingId ? {
        ...item,
        name: cleanName,
        category,
        tags: item.tags.length ? item.tags : [category],
        images: selectedFile ? [imagePath] : item.images,
      } : item));
      if (selectedFile && previewUrl) {
        setPreviewById((items) => ({ ...items, [editingId]: previewUrl }));
        setImageInstruction(`public/images/${editingId}.${getExtension(selectedFile.name)}`);
      } else {
        setImageInstruction(null);
      }
      setMessage(`已生成 ${current.number} ${cleanName} 的更新数据`);
    } else {
      const id = String(nextId.current).padStart(3, '0');
      nextId.current += 1;
      const extension = getExtension(selectedFile!.name);
      const imagePath = `/images/${id}.${extension}`;
      const newItem: PhotoTemplate = {
        id,
        number: `#${id}`,
        name: cleanName,
        category,
        tags: [category],
        hot: false,
        images: [imagePath],
        description: `以${cleanName}为主题的写真效果。`,
        prompt: `以参考人物为主体，生成${cleanName}风格写真，保持人物面部特征自然一致。`,
      };
      setRecords((items) => [...items, newItem]);
      if (previewUrl) setPreviewById((items) => ({ ...items, [id]: previewUrl }));
      setImageInstruction(`public/images/${id}.${extension}`);
      setMessage(`已生成 ${newItem.number} ${newItem.name} 的新增数据`);
    }

    setSyncVisible(true);
    setCopied(false);
    clearForm();
  };

  const editRecord = (item: PhotoTemplate) => {
    setEditingId(item.id);
    setName(item.name);
    setCategory(item.category);
    setSelectedFile(null);
    setPreviewUrl(previewById[item.id] || item.images[0]);
    setImageInstruction(null);
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteRecord = (item: PhotoTemplate) => {
    if (!window.confirm(`确定删除 ${item.number} ${item.name} 吗？`)) return;
    setRecords((items) => items.filter((record) => record.id !== item.id));
    if (editingId === item.id) clearForm();
    setImageInstruction(null);
    setMessage(`已生成删除 ${item.number} ${item.name} 后的数据`);
    setSyncVisible(true);
    setCopied(false);
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(generatedJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p>CHATGPT PORTRAIT GALLERY</p>
          <h1>写真内容管理</h1>
        </div>
        <a href="/">返回前台</a>
      </header>

      <section className="admin-panel admin-form-panel">
        <div className="admin-panel-heading">
          <div><span>01</span><h2>{editingId ? '编辑写真' : '新增写真'}</h2></div>
          {editingId && <button type="button" className="admin-cancel" onClick={clearForm}><X size={16} />取消编辑</button>}
        </div>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-field">
            <span>图片</span>
            <div className="admin-upload">
              <input type="file" accept="image/*" onChange={handleImage} required={!editingId} />
              {previewUrl ? <img src={previewUrl} alt="待发布图片预览" /> : <div><ImagePlus size={28} /><strong>上传图片</strong><small>保留原图，发布后按提示保存</small></div>}
            </div>
          </label>
          <label className="admin-field">
            <span>名称</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="输入写真名称" required />
          </label>
          <label className="admin-field">
            <span>分类</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {contentCategories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button type="submit" className="admin-publish">发布</button>
        </form>
      </section>

      {syncVisible && (
        <section className="admin-panel admin-sync" aria-live="polite">
          <div className="admin-panel-heading"><div><span>02</span><h2>待同步数据</h2></div></div>
          <p className="admin-success"><Check size={17} />{message}</p>
          {imageInstruction && <div className="admin-path"><span>图片请保存为</span><code>{imageInstruction}</code></div>}
          <p className="admin-note">静态页面不能直接写入项目文件。请复制下面的完整 JSON，同步到现有 <code>src/gallery.ts</code> 的 templates 数据。</p>
          <textarea value={generatedJson} readOnly aria-label="完整写真数据 JSON" />
          <button type="button" className="admin-copy" onClick={copyJson}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? '已复制完整 JSON' : '复制完整 JSON'}</button>
        </section>
      )}

      <section className="admin-panel admin-list-panel">
        <div className="admin-panel-heading"><div><span>{syncVisible ? '03' : '02'}</span><h2>现有写真</h2></div><strong>{records.length} 条</strong></div>
        <div className="admin-list">
          {records.map((item) => (
            <article className="admin-row" key={item.id}>
              <img src={previewById[item.id] || item.images[0]} alt="" />
              <div className="admin-row-copy"><span>{item.number}</span><strong>{item.name}</strong><small>{item.category}</small></div>
              <div className="admin-row-actions">
                <button type="button" onClick={() => editRecord(item)}><Pencil size={15} />编辑</button>
                <button type="button" className="danger" onClick={() => deleteRecord(item)}><Trash2 size={15} />删除</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
