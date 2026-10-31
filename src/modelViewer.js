import * as THREE from 'three';
import { MonsterEntity, PlayerCharacterEntity, CrawlerCrocodileEntity } from './models.js';
import { createIndustrialEnvMap } from './textures.js';

/**
 * 3D 괴물 & 캐릭터 모델링 쇼케이스 뷰어 (360도 회전 / 줌 / 애니메이션 테스트 스튜디오)
 * - 마우스/터치 드래그로 360도 회전, 마우스 휠로 줌인/줌아웃
 * - 괴물 단독 / 플레이어(친구) 단독 / 나란히 크기 비교 모드 지원
 * - 애니메이션 상태(대기, 보행, 추격, 공격) 및 조명(스튜디오 밝은 조명 vs 호러 핀조명) 전환
 */
export class ModelShowcaseViewer {
  constructor(onStateChange = null) {
    this.onStateChange = onStateChange;
    this.isOpen = false;
    this.viewTarget = 'compare'; // 'monster' | 'player' | 'compare'
    this.animState = 'stalk';    // 'idle' | 'stalk' | 'chase' | 'attack'
    this.lightingMode = 'studio'; // 'studio' | 'horror'
    this.soundEnabled = true;

    // 오빗 카메라 상태 (측면 45도 각도에서 장두형 두개골, 등 파이프, 긴 칼날 꼬리가 한눈에 보이도록 설정)
    this.orbitYaw = 0.68;
    this.orbitPitch = 0.14;
    this.orbitDist = 3.5;
    this.orbitCenterY = 1.22;
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
          <h4 id="mv-info-title">[COMPARE] 괴물 vs 전술 대원 체격/디테일 비교</h4>
          <p id="mv-info-desc">좌측: 제노-엔도스켈레톤 스토커 (2.65m, 개방형 갈비뼈·생체 심장 코어·24마디 칼날 꼬리) / 우측: CBRN 전술 대원 (1.82m, 방탄 헬멧·고글·방독면·플레이트 캐리어)</p>
        </div>
      </div>

      <div class="mv-toolbar">
        <div class="mv-tool-group">
          <span class="mv-label">관찰 대상:</span>
          <button class="tool-btn mv-target-btn active" data-target="compare">[COMPARE] 체격 나란히 비교</button>
          <button class="tool-btn mv-target-btn" data-target="monster">[STALKER] 제1장 스토커</button>
          <button class="tool-btn mv-target-btn" data-target="crawler">[CRAWLER] 제2장 수로 악어</button>
          <button class="tool-btn mv-target-btn" data-target="player">[PLAYER] 전술 대원</button>
        </div>

        <div class="mv-tool-group">
          <span class="mv-label">애니메이션 모션:</span>
          <button class="tool-btn mv-anim-btn" data-anim="idle">대기 / 호흡 (IDLE)</button>
          <button class="tool-btn mv-anim-btn active" data-anim="stalk">순찰 보행 (STALK)</button>
          <button class="tool-btn mv-anim-btn" data-anim="chase">폭주 질주 (CHASE)</button>
          <button class="tool-btn mv-anim-btn" data-anim="attack">포효 / 내려찍기 (ATTACK)</button>
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
    const pedestalGeo = new THREE.CylinderGeometry(2.4, 2.55, 0.12, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c1c,
      roughness: 0.6,
      metalness: 0.3
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.06;
    pedestal.receiveShadow = true;
    this.scene.add(pedestal);

    const grid = new THREE.GridHelper(4.4, 16, 0x555555, 0x2a2a2a);
    grid.position.y = 0.005;
    this.scene.add(grid);

    // 조명 세팅 (심장 코어 발광과 엔도스켈레톤 음영이 돋보이도록 조도 최적화)
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
    this.playerModel = new PlayerCharacterEntity('동료 대원 #02', false);

    this.scene.add(this.monster.root);
    this.scene.add(this.crawler.root);
    this.scene.add(this.playerModel.root);

    this.crawler.root.visible = false;
    this.applyViewTarget('compare');
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
    const isCrawlerSound = this.isOpen && this.soundEnabled && target === 'crawler';
    this.monster.enableSound = isMonsterSound;
    if (this.crawler) this.crawler.enableSound = isCrawlerSound;

    const titleEl = document.getElementById('mv-info-title');
    const descEl = document.getElementById('mv-info-desc');

    if (target === 'monster') {
      this.monster.root.visible = true;
      this.monster.root.position.set(0, 0, 0);
      if (this.crawler) this.crawler.root.visible = false;
      this.playerModel.root.visible = false;
      this.orbitDist = 3.0;
      this.orbitCenterY = 1.25;
      if (titleEl) titleEl.textContent = '[STALKER] 제1장 제노-엔도스켈레톤 스토커 (2.65m)';
      if (descEl) {
        descEl.textContent =
          '속이 들여다보이는 16개의 엔도스켈레톤 금속 갈비뼈와 유압 피스톤, 흉곽 중앙에 동맥 케이블로 매달려 박동하는 심장 코어(Heart Core), 그리고 폭주/포효 사운드가 결합된 생체-기계 괴물입니다.';
      }
    } else if (target === 'crawler') {
      this.monster.root.visible = false;
      if (this.crawler) {
        this.crawler.root.visible = true;
        this.crawler.root.position.set(0, 0, 0);
      }
      this.playerModel.root.visible = false;
      this.orbitDist = 3.2;
      this.orbitCenterY = 0.55;
      if (titleEl) titleEl.textContent = '[CRAWLER] 제2장 침수 수로 악어형 크롤러 (Sewer Crocodile)';
      if (descEl) {
        descEl.textContent =
          '침수 하수관(수면 Y=0.56m)에서 서식하는 악어형 생체기계 포식자입니다. 3열 톱니 등줄기 골판, 거대한 이중 크롬 하악, S자 수중 유영 꼬리 파동 모션을 갖추고 있습니다.';
      }
    } else if (target === 'player') {
      this.monster.root.visible = false;
      if (this.crawler) this.crawler.root.visible = false;
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
      if (this.crawler) this.crawler.root.visible = false;
      this.playerModel.root.visible = true;
      this.monster.root.position.set(-0.78, 0, 0);
      this.playerModel.root.position.set(0.78, 0, 0);
      this.orbitDist = 3.6;
      this.orbitCenterY = 1.2;
      if (titleEl) titleEl.textContent = '[COMPARE] 제노-엔도스켈레톤(2.6m) vs 성인 기동대원(1.82m)';
      if (descEl) {
        descEl.textContent =
          '하단의 [폭주 질주 (CHASE)] 또는 [포효 / 내려찍기 (ATTACK)] 버튼을 눌러 괴성 사운드와 흉곽 심장 코어 박동, 전갈 꼬리 모션을 확인해보세요.';
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

