// ============================================
// 星际塔罗师 - 主入口
// ============================================

console.log('[main] 应用启动');

// 导入模块
import { TarotScene } from './three-scene.js';
import { StarRing } from './star-ring.js';
import { loadTarotData, getAllCards, getCardImageUrl } from './tarot-data.js';
import { GestureController } from './gesture.js';
import { CardAnimator } from './card-animations.js';
import { DebugControls } from './debug-controls.js';
import { StorageService } from './storage.js';
import { AIService } from './ai-service.js';
import { MouseController } from './mouse-controller.js';

// 调试模式开关 - 设为 true 启用相机和卡槽调整
const DEBUG_MODE = false;

// 应用状态
let scene = null;
let starRing = null;
let allCards = [];
let gestureController = null;
let cardAnimator = null;
let mouseController = null;
let isMouseMode = false;  // 是否使用鼠标模式

// 选牌状态
let selectedCards = [];
let isGrabbing = false; // 防止重复抓取
let isPalmActivated = false; // 必须先张开手掌才能握拳抓取
let palmResetTimer = null; // 延迟重置计时器
let palmHoldTimer = null; // 手掌持续计时器（需持续300ms才激活）
let pendingCard = null; // 握拳时待抓取的牌
const MAX_CARDS = 3;
const PALM_HOLD_DURATION = 300; // 手掌需持续300ms才能激活抓取资格

// 用户输入的问题
let userQuestion = '';

// 对话历史（用于追问上下文）
let conversationHistory = [];

// DOM 元素
const mainMenu = document.getElementById('main-menu');
const questionPage = document.getElementById('question-page');
const readingPage = document.getElementById('reading-page');
const btnReading = document.getElementById('btn-reading');
const questionInput = document.getElementById('question-input');
const btnStartReading = document.getElementById('btn-start-reading');
const btnBackToMenu = document.getElementById('btn-back-to-menu');
const useIntuitionCheckbox = document.getElementById('use-intuition');

// 是否注入直觉数据
let useIntuition = true;
const btnIntuition = document.getElementById('btn-intuition');
const btnBack = document.getElementById('btn-back');
const shuffleHint = document.getElementById('shuffle-hint');
const shuffleStar = document.getElementById('shuffle-star');
const shuffleText = document.getElementById('shuffle-text');
const shuffleComplete = document.getElementById('shuffle-complete');
const gestureGuide = document.getElementById('gesture-guide');
const guideStep1 = document.getElementById('guide-step-1');
const guideStep2 = document.getElementById('guide-step-2');
const cameraFallback = document.getElementById('camera-fallback');
const fallbackTitle = document.getElementById('fallback-title');
const btnEnableCamera = document.getElementById('btn-enable-camera');
const btnUseMouse = document.getElementById('btn-use-mouse');
const grabCancelHint = document.getElementById('grab-cancel-hint');

// 设置相关 DOM 元素
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const aiProviderSelect = document.getElementById('ai-provider');
const apiKeyInput = document.getElementById('api-key-input');
const verifyBtn = document.getElementById('verify-btn');
const apiStatus = document.getElementById('api-status');
const hintGemini = document.getElementById('hint-gemini');
const hintClaude = document.getElementById('hint-claude');
const settingsSaveBtn = document.getElementById('settings-save');
const apiHintPanel = document.getElementById('api-hint-panel');
const openSettingsLink = document.getElementById('open-settings-link');
const btnNext = document.getElementById('btn-next');

// 解读结果页面 DOM 元素
const resultPage = document.getElementById('result-page');
const btnBackResult = document.getElementById('btn-back-result');
const resultQuestion = document.getElementById('result-question');
const resultLoading = document.getElementById('result-loading');
const resultError = document.getElementById('result-error');
const errorMessage = document.getElementById('error-message');
const btnRetry = document.getElementById('btn-retry');
const resultReading = document.getElementById('result-reading');
const followupInput = document.getElementById('followup-input');
const btnFollowup = document.getElementById('btn-followup');
const btnResultHome = document.getElementById('btn-result-home');

// 直觉练习页面 DOM 元素
const intuitionPage = document.getElementById('intuition-page');
const btnBackIntuition = document.getElementById('btn-back-intuition');
const intuitionCard1 = document.getElementById('intuition-card-1');
const intuitionCard2 = document.getElementById('intuition-card-2');
const intuitionHint = document.querySelector('.intuition-hint');
const intuitionSave = document.getElementById('intuition-save');
const btnSaveFeelings = document.getElementById('btn-save-feelings');
const btnViewHistory = document.getElementById('btn-view-history');

// 直觉历史记录页面 DOM 元素
const historyPage = document.getElementById('intuition-history-page');
const btnBackHistory = document.getElementById('btn-back-history');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const btnStartPractice = document.getElementById('btn-start-practice');

// 直觉练习状态
let intuitionCards = []; // 当前练习的两张牌数据

// AI 服务
const aiService = new AIService();

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
  await starRing.ready; // 等待星环初始化完成（紫色粒子创建）

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
  // 如果已存在，重新初始化摄像头
  if (gestureController) {
    const success = await gestureController.init();
    if (!success) {
      console.warn('[main] 手势识别重新初始化失败');
    }
    return;
  }

  gestureController = new GestureController({
    onCameraReady: () => {
      console.log('[main] 摄像头就绪');
      updateStepIndicator(1, 'active');
      // 隐藏选择界面，显示手势引导
      cameraFallback.classList.remove('visible');
      gestureGuide.classList.add('visible');
    },
    onCameraError: (error) => {
      console.warn('[main] 摄像头不可用:', error.message);
      // 显示失败提示，只保留鼠标按钮
      cameraFallback.classList.add('visible');
      fallbackTitle.textContent = '摄像头开启失败';
      btnEnableCamera.style.display = 'none';
      btnUseMouse.textContent = '以鼠标触碰命运之牌';
    },
    onPalmOpen: () => {
      // 张开手掌 → 星环加速，但需持续300ms才激活抓取资格
      if (starRing && selectedCards.length < MAX_CARDS) {
        // 清除重置计时器
        if (palmResetTimer) {
          clearTimeout(palmResetTimer);
          palmResetTimer = null;
        }
        // 星环立即加速
        starRing.setSpeed('fast');

        // 如果已经激活，无需再等待
        if (isPalmActivated) {
          return;
        }

        // 开始300ms计时，持续张开才激活
        if (!palmHoldTimer) {
          palmHoldTimer = setTimeout(() => {
            isPalmActivated = true;
            palmHoldTimer = null;
            updateStepIndicator(2, 'active');
            // 切换手势引导：第一步取消发光，第二步发光
            guideStep1.classList.remove('active');
            guideStep2.classList.add('active');
            console.log('[main] 手掌持续300ms，已激活抓取资格');
          }, PALM_HOLD_DURATION);
        }
      }
    },
    onFistStart: () => {
      // 开始握拳 → 星环切换到握拳速度（30秒/圈），先从星环移除牌，再开始粒子汇聚
      if (starRing) {
        starRing.setSpeed('fist');
      }
      // 清除计时器（从手掌到握拳的过渡）
      if (palmResetTimer) {
        clearTimeout(palmResetTimer);
        palmResetTimer = null;
      }
      if (palmHoldTimer) {
        clearTimeout(palmHoldTimer);
        palmHoldTimer = null;
      }
      console.log('[main] 开始握拳, isPalmActivated:', isPalmActivated);
      if (starRing && cardAnimator && selectedCards.length < MAX_CARDS && !isGrabbing && isPalmActivated) {
        // 先从星环获取并移除最近的牌
        const cameraPos = scene.camera.position;
        const closestCard = starRing.getClosestCard(cameraPos);
        if (closestCard) {
          pendingCard = {
            mesh: closestCard,  // 保存mesh引用，用于取消时恢复
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
      // 握拳持续1秒 → 只有先张开手掌才能抓取牌
      if (starRing && selectedCards.length < MAX_CARDS && isPalmActivated) {
        grabCard();
      }
    },
    onFistRelease: () => {
      // 松开拳头 → 如果还没完成抓取，取消粒子并恢复牌
      console.log('[main] 松开拳头, isGrabbing:', isGrabbing, 'pendingCard:', !!pendingCard);
      if (cardAnimator && !isGrabbing) {
        cardAnimator.cancelParticleConverge();
        // 重置握拳计时器，防止快速再握拳时计时累积
        if (gestureController) {
          gestureController.resetFistTimer();
        }
        // 恢复待抓取的牌到星环
        if (pendingCard && starRing) {
          console.log('[main] 取消抓取，恢复牌:', pendingCard.cardData.nameCN, 'mesh:', !!pendingCard.mesh);
          starRing.restoreCard(pendingCard.mesh);
          pendingCard = null;
          // 显示取消提示
          showGrabCancelHint();
          // 取消后完全重置流程：必须重新张开手掌
          isPalmActivated = false;
          guideStep1.classList.add('active');
          guideStep2.classList.remove('active');
          console.log('[main] 取消抓取，重置为第一步：张开手掌');
        }
        if (selectedCards.length < MAX_CARDS) {
          updateStepIndicator(1, 'active');
        }
      }
    },
    onGestureChange: (gesture) => {
      // 手势变化
      if (gesture === 'none' && starRing) {
        starRing.setSpeed('normal');
        // 取消手掌持续计时器
        if (palmHoldTimer) {
          clearTimeout(palmHoldTimer);
          palmHoldTimer = null;
        }
        // 延迟重置抓取资格（防止手掌到握拳过渡时误重置）
        if (!palmResetTimer) {
          palmResetTimer = setTimeout(() => {
            isPalmActivated = false;
            palmResetTimer = null;
            // 重置手势引导到第一步（与 isPalmActivated 同步）
            guideStep1.classList.add('active');
            guideStep2.classList.remove('active');
            console.log('[main] 手势消失，重置抓取资格和引导');
          }, 800); // 800ms 延迟
        }
        // 只在未激活时立即重置引导（已激活则等待800ms计时器）
        if (!isPalmActivated) {
          guideStep1.classList.add('active');
          guideStep2.classList.remove('active');
        }
      } else if (gesture === 'palm' || gesture === 'fist') {
        // 检测到有效手势，取消重置
        if (palmResetTimer) {
          clearTimeout(palmResetTimer);
          palmResetTimer = null;
        }
      }
      // 手势不是手掌且未激活时，保持第一步
      if (gesture !== 'palm' && !isPalmActivated) {
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

  // 隐藏手势引导（用户已成功抓取）
  gestureGuide.classList.remove('visible');

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
    // 重新显示手势引导，重置到第一步
    guideStep1.classList.add('active');
    guideStep2.classList.remove('active');
    gestureGuide.classList.add('visible');
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

// 显示取消抓牌提示
function showGrabCancelHint() {
  grabCancelHint.classList.add('visible');
  setTimeout(() => {
    grabCancelHint.classList.remove('visible');
  }, 1500);
}

// ============================================
// 鼠标模式
// ============================================

// 启用鼠标模式
function enableMouseMode() {
  isMouseMode = true;
  console.log('[main] 启用鼠标模式, scene:', !!scene, 'starRing:', !!starRing);

  // 隐藏手势引导
  gestureGuide.classList.remove('visible');

  // 创建鼠标控制器
  if (!mouseController && scene && starRing) {
    console.log('[main] 创建鼠标控制器');
    mouseController = new MouseController({
      scene: scene,
      starRing: starRing,
      container: document.getElementById('canvas-container'),
      onCardSelect: onMouseCardSelect
    });

    // 注册更新回调（处理惯性）
    scene.addUpdateCallback((delta) => {
      if (mouseController) {
        mouseController.update(delta);
      }
    });
  } else if (!mouseController) {
    console.warn('[main] 无法创建鼠标控制器: scene=', !!scene, 'starRing=', !!starRing);
  }

  // 启用鼠标控制
  if (mouseController) {
    console.log('[main] 启用鼠标控制器');
    mouseController.enable();
  } else {
    console.warn('[main] mouseController 不存在，无法启用');
  }

  // 显示鼠标模式提示（可选）
  showMouseModeHint();
}

// 禁用鼠标模式
function disableMouseMode() {
  isMouseMode = false;
  if (mouseController) {
    mouseController.disable();
  }
}

// 鼠标模式下点击选牌回调
async function onMouseCardSelect(cardMesh) {
  if (!starRing || !scene || !cardAnimator) return;
  if (selectedCards.length >= MAX_CARDS) return;
  if (isGrabbing) return;

  isGrabbing = true;

  const cardData = cardMesh.userData.cardData;
  const isReversed = cardMesh.userData.isReversed;

  // 从星环移除这张牌
  starRing.removeCard(cardMesh);

  console.log('[main] 鼠标选牌:', cardData.nameCN, isReversed ? '(逆位)' : '(正位)');

  // 计算卡槽索引
  const slotIndex = selectedCards.length + 1;

  // 开始粒子汇聚动画
  cardAnimator.startParticleConverge();

  // 短暂延迟后播放抓牌动画
  await new Promise(resolve => setTimeout(resolve, 300));

  // 播放抓牌动画序列
  await cardAnimator.playGrabAnimation(cardData, isReversed, slotIndex, () => {
    cardAnimator.updateSlot(slotIndex, cardData, isReversed);
  });

  // 添加到已选列表
  selectedCards.push({
    card: cardData,
    isReversed: isReversed
  });

  // 检查是否选满
  if (selectedCards.length < MAX_CARDS) {
    starRing.setSpeed('normal');
  } else {
    // 选满3张，激活揭示按钮
    activateRevealButton();
    disableMouseMode();
    console.log('[main] 鼠标模式抽牌完成');
  }

  isGrabbing = false;
}

// 显示鼠标模式提示
function showMouseModeHint() {
  // 创建容器（两个框水平并列）
  const container = document.createElement('div');
  container.id = 'mouse-mode-hint';
  container.style.cssText = `
    position: fixed;
    bottom: 360px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 120px;
    z-index: 100;
    animation: fadeInUp 0.5s ease;
  `;

  // 通用框样式
  const boxStyle = `
    background: rgba(255, 255, 255, 0.9);
    padding: 12px 24px;
    border-radius: 20px;
    border: none;
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--text-main);
    box-shadow: 0 0 15px rgba(123, 94, 167, 0.4);
    white-space: nowrap;
  `;

  container.innerHTML = `
    <div style="${boxStyle}">按住左键拖拽 · 转动命运之轮</div>
    <div style="${boxStyle}">点击牌面 · 选择你的指引</div>
  `;

  document.body.appendChild(container);

  // 3秒后淡出
  setTimeout(() => {
    container.style.transition = 'opacity 0.5s ease';
    container.style.opacity = '0';
    setTimeout(() => container.remove(), 500);
  }, 3000);
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

  // 显示洗牌提示
  shuffleHint.classList.add('visible');

  // 首次进入时初始化场景
  const isFirstInit = !scene;
  await initScene();

  // 重建星环（仅在非首次进入时，恢复被移除的卡牌）
  if (starRing && !isFirstInit) {
    await starRing.rebuild();
    // 更新鼠标控制器的星环引用
    if (mouseController) {
      mouseController.setStarRing(starRing);
    }
  }

  // 洗牌动画：紫色粒子旋转一会，然后分散显示牌
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 第一段文字和星星开始消失，同时牌动画开始
  shuffleText.classList.add('fade-out');
  shuffleStar.classList.add('fade-out');

  if (starRing) {
    await starRing.completeShuffleAnimation();
  }

  // 牌出现后，停顿50ms再出现第二段文字和星星（金色）
  await new Promise(resolve => setTimeout(resolve, 50));
  shuffleStar.classList.remove('fade-out');
  shuffleStar.classList.add('phase-2');
  shuffleComplete.classList.add('visible');

  // 停留2s后隐藏整个提示
  await new Promise(resolve => setTimeout(resolve, 2000));
  shuffleHint.classList.remove('visible');

  // 牌显示后，显示抓牌方式选择界面
  cameraFallback.classList.add('visible');
}

// 重置 UI
function resetUI() {
  // 重置 3D 卡槽和粒子汇聚
  if (cardAnimator) {
    cardAnimator.cancelParticleConverge(); // 取消残留的粒子汇聚
    cardAnimator.resetSlots();
  }
  // 禁用鼠标模式
  disableMouseMode();
  // 清理手势相关计时器
  if (palmHoldTimer) {
    clearTimeout(palmHoldTimer);
    palmHoldTimer = null;
  }
  if (palmResetTimer) {
    clearTimeout(palmResetTimer);
    palmResetTimer = null;
  }
  // 重置按钮
  const btn = document.getElementById('btn-next');
  btn.classList.remove('active');
  // 重置步骤
  updateStepIndicator(1, 'active');
  // 隐藏引导提示
  shuffleHint.classList.remove('visible');
  gestureGuide.classList.remove('visible');
  cameraFallback.classList.remove('visible');
  // 重置抓牌方式选择界面
  fallbackTitle.textContent = '请选择抓牌方式';
  btnEnableCamera.style.display = '';
  btnEnableCamera.textContent = '开启摄像头 · 手势抓牌';
  btnUseMouse.textContent = '鼠标点击 · 触碰命运';
  // 重置洗牌提示状态
  shuffleText.classList.remove('fade-out');
  shuffleStar.classList.remove('fade-out');
  shuffleStar.classList.remove('phase-2');
  shuffleComplete.classList.remove('visible');
  // 重置手势引导状态
  guideStep1.classList.add('active');
  guideStep2.classList.remove('active');
}

// 返回主菜单
function showMainMenu() {
  readingPage.style.display = 'none';
  mainMenu.classList.remove('hidden');

  // 停止手势识别
  if (gestureController) {
    gestureController.stop();
  }

  // 清理残留的粒子汇聚
  if (cardAnimator) {
    cardAnimator.cancelParticleConverge();
  }

  // 重置用户问题
  userQuestion = '';
}

// ============================================
// 直觉练习功能
// ============================================

// 显示直觉练习页面
function showIntuitionPage() {
  mainMenu.classList.add('hidden');
  intuitionPage.style.display = 'flex';

  // 初始化练习
  setupIntuitionPractice();

  console.log('[main] 进入直觉练习页面');
}

// 初始化直觉练习
function setupIntuitionPractice() {
  // 确保牌数据已加载
  if (!allCards || allCards.length === 0) {
    console.error('[intuition] 牌数据未加载');
    return;
  }

  // 随机抽取 2 张不重复的牌
  const shuffled = [...allCards].sort(() => Math.random() - 0.5);
  intuitionCards = shuffled.slice(0, 2).map(card => ({
    ...card,
    isReversed: Math.random() < 0.5,  // 50% 逆位概率
    isFlipped: false,
    feelingSaved: false
  }));

  console.log('[intuition] 抽取牌:', intuitionCards.map(c => c.nameCN));

  // 重置卡片 UI
  const cardElements = [intuitionCard1, intuitionCard2];
  cardElements.forEach((cardEl, index) => {
    const cardData = intuitionCards[index];

    // 重置翻转状态
    cardEl.classList.remove('flipped', 'reversed');

    // 设置牌面图片和名称
    const cardImage = cardEl.querySelector('.card-image');
    const cardName = cardEl.querySelector('.card-name');
    cardImage.src = getCardImageUrl(cardData);
    cardImage.alt = cardData.nameCN;
    cardName.textContent = cardData.isReversed ? `${cardData.nameCN} (逆位)` : cardData.nameCN;

    // 隐藏感受输入区域
    const feelingArea = cardEl.querySelector('.card-feeling-area');
    feelingArea.classList.add('hidden');

    // 重置输入框
    const feelingInput = cardEl.querySelector('.feeling-input');
    feelingInput.value = '';
    feelingInput.disabled = false;
  });

  // 隐藏保存按钮
  intuitionSave.classList.add('hidden');
  btnSaveFeelings.textContent = '保存感受';
  btnSaveFeelings.disabled = false;

  // 显示提示
  intuitionHint.style.display = '';
  intuitionHint.textContent = '点击牌背翻开塔罗牌';
}

// 翻转卡片
function flipIntuitionCard(cardEl, cardIndex) {
  const cardData = intuitionCards[cardIndex];

  // 已翻转则忽略
  if (cardData.isFlipped) return;

  cardData.isFlipped = true;

  // 添加翻转动画类
  cardEl.classList.add('flipped');

  // 如果是逆位，添加逆位类
  if (cardData.isReversed) {
    cardEl.classList.add('reversed');
  }

  // 显示感受输入区域
  setTimeout(() => {
    const feelingArea = cardEl.querySelector('.card-feeling-area');
    feelingArea.classList.remove('hidden');
  }, 600); // 等待翻转动画完成

  // 更新提示
  updateIntuitionHint();

  console.log('[intuition] 翻开牌:', cardData.nameCN, cardData.isReversed ? '(逆位)' : '');
}

// 更新提示文字
function updateIntuitionHint() {
  const flippedCount = intuitionCards.filter(c => c.isFlipped).length;

  if (flippedCount === 0) {
    intuitionHint.textContent = '点击牌背翻开塔罗牌';
    intuitionSave.classList.add('hidden');
  } else if (flippedCount === 1) {
    intuitionHint.textContent = '再翻开一张牌';
    intuitionSave.classList.add('hidden');
  } else {
    // 两张牌都翻开后隐藏提示，显示保存按钮
    intuitionHint.style.display = 'none';
    intuitionSave.classList.remove('hidden');
  }
}

// 保存所有感受
function saveAllFeelings() {
  const cardElements = [intuitionCard1, intuitionCard2];
  let savedCount = 0;

  cardElements.forEach((cardEl, index) => {
    const cardData = intuitionCards[index];
    const feelingInput = cardEl.querySelector('.feeling-input');
    const feeling = feelingInput.value.trim();

    // 跳过已保存或无输入的
    if (cardData.feelingSaved || !feeling) return;

    // 保存到 LocalStorage
    const record = StorageService.addIntuitionRecord({
      cardId: cardData.id,
      cardName: cardData.nameCN,
      cardImage: getCardImageUrl(cardData),
      isReversed: cardData.isReversed,
      feeling: feeling
    });

    if (record) {
      cardData.feelingSaved = true;
      feelingInput.disabled = true;
      savedCount++;
      console.log('[intuition] 保存感受:', cardData.nameCN, feeling);
    }
  });

  if (savedCount > 0) {
    btnSaveFeelings.textContent = '已保存 ✓';
    btnSaveFeelings.disabled = true;
  }
}

// 从直觉练习返回主菜单
function hideIntuitionPage() {
  intuitionPage.style.display = 'none';
  mainMenu.classList.remove('hidden');
}

// 显示历史记录页面
function showHistoryPage() {
  intuitionPage.style.display = 'none';
  historyPage.style.display = 'flex';

  renderHistoryList();

  console.log('[main] 进入直觉历史记录页面');
}

// 渲染历史记录列表
function renderHistoryList() {
  const records = StorageService.getIntuitionRecords();

  if (records.length === 0) {
    historyList.style.display = 'none';
    historyEmpty.classList.remove('hidden');
    return;
  }

  historyList.style.display = '';
  historyEmpty.classList.add('hidden');

  // 按日期倒序排列
  const sortedRecords = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));

  // 渲染列表
  historyList.innerHTML = sortedRecords.map(record => {
    const date = new Date(record.date);
    const dateStr = date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="history-item">
        <img class="history-card-img ${record.isReversed ? 'reversed' : ''}"
             src="${record.cardImage}" alt="${record.cardName}">
        <div class="history-content">
          <div class="history-card-name">${record.cardName}${record.isReversed ? ' (逆位)' : ''}</div>
          <div class="history-feeling">${escapeHtml(record.feeling)}</div>
          <div class="history-date">${dateStr} ${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

// HTML 转义，防止 XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 从历史记录返回直觉练习
function hideHistoryPage() {
  historyPage.style.display = 'none';
  intuitionPage.style.display = 'flex';
}

// 从历史记录直接返回主菜单
function historyToMainMenu() {
  historyPage.style.display = 'none';
  mainMenu.classList.remove('hidden');
}

// 显示问题输入页面
function showQuestionPage() {
  mainMenu.classList.add('hidden');
  questionPage.style.display = 'flex';
  // 清空之前的输入
  questionInput.value = '';
  btnStartReading.disabled = true;
  // 聚焦输入框
  setTimeout(() => questionInput.focus(), 100);
}

// 从问题页面返回主菜单
function hideQuestionPage() {
  questionPage.style.display = 'none';
  mainMenu.classList.remove('hidden');
  // 清空问题（用户取消了这次占卜）
  userQuestion = '';
}

// 从问题页面进入星环页面
function startReadingFromQuestion() {
  // 保存用户输入的问题
  userQuestion = questionInput.value.trim();

  // 读取直觉数据开关状态
  useIntuition = useIntuitionCheckbox.checked;

  console.log('[main] 用户问题:', userQuestion, '| 注入直觉:', useIntuition);

  // 隐藏问题页面，显示占卜页面
  questionPage.style.display = 'none';
  showReadingPage();
}

// 绑定事件
btnReading.addEventListener('click', showQuestionPage);
btnIntuition.addEventListener('click', showIntuitionPage);
btnBack.addEventListener('click', showMainMenu);

// 直觉练习页面事件
btnBackIntuition.addEventListener('click', hideIntuitionPage);
btnViewHistory.addEventListener('click', showHistoryPage);

// 卡片点击翻转事件
intuitionCard1.addEventListener('click', (e) => {
  // 如果点击的是输入框或按钮，不触发翻转
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
  flipIntuitionCard(intuitionCard1, 0);
});

intuitionCard2.addEventListener('click', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
  flipIntuitionCard(intuitionCard2, 1);
});

// 感受保存按钮事件
btnSaveFeelings.addEventListener('click', saveAllFeelings);

// 历史记录页面事件
btnBackHistory.addEventListener('click', hideHistoryPage);
btnStartPractice.addEventListener('click', () => {
  historyPage.style.display = 'none';
  showIntuitionPage();
});

// 问题页面事件
btnBackToMenu.addEventListener('click', hideQuestionPage);
btnStartReading.addEventListener('click', startReadingFromQuestion);

// 问题输入监听 - 有内容才能继续
questionInput.addEventListener('input', () => {
  const hasContent = questionInput.value.trim().length > 0;
  btnStartReading.disabled = !hasContent;
});

// 摄像头选择按钮
btnEnableCamera.addEventListener('click', () => {
  // 立即隐藏选择界面，后台加载摄像头
  cameraFallback.classList.remove('visible');
  // 异步初始化（成功/失败在回调中处理）
  initGesture();
});

btnUseMouse.addEventListener('click', () => {
  cameraFallback.classList.remove('visible');
  enableMouseMode();
});

// ============================================
// 设置功能
// ============================================

// 打开设置弹窗
function openSettings() {
  // 加载当前设置
  const settings = StorageService.getSettings();
  aiProviderSelect.value = settings.aiProvider;
  apiKeyInput.value = settings.apiKey;

  // 更新提示链接
  updateApiHint(settings.aiProvider);

  // 更新验证按钮状态
  if (settings.apiKeyVerified && settings.apiKey) {
    verifyBtn.textContent = '已验证';
    verifyBtn.classList.add('verified');
    settingsSaveBtn.disabled = false;
    apiStatus.textContent = 'API Key 已验证通过';
    apiStatus.className = 'settings-status success';
  } else {
    verifyBtn.textContent = '验证';
    verifyBtn.classList.remove('verified');
    settingsSaveBtn.disabled = true;
    apiStatus.textContent = '';
  }

  settingsModal.classList.add('visible');
}

// 关闭设置弹窗
function closeSettings() {
  settingsModal.classList.remove('visible');
}

// 更新 API 提示链接
function updateApiHint(provider) {
  if (provider === 'gemini') {
    hintGemini.style.display = '';
    hintClaude.style.display = 'none';
  } else {
    hintGemini.style.display = 'none';
    hintClaude.style.display = '';
  }
}

// 验证 API Key
async function verifyApiKey() {
  const provider = aiProviderSelect.value;
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    apiStatus.textContent = '请输入 API Key';
    apiStatus.className = 'settings-status error';
    return;
  }

  // 更新 UI 状态
  verifyBtn.disabled = true;
  verifyBtn.textContent = '验证中...';
  verifyBtn.classList.add('verifying');
  verifyBtn.classList.remove('verified');
  apiStatus.textContent = '正在验证...';
  apiStatus.className = 'settings-status info';

  try {
    const result = await aiService.verifyAPIKey(provider, apiKey);

    if (result.success) {
      verifyBtn.textContent = '已验证';
      verifyBtn.classList.remove('verifying');
      verifyBtn.classList.add('verified');
      apiStatus.textContent = 'API Key 验证成功！';
      apiStatus.className = 'settings-status success';
      settingsSaveBtn.disabled = false;

      // 临时保存验证状态
      verifyBtn.dataset.verified = 'true';
    } else {
      verifyBtn.textContent = '验证';
      verifyBtn.classList.remove('verifying');
      apiStatus.textContent = result.error || '验证失败，请检查 API Key';
      apiStatus.className = 'settings-status error';
      settingsSaveBtn.disabled = true;
      verifyBtn.dataset.verified = 'false';
    }
  } catch (error) {
    verifyBtn.textContent = '验证';
    verifyBtn.classList.remove('verifying');
    apiStatus.textContent = '网络错误，请重试';
    apiStatus.className = 'settings-status error';
    settingsSaveBtn.disabled = true;
  }

  verifyBtn.disabled = false;
}

// 保存设置
function saveSettings() {
  const provider = aiProviderSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const verified = verifyBtn.dataset.verified === 'true' || verifyBtn.classList.contains('verified');

  const settings = {
    aiProvider: provider,
    apiKey: apiKey,
    apiKeyVerified: verified,
    includeIntuition: true
  };

  StorageService.saveSettings(settings);
  console.log('[main] 设置已保存:', provider, verified ? '(已验证)' : '(未验证)');

  // 更新 API 提示状态
  updateApiHintVisibility();

  closeSettings();
}

// 更新 API 配置提示可见性
function updateApiHintVisibility() {
  const isConfigured = StorageService.isAPIConfigured();
  if (isConfigured) {
    apiHintPanel.classList.remove('visible');
  } else {
    apiHintPanel.classList.add('visible');
  }
}

// 检查是否可以揭示命运
function checkCanReveal() {
  const isConfigured = StorageService.isAPIConfigured();
  if (!isConfigured) {
    // 打开设置弹窗
    openSettings();
    return false;
  }
  return true;
}

// 设置事件绑定
btnSettings.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
openSettingsLink.addEventListener('click', openSettings);

// 点击弹窗外部关闭
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettings();
  }
});

// AI 提供商切换
aiProviderSelect.addEventListener('change', (e) => {
  updateApiHint(e.target.value);
  // 切换提供商后需要重新验证
  verifyBtn.textContent = '验证';
  verifyBtn.classList.remove('verified');
  verifyBtn.dataset.verified = 'false';
  settingsSaveBtn.disabled = true;
  apiStatus.textContent = '';
});

// API Key 输入变化
apiKeyInput.addEventListener('input', () => {
  // 输入变化后需要重新验证
  verifyBtn.textContent = '验证';
  verifyBtn.classList.remove('verified');
  verifyBtn.dataset.verified = 'false';
  settingsSaveBtn.disabled = true;
  apiStatus.textContent = '';
});

// 验证按钮
verifyBtn.addEventListener('click', verifyApiKey);

// 保存按钮
settingsSaveBtn.addEventListener('click', saveSettings);

// 揭示命运按钮
btnNext.addEventListener('click', () => {
  if (!checkCanReveal()) {
    return;
  }
  console.log('[main] 揭示命运，选中的牌:', selectedCards);
  showResultPage();
});

// ============================================
// 解读结果页面
// ============================================

// 显示解读结果页面
function showResultPage() {
  // 隐藏星环页面，显示结果页面
  readingPage.style.display = 'none';
  resultPage.style.display = 'flex';

  // 显示用户问题
  resultQuestion.textContent = userQuestion;

  // 渲染牌面
  renderResultCards();

  // 重置状态
  resultLoading.classList.remove('visible');
  resultError.classList.remove('visible');
  resultReading.classList.remove('visible');
  resultReading.innerHTML = '';
  followupInput.value = '';
  btnFollowup.disabled = true;

  // 清空之前的追问内容
  const resultContent = document.querySelector('.result-content');
  resultContent.querySelectorAll('.followup-question, .followup-answer, .followup-loading').forEach(el => el.remove());

  // 开始 AI 解读
  callAIReading();
}

// 渲染结果页面的牌面
function renderResultCards() {
  const labels = ['过去', '现在', '未来'];

  selectedCards.forEach((selected, index) => {
    const cardEl = document.getElementById(`result-card-${index}`);
    if (!cardEl) return;

    const imageEl = cardEl.querySelector('.result-card-image');
    const nameEl = cardEl.querySelector('.result-card-name');
    const labelEl = cardEl.querySelector('.result-card-label');

    // 设置标签
    labelEl.textContent = labels[index];

    // 设置牌面图片
    const imageUrl = `https://raw.githubusercontent.com/metabismuth/tarot-json/master/cards/${selected.card.imageFilename}`;
    imageEl.style.backgroundImage = `url(${imageUrl})`;

    // 逆位处理
    if (selected.isReversed) {
      imageEl.classList.add('reversed');
    } else {
      imageEl.classList.remove('reversed');
    }

    // 设置牌名
    const positionText = selected.isReversed ? '逆位' : '正位';
    nameEl.innerHTML = `${selected.card.nameCN}<br><span class="position">${positionText}</span>`;
  });
}

// 获取选中牌的直觉记录
// 返回值：null = 未启用，[] = 启用但无匹配数据，[...] = 有数据
function getIntuitionContext(cards) {
  if (!useIntuition) return null;  // null 表示未启用

  const cardIds = cards.map(c => c.card.id);
  return StorageService.getRecordsByCardIds(cardIds);  // 可能返回 []
}

// 调用 AI 解读
async function callAIReading(followupQuestion = null) {
  const resultContent = document.querySelector('.result-content');
  const isFollowup = followupQuestion !== null;

  // 禁用追问输入
  followupInput.disabled = true;
  btnFollowup.disabled = true;

  let loadingEl, answerEl;

  if (isFollowup) {
    // 追问模式：追加用户问题和新的回答框
    const questionEl = document.createElement('div');
    questionEl.className = 'followup-question';
    questionEl.textContent = followupQuestion;
    resultContent.appendChild(questionEl);

    // 创建加载状态
    loadingEl = document.createElement('div');
    loadingEl.className = 'followup-loading';
    loadingEl.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">星际塔罗师正在回答...</div>
    `;
    resultContent.appendChild(loadingEl);

    // 滚动到底部
    resultContent.scrollTop = resultContent.scrollHeight;
  } else {
    // 首次解读：使用原有的加载和显示逻辑
    resultLoading.classList.add('visible');
    resultError.classList.remove('visible');
    resultReading.classList.remove('visible');
    // 重置对话历史
    conversationHistory = [];
  }

  try {
    // 构建牌面数据
    const cards = selectedCards.map(s => ({
      ...s.card,
      isReversed: s.isReversed,
      keywords: s.card.keywords || []
    }));

    // 确定问题内容
    const question = followupQuestion || userQuestion;

    // 获取直觉记录（仅首次解读时，追问不重复传递）
    const intuitionRecords = isFollowup ? [] : getIntuitionContext(selectedCards);

    // 收集完整响应
    let fullResponse = '';

    // 调用 AI（追问时传递对话历史，首次解读传递直觉记录）
    await aiService.getReading(question, cards, (chunk) => {
      fullResponse += chunk;
    }, isFollowup ? conversationHistory : [], intuitionRecords);

    // 更新对话历史
    if (isFollowup) {
      // 追问：添加用户问题和 AI 回复
      conversationHistory.push({ role: 'user', content: question });
      conversationHistory.push({ role: 'assistant', content: fullResponse });
    } else {
      // 首次解读：初始化对话历史（包含完整的牌面信息）
      const initialMessage = aiService.buildUserMessage(question, cards, []);
      conversationHistory.push({ role: 'user', content: initialMessage });
      conversationHistory.push({ role: 'assistant', content: fullResponse });
    }

    if (isFollowup) {
      // 移除加载状态
      loadingEl.remove();

      // 创建回答框
      answerEl = document.createElement('div');
      answerEl.className = 'followup-answer';
      answerEl.innerHTML = marked.parse(fullResponse);
      resultContent.appendChild(answerEl);

      // 滚动到新回答
      resultContent.scrollTop = resultContent.scrollHeight;
    } else {
      // 首次解读
      resultLoading.classList.remove('visible');

      // 检测是否为无效输入引导消息
      if (fullResponse.includes('抱歉，星际塔罗师没有听懂')) {
        // 无效输入：显示引导消息 + 返回按钮
        resultReading.innerHTML = marked.parse(fullResponse) +
          '<div style="text-align: center; margin-top: 30px;">' +
          '<button class="btn btn-primary" id="btn-rephrase">重新输入问题</button>' +
          '</div>';
        resultReading.classList.add('visible');

        // 隐藏追问区域
        document.querySelector('.result-footer').style.display = 'none';

        // 绑定返回按钮事件
        document.getElementById('btn-rephrase').addEventListener('click', () => {
          // 返回提问页
          resultPage.style.display = 'none';
          questionPage.style.display = 'flex';
          // 恢复追问区域显示
          document.querySelector('.result-footer').style.display = '';
          // 清空之前的输入
          questionInput.value = '';
          questionInput.focus();
        });
        return;
      }

      resultReading.innerHTML = marked.parse(fullResponse);
      resultReading.classList.add('visible');
    }

    // 启用追问输入
    followupInput.disabled = false;

    console.log('[main] AI 解读完成，对话历史长度:', conversationHistory.length);

  } catch (error) {
    console.error('[main] AI 解读失败:', error);

    if (isFollowup) {
      // 移除加载状态，显示错误
      loadingEl.remove();
      const errorEl = document.createElement('div');
      errorEl.className = 'followup-answer';
      errorEl.style.color = '#e74c3c';
      errorEl.textContent = error.message || '回答失败，请重试';
      resultContent.appendChild(errorEl);
    } else {
      // 首次解读错误
      resultLoading.classList.remove('visible');
      errorMessage.textContent = error.message || '解读失败，请重试';
      resultError.classList.add('visible');
    }

    // 启用追问输入（允许重试后继续）
    followupInput.disabled = false;
  }
}

// 从结果页面返回星环页面
function hideResultPage() {
  resultPage.style.display = 'none';
  readingPage.style.display = 'block';
}

// 从结果页面返回首页
function resultToHome() {
  resultPage.style.display = 'none';
  mainMenu.classList.remove('hidden');

  // 重置状态
  userQuestion = '';
  selectedCards = [];
}

// 结果页面事件绑定
btnBackResult.addEventListener('click', hideResultPage);
btnResultHome.addEventListener('click', resultToHome);

// 重试按钮 → 返回提问页面重新开始
btnRetry.addEventListener('click', () => {
  resultPage.style.display = 'none';
  questionPage.style.display = 'flex';
  questionInput.value = '';
  questionInput.focus();
});

// 追问输入监听
followupInput.addEventListener('input', () => {
  const hasContent = followupInput.value.trim().length > 0;
  btnFollowup.disabled = !hasContent;
});

// 追问发送按钮
btnFollowup.addEventListener('click', () => {
  const question = followupInput.value.trim();
  if (question) {
    followupInput.value = '';
    btnFollowup.disabled = true;
    callAIReading(question);
  }
});

// 追问输入框回车发送
followupInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !btnFollowup.disabled) {
    btnFollowup.click();
  }
});

// 启动应用
initData();

// 初始化时检查 API 配置状态
updateApiHintVisibility();

console.log('[main] 事件绑定完成');
