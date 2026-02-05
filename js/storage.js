// ============================================
// Storage Service - LocalStorage 封装
// ============================================

const STORAGE_KEYS = {
  SETTINGS: 'tarot_settings',
  INTUITION: 'tarot_intuition_records',
  HISTORY: 'tarot_reading_history',
  USAGE_COUNT: 'tarot_usage_count',
  REDEEMED_CODES: 'tarot_redeemed_codes'
};

// 默认设置
const DEFAULT_SETTINGS = {
  aiProvider: 'gemini',  // 'claude' or 'gemini'
  apiKey: '',
  apiKeyVerified: false,  // API Key 是否已验证
  includeIntuition: true
};

export const StorageService = {
  // 设置管理
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : { ...DEFAULT_SETTINGS };
    } catch (error) {
      console.error('[storage] 加载设置失败:', error);
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.error('[storage] 保存设置失败:', error);
      return false;
    }
  },

  // 检查 API 是否已配置并验证
  isAPIConfigured() {
    const settings = this.getSettings();
    return settings.apiKey && settings.apiKeyVerified;
  },

  // 直觉记录管理
  getIntuitionRecords() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.INTUITION);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[storage] 加载直觉记录失败:', error);
      return [];
    }
  },

  addIntuitionRecord(record) {
    try {
      const records = this.getIntuitionRecords();
      const newRecord = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        ...record
      };
      records.push(newRecord);
      localStorage.setItem(STORAGE_KEYS.INTUITION, JSON.stringify(records));
      return newRecord;
    } catch (error) {
      console.error('[storage] 添加直觉记录失败:', error);
      return null;
    }
  },

  getRecordsByCardIds(cardIds) {
    const records = this.getIntuitionRecords();
    return cardIds.flatMap(cardId =>
      records
        .filter(r => r.cardId === cardId)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 2) // 每张牌最多2条记录
    );
  },

  // 占卜历史管理
  getReadingHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[storage] 加载历史记录失败:', error);
      return [];
    }
  },

  addReadingHistory(reading) {
    try {
      const history = this.getReadingHistory();
      const newReading = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        ...reading
      };
      history.unshift(newReading);
      // 只保留最近50条
      if (history.length > 50) {
        history.pop();
      }
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
      return newReading;
    } catch (error) {
      console.error('[storage] 添加历史记录失败:', error);
      return null;
    }
  },

  // ============================================
  // 使用次数管理（内置 Key 限次）
  // ============================================

  // 获取已使用次数
  getUsageCount() {
    try {
      const count = localStorage.getItem(STORAGE_KEYS.USAGE_COUNT);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      return 0;
    }
  },

  // 使用次数 +1
  incrementUsageCount() {
    try {
      const count = this.getUsageCount() + 1;
      localStorage.setItem(STORAGE_KEYS.USAGE_COUNT, count.toString());
      return count;
    } catch (error) {
      console.error('[storage] 更新使用次数失败:', error);
      return 0;
    }
  },

  // 获取已兑换的码列表
  getRedeemedCodes() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.REDEEMED_CODES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  },

  // 兑换码：检查是否已用过，成功则记录并增加次数
  redeemCode(code, addUses) {
    const redeemed = this.getRedeemedCodes();
    if (redeemed.includes(code)) {
      return { success: false, reason: '此兑换码已使用过' };
    }
    redeemed.push(code);
    localStorage.setItem(STORAGE_KEYS.REDEEMED_CODES, JSON.stringify(redeemed));
    // 增加总可用次数（存为负数偏移使用次数）
    const currentCount = this.getUsageCount();
    const newCount = currentCount - addUses; // 减少计数 = 增加可用次数
    localStorage.setItem(STORAGE_KEYS.USAGE_COUNT, newCount.toString());
    return { success: true };
  },

  // 获取剩余可用次数
  getRemainingUses(maxFree) {
    return maxFree - this.getUsageCount();
  },

  // 清除所有数据
  clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEYS.SETTINGS);
      localStorage.removeItem(STORAGE_KEYS.INTUITION);
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
      return true;
    } catch (error) {
      console.error('[storage] 清除数据失败:', error);
      return false;
    }
  }
};

console.log('[storage.js] 模块加载完成');
