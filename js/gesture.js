// ============================================
// 手势识别模块 - MediaPipe Hands
// ============================================

export class GestureController {
  constructor(options = {}) {
    this.onPalmOpen = options.onPalmOpen || (() => {});
    this.onFistStart = options.onFistStart || (() => {});
    this.onFistHold = options.onFistHold || (() => {});
    this.onFistRelease = options.onFistRelease || (() => {});
    this.onGestureChange = options.onGestureChange || (() => {});
    this.onCameraReady = options.onCameraReady || (() => {});
    this.onCameraError = options.onCameraError || (() => {});
    this.onLoadingStatus = options.onLoadingStatus || (() => {});

    this.hands = null;
    this.camera = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasCtx = null;

    this.isRunning = false;
    this.currentGesture = 'none'; // 'none', 'palm', 'fist'
    this.fistStartTime = null;
    this.fistProgress = 0;
    this.fistHoldDuration = 1000; // 握拳持续1秒确认抓取

    console.log('[gesture] 手势控制器初始化');
  }

  async init() {
    try {
      // 如果已初始化过，只需重新启动摄像头
      if (this.hands) {
        // 创建新的 video 元素
        this.videoElement = document.createElement('video');
        this.videoElement.style.display = 'none';
        this.videoElement.playsInline = true;
        document.body.appendChild(this.videoElement);

        // 重新启动摄像头
        await this.startCamera();
        console.log('[gesture] 重新初始化完成');
        return true;
      }

      // 首次初始化：创建隐藏的 video 元素用于摄像头
      this.videoElement = document.createElement('video');
      this.videoElement.style.display = 'none';
      this.videoElement.playsInline = true;
      document.body.appendChild(this.videoElement);

      // 动态加载 MediaPipe
      this.onLoadingStatus('正在加载手势引擎...');
      await this.loadMediaPipe();

      // 初始化 MediaPipe Hands
      this.onLoadingStatus('正在下载手势模型...');
      this.hands = new window.Hands({
        locateFile: (file) => {
          return `https://cdn.npmmirror.com/packages/@mediapipe/hands/0.4.1675469240/files/${file}`;
        }
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      this.hands.onResults((results) => this.onResults(results));

      // 请求摄像头权限
      this.onLoadingStatus('正在启动摄像头...');
      await this.startCamera();

      console.log('[gesture] 初始化完成');
      return true;
    } catch (error) {
      console.error('[gesture] 初始化失败:', error);
      this.onCameraError(error);
      return false;
    }
  }

  async loadMediaPipe() {
    return new Promise((resolve, reject) => {
      // 检查是否已加载
      if (window.Hands) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.npmmirror.com/packages/@mediapipe/hands/0.4.1675469240/files/hands.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        console.log('[gesture] MediaPipe Hands 加载完成');
        resolve();
      };
      script.onerror = () => reject(new Error('MediaPipe 加载失败'));
      document.head.appendChild(script);
    });
  }

  async startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });

      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      this.isRunning = true;
      this.onCameraReady();
      console.log('[gesture] 摄像头已启动');

      // 开始检测循环
      this.detectLoop();

      return true;
    } catch (error) {
      console.error('[gesture] 摄像头启动失败:', error);
      throw error;
    }
  }

  async detectLoop() {
    if (!this.isRunning) return;

    try {
      if (this.videoElement.readyState >= 2) {
        await this.hands.send({ image: this.videoElement });
      }
    } catch (error) {
      console.error('[gesture] 检测帧出错:', error);
    }

    requestAnimationFrame(() => this.detectLoop());
  }

  onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      // 没有检测到手 - 通过 handleGestureChange 处理，确保 onFistRelease 被调用
      if (this.currentGesture !== 'none') {
        this.handleGestureChange('none');
      }
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const gesture = this.analyzeGesture(landmarks);

    if (gesture !== this.currentGesture) {
      this.handleGestureChange(gesture);
    } else if (gesture === 'fist') {
      this.updateFistProgress();
    }
  }

  analyzeGesture(landmarks) {
    // 使用新算法：检查手指是否弯曲
    const fingersCurled = this.countCurledFingers(landmarks);
    const fingersExtended = this.countExtendedFingers(landmarks);

    console.log('[gesture] 弯曲手指数:', fingersCurled, '伸展手指数:', fingersExtended);

    // 判断手势
    let result = 'none';
    // 张开手掌：至少4根手指伸展
    if (fingersExtended >= 4) {
      result = 'palm';
    }
    // 握拳：至少4根手指弯曲
    else if (fingersCurled >= 4) {
      result = 'fist';
    }

    console.log('[gesture] 分析结果:', result, '当前手势:', this.currentGesture);
    return result;
  }

  // 检查手指是否弯曲（指尖在PIP关节下方或接近手掌）
  countCurledFingers(landmarks) {
    let curled = 0;

    // 手指关键点索引：
    // 拇指: 1(CMC), 2(MCP), 3(IP), 4(TIP)
    // 食指: 5(MCP), 6(PIP), 7(DIP), 8(TIP)
    // 中指: 9(MCP), 10(PIP), 11(DIP), 12(TIP)
    // 无名指: 13(MCP), 14(PIP), 15(DIP), 16(TIP)
    // 小指: 17(MCP), 18(PIP), 19(DIP), 20(TIP)

    // 检查拇指（特殊处理：拇指横向弯曲）
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const thumbMCP = landmarks[2];
    // 拇指弯曲：指尖x坐标接近或超过IP关节（取决于左右手）
    const thumbCurled = Math.abs(thumbTip.x - thumbMCP.x) < Math.abs(thumbIP.x - thumbMCP.x) * 0.8;
    if (thumbCurled) curled++;

    // 检查其他四根手指
    const fingerIndices = [
      { tip: 8, pip: 6, mcp: 5 },   // 食指
      { tip: 12, pip: 10, mcp: 9 }, // 中指
      { tip: 16, pip: 14, mcp: 13 }, // 无名指
      { tip: 20, pip: 18, mcp: 17 }  // 小指
    ];

    for (const finger of fingerIndices) {
      const tip = landmarks[finger.tip];
      const pip = landmarks[finger.pip];
      const mcp = landmarks[finger.mcp];

      // 手指弯曲条件：指尖的y坐标大于PIP关节（在屏幕坐标中y向下增加）
      // 或者指尖到MCP的距离小于PIP到MCP的距离
      const tipBelowPIP = tip.y > pip.y;
      const tipCloseToMCP = this.distance3D(tip, mcp) < this.distance3D(pip, mcp) * 1.5;

      if (tipBelowPIP || tipCloseToMCP) {
        curled++;
      }
    }

    return curled;
  }

  // 检查手指是否伸展
  countExtendedFingers(landmarks) {
    let extended = 0;

    // 检查拇指
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const thumbMCP = landmarks[2];
    const thumbExtended = this.distance3D(thumbTip, thumbMCP) > this.distance3D(thumbIP, thumbMCP) * 1.2;
    if (thumbExtended) extended++;

    // 检查其他四根手指
    const fingerIndices = [
      { tip: 8, pip: 6, mcp: 5 },
      { tip: 12, pip: 10, mcp: 9 },
      { tip: 16, pip: 14, mcp: 13 },
      { tip: 20, pip: 18, mcp: 17 }
    ];

    for (const finger of fingerIndices) {
      const tip = landmarks[finger.tip];
      const pip = landmarks[finger.pip];
      const mcp = landmarks[finger.mcp];

      // 手指伸展条件：指尖的y坐标小于PIP关节（手指向上伸）
      // 且指尖到MCP的距离大于PIP到MCP的距离
      const tipAbovePIP = tip.y < pip.y;
      const tipFarFromMCP = this.distance3D(tip, mcp) > this.distance3D(pip, mcp) * 1.3;

      if (tipAbovePIP && tipFarFromMCP) {
        extended++;
      }
    }

    return extended;
  }

  // 保留旧方法供参考
  calculateFingerExtensions(landmarks) {
    const fingerTips = [4, 8, 12, 16, 20];
    const fingerBases = [2, 5, 9, 13, 17];
    const wrist = landmarks[0];

    const extensions = [];

    for (let i = 0; i < 5; i++) {
      const tip = landmarks[fingerTips[i]];
      const base = landmarks[fingerBases[i]];

      const tipDist = this.distance3D(tip, wrist);
      const baseDist = this.distance3D(base, wrist);

      const extension = baseDist > 0 ? tipDist / baseDist : 0;
      extensions.push(Math.min(extension, 2) / 2);
    }

    return extensions;
  }

  distance3D(a, b) {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }

  handleGestureChange(newGesture) {
    const oldGesture = this.currentGesture;
    this.currentGesture = newGesture;

    console.log('[gesture] 手势变化:', oldGesture, '->', newGesture);

    // 处理手势变化
    // 离开握拳状态时，先触发 onFistRelease
    if (oldGesture === 'fist' && newGesture !== 'fist') {
      this.onFistRelease();
      this.fistStartTime = null;
      this.fistProgress = 0;
    }

    if (newGesture === 'palm') {
      this.onPalmOpen();
    } else if (newGesture === 'fist') {
      this.fistStartTime = Date.now();
      this.fistProgress = 0;
      this.onFistStart();
    } else {
      this.fistStartTime = null;
      this.fistProgress = 0;
    }

    this.onGestureChange(newGesture);
  }

  updateFistProgress() {
    if (!this.fistStartTime) return;

    const elapsed = Date.now() - this.fistStartTime;
    this.fistProgress = Math.min(elapsed / this.fistHoldDuration, 1);

    if (this.fistProgress >= 1) {
      // 握拳持续足够时间，触发抓取
      this.onFistHold();
      // 重置，避免重复触发
      this.fistStartTime = Date.now();
      this.fistProgress = 0;
    }
  }

  getFistProgress() {
    return this.fistProgress;
  }

  getCurrentGesture() {
    return this.currentGesture;
  }

  // 重置握拳计时器（取消抓取时调用，防止快速再握拳时计时累积）
  resetFistTimer() {
    this.fistStartTime = null;
    this.fistProgress = 0;
    console.log('[gesture] 握拳计时器已重置');
  }

  stop() {
    this.isRunning = false;

    if (this.videoElement?.srcObject) {
      this.videoElement.srcObject.getTracks().forEach(track => track.stop());
    }

    if (this.videoElement) {
      this.videoElement.remove();
      this.videoElement = null;
    }

    console.log('[gesture] 已停止');
  }

  dispose() {
    this.stop();
    this.hands = null;
  }
}

console.log('[gesture.js] 模块加载完成');
