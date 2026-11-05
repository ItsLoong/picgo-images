(() => {
      'use strict';
      const PAGE_SIZE = 24;
      const state = {images:[],filtered:[],visible:0,type:'all',scene:'all',device:'all',orientation:'all',sort:'recent',term:'',selected:0};
      const $ = (id) => document.getElementById(id);
      const gallery = $('gallery');
      const preview = $('preview');
      const previewImage = $('previewImage');
      let toastTimer = null;

      function validPath(path) {
        if (typeof path !== 'string' || path.length > 800) return false;
        const segments = path.split('/');
        if (segments.length < 3 || !['wallpapers','avatars'].includes(segments[0])) return false;
        if (segments.some((s) => !s || s === '.' || s === '..' || /[\\\u0000-\u001f?#]/.test(s))) return false;
        return /\.(png|jpe?g|webp|gif|avif)$/i.test(segments[segments.length-1]);
      }
      function encodedPath(path) { return path.split('/').map((segment) => encodeURIComponent(segment)).join('/'); }
      function urlOf(item) { return '/' + encodedPath(item.path); }
      function fallbackUrl(item) { return 'https://raw.githubusercontent.com/ItsLoong/picgo-images/main/' + encodedPath(item.path); }
      function displayBytes(n) {
        n = Number(n) || 0;
        if (n >= 1024*1024*1024) return (n/(1024*1024*1024)).toFixed(1) + ' GB';
        if (n >= 1024*1024) return (n/(1024*1024)).toFixed(1) + ' MB';
        return (n/1024).toFixed(1) + ' KB';
      }
      function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      }
      function displayType(item) { return item.type === 'avatar' ? '头像' : '壁纸'; }
      function addImageFallback(img, item) {
        img.addEventListener('error', () => {
          if (img.dataset.fallback !== '1') {
            img.dataset.fallback = '1';
            img.src = fallbackUrl(item);
          }
        });
      }
      function toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('visible'), 2200);
      }
      function populateScenes() {
        const scenes = Array.from(new Set(state.images.map((x) => x.scene).filter(Boolean))).sort((a,b) => String(a).localeCompare(String(b),'zh-CN'));
        const sel = $('scene');
        scenes.forEach((scene) => {
          const option = document.createElement('option');
          option.value = scene;
          option.textContent = scene;
          sel.append(option);
        });
      }
      function refreshResults() {
        const term = state.term.toLocaleLowerCase();
        state.filtered = state.images.filter((item) => {
          if (state.type !== 'all' && item.type !== state.type) return false;
          if (state.scene !== 'all' && item.scene !== state.scene) return false;
          if (state.device !== 'all' && item.device !== state.device) return false;
          if (state.orientation !== 'all' && item.orientation !== state.orientation) return false;
          if (!term) return true;
          return [item.title,item.path,item.scene,item.device,item.type,...(Array.isArray(item.tags)?item.tags:[])].join(' ').toLocaleLowerCase().includes(term);
        });
        if (state.sort === 'recent') {
          state.filtered.sort((a,b) => b.path.localeCompare(a.path,'en',{numeric:true}));
        }
        if (state.sort === 'name') state.filtered.sort((a,b) => String(a.title || a.path).localeCompare(String(b.title || b.path),'zh-CN', {numeric:true}));
        if (state.sort === 'pixels') state.filtered.sort((a,b) => (Number(b.width)*Number(b.height)) - (Number(a.width)*Number(a.height)));
        if (state.sort === 'bytes') state.filtered.sort((a,b) => (Number(b.bytes)||0)-(Number(a.bytes)||0));
        if (state.sort === 'random') {
          state.filtered = state.filtered.map((v) => ({v,rand:Math.random()})).sort((a,b) => a.rand-b.rand).map((x) => x.v);
        }
        state.visible = 0;
        gallery.replaceChildren();
        $('resultCount').textContent = '匹配 ' + state.filtered.length + ' / ' + state.images.length + ' 张';
        if (!state.filtered.length) {
          gallery.innerHTML = '<div class="empty"><strong>没有找到匹配的图片</strong>试试修改关键词或筛选条件。</div>';
          $('loadmore').hidden = true;
          return;
        }
        renderNext();
      }
      function renderNext() {
        const start = state.visible;
        const end = Math.min(start + PAGE_SIZE,state.filtered.length);
        const fragment = document.createDocumentFragment();
        for (let idx=start;idx<end;idx++) {
          const item = state.filtered[idx];
          const tile = document.createElement('button');
          tile.type = 'button';
          tile.className = 'tile';
          tile.dataset.index = String(idx);
          const title = item.title || item.path.split('/').pop();
          tile.setAttribute('aria-label','预览 ' + title);
          const thumb = item.thumbnail ? '/' + encodedPath(item.thumbnail) : urlOf(item);
          tile.innerHTML = '<div class="thumb"><img loading="lazy" decoding="async" alt="" src="' + escapeHtml(thumb) + '"></div>' +
            '<div class="tilebody"><span class="tilename">' + escapeHtml(title) + '</span><span class="tilemeta">' +
            escapeHtml(item.width + ' × ' + item.height) + '</span></div>';
          addImageFallback(tile.querySelector('img'),item);
          fragment.append(tile);
        }
        gallery.append(fragment);
        state.visible=end;
        $('loadmore').hidden = end >= state.filtered.length;
        $('loadmore').textContent = '加载更多图片 · ' + end + ' / ' + state.filtered.length;
      }
      function showItem(index) {
        if (!state.filtered.length) return;
        state.selected = (index + state.filtered.length) % state.filtered.length;
        const item = state.filtered[state.selected];
        const title = item.title || item.path.split('/').pop();
        $('previewName').textContent = title;
        $('previewPath').textContent = item.path;
        $('previewDimensions').textContent = (item.width||'—') + ' × ' + (item.height||'—') + ' px';
        $('previewFormat').textContent = String(item.format||'').toUpperCase() + ' · ' + displayBytes(item.bytes);
        $('previewCategory').textContent = displayType(item) + (item.device ? ' · ' + item.device : '') + (item.scene ? ' · ' + item.scene : '');
        $('previewPosition').textContent = (state.selected+1) + ' / ' + state.filtered.length + ' · ← → 切换图片';
        const tags = $('previewTags');
        tags.replaceChildren();
        const listedTags = (Array.isArray(item.tags)&&item.tags.length ? item.tags : [item.scene || '未分类']);
        listedTags.forEach((tag) => {
          const el = document.createElement('span'); el.className='tag'; el.textContent=tag; tags.append(el);
        });
        const path = urlOf(item);
        previewImage.dataset.fallback = '0';
        previewImage.alt = title;
        previewImage.src = path;
        $('openOriginal').href = path;
        if (!preview.open) preview.showModal();
      }
      previewImage.addEventListener('error', () => {
        if (previewImage.dataset.fallback !== '1') {
          previewImage.dataset.fallback = '1';
          const item = state.filtered[state.selected];
          if (item) previewImage.src = fallbackUrl(item);
        }
      });
      gallery.addEventListener('click',(event) => {
        const tile = event.target.closest('button.tile');
        if (tile) showItem(Number(tile.dataset.index));
      });
      $('loadmore').addEventListener('click',renderNext);
      $('closePreview').addEventListener('click',() => preview.close());
      $('prev').addEventListener('click',() => showItem(state.selected - 1));
      $('next').addEventListener('click',() => showItem(state.selected + 1));
      preview.addEventListener('click',(event) => { if (event.target===preview) preview.close(); });
      document.addEventListener('keydown',(event) => {
        if (!preview.open) return;
        if (event.key==='ArrowLeft') {event.preventDefault();showItem(state.selected - 1);}
        if (event.key==='ArrowRight') {event.preventDefault();showItem(state.selected + 1);}
      });
      $('copyLink').addEventListener('click',async () => {
        const item=state.filtered[state.selected];
        if (!item) return;
        const href=new URL(urlOf(item),location.origin).href;
        try {
          await navigator.clipboard.writeText(href);
          toast('图片链接已复制');
        } catch { toast('复制失败，请使用“新窗口查看原图”'); }
      });
      document.querySelectorAll('[data-type]').forEach((button) => {
        button.addEventListener('click',() => {
          state.type=button.dataset.type;
          document.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed',String(b===button)));
          refreshResults();
        });
      });
      $('search').addEventListener('input',(e) => {state.term=e.target.value.trim();refreshResults();});
      ['scene','device','orientation','sort'].forEach((id) => {
        $(id).addEventListener('change',(e) => {state[id]=e.target.value;refreshResults();});
      });
      const covers = [
        {file:'vol-459-10', title:'云海之间', detail:'深蓝天幕下的水上旅途'},
        {file:'vol-461-10', title:'向日葵之夏', detail:'向日葵与晴空中的夏日肖像'},
        {file:'vol-462-10', title:'春日庭院', detail:'繁花环绕的庭院插画'}
      ];
      function initializeCover() {
        const available = covers.map(cover => ({
          ...cover, item:state.images.find(item => item.path.endsWith('/'+cover.file+'.webp'))
        })).filter(cover => cover.item);
        if (!available.length) { $('feature').hidden = true; return; }
        const controls = $('coverControls');
        function selectCover(idx) {
          const cover = available[idx];
          $('coverArt').src = urlOf(cover.item);
          $('coverArt').alt = cover.detail;
          $('coverTitle').textContent = cover.title;
          $('coverNumber').textContent = cover.file.replace('vol-','VOL. ').replace('-', ' / ');
          $('coverLink').href = urlOf(cover.item);
          for (const [position, button] of [...controls.children].entries()) {
            button.setAttribute('aria-pressed', String(position === idx));
          }
        }
        available.forEach((cover, idx) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('aria-label', '选映：'+cover.title);
          const image = document.createElement('img');
          image.alt = '';
          image.src = cover.item.thumbnail ? '/'+encodedPath(cover.item.thumbnail) : urlOf(cover.item);
          button.append(image);
          button.onclick = () => selectCover(idx);
          controls.append(button);
        });
        selectCover(0);
      }
      async function initialize() {
        try {
          const response = await fetch('./images-index.json',{cache:'no-cache'});
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const index = await response.json();
          if (!Array.isArray(index.images)) throw new Error('图片索引格式错误');
          state.images=index.images.filter((item) => item && validPath(item.path));
          $('totalCount').textContent = String(state.images.length);
          initializeCover();
          populateScenes();
          refreshResults();
        } catch(err) {
          console.error('Image archive failed to load',err);
          $('resultCount').textContent='图片索引暂不可用';
          gallery.innerHTML='<div class="empty"><strong>读取图片索引失败</strong>请稍后刷新页面重试。<p style="margin-top:14px"><a href="./images-index.json">检查索引文件</a></p></div>';
        }
      }
      initialize();
    })();
