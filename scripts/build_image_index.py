#!/usr/bin/env python3
"""Build the random wallpaper/avatar index. Legacy img/ files are intentionally excluded."""
from __future__ import annotations
import argparse, json, mimetypes, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

def load_metadata() -> dict[str, dict[str, Any]]:
    path = ROOT / "_image_meta.json"
    if not path.exists(): return {}
    data = json.loads(path.read_text(encoding="utf-8")).get("images", {})
    if not isinstance(data, dict): raise ValueError("'images' must be an object")
    return data

def classify(relative: Path):
    p = relative.parts
    if p[0] == "wallpapers" and len(p) >= 4:
        device = p[1].lower()
        if device not in {"desktop", "mobile"}: raise ValueError(f"invalid device: {device}")
        return "wallpaper", device, p[2].lower()
    if p[0] == "avatars" and len(p) >= 3: return "avatar", None, p[1].lower()
    raise ValueError(f"unsupported path: {relative}")

def build_index(owner="ItsLoong", repo="picgo-images", branch="main"):
    metadata, images, warnings = load_metadata(), [], []
    for category in ("wallpapers", "avatars"):
        base = ROOT / category
        if not base.exists(): continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED or path.name.startswith("."): continue
            rel = path.relative_to(ROOT).as_posix()
            try:
                kind, device, scene = classify(Path(rel))
                with Image.open(path) as im:
                    fmt = (im.format or path.suffix[1:]).lower()
                    frames = getattr(im, "n_frames", 1)
                    width, height = ImageOps.exif_transpose(im).size
                if width < 1 or height < 1: raise ValueError("invalid dimensions")
                ratio = width / height
                orientation = "square" if 0.95 <= ratio <= 1.05 else ("landscape" if width > height else "portrait")
                meta = metadata.get(rel, {})
                tags = meta.get("tags", [])
                if not isinstance(tags, list) or not all(isinstance(x, str) for x in tags):
                    raise ValueError("tags must be a list of strings")
                item = {
                    "path": rel, "type": kind, "scene": str(meta.get("scene", scene)).lower(),
                    "orientation": orientation, "width": width, "height": height,
                    "aspect_ratio": round(ratio, 5), "format": fmt,
                    "mime_type": mimetypes.guess_type(path.name)[0] or f"image/{fmt}",
                    "bytes": path.stat().st_size, "animated": frames > 1, "frames": frames,
                    "tags": sorted({x.strip().lower() for x in tags if x.strip()}),
                    "title": str(meta.get("title", path.stem)), "featured": bool(meta.get("featured", False))
                }
                if device: item["device"] = device
                if meta.get("description"): item["description"] = str(meta["description"])
                images.append(item)
            except (OSError, ValueError, UnidentifiedImageError) as exc:
                warnings.append(f"{rel}: {exc}")
    images.sort(key=lambda x: x["path"])
    return {
        "version": 1, "repository": f"{owner}/{repo}", "branch": branch,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "total": len(images),
        "counts": {"wallpaper": sum(x["type"] == "wallpaper" for x in images),
                   "avatar": sum(x["type"] == "avatar" for x in images)},
        "images": images, "warnings": warnings
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", default="ItsLoong"); ap.add_argument("--repo", default="picgo-images")
    ap.add_argument("--branch", default="main"); ap.add_argument("--output", default=str(ROOT / "images-index.json"))
    args = ap.parse_args()
    result = build_index(args.owner, args.repo, args.branch)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"indexed {result['total']} assets; counts={result['counts']}; warnings={len(result['warnings'])}")
    return 0
if __name__ == "__main__": raise SystemExit(main())
