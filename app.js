<!-- --- file: app.js --- -->
<script>
// ユーティリティ
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'), 1800); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// ルーター（#/ , #/add , #/c/:id）
window.addEventListener('hashchange', renderRoute);
window.addEventListener('load', () => { renderRoute(); bindUI(); renderList(); });

function route() {
  const h = location.hash || '#/';
  if (h.startsWith('#/c/')) return { name:'detail', id: h.split('/')[2] };
  if (h.startsWith('#/add')) return { name:'add' };
  return { name:'list' };
}

function show(name) {
  $$('.page').forEach(p => p.classList.add('hidden'));
  $(`[data-route="${name}"]`).classList.remove('hidden');
}

async function renderRoute() {
  const r = route();
  if (r.name === 'list') { show('list'); await renderList(); }
  if (r.name === 'add') { show('add'); }
  if (r.name === 'detail') { show('detail'); await renderDetail(r.id); }
}

// 一覧のフィルタ & レンダリング
['#f-keyword','#f-area','#f-tag','#f-fav'].forEach(id => {
  document.addEventListener('input', (e)=>{ if (e.target.matches(id)) renderList(); });
  document.addEventListener('change', (e)=>{ if (e.target.matches(id)) renderList(); });
});

async function renderList() {
  const listEl = $('#list');
  const items = await dbAll();
  // フィルタ
  const kw = $('#f-keyword').value.trim().toLowerCase();
  const area = $('#f-area').value;
  const tag = $('#f-tag').value.trim();
  const fav = $('#f-fav').checked;

  const filtered = items.filter(c => {
    if (area && c.area !== area) return false;
    if (fav && !c.favorite) return false;
    if (tag && !(c.tags||[]).some(t => t.includes(tag))) return false;
    if (kw) {
      const text = [c.name, c.address, (c.tags||[]).join(',')].join(' ').toLowerCase();
      if (!text.includes(kw)) return false;
    }
    return true;
  }).sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));

  // areaグループ
  const groups = filtered.reduce((acc, c) => { const k = c.area || '未設定'; (acc[k] ||= []).push(c); return acc; }, {});
  const areas = Object.keys(groups).sort();

  listEl.innerHTML = '';
  areas.forEach(a => {
    const sec = document.createElement('section');
    sec.innerHTML = `<div class="section-title">${a}（${groups[a].length}）</div>`;
    groups[a].forEach(c => sec.appendChild(renderItem(c)));
    listEl.appendChild(sec);
  });
}

function renderItem(c) {
  const el = document.createElement('div');
  el.className = 'item';
  el.innerHTML = `
    <div>
      <h3>${c.name} ${c.favorite ? '★' : ''}</h3>
      <div class="sub">${c.address || ''}</div>
      <div class="sub">${(c.tags||[]).length? 'タグ: '+c.tags.join(', '): ''}</div>
      ${c.map_url ? `<a href="${c.map_url}" target="_blank">Google Map</a>`: ''}
    </div>
    <div>
      <button class="btn" onclick="location.hash='#/c/${c.id}'">詳細</button>
    </div>`;
  return el;
}

// 追加
function bindUI() {
  $('#btn-save').addEventListener('click', onSave);
  $('#btn-export').addEventListener('click', onExport);
  $('#btn-wipe').addEventListener('click', async ()=>{ if(confirm('端末内の全データを削除しますか？')) { await dbClear(); toast('削除しました'); renderList(); }});
  $('#file-import').addEventListener('change', onImport);
}

async function onSave() {
  const name = $('#add-name').value.trim();
  if (!name) return toast('店名は必須です');
  const cafe = {
    id: uuid(),
    name,
    area: $('#add-area').value || null,
    map_url: $('#add-map').value || null,
    address: $('#add-address').value || null,
    tags: ($('#add-tags').value || '').split(',').map(s=>s.trim()).filter(Boolean),
    rating: Number($('#add-rating').value || 0) || null,
    price_range: $('#add-price').value || null,
    memo: $('#add-memo').value || null,
    favorite: $('#add-fav').checked,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await dbAdd(cafe);
  toast('保存しました');
  location.hash = '#/';
}

// 詳細ページ
async function renderDetail(id) {
  const c = await dbGet(id);
  const box = $('#detail-card');
  if (!c) { box.innerHTML = '<p>見つかりませんでした</p>'; return; }
  box.innerHTML = `
    <div class="row center-y" style="justify-content: space-between;">
      <div>
        <h2 style="margin:0;">${c.name}</h2>
        <div class="sub">${c.address || ''}</div>
        ${c.map_url ? `<a href="${c.map_url}" target="_blank">Google Map</a>`: ''}
      </div>
      <div class="row gap">
        <button class="btn" id="btn-fav">${c.favorite? '★ お気に入り':'☆ お気に入り'}</button>
        <button class="btn" id="btn-del">削除</button>
      </div>
    </div>
    <div class="grid form" style="margin-top:12px;">
      <label class="col-span-2">メモ<textarea id="d-memo" class="input" rows="8">${c.memo||''}</textarea></label>
      <label>タグ（カンマ区切り）<input id="d-tags" class="input" value="${(c.tags||[]).join(', ')}" /></label>
      <label>評価（0〜5）<input id="d-rating" type="number" min="0" max="5" class="input" value="${c.rating||''}" /></label>
      <div class="row gap">
        <button class="btn primary" id="btn-save-detail">保存</button>
        <button class="btn" onclick="history.back()">戻る</button>
      </div>
    </div>`;

  $('#btn-fav').onclick = async ()=>{ c.favorite = !c.favorite; c.updated_at = new Date().toISOString(); await dbPut(c); toast('更新しました'); renderDetail(id); };
  $('#btn-del').onclick = async ()=>{ if(confirm('削除しますか？')) { await dbDelete(c.id); toast('削除しました'); location.hash = '#/'; } };
  $('#btn-save-detail').onclick = async ()=>{
    c.memo = $('#d-memo').value; c.tags = $('#d-tags').value.split(',').map(s=>s.trim()).filter(Boolean); c.rating = Number($('#d-rating').value||0) || null; c.updated_at = new Date().toISOString();
    await dbPut(c); toast('保存しました'); renderDetail(id);
  };
}

// エクスポート/インポート
async function onExport() {
  const data = await dbAll();
  const blob = new Blob([JSON.stringify({ cafes: data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'cafememo_export.json'; a.click(); URL.revokeObjectURL(url);
}
async function onImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text();
  try {
    const json = JSON.parse(text);
    if (!json.cafes || !Array.isArray(json.cafes)) throw new Error('形式が不正');
    for (const c of json.cafes) { if (!c.id) c.id = uuid(); await dbPut(c); }
    toast('インポート完了'); renderList();
  } catch(err) { alert('読み込みに失敗しました: ' + err.message); }
  e.target.value = '';
}
</script>
