import json, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_image_index as builder

class IndexTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name)
  for d in ("wallpapers/desktop/nature","wallpapers/mobile/anime","avatars/anime","img"): (self.root/d).mkdir(parents=True)
  Image.new("RGB",(3840,2160),"green").save(self.root/"wallpapers/desktop/nature/forest.webp","WEBP")
  Image.new("RGB",(1080,1920),"blue").save(self.root/"wallpapers/mobile/anime/mobile.jpg","JPEG")
  Image.new("RGB",(512,512),"red").save(self.root/"avatars/anime/avatar.png","PNG")
  Image.new("RGB",(100,100),"black").save(self.root/"img/legacy.png","PNG")
  (self.root/"_image_meta.json").write_text('{"images": {}}',encoding="utf-8")
 def tearDown(self): self.tmp.cleanup()
 def test_only_new_asset_folders_are_indexed(self):
  with patch.object(builder,"ROOT",self.root): result=builder.build_index()
  self.assertEqual(result["total"],3); self.assertEqual(result["counts"],{"wallpaper":2,"avatar":1})
  self.assertNotIn("img/legacy.png",[x["path"] for x in result["images"]])
 def test_dimensions_and_orientation(self):
  with patch.object(builder,"ROOT",self.root): result=builder.build_index()
  items={x["path"]:x for x in result["images"]}
  self.assertEqual((items["wallpapers/desktop/nature/forest.webp"]["width"],items["wallpapers/desktop/nature/forest.webp"]["height"]),(3840,2160))
  self.assertEqual(items["wallpapers/mobile/anime/mobile.jpg"]["orientation"],"portrait")
 def test_custom_metadata(self):
  (self.root/"_image_meta.json").write_text(json.dumps({"images":{"avatars/anime/avatar.png":{"title":"Test","tags":["Blue"]}}}),encoding="utf-8")
  with patch.object(builder,"ROOT",self.root): result=builder.build_index()
  avatar=next(x for x in result["images"] if x["type"]=="avatar")
  self.assertEqual(avatar["title"],"Test"); self.assertEqual(avatar["tags"],["blue"])
if __name__=="__main__": unittest.main()
