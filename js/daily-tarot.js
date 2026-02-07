// ============================================
// 每日一测 — 独立模块
// ============================================

import { CONFIG } from './config.js?v=69';
import { loadTarotData, getAllCards, getCardImageUrl } from './tarot-data.js?v=69';

console.log('[daily-tarot] 模块加载');

// 5 套主题色（根据花色自动切换）
const THEMES = {
  fire:  { bg: ['#faf7f0','#f5ede0'], rgb: '120,90,40', accent: '#8a7030', cardBg: ['#4a2a1a','#2a1508'], text: '#3a3020' },
  water: { bg: ['#f2f8f6','#e8f3ef'], rgb: '60,100,80', accent: '#3a7a5a', cardBg: ['#1a3d30','#0f2a20'], text: '#2a4a3a' },
  air:   { bg: ['#f5f2f8','#ece6f3'], rgb: '100,70,140', accent: '#6a4a9a', cardBg: ['#3a2860','#251845'], text: '#3a2a55' },
  earth: { bg: ['#faf7f0','#f2eadb'], rgb: '130,100,50', accent: '#7a6428', cardBg: ['#3a3018','#22200e'], text: '#3a3520' },
  major: { bg: ['#0f0e1a','#161224'], rgb: '212,175,55', accent: '#d4af37', cardBg: ['#2a1f4e','#1a1235'], text: '#f5e6c4' },
};

// DOM 引用
const mainMenu = document.getElementById('main-menu');
const dailyPage = document.getElementById('daily-page');
const btnDaily = document.getElementById('btn-daily');
const btnBackDaily = document.getElementById('btn-back-daily');

const flipArea = document.getElementById('daily-flip-area');
const dailyCard = document.getElementById('daily-card');
const dailyCardImage = document.getElementById('daily-card-image');
const dailyCardName = document.getElementById('daily-card-name');
const dailyLoading = document.getElementById('daily-loading');

const resultCard = document.getElementById('daily-result-card');
const dcrDate = document.getElementById('dcr-date');
const dcrCardImg = document.getElementById('dcr-card-img');
const dcrFreqWords = document.getElementById('dcr-freq-words');
const dcrYiItems = document.getElementById('dcr-yi-items');
const dcrJiItems = document.getElementById('dcr-ji-items');
const dcrQuestion = document.getElementById('dcr-question');
const dcrRitual = document.getElementById('dcr-ritual');
const dcrMotto = document.getElementById('dcr-motto');

const dailyActions = document.getElementById('daily-actions');
const btnSave = document.getElementById('daily-save-btn');
const btnCopy = document.getElementById('daily-copy-btn');

// 当前结果（用于复制金句）
let currentMotto = '';

// 缓存 key
const CACHE_KEY_DATE = 'daily_tarot_date';
const CACHE_KEY_RESULT = 'daily_tarot_result';

// ============================================
// 花色 → 主题
// ============================================
function getThemeKey(card) {
  if (card.arcana === 'major') return 'major';
  return { wands: 'fire', cups: 'water', swords: 'air', pentacles: 'earth' }[card.suit] || 'major';
}

// ============================================
// 日期格式
// ============================================
function formatDate(date) {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================
// 缓存
// ============================================
function getCachedResult() {
  try {
    const date = localStorage.getItem(CACHE_KEY_DATE);
    if (date !== todayStr()) return null;
    const raw = localStorage.getItem(CACHE_KEY_RESULT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheResult(cardInfo, result) {
  localStorage.setItem(CACHE_KEY_DATE, todayStr());
  localStorage.setItem(CACHE_KEY_RESULT, JSON.stringify({ card: cardInfo, result }));
}

// ============================================
// 抽牌
// ============================================
function drawCard() {
  const cards = getAllCards();
  if (!cards || cards.length === 0) return null;
  const card = cards[Math.floor(Math.random() * cards.length)];
  const reversed = Math.random() < CONFIG.REVERSE_PROBABILITY;
  return { ...card, reversed };
}

// ============================================
// API 调用（SSE 流式累积 → JSON 解析）
// ============================================
async function callDailyAPI(card) {
  const orientation = card.reversed ? '逆位' : '正位';
  const userMessage = `牌名：${card.nameCN}（${orientation}）`;

  const response = await fetch(CONFIG.API.GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'daily',
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      systemInstruction: { parts: [{ text: CONFIG.SYSTEM_PROMPT_DAILY }] },
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `API 错误: ${response.status}`);
  }

  // 解析 SSE 流，累积文本
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) fullText += text;
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  // 解析 JSON 结果
  return JSON.parse(fullText);
}

// ============================================
// 翻牌动画
// ============================================
function playFlipAnimation(card) {
  flipArea.style.display = '';
  dailyCard.classList.remove('flipped', 'reversed');
  dailyCardImage.style.backgroundImage = `url(${getCardImageUrl(card)})`;
  if (card.reversed) dailyCard.classList.add('reversed');
  dailyCardName.textContent = `${card.nameCN}（${card.reversed ? '逆位' : '正位'}）`;

  return new Promise(resolve => {
    setTimeout(() => {
      dailyCard.classList.add('flipped');
      setTimeout(resolve, 900); // 翻牌动画完成
    }, 400);
  });
}

// ============================================
// 渲染结果卡片
// ============================================
function renderResultCard(card, result, themeKey) {
  // 设置主题
  resultCard.setAttribute('data-theme', themeKey);

  // 日期
  dcrDate.textContent = formatDate(new Date());

  // 牌面图片
  dcrCardImg.src = getCardImageUrl(card);
  dcrCardImg.classList.toggle('reversed', !!card.reversed);

  // 频率
  const freqArr = Array.isArray(result.frequency) ? result.frequency : [];
  dcrFreqWords.textContent = freqArr.join(' · ');

  // 宜忌
  const yiArr = Array.isArray(result.yi) ? result.yi : [];
  const jiArr = Array.isArray(result.ji) ? result.ji : [];
  dcrYiItems.innerHTML = yiArr.map(t => `<div>${t}</div>`).join('');
  dcrJiItems.innerHTML = jiArr.map(t => `<div>${t}</div>`).join('');

  // 灵魂拷问
  dcrQuestion.textContent = result.question || '';

  // 微仪式
  dcrRitual.textContent = result.ritual || '';

  // 星际格言
  const motto = (result.motto || '').replace(/[「」《》]/g, '');
  dcrMotto.textContent = `「${motto}」`;
  currentMotto = motto;

  // 隐藏翻牌区，显示结果
  flipArea.style.display = 'none';
  dailyLoading.style.display = 'none';
  resultCard.style.display = '';
  dailyActions.style.display = 'flex';
}

// ============================================
// 保存图片
// ============================================
async function saveImage() {
  if (typeof html2canvas === 'undefined') {
    alert('图片组件尚未加载完成，请稍后再试');
    return;
  }

  const originalText = btnSave.textContent;
  btnSave.disabled = true;
  btnSave.textContent = '生成中...';

  try {
    const canvas = await html2canvas(resultCard, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      allowTaint: true,
    });

    canvas.toBlob(async (blob) => {
      if (!blob) {
        alert('图片生成失败，请重试');
        btnSave.disabled = false;
        btnSave.textContent = originalText;
        return;
      }

      const file = new File([blob], 'daily-tarot.png', { type: 'image/png' });
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 768);

      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch {
          // 用户取消分享，不报错
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'daily-tarot.png';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);
      }

      btnSave.disabled = false;
      btnSave.textContent = originalText;
    }, 'image/png');
  } catch (err) {
    console.error('[daily-tarot] 截图失败:', err);
    alert('保存图片失败，请重试');
    btnSave.disabled = false;
    btnSave.textContent = originalText;
  }
}

// ============================================
// 复制金句
// ============================================
async function copyMotto() {
  if (!currentMotto) return;
  const text = `「${currentMotto}」\n— MYSTAR TAROT · intuitive-tarot.vercel.app`;
  try {
    await navigator.clipboard.writeText(text);
    const originalText = btnCopy.textContent;
    btnCopy.textContent = '已复制';
    setTimeout(() => { btnCopy.textContent = originalText; }, 1500);
  } catch {
    // 降级：选中文本
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    const originalText = btnCopy.textContent;
    btnCopy.textContent = '已复制';
    setTimeout(() => { btnCopy.textContent = originalText; }, 1500);
  }
}

// ============================================
// 重置页面
// ============================================
function resetPage() {
  dailyCard.classList.remove('flipped', 'reversed');
  dailyCardImage.style.backgroundImage = '';
  dailyCardName.textContent = '';
  flipArea.style.display = '';
  dailyLoading.style.display = 'none';
  resultCard.style.display = 'none';
  dailyActions.style.display = 'none';
  currentMotto = '';
}

// ============================================
// 显示每日页面（主入口）
// ============================================
async function showDailyPage() {
  // 确保牌数据已加载
  await loadTarotData();

  mainMenu.classList.add('hidden');
  resetPage();
  dailyPage.style.display = 'flex';

  // 检查缓存
  const cached = getCachedResult();
  if (cached) {
    const cardData = getAllCards().find(c => c.id === cached.card.id);
    if (cardData) {
      const card = { ...cardData, reversed: cached.card.reversed };
      const themeKey = getThemeKey(card);
      renderResultCard(card, cached.result, themeKey);
      return;
    }
  }

  // 抽牌
  const card = drawCard();
  if (!card) {
    dailyLoading.style.display = 'flex';
    dailyLoading.querySelector('.loading-text').textContent = '牌数据未加载，请刷新页面重试';
    return;
  }

  // 翻牌动画
  await playFlipAnimation(card);

  // 加载
  dailyLoading.style.display = 'flex';

  try {
    const result = await callDailyAPI(card);
    const themeKey = getThemeKey(card);
    renderResultCard(card, result, themeKey);

    // 缓存（只存必要字段）
    cacheResult(
      { id: card.id, reversed: card.reversed },
      result
    );
  } catch (err) {
    console.error('[daily-tarot] API 调用失败:', err);
    dailyLoading.style.display = 'none';
    flipArea.style.display = '';

    // 兜底文案
    dailyCardName.textContent = '今日气象信号微弱，请明日再试';
    dailyCardName.style.color = '#a05050';
  }
}

function hideDailyPage() {
  dailyPage.style.display = 'none';
  dailyCardName.style.color = '';
  mainMenu.classList.remove('hidden');
}

// ============================================
// 事件绑定
// ============================================
btnDaily.addEventListener('click', showDailyPage);
btnBackDaily.addEventListener('click', hideDailyPage);
btnSave.addEventListener('click', saveImage);
btnCopy.addEventListener('click', copyMotto);

console.log('[daily-tarot] 模块就绪');
