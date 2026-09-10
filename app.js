/* ============================================================
   PERIA UPGRADE — Автономный движок апгрейда скинов
   ============================================================ */

'use strict';

// CONFIG & STORAGE KEYS
const STORAGE_KEY = 'peria_upgrade_save_v1';
const CONFIG = {
  STARTING_BALANCE: 10000,
  CURRENCY: 'пер',
  MAX_HISTORY: 50,
};

// БАЗОВАЯ БД ПРЕДМЕТОВ (Полностью офлайн)
const ITEMS_DATABASE = [
  // Consumer / Industrial
  { id: 'p250_sand', name: 'P250 | Sand Dune', category: 'skin', rarity: 'industrial', rarityColor: '#5e98d9', baseValue: 15 },
  { id: 'ak_safari', name: 'AK-47 | Safari Mesh', category: 'skin', rarity: 'industrial', rarityColor: '#5e98d9', baseValue: 40 },
  { id: 'glock_beam', name: 'Glock-18 | High Beam', category: 'skin', rarity: 'industrial', rarityColor: '#5e98d9', baseValue: 60 },
  
  // Mil-Spec
  { id: 'm4_daimyo', name: 'M4A4 | Evil Daimyo', category: 'skin', rarity: 'milspec', rarityColor: '#4b69ff', baseValue: 180 },
  { id: 'awp_atheris', name: 'AWP | Atheris', category: 'skin', rarity: 'milspec', rarityColor: '#4b69ff', baseValue: 260 },
  { id: 'usps_flashback', name: 'USP-S | Flashback', category: 'skin', rarity: 'milspec', rarityColor: '#4b69ff', baseValue: 120 },

  // Restricted
  { id: 'glock_water', name: 'Glock-18 | Water Elemental', category: 'skin', rarity: 'restricted', rarityColor: '#8847ff', baseValue: 650 },
  { id: 'ak_redline', name: 'AK-47 | Redline', category: 'skin', rarity: 'restricted', rarityColor: '#8847ff', baseValue: 1400 },
  { id: 'm4_hyper', name: 'M4A1-S | Hyper Beast', category: 'skin', rarity: 'restricted', rarityColor: '#8847ff', baseValue: 2100 },

  // Classified
  { id: 'awp_asiimov', name: 'AWP | Asiimov', category: 'skin', rarity: 'classified', rarityColor: '#d32ce6', baseValue: 8500 },
  { id: 'ak_vulcan', name: 'AK-47 | Vulcan', category: 'skin', rarity: 'classified', rarityColor: '#d32ce6', baseValue: 14000 },
  { id: 'desert_printstream', name: 'Desert Eagle | Printstream', category: 'skin', rarity: 'classified', rarityColor: '#d32ce6', baseValue: 9200 },

  // Covert & Knives
  { id: 'ak_fire', name: 'AK-47 | Fire Serpent', category: 'skin', rarity: 'covert', rarityColor: '#eb4b4b', baseValue: 45000 },
  { id: 'gut_doppler', name: 'Gut Knife | Doppler', category: 'knife', rarity: 'gold', rarityColor: '#e4ae39', baseValue: 18500 },
  { id: 'flip_tiger', name: 'Flip Knife | Tiger Tooth', category: 'knife', rarity: 'gold', rarityColor: '#e4ae39', baseValue: 32000 },
  { id: 'karambit_fade', name: 'Karambit | Fade', category: 'knife', rarity: 'gold', rarityColor: '#e4ae39', baseValue: 110000 },
  { id: 'm9_doppler', name: 'M9 Bayonet | Doppler Phase 2', category: 'knife', rarity: 'gold', rarityColor: '#e4ae39', baseValue: 95000 }
];

// STATE MANAGEMENT
let state = {
  playerName: 'Игрок',
  balance: CONFIG.STARTING_BALANCE,
  inventory: [],
  history: [],
  stats: { total: 0, wins: 0, losses: 0, bestMult: 0 },
  soundEnabled: true,
  selectedFrom: null,
  selectedTo: null,
  targetMultiplierLimit: 4.0,
  isSpinning: false
};

// SVG GENERATOR FOR SKINS & KNIVES
function generateSvgIcon(cat, color) {
  const isKnife = cat === 'knife';
  const path = isKnife
    ? `<path d="M6 38 L14 30 L18 34 L10 42 Z M16 28 L38 6 C42 2, 46 4, 44 10 L32 28 L24 24 L20 28 Z" fill="${color}"/>`
    : `<path d="M4 24 L16 20 L22 22 L42 16 L44 20 L34 24 L42 27 L40 30 L28 28 L24 36 L20 36 L22 28 L12 26 Z" fill="${color}"/>`;
  
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="none"/>${path}</svg>`;
}

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initBackgroundCanvas();
  bindEvents();
  renderAll();
});

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = { ...state, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Ошибка чтения сохранения, сброс...', e);
    }
  }
  
  // Если инвентарь пуст — даём стартовый набор
  if (!state.inventory || state.inventory.length === 0) {
    state.inventory = [
      { ...ITEMS_DATABASE[0], instanceId: Date.now() + 1 },
      { ...ITEMS_DATABASE[1], instanceId: Date.now() + 2 },
      { ...ITEMS_DATABASE[2], instanceId: Date.now() + 3 },
      { ...ITEMS_DATABASE[3], instanceId: Date.now() + 4 },
      { ...ITEMS_DATABASE[4], instanceId: Date.now() + 5 },
    ];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// RENDER FUNCTIONS
function renderAll() {
  renderHeader();
  renderInventory();
  renderTargets();
  renderUpgradePanel();
  renderHistory();
  renderProfile();
}

function renderHeader() {
  document.getElementById('balanceValue').textContent = formatNum(state.balance);
  document.getElementById('headerPlayerName').textContent = state.playerName;
  document.getElementById('headerAvatarInitial').textContent = (state.playerName[0] || 'И').toUpperCase();
}

function renderInventory() {
  const grid = document.getElementById('inventoryGrid');
  const countEl = document.getElementById('inventoryCount');
  const searchVal = document.getElementById('invSearch').value.toLowerCase();
  const sortVal = document.getElementById('invSort').value;

  let items = [...state.inventory];

  if (searchVal) {
    items = items.filter(item => item.name.toLowerCase().includes(searchVal));
  }

  // Сортировка
  items.sort((a, b) => {
    if (sortVal === 'value-desc') return b.baseValue - a.baseValue;
    if (sortVal === 'value-asc') return a.baseValue - b.baseValue;
    if (sortVal === 'name-asc') return a.name.localeCompare(b.name);
    return 0;
  });

  countEl.textContent = `Предметов: ${items.length}`;

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state">Инвентарь пуст</div>`;
    return;
  }

  grid.innerHTML = items.map(item => {
    const isSelected = state.selectedFrom && state.selectedFrom.instanceId === item.instanceId;
    const img = generateSvgIcon(item.category, item.rarityColor);
    
    return `
      <div class="item-card ${isSelected ? 'selected' : ''}" data-id="${item.instanceId}">
        <div class="item-rarity-bar" style="--rarity-color: ${item.rarityColor}"></div>
        <div class="item-thumb"><img src="${img}" alt="${item.name}"></div>
        <div class="item-name">${item.name}</div>
        <div class="item-value">${formatNum(item.baseValue)} ${CONFIG.CURRENCY}</div>
      </div>
    `;
  }).join('');

  // Навешивание кликов
  grid.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      const item = state.inventory.find(i => i.instanceId === id);
      selectFromItem(item);
    });
  });
}

function renderTargets() {
  const grid = document.getElementById('targetGrid');
  const countEl = document.getElementById('targetsCount');
  const searchVal = document.getElementById('targetSearch').value.toLowerCase();
  
  if (!state.selectedFrom) {
    countEl.textContent = 'Сначала выберите исходный предмет';
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z" stroke="currentColor" stroke-width="1.5"/></svg>
        Выберите предмет в инвентаре, чтобы увидеть доступные цели
      </div>`;
    return;
  }

  const baseVal = state.selectedFrom.baseValue;
  const maxVal = baseVal * state.targetMultiplierLimit;

  let targets = ITEMS_DATABASE.filter(item => item.baseValue > baseVal && item.baseValue <= maxVal);

  if (searchVal) {
    targets = targets.filter(item => item.name.toLowerCase().includes(searchVal));
  }

  countEl.textContent = `Доступно целей: ${targets.length}`;

  if (targets.length === 0) {
    grid.innerHTML = `<div class="empty-state">Увеличьте множитель диапазона слайдером</div>`;
    return;
  }

  grid.innerHTML = targets.map(item => {
    const isSelected = state.selectedTo && state.selectedTo.id === item.id;
    const img = generateSvgIcon(item.category, item.rarityColor);
    const chance = Math.min(95, Math.max(1, (baseVal / item.baseValue) * 100)).toFixed(1);

    return `
      <div class="item-card ${isSelected ? 'selected' : ''}" data-target-id="${item.id}">
        <div class="item-rarity-bar" style="--rarity-color: ${item.rarityColor}"></div>
        <div class="item-thumb"><img src="${img}" alt="${item.name}"></div>
        <div class="item-name">${item.name}</div>
        <div class="item-value">${formatNum(item.baseValue)} ${CONFIG.CURRENCY}</div>
        <div style="font-size:10px; color:var(--text-mute); margin-top:2px;">Шанс: ${chance}%</div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.targetId;
      const item = ITEMS_DATABASE.find(i => i.id === id);
      selectToItem(item);
    });
  });
}

function selectFromItem(item) {
  if (state.isSpinning) return;
  if (state.selectedFrom && state.selectedFrom.instanceId === item.instanceId) {
    state.selectedFrom = null;
    state.selectedTo = null;
  } else {
    state.selectedFrom = item;
    state.selectedTo = null;
  }
  renderInventory();
  renderTargets();
  renderUpgradePanel();
}

function selectToItem(item) {
  if (state.isSpinning) return;
  state.selectedTo = (state.selectedTo && state.selectedTo.id === item.id) ? null : item;
  renderTargets();
  renderUpgradePanel();
}

function renderUpgradePanel() {
  const fromSlot = document.getElementById('fromSlot');
  const fromName = document.getElementById('fromSlotName');
  const fromVal = document.getElementById('fromSlotValue');
  
  const toSlot = document.getElementById('toSlot');
  const toName = document.getElementById('toSlotName');
  const toVal = document.getElementById('toSlotValue');

  const btn = document.getElementById('upgradeBtn');
  const btnSub = document.getElementById('upgradeBtnSub');

  // Исходный слот
  if (state.selectedFrom) {
    const img = generateSvgIcon(state.selectedFrom.category, state.selectedFrom.rarityColor);
    fromSlot.className = 'slot-frame filled rarity-glow';
    fromSlot.style.setProperty('--rarity-color', state.selectedFrom.rarityColor);
    fromSlot.innerHTML = `<img src="${img}" alt="${state.selectedFrom.name}">`;
    fromName.style.display = 'block';
    fromName.textContent = state.selectedFrom.name;
    fromVal.style.display = 'flex';
    fromVal.textContent = `${formatNum(state.selectedFrom.baseValue)} ${CONFIG.CURRENCY}`;
  } else {
    fromSlot.className = 'slot-frame';
    fromSlot.innerHTML = `<div class="slot-empty-text">Выберите предмет<br>в инвентаре снизу</div>`;
    fromName.style.display = 'none';
    fromVal.style.display = 'none';
  }

  // Целевой слот
  if (state.selectedTo) {
    const img = generateSvgIcon(state.selectedTo.category, state.selectedTo.rarityColor);
    toSlot.className = 'slot-frame filled rarity-glow';
    toSlot.style.setProperty('--rarity-color', state.selectedTo.rarityColor);
    toSlot.innerHTML = `<img src="${img}" alt="${state.selectedTo.name}">`;
    toName.style.display = 'block';
    toName.textContent = state.selectedTo.name;
    toVal.style.display = 'flex';
    toVal.textContent = `${formatNum(state.selectedTo.baseValue)} ${CONFIG.CURRENCY}`;
  } else {
    toSlot.className = 'slot-frame';
    toSlot.innerHTML = `<div class="slot-empty-text">Выберите желаемый<br>предмет справа</div>`;
    toName.style.display = 'none';
    toVal.style.display = 'none';
  }

  // Расчет шансов
  let chance = 0;
  let mult = 0;
  if (state.selectedFrom && state.selectedTo) {
    chance = Math.min(95, Math.max(1, (state.selectedFrom.baseValue / state.selectedTo.baseValue) * 100));
    mult = (state.selectedTo.baseValue / state.selectedFrom.baseValue).toFixed(2);
  }

  document.getElementById('chancePct').textContent = chance ? `${chance.toFixed(1)}%` : '—';
  document.getElementById('multiplierChip').textContent = mult ? `×${mult}` : '×—';

  // SVG Кольцо шанса
  const circle = document.getElementById('chanceRing');
  const circumference = 364.4;
  const offset = circumference - (chance / 100) * circumference;
  circle.style.strokeDashoffset = offset;

  // Мета статистика
  document.getElementById('metaStake').textContent = state.selectedFrom ? `${formatNum(state.selectedFrom.baseValue)} ${CONFIG.CURRENCY}` : `0 ${CONFIG.CURRENCY}`;
  document.getElementById('metaWin').textContent = state.selectedTo ? `+${formatNum(state.selectedTo.baseValue)} ${CONFIG.CURRENCY}` : `+0 ${CONFIG.CURRENCY}`;
  document.getElementById('metaLoss').textContent = state.selectedFrom ? `−${formatNum(state.selectedFrom.baseValue)} ${CONFIG.CURRENCY}` : `−0 ${CONFIG.CURRENCY}`;

  // Кнопка Апгрейда
  if (!state.selectedFrom || !state.selectedTo) {
    btn.disabled = true;
    btnSub.textContent = 'выберите предметы';
  } else if (state.isSpinning) {
    btn.disabled = true;
    btnSub.textContent = 'крутим рулетку...';
  } else {
    btn.disabled = false;
    btnSub.textContent = 'нажмите для старта';
  }
}

// LOGIC: RUN UPGRADE SPIN
function runUpgrade() {
  if (!state.selectedFrom || !state.selectedTo || state.isSpinning) return;

  state.isSpinning = true;
  renderUpgradePanel();

  const from = state.selectedFrom;
  const to = state.selectedTo;
  const chance = Math.min(95, Math.max(1, (from.baseValue / to.baseValue) * 100));
  const isWin = (Math.random() * 100) <= chance;

  const ribbonWrap = document.getElementById('spinRibbonWrap');
  const ribbonTrack = document.getElementById('spinRibbonTrack');
  const outcomeBanner = document.getElementById('outcomeBanner');

  outcomeBanner.className = 'outcome-banner';
  outcomeBanner.textContent = '';
  ribbonWrap.classList.add('open');
  ribbonTrack.innerHTML = '';

  // Генерация ленты рулетки
  const totalCards = 40;
  const winIndex = 32; // Карта, на которой остановится рулетка

  for (let i = 0; i < totalCards; i++) {
    const cardIsWin = (i === winIndex) ? isWin : (Math.random() * 100 <= chance);
    const itemToShow = cardIsWin ? to : from;
    const img = generateSvgIcon(itemToShow.category, itemToShow.rarityColor);

    const card = document.createElement('div');
    card.className = 'spin-card';
    if (i === winIndex) card.id = 'targetSpinCard';
    card.innerHTML = `
      <img src="${img}" alt="">
      <div class="spin-card-name">${itemToShow.name}</div>
    `;
    ribbonTrack.appendChild(card);
  }

  // Анимация вращения
  const cardWidth = 114; // ширина карточки + gap
  const centerOffset = ribbonWrap.offsetWidth / 2 - cardWidth / 2;
  const targetX = -(winIndex * cardWidth - centerOffset);

  ribbonTrack.style.transition = 'none';
  ribbonTrack.style.transform = 'translateX(0px)';

  setTimeout(() => {
    ribbonTrack.style.transition = 'transform 4s cubic-bezier(0.15, 0.9, 0.2, 1)';
    ribbonTrack.style.transform = `translateX(${targetX}px)`;
  }, 50);

  // Завершение анимации
  setTimeout(() => {
    const winCard = document.getElementById('targetSpinCard');
    if (winCard) {
      winCard.classList.add(isWin ? 'result-win' : 'result-lose');
    }

    // Изменение состояния игры
    // Удаляем исходный предмет из инвентаря
    state.inventory = state.inventory.filter(i => i.instanceId !== from.instanceId);

    if (isWin) {
      state.inventory.push({ ...to, instanceId: Date.now() });
      state.stats.wins++;
    } else {
      state.stats.losses++;
    }

    const mult = Number((to.baseValue / from.baseValue).toFixed(2));
    if (isWin && mult > state.stats.bestMult) {
      state.stats.bestMult = mult;
    }
    state.stats.total++;

    // Логируем историю
    state.history.unshift({
      id: Date.now(),
      fromName: from.name,
      toName: to.name,
      fromImg: generateSvgIcon(from.category, from.rarityColor),
      toImg: generateSvgIcon(to.category, to.rarityColor),
      isWin,
      chance: chance.toFixed(1),
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    if (state.history.length > CONFIG.MAX_HISTORY) state.history.pop();

    saveState();

    // Финальный баннер
    outcomeBanner.className = `outcome-banner show ${isWin ? 'win' : 'lose'}`;
    outcomeBanner.textContent = isWin ? `УСПЕХ! Вы получили ${to.name}` : `НЕУДАЧА! Предмет ${from.name} сгорел`;

    // Показываем модальное окно результата
    setTimeout(() => {
      showResultModal(isWin, to, from);
      state.isSpinning = false;
      state.selectedFrom = null;
      state.selectedTo = null;
      renderAll();
    }, 1200);

  }, 4100);
}

// MODAL RESULT
function showResultModal(isWin, targetItem, fromItem) {
  const overlay = document.getElementById('resultOverlay');
  const modal = document.getElementById('resultModal');
  const tag = document.getElementById('resultTag');
  const img = document.getElementById('resultItemImg');
  const name = document.getElementById('resultItemName');
  const val = document.getElementById('resultItemValue');

  modal.className = `result-modal ${isWin ? 'win' : 'lose'}`;
  tag.className = `result-tag ${isWin ? 'win' : 'lose'}`;
  tag.textContent = isWin ? 'УСПЕШНЫЙ АПГРЕЙД' : 'ПРЕДМЕТ СГОРЕЛ';

  const itemToShow = isWin ? targetItem : fromItem;
  img.src = generateSvgIcon(itemToShow.category, itemToShow.rarityColor);
  name.textContent = itemToShow.name;
  val.innerHTML = `Ценность: <b>${formatNum(itemToShow.baseValue)} ${CONFIG.CURRENCY}</b>`;

  overlay.classList.add('show');
}

// BIND EVENTS & NAVIGATION
function bindEvents() {
  // Навигация по вкладкам
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.dataset.view;
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll(`[data-view="${viewId}"]`).forEach(l => l.classList.add('active'));
      
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const activeView = document.getElementById(`view-${viewId}`);
      if (activeView) activeView.classList.add('active');

      document.getElementById('mobileNavSheet').classList.remove('show');
    });
  });

  // Мобильное меню
  document.getElementById('mobileNavToggle').addEventListener('click', () => {
    document.getElementById('mobileNavSheet').classList.toggle('show');
  });

  // Кнопка старта апгрейда
  document.getElementById('upgradeBtn').addEventListener('click', runUpgrade);

  // Слайдер диапазона целей
  const rangeSlider = document.getElementById('targetRangeSlider');
  const rangeLabel = document.getElementById('targetRangeLabel');
  rangeSlider.addEventListener('input', (e) => {
    state.targetMultiplierLimit = parseFloat(e.target.value);
    rangeLabel.textContent = `×${state.targetMultiplierLimit.toFixed(1)}`;
    renderTargets();
  });

  // Поиск и фильтры
  document.getElementById('invSearch').addEventListener('input', renderInventory);
  document.getElementById('invSort').addEventListener('change', renderInventory);
  document.getElementById('targetSearch').addEventListener('input', renderTargets);

  // Закрытие модального окна
  const closeModal = () => document.getElementById('resultOverlay').classList.remove('show');
  document.getElementById('resultCloseBtn').addEventListener('click', closeModal);
  document.getElementById('resultCloseBtn2').addEventListener('click', closeModal);
  document.getElementById('resultAgainBtn').addEventListener('click', closeModal);

  // Очистка истории
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    state.history = [];
    saveState();
    renderHistory();
  });

  // Сброс игры
  document.getElementById('resetGameBtn').addEventListener('click', () => {
    if (confirm('Вы уверены, что хотите обнулить весь прогресс?')) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });

  // Профиль
  document.getElementById('profileNameInput').addEventListener('change', (e) => {
    state.playerName = e.target.value || 'Игрок';
    saveState();
    renderHeader();
  });
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (state.history.length === 0) {
    list.innerHTML = `<div class="empty-state">Вы ещё не сделали ни одного апгрейда</div>`;
    return;
  }

  list.innerHTML = state.history.map(item => `
    <div class="history-item">
      <div class="history-thumbs">
        <div class="history-thumb"><img src="${item.fromImg}" alt=""></div>
        <div class="history-arrow">→</div>
        <div class="history-thumb"><img src="${item.toImg}" alt=""></div>
      </div>
      <div class="history-info">
        <div class="history-names">${item.fromName} → ${item.toName}</div>
        <div class="history-sub">
          <span>Шанс: ${item.chance}%</span>
          <span>${item.date}</span>
        </div>
      </div>
      <div class="history-badge ${item.isWin ? 'win' : 'lose'}">
        ${item.isWin ? 'УСПЕХ' : 'НЕУДАЧА'}
      </div>
    </div>
  `).join('');
}

function renderProfile() {
  document.getElementById('profileNameInput').value = state.playerName;
  document.getElementById('profileAvatarLg').textContent = (state.playerName[0] || 'И').toUpperCase();
  document.getElementById('statBalance').textContent = `${formatNum(state.balance)} ${CONFIG.CURRENCY}`;
  document.getElementById('statTotal').textContent = state.stats.total;
  document.getElementById('statWins').textContent = state.stats.wins;
  document.getElementById('statLosses').textContent = state.stats.losses;
  
  const wr = state.stats.total > 0 ? ((state.stats.wins / state.stats.total) * 100).toFixed(1) : 0;
  document.getElementById('statWinrate').textContent = `${wr}%`;
  document.getElementById('statBestMult').textContent = `×${state.stats.bestMult}`;
}

// UTILS
function formatNum(num) {
  return Math.round(num).toLocaleString('ru-RU');
}

function initBackgroundCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const dots = Array.from({ length: 35 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2 + 1,
    dx: (Math.random() - 0.5) * 0.4,
    dy: (Math.random() - 0.5) * 0.4
  }));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(240, 180, 41, 0.15)';
    
    dots.forEach(d => {
      d.x += d.dx;
      d.y += d.dy;
      if (d.x < 0 || d.x > canvas.width) d.dx *= -1;
      if (d.y < 0 || d.y > canvas.height) d.dy *= -1;
      
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    });
    
    requestAnimationFrame(animate);
  }
  animate();
}
