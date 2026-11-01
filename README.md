# ItsLoong Image Hosting

基于 GitHub 的个人图片仓库，提供图片存储、分类管理，以及随机壁纸和头像 API。

## 功能

- 使用 PicGo 上传图片到 GitHub。
- 按设备、场景和用途组织壁纸与头像。
- GitHub Actions 自动生成图片索引，记录尺寸、格式、方向和标签。
- Cloudflare Worker 提供随机图片、条件筛选和 JSON 查询接口。
- 图片使用普通 Git 管理，不使用 Git LFS。

## 目录结构

```text
.
├── wallpapers/
│   ├── desktop/
│   │   ├── nature/
│   │   ├── anime/
│   │   ├── tech/
│   │   └── abstract/
│   └── mobile/
│       ├── nature/
│       ├── anime/
│       └── abstract/
├── avatars/
│   ├── anime/
│   ├── illustration/
│   ├── pixel/
│   └── abstract/
├── scripts/
│   ├── build_image_index.py
│   ├── requirements.txt
│   └── tests/
├── .github/workflows/
│   └── update-image-index.yml
├── worker/
│   ├── src/index.js
│   ├── test/
│   ├── package.json
│   └── wrangler.jsonc
├── _image_meta.json
└── images-index.json
```

## PicGo 配置

GitHub 图床配置：

| 配置项 | 值 |
|---|---|
| 仓库 | `ItsLoong/picgo-images` |
| 分支 | `main` |
| Token 权限 | Repository contents: Read and write |

建议按上传用途建立 PicGo 配置：

| 用途 | 存储路径 |
|---|---|
| 桌面壁纸 | `wallpapers/desktop/<scene>/` |
| 手机壁纸 | `wallpapers/mobile/<scene>/` |
| 头像 | `avatars/<scene>/` |

场景目录使用小写英文名称，例如 `nature`、`anime`、`tech`、`abstract`。

## 图片索引

向 `wallpapers/` 或 `avatars/` 上传图片后，GitHub Actions 自动执行索引生成脚本并更新 `images-index.json`。

索引自动读取：

- 图片宽度、高度和宽高比
- 横屏、竖屏或方形方向
- 图片格式、文件大小和动画帧数
- 目录中的资源类型、设备类型和场景
- `_image_meta.json` 中补充的标题、描述和标签

可选元数据示例：

```json
{
  "images": {
    "wallpapers/desktop/nature/forest.webp": {
      "title": "Forest",
      "description": "Forest landscape wallpaper",
      "tags": ["forest", "green"],
      "featured": true
    }
  }
}
```

分辨率不通过重复目录管理，而是根据索引中的原始宽高筛选。

## Cloudflare Worker

Worker 位于 `worker/` 目录。部署前检查 `worker/wrangler.jsonc` 中的：

- `INDEX_URL`：本仓库 `main/images-index.json` 的 Raw 地址。
- `IMAGE_BASE_URL`：本仓库 `main` 分支的 Raw 根地址。

部署命令：

```bash
cd worker
npm install
npm test
npm run dev
npm run deploy
```

Public 仓库无需在 Worker 中配置 GitHub Token。

## API

以下以部署域名 `https://img.example.com` 为例：

| 接口 | 说明 |
|---|---|
| `GET /wallpaper` | 随机壁纸，302 跳转到图片 |
| `GET /avatar` | 随机头像，302 跳转到图片 |
| `GET /api/wallpaper` | 返回随机壁纸 JSON |
| `GET /api/avatar` | 返回随机头像 JSON |
| `GET /api/random?type=wallpaper&count=5` | 批量随机查询 |
| `GET /api/catalog` | 查询可用类型、场景和标签 |
| `GET /health` | 服务健康检查 |

筛选参数：

| 参数 | 示例 | 说明 |
|---|---|---|
| `device` | `desktop` / `mobile` | 壁纸设备类型 |
| `resolution` | `1080p` / `2k` / `4k` / `8k` | 最低分辨率档位 |
| `size` | `512x512` | 精确宽高匹配 |
| `min_size` | `512` | 宽和高均不小于该值 |
| `orientation` | `landscape` / `portrait` / `square` | 图片方向 |
| `scene` | `nature` / `anime` | 场景 |
| `tag` | `forest` | 标签 |

示例：

```text
GET /wallpaper?device=desktop&resolution=4k&scene=nature
GET /wallpaper?device=mobile&scene=anime
GET /avatar?scene=anime&min_size=512
GET /api/random?type=wallpaper&count=5
```

`resolution` 仅筛选原图尺寸，不会对图片进行缩放或裁剪。

## 自动化流程

1. PicGo 将图片上传到 GitHub。
2. GitHub Actions 扫描壁纸和头像目录。
3. Actions 生成并提交 `images-index.json`。
4. Cloudflare Worker 缓存索引并按请求条件随机选择图片。
5. 图片请求通过 302 跳转到 GitHub Raw 图片地址。

## 开发测试

图片索引脚本：

```bash
python -m pip install -r scripts/requirements.txt
python scripts/build_image_index.py
python -m unittest discover -s scripts/tests -v
```

Worker：

```bash
cd worker
npm install
npm test
```
