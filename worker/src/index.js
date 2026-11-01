const PRESETS = { "1080p":[1920,1080], "2k":[2560,1440], "4k":[3840,2160], "8k":[7680,4320] };
const CORS = { "access-control-allow-origin":"*", "access-control-allow-methods":"GET,HEAD,OPTIONS" };
function reply(data,status=200){ return new Response(JSON.stringify(data,null,2),{status,headers:{...CORS,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}); }
const norm = v => (v||"").trim().toLowerCase();
function parseSize(v){ const m=/^(\d{2,5})x(\d{2,5})$/i.exec(v||""); return m?[+m[1],+m[2]]:null; }
export function filterImages(images,params,forcedType=null){
  const type=forcedType||norm(params.get("type")), device=norm(params.get("device")), scene=norm(params.get("scene")), orientation=norm(params.get("orientation")), tag=norm(params.get("tag")), resolution=norm(params.get("resolution")), size=parseSize(params.get("size")), minSize=Number(params.get("min_size")||0);
  if(resolution&&!PRESETS[resolution]) throw new Error("Unsupported resolution. Use 1080p, 2k, 4k or 8k.");
  if(params.has("size")&&!size) throw new Error("size must be WIDTHxHEIGHT, for example 512x512.");
  if(params.has("min_size")&&(!Number.isInteger(minSize)||minSize<1||minSize>20000)) throw new Error("min_size must be an integer between 1 and 20000.");
  return images.filter(x=>{
    if(type&&x.type!==type) return false;
    if(device&&x.device!==device) return false;
    if(scene&&x.scene!==scene) return false;
    if(orientation&&x.orientation!==orientation) return false;
    if(tag&&!(x.tags||[]).includes(tag)) return false;
    if(size&&(x.width!==size[0]||x.height!==size[1])) return false;
    if(minSize&&(x.width<minSize||x.height<minSize)) return false;
    if(resolution){ const [longMin,shortMin]=PRESETS[resolution]; if(Math.max(x.width,x.height)<longMin||Math.min(x.width,x.height)<shortMin) return false; }
    return true;
  });
}
function shuffle(items){ const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
async function getIndex(request,env,ctx){
  if(!env.INDEX_URL) throw new Error("INDEX_URL is not configured.");
  const cache=globalThis.caches?.default, key=new Request(new URL("/__internal/image-index",request.url));
  if(cache){const hit=await cache.match(key);if(hit)return hit.json();}
  const response=await fetch(env.INDEX_URL,{headers:{accept:"application/json"},cf:{cacheTtl:600,cacheEverything:true}});
  if(!response.ok) throw new Error("Cannot fetch image index: HTTP "+response.status);
  const text=await response.text(); let index;
  try{index=JSON.parse(text);}catch{throw new Error("Image index is invalid JSON.");}
  if(!index||!Array.isArray(index.images)) throw new Error("Image index has no images array.");
  if(cache) ctx.waitUntil(cache.put(key,new Response(text,{headers:{"content-type":"application/json","cache-control":"public, max-age=600"}})));
  return index;
}
function catalog(index){
  const items=index.images, unique=(field,predicate=()=>true)=>[...new Set(items.filter(predicate).map(x=>x[field]).filter(Boolean))].sort();
  return {version:index.version,generated_at:index.generated_at,total:items.length,counts:{wallpaper:items.filter(x=>x.type==="wallpaper").length,avatar:items.filter(x=>x.type==="avatar").length},devices:unique("device"),scenes:{wallpaper:unique("scene",x=>x.type==="wallpaper"),avatar:unique("scene",x=>x.type==="avatar")},orientations:unique("orientation"),tags:[...new Set(items.flatMap(x=>x.tags||[]))].sort()};
}
function buildUrl(item,env){if(!env.IMAGE_BASE_URL)throw new Error("IMAGE_BASE_URL is not configured.");return env.IMAGE_BASE_URL.replace(/\/+$/,"")+"/"+item.path.split("/").map(encodeURIComponent).join("/");}
async function randomResponse(request,env,ctx,type,redirect){
  let index; try{index=await getIndex(request,env,ctx);}catch(e){return reply({error:e.message},502);}
  const url=new URL(request.url); let matches;
  try{matches=filterImages(index.images,url.searchParams,type);}catch(e){return reply({error:e.message},400);}
  if(!matches.length)return reply({error:"No images matched the requested filters.",filters:Object.fromEntries(url.searchParams)},404);
  const count=Number(url.searchParams.get("count")||1); if(!Number.isInteger(count)||count<1||count>20)return reply({error:"count must be between 1 and 20."},400);
  try{
    const items=shuffle(matches).slice(0,Math.min(count,matches.length)).map(x=>({...x,url:buildUrl(x,env)}));
    if(redirect)return new Response(null,{status:302,headers:{...CORS,location:items[0].url,"cache-control":"no-store"}});
    return reply({type:type||norm(url.searchParams.get("type"))||"all",count:items.length,total_matches:matches.length,filters:Object.fromEntries(url.searchParams),items});
  }catch(e){return reply({error:e.message},500);}
}
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(!["GET","HEAD"].includes(request.method))return reply({error:"Method not allowed."},405);
  if(url.pathname==="/health")return reply({status:"ok",service:"itsloong-random-image"});
  if(url.pathname==="/api/catalog"){try{return reply(catalog(await getIndex(request,env,ctx)));}catch(e){return reply({error:e.message},502);}}
  if(url.pathname==="/wallpaper")return randomResponse(request,env,ctx,"wallpaper",true);
  if(url.pathname==="/avatar")return randomResponse(request,env,ctx,"avatar",true);
  if(url.pathname==="/api/wallpaper")return randomResponse(request,env,ctx,"wallpaper",false);
  if(url.pathname==="/api/avatar")return randomResponse(request,env,ctx,"avatar",false);
  if(url.pathname==="/api/random"){const type=norm(url.searchParams.get("type"));if(type&&!["wallpaper","avatar"].includes(type))return reply({error:"type must be wallpaper or avatar."},400);return randomResponse(request,env,ctx,type||null,false);}
  return reply({error:"Not found."},404);
}};
