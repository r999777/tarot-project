// ============================================
// 塔罗牌数据管理
// ============================================

import { CONFIG } from './config.js?v=70';

let tarotData = null;

// 加载塔罗牌数据
export async function loadTarotData() {
  if (tarotData) return tarotData;

  try {
    const response = await fetch('./data/tarot-cards.json');
    if (!response.ok) {
      throw new Error('无法加载塔罗牌数据');
    }
    tarotData = await response.json();
    console.log(`[tarot-data] 加载了 ${tarotData.cards.length} 张牌`);
    return tarotData;
  } catch (error) {
    console.error('[tarot-data] 加载失败:', error);
    throw error;
  }
}

// 获取所有牌
export function getAllCards() {
  return tarotData?.cards || [];
}

// 获取牌的图片URL
export function getCardImageUrl(card) {
  const baseUrl = CONFIG.CARD_IMAGE_BASE_URL;
  return baseUrl + card.imageFilename;
}

// 随机抽取直觉练习用的牌
export function getRandomIntuitionCards(count = 2) {
  const cards = getAllCards();
  const shuffled = [...cards].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(card => ({
    ...card,
    isReversed: Math.random() < CONFIG.REVERSE_PROBABILITY,
  }));
}

console.log('[tarot-data.js] 模块加载完成');
