// ============================================
// 鼠标交互控制器 - 星环拖拽 + 牌面选择
// ============================================

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class MouseController {
  constructor(options = {}) {
    this.scene = options.scene;           // TarotScene 实例
    this.starRing = options.starRing;     // StarRing 实例
    this.container = options.container;   // canvas 容器
    this.onCardSelect = options.onCardSelect || (() => {});  // 选牌回调

    // Raycaster 用于检测鼠标与牌的交互
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // 拖拽状态
    this.isDragging = false;
    this.dragStartX = 0;
    this.lastDragX = 0;
    this.dragVelocity = 0;

    // 惯性状态
    this.inertiaVelocity = 0;
    this.inertiaDecay = 0.95;  // 惯性衰减系数
    this.minInertia = 0.001;   // 最小惯性阈值

    // 悬停状态
    this.hoveredCard = null;
    this.originalScale = 1.0;
    this.highlightScale = 1.1;

    // 是否启用
    this.isEnabled = false;

    // 绑定方法
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
    this.onClick = this.onClick.bind(this);
    this.update = this.update.bind(this);

    console.log('[mouse-controller] 初始化完成');
  }

  enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;

    const canvas = this.scene.renderer.domElement;
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
    canvas.addEventListener('click', this.onClick);

    // 改变鼠标样式
    canvas.style.cursor = 'grab';

    // 确保星环自动旋转是启用的
    if (this.starRing) {
      this.starRing.setEnabled(true);
    }

    console.log('[mouse-controller] 已启用');
  }

  disable() {
    if (!this.isEnabled) return;
    this.isEnabled = false;

    const canvas = this.scene.renderer.domElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('mouseleave', this.onMouseLeave);
    canvas.removeEventListener('click', this.onClick);

    // 恢复鼠标样式
    canvas.style.cursor = 'default';

    // 恢复星环自动旋转
    if (this.starRing) {
      this.starRing.setEnabled(true);
    }

    // 清除悬停状态
    this.clearHover();

    console.log('[mouse-controller] 已禁用');
  }

  // 更新鼠标坐标为归一化设备坐标
  updateMouseCoords(event) {
    const rect = this.scene.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onMouseDown(event) {
    if (!this.isEnabled) return;

    console.log('[mouse-controller] mousedown, starRing:', !!this.starRing, 'ringGroup:', !!this.starRing?.ringGroup);

    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.lastDragX = event.clientX;
    this.dragVelocity = 0;
    this.inertiaVelocity = 0;  // 停止惯性

    // 改变鼠标样式
    this.scene.renderer.domElement.style.cursor = 'grabbing';

    // 暂停星环自动旋转
    if (this.starRing) {
      this.starRing.setEnabled(false);
    }
  }

  onMouseMove(event) {
    if (!this.isEnabled) return;

    this.updateMouseCoords(event);

    if (this.isDragging) {
      // 拖拽模式：计算水平位移控制旋转
      const deltaX = event.clientX - this.lastDragX;
      this.dragVelocity = deltaX * 0.002;  // 转换为旋转速度

      // 直接旋转星环
      if (this.starRing && this.starRing.ringGroup) {
        this.starRing.ringGroup.rotation.y += this.dragVelocity;
        console.log('[mouse-controller] 旋转星环, deltaX:', deltaX, 'rotation:', this.starRing.ringGroup.rotation.y);
      }

      this.lastDragX = event.clientX;
    } else {
      // 非拖拽模式：检测悬停
      this.checkHover();
    }
  }

  onMouseUp(event) {
    if (!this.isEnabled) return;

    if (this.isDragging) {
      this.isDragging = false;

      // 设置惯性速度
      this.inertiaVelocity = this.dragVelocity * 3;  // 放大惯性效果

      // 恢复鼠标样式
      this.scene.renderer.domElement.style.cursor = 'grab';

      // 如果惯性很小，立即恢复自动旋转
      if (Math.abs(this.inertiaVelocity) <= this.minInertia) {
        this.inertiaVelocity = 0;
        if (this.starRing) {
          this.starRing.setEnabled(true);
        }
      }
    }
  }

  onMouseLeave(event) {
    if (!this.isEnabled) return;

    if (this.isDragging) {
      this.onMouseUp(event);
    }
    this.clearHover();
  }

  onClick(event) {
    if (!this.isEnabled) return;

    // 如果刚刚在拖拽（有明显位移），不触发点击
    const dragDistance = Math.abs(event.clientX - this.dragStartX);
    if (dragDistance > 10) return;

    this.updateMouseCoords(event);

    // 检测点击的牌
    const card = this.getCardUnderMouse();
    if (card) {
      console.log('[mouse-controller] 点击牌:', card.userData.cardData?.nameCN);
      this.onCardSelect(card);
    }
  }

  // 检测鼠标下的牌
  getCardUnderMouse() {
    if (!this.starRing || !this.scene) return null;

    this.raycaster.setFromCamera(this.mouse, this.scene.camera);
    const intersects = this.raycaster.intersectObjects(this.starRing.cardMeshes);

    if (intersects.length > 0) {
      return intersects[0].object;
    }
    return null;
  }

  // 检测悬停
  checkHover() {
    const card = this.getCardUnderMouse();

    if (card !== this.hoveredCard) {
      // 清除之前的悬停效果
      this.clearHover();

      if (card) {
        // 应用新的悬停效果
        this.hoveredCard = card;
        this.applyHoverEffect(card);
      }
    }
  }

  // 应用悬停效果
  applyHoverEffect(card) {
    // 放大效果
    card.scale.setScalar(this.highlightScale);

    // 发光效果（增加自发光强度）
    if (card.material) {
      card.userData.originalEmissiveIntensity = card.material.emissiveIntensity;
      card.material.emissiveIntensity = 0.5;
      card.material.emissive = new THREE.Color(0xd4af37);  // 金色发光
    }

    // 改变鼠标样式
    if (!this.isDragging) {
      this.scene.renderer.domElement.style.cursor = 'pointer';
    }
  }

  // 清除悬停效果
  clearHover() {
    if (this.hoveredCard) {
      // 恢复大小
      this.hoveredCard.scale.setScalar(this.originalScale);

      // 恢复发光
      if (this.hoveredCard.material) {
        const originalIntensity = this.hoveredCard.userData.originalEmissiveIntensity || 0.1;
        this.hoveredCard.material.emissiveIntensity = originalIntensity;
        this.hoveredCard.material.emissive = new THREE.Color(0x7c3aed);  // 恢复紫色
      }

      this.hoveredCard = null;

      // 恢复鼠标样式
      if (!this.isDragging && this.isEnabled) {
        this.scene.renderer.domElement.style.cursor = 'grab';
      }
    }
  }

  // 每帧更新（处理惯性）
  update(delta) {
    if (!this.isEnabled) return;

    // 处理惯性旋转
    if (!this.isDragging && Math.abs(this.inertiaVelocity) > this.minInertia) {
      if (this.starRing && this.starRing.ringGroup) {
        this.starRing.ringGroup.rotation.y += this.inertiaVelocity;
      }

      // 衰减惯性
      this.inertiaVelocity *= this.inertiaDecay;

      // 惯性接近停止时，恢复自动旋转
      if (Math.abs(this.inertiaVelocity) <= this.minInertia) {
        this.inertiaVelocity = 0;
        if (this.starRing) {
          this.starRing.setEnabled(true);
        }
      }
    }
  }

  // 更新星环引用（重建后）
  setStarRing(starRing) {
    this.starRing = starRing;
  }

  dispose() {
    this.disable();
  }
}

console.log('[mouse-controller.js] 模块加载完成');
