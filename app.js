// ===== CafeMemo App（非モジュール版） =====
(function(){
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  let deferredPrompt = null;

  // PWA インストール
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = $('#btn-install');
    if (btn) btn.hidden = false;
  });

  document.addEventListener('click', async (e) => {
    const t = e.target;

    // Install
    if (t && t.id === 'btn-install' && deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      t.hidden = true;
      return;
    }

    // タブ
    const tabBtn = t?.closest('.tab');
    if (tabBtn) {
      $$('.tab').forEach(b => b.classList.toggle('active', b === tabBtn));
      renderTabs(tabBtn.dataset.tab);
      return;
    }

    // 一覧カードの編集ショートカット
    const editId = t?.dataset?.edit;
    if (editId){
      activateTab('edit');
      renderTabEdit($('#tab-contents'), editId);
      return;
    }

    // 一覧カードの削除ショートカット
    const delId = t?.dataset?.del;
    if (delId){
      activateTab('delete');
      renderTabDelete($('#tab-contents'));
      return;
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Export / Import
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
        renderList();
        // 編集/削除タブを開いていたら再描画
        const active = $('.tab.active')?.dataset?.tab || 'add';
        renderTabs(active);
      }catch(err){
        alert('インポート失敗: ' + err.message);
      }finally{
        ev.target.value = '';
      }
    });

    // 初回描画（必ずタブ→一覧の順）
    activateTab('add');          // 見た目を先に
    renderTabs('add');           // 中身を描画
    renderList();                // 一覧も描画
  });

  // ============ 共通描画 ============
  async function renderList() {
    const rows = await listCafes();
    const list = $('#list');
    const empty = $('#empty');
    if (!rows.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = rows.map(itemCard).join('');
  }

  function itemCard(r){
    const site = r.site_url ? `<a class="link" href="${e(r.site_url)}" target="_blank" rel="noopener">サイト</a>` : '<span class="meta">サイトなし</span>';
    return `
    <div class="item">
      <div>
        <h3>${e(r.name || '(無題)')}</h3>
        <div class="meta">${e(r.area || 'その他')} ・ 担当：${e(r.person || '-')} ・ 評価：${Number(r.rating||0)}</div>
        <div class="meta">${site}</div>
      </div>
      <div class="item-actions">
        <button class="btn" data-edit="${e(r.id)}">編集</button>
        <button class="btn warn" data-del="${e(r.id)}">削除</button>
      </div>
    </div>`;
  }

  function renderTabs(name){
    const root = $('#tab-contents');
    if (!root) return;
    if (name === 'add') return renderTabAdd(root);
    if (name === 'edit') return renderTabEdit(root);
    if (name === 'delete') return renderTabDelete(root);
    // fallback
    renderTabAdd(root);
  }

  function activateTab(name){
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  }

  // ============ 新規追加 ============
  function renderTabAdd(root){
    root.innerHTML = `
      <div class="form-grid">
        <div>
          <div class="label">店名*</div>
          <input class="input" id="name" placeholder="例）カフェ・ド・〇〇" />
        </div>
        <div>
          <div class="label">担当者</div>
          <input class="input" id="person" placeholder="担当者名（任意）" />
        </div>
        <div>
          <div class="label">エリア</div>
          <input class="input" id="area" placeholder="例）天神/大名/博多 など" />
        </div>
        <div>
          <div class="label">店舗情報（サイトURL）</div>
          <input class="input" id="site_url" placeholder="https://..." />
        </div>
        <div>
          <div class="label">評価（0〜5）</div>
          <input class="input" id="rating" type="number" min="0" max="5" step="1" placeholder="0〜5"/>
        </div>
        <div class="col-span-2">
          <div class="label">メモ</div>
          <textarea class="textarea" id="memo" rows="4" placeholder="雰囲気、Wi-Fi、混雑具合など"></textarea>
        </div>
      </div>
      <hr class="sep"/>
      <button class="btn primary" id="save">追加</button>
      <span class="help">* は必須</span>
    `;
    $('#save').addEventListener('click', async ()=>{
      const input = {
        name: $('#name').value.trim(),
        person: $('#person').value.trim(),
        area: $('#area').value.trim(),
        site_url: $('#site_url').value.trim(),
        rating: $('#rating').value,
        memo: $('#memo').value
      };
      if (!input.name){ alert('店名は必須です'); return; }
      await addCafe(input);
      alert('追加しました');
      renderList();
      // リセット
      ['name','person','area','site_url','rating','memo'].forEach(id => { const el = $('#'+id); if (el) el.value=''; });
    });
  }

  // ============ 編集 ============
  async function renderTabEdit(root, preselectId){
    const rows = await listCafes();
    if (!rows.length){
      root.innerHTML = `<div class="empty">まだ登録がありません。</div>`;
      return;
    }
    root.innerHTML = `
      <div class="form-grid">
        <div class="col-span-2">
          <div class="label">編集するカフェを選択</div>
          <select class="select" id="edit-select">
            <option value="">選択してください</option>
            ${rows.map(r=>`<option value="${e(r.id)}">${e(r.name)}（${e(r.area||'その他')}）</option>`).join('')}
          </select>
        </div>
        <div id="edit-form" class="col-span-2"></div>
      </div>
    `;

    const sel = $('#edit-select');
    if (preselectId){ sel.value = preselectId; }
    sel.addEventListener('change', async ()=>{
      const id = sel.value;
      if (!id){ $('#edit-form').innerHTML=''; return; }
      const r = await getCafe(id);
      $('#edit-form').innerHTML = `
        <div class="form-grid">
          <div>
            <div class="label">店名*</div>
            <input class="input" id="e_name" value="${h(r.name||'')}" />
          </div>
          <div>
            <div class="label">担当者</div>
            <input class="input" id="e_person" value="${h(r.person||'')}" />
          </div>
          <div>
            <div class="label">エリア</div>
            <input class="input" id="e_area" value="${h(r.area||'')}" />
          </div>
          <div>
            <div class="label">店舗情報（サイトURL）</div>
            <input class="input" id="e_site_url" value="${h(r.site_url||'')}" />
          </div>
          <div>
            <div class="label">評価（0〜5）</div>
            <input class="input" id="e_rating" type="number" min="0" max="5" step="1" value="${h(r.rating||0)}"/>
          </div>
          <div class="col-span-2">
            <div class="label">メモ</div>
            <textarea class="textarea" id="e_memo" rows="4">${h(r.memo||'')}</textarea>
          </div>
        </div>
        <hr class="sep"/>
        <button class="btn primary" id="e_save">保存</button>
      `;
      $('#e_save').addEventListener('click', async ()=>{
        const patch = {
          name: $('#e_name').value.trim(),
          person: $('#e_person').value.trim(),
          area: $('#e_area').value.trim(),
          site_url: $('#e_site_url').value.trim(),
          rating: $('#e_rating').value,
          memo: $('#e_memo').value
        };
        if (!patch.name){ alert('店名は必須です'); return; }
        await updateCafe(id, patch);
        alert('保存しました');
        renderList();
      });
    });

    // 事前選択があれば即描画
    if (preselectId){ sel.dispatchEvent(new Event('change')); }
  }

  // ============ 削除 ============
  async function renderTabDelete(root){
    const rows = await listCafes();
    if (!rows.length){
      root.innerHTML = `<div class="empty">まだ登録がありません。</div>`;
      return;
    }
    root.innerHTML = `
      <div class="list">
        ${rows.map(r => `
          <div class="item">
            <div>
              <h3>${e(r.name||'(無題)')}</h3>
              <div class="meta">${e(r.area||'その他')} ・ 担当：${e(r.person||'-')} ・ 評価：${Number(r.rating||0)}</div>
            </div>
            <div class="item-actions">
              <button class="btn warn" data-del-row="${e(r.id)}">削除</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    root.querySelectorAll('[data-del-row]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.dataset.delRow;
        if (!confirm('このカフェを削除します。よろしいですか？')) return;
        await deleteCafe(id);
        alert('削除しました');
        renderList();
        renderTabDelete(root);
      });
    });
  }

  // utils
  function e(s){ return String(s ?? ''); }
  function h(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();
