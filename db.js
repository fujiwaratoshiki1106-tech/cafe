// IndexedDB minimal wrapper for CafeMemo
const DB_NAME = 'cafememo';
const DB_VER = 2; // ★ バージョンを1→2へ
const STORE_CAFES = 'cafes';
const STORE_META = 'meta';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      // 既存 or 新規
      let s;
      if (!db.objectStoreNames.contains(STORE_CAFES)) {
        s = db.createObjectStore(STORE_CAFES, { keyPath: 'id' });
        s.createIndex('by_area', 'area');
        s.createIndex('by_fav', 'favorite');
        s.createIndex('by_created', 'created_at');
      } else {
        s = req.transaction.objectStore(STORE_CAFES);
        // 既存データには新フィールドが無いので、後段のputで埋めていく想定
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

export async function addCafe(input) {
  const now = new Date().toISOString();
  const cafe = {
    id: uuid(),
    name: input.name?.trim() ?? '',
    person: input.person?.trim() ?? '',          // ★ 担当者
    area: input.area?.trim() ?? 'その他',
    site_url: input.site_url?.trim() ?? '',      // ★ 店舗情報（サイトURL）
    rating: Number(input.rating ?? 0),
    memo: input.memo ?? '',
    // 以下は将来用 or 互換のために保持（未使用でもOK）
    address: input.address?.trim() ?? '',
    map_url: input.map_url?.trim() ?? '',
    tags: input.tags ?? [],
    price_range: input.price_range ?? '',
    favorite: !!input.favorite,
    visited_at: input.visited_at ?? null,
    created_at: now,
    updated_at: now
  };
  await tx(STORE_CAFES, 'readwrite', (s) => { s.add(cafe); });
  return cafe;
}

export async function updateCafe(id, patch) {
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

export async function deleteCafe(id) {
  await tx(STORE_CAFES, 'readwrite', (s) => { s.delete(id); });
}

export async function getCafe(id) {
  return tx(STORE_CAFES, 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const r = s.get(id);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  });
}

export async function listCafes() {
  return tx(STORE_CAFES, 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const out = [];
      const r = s.openCursor(null, 'prev');
      r.onsuccess = () => {
        const cur = r.result;
        if (cur) { out.push(cur.value); cur.continue(); } else { resolve(out); }
      };
      r.onerror = () => reject(r.error);
    });
  });
}

export async function exportJSON() {
  const data = await listCafes();
  return JSON.stringify({ version: 2, exported_at: new Date().toISOString(), cafes: data }, null, 2);
}

export async function importJSON(jsonText) {
  const obj = JSON.parse(jsonText);
  if (!obj?.cafes || !Array.isArray(obj.cafes)) throw new Error('不正なJSONです');
  await tx(STORE_CAFES, 'readwrite', (s) => {
    obj.cafes.forEach(c => {
      const rec = { ...c, id: c.id || uuid() };
      s.put(rec);
    });
  });
}
