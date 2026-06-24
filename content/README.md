# 梦游室网站内容更新说明

这个文件夹是网站的内容配置区。后续更新网站时，优先修改对应功能模块里的 JSON 文件，再把素材放入现有素材文件夹。

## 常用更新入口

- `content/knowledge/documents.json`：知识库文章、飞书链接、PDF 文档。
- `content/music/tracks.json`：全局音乐播放器歌单，音乐文件放入 `music` 文件夹。
- `content/media/videos.json`：Bilibili 视频中心，视频封面可用参考图或放入 `video` 文件夹。
- `content/events/events.json`：活动公告、倒计时、报名链接。
- `content/forum/boards.json`：论坛板块展示。
- `content/projects/projects.json`：社团项目库。
- `content/resources/resources.json`：资源中心。
- `content/tools/ai-tools.json`：AI 工具导航。
- `content/integrations/feishu.json`：飞书文档、多维表格、日历、群链接。
- `content/forum/giscus.json`：GitHub giscus 评论配置。
- `content/site/网站全文本.md`：网站全文案集中维护稿。

## 路径写法

- PDF：`/文章/文件名.pdf`
- 音乐：`/music/文件名.mp3`
- 图片：`/概念设计图/文件名.png` 或 `/排版及平设参考图/文件名.jpg`
- 飞书：直接填写完整 URL。

旧工作日志不要修改，每次新工作都在 `提示词及工作日志` 中新增一份 `时间戳-工作日志.md`。
