// ============================================
// 牌面动画模块 - 粒子汇聚、翻牌、飞入卡槽
// ============================================

import * as THREE from 'three';
import { CONFIG } from './config.js?v=75';

export class CardAnimator {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.isAnimating = false;

    // 动画参数
    this.convergeDuration = 600;   // 粒子汇聚时间
    this.flipDuration = 600;       // 翻牌时间
    this.flyDuration = 800;        // 飞入卡槽时间（更慢）

    // 临时对象
    this.particleSystem = null;
    this.cardMesh = null;
    this.cardFrontTexture = null;
    this.cardBackTexture = null;

    // 粒子汇聚状态（用于握拳同步）
    this.isConverging = false;
    this.convergeResolve = null;
    this.disperseId = null; // 消散动画ID，用于取消旧动画

    // 3D 卡槽
    this.slots = [];
    this.slotGroup = new THREE.Group();
    this.scene.add(this.slotGroup);

    // 创建 3D 卡槽
    this.createSlots();

    console.log('[card-animations] 动画控制器初始化');
  }

  // 创建 3D 卡槽
  createSlots() {
    // 手机竖屏缩小卡槽
    const isMobile = window.innerWidth <= 768;
    const isIPad = !isMobile && window.innerWidth <= 1366 && window.innerWidth >= 768 && 'ontouchstart' in window;
    const slotWidth = isMobile ? 1.0 : 1.4;
    const slotHeight = isMobile ? 1.6 : 2.4;

    // 固定卡槽位置（手机端缩小间距，iPad 上移）
    const slotY = isMobile ? -2.50 : isIPad ? -2.15 : -2.50;
    const slotPositions = isMobile ? [
      { x: -1.40, y: -2.50, z: -1.00 },  // 卡槽1：过去
      { x: 0.00, y: -2.50, z: -1.00 },   // 卡槽2：现在
      { x: 1.40, y: -2.50, z: -1.00 },   // 卡槽3：未来
    ] : [
      { x: -2.40, y: slotY, z: -1.00 },  // 卡槽1：过去
      { x: 0.10, y: slotY, z: -1.00 },   // 卡槽2：现在
      { x: 2.40, y: slotY, z: -1.00 },   // 卡槽3：未来
    ];

    for (let i = 0; i < 3; i++) {
      const slotPos = new THREE.Vector3(
        slotPositions[i].x,
        slotPositions[i].y,
        slotPositions[i].z
      );

      // 创建卡槽背景
      const slotGeometry = new THREE.PlaneGeometry(slotWidth, slotHeight);
      const slotMaterial = new THREE.MeshBasicMaterial({
        color: 0x7B5EA7,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });

      const slotMesh = new THREE.Mesh(slotGeometry, slotMaterial);
      slotMesh.position.copy(slotPos);

      // 卡槽保持垂直于地面，面向 Z 正方向（不旋转）
      // 正对视角时保持横平竖直
      slotMesh.rotation.y = 0;

      // 创建边框
      const borderGeometry = new THREE.EdgesGeometry(slotGeometry);
      const borderMaterial = new THREE.LineBasicMaterial({
        color: 0xD4AF37,
        transparent: true,
        opacity: 0.6,
      });
      const border = new THREE.LineSegments(borderGeometry, borderMaterial);
      slotMesh.add(border);

      // 保存卡槽信息
      this.slots.push({
        mesh: slotMesh,
        position: slotPos.clone(),
        filled: false,
        cardData: null,
        isReversed: false,
      });

      this.slotGroup.add(slotMesh);
    }

    console.log('[card-animations] 3D卡槽创建完成');
  }

  // 创建标签纹理
  createLabelTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 128, 48);

    ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#D4AF37';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 24);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // 获取卡槽位置
  getSlotPosition(slotIndex) {
    if (slotIndex >= 1 && slotIndex <= 3) {
      return this.slots[slotIndex - 1].position.clone();
    }
    return new THREE.Vector3(0, 0, 0);
  }

  // 更新卡槽显示（填充塔罗牌）
  updateSlot(slotIndex, cardData, isReversed) {
    if (slotIndex < 1 || slotIndex > 3) return;

    const slot = this.slots[slotIndex - 1];
    slot.filled = true;
    slot.cardData = cardData;
    slot.isReversed = isReversed;

    // 加载牌面图片并更新卡槽纹理
    const textureLoader = new THREE.TextureLoader();
    const imageUrl = CONFIG.CARD_IMAGE_BASE_URL + cardData.imageFilename;

    textureLoader.load(imageUrl, (texture) => {
      // 确保纹理不使用预乘 alpha
      texture.premultiplyAlpha = false;

      // 创建新材质显示塔罗牌（不透明）
      const cardMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: false,
        side: THREE.DoubleSide,
        alphaTest: 0,
      });

      slot.mesh.material.dispose();
      slot.mesh.material = cardMaterial;

      // 逆位旋转
      if (isReversed) {
        slot.mesh.rotation.z = Math.PI;
      }

      console.log('[card-animations] 卡槽', slotIndex, '已填充:', cardData.nameCN);
    });
  }

  // 重置所有卡槽
  resetSlots() {
    this.slots.forEach((slot) => {
      slot.filled = false;
      slot.cardData = null;
      slot.isReversed = false;

      // 恢复默认材质
      slot.mesh.material.dispose();
      slot.mesh.material = new THREE.MeshBasicMaterial({
        color: 0x7B5EA7,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      slot.mesh.rotation.z = 0;
    });
    console.log('[card-animations] 卡槽已重置');
  }

  // 开始粒子汇聚（握拳开始时调用）
  // duration: 可选，汇聚持续时间。手势模式传 1200（匹配握拳等待），鼠标/触摸用默认 600
  startParticleConverge(duration) {
    this.convergeDuration = duration || 600;  // 默认 600ms
    // 清理残留的粒子系统（可能来自未完成的消散动画）
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      this.particleSystem.material.dispose();
      this.particleSystem = null;
    }

    if (this.isConverging) return;
    this.isConverging = true;
    this.disperseId = null; // 取消任何进行中的消散动画

    // 计算展示位置
    const displayPos = this.getDisplayPosition();

    // 创建粒子系统 - 3000个粒子
    const particleCount = 3000;
    const geometry = new THREE.BufferGeometry();
    this.convergePositions = new Float32Array(particleCount * 3);
    this.convergeTargets = new Float32Array(particleCount * 3);
    this.convergeDelays = new Float32Array(particleCount);

    const cardWidth = 1.8;
    const cardHeight = 3.0;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.5) * Math.PI;
      const distance = 8 + Math.random() * 12;

      this.convergePositions[i * 3] = displayPos.x + Math.cos(angle) * Math.cos(elevation) * distance;
      this.convergePositions[i * 3 + 1] = displayPos.y + Math.sin(elevation) * distance;
      this.convergePositions[i * 3 + 2] = displayPos.z + Math.sin(angle) * Math.cos(elevation) * distance;

      this.convergeTargets[i * 3] = displayPos.x + (Math.random() - 0.5) * cardWidth;
      this.convergeTargets[i * 3 + 1] = displayPos.y + (Math.random() - 0.5) * cardHeight;
      this.convergeTargets[i * 3 + 2] = displayPos.z + (Math.random() - 0.5) * 0.1;

      this.convergeDelays[i] = Math.random() * 0.3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.convergePositions.slice(), 3));

    const particleTexture = this.createEtherealParticleTexture();
    this.convergeMaterial = new THREE.PointsMaterial({
      size: 0.12,
      map: particleTexture,
      transparent: true,
      opacity: 0.5,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    this.particleSystem = new THREE.Points(geometry, this.convergeMaterial);
    this.scene.add(this.particleSystem);

    this.convergeStartTime = Date.now();
    this.animateConverge();

    console.log('[card-animations] 开始粒子汇聚');
  }

  // 动画更新粒子
  animateConverge() {
    if (!this.particleSystem) return;

    const elapsed = Date.now() - this.convergeStartTime;
    const progress = Math.min(elapsed / this.convergeDuration, 1);

    const posArray = this.particleSystem.geometry.attributes.position.array;
    const particleCount = posArray.length / 3;

    for (let i = 0; i < particleCount; i++) {
      const particleProgress = Math.max(0, Math.min(1, (progress - this.convergeDelays[i]) / (1 - this.convergeDelays[i])));
      const easeProgress = this.easeOutCubic(particleProgress);

      let spiralAngle, spiralRadius;

      if (progress < 1) {
        // 汇聚阶段：螺旋收缩
        spiralAngle = particleProgress * Math.PI * 2;
        spiralRadius = (1 - particleProgress) * 0.5;
      } else {
        // 待机阶段：粒子在汇聚点附近轻微环绕（平滑过渡，避免跳变）
        const idleTime = elapsed - this.convergeDuration;
        const idleRadius = 0.08 * Math.min(idleTime / 200, 1); // 200ms 内从 0 长到 0.08
        spiralAngle = idleTime * 0.004 + i * 0.8;
        spiralRadius = idleRadius;
      }

      posArray[i * 3] = this.convergePositions[i * 3] + (this.convergeTargets[i * 3] - this.convergePositions[i * 3]) * easeProgress + Math.cos(spiralAngle + i) * spiralRadius;
      posArray[i * 3 + 1] = this.convergePositions[i * 3 + 1] + (this.convergeTargets[i * 3 + 1] - this.convergePositions[i * 3 + 1]) * easeProgress + Math.sin(spiralAngle * 0.5 + i) * spiralRadius * 0.5;
      posArray[i * 3 + 2] = this.convergePositions[i * 3 + 2] + (this.convergeTargets[i * 3 + 2] - this.convergePositions[i * 3 + 2]) * easeProgress + Math.sin(spiralAngle + i) * spiralRadius;
    }

    this.particleSystem.geometry.attributes.position.needsUpdate = true;

    // 粒子逐渐变亮（仅前 80%，之后由 fadeOutParticles 接管）
    if (progress < 0.8) {
      this.convergeMaterial.opacity = 0.5 + 0.5 * (progress / 0.8);
    }

    // 80% 时提前触发 resolve，让卡牌开始显现（剩余 20% 汇聚与牌面渐入同时进行）
    if (progress >= 0.8 && this.convergeResolve) {
      const resolve = this.convergeResolve;
      this.convergeResolve = null;
      resolve();
    }

    if (progress >= 1 && this.isConverging) {
      this.isConverging = false;
    }

    // 持续动画直到粒子系统被清理（汇聚完后进入待机微动，手势模式需要等待~400ms）
    requestAnimationFrame(() => this.animateConverge());
  }

  // 取消粒子汇聚（握拳松开时调用）- 带消散动画
  cancelParticleConverge() {
    console.log('[card-animations] cancelParticleConverge called, isConverging:', this.isConverging, 'particleSystem:', !!this.particleSystem);
    if (!this.isConverging && !this.particleSystem) return;
    if (!this.particleSystem) return;

    this.isConverging = false;
    this.convergeResolve = null;

    // 记录当前粒子位置作为消散起点
    const posArray = this.particleSystem.geometry.attributes.position.array;
    const currentPositions = new Float32Array(posArray.length);
    for (let i = 0; i < posArray.length; i++) {
      currentPositions[i] = posArray[i];
    }

    // 检查 convergePositions 是否存在
    if (!this.convergePositions) {
      console.warn('[card-animations] convergePositions 不存在，直接清理粒子');
      if (this.particleSystem) {
        this.scene.remove(this.particleSystem);
        this.particleSystem.geometry.dispose();
        this.particleSystem.material.dispose();
        this.particleSystem = null;
      }
      return;
    }

    // 开始消散动画
    const disperseStartTime = Date.now();
    const disperseDuration = 400; // 400ms 消散
    const convergePositions = this.convergePositions; // 保存引用
    const disperseId = Date.now(); // 唯一ID，用于取消旧动画
    this.disperseId = disperseId;
    const particleSystemRef = this.particleSystem; // 保存当前粒子系统引用
    const materialRef = this.convergeMaterial; // 保存当前材质引用

    // 清空主引用，停止待机动画循环，消散动画使用 saved refs
    this.particleSystem = null;
    this.convergeMaterial = null;

    const animateDisperse = () => {
      // 检查是否被新动画取消
      if (this.disperseId !== disperseId) {
        // 旧动画被取消，清理旧粒子系统（如果还没被清理）
        if (particleSystemRef && particleSystemRef.parent) {
          this.scene.remove(particleSystemRef);
          particleSystemRef.geometry.dispose();
          particleSystemRef.material.dispose();
        }
        return;
      }
      if (!particleSystemRef || !particleSystemRef.parent) return;

      const elapsed = Date.now() - disperseStartTime;
      const progress = Math.min(elapsed / disperseDuration, 1);
      const easeProgress = this.easeOutCubic(progress);

      const posArray = particleSystemRef.geometry.attributes.position.array;
      const particleCount = posArray.length / 3;

      for (let i = 0; i < particleCount; i++) {
        // 从当前位置向外扩散到原始远处位置
        posArray[i * 3] = currentPositions[i * 3] + (convergePositions[i * 3] - currentPositions[i * 3]) * easeProgress;
        posArray[i * 3 + 1] = currentPositions[i * 3 + 1] + (convergePositions[i * 3 + 1] - currentPositions[i * 3 + 1]) * easeProgress;
        posArray[i * 3 + 2] = currentPositions[i * 3 + 2] + (convergePositions[i * 3 + 2] - currentPositions[i * 3 + 2]) * easeProgress;
      }

      particleSystemRef.geometry.attributes.position.needsUpdate = true;

      // 淡出 - 使用保存的材质引用，不影响新创建的粒子
      if (materialRef) {
        materialRef.opacity = 1.0 * (1 - easeProgress);
      }

      if (progress < 1) {
        requestAnimationFrame(animateDisperse);
      } else {
        // 动画完成，清理粒子
        if (particleSystemRef.parent) {
          this.scene.remove(particleSystemRef);
          particleSystemRef.geometry.dispose();
          particleSystemRef.material.dispose();
        }
        if (this.disperseId === disperseId) {
          this.disperseId = null;
        }
        console.log('[card-animations] 粒子消散完成');
      }
    };

    animateDisperse();
    console.log('[card-animations] 开始粒子消散');
  }

  // 等待粒子汇聚接近完成（80%时触发，剩余20%与卡牌显现并行）
  async waitForConvergeComplete() {
    if (!this.isConverging) return;

    // 等待粒子汇聚到 80%（带安全超时，防止 rAF 停止导致永远挂起）
    const remaining = this.convergeDuration - (Date.now() - this.convergeStartTime);
    if (remaining > 0) {
      await Promise.race([
        new Promise(resolve => { this.convergeResolve = resolve; }),
        new Promise(resolve => setTimeout(resolve, remaining + 500))
      ]);
    }

    // isConverging 由 animateConverge 在 100% 时重置，或由 cleanup() 兜底
    console.log('[card-animations] 粒子汇聚接近完成，开始显示卡牌');
  }

  // 淡出并清理粒子（供外部或内部调用）
  fadeOutParticles(duration = 400) {
    if (!this.particleSystem || !this.convergeMaterial) return;

    const fadeStart = Date.now();
    const startOpacity = this.convergeMaterial.opacity;

    const fade = () => {
      if (!this.particleSystem || !this.convergeMaterial) return;

      const progress = Math.min((Date.now() - fadeStart) / duration, 1);
      this.convergeMaterial.opacity = startOpacity * (1 - this.easeOutCubic(progress));

      if (progress < 1) {
        requestAnimationFrame(fade);
      } else {
        // 清理粒子
        if (this.particleSystem) {
          this.scene.remove(this.particleSystem);
          this.particleSystem.geometry.dispose();
          this.particleSystem.material.dispose();
          this.particleSystem = null;
        }
        console.log('[card-animations] 粒子淡出完成');
      }
    };
    fade();
  }

  // 完成粒子汇聚（握拳1秒后调用）- 保留兼容
  async completeParticleConverge() {
    await this.waitForConvergeComplete();
    this.fadeOutParticles(200);
  }

  // 预加载纹理（供外部提前调用，如手势模式在 onFistStart 时预加载）
  preloadTexture(imageUrl) {
    const textureLoader = new THREE.TextureLoader();
    return new Promise((res, rej) => {
      textureLoader.load(imageUrl, res, undefined, rej);
    }).catch(() => null);
  }

  // 执行完整的抓牌动画序列（粒子已在握拳时开始）
  // externalTexturePromise: 外部已预加载的纹理 promise（可选，手势模式使用）
  async playGrabAnimation(cardData, isReversed, slotIndex, onComplete, externalTexturePromise) {
    if (this.isAnimating) {
      console.warn('[card-animations] playGrabAnimation: 动画正在进行中，跳过');
      return;
    }
    this.isAnimating = true;

    try {
      // 使用外部预加载的纹理，或现场加载（触摸/鼠标模式与汇聚并行）
      const texturePromise = externalTexturePromise || this.preloadTexture(
        CONFIG.CARD_IMAGE_BASE_URL + cardData.imageFilename
      );

      // 1. 等待粒子汇聚到 80%
      await this.waitForConvergeComplete();

      // 2. 牌背显现 + 粒子淡出（纹理已预加载）
      await this.playCardFlip(cardData, isReversed, texturePromise);

      // 3. 牌飞入卡槽
      await this.playFlyToSlot(slotIndex);

      // 4. 回调
      if (onComplete) onComplete();
    } catch (error) {
      console.error('[card-animations] 动画出错:', error);
    } finally {
      // 确保任何情况下都清理并重置状态
      this.cleanup();
      this.isAnimating = false;
    }
  }

  // 粒子汇聚动画 - 飘渺感，更多更小的粒子（备用方法，未使用）
  playParticleConverge() {
    return new Promise((resolve) => {
      // 计算展示位置（卡槽前方上方）
      const displayPos = this.getDisplayPosition();

      // 创建粒子系统 - 3000个粒子，飘渺效果
      const particleCount = 3000;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const targetPositions = new Float32Array(particleCount * 3);
      const delays = new Float32Array(particleCount); // 每个粒子的延迟

      // 牌的尺寸
      const cardWidth = 1.8;
      const cardHeight = 3.0;

      for (let i = 0; i < particleCount; i++) {
        // 起始位置：从四面八方飘来
        const angle = Math.random() * Math.PI * 2;
        const elevation = (Math.random() - 0.5) * Math.PI; // 上下角度
        const distance = 8 + Math.random() * 12;

        const startX = displayPos.x + Math.cos(angle) * Math.cos(elevation) * distance;
        const startY = displayPos.y + Math.sin(elevation) * distance;
        const startZ = displayPos.z + Math.sin(angle) * Math.cos(elevation) * distance;

        positions[i * 3] = startX;
        positions[i * 3 + 1] = startY;
        positions[i * 3 + 2] = startZ;

        // 目标位置：牌形状（带一点随机扩散）
        const cardX = (Math.random() - 0.5) * cardWidth;
        const cardY = (Math.random() - 0.5) * cardHeight;
        const cardZ = (Math.random() - 0.5) * 0.1; // 轻微厚度
        targetPositions[i * 3] = displayPos.x + cardX;
        targetPositions[i * 3 + 1] = displayPos.y + cardY;
        targetPositions[i * 3 + 2] = displayPos.z + cardZ;

        // 随机延迟让粒子陆续到达
        delays[i] = Math.random() * 0.3;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      // 创建飘渺的粒子纹理
      const particleTexture = this.createEtherealParticleTexture();

      // 紫色粒子材质 - 更小更透明
      const material = new THREE.PointsMaterial({
        size: 0.08,
        map: particleTexture,
        transparent: true,
        opacity: 0.6,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      this.particleSystem = new THREE.Points(geometry, material);
      this.scene.add(this.particleSystem);

      // 动画
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / this.convergeDuration, 1);

        const posArray = this.particleSystem.geometry.attributes.position.array;

        for (let i = 0; i < particleCount; i++) {
          // 每个粒子有自己的延迟和进度
          const particleProgress = Math.max(0, Math.min(1, (progress - delays[i]) / (1 - delays[i])));
          const easeProgress = this.easeOutCubic(particleProgress);

          // 从起始位置向目标位置插值
          const startX = positions[i * 3];
          const startY = positions[i * 3 + 1];
          const startZ = positions[i * 3 + 2];
          const targetX = targetPositions[i * 3];
          const targetY = targetPositions[i * 3 + 1];
          const targetZ = targetPositions[i * 3 + 2];

          // 添加螺旋运动
          const spiralAngle = particleProgress * Math.PI * 2;
          const spiralRadius = (1 - particleProgress) * 0.5;

          posArray[i * 3] = startX + (targetX - startX) * easeProgress + Math.cos(spiralAngle + i) * spiralRadius;
          posArray[i * 3 + 1] = startY + (targetY - startY) * easeProgress + Math.sin(spiralAngle * 0.5 + i) * spiralRadius * 0.5;
          posArray[i * 3 + 2] = startZ + (targetZ - startZ) * easeProgress + Math.sin(spiralAngle + i) * spiralRadius;
        }

        this.particleSystem.geometry.attributes.position.needsUpdate = true;

        // 粒子逐渐变亮然后在最后淡出
        if (progress < 0.8) {
          material.opacity = 0.3 + 0.5 * (progress / 0.8);
        } else {
          material.opacity = 0.8 * (1 - (progress - 0.8) / 0.2);
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // 粒子消失
          this.scene.remove(this.particleSystem);
          this.particleSystem.geometry.dispose();
          this.particleSystem.material.dispose();
          this.particleSystem = null;
          resolve();
        }
      };

      animate();
    });
  }

  // 创建粒子纹理 - 更强烈的紫色
  createEtherealParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const centerX = 32;
    const centerY = 32;

    // 更强烈的紫色光晕
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 32);
    gradient.addColorStop(0, 'rgba(200, 130, 255, 1)');      // 明亮紫色核心
    gradient.addColorStop(0.2, 'rgba(168, 100, 230, 0.9)');
    gradient.addColorStop(0.4, 'rgba(148, 80, 210, 0.6)');
    gradient.addColorStop(0.7, 'rgba(123, 60, 180, 0.3)');
    gradient.addColorStop(1, 'rgba(100, 50, 150, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // 显示牌面 - 牌背显现 → Y轴翻转 → 显示正面
  async playCardFlip(cardData, isReversed, texturePromise) {
    const displayPos = this.getDisplayPosition();

    console.log('[card-animations] 加载牌面:', cardData.nameCN);

    // 创建牌背纹理
    this.cardBackTexture = this.createCardBackTexture();

    // 使用预加载的纹理（在粒子汇聚期间已开始加载）
    this.cardFrontTexture = await texturePromise;
    if (!this.cardFrontTexture) {
      console.warn('[card-animations] 牌面图片加载失败，使用牌背');
      this.cardFrontTexture = this.cardBackTexture;
    }

    // 确保纹理不使用预乘 alpha
    if (this.cardFrontTexture) {
      this.cardFrontTexture.premultiplyAlpha = false;
    }

    // 创建卡牌 - 初始显示牌背
    const cardWidth = 1.8;
    const cardHeight = 3.0;
    const geometry = new THREE.PlaneGeometry(cardWidth, cardHeight);

    // 牌背材质（初始透明，用于渐入效果）
    const backMaterial = new THREE.MeshBasicMaterial({
      map: this.cardBackTexture,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0,
    });

    // 牌面材质
    const frontMaterial = new THREE.MeshBasicMaterial({
      map: this.cardFrontTexture,
      side: THREE.FrontSide,
      transparent: false,
      alphaTest: 0,
    });

    // 创建双面牌（正反两面）
    this.cardMesh = new THREE.Group();

    // 牌背面（初始朝向相机，rotation.y = 0）
    const backMesh = new THREE.Mesh(geometry.clone(), backMaterial);
    backMesh.name = 'back';
    this.cardMesh.add(backMesh);

    // 牌正面（初始背对相机，rotation.y = PI）
    const frontMesh = new THREE.Mesh(geometry, frontMaterial);
    frontMesh.rotation.y = Math.PI;
    frontMesh.name = 'front';
    this.cardMesh.add(frontMesh);

    // 初始位置 + 缩放（从小到大的凝聚感）
    this.cardMesh.position.copy(displayPos);
    this.cardMesh.scale.set(0.85, 0.85, 0.85);

    // 逆位处理 - 绕Z轴旋转180度
    if (isReversed) {
      this.cardMesh.rotation.z = Math.PI;
    }

    this.scene.add(this.cardMesh);

    // 阶段1：粒子淡出 + 牌背渐入 + 缩放 + 发光（同步进行，600ms）
    const fadeInDuration = 600;
    const fadeInStart = Date.now();

    // 开始粒子淡出（与牌背显现同步）
    this.fadeOutParticles(fadeInDuration);

    await new Promise((fadeResolve) => {
      const animateFadeIn = () => {
        const elapsed = Date.now() - fadeInStart;
        const progress = Math.min(elapsed / fadeInDuration, 1);
        const easeProgress = this.easeOutCubic(progress);

        // 透明度渐入
        backMaterial.opacity = easeProgress;

        // 缩放 0.85 → 1.0（凝聚成型感）
        const scale = 0.85 + 0.15 * easeProgress;
        this.cardMesh.scale.set(scale, scale, scale);

        if (progress < 1) {
          requestAnimationFrame(animateFadeIn);
        } else {
          // 渐入完成，设为不透明
          backMaterial.transparent = false;
          backMaterial.opacity = 1;
          fadeResolve();
        }
      };
      animateFadeIn();
    });

    // 短暂停顿让用户看到牌背 (300ms)
    await new Promise(r => setTimeout(r, 300));

    // 阶段2：Y轴翻转动画 (600ms)
    const flipStart = Date.now();

    await new Promise((flipResolve) => {
      const animateFlip = () => {
        const elapsed = Date.now() - flipStart;
        const progress = Math.min(elapsed / this.flipDuration, 1);
        const easeProgress = this.easeInOutCubic(progress);

        // Y轴旋转：从0到PI（180度）
        this.cardMesh.rotation.y = easeProgress * Math.PI;

        if (progress < 1) {
          requestAnimationFrame(animateFlip);
        } else {
          flipResolve();
        }
      };
      animateFlip();
    });

    // 短暂停留让用户看清牌面 (400ms)
    await new Promise(r => setTimeout(r, 400));

    console.log('[card-animations] 翻牌动画完成:', cardData.nameCN);
  }

  // 飞入卡槽动画 - 使用 3D 卡槽位置
  playFlyToSlot(slotIndex) {
    return new Promise((resolve) => {
      if (!this.cardMesh) {
        resolve();
        return;
      }

      // 获取 3D 卡槽位置
      const targetPos = this.getSlotPosition(slotIndex);

      const startPos = this.cardMesh.position.clone();
      const startScale = this.cardMesh.scale.clone();
      // 缩放到卡槽大小（卡牌原始 1.8x3.0）
      const isMobile = window.innerWidth <= 768;
      const slotW = isMobile ? 1.0 : 1.4;
      const scaleRatio = slotW / 1.8;
      const targetScale = new THREE.Vector3(scaleRatio, scaleRatio, scaleRatio);

      // 保存初始旋转（Y轴用于翻转后状态，Z轴用于逆位）
      const startRotationY = this.cardMesh.rotation.y;
      const startRotationZ = this.cardMesh.rotation.z;

      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / this.flyDuration, 1);
        const easeProgress = this.easeInOutCubic(progress);

        // 位置插值
        this.cardMesh.position.lerpVectors(startPos, targetPos, easeProgress);

        // 缩小到卡槽大小
        this.cardMesh.scale.lerpVectors(startScale, targetScale, easeProgress);

        // 保持旋转状态（Y轴翻转 + Z轴逆位）
        this.cardMesh.rotation.y = startRotationY;
        this.cardMesh.rotation.z = startRotationZ;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  // 获取展示位置（卡槽前方、上方）
  getDisplayPosition() {
    // 卡槽位置：y=-2.50, z=-1.00
    // 展示位置：z=0.5，y往下调避免被星环遮挡
    const isMobile = window.innerWidth <= 768;
    return isMobile
      ? new THREE.Vector3(0, -1.8, 0.5)
      : new THREE.Vector3(0, -1.6, 0.5);
  }

  // 获取屏幕中心的世界坐标（保留兼容）
  getScreenCenterWorldPos() {
    // 屏幕正中心位置
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const pos = new THREE.Vector3();
    raycaster.ray.at(6, pos);
    return pos;
  }

  // 创建牌背纹理
  createCardBackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 350;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    // 紫色渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 0, 600);
    gradient.addColorStop(0, '#7B5EA7');
    gradient.addColorStop(0.5, '#5C4480');
    gradient.addColorStop(1, '#463264');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 350, 600);

    // 金色边框
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 330, 580);

    // 中心星星
    ctx.fillStyle = '#D4AF37';
    ctx.font = '60px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 175, 300);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // 缓动函数
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // 清理资源
  cleanup() {
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      this.particleSystem.material.dispose();
      this.particleSystem = null;
    }

    if (this.cardMesh) {
      this.scene.remove(this.cardMesh);
      // cardMesh 现在是 Group，包含正反两面
      this.cardMesh.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          child.material.dispose();
        }
      });
      this.cardMesh = null;
    }

    if (this.cardBackTexture) {
      this.cardBackTexture.dispose();
      this.cardBackTexture = null;
    }

    if (this.cardFrontTexture) {
      this.cardFrontTexture.dispose();
      this.cardFrontTexture = null;
    }

    // 完全重置汇聚状态，防止残留阻塞下次动画
    this.isConverging = false;
    this.convergeResolve = null;
    if (this.convergeMaterial) {
      this.convergeMaterial.dispose();
      this.convergeMaterial = null;
    }
  }

  dispose() {
    this.cleanup();
  }
}

console.log('[card-animations.js] 模块加载完成');
