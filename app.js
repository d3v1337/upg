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
    skins: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json',
    stickers: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json',
  },
};

// Соответствие редкости CS2 -> цветовой токен и вес "ценности".
const RARITY_MAP = {
  'Consumer Grade':        { key: 'consumer',    color: '#b0c3d9', order: 1 },
  'Industrial Grade':      { key: 'industrial',  color: '#5e98d9', order: 2 },
  'Mil-Spec Grade':        { key: 'milspec',      color: '#4b69ff', order: 3 },
  'Restricted':            { key: 'restricted',  color: '#8847ff', order: 4 },
  'Classified':            { key: 'classified',  color: '#d32ce6', order: 5 },
  'Covert':                { key: 'covert',       color: '#eb4b4b', order: 6 },
  'Contraband':            { key: 'contraband',  color: '#e4ae39', order: 7 },
  'Extraordinary':         { key: 'gold',         color: '#e4ae39', order: 8 },
  'High Grade':            { key: 'restricted',  color: '#8847ff', order: 4 },
  'Remarkable':            { key: 'classified',  color: '#d32ce6', order: 5 },
  'Exotic':                { key: 'covert',       color: '#eb4b4b', order: 6 },
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
  el.textContent = msg;
  el.classList.toggle('danger', danger);
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------------------------------------------------
   2. DATA LOADING (CS2 skins/knives/stickers via public JSON API,
      images served directly from source — no keys required)
--------------------------------------------------------- */
const FALLBACK_ITEMS = buildFallbackItems();

const Catalog = {
  all: [],       // весь пул предметов для генерации целей
  loaded: false,
};

async function loadCatalog() {
  try {
    const [skinsRes, stickersRes] = await Promise.allSettled([
      fetchJsonWithTimeout(CONFIG.DATA_SOURCES.skins, 9000),
      fetchJsonWithTimeout(CONFIG.DATA_SOURCES.stickers, 9000),
    ]);

    let items = [];

    if (skinsRes.status === 'fulfilled' && Array.isArray(skinsRes.value)) {
      items = items.concat(mapSkinsData(skinsRes.value));
    }
    if (stickersRes.status === 'fulfilled' && Array.isArray(stickersRes.value)) {
      items = items.concat(mapStickersData(stickersRes.value));
    }

    // отфильтровать без изображений/цены
    items = items.filter(it => it.image && it.value > 0);

    if (items.length < 30) {
      throw new Error('Слишком мало предметов получено из API');
    }

    Catalog.all = dedupeById(items);
    Catalog.loaded = true;
  } catch (err) {
    console.warn('Не удалось загрузить каталог CS2, используем локальный набор:', err);
    Catalog.all = FALLBACK_ITEMS;
    Catalog.loaded = true;
  }
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

// Псевдо-цена: у публичного API нет реальных цен, поэтому генерируем
// стабильную (детерминированную по id) условную стоимость в перах,
// основанную на редкости + StatTrak/souvenir модификаторах.
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

function mapSkinsData(raw) {
  return raw.map(s => {
    const rarityName = s.rarity && s.rarity.name;
    const rarity = rarityInfo(rarityName);
    const weaponName = s.weapon && s.weapon.name ? s.weapon.name : '';
    const skinName = s.name || weaponName;
    const isKnife = /^(★|Karambit|Bayonet|Butterfly|Talon|Skeleton|Bowie|Falchion|Flip|Gut|Huntsman|Navaja|Nomad|Paracord|Shadow Daggers|Stiletto|Survival|Ursus|Classic Knife)/i.test(weaponName)
      || (s.category && /knife/i.test(s.category.name || ''));
    const category = isKnife ? 'knife' : 'skin';
    const value = seededValue(s.id, rarity.order, !!s.stattrak, !!s.souvenir);
    return {
      id: s.id,
      name: skinName,
      shortName: (s.paint_index !== undefined && s.name) ? s.name.split('|').pop().replace(/\(.*\)/, '').trim() : skinName,
      image: s.image,
      rarityName: rarityName || 'Consumer Grade',
      rarityKey: isKnife ? 'covert' : rarity.key,
      rarityColor: isKnife ? '#eb4b4b' : rarity.color,
      rarityOrder: isKnife ? 6 : rarity.order,
      category,
      value: isKnife ? Math.max(value, 900) : value,
      stattrak: !!s.stattrak,
      souvenir: !!s.souvenir,
    };
  });
}

function mapStickersData(raw) {
  return raw.map(s => {
    const rarityName = s.rarity && s.rarity.name;
    const rarity = rarityInfo(rarityName);
    const value = seededValue(s.id, rarity.order, false, false);
    return {
      id: s.id,
      name: s.name,
      shortName: s.name,
      image: s.image,
      rarityName: rarityName || 'Consumer Grade',
      rarityKey: rarity.key,
      rarityColor: rarity.color,
      rarityOrder: rarity.order,
      category: 'sticker',
      value: Math.max(3, Math.round(value * 0.5)),
      stattrak: false,
      souvenir: false,
    };
  });
}

// Небольшой локальный резервный датасет (используется только если сеть
// недоступна или API не отвечает) — картинки берутся из общедоступного
// зеркала того же датасета CS2, чтобы UI не оставался пустым.
function buildFallbackItems() {
  const RAW_BASE = 'https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/default_generated/';
  const defs = [
    ['AK-47 | Redline', 'weapon_ak47_cu_ak47_cobra_light_png.png', 'Classified', 'skin'],
    ['AWP | Asiimov', 'weapon_awp_cu_medieval_snakebite_light_png.png', 'Covert', 'skin'],
    ['M4A4 | Howl', 'weapon_m4a1_cu_m4a1_hades_light_png.png', 'Contraband', 'skin'],
    ['Desert Eagle | Blaze', 'weapon_deagle_am_deagle_light_png.png', 'Restricted', 'skin'],
    ['Glock-18 | Fade', 'weapon_glock_am_fade_light_png.png', 'Restricted', 'skin'],
    ['USP-S | Kill Confirmed', 'weapon_usp_cu_usp_ivory_light_png.png', 'Covert', 'skin'],
    ['P250 | Sand Dune', 'weapon_p250_hy_p250_marbleized_light_png.png', 'Consumer Grade', 'skin'],
    ['MP7 | Nemesis', 'weapon_mp7_cu_mp7_hive_light_png.png', 'Restricted', 'skin'],
    ['Karambit | Doppler', 'weapon_karambit_am_ossify_knife_light_png.png', 'Covert', 'knife'],
    ['Butterfly Knife | Fade', 'weapon_knife_butterfly_am_fade_light_png.png', 'Covert', 'knife'],
    ['Five-SeveN | Case Hardened', 'weapon_fiveseven_cu_fiveseven_case_hardened_light_png.png', 'Classified', 'skin'],
    ['Galil AR | Chatterbox', 'weapon_galilar_cu_galil_flashwarning_light_png.png', 'Classified', 'skin'],
  ];
  return defs.map(([name, img, rarityName, category], idx) => {
    const rarity = rarityInfo(rarityName);
    const isKnife = category === 'knife';
    return {
      id: 'fallback-' + idx,
      name,
      shortName: name.split('|').pop().trim(),
      image: RAW_BASE + img,
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
