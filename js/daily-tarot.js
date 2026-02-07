// ============================================
// 每日一测 — 独立模块
// ============================================

import { CONFIG } from './config.js?v=74';
import { loadTarotData, getAllCards, getCardImageUrl } from './tarot-data.js?v=74';

console.log('[daily-tarot] 模块加载');

// DEBUG: URL 含 ?daily-debug=1 时跳过缓存和服务端限制
const DAILY_DEBUG = new URLSearchParams(window.location.search).has('daily-debug');
if (DAILY_DEBUG) console.log('[daily-tarot] DEBUG 模式');

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

const dcrLuckyColorBlock = document.getElementById('dcr-lucky-color-block');
const dcrLuckyColorName = document.getElementById('dcr-lucky-color-name');
const dcrLuckyAction = document.getElementById('dcr-lucky-action');
const dcrLuckyNumber = document.getElementById('dcr-lucky-number');

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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      ...(DAILY_DEBUG && { debug: true }),
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      systemInstruction: { parts: [{ text: CONFIG.SYSTEM_PROMPT_DAILY }] },
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1000,
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

  // 清洗：去掉 markdown 代码块标记和首尾空白
  let cleaned = fullText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[daily-tarot] JSON 解析失败, fullText:', fullText);
    throw new Error('AI 返回格式异常');
  }
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

  // 幸运色/数字/行动（先清除上次残留）
  resultCard.style.removeProperty('--dcr-lucky-color');
  const luckyColor = result.lucky_color;
  const luckyHex = luckyColor?.hex || null;
  if (luckyHex) {
    resultCard.style.setProperty('--dcr-lucky-color', luckyHex);
  }
  dcrLuckyColorBlock.style.background = luckyHex || '';
  dcrLuckyColorBlock.style.boxShadow = luckyHex ? `0 0 12px ${luckyHex}40` : '';
  dcrLuckyColorName.textContent = luckyColor?.name || '';
  dcrLuckyAction.textContent = result.lucky_action || '';
  dcrLuckyNumber.textContent = result.lucky_number ?? '';

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
// 保存图片（dom-to-image，原生支持 CSS 变量）
// ============================================
async function saveImage() {
  if (typeof window.domtoimage === 'undefined') {
    alert('图片组件尚未加载完成，请稍后再试');
    return;
  }

  const originalText = btnSave.textContent;
  btnSave.disabled = true;
  btnSave.textContent = '生成中...';

  try {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 768);

    // 滚到卡片顶部，确保完整可见
    resultCard.scrollIntoView({ block: 'start' });
    // 临时移除 overflow:hidden（防止截图被裁切）
    const origOverflow = resultCard.style.overflow;
    resultCard.style.overflow = 'visible';

    const blob = await window.domtoimage.toBlob(resultCard, {
      scale: 2,
      width: resultCard.scrollWidth,
      height: resultCard.scrollHeight,
    });

    // 恢复
    resultCard.style.overflow = origOverflow;

    const blobUrl = URL.createObjectURL(blob);

    if (isMobile) {
      // 手机端：弹出图片，长按保存
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:fixed; inset:0; z-index:9999;
        background:rgba(0,0,0,0.85);
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        padding:20px; gap:16px;
      `;
      const img = document.createElement('img');
      img.style.cssText = 'max-width:85%; max-height:70vh; border-radius:12px;';
      const tip = document.createElement('div');
      tip.textContent = '长按图片保存到相册';
      tip.style.cssText = 'color:#f5e6c4; font-size:14px; letter-spacing:1px;';
      overlay.appendChild(img);
      overlay.appendChild(tip);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); URL.revokeObjectURL(blobUrl); } });
      // 等图片加载完再显示
      img.onload = () => document.body.appendChild(overlay);
      img.onerror = () => { URL.revokeObjectURL(blobUrl); alert('图片加载失败，请重试'); };
      img.src = blobUrl;
    } else {
      // 电脑端：直接下载
      const link = document.createElement('a');
      link.download = '星际塔罗-每日气象.png';
      link.href = blobUrl;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }

    btnSave.disabled = false;
    btnSave.textContent = originalText;
  } catch (err) {
    resultCard.style.overflow = '';
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
  const text = `「${currentMotto}」\n— MYSTAR TAROT · tarot-project-bice.vercel.app`;
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
  mainMenu.classList.add('hidden');
  resetPage();
  dailyPage.style.display = 'flex';

  // 确保牌数据已加载
  try {
    await loadTarotData();
  } catch (err) {
    console.error('[daily-tarot] 牌数据加载失败:', err);
    dailyLoading.style.display = 'flex';
    dailyLoading.querySelector('.loading-text').textContent = '牌数据加载失败，请检查网络后刷新';
    return;
  }

  // 检查缓存（debug 模式跳过）
  const cached = DAILY_DEBUG ? null : getCachedResult();
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
