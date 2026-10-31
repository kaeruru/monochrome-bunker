import * as THREE from 'three';
import { sound } from './audio.js';
import { MAP_COLS, MAP_ROWS, worldToTile } from './tilemapData.js';

/**
 * 3D CCTV 보안 관제 모니터 시스템
 * - 오픈 시 자동으로 마우스 포인터 락을 해제하고 FPS 플레이어 컨트롤을 비활성화합니다.
 * - 야간 투시(Night Vision) 스포트라이트가 내장되어 어두운 복도도 선명하게 감시할 수 있습니다.
 * - 마우스/터치 드래그 또는 WASD/방향키로 카메라 각도(Pan/Tilt)를 회전할 수 있습니다.
 * - 우측 상단 미니 전술 레이더에 카메라 위치, 시야각, 방호문 개폐 상태가 실시간 표시됩니다.
 */
export class CCTVSystem3D {
  constructor(scene, cctvConfigs, options = {}) {
    this.scene = scene;
    this.onDoorToggle = options.onDoorToggle || null;
    this.onStateChange = options.onStateChange || null;

    this.isOpen = false;
    this.activeCamId = 1;
    this.cctvCameras = {};

    // 야간 투시용 CCTV 전용 라이트 (CCTV가 켜져 있을 때만 활성화)
    this.nvSpotLight = new THREE.SpotLight(0xe6fff0, 36, 38, Math.PI / 2.1, 0.45, 1.1);
    this.nvSpotLight.visible = false;
    this.nvTarget = new THREE.Object3D();
    this.scene.add(this.nvSpotLight);
    this.scene.add(this.nvTarget);
    this.nvSpotLight.target = this.nvTarget;

    this.nvFillLight = new THREE.PointLight(0xe6fff0, 7, 15, 1.4);
    this.nvFillLight.visible = false;
    this.scene.add(this.nvFillLight);

    // 드래그 회전 상태
    this.isDragging = false;
    this.dragPointerId = null;
    this.lastDragPos = { x: 0, y: 0 };
    this.panKeys = {};

    this.overlayEl = document.getElementById('cctv-overlay');
    this.camTitleEl = document.getElementById('cctv-cam-title');
    this.timeEl = document.getElementById('cctv-time');
    this.exitBtn = document.getElementById('btn-exit-cctv');
    this.minimapCanvas = document.getElementById('cctv-minimap');

    this.setConfigs(cctvConfigs || []);
    this.initUI();
  }

  setConfigs(cctvConfigs) {
    this.configs = cctvConfigs || [];
    this.cctvCameras = {};

    const aspect = window.innerWidth / window.innerHeight;
    for (const cfg of this.configs) {
      const cam = new THREE.PerspectiveCamera(72, aspect, 0.05, 90);
      const pos = cfg.pos || cfg.camPos || { x: 0, y: 2.8, z: 0 };
      cam.position.set(pos.x, pos.y, pos.z);

      const entry = {
        camera: cam,
        config: cfg,
        baseYaw: cfg.baseYaw ?? 0,
        basePitch: cfg.basePitch ?? -0.22,
        panOffset: 0,
        tiltOffset: 0
      };
      this.cctvCameras[cfg.id] = entry;
      this.applyCameraAngles(entry);
    }

    if (this.configs.length > 0) {
      if (!this.cctvCameras[this.activeCamId]) {
        this.activeCamId = this.configs[0].id;
      }
    }
    this.renderCameraButtons();
  }

  applyCameraAngles(entry) {
    if (!entry) return;
    const yaw = entry.baseYaw + entry.panOffset;
    const pitch = entry.basePitch + entry.tiltOffset;

    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    entry.camera.quaternion.setFromEuler(euler);

    if (this.isOpen && this.cctvCameras[this.activeCamId] === entry) {
      this.nvSpotLight.position.copy(entry.camera.position);
      this.nvFillLight.position.copy(entry.camera.position);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(entry.camera.quaternion);
      this.nvTarget.position.copy(entry.camera.position).addScaledVector(forward, 10);
    }
  }

  resize(aspect) {
    Object.values(this.cctvCameras).forEach(c => {
      c.camera.aspect = aspect;
      c.camera.updateProjectionMatrix();
    });
  }

  renderCameraButtons() {
    const selector = document.querySelector('.cctv-cam-selector');
    if (!selector) return;

    selector.innerHTML = '';
    if (this.configs.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = '설치된 CCTV 카메라(1~4)가 없습니다.';
      emptyMsg.style.gridColumn = 'span 4';
      emptyMsg.style.textAlign = 'center';
      selector.appendChild(emptyMsg);
      return;
    }

    for (const cfg of this.configs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cam-btn ${cfg.id === this.activeCamId ? 'active' : ''}`;
      btn.dataset.cam = String(cfg.id);
      btn.textContent = cfg.name || `CAM 0${cfg.id}`;
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectCamera(cfg.id);
      });
      selector.appendChild(btn);
    }
  }

  initUI() {
    if (this.exitBtn) {
      this.exitBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.exitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // CCTV 화면 드래그로 카메라 각도(Pan/Tilt) 회전 (PC 마우스 & 모바일 터치 공용)
    if (this.overlayEl) {
      this.overlayEl.addEventListener('pointerdown', (e) => {
        if (!this.isOpen) return;
        if (e.target.closest('button') || e.target.closest('.cctv-controls')) return;

        this.isDragging = true;
        this.dragPointerId = e.pointerId;
        this.lastDragPos = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener('pointermove', (e) => {
        if (!this.isOpen || !this.isDragging || e.pointerId !== this.dragPointerId) return;

        const dx = e.clientX - this.lastDragPos.x;
        const dy = e.clientY - this.lastDragPos.y;
        this.lastDragPos = { x: e.clientX, y: e.clientY };

        const active = this.cctvCameras[this.activeCamId];
        if (active) {
          active.panOffset = Math.max(-1.25, Math.min(1.25, active.panOffset - dx * 0.0045));
          active.tiltOffset = Math.max(-0.55, Math.min(0.45, active.tiltOffset - dy * 0.0035));
          this.applyCameraAngles(active);
        }
      });

      const stopDrag = (e) => {
        if (e.pointerId === this.dragPointerId) {
          this.isDragging = false;
          this.dragPointerId = null;
        }
      };
      window.addEventListener('pointerup', stopDrag);
      window.addEventListener('pointercancel', stopDrag);
    }

    // 키보드 단축키: 1~4번으로 카메라 전환, WASD/방향키로 카메라 회전, ESC/C로 종료
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      this.panKeys[e.code] = true;

      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
        if (this.cctvCameras[1]) this.selectCamera(1);
      } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        if (this.cctvCameras[2]) this.selectCamera(2);
      } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        if (this.cctvCameras[3]) this.selectCamera(3);
      } else if (e.code === 'Digit4' || e.code === 'Numpad4') {
        if (this.cctvCameras[4]) this.selectCamera(4);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.panKeys[e.code] = false;
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.panKeys = {};

    // 마우스 포인터 락 강제 해제 및 플레이어 이동 정지 콜백 호출
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (_) {}
    }
    if (this.onStateChange) {
      this.onStateChange(true);
    }

    if (this.overlayEl) {
      this.overlayEl.classList.remove('hidden');
    }
    this.nvSpotLight.visible = true;
    this.nvFillLight.visible = true;

    // 챕터별 UI 및 방호문 컨테이너 상태 동기화 (챕터 2는 방호문 미존재)
    this.updateDoorButtons(this.map ? this.map.doors : []);
    const minimapTitleEl = document.querySelector('.minimap-title');
    if (minimapTitleEl) {
      const isCh2 = this.map && this.map.chapterId === 'chapter2';
      minimapTitleEl.textContent = isCh2
        ? 'TACTICAL RADAR // WATERWAY SURVEILLANCE'
        : 'TACTICAL RADAR (GREEN: OPEN / RED: CLOSED)';
    }

    sound.playCCTVSwitch();
    this.selectCamera(this.activeCamId);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.isDragging = false;
    this.panKeys = {};

    this.nvSpotLight.visible = false;
    this.nvFillLight.visible = false;

    if (this.overlayEl) {
      this.overlayEl.classList.add('hidden');
    }
    sound.playCCTVSwitch();

    if (this.onStateChange) {
      this.onStateChange(false);
    }
  }

  selectCamera(camId) {
    if (!this.cctvCameras[camId]) {
      const firstId = Object.keys(this.cctvCameras)[0];
      if (!firstId) return;
      camId = parseInt(firstId, 10);
    }

    this.activeCamId = camId;
    sound.playCCTVSwitch();

    const target = this.cctvCameras[camId];
    if (target) {
      this.applyCameraAngles(target);
      if (this.camTitleEl) {
        this.camTitleEl.textContent = `${target.config.name} (드래그 또는 방향키로 회전)`;
      }
    }

    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.cam, 10) === camId);
    });
  }

  getActiveCamera() {
    const target = this.cctvCameras[this.activeCamId];
    return target ? target.camera : null;
  }

  updateDoorButtons(doors) {
    const container = document.querySelector('.cctv-door-controls');
    if (!container) return;

    if (!doors || doors.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = '';
    container.innerHTML = '<span class="door-title">방호문 원격 개폐:</span>';

    doors.forEach(d => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `door-toggle-btn ${d.isOpen ? '' : 'closed'}`;
      btn.textContent = `${d.name} [${d.isOpen ? 'OPEN' : 'LOCKED'}]`;
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onDoorToggle) this.onDoorToggle(d.id);
      });
      container.appendChild(btn);
    });
  }

  update(dt, map3d, playerPos) {
    if (!this.isOpen) return;

    // 1. 타임스탬프 갱신
    if (this.timeEl) {
      const now = new Date();
      this.timeEl.textContent =
        now.toTimeString().split(' ')[0] + '.' + Math.floor(now.getMilliseconds() / 100);
    }

    // 2. 키보드(WASD/방향키)로 현재 CCTV 카메라 팬/틸트 회전
    const active = this.cctvCameras[this.activeCamId];
    if (active) {
      let panSpeed = 0;
      let tiltSpeed = 0;
      if (this.panKeys['KeyA'] || this.panKeys['ArrowLeft']) panSpeed += 1.2;
      if (this.panKeys['KeyD'] || this.panKeys['ArrowRight']) panSpeed -= 1.2;
      if (this.panKeys['KeyW'] || this.panKeys['ArrowUp']) tiltSpeed += 0.9;
      if (this.panKeys['KeyS'] || this.panKeys['ArrowDown']) tiltSpeed -= 0.9;

      if (panSpeed !== 0 || tiltSpeed !== 0) {
        active.panOffset = Math.max(-1.25, Math.min(1.25, active.panOffset + panSpeed * dt));
        active.tiltOffset = Math.max(-0.55, Math.min(0.45, active.tiltOffset + tiltSpeed * dt));
        this.applyCameraAngles(active);
      }
    }

    // 3. 우측 상단 미니 전술 레이더 렌더링
    this.drawMinimap(map3d, playerPos, this.monsterAI);
  }

  drawMinimap(map3d, playerPos, monsterAI = null) {
    if (!this.minimapCanvas || !map3d) return;
    const ctx = this.minimapCanvas.getContext('2d');
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.fillStyle = 'rgba(8, 12, 10, 0.92)';
    ctx.fillRect(0, 0, w, h);

    const cellW = w / MAP_COLS;
    const cellH = h / MAP_ROWS;

    // 맵 타일 표시
    for (let r = 0; r < MAP_ROWS; r++) {
      const rowStr = map3d.activeMap[r] || '';
      for (let c = 0; c < MAP_COLS; c++) {
        const ch = rowStr[c] || ' ';
        if (ch === ' ') continue;
        if (ch === '#') {
          ctx.fillStyle = '#3a4a40';
        } else if (ch === 'W') {
          ctx.fillStyle = '#0d2b3a';
        } else if (['B', 'S', 'G', 'C'].includes(ch)) {
          ctx.fillStyle = '#203528';
        } else {
          ctx.fillStyle = '#16241b';
        }
        ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    // 방호문 표시 (챕터 1 전용: 열림=초록, 닫힘=빨강)
    if (map3d.doors && map3d.doors.length > 0) {
      for (const d of map3d.doors) {
        ctx.fillStyle = d.isOpen ? '#33ff77' : '#ff3333';
        ctx.fillRect(d.col * cellW - 1, d.row * cellH - 1, cellW + 2, cellH + 2);
      }
    }

    // 플레이어 위치 표시 (하얀 점)
    if (playerPos) {
      const pt = worldToTile(playerPos.x, playerPos.z);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc((pt.col + 0.5) * cellW, (pt.row + 0.5) * cellH, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 순찰/벤트 이동 중인 괴물 생체 신호(BIO-SIGN) 레이더 표시
    if (monsterAI && monsterAI.pos) {
      const mt = worldToTile(monsterAI.pos.x, monsterAI.pos.z);
      const mx = (mt.col + 0.5) * cellW;
      const my = (mt.row + 0.5) * cellH;
      const isVent = monsterAI.state === 'VENT_LURK';

      ctx.strokeStyle = isVent ? 'rgba(255, 170, 50, 0.85)' : 'rgba(255, 50, 50, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isVent ? '#ffaa33' : '#ff2222';
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 카메라 위치 및 현재 활성 카메라 시야 콘 표시
    for (const cfg of this.configs) {
      const ct = worldToTile(cfg.pos.x, cfg.pos.z);
      const cx = (ct.col + 0.5) * cellW;
      const cy = (ct.row + 0.5) * cellH;
      const isCurrent = cfg.id === this.activeCamId;

      if (isCurrent && this.cctvCameras[cfg.id]) {
        const entry = this.cctvCameras[cfg.id];
        const yaw = entry.baseYaw + entry.panOffset;
        // Three.js 카메라 정면(-Z)을 2D 미니맵 각도로 변환: dx = -sin(yaw), dz = -cos(yaw)
        const angle2D = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
        ctx.fillStyle = 'rgba(120, 255, 160, 0.25)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 26, angle2D - 0.5, angle2D + 0.5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = isCurrent ? '#55ff99' : '#88aa99';
      ctx.beginPath();
      ctx.arc(cx, cy, isCurrent ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
