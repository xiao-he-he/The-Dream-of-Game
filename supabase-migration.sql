-- 梦游室论坛数据库迁移 v3（去触发器，代码层处理）
-- 先全选运行一次即可

-- 先清旧表（请确认无重要数据！）
DROP TABLE IF EXISTS images CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP FUNCTION IF EXISTS update_likes_count CASCADE;
DROP FUNCTION IF EXISTS update_comments_count CASCADE;

-- 1. 用户资料表
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT false,
  bio TEXT DEFAULT '',
  post_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 帖子表
CREATE TABLE posts (
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
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 点赞表
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 5. 图片表
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  uploader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== RLS =====
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_all" ON profiles FOR ALL USING (true) WITH CHECK (true);
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
  IF TG_OP = 'INSERT' THEN UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_like_change ON likes;
CREATE TRIGGER on_like_change AFTER INSERT OR DELETE ON likes FOR EACH ROW EXECUTE FUNCTION update_likes_count();

CREATE OR REPLACE FUNCTION update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_change ON comments;
CREATE TRIGGER on_comment_change AFTER INSERT OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION update_comments_count();
