// ============================================
// 调试控制器 - 用于调整相机和卡槽位置
// ============================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from './config.js?v=66';

export class DebugControls {
  constructor(camera, renderer, cardAnimator) {
    this.camera = camera;
    this.renderer = renderer;
    this.cardAnimator = cardAnimator;
    this.orbitControls = null;
    this.selectedSlot = 0; // 当前选中的卡槽 (0-2)
    this.moveSpeed = 0.1;

    this.init();
  }

  init() {
    // 创建 OrbitControls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    // 使用配置中的相机目标
    this.orbitControls.target.set(
      CONFIG.SCENE.CAMERA_LOOKAT.x,
      CONFIG.SCENE.CAMERA_LOOKAT.y,
      CONFIG.SCENE.CAMERA_LOOKAT.z
    );

    // 键盘控制
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // 创建调试面板
    this.createDebugPanel();

    console.log('[debug] 调试控制器已启用');
    console.log('[debug] 鼠标拖拽旋转相机，滚轮缩放');
    console.log('[debug] 按 1/2/3 选择卡槽，WASD/QE 移动卡槽');
    console.log('[debug] 按 P 输出当前配置');
  }

  createDebugPanel() {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.innerHTML = `
      <div style="
        position: fixed;
        top: 60px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        color: #fff;
        padding: 15px;
        font-family: monospace;
        font-size: 12px;
        border-radius: 8px;
        z-index: 1000;
        min-width: 280px;
      ">
        <div style="font-weight: bold; margin-bottom: 10px; color: #ffd700;">🎮 调试模式</div>
        <div style="margin-bottom: 8px;">
          <span style="color: #aaa;">相机位置:</span>
          <span id="debug-camera-pos">-</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #aaa;">相机目标:</span>
          <span id="debug-camera-target">-</span>
        </div>
        <hr style="border-color: #444; margin: 10px 0;">
        <div style="margin-bottom: 8px;">
          <span style="color: #aaa;">选中卡槽:</span>
          <span id="debug-selected-slot" style="color: #ffd700;">1</span>
          <span style="color: #666;"> (按 1/2/3 切换)</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="color: #aaa;">卡槽位置:</span>
          <span id="debug-slot-pos">-</span>
        </div>
        <hr style="border-color: #444; margin: 10px 0;">
        <div style="color: #888; font-size: 11px;">
          <div>🖱️ 鼠标拖拽: 旋转相机</div>
          <div>🖱️ 滚轮: 缩放</div>
          <div>⌨️ WASD: 移动卡槽 (XZ)</div>
          <div>⌨️ Q/E: 上下移动卡槽 (Y)</div>
          <div>⌨️ P: 输出配置到控制台</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // 定时更新显示
    setInterval(() => this.updateDebugInfo(), 100);
  }

  updateDebugInfo() {
    const camPos = document.getElementById('debug-camera-pos');
    const camTarget = document.getElementById('debug-camera-target');
    const selectedSlot = document.getElementById('debug-selected-slot');
    const slotPos = document.getElementById('debug-slot-pos');

    if (camPos && this.camera) {
      camPos.textContent = `(${this.camera.position.x.toFixed(1)}, ${this.camera.position.y.toFixed(1)}, ${this.camera.position.z.toFixed(1)})`;
    }

    if (camTarget && this.orbitControls) {
      const t = this.orbitControls.target;
      camTarget.textContent = `(${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(1)})`;
    }

    if (selectedSlot) {
      selectedSlot.textContent = (this.selectedSlot + 1).toString();
    }

    if (slotPos && this.cardAnimator && this.cardAnimator.slots[this.selectedSlot]) {
      const pos = this.cardAnimator.slots[this.selectedSlot].mesh.position;
      slotPos.textContent = `(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`;
    }
  }

  handleKeyDown(e) {
    const key = e.key.toLowerCase();

    // 选择卡槽
    if (key === '1') this.selectedSlot = 0;
    if (key === '2') this.selectedSlot = 1;
    if (key === '3') this.selectedSlot = 2;

    // 移动卡槽
    if (this.cardAnimator && this.cardAnimator.slots[this.selectedSlot]) {
      const slot = this.cardAnimator.slots[this.selectedSlot];
      const mesh = slot.mesh;

      if (key === 'w') mesh.position.z -= this.moveSpeed;
      if (key === 's') mesh.position.z += this.moveSpeed;
      if (key === 'a') mesh.position.x -= this.moveSpeed;
      if (key === 'd') mesh.position.x += this.moveSpeed;
      if (key === 'q') mesh.position.y -= this.moveSpeed;
      if (key === 'e') mesh.position.y += this.moveSpeed;

      // 同步更新 slot.position
      slot.position.copy(mesh.position);
    }

    // 输出配置
    if (key === 'p') {
      this.printConfig();
    }
  }

  printConfig() {
    console.log('\n========== 当前配置 ==========');
    console.log('// 相机配置');
    console.log(`CAMERA_POSITION: { x: ${this.camera.position.x.toFixed(1)}, y: ${this.camera.position.y.toFixed(1)}, z: ${this.camera.position.z.toFixed(1)} },`);
    console.log(`CAMERA_LOOKAT: { x: ${this.orbitControls.target.x.toFixed(1)}, y: ${this.orbitControls.target.y.toFixed(1)}, z: ${this.orbitControls.target.z.toFixed(1)} },`);

    if (this.cardAnimator && this.cardAnimator.slots.length === 3) {
      console.log('\n// 卡槽位置');
      this.cardAnimator.slots.forEach((slot, i) => {
        const p = slot.mesh.position;
        console.log(`卡槽${i + 1}: { x: ${p.x.toFixed(2)}, y: ${p.y.toFixed(2)}, z: ${p.z.toFixed(2)} }`);
      });
    }
    console.log('================================\n');
  }

  update() {
    if (this.orbitControls) {
      this.orbitControls.update();
    }
  }

  dispose() {
    if (this.orbitControls) {
      this.orbitControls.dispose();
    }
    const panel = document.getElementById('debug-panel');
    if (panel) {
      panel.remove();
    }
  }
}

console.log('[debug-controls.js] 模块加载完成');
