# 梦游室网站内容更新说明

这个文件夹是网站的内容配置区。后续更新网站时，优先修改对应功能模块里的 JSON 文件，再把素材放入现有素材文件夹。

## 常用更新入口

- `content/knowledge/documents.json`：知识库文章与飞书链接。
- `content/music/tracks.json`：全局音乐播放器歌单，音乐文件放入 `music` 文件夹。
- `content/media/videos.json`：视频中心与 R2 对象配置，封面放入参考图文件夹，本地源视频放入 `video` 文件夹。
- `content/events/events.json`：活动公告、时间、地点与报名说明。
- `content/forum/boards.json`：论坛板块展示。
- `content/projects/projects.json`：社团项目库。
- `content/resources/resources.json`：资源中心。
- `content/tools/ai-tools.json`：AI 工具导航。
- `content/integrations/feishu.json`：飞书文档、多维表格、日历、群链接。
- `content/forum/giscus.json`：GitHub giscus 评论配置。
- `content/site/网站全文本.md`：网站全文案集中维护稿，包含首页、论坛、个人主页等页面文字。

## 路径写法

- PDF：如后续恢复站内 PDF，可使用 `/文章/文件名.pdf`
- 音乐：`/music/文件名.mp3`
- 图片：`/概念设计图/文件名.png` 或 `/排版及平设参考图/文件名.jpg`
- 飞书：直接填写完整 URL。

## 视频与 Cloudflare R2

- 生产环境视频存放在 R2，网站使用 `VITE_MEDIA_BASE_URL` 拼接视频条目的 `objectKey`。
- 在 GitHub 仓库的 Actions variables 中添加 `VITE_MEDIA_BASE_URL`，值为 R2 自定义域名，例如 `https://media.example.com`。
- R2 对象必须设置正确的 `Content-Type: video/mp4`。
- 本地开发使用视频条目的 `localSrc`；MP4 不提交 Git，也不会复制到 GitHub Pages 构建产物。
- 当前教程上传到 R2 后的对象键应为 `tutorials/我的世界面板服务器搭建详细教程.mp4`，与 `videos.json` 保持一致。

旧工作日志不要修改，每次新工作都在 `提示词及工作日志` 中新增一份 `时间戳-工作日志.md`。
