// ============================================
// 星际塔罗师 - 主入口
// ============================================

console.log('[main] 应用启动');

// 导入模块
import { TarotScene } from './three-scene.js';
import { StarRing } from './star-ring.js';
import { loadTarotData, getAllCards } from './tarot-data.js';
import { GestureController } from './gesture.js';
import { CardAnimator } from './card-animations.js';
import { DebugControls } from './debug-controls.js';

// 调试模式开关 - 设为 true 启用相机和卡槽调整
const DEBUG_MODE = false;

// 应用状态
let scene = null;
let starRing = null;
let allCards = [];
let gestureController = null;
let cardAnimator = null;

// 选牌状态
let selectedCards = [];
let isGrabbing = false; // 防止重复抓取
let isPalmActivated = false; // 必须先张开手掌才能握拳抓取
let palmResetTimer = null; // 延迟重置计时器
let pendingCard = null; // 握拳时待抓取的牌
const MAX_CARDS = 3;

// DOM 元素
const mainMenu = document.getElementById('main-menu');
const readingPage = document.getElementById('reading-page');
const btnReading = document.getElementById('btn-reading');
const btnIntuition = document.getElementById('btn-intuition');
const btnBack = document.getElementById('btn-back');

// 初始化数据
async function initData() {
  try {
    await loadTarotData();
    allCards = getAllCards();
    console.log('[main] 牌数据加载完成，共', allCards.length, '张');
  } catch (e) {
    console.error('[main] 牌数据加载失败:', e);
  }
}

// 初始化 3D 场景
async function initScene() {
  if (scene) return; // 已初始化

  const container = document.getElementById('canvas-container');
  scene = new TarotScene(container);

  starRing = new StarRing(allCards);
  await new Promise(resolve => setTimeout(resolve, 200));

  scene.setStarRing(starRing);
  scene.start();

  // 初始化动画控制器
  cardAnimator = new CardAnimator(scene.scene, scene.camera);

  // 调试模式：启用相机和卡槽调整
  if (DEBUG_MODE) {
    const debugControls = new DebugControls(scene.camera, scene.renderer, cardAnimator);
    scene.setDebugControls(debugControls);
    console.log('[main] 调试模式已启用');
  }

  console.log('[main] 3D场景初始化完成');
}

// 初始化手势控制
async function initGesture() {
  if (gestureController) return;

  gestureController = new GestureController({
    onCameraReady: () => {
      console.log('[main] 摄像头就绪');
      updateStepIndicator(1, 'active');
    },
    onCameraError: (error) => {
      console.warn('[main] 摄像头不可用，降级到鼠标模式:', error.message);
      // TODO: 启用鼠标交互模式
    },
    onPalmOpen: () => {
      // 张开手掌 → 激活抓取资格，星环加速
      if (starRing && selectedCards.length < MAX_CARDS) {
        // 清除重置计时器
        if (palmResetTimer) {
          clearTimeout(palmResetTimer);
          palmResetTimer = null;
        }
        isPalmActivated = true;
        starRing.setSpeed('fast');
        updateStepIndicator(2, 'active');
        console.log('[main] 手掌张开，已激活抓取资格');
      }
    },
    onFistStart: () => {
      // 开始握拳 → 先从星环移除牌，再开始粒子汇聚
      // 清除重置计时器（从手掌到握拳的过渡）
      if (palmResetTimer) {
        clearTimeout(palmResetTimer);
        palmResetTimer = null;
      }
      console.log('[main] 开始握拳, isPalmActivated:', isPalmActivated);
      if (starRing && cardAnimator && selectedCards.length < MAX_CARDS && !isGrabbing && isPalmActivated) {
        // 先从星环获取并移除最近的牌
        const cameraPos = scene.camera.position;
        const closestCard = starRing.getClosestCard(cameraPos);
        if (closestCard) {
          pendingCard = {
            cardData: closestCard.userData.cardData,
            isReversed: closestCard.userData.isReversed
          };
          starRing.removeCard(closestCard);
          console.log('[main] 从星环移除牌:', pendingCard.cardData.nameCN);
        }
        // 然后开始粒子汇聚
        cardAnimator.startParticleConverge();
        updateStepIndicator(3, 'active');
      }
    },
    onFistHold: () => {
      // 握拳持续1.5秒 → 只有先张开手掌才能抓取牌
      if (starRing && selectedCards.length < MAX_CARDS && isPalmActivated) {
        grabCard();
      }
    },
    onFistRelease: () => {
      // 松开拳头 → 如果还没完成抓取，取消粒子
      console.log('[main] 松开拳头');
      if (cardAnimator && !isGrabbing) {
        cardAnimator.cancelParticleConverge();
        // 清空待抓取的牌（牌已从星环移除，放弃抓取）
        if (pendingCard) {
          console.log('[main] 放弃抓取:', pendingCard.cardData.nameCN);
          pendingCard = null;
        }
        if (selectedCards.length < MAX_CARDS) {
          updateStepIndicator(2, 'active');
        }
      }
    },
    onGestureChange: (gesture) => {
      // 手势变化
      if (gesture === 'none' && starRing) {
        starRing.setSpeed('normal');
        // 延迟重置抓取资格（防止手掌到握拳过渡时误重置）
        if (!palmResetTimer) {
          palmResetTimer = setTimeout(() => {
            isPalmActivated = false;
            palmResetTimer = null;
            console.log('[main] 手势消失，重置抓取资格');
          }, 800); // 800ms 延迟
        }
      } else if (gesture === 'palm' || gesture === 'fist') {
        // 检测到有效手势，取消重置
        if (palmResetTimer) {
          clearTimeout(palmResetTimer);
          palmResetTimer = null;
        }
      }
      if (gesture !== 'palm' && gesture !== 'fist') {
        updateStepIndicator(1, 'active');
      }
    }
  });

  const success = await gestureController.init();
  if (!success) {
    console.warn('[main] 手势识别初始化失败');
  }
}

// 抓取牌（使用 pendingCard，牌已在 onFistStart 时从星环移除）
async function grabCard() {
  if (!starRing || !scene || !cardAnimator) return;
  if (selectedCards.length >= MAX_CARDS) return;
  if (isGrabbing) return; // 防止重复抓取
  if (!pendingCard) return; // 没有待抓取的牌

  isGrabbing = true;

  const cardData = pendingCard.cardData;
  const isReversed = pendingCard.isReversed;
  pendingCard = null; // 清空待抓取的牌

  // 更新步骤指示器
  updateStepIndicator(3, 'active');

  console.log('[main] 抓取牌:', cardData.nameCN, isReversed ? '(逆位)' : '(正位)');

  // 计算卡槽索引
  const slotIndex = selectedCards.length + 1;

  // 播放抓牌动画序列
  await cardAnimator.playGrabAnimation(cardData, isReversed, slotIndex, () => {
    // 动画完成后更新 3D 卡槽，显示实际塔罗牌
    cardAnimator.updateSlot(slotIndex, cardData, isReversed);
  });

  // 添加到已选列表
  selectedCards.push({
    card: cardData,
    isReversed: isReversed
  });

  // 检查是否选满
  if (selectedCards.length < MAX_CARDS) {
    updateStepIndicator(1, 'active');
    starRing.setSpeed('normal');
    // 重置抓取资格，需要重新张开手掌
    isPalmActivated = false;
  } else {
    // 选满3张，激活揭示按钮并关闭摄像头
    activateRevealButton();
    if (gestureController) {
      gestureController.stop();
      console.log('[main] 抽牌完成，已关闭摄像头');
    }
  }

  isGrabbing = false;
}

// 更新步骤指示器
function updateStepIndicator(step, status) {
  const steps = [
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3')
  ];

  steps.forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i + 1 < step) {
      el.classList.add('completed');
    } else if (i + 1 === step) {
      el.classList.add(status);
    }
  });
}

// 激活揭示命运按钮
function activateRevealButton() {
  const btn = document.getElementById('btn-next');
  btn.classList.add('active');
  console.log('[main] 可以揭示命运了！');
}

// 显示占卜页面
async function showReadingPage() {
  mainMenu.classList.add('hidden');
  readingPage.style.display = 'block';

  // 重置状态
  selectedCards = [];
  pendingCard = null;
  isPalmActivated = false;
  resetUI();

  // 首次进入时初始化场景
  const isFirstInit = !scene;
  await initScene();

  // 重建星环（仅在非首次进入时，恢复被移除的卡牌）
  if (starRing && !isFirstInit) {
    starRing.rebuild();
  }

  // 初始化手势识别
  await initGesture();
}

// 重置 UI
function resetUI() {
  // 重置 3D 卡槽
  if (cardAnimator) {
    cardAnimator.resetSlots();
  }
  // 重置按钮
  const btn = document.getElementById('btn-next');
  btn.classList.remove('active');
  // 重置步骤
  updateStepIndicator(1, 'active');
}

// 返回主菜单
function showMainMenu() {
  readingPage.style.display = 'none';
  mainMenu.classList.remove('hidden');

  // 停止手势识别
  if (gestureController) {
    gestureController.stop();
  }
}

// 直觉练习（待实现）
function showIntuitionPage() {
  alert('直觉练习功能开发中...');
}

// 绑定事件
btnReading.addEventListener('click', showReadingPage);
btnIntuition.addEventListener('click', showIntuitionPage);
btnBack.addEventListener('click', showMainMenu);

// 启动应用
initData();

console.log('[main] 事件绑定完成');
