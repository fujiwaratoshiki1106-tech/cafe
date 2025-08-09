import { addCafe, updateCafe, deleteCafe, getCafe, listCafes, exportJSON, importJSON, normalizeTags } from './db.js';

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];

let deferredPrompt = null;

// PWA install prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('btn-install');
  if (btn) btn.hidden = false;
});
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (t?.id === 'btn-install' && deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    t.hidden = true;
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  });
}

// Simple hash router
window.addEventListener('hashchange', render);
window.addEventListener('load', render);
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-link]');
  if (t) {
    location.hash = t.getAttribute('data-link');
  }
});

// Export / Import
document.addEventListener('DOMContentLoaded', () => {
  $('#btn-export')?.addEventListener('click', async () => {
    const text = await exportJSON();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href:url, download:'cafememo-export.json' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
  $('#import-file')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try{
      await importJSON(text);
      alert('インポートしました');
      render();
    }catch(err){
      alert('インポート失敗: ' + err.message);
    }finally{
      ev.target.value = '';
    }
  });
});

async function render() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/add')) return renderAdd();
  if (hash.startsWith('#/c')) return renderDetail(hash.split('/')[2]); // #/c/{id}
  return renderList();
}

function tplFilters({areas, current}) {
  return `
  <div class="controls">
    <input class="input" id="q" placeholder="キーワード（店名/住所/タグ/メモ）"/>
    <select class="select" id="area">
      <option value="">すべてのエリア</option>
      ${areas.map(a=>`<option value="${e(a)}">${e(a)}</option>`).join('')}
    </select>
    <input class="input" id="tag" placeholder="タグ（カンマ可）"/>
    <label class="inline"><input type="checkbox" id="favOnly"/> <span>★お気に入りのみ</span></label>
    <button class="btn" id="btn-clear">クリア</button>
  </div>`;
}

async function renderList() {
  const app = document.getElementById('app');
  const rows = (await listCafes()).sort((a,b)=> (a.area||'').localeCompare(b.area||'') || b.updated_at.localeCompare(a.updated_at));
  const areas = [...new Set(rows.map(r=>r.area || 'その他'))].sort();

  app.innerHTML = `
    <section class="card">
      <h2 style="margin:0 0 8px">マイカフェ一覧</h2>
      ${tplFilters({areas})}
      <div id="list" class="list"></div>
      ${rows.length===0 ? `<div class="empty">まだ登録がありません。右上の「新規追加」からどうぞ。</div>` : ``}
    </section>
  `;

  // set handlers
  $('#btn-clear').addEventListener('click', () => {
    $('#q').value=''; $('#area').value=''; $('#tag').value=''; $('#favOnly').checked=false; paint(rows);
  });
  $('#q').addEventListener('input', () => paint(rows));
  $('#area').addEventListener('change', () => paint(rows));
  $('#tag').addEventListener('input', () => paint(rows));
  $('#favOnly').addEventListener('change', () => paint(rows));

  paint(rows);
}

function applyFilters(rows) {
  const q = $('#q')?.value.trim().toLowerCase() || '';
  const area = $('#area')?.value || '';
  const tags = normalizeTags($('#tag')?.value || '');
  const favOnly = $('#favOnly')?.checked || false;

  return rows.filter(r => {
    if (area && r.area !== area) return false;
    if (favOnly && !r.favorite) return false;
    if (tags.length && !tags.every(t => (r.tags||[]).includes(t))) return false;
    if (q) {
      const hay = [r.name, r.address, r.area, (r.tags||[]).join(','), r.memo].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function groupByArea(rows) {
  const map = new Map();
  rows.forEach(r=>{
    const k = r.area || 'その他';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return [...map.entries()].sort((a,b)=> a[0].localeCompare(b[0]));
}

function paint(rows) {
  const filtered = applyFilters(rows);
  const groups = groupByArea(filtered);
  const list = document.getElementById('list');
  list.innerHTML = groups.map(([area, items]) => `
    <div class="group">
      <div class="group-title">${e(area)} <span class="badge">${items.length}</span></div>
      ${items.map(itemCard).join('')}
    </div>
  `).join('') || `<div class="empty">条件に一致する結果はありません。</div>`;

  // wire actions
  $$('.item [data-act="fav"]').forEach(btn=>{
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const on = btn.getAttribute('aria-pressed') === 'true';
      const next = await updateCafe(id, { favorite: !on });
      btn.setAttribute('aria-pressed', String(next.favorite));
      btn.classList.toggle('on', next.favorite);
      btn.textContent = next.favorite ? '★' : '☆';
    });
  });
}

function itemCard(r){
  const t = (r.tags||[]).map(x=>`<span class="tag">${e(x)}</span>`).join(' ');
  const fav = r.favorite ? '★' : '☆';
  return `
  <div class="item">
    <div>
      <h3><a class="link" href="#/c/${e(r.id)}">${e(r.name || '(無題)')}</a></h3>
      <div class="meta">${e(r.area || 'その他')} ・ ${e(r.address || '')}</div>
      <div class="meta">${t || ''}</div>
    </div>
    <div class="item-actions">
      <button class="star ${r.favorite?'on':''}" data-act="fav" data-id="${e(r.id)}" aria-pressed="${r.favorite?'true':'false'}">${fav}</button>
      <a class="btn" href="${e(r.map_url || '#')}" target="_blank" rel="noopener">地図</a>
      <a class="btn" href="#/c/${e(r.id)}">開く</a>
    </div>
  </div>`;
}

function renderAdd() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <section class="card">
      <h2 style="margin:0 0 8px">カフェを追加</h2>
      <div class="grid cols-2">
        <div>
          <div class="label">店名</div>
          <input class="input" id="name" placeholder="例）カフェ・ド・〇〇" />
        </div>
        <div>
          <div class="label">エリア</div>
          <input class="input" id="area" placeholder="例）天神/大名/博多 など" />
        </div>
        <div>
          <div class="label">住所</div>
          <input class="input" id="address" placeholder="住所（任意）" />
        </div>
        <div>
          <div class="label">GoogleマップURL</div>
          <input class="input" id="map_url" placeholder="https://maps.app.goo.gl/..." />
        </div>
        <div>
          <div class="label">タグ（カンマ区切り）</div>
          <input class="input" id="tags" placeholder="電源, 自家焙煎, テラス" />
        </div>
        <div class="grid cols-2">
          <div>
            <div class="label">評価</div>
            <input class="input" id="rating" type="number" min="0" max="5" step="1" placeholder="0〜5"/>
          </div>
          <div>
            <div class="label">価格帯</div>
            <select class="select" id="price_range">
              <option value="">未設定</option>
              <option value="¥">¥</option>
              <option value="¥¥">¥¥</option>
              <option value="¥¥¥">¥¥¥</option>
            </select>
          </div>
        </div>
        <div class="kv">
          <label class="inline"><input type="checkbox" id="favorite"/> <span>★お気に入り</span></label>
        </div>
        <div class="grid" style="grid-column:1/-1">
          <div class="label">メモ</div>
          <textarea class="textarea" id="memo" rows="4" placeholder="雰囲気、Wi-Fi、混雑具合など"></textarea>
        </div>
      </div>
      <hr class="sep"/>
      <div class="inline">
        <button class="btn primary" id="save">保存</button>
        <a class="btn" data-link="#/">戻る</a>
      </div>
    </section>
  `;

  $('#save').addEventListener('click', async () => {
    const input = {
      name: $('#name').value,
      area: $('#area').value,
      address: $('#address').value,
      map_url: $('#map_url').value,
      tags: $('#tags').value,
      rating: $('#rating').value,
      price_range: $('#price_range').value,
      memo: $('#memo').value,
      favorite: $('#favorite').checked
    };
    if (!input.name) { alert('店名を入力してください'); return; }
    const rec = await addCafe(input);
    location.hash = `#/c/${rec.id}`;
  });
}

async function renderDetail(id) {
  const r = await getCafe(id);
  const app = document.getElementById('app');
  if (!r) {
    app.innerHTML = `<section class="card"><div class="empty">見つかりませんでした。<a class="link" href="#/">一覧へ</a></div></section>`;
    return;
  }
  const tagStr = (r.tags||[]).join(', ');
  app.innerHTML = `
    <section class="card">
      <div class="inline" style="justify-content:space-between">
        <h2 style="margin:0">${e(r.name||'(無題)')}</h2>
        <div class="inline">
          <button class="star ${r.favorite?'on':''}" id="fav">${r.favorite?'★':'☆'}</button>
          <a class="btn" href="${e(r.map
