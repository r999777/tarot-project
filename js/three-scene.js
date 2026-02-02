// ============================================
// Three.js 3D场景管理
// ============================================

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CONFIG } from './config.js';

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

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.renderer?.dispose();
  }
}

console.log('[three-scene.js] 模块加载完成');
