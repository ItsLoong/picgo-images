const PRESETS = { "1080p":[1920,1080], "2k":[2560,1440], "4k":[3840,2160], "8k":[7680,4320] };
const CORS = { "access-control-allow-origin":"*", "access-control-allow-methods":"GET,HEAD,OPTIONS" };
const MEDIA_PREFIX = "/media/";
const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|gif|webp)$/i;
const norm = v => (v || "").trim().toLowerCase();

function reply(data,status=200) {
  return new Response(JSON.stringify(data,null,2),{
    status,headers:{...CORS,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}
function parseSize(v) {
  const m = /^(\d{2,5})x(\d{2,5})$/i.exec(v || "");
  return m ? [+m[1],+m[2]] : null;
}
function cacheTtl(env) {
  const value = Number(env.CACHE_TTL_SECONDS || 3600);
  return Number.isInteger(value) && value >= 60 && value <= 86400 ? value : 3600;
}
function imageBase(env) {
  if (!env.IMAGE_BASE_URL) throw new Error("IMAGE_BASE_URL is not configured.");
  const base = new URL(env.IMAGE_BASE_URL);
  if (base.protocol !== "https:" || base.hostname !== "raw.githubusercontent.com") {
    throw new Error("IMAGE_BASE_URL must be a GitHub Raw HTTPS URL.");
  }
  return base.toString().replace(/\/+$/, "");
}
function safePath(path) {
  if (typeof path !== "string" || path.length > 1024) throw new Error("Invalid image path.");
  const segments = path.split("/");
  if (segments.some(x => !x || x === "." || x === ".." || /[\\?#%]/.test(x))) {
    throw new Error("Invalid image path.");
  }
  if (segments[0] === "wallpapers") {
    if (segments.length < 4 || !["desktop","mobile"].includes(segments[1])) throw new Error("Invalid wallpaper path.");
  } else if (segments[0] === "avatars") {
    if (segments.length < 3) throw new Error("Invalid avatar path.");
  } else {
    throw new Error("Image path must belong to wallpapers/ or avatars/.");
  }
  if (!IMAGE_EXTENSIONS.test(segments.at(-1))) throw new Error("Unsupported image format.");
  return segments.map(encodeURIComponent).join("/");
}
export function rawImageUrl(path,env) {
  return imageBase(env) + "/" + safePath(path);
}
export function imageUrls(path,env,requestUrl) {
  const encoded = safePath(path);
  const cdn = new URL(MEDIA_PREFIX + encoded,new URL(requestUrl).origin).toString();
  return {cdn,raw:rawImageUrl(path,env)};
}
export function filterImages(images,params,forcedType=null) {
  const type = forcedType || norm(params.get("type"));
  const device = norm(params.get("device"));
  const scene = norm(params.get("scene"));
  const orientation = norm(params.get("orientation"));
  const tag = norm(params.get("tag"));
  const resolution = norm(params.get("resolution"));
  const size = parseSize(params.get("size"));
  const minSize = Number(params.get("min_size") || 0);
  if (resolution && !PRESETS[resolution]) throw new Error("Unsupported resolution. Use 1080p, 2k, 4k or 8k.");
  if (params.has("size") && !size) throw new Error("size must be WIDTHxHEIGHT.");
  if (params.has("min_size") && (!Number.isInteger(minSize) || minSize < 1 || minSize > 20000)) {
    throw new Error("min_size must be an integer between 1 and 20000.");
  }
  return images.filter(x => {
    if (type && x.type !== type) return false;
    if (device && x.device !== device) return false;
    if (scene && x.scene !== scene) return false;
    if (orientation && x.orientation !== orientation) return false;
    if (tag && !(x.tags || []).includes(tag)) return false;
    if (size && (x.width !== size[0] || x.height !== size[1])) return false;
    if (minSize && (x.width < minSize || x.height < minSize)) return false;
    if (resolution) {
      const [minLong,minShort] = PRESETS[resolution];
      if (Math.max(x.width,x.height) < minLong || Math.min(x.width,x.height) < minShort) return false;
    }
    return true;
  });
}
function shuffle(items) {
  const a = [...items];
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
async function getIndex(request,env,ctx) {
  if (!env.INDEX_URL) throw new Error("INDEX_URL is not configured.");
  const cache = typeof caches === "undefined" ? null : caches.default;
  const key = new Request(new URL("/__internal/image-index",request.url));
  if (cache) {
    try { const hit=await cache.match(key); if (hit) return await hit.json(); }
    catch { /* proceed without cache */ }
  }
  const response=await fetch(env.INDEX_URL,{headers:{accept:"application/json"},cf:{cacheTtl:600,cacheEverything:true}});
  if (!response.ok) throw new Error("Cannot fetch image index: HTTP "+response.status);
  const text=await response.text();
  let index;
  try { index=JSON.parse(text); } catch { throw new Error("Image index is invalid JSON."); }
  if (!index || !Array.isArray(index.images)) throw new Error("Image index has no images array.");
  if (cache && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(cache.put(key,new Response(text,{headers:{"content-type":"application/json","cache-control":"public, max-age=600"}})).catch(()=>{}));
  }
  return index;
}
function catalog(index) {
  const items=index.images;
  const unique=(field,predicate=()=>true)=>[...new Set(items.filter(predicate).map(x=>x[field]).filter(Boolean))].sort();
  return {
    version:index.version,generated_at:index.generated_at,total:items.length,
    counts:{wallpaper:items.filter(x=>x.type==="wallpaper").length,avatar:items.filter(x=>x.type==="avatar").length},
    devices:unique("device"),scenes:{wallpaper:unique("scene",x=>x.type==="wallpaper"),avatar:unique("scene",x=>x.type==="avatar")},
    orientations:unique("orientation"),tags:[...new Set(items.flatMap(x=>x.tags||[]))].sort(),
    delivery:{default:"cdn",fallback:"raw",media_prefix:MEDIA_PREFIX}
  };
}
function sourcePreference(params) {
  const source=norm(params.get("source")) || "cdn";
  if (!["cdn","raw"].includes(source)) throw new Error("source must be cdn or raw.");
  return source;
}
async function randomResponse(request,env,ctx,type,redirect) {
  const url=new URL(request.url);
  let matches,source;
  try {
    source=sourcePreference(url.searchParams);
    const index=await getIndex(request,env,ctx);
    matches=filterImages(index.images,url.searchParams,type);
  } catch(e) {
    const invalid=/^(source must|Unsupported resolution|size must|min_size must)/.test(e.message);
    return reply({error:e.message},invalid?400:502);
  }
  if (!matches.length) return reply({error:"No images matched the requested filters.",filters:Object.fromEntries(url.searchParams)},404);
  const count=Number(url.searchParams.get("count")||1);
  if (!Number.isInteger(count)||count<1||count>20) return reply({error:"count must be between 1 and 20."},400);
  try {
    const items=shuffle(matches).slice(0,Math.min(count,matches.length)).map(x=>{
      const urls=imageUrls(x.path,env,request.url);
      return {...x,url:source==="cdn"?urls.cdn:urls.raw,raw_url:urls.raw,cdn_url:urls.cdn};
    });
    if (redirect) return new Response(null,{status:302,headers:{...CORS,location:items[0].url,"cache-control":"no-store"}});
    return reply({type:type||norm(url.searchParams.get("type"))||"all",source,count:items.length,total_matches:matches.length,filters:Object.fromEntries(url.searchParams),items});
  } catch(e) { return reply({error:e.message},500); }
}
function decodeMediaPath(pathname) {
  if (!pathname.startsWith(MEDIA_PREFIX)) throw new Error("Not a media URL.");
  const rawParts=pathname.slice(MEDIA_PREFIX.length).split("/");
  const parts=rawParts.map(x=>decodeURIComponent(x));
  if (parts.some(x=>x.includes("/") || x.includes("\\"))) throw new Error("Invalid image path.");
  const path=parts.join("/");
  safePath(path);
  return path;
}
export async function mediaResponse(request,env,ctx) {
  const requestUrl=new URL(request.url);
  let path,raw;
  try {
    path=decodeMediaPath(requestUrl.pathname);
    raw=rawImageUrl(path,env);
  } catch(e) { return reply({error:e.message},400); }
  const ttl=cacheTtl(env);
  const cache=typeof caches==="undefined" ? null : caches.default;
  const key=new Request(new URL(MEDIA_PREFIX+safePath(path),requestUrl.origin),{method:"GET"});
  if (cache) {
    try {
      const hit=await cache.match(key);
      if (hit) {
        const headers=new Headers(hit.headers);
        headers.set("x-image-cache","HIT");
        headers.set("access-control-allow-origin","*");
        return new Response(request.method==="HEAD"?null:hit.body,{status:hit.status,headers});
      }
    } catch { /* fetch origin if edge cache is unavailable */ }
  }
  try {
    const upstream=await fetch(raw,{method:request.method==="HEAD"?"HEAD":"GET",redirect:"follow",cf:{cacheEverything:true,cacheTtl:ttl}});
    if (!upstream.ok) {
      if (upstream.status===404) return reply({error:"Image not found."},404);
      return new Response(null,{status:302,headers:{...CORS,location:raw,"cache-control":"no-store","x-image-fallback":"github-raw"}});
    }
    const mime=upstream.headers.get("content-type")||"";
    if (!/^image\/(?:webp|jpeg|png|gif)(?:;|$)/i.test(mime)) return reply({error:"Unexpected image content type."},502);
    const headers=new Headers({
      ...CORS,"content-type":mime,"cache-control":"public, max-age="+ttl,
      "x-image-cache":"MISS","x-image-origin":"github-raw",
      "x-content-type-options":"nosniff"
    });
    for (const name of ["content-length","etag","last-modified"]) {
      const value=upstream.headers.get(name);
      if (value) headers.set(name,value);
    }
    const response=new Response(request.method==="HEAD"?null:upstream.body,{status:200,headers});
    if (request.method==="GET" && cache && ctx && typeof ctx.waitUntil==="function") {
      ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
    }
    return response;
  } catch {
    // Last-resort client-side fallback: the browser may still reach GitHub Raw.
    return new Response(null,{status:302,headers:{...CORS,location:raw,"cache-control":"no-store","x-image-fallback":"github-raw"}});
  }
}
export default {async fetch(request,env,ctx) {
  const url=new URL(request.url);
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (!["GET","HEAD"].includes(request.method)) return reply({error:"Method not allowed."},405);
  if (url.pathname.startsWith(MEDIA_PREFIX)) return mediaResponse(request,env,ctx);
  if (url.pathname==="/health") return reply({status:"ok",service:"itsloong-random-image",delivery:"cloudflare-edge-cache",fallback:"github-raw"});
  if (url.pathname==="/api/catalog") {
    try { return reply(catalog(await getIndex(request,env,ctx))); }
    catch(e) { return reply({error:e.message},502); }
  }
  if (url.pathname==="/wallpaper") return randomResponse(request,env,ctx,"wallpaper",true);
  if (url.pathname==="/avatar") return randomResponse(request,env,ctx,"avatar",true);
  if (url.pathname==="/api/wallpaper") return randomResponse(request,env,ctx,"wallpaper",false);
  if (url.pathname==="/api/avatar") return randomResponse(request,env,ctx,"avatar",false);
  if (url.pathname==="/api/random") {
    const type=norm(url.searchParams.get("type"));
    if (type && !["wallpaper","avatar"].includes(type)) return reply({error:"type must be wallpaper or avatar."},400);
    return randomResponse(request,env,ctx,type||null,false);
  }
  return reply({error:"Not found."},404);
}};
