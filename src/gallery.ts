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
  thumbnail: string;
  images: string[];
  description: string;
};

export type StaticGalleryItem = {
  id: string;
  name: string;
  categories: string[];
  thumbnail: string;
  originalImage: string;
};

export type StaticGalleryData = {
  generatedAt: string;
  categories: string[];
  items: StaticGalleryItem[];
};

export function toStaticPhotoTemplate(item: StaticGalleryItem): PhotoTemplate {
  const primaryCategory = item.categories[0] ?? '未分类';
  return {
    id: item.id,
    number: `#${item.id}`,
    name: item.name,
    category: primaryCategory,
    categories: item.categories,
    tags: item.categories,
    hot: item.categories.some((name) => name.includes('热门')),
    thumbnail: item.thumbnail,
    images: [item.originalImage],
    description: `以${item.name}为主题的${primaryCategory}写真效果。`,
  };
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
    thumbnail: record.image_url,
    images: [record.image_url],
    description: `以${record.name}为主题的${primaryCategory}写真效果。`,
  };
}
