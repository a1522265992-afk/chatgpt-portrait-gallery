import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Flame, Search, Sparkles, X } from 'lucide-react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { getGalleryThumbnailUrl, toPhotoTemplate, type CategoryRecord, type PhotoTemplate, type PortraitCategoryRecord, type PortraitRecord } from './gallery';
import { AdminPage } from './AdminPage';
import { subscribeToGalleryDataChanges } from './gallerySync';
import { supabase } from './supabase';

type GalleryFeedCache = {
  key: string;
  roundIds: string[][];
  scrollY: number;
};

let galleryFeedCache: GalleryFeedCache = { key: '', roundIds: [], scrollY: 0 };

function shuffleRound(items: PhotoTemplate[], previousRound: PhotoTemplate[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  if (shuffled.length > 1 && shuffled.every((item, index) => item.id === previousRound[index]?.id)) {
    shuffled.push(shuffled.shift()!);
  }
  if (shuffled.length > 1 && shuffled[0].id === previousRound.at(-1)?.id) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}

function getInitialRounds(items: PhotoTemplate[], cacheKey: string) {
  if (galleryFeedCache.key !== cacheKey || !galleryFeedCache.roundIds.length) return [items];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const restored = galleryFeedCache.roundIds.map((roundIds) => roundIds.map((id) => itemById.get(id)).filter((item): item is PhotoTemplate => Boolean(item)));
  return restored.every((round) => round.length === items.length) ? restored : [items];
}

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
      supabase.from('portraits').select('id,name,image_url,created_at').order('id', { ascending: true }),
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
  }, []);

  useEffect(() => {
    if (category !== '全部' && !categoryNames.includes(category)) setCategory('全部');
  }, [category, categoryNames]);

  const filtered = useMemo(() => templates.filter((item) => {
    const inCategory = category === '全部' || item.categories.includes(category);
    const haystack = `${item.number} ${item.name} ${item.categories.join(' ')} ${item.tags.join(' ')}`.toLowerCase();
    return inCategory && (!deferredQuery || haystack.includes(deferredQuery));
  }), [category, deferredQuery, templates]);
  const feedKey = useMemo(() => `${category}\u0001${deferredQuery}\u0001${filtered.map((item) => item.id).join(',')}`, [category, deferredQuery, filtered]);

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
        <LoopingGallery key={feedKey} items={filtered} cacheKey={feedKey} />
      ) : (
        <section className="empty-state"><span>没有找到匹配的风格</span><button type="button" onClick={() => { setQuery(''); setCategory('全部'); }}>看看全部模板</button></section>
      )}
    </main>
  );
}

function LoopingGallery({ items, cacheKey }: { items: PhotoTemplate[]; cacheKey: string }) {
  const [rounds, setRounds] = useState<PhotoTemplate[][]>(() => getInitialRounds(items, cacheKey));
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const appendLock = useRef(false);
  const navigatingToDetail = useRef(false);
  const canLoop = items.length >= 4;

  useEffect(() => {
    galleryFeedCache = { key: cacheKey, roundIds: rounds.map((round) => round.map((item) => item.id)), scrollY: galleryFeedCache.key === cacheKey ? galleryFeedCache.scrollY : 0 };
  }, [cacheKey, rounds]);

  useEffect(() => {
    let savedScroll = galleryFeedCache.key === cacheKey ? galleryFeedCache.scrollY : 0;
    let storedScroll: { key?: string; scrollY?: number } | null = null;
    try {
      storedScroll = JSON.parse(window.sessionStorage.getItem('portrait-gallery-scroll') ?? 'null') as { key?: string; scrollY?: number } | null;
      if (storedScroll?.key === cacheKey && typeof storedScroll.scrollY === 'number') {
        savedScroll = storedScroll.scrollY;
      }
    } catch {
      window.sessionStorage.removeItem('portrait-gallery-scroll');
    }
    const restore = () => {
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(0, savedScroll));
      document.documentElement.style.scrollBehavior = previousBehavior;
    };
    const frame = window.requestAnimationFrame(restore);
    const timer = window.setTimeout(() => {
      restore();
      if (storedScroll?.key === cacheKey) window.sessionStorage.removeItem('portrait-gallery-scroll');
    }, 500);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [cacheKey]);

  useEffect(() => () => {
    if (galleryFeedCache.key !== cacheKey || navigatingToDetail.current) return;
    const currentScroll = window.scrollY;
    if (currentScroll > 0 || galleryFeedCache.scrollY === 0) galleryFeedCache.scrollY = currentScroll;
  }, [cacheKey]);

  useEffect(() => {
    appendLock.current = false;
  }, [rounds.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!canLoop || !sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || appendLock.current) return;
      appendLock.current = true;
      observer.disconnect();
      setRounds((current) => [...current, shuffleRound(items, current.at(-1) ?? items)]);
    }, { rootMargin: '0px 0px 900px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoop, items, rounds.length]);

  return (
    <div className="loop-feed" onClickCapture={(event) => {
      if ((event.target as HTMLElement).closest('.template-card') && galleryFeedCache.key === cacheKey) {
        navigatingToDetail.current = true;
        galleryFeedCache.scrollY = window.scrollY;
        window.sessionStorage.setItem('portrait-gallery-scroll', JSON.stringify({ key: cacheKey, scrollY: window.scrollY }));
      }
    }}>
      {rounds.map((round, roundIndex) => (
        <div className="gallery-round" data-round={roundIndex + 1} key={`${cacheKey}-round-${roundIndex}`}>
          <section className="masonry" aria-label={`写真模板第 ${roundIndex + 1} 轮`}>
            {round.map((item, index) => <TemplateCard key={`${roundIndex}-${item.id}`} item={item} index={(roundIndex * items.length) + index} />)}
          </section>
          {canLoop && (
            <section className="gallery-ending" aria-label={`第 ${roundIndex + 1} 轮写真结束`}>
              <p className="gallery-ending-label">Members Library</p>
              <p className="gallery-ending-title">这里展示的，只是一小部分。</p>
              <p className="gallery-ending-copy">更多写真模板，每周持续更新。</p>
            </section>
          )}
        </div>
      ))}
      {canLoop && <div className="loop-sentinel" ref={sentinelRef} aria-hidden="true" />}
    </div>
  );
}

function TemplateCard({ item, index }: { item: PhotoTemplate; index: number }) {
  const thumbnailUrl = getGalleryThumbnailUrl(item.images[0]);
  return (
    <Link to={`/style/${item.id}`} className={`template-card card-${index % 4}`} aria-label={`${item.number} ${item.name}`}>
      <div className="card-image">
        <img
          src={thumbnailUrl}
          alt={`${item.name}效果图`}
          width="480"
          height="640"
          loading={index < 6 ? 'eager' : 'lazy'}
          decoding="async"
        />
        {item.hot && <span className="hot-badge"><Flame size={12} fill="currentColor" /> HOT</span>}
      </div>
      <div className="card-body">
        <h2>{item.name}</h2>
        <div className="card-meta"><span>{item.number}</span><span>{item.category}</span></div>
      </div>
    </Link>
  );
}

function DetailPage({ templates, loading }: { templates: PhotoTemplate[]; loading: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const item = templates.find((template) => template.id === id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [numberCopied, setNumberCopied] = useState(false);
  const [loadedImageId, setLoadedImageId] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    setSheetOpen(false);
    setQrOpen(false);
    if (item) document.title = `${item.number} ${item.name}｜ChatGPT 写真馆`;
  }, [item]);

  if (loading) return <main className="detail-page"><section className="empty-state"><span>正在加载写真…</span></section></main>;
  if (!item) return <Navigate to="/" replace />;

  const switchTemplate = (direction: number) => {
    const currentIndex = templates.findIndex((template) => template.id === item.id);
    const targetIndex = (currentIndex + direction + templates.length) % templates.length;
    navigate(`/style/${templates[targetIndex].id}`);
  };
  const copyNumber = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setNumberCopied(true);
    window.setTimeout(() => setNumberCopied(false), 1800);
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart.current) return;
    const deltaX = event.changedTouches[0].clientX - touchStart.current.x;
    const deltaY = event.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(deltaX) < 64 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
    switchTemplate(deltaX < 0 ? 1 : -1);
  };

  return (
    <main className="detail-page">
      <div
        className={loadedImageId === item.id ? 'hero-slider image-ready' : 'hero-slider'}
        onTouchStart={(event) => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchStart.current = null; }}
      >
        <div className="image-skeleton" aria-hidden="true" />
        <img key={item.id} src={item.images[0]} alt={`${item.name}效果图`} onLoad={() => setLoadedImageId(item.id)} />
        <Link to="/" className="round-control back" aria-label="返回首页"><ArrowLeft size={20} /></Link>
        {item.hot && <span className="detail-hot"><Flame size={13} fill="currentColor" /> 热门模板</span>}
        <button type="button" className="round-control previous" onClick={() => switchTemplate(-1)} aria-label="上一个写真模板"><ChevronLeft size={23} /></button>
        <button type="button" className="round-control next" onClick={() => switchTemplate(1)} aria-label="下一个写真模板"><ChevronRight size={23} /></button>
        <div className="swipe-hint" aria-hidden="true">左右滑动切换模板</div>
      </div>
      <article className="detail-content">
        <div className="detail-heading"><p>{item.number}</p><h1>{item.name}</h1></div>
        <div className="detail-tags" aria-label="写真分类">{item.categories.length ? item.categories.map((tag) => <span key={tag}>{tag}</span>) : <span>未分类</span>}</div>
        <section className="info-block"><p className="section-index">ABOUT THIS LOOK</p><h2>效果说明</h2><p className="description">{item.description}</p></section>
      </article>
      <div className="sticky-cta"><button type="button" onClick={() => setSheetOpen(true)}>我要生成 <span>↗</span></button></div>
      {sheetOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setSheetOpen(false)}>
          <section className="lead-sheet" role="dialog" aria-modal="true" aria-labelledby="lead-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" /><button type="button" className="sheet-close" onClick={() => setSheetOpen(false)} aria-label="关闭"><X size={20} /></button>
            <p className="sheet-kicker">WECHAT · CONTACT</p><h2 id="lead-title">喜欢这个效果？</h2><p className="sheet-copy">加微信发原图和模板编号即可。</p>
            <div className="selected-template"><img src={item.images[0]} alt="当前模板缩略图" /><div><span>当前模板</span><strong>{item.number} {item.name}</strong></div></div>
            <div className="qr-wrap">
              <img src="/wechat-qr.png" alt="微信二维码，点击放大" role="button" tabIndex={0} onClick={() => setQrOpen(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setQrOpen(true); }} />
              <span>点击放大 · 长按二维码保存 / 识别添加微信</span>
            </div>
            <div className="price-info" aria-label="价格信息">
              <p className="price-line"><span><strong>¥8.88</strong> / 10张</span><span className="price-separator">·</span><span><strong>¥38</strong> / 月无限量</span></p>
              <p className="price-note">每张照片支持 5 次修改</p>
            </div>
            <button type="button" className="copy-number-button" onClick={() => copyNumber(`${item.number} ${item.name}`)}>{numberCopied ? <Check size={17} /> : <Copy size={17} />}{numberCopied ? '模板编号已复制' : '复制模板编号'}</button>
          </section>
        </div>
      )}
      {qrOpen && (
        <div className="qr-preview" role="dialog" aria-modal="true" aria-label="微信二维码大图" onClick={() => setQrOpen(false)}>
          <button type="button" className="qr-preview-close" onClick={() => setQrOpen(false)} aria-label="关闭二维码大图"><X size={22} /></button>
          <div className="qr-preview-card" onClick={(event) => event.stopPropagation()}>
            <img src="/wechat-qr.png" alt="微信二维码大图" />
            <p>长按二维码保存 / 识别添加微信</p>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
