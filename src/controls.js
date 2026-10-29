import * as THREE from 'three';

/**
 * PC(마우스 락 + 키보드) & 모바일/태블릿(가상 조이스틱 + 터치 드래그) 통합 컨트롤러
 * - Pointer Events(pointerdown/move/up) 기반으로 구현되어,
 *   PC에서도 마우스로 가상 조이스틱과 터치 버튼을 직접 눌러 모바일 환경을 완벽히 테스트할 수 있습니다.
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

    // PC vs 모바일/태블릿 정밀 환경 감지
    // Windows/Mac PC에서 터치스크린이나 펜 디스플레이가 감지되더라도 마우스/키보드가 있는 데스크톱은 PC 모드로 동작
    const ua = (navigator.userAgent || '') + ' ' + (navigator.platform || '');
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isTouchOnly = window.matchMedia && window.matchMedia('(pointer: coarse) and (hover: none)').matches;
    const isMobileClient = Boolean(navigator.userAgentData && navigator.userAgentData.mobile);

    const isActualMobile = isMobileUA || isTouchOnly || isMobileClient;
    this.deviceMode = isActualMobile ? 'tablet' : 'pc';

    const touchUI = document.getElementById('touch-controls');
    if (touchUI) {
      touchUI.classList.toggle('hidden', !isActualMobile);
    }

    this.interactRequested = false;
    this.flashlightRequested = false;
    this.cctvRequested = false;
    this.dropRequested = false;
    this.slotRequested = null;
    this.touchSprintActive = false;

    // 가상 조이스틱 포인터 상태
    this.joystickActive = false;
    this.joystickPointerId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this.maxJoystickRadius = 46;

    // 화면 시점 드래그 포인터 상태 (마우스 드래그 & 터치 스와이프 공용)
    this.lookPointerId = null;
    this.lastLookPos = { x: 0, y: 0 };

    this.keys = {};

    this.initPointerAndMouse();
    this.initKeyboard();
    this.initVirtualPad();
    this.updateCameraRotation();
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
    if (this.deviceMode !== 'pc') {
      this.setDeviceMode('pc');
    }
  }

  requestPointerLock() {
    if (this.disabled || this.isLocked) return;
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
    if (thumb) {
      thumb.style.transform = 'translate(0px, 0px)';
    }
  }

  initPointerAndMouse() {
    // 1. PC 모드에서 게임 캔버스/컨테이너 클릭 시 마우스 포인터 락
    const onCanvasOrContainerClick = (e) => {
      if (this.disabled) return;
      if (e.pointerType === 'touch') return;
      if (e.target && e.target.closest && e.target.closest('button, input, select, textarea, .inv-slot, #model-viewer-modal, #escape-success-modal, #game-over-modal, #cctv-overlay, #game-setup-modal, #jumpscare-overlay')) {
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
      if (this.isLocked) {
        this.ensurePcMode();
      }
      if (this.disabled && this.isLocked) {
        this.unlock();
      }
    });

    // 2. 마우스 포인터 락 상태에서의 시점 회전
    window.addEventListener('mousemove', (e) => {
      if (this.disabled) return;
      if (Math.abs(e.movementX) > 0 || Math.abs(e.movementY) > 0) {
        if (!this.isLocked && e.buttons === 0) {
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

    // 3. 태블릿/모바일 터치 또는 PC 마우스 드래그 시점 회전 (마우스 클릭 시 즉시 락 시도)
    this.domElement.addEventListener('pointerdown', (e) => {
      if (this.disabled) return;
      if (e.pointerType === 'mouse' && !this.isLocked) {
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
      if (this.disabled) return;

      if (e.pointerId === this.lookPointerId && !this.isLocked) {
        const dx = e.clientX - this.lastLookPos.x;
        const dy = e.clientY - this.lastLookPos.y;
        this.lastLookPos = { x: e.clientX, y: e.clientY };

        const dragSens = e.pointerType === 'touch' ? 0.0045 : 0.0032;
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
      if (this.disabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      this.ensurePcMode();
      this.keys[e.code] = true;

      if (e.code === 'KeyE' || e.code === 'Space') {
        this.interactRequested = true;
      } else if (e.code === 'KeyF') {
        this.flashlightRequested = true;
      } else if (e.code === 'KeyC') {
        this.cctvRequested = true;
      } else if (e.code === 'KeyQ') {
        this.dropRequested = true;
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
   * 가상 조이스틱 및 우측 터치 액션 버튼 (마우스 클릭/드래그 & 모바일 멀티터치 완벽 호환)
   */
  initVirtualPad() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');

    if (joystickZone && joystickBase && joystickThumb) {
      joystickZone.addEventListener('pointerdown', (e) => {
        if (this.disabled) return;
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
        if (this.disabled) return;
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
        if (this.disabled) return;
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

    if (thumbEl) {
      thumbEl.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
    }

    const factor = clampedDist / this.maxJoystickRadius;
    this.moveRight = Math.cos(angle) * factor;
    this.moveForward = -Math.sin(angle) * factor;
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

  consumeSlotSelect() {
    const val = this.slotRequested;
    this.slotRequested = null;
    return val;
  }
}
