// ============================================
// 应用状态管理
// ============================================

// 应用阶段枚举
export const AppPhase = {
  IDLE: 'idle',           // 首页
  QUESTION: 'question',   // 输入问题
  SELECTING: 'selecting', // 选牌
  READING: 'reading',     // 解读中
  RESULT: 'result',       // 显示结果
  INTUITION: 'intuition', // 直觉练习
};

// 应用状态
class State {
  constructor() {
    this.phase = AppPhase.IDLE;
    this.question = '';
    this.selectedCards = [];
    this.readingResult = '';
    this.error = null;
    this.intuitionCards = [];
    this.intuitionFlipped = [];
    this.subscribers = [];
  }

  // 订阅状态变化
  subscribe(callback) {
    this.subscribers.push(callback);
  }

  // 通知订阅者
  notify() {
    const state = this.getState();
    this.subscribers.forEach(cb => cb(state));
  }

  // 获取完整状态
  getState() {
    return {
      phase: this.phase,
      question: this.question,
      selectedCards: this.selectedCards,
      readingResult: this.readingResult,
      error: this.error,
    };
  }

  // 阶段操作
  getPhase() { return this.phase; }
  setPhase(phase) {
    this.phase = phase;
    this.notify();
  }

  // 问题操作
  getQuestion() { return this.question; }
  setQuestion(q) { this.question = q; }

  // 选牌操作
  getSelectedCards() { return this.selectedCards; }
  addSelectedCard(card) {
    this.selectedCards.push(card);
  }
  clearSelectedCards() {
    this.selectedCards = [];
  }

  // 解读结果
  getReadingResult() { return this.readingResult; }
  setReadingResult(result) { this.readingResult = result; }
  appendReadingResult(text) { this.readingResult += text; }
  clearReadingResult() { this.readingResult = ''; }

  // 错误处理
  setError(err) { this.error = err; }
  clearError() { this.error = null; }

  // 直觉练习
  getIntuitionCards() { return this.intuitionCards; }
  setIntuitionCards(cards) {
    this.intuitionCards = cards;
    this.intuitionFlipped = cards.map(() => false);
  }
  isIntuitionCardFlipped(index) { return this.intuitionFlipped[index]; }
  flipIntuitionCard(index) { this.intuitionFlipped[index] = true; }
  areAllIntuitionCardsFlipped() {
    return this.intuitionFlipped.every(f => f);
  }
}

// 导出单例
export const AppState = new State();

console.log('[state.js] 状态管理加载完成');
