import * as THREE from 'three';

/**
 * PC(마우스 락 + 키보드) & 모바일/태블릿(가상 조이스틱 + 터치 드래그) 통합 컨트롤러
 * - 가상 조이스틱, 인체공학적 부채꼴 액션 버튼 클러스터, 자유 드래그 HUD 재배치 모드 지원
 * - 설정에 따른 컨트롤 모드 강제(자동 / 모바일 강제 / PC 강제) 및 localStorage 영구 기억
 */
export class FPSControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.pitch = 0;
    this.yaw = 0;

    this.moveForward = 0;
    this.moveRight = 0;

    this.isLocked = false;
    this.disabled = false;
    this.mouseSensitivity = 1.0;

    // 조작 인터페이스 환경 설정 불러오기 ('auto' | 'touch' | 'pc')
    this.controlPref = localStorage.getItem('monochrome_control_pref') || 'auto';

    // 기본 모바일/태블릿 환경 감지
    const ua = (navigator.userAgent || '') + ' ' + (navigator.platform || '');
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isTouchOnly = window.matchMedia && window.matchMedia('(pointer: coarse) and (hover: none)').matches;
    const isMobileClient = Boolean(navigator.userAgentData && navigator.userAgentData.mobile);

    this.isDeviceMobile = isMobileUA || isTouchOnly || isMobileClient || (hasTouch && window.innerWidth <= 1024);

    if (this.controlPref === 'touch') {
      this.deviceMode = 'tablet';
    } else if (this.controlPref === 'pc') {
      this.deviceMode = 'pc';
    } else {
      this.deviceMode = this.isDeviceMobile ? 'tablet' : 'pc';
    }

    this.interactRequested = false;
    this.flashlightRequested = false;
    this.cctvRequested = false;
    this.dropRequested = false;
    this.mapRequested = false;
    this.slotRequested = null;
    this.touchSprintActive = false;

    // 가상 조이스틱 포인터 상태
    this.joystickActive = false;
    this.joystickPointerId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this.maxJoystickRadius = 48;

    // 화면 시점 드래그 포인터 상태 (마우스 드래그 & 터치 스와이프 공용)
    this.lookPointerId = null;
    this.lastLookPos = { x: 0, y: 0 };

    this.keys = {};

    // HUD 자유 배치 편집 상태
    this.isHudEditing = false;
    this.draggingHudItem = null;
    this.hudDragOffset = { x: 0, y: 0 };

    // 저장된 터치 설정 불러오기
    this.touchConfig = {
      joystickSize: 130,
      btnSize: 60,
      opacity: 85,
      isSwapped: false
    };
    try {
      const savedConfig = localStorage.getItem('monochrome_touch_config');
      if (savedConfig) {
        Object.assign(this.touchConfig, JSON.parse(savedConfig));
      }
    } catch (_) {}

    this.initPointerAndMouse();
    this.initKeyboard();
    this.initVirtualPad();
    this.initHudEditor();
    this.applyTouchConfig(this.touchConfig);
    this.loadSavedPositions();
    this.setDeviceMode(this.deviceMode);
    this.updateCameraRotation();
  }

  setControlPref(pref) {
    this.controlPref = pref;
    localStorage.setItem('monochrome_control_pref', pref);
    if (pref === 'touch') {
      this.setDeviceMode('tablet');
    } else if (pref === 'pc') {
      this.setDeviceMode('pc');
    } else {
      this.setDeviceMode(this.isDeviceMobile ? 'tablet' : 'pc');
    }
  }

  setDeviceMode(mode) {
    this.deviceMode = mode;
    const touchUI = document.getElementById('touch-controls');
    if (touchUI) {
      touchUI.classList.toggle('hidden', mode !== 'tablet');
    }
    const hudHint = document.getElementById('hud-hint-text');
    if (hudHint) {
      hudHint.textContent = mode === 'tablet'
        ? '[TOUCH: MOVE JOYSTICK / DRAG VIEW / USE BUTTONS]'
        : '[WASD: 이동 | Shift: 달리기 | E: 작동/습득 | Q: 버리기/점화 | 1~3: 슬롯 | F: 손전등 | P: 정전테스트]';
    }
    if (mode === 'tablet') {
      this.unlock();
    }
  }

  ensurePcMode() {
    // 사용자가 명시적으로 터치 모드를 활성화했거나 편집 모드인 경우 PC 모드로 강제 변경 금지
    if (this.controlPref === 'touch' || this.isHudEditing) return;
    if (this.deviceMode !== 'pc') {
      this.setDeviceMode('pc');
    }
  }

  requestPointerLock() {
    if (this.disabled || this.isLocked || this.deviceMode === 'tablet' || this.controlPref === 'touch' || this.isHudEditing) return;
    if (this.domElement && this.domElement.requestPointerLock) {
      try {
        const promise = this.domElement.requestPointerLock();
        if (promise && promise.catch) {
          promise.catch(() => {});
        }
      } catch (_) {}
    }
  }

  setDisabled(flag) {
    this.disabled = flag;
    if (flag) {
      this.unlock();
      this.keys = {};
      this.resetJoystick();
      this.lookPointerId = null;
    }
  }

  unlock() {
    this.isLocked = false;
    this.lookPointerId = null;
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (_) {}
    }
  }

  resetJoystick() {
    this.joystickActive = false;
    this.joystickPointerId = null;
    this.moveForward = 0;
    this.moveRight = 0;
    const thumb = document.getElementById('joystick-thumb');
    const base = document.getElementById('joystick-base');
    if (thumb) {
      thumb.style.transform = 'translate(0px, 0px)';
      thumb.classList.remove('active');
    }
    if (base) {
      base.classList.remove('active');
    }
  }

  initPointerAndMouse() {
    // 1. PC 모드에서 게임 캔버스/컨테이너 클릭 시 마우스 포인터 락
    const onCanvasOrContainerClick = (e) => {
      if (this.disabled || this.isHudEditing) return;
      if (this.controlPref === 'touch' || this.deviceMode === 'tablet') return;
      if (e.pointerType === 'touch') return;
      if (e.target && e.target.closest && e.target.closest('button, input, select, textarea, .inv-slot, .hud-touch-item, #model-viewer-modal, #escape-success-modal, #game-over-modal, #cctv-overlay, #game-setup-modal, #jumpscare-overlay, #hud-edit-overlay, #tactical-map-modal')) {
        return;
      }
      this.ensurePcMode();
      this.requestPointerLock();
    };

    this.domElement.addEventListener('click', onCanvasOrContainerClick);
    const container = document.getElementById('game-container');
    if (container && container !== this.domElement) {
      container.addEventListener('click', onCanvasOrContainerClick);
    }

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = (document.pointerLockElement === this.domElement);
      if (this.isLocked && this.controlPref !== 'touch') {
        this.ensurePcMode();
      }
      if (this.disabled && this.isLocked) {
        this.unlock();
      }
    });

    // 2. 마우스 포인터 락 상태에서의 시점 회전
    window.addEventListener('mousemove', (e) => {
      if (this.disabled || this.isHudEditing) return;
      if (Math.abs(e.movementX) > 0 || Math.abs(e.movementY) > 0) {
        if (!this.isLocked && e.buttons === 0 && this.controlPref !== 'touch') {
          this.ensurePcMode();
        }
      }
      if (!this.isLocked) return;
      if (Math.abs(e.movementX) > 160 || Math.abs(e.movementY) > 160) return;

      const sensitivity = 0.0022 * (this.mouseSensitivity || 1.0);
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;

      const maxPitch = Math.PI / 2 - 0.08;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      this.updateCameraRotation();
    });

    // 3. 태블릿/모바일 터치 또는 PC 마우스 드래그 시점 회전
    this.domElement.addEventListener('pointerdown', (e) => {
      if (this.disabled || this.isHudEditing) return;

      // 터치 버튼 또는 UI 클릭 시 시점 회전 드래그 무시
      if (e.target && e.target.closest && e.target.closest('.hud-touch-item, button, input, select, textarea, .inv-slot')) {
        return;
      }

      if (e.pointerType === 'mouse' && !this.isLocked && this.controlPref !== 'touch' && this.deviceMode === 'pc') {
        this.ensurePcMode();
        this.requestPointerLock();
      }
      if (this.isLocked) return;
      if (e.pointerId === this.joystickPointerId) return;
      if (this.lookPointerId !== null) return;

      this.lookPointerId = e.pointerId;
      this.lastLookPos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (this.disabled || this.isHudEditing) return;

      if (e.pointerId === this.lookPointerId && !this.isLocked) {
        const dx = e.clientX - this.lastLookPos.x;
        const dy = e.clientY - this.lastLookPos.y;
        this.lastLookPos = { x: e.clientX, y: e.clientY };

        const dragSens = (e.pointerType === 'touch' ? 0.0042 : 0.0030) * (this.mouseSensitivity || 1.0);
        this.yaw -= dx * dragSens;
        this.pitch -= dy * dragSens;

        const maxPitch = Math.PI / 2 - 0.08;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
        this.updateCameraRotation();
      }
    });

    const endLookPointer = (e) => {
      if (e.pointerId === this.lookPointerId) {
        this.lookPointerId = null;
      }
    };
    window.addEventListener('pointerup', endLookPointer);
    window.addEventListener('pointercancel', endLookPointer);
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this.disabled || this.isHudEditing) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (this.controlPref !== 'touch') {
        this.ensurePcMode();
      }
      this.keys[e.code] = true;

      if (e.code === 'KeyE' || e.code === 'Space') {
        this.interactRequested = true;
      } else if (e.code === 'KeyF') {
        this.flashlightRequested = true;
      } else if (e.code === 'KeyC') {
        this.cctvRequested = true;
      } else if (e.code === 'KeyQ') {
        this.dropRequested = true;
      } else if (e.code === 'KeyM') {
        this.mapRequested = true;
      } else if (e.code === 'Digit1') {
        this.slotRequested = 0;
      } else if (e.code === 'Digit2') {
        this.slotRequested = 1;
      } else if (e.code === 'Digit3') {
        this.slotRequested = 2;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
      this.resetJoystick();
    });
  }

  /**
   * 가상 조이스틱 및 우측 터치 액션 버튼
   */
  initVirtualPad() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');

    if (joystickZone && joystickBase && joystickThumb) {
      joystickZone.addEventListener('pointerdown', (e) => {
        if (this.disabled || this.isHudEditing) return;
        e.preventDefault();
        e.stopPropagation();

        this.joystickActive = true;
        this.joystickPointerId = e.pointerId;
        try {
          joystickZone.setPointerCapture(e.pointerId);
        } catch (_) {}

        const rect = joystickBase.getBoundingClientRect();
        this.joystickOrigin = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        this.updateJoystick(e.clientX, e.clientY, joystickThumb);
      });

      joystickZone.addEventListener('pointermove', (e) => {
        if (this.disabled || this.isHudEditing) return;
        if (!this.joystickActive || e.pointerId !== this.joystickPointerId) return;
        e.preventDefault();
        this.updateJoystick(e.clientX, e.clientY, joystickThumb);
      });

      const releaseJoystick = (e) => {
        if (e.pointerId === this.joystickPointerId) {
          this.resetJoystick();
        }
      };
      joystickZone.addEventListener('pointerup', releaseJoystick);
      joystickZone.addEventListener('pointercancel', releaseJoystick);
    }

    const bindActionButton = (id, callback) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        if (this.disabled || this.isHudEditing) return;
        e.preventDefault();
        e.stopPropagation();
        callback();
      });
    };

    bindActionButton('btn-touch-interact', () => {
      this.interactRequested = true;
    });
    bindActionButton('btn-touch-flashlight', () => {
      this.flashlightRequested = true;
    });
    bindActionButton('btn-touch-cctv', () => {
      this.cctvRequested = true;
    });
    bindActionButton('btn-touch-sprint', () => {
      this.touchSprintActive = !this.touchSprintActive;
      const btn = document.getElementById('btn-touch-sprint');
      if (btn) btn.classList.toggle('active', this.touchSprintActive);
    });
    bindActionButton('btn-touch-drop', () => {
      this.dropRequested = true;
    });
    bindActionButton('btn-touch-map', () => {
      this.mapRequested = true;
    });

    for (let i = 0; i < 3; i++) {
      bindActionButton(`inv-slot-${i}`, () => {
        this.slotRequested = i;
      });
    }
  }

  updateJoystick(clientX, clientY, thumbEl) {
    const dx = clientX - this.joystickOrigin.x;
    const dy = clientY - this.joystickOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const clampedDist = Math.min(dist, this.maxJoystickRadius);
    const angle = Math.atan2(dy, dx);

    const thumbX = Math.cos(angle) * clampedDist;
    const thumbY = Math.sin(angle) * clampedDist;

    const base = document.getElementById('joystick-base');
    if (thumbEl) {
      thumbEl.classList.add('active');
      thumbEl.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
    }
    if (base) {
      base.classList.add('active');
    }

    const factor = clampedDist / this.maxJoystickRadius;
    this.moveRight = Math.cos(angle) * factor;
    this.moveForward = -Math.sin(angle) * factor;
  }

  /**
   * HUD 버튼 크기, 조이스틱 크기, 불투명도 및 좌우 스왑 적용
   */
  applyTouchConfig(config) {
    if (!config) return;
    this.touchConfig = Object.assign(this.touchConfig || {}, config);
    try {
      localStorage.setItem('monochrome_touch_config', JSON.stringify(this.touchConfig));
    } catch (_) {}

    const root = document.documentElement;
    if (this.touchConfig.joystickSize) {
      root.style.setProperty('--joystick-size', `${this.touchConfig.joystickSize}px`);
      this.maxJoystickRadius = Math.round(this.touchConfig.joystickSize * 0.38);
    }
    if (this.touchConfig.btnSize) {
      root.style.setProperty('--touch-btn-size', `${this.touchConfig.btnSize}px`);
      root.style.setProperty('--touch-interact-size', `${Math.round(this.touchConfig.btnSize * 1.2)}px`);
    }
    if (this.touchConfig.opacity) {
      root.style.setProperty('--touch-opacity', `${this.touchConfig.opacity / 100}`);
    }

    const touchUI = document.getElementById('touch-controls');
    if (touchUI) {
      touchUI.classList.toggle('swap-hands', Boolean(this.touchConfig.isSwapped));
    }
  }

  /**
   * 저장된 커스텀 위치 좌표 불러오기
   */
  loadSavedPositions() {
    try {
      const raw = localStorage.getItem('monochrome_touch_positions');
      if (!raw) return;
      const positions = JSON.parse(raw);
      document.querySelectorAll('.hud-touch-item').forEach(el => {
        const hudId = el.dataset.hudId;
        if (hudId && positions[hudId]) {
          const p = positions[hudId];
          if (p.left !== undefined) el.style.left = p.left;
          if (p.top !== undefined) el.style.top = p.top;
          if (p.right !== undefined) el.style.right = p.right;
          if (p.bottom !== undefined) el.style.bottom = p.bottom;
        }
      });
    } catch (_) {}
  }

  /**
   * 현재 화면의 각 터치 요소 위치를 localStorage에 저장
   */
  saveTouchPositions() {
    const positions = {};
    document.querySelectorAll('.hud-touch-item').forEach(el => {
      const hudId = el.dataset.hudId;
      if (!hudId) return;
      positions[hudId] = {
        left: el.style.left || '',
        top: el.style.top || '',
        right: el.style.right || '',
        bottom: el.style.bottom || ''
      };
    });
    try {
      localStorage.setItem('monochrome_touch_positions', JSON.stringify(positions));
    } catch (_) {}
  }

  /**
   * 커스텀 위치를 기본 인체공학적 부채꼴 배치로 리셋
   */
  resetTouchLayout() {
    document.querySelectorAll('.hud-touch-item').forEach(el => {
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
    });
    try {
      localStorage.removeItem('monochrome_touch_positions');
    } catch (_) {}
  }

  /**
   * HUD 레이아웃 자유 편집 드래그 & 드롭 시스템 초기화
   */
  initHudEditor() {
    const editOverlay = document.getElementById('hud-edit-overlay');
    const btnSave = document.getElementById('btn-save-hud-layout');
    const btnRevert = document.getElementById('btn-revert-hud-layout');

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        this.saveTouchPositions();
        this.closeHudEditor();
      });
    }

    if (btnRevert) {
      btnRevert.addEventListener('click', () => {
        this.resetTouchLayout();
        this.closeHudEditor();
      });
    }

    // 각 .hud-touch-item 요소에 편집 모드 드래그 핸들러 연결
    document.querySelectorAll('.hud-touch-item').forEach(item => {
      item.addEventListener('pointerdown', (e) => {
        if (!this.isHudEditing) return;
        e.preventDefault();
        e.stopPropagation();

        this.draggingHudItem = item;
        try {
          item.setPointerCapture(e.pointerId);
        } catch (_) {}

        const rect = item.getBoundingClientRect();
        this.hudDragOffset = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      });

      item.addEventListener('pointermove', (e) => {
        if (!this.isHudEditing || this.draggingHudItem !== item) return;
        e.preventDefault();

        const rect = item.getBoundingClientRect();
        const newLeft = e.clientX - this.hudDragOffset.x;
        const newTop = e.clientY - this.hudDragOffset.y;

        const clampLeft = Math.max(8, Math.min(window.innerWidth - rect.width - 8, newLeft));
        const clampTop = Math.max(8, Math.min(window.innerHeight - rect.height - 8, newTop));

        item.style.left = `${clampLeft}px`;
        item.style.top = `${clampTop}px`;
        item.style.right = 'auto';
        item.style.bottom = 'auto';
      });

      const stopDrag = (e) => {
        if (this.draggingHudItem === item) {
          this.draggingHudItem = null;
        }
      };
      item.addEventListener('pointerup', stopDrag);
      item.addEventListener('pointercancel', stopDrag);
    });
  }

  openHudEditor() {
    this.isHudEditing = true;
    this.unlock();
    const touchUI = document.getElementById('touch-controls');
    if (touchUI) {
      touchUI.classList.remove('hidden');
      touchUI.classList.add('hud-editing');
    }
    const editOverlay = document.getElementById('hud-edit-overlay');
    if (editOverlay) {
      editOverlay.classList.remove('hidden');
    }
  }

  closeHudEditor() {
    this.isHudEditing = false;
    this.draggingHudItem = null;
    const touchUI = document.getElementById('touch-controls');
    if (touchUI) {
      touchUI.classList.remove('hud-editing');
      if (this.deviceMode !== 'tablet') {
        touchUI.classList.add('hidden');
      }
    }
    const editOverlay = document.getElementById('hud-edit-overlay');
    if (editOverlay) {
      editOverlay.classList.add('hidden');
    }
  }

  updateCameraRotation() {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = this.pitch;
    euler.y = this.yaw;
    this.camera.quaternion.setFromEuler(euler);
  }

  getMovementDirection() {
    if (this.disabled) return new THREE.Vector3();

    let fwd = 0;
    let right = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) fwd += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) fwd -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) right -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) right += 1;

    if (fwd === 0 && right === 0) {
      fwd = this.moveForward;
      right = this.moveRight;
    }

    const dir = new THREE.Vector3();
    if (fwd !== 0 || right !== 0) {
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);

      dir.x = -sin * fwd + cos * right;
      dir.z = -cos * fwd - sin * right;
      if (dir.lengthSq() > 1) dir.normalize();
    }

    return dir;
  }

  isSprinting() {
    if (this.disabled) return false;
    return Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchSprintActive);
  }

  consumeInteract() {
    const val = this.interactRequested;
    this.interactRequested = false;
    return val;
  }

  consumeFlashlight() {
    const val = this.flashlightRequested;
    this.flashlightRequested = false;
    return val;
  }

  consumeCCTV() {
    const val = this.cctvRequested;
    this.cctvRequested = false;
    return val;
  }

  consumeDrop() {
    const val = this.dropRequested;
    this.dropRequested = false;
    return val;
  }

  consumeMap() {
    const val = this.mapRequested;
    this.mapRequested = false;
    return val;
  }

  consumeSlotSelect() {
    const val = this.slotRequested;
    this.slotRequested = null;
    return val;
  }
}
