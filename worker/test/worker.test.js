import test from "node:test";
import assert from "node:assert/strict";
import { filterImages, imageUrls, rawImageUrl } from "../src/index.js";

const env = { IMAGE_BASE_URL: "https://raw.githubusercontent.com/ItsLoong/picgo-images/main" };
const images = [
  {path:"wallpapers/desktop/nature/4k.webp",type:"wallpaper",device:"desktop",scene:"nature",orientation:"landscape",width:3840,height:2160,tags:["forest"]},
  {path:"wallpapers/mobile/anime/mobile.webp",type:"wallpaper",device:"mobile",scene:"anime",orientation:"portrait",width:1440,height:2560,tags:["anime"]},
  {path:"avatars/anime/avatar.png",type:"avatar",scene:"anime",orientation:"square",width:1024,height:1024,tags:["blue"]}
];

test("filters desktop 4K nature wallpaper",()=>assert.equal(filterImages(images,new URLSearchParams("device=desktop&resolution=4k&scene=nature"),"wallpaper").length,1));
test("filters mobile portrait wallpaper",()=>assert.equal(filterImages(images,new URLSearchParams("device=mobile&orientation=portrait"),"wallpaper").length,1));
test("filters avatar by minimum size",()=>assert.equal(filterImages(images,new URLSearchParams("scene=anime&min_size=512"),"avatar").length,1));
test("filters exact size and tag",()=>assert.equal(filterImages(images,new URLSearchParams("size=1024x1024&tag=blue"),"avatar").length,1));
test("rejects unknown resolution",()=>assert.throws(()=>filterImages(images,new URLSearchParams("resolution=16k"),"wallpaper"),/Unsupported resolution/));
test("builds Cloudflare media URL and GitHub Raw fallback",()=>{
  const urls=imageUrls("wallpapers/desktop/anime/forest.webp",env,"https://api.example.workers.dev/wallpaper");
  assert.equal(urls.cdn,"https://api.example.workers.dev/media/wallpapers/desktop/anime/forest.webp");
  assert.equal(urls.raw,"https://raw.githubusercontent.com/ItsLoong/picgo-images/main/wallpapers/desktop/anime/forest.webp");
});
test("builds raw URL for an avatar",()=>{
  assert.equal(rawImageUrl("avatars/anime/avatar.png",env),"https://raw.githubusercontent.com/ItsLoong/picgo-images/main/avatars/anime/avatar.png");
});
test("rejects path traversal and files outside managed image folders",()=>{
  assert.throws(()=>rawImageUrl("wallpapers/desktop/../../README.md",env),/Invalid image path/);
  assert.throws(()=>rawImageUrl("img/legacy.png",env),/must belong/);
  assert.throws(()=>rawImageUrl("avatars/anime/avatar.svg",env),/Unsupported image format/);
});
