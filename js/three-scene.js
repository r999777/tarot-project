// ============================================
// Three.js 3D场景管理
// ============================================

import * as THREE from 'three';
import { CONFIG } from './config.js?v=58';

export class TarotScene {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.starRing = null;
    this.animationId = null;
    this.clock = new THREE.Clock();
    this.debugControls = null; // 调试控制器
    this.updateCallbacks = []; // 外部更新回调

    this.init();
  }

  init() {
    // 创建场景 (透明背景)
    this.scene = new THREE.Scene();

    // 创建相机 (FOV 50 度，适配 65% 高度画布)
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(
      CONFIG.SCENE.CAMERA_POSITION.x,
      CONFIG.SCENE.CAMERA_POSITION.y,
      CONFIG.SCENE.CAMERA_POSITION.z
    );
    this.camera.lookAt(
      CONFIG.SCENE.CAMERA_LOOKAT.x,
      CONFIG.SCENE.CAMERA_LOOKAT.y,
      CONFIG.SCENE.CAMERA_LOOKAT.z
    );

    // 创建渲染器 (奶油黄背景)
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(0xFFFBF2, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // 匹配 CSS 颜色空间
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 添加灯光
    this.addLights();

    // 监听窗口变化
    window.addEventListener('resize', () => this.onResize());

    // iOS Safari 的 orientationchange 事件
    window.addEventListener('orientationchange', () => {
      // 多次延迟触发 resize 以等待视口完全稳定
      setTimeout(() => this.onResize(), 100);
      setTimeout(() => this.onResize(), 300);
      setTimeout(() => this.onResize(), 500);
    });

    // 监听 visualViewport 变化（iOS Safari 地址栏显示/隐藏）
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.onResize());
    }

    // 移动端初始化时延迟触发 resize，确保尺寸正确
    setTimeout(() => this.onResize(), 50);
    setTimeout(() => this.onResize(), 200);

    console.log('[three-scene] 场景初始化完成');
  }

  addLights() {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // 主方向光
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 7);
    this.scene.add(mainLight);

    // 金色点光源
    const goldLight = new THREE.PointLight(CONFIG.COLORS.PRIMARY, 0.5, 20);
    goldLight.position.set(0, 2, 0);
    this.scene.add(goldLight);
  }

  addBackgroundStars() {
    const geometry = new THREE.BufferGeometry();
    const count = 200;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 50;
      positions[i + 1] = (Math.random() - 0.5) * 50;
      positions[i + 2] = (Math.random() - 0.5) * 50 - 10;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xf5e6c4,
      size: 0.1,
      transparent: true,
      opacity: 0.6,
    });

    const stars = new THREE.Points(geometry, material);
    this.scene.add(stars);
  }

  setStarRing(starRing) {
    this.starRing = starRing;
    if (starRing?.group) {
      this.scene.add(starRing.group);
    }
  }

  showStarRing() {
    if (this.starRing?.group) {
      this.starRing.group.visible = true;
    }
  }

  hideStarRing() {
    if (this.starRing?.group) {
      this.starRing.group.visible = false;
    }
  }

  setDebugControls(debugControls) {
    this.debugControls = debugControls;
  }

  // 添加外部更新回调
  addUpdateCallback(callback) {
    this.updateCallbacks.push(callback);
  }

  // 移除外部更新回调
  removeUpdateCallback(callback) {
    const index = this.updateCallbacks.indexOf(callback);
    if (index > -1) {
      this.updateCallbacks.splice(index, 1);
    }
  }

  start() {
    this.animate();
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();

    // 更新调试控制器
    if (this.debugControls) {
      this.debugControls.update();
    }

    // 更新星环
    if (this.starRing) {
      this.starRing.update(delta);
    }

    // 调用外部更新回调
    this.updateCallbacks.forEach(callback => callback(delta));

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    // 使用 visualViewport（更准确）或 container 尺寸
    let width = this.container.clientWidth;
    let height = this.container.clientHeight;

    // 如果容器尺寸为 0，使用 window 尺寸作为后备
    if (width === 0 || height === 0) {
      width = window.innerWidth;
      height = window.innerHeight;
    }

    // 确保有有效尺寸
    if (width > 0 && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      console.log('[three-scene] resize:', width, 'x', height);
    }
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.renderer?.dispose();
  }
}

console.log('[three-scene.js] 模块加载完成');
