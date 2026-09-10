/* ============================================================
   PERIA UPGRADE — локальный симулятор апгрейда скинов CS2
   Валюта: перы (P). Полностью виртуально, без реальных денег,
   платежей, Steam API или обмена предметами. Только для друзей.
   ============================================================ */

'use strict';

/* ---------------------------------------------------------
   0. CONFIG
--------------------------------------------------------- */
const CONFIG = {
  STARTING_BALANCE: 10000,
  STARTING_INVENTORY_COUNT: 10,
  HOUSE_EDGE: 0.92,          // реальный шанс = честный шанс * house edge (казино всегда немного в плюсе)
  MIN_CHANCE: 0.02,          // минимум 2%, чтобы не было 0%-апгрейдов
  MAX_CHANCE: 0.95,          // максимум 95%, всегда есть шанс проигрыша
  SPIN_DURATION_MS: 4200,
  RIBBON_ITEM_COUNT: 46,     // сколько карточек в ленте
  CARD_WIDTH: 114,           // px, включая gap — должно совпадать с CSS (104 + 10 gap)
  HISTORY_LIMIT: 60,
  STORAGE_KEY: 'peria_upgrade_v1',
  CURRENCY_LABEL: 'пер',
  DATA_SOURCES: {
    // Используем открытую независимую базу CS2 скинов с готовыми картинками и ценниками
    catalog: 'https://raw.githubusercontent.com/Ansimov/cs2-schema/main/static/skins.json',
  },
};

// Соответствие редкости CS2 -> цветовой токен и вес "ценности".
const RARITY_MAP = {
  'Consumer Grade':        { key: 'consumer',    color: '#b0c3d9', order: 1 },
  'Industrial Grade':      { key: 'industrial',  color: '#5e98d9', order: 2 },
  'Mil-Spec Grade':        { key: 'milspec',     color: '#4b69ff', order: 3 },
  'Restricted':            { key: 'restricted',  color: '#8847ff', order: 4 },
  'Classified':            { key: 'classified',  color: '#d32ce6', order: 5 },
  'Covert':                { key: 'covert',      color: '#eb4b4b', order: 6 },
  'Contraband':            { key: 'contraband',  color: '#e4ae39', order: 7 },
  'Extraordinary':         { key: 'gold',        color: '#e4ae39', order: 8 },
  'High Grade':            { key: 'restricted',  color: '#8847ff', order: 4 },
  'Remarkable':            { key: 'classified',  color: '#d32ce6', order: 5 },
  'Exotic':                { key: 'covert',      color: '#eb4b4b', order: 6 },
  'Base Grade':            { key: 'consumer',    color: '#b0c3d9', order: 1 },
};
const DEFAULT_RARITY = { key: 'consumer', color: '#8a919e', order: 1 };

function rarityInfo(name) {
  return RARITY_MAP[name] || DEFAULT_RARITY;
}

/* ---------------------------------------------------------
   1. UTILITIES
--------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function fmtPera(n) {
  const rounded = Math.round(n);
  return rounded.toLocaleString('ru-RU') + ' ' + CONFIG.CURRENCY_LABEL;
}
function fmtNum(n) {
  return Math.round(n).toLocaleString('ru-RU');
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function randRange(min, max) { return min + Math.random() * (max - min); }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

// easeOutQuint — для плавного физически правдоподобного торможения ленты
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

function showToast(msg, danger = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('danger', danger);
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------------------------------------------------
   2. DATA LOADING (Без Steam API и Без ByMykel)
--------------------------------------------------------- */
const FALLBACK_ITEMS = buildFallbackItems();

const Catalog = {
  all: [],       // весь пул предметов для генерации целей
  loaded: false,
};

async function loadCatalog() {
  try {
    const rawData = await fetchJsonWithTimeout(CONFIG.DATA_SOURCES.catalog, 9000);

    if (!Array.isArray(rawData)) {
      throw new Error('Некорректный формат данных каталога');
    }

    let items = mapCatalogData(rawData);

    // фильтруем только валидные предметы с картинками и ценниками
    items = items.filter(it => it.image && it.value > 0);

    if (items.length < 10) {
      throw new Error('Получено слишком мало скинов');
    }

    Catalog.all = dedupeById(items);
    Catalog.loaded = true;
  } catch (err) {
    console.warn('Не удалось загрузить альтернативный каталог CS2, включаем резервный набор:', err);
    Catalog.all = FALLBACK_ITEMS;
    Catalog.loaded = true;
  }
}

function mapCatalogData(raw) {
  return raw.map((s, idx) => {
    const rarityName = s.rarity || 'Consumer Grade';
    const rarity = rarityInfo(rarityName);
    const skinName = s.name || 'CS2 Item';
    
    const isKnife = /^(★|Karambit|Bayonet|Butterfly|Talon|Skeleton|Bowie|Falchion|Flip|Gut|Huntsman|Navaja|Nomad|Paracord|Shadow Daggers|Stiletto|Survival|Ursus|Classic Knife)/i.test(skinName)
      || s.category === 'knife';
      
    const category = isKnife ? 'knife' : (s.category || 'skin');
    
    // Если в базе есть средняя рыночная цена (в USD) — конвертируем в перы, иначе генерируем
    const usdPrice = parseFloat(s.price || s.suggested_price || 0);
    const value = usdPrice > 0 
      ? Math.round(usdPrice * 100) 
      : seededValue('item-' + idx, rarity.order, skinName.includes('StatTrak™'), skinName.includes('Souvenir'));

    return {
      id: s.id || ('cs2-' + idx),
      name: skinName,
      shortName: skinName.split('|').pop().replace(/\(.*\)/, '').trim(),
      image: s.image || s.icon_url,
      rarityName: rarityName,
      rarityKey: isKnife ? 'covert' : rarity.key,
      rarityColor: isKnife ? '#eb4b4b' : rarity.color,
      rarityOrder: isKnife ? 6 : rarity.order,
      category,
      value: isKnife ? Math.max(value, 900) : value,
      stattrak: skinName.includes('StatTrak™'),
      souvenir: skinName.includes('Souvenir'),
    };
  });
}

function dedupeById(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function seededValue(id, rarityOrder, stattrak, souvenir) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const base = [8, 20, 55, 160, 480, 1450, 4200][clamp(rarityOrder - 1, 0, 6)];
  const spread = base * 1.8;
  const frac = (hash % 1000) / 1000;
  let value = base + frac * spread;
  if (stattrak) value *= 1.6;
  if (souvenir) value *= 1.3;
  return Math.max(4, Math.round(value));
}

function buildFallbackItems() {
  const RAW_BASE = 'https://community.cloudflare.steamstatic.com/economy/image/';
  const defs = [
    ['AK-47 | Redline', '-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV08ykmom0mH7IMrXUglR54pp53-vC99ij0Aew_RBtZ2D2I4eTd1A2ZwnR_1O2kunrhJK4vdTYm3Rk7yNw7S3azQv310Meb-c43z4', 'Classified', 'skin'],
    ['AWP | Asiimov', '-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJD_9W7m5a0mvLwO77UqWdY781lxOiS99T20A23qRBsYWD2coKQJQ43N1_R-1O7wOi905S0vZ_KySBi6Sdz4C7D30vgAydI19E', 'Covert', 'skin'],
    ['M4A4 | Howl', '-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhz2v_Nfz5H_uO1gb-Gw_alIITBhGJf_NZlmOzA-LP5gVO8v11rNmyiLIPBclI8MwqGrFS5wL25g5e7vJ2YzCFq6SR25yvczAv33080awX9_Q', 'Contraband', 'skin'],
    ['Desert Eagle | Blaze', '-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposbaqKAxf0v73djxP79S3m4GIhew3O4Tck39I54p03O3E94mjjQTg80M4Zz2mItCdegFvN1yGqFO-x-_rhpK46Jydm3Nru3U8pLHF21asUw', 'Restricted', 'skin'],
    ['Karambit | Doppler', '-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpovbSsLQJf1fLEcjVL49KJlY20k_jkI7fUhFRB4sp0i_2Xp9yhi1WxrhA4NT31IYeWclBvaArTrFS3wbvq0cO045v3_XIn4I50', 'Covert', 'knife'],
  ];
  return defs.map(([name, imgHash, rarityName, category], idx) => {
    const rarity = rarityInfo(rarityName);
    const isKnife = category === 'knife';
    return {
      id: 'fallback-' + idx,
      name,
      shortName: name.split('|').pop().trim(),
      image: RAW_BASE + imgHash,
      rarityName,
      rarityKey: isKnife ? 'covert' : rarity.key,
      rarityColor: isKnife ? '#eb4b4b' : rarity.color,
      rarityOrder: isKnife ? 6 : rarity.order,
      category,
      value: seededValue('fallback-' + idx, rarity.order, false, false) * (isKnife ? 8 : 1),
      stattrak: false,
      souvenir: false,
    };
  });
}
loadCatalog();
