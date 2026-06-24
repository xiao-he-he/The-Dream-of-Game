-- 梦游室论坛数据库迁移 v2（先删后建，可重复运行）
-- 在 Supabase SQL Editor 中运行此文件

-- 1. 用户资料表
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT false,
  bio TEXT DEFAULT '',
  post_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'user_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. 帖子表
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  board TEXT NOT NULL DEFAULT 'chat',
  tags TEXT[] DEFAULT '{}',
  image_urls TEXT[] DEFAULT '{}',
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  views_count INT DEFAULT 0,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 评论表
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 点赞表
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 5. 图片表
CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  uploader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== RLS: 先删再建 =====
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "posts_read" ON posts;
DROP POLICY IF EXISTS "posts_insert" ON posts;
DROP POLICY IF EXISTS "posts_update" ON posts;
DROP POLICY IF EXISTS "posts_delete" ON posts;
DROP POLICY IF EXISTS "comments_read" ON comments;
DROP POLICY IF EXISTS "comments_insert" ON comments;
DROP POLICY IF EXISTS "comments_delete" ON comments;
DROP POLICY IF EXISTS "likes_read" ON likes;
DROP POLICY IF EXISTS "likes_insert" ON likes;
DROP POLICY IF EXISTS "likes_delete" ON likes;
DROP POLICY IF EXISTS "images_read" ON images;
DROP POLICY IF EXISTS "images_insert" ON images;

CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "posts_read" ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts_update" ON posts FOR UPDATE USING (auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "comments_read" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "likes_read" ON likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON likes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "images_read" ON images FOR SELECT USING (true);
CREATE POLICY "images_insert" ON images FOR INSERT WITH CHECK (auth.uid() = uploader_id);

-- ===== 触发器 =====
CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_like_change ON likes;
CREATE TRIGGER on_like_change AFTER INSERT OR DELETE ON likes FOR EACH ROW EXECUTE FUNCTION update_likes_count();

CREATE OR REPLACE FUNCTION update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_change ON comments;
CREATE TRIGGER on_comment_change AFTER INSERT OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION update_comments_count();
