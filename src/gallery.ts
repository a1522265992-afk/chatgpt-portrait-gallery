export type PortraitRecord = {
  id: number;
  name: string;
  prompt: string;
  image_url: string;
  created_at: string;
};

export type CategoryRecord = {
  id: number;
  name: string;
  created_at: string;
};

export type PortraitCategoryRecord = {
  portrait_id: number;
  category_id: number;
  created_at: string;
};

export type PhotoTemplate = {
  id: string;
  number: string;
  name: string;
  category: string;
  categories: string[];
  tags: string[];
  hot: boolean;
  images: string[];
  description: string;
};

export function getGalleryThumbnailUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const publicStoragePath = '/storage/v1/object/public/';
    if (!url.hostname.endsWith('.supabase.co') || !url.pathname.includes(publicStoragePath)) return sourceUrl;

    url.pathname = url.pathname.replace(publicStoragePath, '/storage/v1/render/image/public/');
    url.searchParams.set('width', '600');
    url.searchParams.set('quality', '78');
    url.searchParams.set('resize', 'contain');
    return url.toString();
  } catch {
    return sourceUrl;
  }
}

export function toPhotoTemplate(record: Omit<PortraitRecord, 'prompt'>, categoryNames: string[]): PhotoTemplate {
  const id = String(record.id).padStart(3, '0');
  const primaryCategory = categoryNames[0] ?? '未分类';
  return {
    id,
    number: `#${id}`,
    name: record.name,
    category: primaryCategory,
    categories: categoryNames,
    tags: categoryNames,
    hot: categoryNames.some((name) => name.includes('热门')),
    images: [record.image_url],
    description: `以${record.name}为主题的${primaryCategory}写真效果。`,
  };
}
