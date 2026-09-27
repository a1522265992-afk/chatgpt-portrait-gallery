import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicDirectory = path.join(root, 'public');
const thumbnailDirectory = path.join(publicDirectory, 'thumbs');
const galleryPath = path.join(publicDirectory, 'gallery.json');
const env = loadEnv('production', root, '');
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [portraitResult, categoryResult, relationResult] = await Promise.all([
  supabase.from('portraits').select('id,name,image_url,created_at').order('id', { ascending: true }),
  supabase.from('categories').select('id,name,created_at').order('id', { ascending: true }),
  supabase.from('portrait_categories').select('portrait_id,category_id,created_at'),
]);

for (const result of [portraitResult, categoryResult, relationResult]) {
  if (result.error) throw result.error;
}

const portraits = portraitResult.data ?? [];
const categories = categoryResult.data ?? [];
const relations = relationResult.data ?? [];
const categoryById = new Map(categories.map((category) => [category.id, category.name]));
const categoriesByPortrait = new Map();

for (const relation of relations) {
  const name = categoryById.get(relation.category_id);
  if (!name) continue;
  const names = categoriesByPortrait.get(relation.portrait_id) ?? [];
  names.push(name);
  categoriesByPortrait.set(relation.portrait_id, names);
}

await mkdir(thumbnailDirectory, { recursive: true });

function transformedImageUrl(originalImage, width, quality) {
  const url = new URL(originalImage);
  const marker = '/storage/v1/object/public/';
  if (!url.hostname.endsWith('.supabase.co') || !url.pathname.includes(marker)) {
    throw new Error(`Unsupported non-Supabase image URL: ${originalImage}`);
  }
  url.pathname = url.pathname.replace(marker, '/storage/v1/render/image/public/');
  url.searchParams.set('width', String(width));
  url.searchParams.set('quality', String(quality));
  url.searchParams.set('resize', 'contain');
  return url;
}

async function downloadWebp(originalImage, width, quality) {
  const response = await fetch(transformedImageUrl(originalImage, width, quality), {
    headers: { Accept: 'image/webp' },
  });
  if (!response.ok) throw new Error(`Thumbnail request failed (${response.status}): ${originalImage}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('image/webp')) {
    throw new Error(`Expected WebP thumbnail but received ${contentType || 'unknown content type'}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

let nextIndex = 0;
let createdCount = 0;
let skippedCount = 0;
const thumbnailSizes = [];

async function syncNextThumbnail() {
  while (nextIndex < portraits.length) {
    const portrait = portraits[nextIndex];
    nextIndex += 1;
    const id = String(portrait.id).padStart(3, '0');
    const outputPath = path.join(thumbnailDirectory, `${id}.webp`);
    try {
      const existing = await stat(outputPath);
      skippedCount += 1;
      thumbnailSizes.push(existing.size);
      continue;
    } catch {
      // Missing thumbnails are generated below; existing files are never reprocessed.
    }

    let thumbnail = await downloadWebp(portrait.image_url, 560, 76);
    if (thumbnail.byteLength > 200 * 1024) {
      thumbnail = await downloadWebp(portrait.image_url, 480, 72);
    }
    await writeFile(outputPath, thumbnail);
    createdCount += 1;
    thumbnailSizes.push(thumbnail.byteLength);
    process.stdout.write(`Created thumbs/${id}.webp (${Math.round(thumbnail.byteLength / 1024)} KB)\n`);
  }
}

await Promise.all(Array.from({ length: Math.min(6, portraits.length) }, () => syncNextThumbnail()));

const gallery = {
  generatedAt: new Date().toISOString(),
  categories: categories.map((category) => category.name),
  items: portraits.map((portrait) => {
    const id = String(portrait.id).padStart(3, '0');
    return {
      id,
      name: portrait.name,
      categories: categoriesByPortrait.get(portrait.id) ?? [],
      thumbnail: `/thumbs/${id}.webp`,
      originalImage: portrait.image_url,
    };
  }),
};

await writeFile(galleryPath, `${JSON.stringify(gallery, null, 2)}\n`, 'utf8');

const largestBytes = thumbnailSizes.length ? Math.max(...thumbnailSizes) : 0;
const averageBytes = thumbnailSizes.length
  ? Math.round(thumbnailSizes.reduce((sum, size) => sum + size, 0) / thumbnailSizes.length)
  : 0;

process.stdout.write([
  `Gallery synced: ${gallery.items.length} portraits, ${gallery.categories.length} categories.`,
  `Thumbnails: ${createdCount} created, ${skippedCount} reused.`,
  `Thumbnail size: ${Math.round(averageBytes / 1024)} KB average, ${Math.round(largestBytes / 1024)} KB largest.`,
  `Wrote ${path.relative(root, galleryPath)}.`,
  '',
].join('\n'));
