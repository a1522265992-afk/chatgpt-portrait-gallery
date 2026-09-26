export type PortraitRecord = {
  id: number;
  name: string;
  category: string;
  prompt: string;
  image_url: string;
  created_at: string;
};

export type PhotoTemplate = {
  id: string;
  number: string;
  name: string;
  category: string;
  tags: string[];
  hot: boolean;
  images: string[];
  description: string;
  prompt: string;
};

export const categories = ['全部', '热门', '女生写真', '情侣', '闺蜜', '胶片', '旅行', '职业', '宠物', '动漫', '其他'];

export function toPhotoTemplate(record: PortraitRecord): PhotoTemplate {
  const id = String(record.id).padStart(3, '0');
  return {
    id,
    number: `#${id}`,
    name: record.name,
    category: record.category,
    tags: [record.category],
    hot: false,
    images: [record.image_url],
    description: `以${record.name}为主题的${record.category}写真效果。`,
    prompt: record.prompt,
  };
}
