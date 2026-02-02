// ============================================
// 塔罗星环 - 3D卡牌环形排列
// ============================================

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { CONFIG } from './config.js';

export class StarRing {
  constructor(cards) {
    this.cards = cards;
    this.cardMeshes = [];

    // 两层嵌套：外层处理朝向，内层处理旋转
    this.group = new THREE.Group();      // 外层：朝向 + 缩放
    this.ringGroup = new THREE.Group();  // 内层：旋转动画
    this.group.add(this.ringGroup);

    // 旋转状态
    this.rotationSpeed = (2 * Math.PI) / (CONFIG.ANIMATION.RING_ROTATION_NORMAL / 1000);
    this.isEnabled = true;

    // 纹理
    this.cardBackTexture = null;

    // 粒子系统
    this.particles = null;
    this.particleTime = 0;

    this.init();
  }

  async init() {
    await this.createCardBackTexture();
    this.createRing();
    // this.createDiffuseGlow(); // 暂时禁用光晕测试色差
    this.createGoldParticles();
    console.log('[star-ring] 星环初始化完成, 共', this.cards.length, '张牌');
  }

  // 创建牌背纹理
  createCardBackTexture() {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 350;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');

      // 紫色渐变背景 (透明度0.8)
      const gradient = ctx.createLinearGradient(0, 0, 0, 600);
      gradient.addColorStop(0, 'rgba(123, 94, 167, 0.8)');
      gradient.addColorStop(0.5, 'rgba(92, 68, 128, 0.8)');
      gradient.addColorStop(1, 'rgba(70, 50, 100, 0.8)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 350, 600);

      // 发光紫色边框
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
      ctx.lineWidth = 12;
      ctx.strokeRect(8, 8, 334, 584);

      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.8)';
      ctx.lineWidth = 6;
      ctx.strokeRect(14, 14, 322, 572);

      ctx.shadowBlur = 5;
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 310, 560);

      // 中心星星
      ctx.shadowColor = '#d4af37';
      ctx.shadowBlur = 15;
      ctx.fillStyle = 'rgba(245, 230, 196, 0.9)';
      ctx.font = '70px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', 175, 300);

      // 角落装饰
      ctx.shadowBlur = 8;
      ctx.font = '20px serif';
      ctx.fillStyle = 'rgba(192, 132, 252, 0.7)';
      ctx.fillText('✧', 50, 50);
      ctx.fillText('✧', 300, 50);
      ctx.fillText('✧', 50, 550);
      ctx.fillText('✧', 300, 550);

      this.cardBackTexture = new THREE.CanvasTexture(canvas);
      this.cardBackTexture.needsUpdate = true;
      resolve();
    });
  }

  // 创建卡牌环 - 1.2倍大小，更紧凑
  createRing() {
    const cardWidth = CONFIG.SCENE.CARD_WIDTH * 1.2;
    const cardHeight = CONFIG.SCENE.CARD_HEIGHT * 1.2;

    // 计算合适的半径，让牌之间有间距
    // 周长 = 牌数 * (牌宽 + 间距)
    const cardSpacing = 0.08; // 牌之间的间距（缩小）
    const circumference = this.cards.length * (cardWidth + cardSpacing);
    const radius = circumference / (2 * Math.PI);

    console.log('[star-ring] 环半径:', radius);

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const angle = (i / this.cards.length) * Math.PI * 2;

      const geometry = new THREE.PlaneGeometry(cardWidth, cardHeight);
      const material = new THREE.MeshStandardMaterial({
        map: this.cardBackTexture,
        side: THREE.DoubleSide,
        transparent: false,
        emissive: new THREE.Color(0x7c3aed),
        emissiveIntensity: 0.1,
      });

      const mesh = new THREE.Mesh(geometry, material);

      // 扁平排列
      mesh.position.x = Math.cos(angle) * radius;
      mesh.position.z = Math.sin(angle) * radius;
      mesh.position.y = 0;

      // 面向圆心
      mesh.lookAt(0, 0, 0);

      mesh.userData = {
        cardIndex: i,
        cardData: card,
        isReversed: Math.random() < CONFIG.REVERSE_PROBABILITY,
      };

      this.cardMeshes.push(mesh);
      this.ringGroup.add(mesh);  // 添加到内层 ringGroup
    }

    // 保存半径供其他方法使用
    this.ringRadius = radius;

    // 不做旋转变换，星环保持在 XZ 平面上（水平）
    // 通过调整相机位置来控制视角

    // 整体缩小星环（0.3 = 缩小到30%）
    this.group.scale.setScalar(0.3);
  }

  // 创建发散光晕效果 - 用渐变纹理的平面
  createDiffuseGlow() {
    const radius = this.ringRadius;

    // 创建渐变光晕纹理
    const glowTexture = this.createGlowTexture();

    // 金色光晕平面 - 放在卡牌下方
    const glowSize = radius * 2.5;
    const geometry = new THREE.PlaneGeometry(glowSize, glowSize);
    const material = new THREE.MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0.5,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const glowPlane = new THREE.Mesh(geometry, material);
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.position.y = -0.1;
    this.group.add(glowPlane);

    // 上方也加一个淡淡的光晕
    const topGlow = glowPlane.clone();
    topGlow.material = material.clone();
    topGlow.material.opacity = 0.3;
    topGlow.position.y = 0.1;
    this.group.add(topGlow);
  }

  // 创建圆形渐变光晕纹理
  createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const centerX = 256;
    const centerY = 256;
    const innerRadius = 100;
    const outerRadius = 256;

    // 创建径向渐变 - 环形发散
    const gradient = ctx.createRadialGradient(
      centerX, centerY, innerRadius,
      centerX, centerY, outerRadius
    );

    // 环形渐变：中心透明 -> 金色环 -> 外部透明
    gradient.addColorStop(0, 'rgba(212, 175, 55, 0)');
    gradient.addColorStop(0.3, 'rgba(212, 175, 55, 0.1)');
    gradient.addColorStop(0.5, 'rgba(212, 175, 55, 0.4)');
    gradient.addColorStop(0.6, 'rgba(251, 191, 36, 0.5)');
    gradient.addColorStop(0.7, 'rgba(212, 175, 55, 0.3)');
    gradient.addColorStop(0.85, 'rgba(139, 92, 246, 0.15)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // 创建星辰纹理 - 增强发光感，支持不同颜色
  createStarTexture(colorType = 'gold') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const centerX = 32;
    const centerY = 32;

    // 根据颜色类型设置不同的颜色
    let outerColors, innerColors;
    if (colorType === 'white') {
      outerColors = ['rgba(255, 255, 255, 0.9)', 'rgba(240, 240, 255, 0.6)', 'rgba(220, 220, 240, 0.3)', 'rgba(200, 200, 220, 0)'];
      innerColors = ['rgba(255, 255, 255, 1)', 'rgba(250, 250, 255, 0.9)', 'rgba(240, 240, 255, 0)'];
    } else if (colorType === 'purple') {
      outerColors = ['rgba(200, 170, 255, 0.9)', 'rgba(180, 150, 230, 0.6)', 'rgba(160, 130, 210, 0.3)', 'rgba(140, 110, 190, 0)'];
      innerColors = ['rgba(255, 255, 255, 1)', 'rgba(230, 210, 255, 0.9)', 'rgba(200, 170, 255, 0)'];
    } else {
      // gold (default)
      outerColors = ['rgba(255, 230, 150, 0.9)', 'rgba(255, 210, 100, 0.6)', 'rgba(255, 190, 80, 0.3)', 'rgba(255, 170, 50, 0)'];
      innerColors = ['rgba(255, 255, 255, 1)', 'rgba(255, 245, 200, 0.9)', 'rgba(255, 220, 150, 0)'];
    }

    // 外层光晕
    const outerGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 32);
    outerGlow.addColorStop(0, outerColors[0]);
    outerGlow.addColorStop(0.2, outerColors[1]);
    outerGlow.addColorStop(0.5, outerColors[2]);
    outerGlow.addColorStop(1, outerColors[3]);
    ctx.fillStyle = outerGlow;
    ctx.fillRect(0, 0, 64, 64);

    // 明亮内核
    const innerGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 12);
    innerGlow.addColorStop(0, innerColors[0]);
    innerGlow.addColorStop(0.5, innerColors[1]);
    innerGlow.addColorStop(1, innerColors[2]);
    ctx.fillStyle = innerGlow;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // 创建多色粒子 - 白色、金色、浅紫色
  createGoldParticles() {
    const radius = this.ringRadius;
    this.particleSystems = [];

    // 三种颜色粒子配置：金色为主，白色和紫色点缀
    const particleConfigs = [
      { type: 'gold', count: 2400 },   // 60%
      { type: 'white', count: 1000 },  // 25%
      { type: 'purple', count: 600 },  // 15%
    ];

    particleConfigs.forEach(config => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(config.count * 3);

      for (let i = 0; i < config.count; i++) {
        const angle = Math.random() * Math.PI * 2;

        // 使用高斯分布让粒子集中在环附近
        const u1 = Math.random();
        const u2 = Math.random();
        const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

        // 标准差1.0，大部分粒子在环半径附近
        const r = radius + gaussian * 1.0;

        // 高度也用类似分布
        const heightGaussian = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
        const height = heightGaussian * 0.5;

        positions[i * 3] = Math.cos(angle) * r;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = Math.sin(angle) * r;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      // 使用对应颜色的星辰纹理
      const starTexture = this.createStarTexture(config.type);

      const material = new THREE.PointsMaterial({
        size: 0.15,
        map: starTexture,
        transparent: true,
        opacity: 0.95,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      const particles = new THREE.Points(geometry, material);
      this.particleSystems.push(particles);
      this.ringGroup.add(particles);  // 添加到内层 ringGroup
    });

    // 保持向后兼容，第一个系统作为主粒子
    this.particles = this.particleSystems[0];
  }

  // 更新动画
  update(delta) {
    if (!this.isEnabled) return;

    // 内层 ringGroup 绕 Y 轴旋转（横向旋转）
    this.ringGroup.rotation.y += this.rotationSpeed * delta;
    this.updateParticles(delta);
  }

  updateParticles(delta) {
    if (!this.particleSystems || this.particleSystems.length === 0) return;

    this.particleTime += delta;

    // 更新所有粒子系统
    this.particleSystems.forEach((particles, systemIndex) => {
      const positions = particles.geometry.attributes.position.array;

      for (let i = 0; i < positions.length / 3; i++) {
        const x = positions[i * 3];
        const z = positions[i * 3 + 2];

        let angle = Math.atan2(z, x);
        const r = Math.sqrt(x * x + z * z);

        // 缓慢绕圈飘动，不同系统速度略有差异
        const speedVariation = 0.8 + Math.random() * 0.4 + systemIndex * 0.05;
        angle += delta * 0.03 * speedVariation;

        positions[i * 3] = Math.cos(angle) * r;
        positions[i * 3 + 2] = Math.sin(angle) * r;

        // 轻微上下浮动
        positions[i * 3 + 1] += Math.sin(this.particleTime * 1.2 + i * 0.1 + systemIndex) * 0.0008;

        if (positions[i * 3 + 1] > 1) positions[i * 3 + 1] = 1;
        if (positions[i * 3 + 1] < -1) positions[i * 3 + 1] = -1;
      }

      particles.geometry.attributes.position.needsUpdate = true;
    });
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  // 设置旋转速度
  setSpeed(mode) {
    if (mode === 'fast') {
      this.rotationSpeed = (2 * Math.PI) / (CONFIG.ANIMATION.RING_ROTATION_FAST / 1000);
      console.log('[star-ring] 加速旋转');
    } else {
      this.rotationSpeed = (2 * Math.PI) / (CONFIG.ANIMATION.RING_ROTATION_NORMAL / 1000);
      console.log('[star-ring] 正常旋转');
    }
  }

  // 获取当前正对摄像头的牌
  getClosestCard(cameraPosition) {
    let closestCard = null;
    let minDistance = Infinity;

    this.cardMeshes.forEach(mesh => {
      // 获取牌的世界坐标
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);

      // 计算到摄像头的距离
      const distance = worldPos.distanceTo(cameraPosition);
      if (distance < minDistance) {
        minDistance = distance;
        closestCard = mesh;
      }
    });

    return closestCard;
  }

  // 移除一张牌（选中后）
  removeCard(mesh) {
    const index = this.cardMeshes.indexOf(mesh);
    if (index > -1) {
      this.cardMeshes.splice(index, 1);
      this.ringGroup.remove(mesh);  // 从内层 ringGroup 移除
    }
  }

  reset() {
    this.cardMeshes.forEach(mesh => {
      mesh.userData.isReversed = Math.random() < CONFIG.REVERSE_PROBABILITY;
    });
  }

  // 重建所有卡牌（重新进入占卜页面时调用）
  rebuild() {
    // 移除现有卡牌
    this.cardMeshes.forEach(mesh => {
      this.ringGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.cardMeshes = [];

    // 重新创建所有卡牌
    this.createRing();
    console.log('[star-ring] 星环已重建，共', this.cardMeshes.length, '张牌');
  }

  dispose() {
    this.cardMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    if (this.cardBackTexture) {
      this.cardBackTexture.dispose();
    }
    // 清理所有粒子系统
    if (this.particleSystems) {
      this.particleSystems.forEach(particles => {
        particles.geometry.dispose();
        particles.material.dispose();
      });
    }
  }
}

console.log('[star-ring.js] 模块加载完成');
