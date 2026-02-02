// ============================================
// 牌面动画模块 - 粒子汇聚、翻牌、飞入卡槽
// ============================================

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CONFIG } from './config.js';

export class CardAnimator {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.isAnimating = false;

    // 动画参数
    this.convergeDuration = 1500;  // 粒子汇聚时间（与握拳时间同步）
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
    const slotWidth = 1.4;
    const slotHeight = 2.4;

    // 固定卡槽位置（调试模式下调整后的最终值）
    const slotPositions = [
      { x: -2.40, y: -2.50, z: -1.00 },  // 卡槽1：过去
      { x: 0.10, y: -2.50, z: -1.00 },   // 卡槽2：现在
      { x: 2.40, y: -2.50, z: -1.00 },   // 卡槽3：未来
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
  startParticleConverge() {
    if (this.isConverging) return;
    this.isConverging = true;

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
    if (!this.isConverging || !this.particleSystem) return;

    const elapsed = Date.now() - this.convergeStartTime;
    const progress = Math.min(elapsed / this.convergeDuration, 1);

    const posArray = this.particleSystem.geometry.attributes.position.array;
    const particleCount = posArray.length / 3;

    for (let i = 0; i < particleCount; i++) {
      const particleProgress = Math.max(0, Math.min(1, (progress - this.convergeDelays[i]) / (1 - this.convergeDelays[i])));
      const easeProgress = this.easeOutCubic(particleProgress);

      const spiralAngle = particleProgress * Math.PI * 2;
      const spiralRadius = (1 - particleProgress) * 0.5;

      posArray[i * 3] = this.convergePositions[i * 3] + (this.convergeTargets[i * 3] - this.convergePositions[i * 3]) * easeProgress + Math.cos(spiralAngle + i) * spiralRadius;
      posArray[i * 3 + 1] = this.convergePositions[i * 3 + 1] + (this.convergeTargets[i * 3 + 1] - this.convergePositions[i * 3 + 1]) * easeProgress + Math.sin(spiralAngle * 0.5 + i) * spiralRadius * 0.5;
      posArray[i * 3 + 2] = this.convergePositions[i * 3 + 2] + (this.convergeTargets[i * 3 + 2] - this.convergePositions[i * 3 + 2]) * easeProgress + Math.sin(spiralAngle + i) * spiralRadius;
    }

    this.particleSystem.geometry.attributes.position.needsUpdate = true;

    // 粒子逐渐变亮 - 更强的颜色
    if (progress < 0.8) {
      this.convergeMaterial.opacity = 0.5 + 0.5 * (progress / 0.8);
    }

    if (progress < 1) {
      requestAnimationFrame(() => this.animateConverge());
    } else if (this.convergeResolve) {
      this.convergeResolve();
    }
  }

  // 取消粒子汇聚（握拳松开时调用）
  cancelParticleConverge() {
    if (!this.isConverging) return;

    this.isConverging = false;
    this.convergeResolve = null;

    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      this.particleSystem.material.dispose();
      this.particleSystem = null;
    }

    console.log('[card-animations] 取消粒子汇聚');
  }

  // 完成粒子汇聚（握拳1.5秒后调用）
  async completeParticleConverge() {
    if (!this.isConverging) return;

    // 等待粒子汇聚完成
    if (Date.now() - this.convergeStartTime < this.convergeDuration) {
      await new Promise(resolve => {
        this.convergeResolve = resolve;
      });
    }

    // 淡出粒子
    const fadeStart = Date.now();
    const fadeDuration = 200;

    await new Promise(resolve => {
      const fade = () => {
        const progress = (Date.now() - fadeStart) / fadeDuration;
        if (this.convergeMaterial) {
          this.convergeMaterial.opacity = 1.0 * (1 - progress);
        }
        if (progress < 1) {
          requestAnimationFrame(fade);
        } else {
          resolve();
        }
      };
      fade();
    });

    // 清理粒子
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      this.particleSystem.material.dispose();
      this.particleSystem = null;
    }

    this.isConverging = false;
    console.log('[card-animations] 粒子汇聚完成');
  }

  // 执行完整的抓牌动画序列（粒子已在握拳时开始）
  async playGrabAnimation(cardData, isReversed, slotIndex, onComplete) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    try {
      // 1. 完成粒子汇聚（如果正在进行）
      await this.completeParticleConverge();

      // 2. 牌面直接显示正面
      await this.playCardFlip(cardData, isReversed);

      // 3. 牌飞入卡槽
      await this.playFlyToSlot(slotIndex);

      // 4. 清理并回调
      this.cleanup();
      if (onComplete) onComplete();
    } catch (error) {
      console.error('[card-animations] 动画出错:', error);
      this.cleanup();
    }

    this.isAnimating = false;
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

  // 显示牌面 - 粒子汇聚后直接显示正面（无翻转动画）
  playCardFlip(cardData, isReversed) {
    return new Promise(async (resolve) => {
      const displayPos = this.getDisplayPosition();

      // 加载牌面纹理
      const textureLoader = new THREE.TextureLoader();

      // 加载牌面图片（使用 imageFilename 字段）
      const imageUrl = CONFIG.CARD_IMAGE_BASE_URL + cardData.imageFilename;
      console.log('[card-animations] 加载牌面:', cardData.nameCN, imageUrl);

      try {
        this.cardFrontTexture = await new Promise((res, rej) => {
          textureLoader.load(imageUrl, res, undefined, rej);
        });
      } catch (e) {
        console.warn('[card-animations] 牌面图片加载失败，使用默认');
        this.cardBackTexture = this.createCardBackTexture();
        this.cardFrontTexture = this.cardBackTexture;
      }

      // 创建卡牌 - 直接显示正面
      const cardWidth = 1.8;
      const cardHeight = 3.0;
      const geometry = new THREE.PlaneGeometry(cardWidth, cardHeight);

      // 牌面材质（不透明，忽略纹理透明通道）
      const frontMaterial = new THREE.MeshBasicMaterial({
        map: this.cardFrontTexture,
        side: THREE.DoubleSide,
        transparent: false,
        alphaTest: 0,
      });
      // 确保纹理不使用预乘 alpha
      if (this.cardFrontTexture) {
        this.cardFrontTexture.premultiplyAlpha = false;
      }

      // 创建单面牌（只有正面）
      this.cardMesh = new THREE.Mesh(geometry, frontMaterial);

      // 初始位置 - 卡槽前方上方
      this.cardMesh.position.copy(displayPos);

      // 卡牌保持正对摄像头（横平竖直）
      this.cardMesh.rotation.y = 0;

      // 逆位处理 - 绕Z轴旋转180度
      if (isReversed) {
        this.cardMesh.rotation.z = Math.PI;
      }

      this.scene.add(this.cardMesh);

      // 短暂停留让用户看清牌面
      setTimeout(resolve, 600);
    });
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
      // 缩放到卡槽大小 (卡槽 1.4x2.4，卡牌 1.8x3.0)
      const scaleRatio = 1.4 / 1.8;
      const targetScale = new THREE.Vector3(scaleRatio, scaleRatio, scaleRatio);

      // 保存初始旋转（Z轴旋转用于逆位）
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

        // 保持Z轴旋转（逆位状态）
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
    // 展示位置：在卡槽前面（z更大）和上面（y更大）
    return new THREE.Vector3(0, -0.5, 0.5);
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
      // cardMesh 现在是单个 Mesh，不是 Group
      if (this.cardMesh.geometry) {
        this.cardMesh.geometry.dispose();
      }
      if (this.cardMesh.material) {
        this.cardMesh.material.dispose();
      }
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
  }

  dispose() {
    this.cleanup();
  }
}

console.log('[card-animations.js] 模块加载完成');
