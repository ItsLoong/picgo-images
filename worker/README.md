# Cloudflare Random Image Worker

Serves random wallpapers and avatars from the public GitHub image repository. Image delivery uses a Worker media endpoint with Cloudflare edge caching and GitHub Raw as the fixed origin/fallback. No GitHub token, database, R2 bucket, or Git LFS is required.

## Delivery design

- `/wallpaper` and `/avatar` select an image and redirect to the Worker's `/media/...` endpoint.
- `/media/...` fetches the corresponding file from the configured GitHub Raw origin and returns the image bytes.
- Successful media responses include a public `Cache-Control` TTL and cache diagnostics (`x-image-cache`).
- If the upstream fetch fails, the Worker returns a redirect to the fixed GitHub Raw URL as a last-resort fallback.
- Only files below `wallpapers/` and `avatars/` with JPG, PNG, GIF, or WebP extensions are accepted. This is not an open proxy.
- Cache API entries are data-center-local. Worker response caching may be used where available; a custom domain is recommended for the Cache API.

## Configuration

`wrangler.jsonc` contains:

- `INDEX_URL`: public GitHub Raw URL for `images-index.json`.
- `IMAGE_BASE_URL`: fixed GitHub Raw root for the image repository.
- `CACHE_TTL_SECONDS`: optional media cache TTL, 60–86400 seconds (default 3600).

## Deploy

```bash
npm install
npm test
npm run dev
npm run deploy
```

## Routes

- `GET /health`
- `GET /api/catalog`
- `GET /wallpaper?device=desktop&resolution=4k&scene=nature` — 302 to Worker media URL
- `GET /avatar?scene=anime&min_size=512` — 302 to Worker media URL
- `GET /api/wallpaper?... and /api/avatar/...` — JSON with `url`, `cdn_url`, and `raw_url`
- `GET /api/random?type=wallpaper&count=5`
- `GET /media/wallpapers/desktop/anime/example.webp` — cached image response

Add `source=raw` to random/API routes to get the direct GitHub Raw URL instead of the Worker media URL.

Filters: `device=desktop|mobile`, `resolution=1080p|2k|4k|8k` (minimum long/short side), `orientation=landscape|portrait|square`, `scene`, `tag`, `size=512x512` (exact), `min_size=512` (both dimensions), `count=1..20`.
