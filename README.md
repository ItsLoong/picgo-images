# IHS · ItsLoong Image Hosting Service

个人 GitHub 图床，基于现有仓库增量扩展。原有 img/、根目录图片及历史 URL 保持不变。

## 目录约定

- 历史图片：原有根目录和 img/，不移动、不进入随机池。
- 壁纸：wallpapers/<device>/<scene>/，device 为 desktop 或 mobile。
- 头像：avatars/<scene>/。
- 支持 WebP、JPEG、PNG、GIF；宽高由脚本读取，不按分辨率重复存目录。
- 图片使用普通 Git，不使用 Git LFS。

## PicGo

原有 PicGo 配置保持不变。新增配置仅修改存储路径：

| 配置 | 存储路径 |
|---|---|
| Desktop Wallpaper | wallpapers/desktop/nature/ |
| Mobile Wallpaper | wallpapers/mobile/anime/ |
| Anime Avatar | avatars/anime/ |
| Illustration Avatar | avatars/illustration/ |

Fine-grained Token 对本仓库授予 Contents: Read and write。不要将 Token 放入仓库或 Worker。

## 自动索引

图片上传到 wallpapers/ 或 avatars/ 后，GitHub Actions 自动运行 scripts/build_image_index.py 并更新 images-index.json。旧 img/ 和根目录图片不会被扫描。

可选元数据写入 _image_meta.json：
{
  "images": {
    "wallpapers/desktop/nature/forest.webp": {
      "title": "Forest",
      "tags": ["forest", "green"]
    }
  }
}

## Worker

Worker 源码位于 worker/，独立部署。修改 worker/wrangler.jsonc 中的 INDEX_URL 和 IMAGE_BASE_URL 后执行：

    cd worker
    npm install
    npm run dev
    npm run deploy

接口：
- /wallpaper?device=desktop&resolution=4k&scene=nature
- /avatar?scene=anime&min_size=512
- /api/random?type=wallpaper&count=5
- /api/catalog
- /health

原有图片路径与链接不变。