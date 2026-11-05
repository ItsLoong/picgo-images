"""根据图库索引生成可直接发布到 Pages 的静态站点"""
import json
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageOps

from build_image_index import ROOT, build_index


def main():
    index = build_index()
    if index["warnings"]:
        raise ValueError("\n".join(index["warnings"]))
    with TemporaryDirectory(dir=ROOT) as temp:
        output = Path(temp) / "site"
        output.mkdir()
        shutil.copy2(ROOT / "index.html", output)
        shutil.copytree(ROOT / "gallery", output / "gallery")
        for item in index["images"]:
            path = Path(item["path"])
            source = ROOT / path
            original = output / path
            original.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, original)
            thumb = Path("thumbs") / (str(path) + ".webp")
            (output / thumb).parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as image:
                preview = ImageOps.exif_transpose(image)
                preview.thumbnail((640, 640), Image.Resampling.LANCZOS)
                preview.save(output / thumb, "WEBP", quality=79)
            item["thumbnail"] = thumb.as_posix()
        (output / "images-index.json").write_text(
            json.dumps(index, ensure_ascii=False), encoding="utf-8"
        )
        target = ROOT / "dist"
        if target.exists():
            shutil.rmtree(target)
        output.rename(target)
    print(f"Built gallery with {index['total']} images")


if __name__ == "__main__":
    main()
