// ============================================
// 配置常量
// ============================================

export const CONFIG = {
  // 场景配置
  SCENE: {
    RING_RADIUS: 8,
    RING_TILT: 0.3,
    CARD_WIDTH: 0.7,
    CARD_HEIGHT: 1.2,
    CAMERA_POSITION: { x: 0.0, y: -0.6, z: 7.7 },
    CAMERA_LOOKAT: { x: 0.0, y: -1.1, z: 0.0 },
  },

  // 动画配置
  ANIMATION: {
    RING_ROTATION_NORMAL: 60000,  // 正常旋转一圈60秒
    RING_ROTATION_FAST: 10000,    // 加速旋转一圈10秒
    FLIP_DURATION: 500,           // 翻牌动画500ms
    FLY_DURATION: 300,            // 飞行动画300ms
    SHAKE_DURATION: 200,          // 震动动画200ms
  },

  // 颜色配置
  COLORS: {
    PRIMARY: 0xd4af37,      // 金色
    SECONDARY: 0x7b5ea7,    // 紫色
    BACKGROUND: 0x1a1a2e,   // 深蓝紫
    GLOW: 0xd4af37,         // 发光色
    TEXT: 0xf5e6c4,         // 米白文字
  },

  // 牌相关
  READING_CARD_COUNT: 3,
  REVERSE_PROBABILITY: 0.3,

  // 图片基础URL
  CARD_IMAGE_BASE_URL: 'https://raw.githubusercontent.com/metabismuth/tarot-json/master/cards/',
};

console.log('[config.js] 配置加载完成');
