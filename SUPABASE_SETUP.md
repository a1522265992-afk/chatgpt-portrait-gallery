# Supabase 设置

1. 新项目在 Supabase SQL Editor 执行 `supabase/setup.sql`；已有单分类项目执行 `supabase/migrations/20260926_multi_categories.sql`。
2. 在 Authentication → Providers → Email 中开启邮箱密码登录，并关闭新用户注册。
3. 在 Authentication → Users 中手动创建唯一管理员账号。
4. 复制项目 URL 和 Publishable Key 到 `.env.local`：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

不要把 Secret Key 或 `service_role` Key 放入前端环境变量。
