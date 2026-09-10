/* ============================================================
   PERIA UPGRADE — локальный симулятор апгрейда скинов CS2
   Валюта: перы (P). Полностью автономная версия для РФ.
   Без внешних запросов, без VPN, без Cloudflare/Steam CDN.
   ============================================================ */

'use strict';

/* ---------------------------------------------------------
   0. CONFIG
--------------------------------------------------------- */
const CONFIG = {
  STARTING_BALANCE: 10000,
  STARTING_INVENTORY_COUNT: 10,
  HOUSE_EDGE: 0.92,          // реальный шанс = честный шанс * house edge
  MIN_CHANCE: 0.02,          // минимум 2%
  MAX_CHANCE: 0.95,          // максимум 95%
  SPIN_DURATION_MS: 4200,
  RIBBON_ITEM_COUNT: 46,     // карточек в ленте
  CARD_WIDTH: 114,           // px, включая gap
  HISTORY_LIMIT: 60,
  STORAGE_KEY: 'peria_upgrade_v1',
  CURRENCY_LABEL: 'пер',
};

// Соответствие редкости CS2 -> цветовой токен и вес "ценности".
const RARITY_MAP = {
  'Consumer Grade':   { key: 'consumer',   color: '#b0c3d9', order: 1 },
  'Industrial Grade': { key: 'industrial', color: '#5e98d9', order: 2 },
  'Mil-Spec Grade':   { key: 'milspec',    color: '#4b69ff', order: 3 },
  'Restricted':       { key: 'restricted', color: '#8847ff', order: 4 },
  'Classified':       { key: 'classified', color: '#d32ce6', order: 5 },
  'Covert':           { key: 'covert',     color: '#eb4b4b', order: 6 },
  'Contraband':       { key: 'contraband', color: '#e4ae39', order: 7 },
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
   2. LOCAL SVG GENERATOR (Векторные иконки без сети)
--------------------------------------------------------- */
function makeSvgIcon(category, color) {
  let path = '';
  if (category === 'knife') {
    // Векторный силуэт ножа
    path = '<path d="M4 36 L12 28 L16 32 L8 40 Z M14 26 L38 6 C42 2, 46 4, 44 10 L32 28 L24 24 L20 28 Z" fill="' + color + '"/>';
  } else if (category === 'sticker') {
    // Векторная наклейка / звезда
    path = '<polygon points="24,4 30,16 44,18 33,28 36,42 24,34 12,42 15,28 4,18 18,16" fill="' + color + '"/>';
  } else {
    // Векторный силуэт автомата / оружия
    path = '<path d="M4 22 L14 18 L20 20 L40 14 L44 18 L34 22 L42 25 L40 28 L28 26 L24 34 L20 34 L22 26 L12 24 Z" fill="' + color + '"/>';
  }
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' + path + '</svg>';
}

/* ---------------------------------------------------------
   3. LOCAL DATASET (Работает 100% без интернета и VPN)
--------------------------------------------------------- */
const LOCAL_SKINS_DATA = [
  // Ширпотреб & Промышленное
  { id: 'l1', name: 'P250 | Sand Dune', rarity: 'Consumer Grade', cat: 'skin', val: 12 },
  { id: 'l2', name: 'AK-47 | Safari Mesh', rarity: 'Industrial Grade', cat: 'skin', val: 35 },
  { id: 'l3', name: 'Glock-18 | High Beam', rarity: 'Industrial Grade', cat: 'skin', val: 45 },
  { id: 'l4', name: 'USP-S | Forest Leaves', rarity: 'Consumer Grade', cat: 'skin', val: 18 },
  
  // Армейское (Mil-Spec)
  { id: 'l5', name: 'M4A4 | Evil Daimyo', rarity: 'Mil-Spec Grade', cat: 'skin', val: 180 },
  { id: 'l6', name: 'AWM | Atheris', rarity: 'Mil-Spec Grade', cat: 'skin', val: 240 },
  { id: 'l7', name: 'Desert Eagle | Oxide Blaze', rarity: 'Mil-Spec Grade', cat: 'skin', val: 110 },
  { id: 'l8', name: 'Sticker | Howling Dawn (Replica)', rarity: 'Mil-Spec Grade', cat: 'sticker', val: 320 },

  // Запрещенное (Restricted)
  { id: 'l9', name: 'Glock-18 | Water Elemental', rarity: 'Restricted', cat: 'skin', val: 650 },
  { id: 'l10', name: 'USP-S | Cyrex', rarity: 'Restricted', cat: 'skin', val: 580 },
  { id: 'l11', name: 'M4A1-S | Nightmare', rarity: 'Restricted', cat: 'skin', val: 890 },
  { id: 'l12', name: 'AK-47 | Orbit Mk01', rarity: 'Restricted', cat: 'skin', val: 1100 },

  // Засекреченное (Classified)
  { id: 'l13', name: 'AK-47 | Redline', rarity: 'Classified', cat: 'skin', val: 2400 },
  { id: 'l14', name: 'AWP | Hyper Beast', rarity: 'Classified', cat: 'skin', val: 3800 },
  { id: 'l15', name: 'M4A4 | Neo-Noir', rarity: 'Classified', cat: 'skin', val: 2900 },
  { id: 'l16', name: 'USP-S | Kill Confirmed', rarity: 'Classified', cat: 'skin', val: 4500 },

  // Тайное (Covert) & Ножи
  { id: 'l17', name: 'AK-47 | Empress', rarity: 'Covert', cat: 'skin', val: 7200 },
  { id: 'l18', name: 'AWP | Asiimov', rarity: 'Covert', cat: 'skin', val: 9500 },
  { id: 'l19', name: 'M4A1-S | Printstream', rarity: 'Covert', cat: 'skin', val: 14000 },
  { id: 'l20', name: 'AK-47 | Fire Serpent', rarity: 'Covert', cat: 'skin', val: 32000 },
  { id: 'l21', name: 'Gut Knife | Doppler', rarity: 'Covert', cat: 'knife', val: 18500 },
  { id: 'l22', name: 'Huntsman Knife | Fade', rarity: 'Covert', cat: 'knife', val: 28000 },
  { id: 'l23', name: 'Karambit | Tiger Tooth', rarity: 'Covert', cat: 'knife', val: 65000 },
  { id: 'l24', name: 'Butterfly Knife | Marble Fade', rarity: 'Covert', cat: 'knife', val: 120000 },
  { id: 'l25', name: 'M4A4 | Howl', rarity: 'Contraband', cat: 'skin', val: 250000 },
  { id: 'l26', name: 'AWP | Dragon Lore', rarity: 'Covert', cat: 'skin', val: 450000 },
];

const Catalog = {
  all: [],
  loaded: false,
};

function loadCatalog() {
  Catalog.all = LOCAL_SKINS_DATA.map(item => {
    const rarity = rarityInfo(item.rarity);
    const isKnife = item.cat === 'knife';
    return {
      id: item.id,
      name: item.name,
      shortName: item.name.split('|').pop().trim(),
      image: makeSvgIcon(item.cat, isKnife ? '#eb4b4b' : rarity.color),
      rarityName: item.rarity,
      rarityKey: isKnife ? 'covert' : rarity.key,
      rarityColor: isKnife ? '#eb4b4b' : rarity.color,
      rarityOrder: isKnife ? 6 : rarity.order,
      category: item.cat,
      value: item.val,
      stattrak: item.name.includes('StatTrak™'),
      souvenir: item.name.includes('Souvenir'),
    };
  });
  Catalog.loaded = true;
}

// Загрузка локального каталога запускается мгновенно без ожиданий сети
loadCatalog();
