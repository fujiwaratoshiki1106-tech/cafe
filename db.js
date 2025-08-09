// ===== CafeMemo IndexedDB（非モジュール版） =====
const DB_NAME = 'cafememo';
const DB_VER = 2;
const STORE_CAFES = 'cafes';
const STORE_META = 'meta';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      let s;
      if (!db.objectStoreNames.contains(STORE_CAFES)) {
        s = db.createObjectStore(STORE_CAFES, { keyPath: 'id' });
        s.createIndex('by_area', 'area');
        s.createIndex('by_created', 'created_at');
      } else {
        s = req.transaction.objectStore(STORE_CAFES);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result?._result ?? result);
    t.onerror = () => reject(t.error);
  });
}

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now();
}

async function addCafe(input) {
  const now = new Date().toISOString();
  const cafe = {
    id: uuid(),
    name: (input.name||'').trim(),
    person: (input.person||'').trim(),
    area: (input.area||'その他').trim(),
    site_url: (input.site_url||'').trim(),
    rating: Number(input.rating ?? 0),
    memo: input.memo ?? '',
    // 互換用の残し
    address: (input.address||'').trim(),
    map_url: (input.map_url||'').trim(),
    tags: input.tags || [],
    price_range: input.price_range || '',
    favorite: !!input.favorite,
    visited_at: input.visited_at ?? null,
    created_at: now,
    updated_at: now
  };
  await tx(STORE_CAFES, 'readwrite', (s) => { s.add(cafe); });
  return cafe;
}

async function updateCafe(id, patch) {
  const cafe = await getCafe(id);
  if (!cafe) return null;
  const next = {
    ...cafe,
    ...patch,
    rating: Number(patch.rating ?? cafe.rating ?? 0),
    updated_at: new Date().toISOString()
  };
  await tx(STORE_CAFES, 'readwrite', (s) => { s.put(next); });
  return next;
}

async function deleteCafe(id) {
  await tx(STORE_CAFES, 'readwrite', (s) => { s.delete(id); });
}

async function getCafe(id) {
  return tx(STORE_CAFES, 'readonly', (s) => new Promise((resolve, reject) => {
    const r = s.get(id);
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => reject(r.error);
  }));
}

async function listCafes() {
  return tx(STORE_CAFES, 'readonly', (s) => new Promise((resolve, reject) => {
    const out = [];
    const r = s.openCursor(null, 'prev');
    r.onsuccess = () => {
      const cur = r.result;
      if (cur){ out.push(cur.value); cur.continue(); } else { resolve(out); }
    };
    r.onerror = () => reject(r.error);
  }));
}

async function exportJSON() {
  const data = await listCafes();
  return JSON.stringify({ version: 2, exported_at: new Date().toISOString(), cafes: data }, null, 2);
}

async function importJSON(jsonText) {
  const obj = JSON.parse(jsonText);
  if (!obj?.cafes || !Array.isArray(obj.cafes)) throw new Error('不正なJSONです');
  await tx(STORE_CAFES, 'readwrite', (s) => {
    obj.cafes.forEach(c => s.put({ ...c, id: c.id || uuid() }));
  });
}
