import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Flame, Search, Sparkles, X } from 'lucide-react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { toPhotoTemplate, type CategoryRecord, type PhotoTemplate, type PortraitCategoryRecord, type PortraitRecord } from './gallery';
import { AdminPage } from './AdminPage';
import { subscribeToGalleryDataChanges } from './gallerySync';
import { supabase } from './supabase';

function App() {
  const [templates, setTemplates] = useState<PhotoTemplate[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadGalleryData = useCallback(async () => {
    if (!supabase) {
      setTemplates([]);
      setCategoryNames([]);
      setLoadError('写真数据暂时不可用');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    const [portraitResult, categoryResult, relationResult] = await Promise.all([
      supabase.from('portraits').select('id,name,prompt,image_url,created_at').order('id', { ascending: true }),
      supabase.from('categories').select('id,name,created_at').order('id', { ascending: true }),
      supabase.from('portrait_categories').select('portrait_id,category_id,created_at'),
    ]);
    if (portraitResult.error || categoryResult.error || relationResult.error) {
      setTemplates([]);
      setCategoryNames([]);
      setLoadError('写真数据加载失败，请稍后重试');
    } else {
      const portraits = (portraitResult.data ?? []) as PortraitRecord[];
      const availableCategories = (categoryResult.data ?? []) as CategoryRecord[];
      const relations = (relationResult.data ?? []) as PortraitCategoryRecord[];
      const categoryById = new Map(availableCategories.map((item) => [item.id, item.name]));
      const namesByPortrait = new Map<number, string[]>();
      relations.forEach((relation) => {
        const categoryName = categoryById.get(relation.category_id);
        if (!categoryName) return;
        namesByPortrait.set(relation.portrait_id, [...(namesByPortrait.get(relation.portrait_id) ?? []), categoryName]);
      });
      setCategoryNames(availableCategories.map((item) => item.name));
      setTemplates(portraits.map((record) => toPhotoTemplate(record, namesByPortrait.get(record.id) ?? [])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadGalleryData();
    return subscribeToGalleryDataChanges(() => void loadGalleryData());
  }, [loadGalleryData]);

  return (
    <Routes>
      <Route path="/" element={<GalleryPage templates={templates} categoryNames={categoryNames} loading={loading} loadError={loadError} />} />
      <Route path="/style/:id" element={<DetailPage templates={templates} loading={loading} />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function GalleryPage({ templates, categoryNames, loading, loadError }: { templates: PhotoTemplate[]; categoryNames: string[]; loading: boolean; loadError: string }) {
  const [category, setCategory] = useState('全部');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    document.title = 'ChatGPT 写真馆';
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (category !== '全部' && !categoryNames.includes(category)) setCategory('全部');
  }, [category, categoryNames]);

  const filtered = useMemo(() => templates.filter((item) => {
    const inCategory = category === '全部' || item.categories.includes(category);
    const haystack = `${item.number} ${item.name} ${item.categories.join(' ')} ${item.tags.join(' ')}`.toLowerCase();
    return inCategory && (!deferredQuery || haystack.includes(deferredQuery));
  }), [category, deferredQuery, templates]);

  return (
    <main className="gallery-page">
      <header className="gallery-header">
        <div className="brand-mark" aria-label="ChatGPT 写真馆"><Sparkles size={17} strokeWidth={2.2} /></div>
        <div className="edition">VOL. 01</div>
      </header>
      <section className="intro">
        <p className="eyebrow">AI PORTRAIT COLLECTION</p>
        <h1>ChatGPT 写真馆</h1>
        <p className="subtitle">选一个你喜欢的风格</p>
      </section>
      <section className="discovery" aria-label="查找写真风格">
        <label className="search-box">
          <Search size={19} strokeWidth={2} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索风格、标签或编号" aria-label="搜索写真模板" />
          {query && <button type="button" className="clear-search" onClick={() => setQuery('')} aria-label="清空搜索"><X size={16} /></button>}
        </label>
        <div className="category-scroll" role="tablist" aria-label="写真分类">
          {['全部', ...categoryNames].map((item) => (
            <button key={item} type="button" role="tab" aria-selected={category === item} className={category === item ? 'category-chip active' : 'category-chip'} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
      </section>
      <section className="result-row" aria-live="polite">
        <span>{category === '全部' ? '本期精选' : category}</span>
        <span>{String(filtered.length).padStart(2, '0')} 款</span>
      </section>
      {loading ? (
        <section className="empty-state"><span>正在加载写真…</span></section>
      ) : loadError ? (
        <section className="empty-state"><span>{loadError}</span></section>
      ) : filtered.length ? (
        <section className="masonry" aria-label="写真模板">
          {filtered.map((item, index) => <TemplateCard key={item.id} item={item} index={index} />)}
        </section>
      ) : (
        <section className="empty-state"><span>没有找到匹配的风格</span><button type="button" onClick={() => { setQuery(''); setCategory('全部'); }}>看看全部模板</button></section>
      )}
    </main>
  );
}

function TemplateCard({ item, index }: { item: PhotoTemplate; index: number }) {
  return (
    <Link to={`/style/${item.id}`} className={`template-card card-${index % 4}`} aria-label={`${item.number} ${item.name}`}>
      <div className="card-image">
        <img src={item.images[0]} alt={`${item.name}效果图`} loading={index > 3 ? 'lazy' : 'eager'} />
        <span className="card-number">{item.number}</span>
        {item.hot && <span className="hot-badge"><Flame size={12} fill="currentColor" /> HOT</span>}
      </div>
      <div className="card-body"><h2>{item.name}</h2><div className="tag-row">{item.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
    </Link>
  );
}

function DetailPage({ templates, loading }: { templates: PhotoTemplate[]; loading: boolean }) {
  const { id } = useParams();
  const item = templates.find((template) => template.id === id);
  const [slide, setSlide] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [numberCopied, setNumberCopied] = useState(false);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (item) document.title = `${item.number} ${item.name}｜ChatGPT 写真馆`;
  }, [item]);

  if (loading) return <main className="detail-page"><section className="empty-state"><span>正在加载写真…</span></section></main>;
  if (!item) return <Navigate to="/" replace />;

  const go = (direction: number) => setSlide((current) => (current + direction + item.images.length) % item.images.length);
  const copy = async (text: string, kind: 'prompt' | 'number') => {
    await navigator.clipboard.writeText(text);
    if (kind === 'prompt') { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    else { setNumberCopied(true); window.setTimeout(() => setNumberCopied(false), 1800); }
  };

  return (
    <main className="detail-page">
      <div className="hero-slider" onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={(event) => { if (touchStart.current === null) return; const delta = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(delta) > 45) go(delta > 0 ? -1 : 1); touchStart.current = null; }}>
        <img src={item.images[slide]} alt={`${item.name}效果图 ${slide + 1}`} />
        <Link to="/" className="round-control back" aria-label="返回首页"><ArrowLeft size={20} /></Link>
        {item.hot && <span className="detail-hot"><Flame size={13} fill="currentColor" /> 热门模板</span>}
        <button type="button" className="round-control previous" onClick={() => go(-1)} aria-label="上一张"><ChevronLeft size={21} /></button>
        <button type="button" className="round-control next" onClick={() => go(1)} aria-label="下一张"><ChevronRight size={21} /></button>
        <div className="slide-dots" aria-label={`第 ${slide + 1} 张，共 ${item.images.length} 张`}>{item.images.map((_, index) => <button key={index} type="button" className={index === slide ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`查看第 ${index + 1} 张`} />)}</div>
      </div>
      <article className="detail-content">
        <div className="detail-heading"><p>{item.number}</p><h1>{item.name}</h1><span className="category-label">{item.category}</span></div>
        <div className="detail-tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
        <section className="info-block"><p className="section-index">01 / EFFECT</p><h2>效果说明</h2><p className="description">{item.description}</p></section>
        <section className="info-block prompt-block">
          <div className="section-title-row"><div><p className="section-index">02 / PROMPT</p><h2>完整提示词</h2></div><button type="button" className="copy-button" onClick={() => copy(item.prompt, 'prompt')}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : '复制提示词'}</button></div>
          <div className="prompt-card">{item.prompt}</div>
        </section>
      </article>
      <div className="sticky-cta"><button type="button" onClick={() => setSheetOpen(true)}>我要生成 <span>↗</span></button></div>
      {sheetOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setSheetOpen(false)}>
          <section className="lead-sheet" role="dialog" aria-modal="true" aria-labelledby="lead-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" /><button type="button" className="sheet-close" onClick={() => setSheetOpen(false)} aria-label="关闭"><X size={20} /></button>
            <p className="sheet-kicker">WECHAT · CONTACT</p><h2 id="lead-title">喜欢这个效果？</h2><p className="sheet-copy">加微信发原图和模板编号即可。</p>
            <div className="selected-template"><img src={item.images[0]} alt="当前模板缩略图" /><div><span>当前模板</span><strong>{item.number} {item.name}</strong></div></div>
            <div className="qr-wrap"><img src="/wechat-qr.png" alt="微信二维码" /><span>长按识别二维码添加微信</span></div>
            <button type="button" className="copy-number-button" onClick={() => copy(`${item.number} ${item.name}`, 'number')}>{numberCopied ? <Check size={17} /> : <Copy size={17} />}{numberCopied ? '模板编号已复制' : '复制模板编号'}</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
