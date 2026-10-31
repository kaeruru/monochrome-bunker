import * as THREE from 'three';
import {
  MonsterEntity,
  PlayerCharacterEntity,
  CrawlerCrocodileEntity,
  LurkerCrocodileEntity,
  SnareMangleEntity
} from './models.js';
import { createIndustrialEnvMap } from './textures.js';

/**
 * 3D 괴물 & 캐릭터 모델링 쇼케이스 뷰어 (360도 회전 / 줌 / 애니메이션 테스트 스튜디오)
 * - 마우스/터치 드래그로 360도 회전, 마우스 휠로 줌인/줌아웃
 * - 제2장 수로 삼두 괴수(#1 스토커 악어, #2 매복자 악어, #3 맹글 악어), 제1장 스토커, 전술 대원 관찰 지원
 * - 애니메이션 상태(대기, 보행, 추격, 공격) 및 조명(스튜디오 밝은 조명 vs 호러 핀조명) 전환
 */
export class ModelShowcaseViewer {
  constructor(onStateChange = null) {
    this.onStateChange = onStateChange;
    this.isOpen = false;
    this.viewTarget = 'trio';     // 'trio' | 'crawler' | 'lurker' | 'snare' | 'monster' | 'player' | 'compare'
    this.animState = 'chase';     // 'idle' | 'stalk' | 'chase' | 'attack'
    this.lightingMode = 'studio'; // 'studio' | 'horror'
    this.soundEnabled = true;

    this.orbitYaw = 0.55;
    this.orbitPitch = 0.16;
    this.orbitDist = 3.8;
    this.orbitCenterY = 0.85;
    this.autoRotate = true;

    this.isDragging = false;
    this.dragPointerId = null;
    this.lastPos = { x: 0, y: 0 };

    this.initDOM();
    this.initThreeScene();
    this.bindEvents();
  }

  initDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'model-viewer-modal';
    this.modalEl.className = 'hidden';

    this.modalEl.innerHTML = `
      <div class="mv-header">
        <div class="mv-title-group">
          <span class="mv-title">[MODEL SHOWCASE] 3D 괴물 및 전술 대원 뷰어</span>
          <span class="mv-subtitle">[DRAG: 360° 회전 | WHEEL: 확대/축소]</span>
        </div>
        <div class="mv-header-actions">
          <button id="btn-mv-sound" class="ed-btn primary">[AUDIO: ON] 괴물 사운드</button>
          <button id="btn-mv-autorotate" class="ed-btn primary">[ROTATE: ON] 자동 회전</button>
          <button id="btn-mv-lighting" class="ed-btn">[LIGHT: STUDIO] 스튜디오</button>
          <button id="btn-mv-close" class="ed-btn close">게임으로 복귀 [M / ESC]</button>
        </div>
      </div>

      <div class="mv-Viewport">
        <canvas id="modelViewerCanvas"></canvas>
        <div id="mv-info-card">
          <h4 id="mv-info-title">[THE FLOODED TRIO] 제2장 침수 수로 삼두 괴수</h4>
          <p id="mv-info-desc">좌측: #2 매복자 악어 (잠망경 안구·180도 곰덫 턱) / 중앙: #1 스토커 악어 (3분할 나이트메어 하악·노출 척추·철근 가시) / 우측: #3 맹글 악어 (천장 거미 다리·듀얼 엔도 헤드·포획 작살 팔)</p>
        </div>
      </div>

      <div class="mv-toolbar">
        <div class="mv-tool-group">
          <span class="mv-label">관찰 대상:</span>
          <button class="tool-btn mv-target-btn active" data-target="trio">[TRIO] 제2장 삼두 괴수</button>
          <button class="tool-btn mv-target-btn" data-target="crawler">[#1 RIPPER] 스토커 악어</button>
          <button class="tool-btn mv-target-btn" data-target="lurker">[#2 LURKER] 매복자 악어</button>
          <button class="tool-btn mv-target-btn" data-target="snare">[#3 SNARE] 맹글 악어</button>
          <button class="tool-btn mv-target-btn" data-target="monster">[CH.1] 제1장 스토커</button>
          <button class="tool-btn mv-target-btn" data-target="player">[PLAYER] 전술 대원</button>
          <button class="tool-btn mv-target-btn" data-target="compare">[COMPARE] 제1장 비교</button>
        </div>

        <div class="mv-tool-group">
          <span class="mv-label">애니메이션 모션:</span>
          <button class="tool-btn mv-anim-btn" data-anim="idle">대기 / 잠복 (IDLE)</button>
          <button class="tool-btn mv-anim-btn" data-anim="stalk">순찰 / 잠망경 (STALK)</button>
          <button class="tool-btn mv-anim-btn active" data-anim="chase">광폭 추격 / 돌출 (CHASE)</button>
          <button class="tool-btn mv-anim-btn" data-anim="attack">처형 / 결박 (ATTACK)</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
    this.canvas = document.getElementById('modelViewerCanvas');
  }

  initThreeScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f0e);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 50);

    // 바닥 원형 턴테이블 그리드 페데스탈
    const pedestalGeo = new THREE.CylinderGeometry(2.8, 2.95, 0.12, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c1c,
      roughness: 0.6,
      metalness: 0.3
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.06;
    pedestal.receiveShadow = true;
    this.scene.add(pedestal);

    const grid = new THREE.GridHelper(5.2, 18, 0x555555, 0x2a2a2a);
    grid.position.y = 0.005;
    this.scene.add(grid);

    // 조명 세팅
    this.ambientLight = new THREE.AmbientLight(0xd0d8e0, 0.85);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.85);
    this.keyLight.position.set(3, 5, 4);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.SpotLight(0xc8dcf0, 12, 12, Math.PI / 3, 0.45, 1.3);
    this.rimLight.position.set(-3, 4, -3);
    this.scene.add(this.rimLight);

    // 모델 인스턴스 생성
    this.monster = new MonsterEntity();
    this.crawler = new CrawlerCrocodileEntity();
    this.lurker = new LurkerCrocodileEntity();
    this.snare = new SnareMangleEntity();
    this.playerModel = new PlayerCharacterEntity('동료 대원 #02', false);

    this.scene.add(this.monster.root);
    this.scene.add(this.crawler.root);
    this.scene.add(this.lurker.root);
    this.scene.add(this.snare.root);
    this.scene.add(this.playerModel.root);

    this.applyViewTarget('trio');
  }

  ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.scene.environment = createIndustrialEnvMap(this.renderer);
    this.resize();
  }

  applyViewTarget(target) {
    this.viewTarget = target;
    const isMonsterSound = this.isOpen && this.soundEnabled && (target === 'monster' || target === 'compare');
    const isCrawlerSound = this.isOpen && this.soundEnabled && (target === 'crawler' || target === 'trio');
    this.monster.enableSound = isMonsterSound;
    if (this.crawler) this.crawler.enableSound = isCrawlerSound;

    const titleEl = document.getElementById('mv-info-title');
    const descEl = document.getElementById('mv-info-desc');

    this.monster.root.visible = false;
    this.crawler.root.visible = false;
    this.lurker.root.visible = false;
    this.snare.root.visible = false;
    this.playerModel.root.visible = false;

    if (target === 'trio') {
      this.lurker.root.visible = true;
      this.crawler.root.visible = true;
      this.snare.root.visible = true;
      this.lurker.root.position.set(-1.35, 0, 0);
      this.crawler.root.position.set(0, 0, 0);
      this.snare.root.position.set(1.35, -0.1, 0);
      this.orbitDist = 3.9;
      this.orbitCenterY = 0.78;
      if (titleEl) titleEl.textContent = '[THE FLOODED TRIO] 제2장 침수 수로 나이트메어 삼두 괴수';
      if (descEl) {
        descEl.textContent =
          '좌측: #2 매복자 악어(경사로/사다리 입구 잠복, 불빛으로 퇴치) | 중앙: #1 스토커 악어(3분할 나이트메어 하악 주력 추격자) | 우측: #3 맹글 악어(천장 낙하 결박 및 스토커 호출)';
      }
    } else if (target === 'crawler') {
      this.crawler.root.visible = true;
      this.crawler.root.position.set(0, 0, 0);
      this.orbitDist = 3.1;
      this.orbitCenterY = 0.55;
      if (titleEl) titleEl.textContent = '[#1 THE RIPPER] 제2장 스토커 악어 (Nightmare Freddy 포지션)';
      if (descEl) {
        descEl.textContent =
          '물소리 파동과 맹글의 괴성을 추적하는 주력 처형 괴수입니다. 뜯겨나간 갑피 사이로 노출된 엔도 척추, 녹슨 철근 가시와 철조망, 추격/공격 시 좌·우·하단 3갈래로 쪼개지는 나이트메어 하악을 갖춥니다.';
      }
    } else if (target === 'lurker') {
      this.lurker.root.visible = true;
      this.lurker.root.position.set(0, 0, 0);
      this.orbitDist = 2.8;
      this.orbitCenterY = 0.48;
      if (titleEl) titleEl.textContent = '[#2 THE LURKER] 제2장 매복자 악어 (FNAF Freddles / Pinky 포지션)';
      if (descEl) {
        descEl.textContent =
          '경사로(M)와 사다리(H) 입구 수면 아래에 몸을 숨긴 채 비대칭 잠망경 안구 기둥 2개만 물 위로 내밀고 감시합니다. 불빛을 비추면 도망치지만, 그냥 밟으면 180도 곰덫 아가리로 기습합니다. ([STALK]와 [CHASE] 모션을 비교해보세요)';
      }
    } else if (target === 'snare') {
      this.snare.root.visible = true;
      this.snare.root.position.set(0, -0.1, 0);
      this.orbitDist = 3.0;
      this.orbitCenterY = 0.95;
      if (titleEl) titleEl.textContent = '[#3 THE SNARE] 제2장 맹글 악어 (FNAF Mangle 포지션)';
      if (descEl) {
        descEl.textContent =
          '배수관 천장에 거꾸로 매달려 기괴한 라디오 전파 잡음을 내는 고철 괴수입니다. 거꾸로 달린 악어 해골 옆에 전선 목으로 매달린 두 번째 부서진 내골격 머리와 2개의 포획 작살 팔로 플레이어를 결박하고 #1 스토커 악어를 불러모읍니다.';
      }
    } else if (target === 'monster') {
      this.monster.root.visible = true;
      this.monster.root.position.set(0, 0, 0);
      this.orbitDist = 3.0;
      this.orbitCenterY = 1.25;
      if (titleEl) titleEl.textContent = '[STALKER] 제1장 제노-엔도스켈레톤 스토커 (2.65m)';
      if (descEl) {
        descEl.textContent =
          '속이 들여다보이는 16개의 엔도스켈레톤 금속 갈비뼈와 유압 피스톤, 흉곽 중앙에 동맥 케이블로 매달려 박동하는 심장 코어(Heart Core), 그리고 폭주/포효 사운드가 결합된 생체-기계 괴물입니다.';
      }
    } else if (target === 'player') {
      this.playerModel.root.visible = true;
      this.playerModel.root.position.set(0, 0, 0);
      this.orbitDist = 2.45;
      this.orbitCenterY = 0.98;
      if (titleEl) titleEl.textContent = '[OPERATIVE] 특수 방호 기동대원 (Adult CBRN Tactical Operative)';
      if (descEl) {
        descEl.textContent =
          '성인 7.5등신 비율(1.82m), 각진 방탄 헬멧 및 다크 고글, M50 군용 양구 방독면, MOLLE 방탄 조끼(무전기·탄입대·케미라이트), 전술 부츠로 리모델링했습니다.';
      }
    } else {
      this.monster.root.visible = true;
      this.playerModel.root.visible = true;
      this.monster.root.position.set(-0.78, 0, 0);
      this.playerModel.root.position.set(0.78, 0, 0);
      this.orbitDist = 3.6;
      this.orbitCenterY = 1.2;
      if (titleEl) titleEl.textContent = '[COMPARE] 제노-엔도스켈레톤(2.6m) vs 성인 기동대원(1.82m)';
      if (descEl) {
        descEl.textContent =
          '하단의 [광폭 추격 (CHASE)] 또는 [처형 / 결박 (ATTACK)] 버튼을 눌러 괴성 사운드와 흉곽 심장 코어 박동, 전갈 꼬리 모션을 확인해보세요.';
      }
    }
  }

  toggleLightingMode() {
    const btn = document.getElementById('btn-mv-lighting');
    if (this.lightingMode === 'studio') {
      this.lightingMode = 'horror';
      this.ambientLight.intensity = 0.15;
      this.keyLight.intensity = 0.45;
      this.rimLight.intensity = 16;
      if (btn) btn.textContent = '[LIGHT: HORROR] 호러 핀조명';
    } else {
      this.lightingMode = 'studio';
      this.ambientLight.intensity = 0.85;
      this.keyLight.intensity = 1.85;
      this.rimLight.intensity = 12;
      if (btn) btn.textContent = '[LIGHT: STUDIO] 스튜디오';
    }
  }

  bindEvents() {
    this.modalEl.querySelectorAll('.mv-target-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.modalEl.querySelectorAll('.mv-target-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyViewTarget(btn.dataset.target);
      });
    });

    this.modalEl.querySelectorAll('.mv-anim-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.modalEl.querySelectorAll('.mv-anim-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.animState = btn.dataset.anim;
      });
    });

    const soundBtn = document.getElementById('btn-mv-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        this.monster.enableSound = this.isOpen && this.soundEnabled && this.viewTarget !== 'player';
        soundBtn.classList.toggle('primary', this.soundEnabled);
        soundBtn.textContent = this.soundEnabled ? '[AUDIO: ON] 괴물 사운드' : '[AUDIO: OFF] 괴물 사운드';
      });
    }

    const autoBtn = document.getElementById('btn-mv-autorotate');
    if (autoBtn) {
      autoBtn.addEventListener('click', () => {
        this.autoRotate = !this.autoRotate;
        autoBtn.classList.toggle('primary', this.autoRotate);
        autoBtn.textContent = this.autoRotate ? '[ROTATE: ON] 자동 회전' : '[ROTATE: OFF] 자동 회전';
      });
    }

    const lightBtn = document.getElementById('btn-mv-lighting');
    if (lightBtn) {
      lightBtn.addEventListener('click', () => this.toggleLightingMode());
    }

    const closeBtn = document.getElementById('btn-mv-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // 캔버스 드래그 회전
    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.dragPointerId = e.pointerId;
      this.autoRotate = false;
      if (autoBtn) {
        autoBtn.classList.remove('primary');
        autoBtn.textContent = '[ROTATE: OFF] 자동 회전';
      }
      this.lastPos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isOpen || !this.isDragging || e.pointerId !== this.dragPointerId) return;
      const dx = e.clientX - this.lastPos.x;
      const dy = e.clientY - this.lastPos.y;
      this.lastPos = { x: e.clientX, y: e.clientY };

      this.orbitYaw -= dx * 0.007;
      this.orbitPitch = Math.max(-0.45, Math.min(0.85, this.orbitPitch + dy * 0.006));
    });

    const endDrag = (e) => {
      if (e.pointerId === this.dragPointerId) {
        this.isDragging = false;
        this.dragPointerId = null;
      }
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // 휠 줌
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.isOpen) return;
      e.preventDefault();
      this.orbitDist = Math.max(1.2, Math.min(6.5, this.orbitDist + (e.deltaY > 0 ? 0.25 : -0.25)));
    }, { passive: false });
  }

  open() {
    this.isOpen = true;
    const isMonsterSound = this.soundEnabled && (this.viewTarget === 'monster' || this.viewTarget === 'compare');
    const isCrawlerSound = this.soundEnabled && this.viewTarget === 'crawler';
    this.monster.enableSound = isMonsterSound;
    if (this.crawler) this.crawler.enableSound = isCrawlerSound;
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (_) {}
    }
    this.modalEl.classList.remove('hidden');
    this.ensureRenderer();
    this.resize();
    if (this.onStateChange) this.onStateChange(true);
  }

  close() {
    this.isOpen = false;
    this.monster.enableSound = false;
    if (this.crawler) this.crawler.enableSound = false;
    this.modalEl.classList.add('hidden');
    if (this.onStateChange) this.onStateChange(false);
  }

  resize() {
    if (!this.renderer || !this.canvas) return;
    const w = this.canvas.parentElement.clientWidth || window.innerWidth;
    const h = this.canvas.parentElement.clientHeight || (window.innerHeight - 130);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  updateAndRender(dt) {
    if (!this.isOpen || !this.renderer) return;

    if (this.autoRotate && !this.isDragging) {
      this.orbitYaw += dt * 0.45;
    }

    // 괴물 및 캐릭터 애니메이션 업데이트
    if (this.monster && this.monster.root.visible) {
      this.monster.update(dt, this.animState);
    }
    if (this.crawler && this.crawler.root.visible) {
      this.crawler.update(dt, this.animState);
    }
    if (this.lurker && this.lurker.root.visible) {
      this.lurker.update(dt, this.animState);
    }
    if (this.snare && this.snare.root.visible) {
      this.snare.update(dt, this.animState);
    }
    if (this.playerModel && this.playerModel.root.visible) {
      const playerMode = (this.animState === 'stalk' || this.animState === 'chase') ? 'walk' : 'look';
      this.playerModel.update(dt, playerMode);
    }

    // 오빗 카메라 위치 계산
    const cx = Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
    const cy = this.orbitCenterY + Math.sin(this.orbitPitch) * this.orbitDist;
    const cz = Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;

    this.camera.position.set(cx, Math.max(0.2, cy), cz);
    this.camera.lookAt(0, this.orbitCenterY, 0);

    this.renderer.render(this.scene, this.camera);
  }
}

