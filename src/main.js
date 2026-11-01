import * as THREE from 'three';
import { Map3D } from './map3d.js';
import { FPSControls } from './controls.js';
import { CCTVSystem3D } from './cctv3d.js';
import { ModelShowcaseViewer } from './modelViewer.js';
import { FirstPersonViewModel } from './viewModel.js';
import { InteractionAndEscapeSystem } from './interactionSystem.js';
import { MonsterAI } from './monsterAI.js';
import { NetworkManager } from './network.js';
import { PlayerCharacterEntity } from './models.js';
import { createIndustrialEnvMap } from './textures.js';
import { sound } from './audio.js';
import { worldToTile, getZoneName, CHAPTER_CONFIGS } from './tilemapData.js';

class MonochromeBunker3D {
  constructor() {
    this.container = document.getElementById('game-container');
    this.canvas = document.getElementById('gameCanvas');

    // 1. 기기 환경 정밀 감지 (모바일 60FPS를 위한 렌더링 최적화 분기)
    const isMobileClient = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse) and (hover: none)').matches) ||
      (window.innerWidth <= 1024 && ('ontouchstart' in window));
    this.isMobile = isMobileClient;

    // 1-1. Three.js WebGL 렌더러
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !isMobileClient,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;

    // 1-2. 사양 모드 (Graphic Quality Preset) - 갤럭시 탭 S9 FE 및 저사양 기기 최적화
    const savedQuality = localStorage.getItem('monochrome_quality_preset');
    this.qualityPreset = savedQuality || (isMobileClient ? 'tab_low' : 'balanced');

    // 1-3. 가비지 컬렉션(GC) 방지용 무할당 재사용 임시 벡터 풀
    this._tmpForward = new THREE.Vector3(0, 0, -1);
    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();

    // 2. 3D 씬 및 모노크롬 안개 + 비플라스틱 인더스트리얼 환경광(PMREM)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040405);
    this.scene.fog = new THREE.FogExp2(0x040405, 0.052);
    this.scene.environment = createIndustrialEnvMap(this.renderer);

    this.applyQualityPreset(this.qualityPreset);

    // 3. 3D 타일맵 생성
    this.map = new Map3D(this.scene);

    // 5. 플레이어 1인칭 카메라 (근거리 1인칭 손/아이템 클리핑 방지를 위해 near=0.05 설정)
    this.playerEyeHeight = 1.68;
    this.playerCamera = new THREE.PerspectiveCamera(
      74,
      window.innerWidth / window.innerHeight,
      0.05,
      100
    );
    this.playerPos = new THREE.Vector3(
      this.map.spawnPos.x,
      this.playerEyeHeight,
      this.map.spawnPos.z
    );
    this.playerCamera.position.copy(this.playerPos);
    this.scene.add(this.playerCamera);
    this.playerRadius = 0.42;
    this.walkSpeed = 5.4;
    this.sprintSpeed = 9.4;
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaExhausted = false;
    this.walkCycle = 0;

    // 5-1. 1인칭 뷰모델 (왼손 손전등/PDA + 오른손 파밍 아이템 파지 및 애니메이션)
    this.viewModel = new FirstPersonViewModel(this.playerCamera);

    // 6. 기본 환경광 (어두운 심연 분위기는 살리되 손전등 없이도 윤곽이 보이도록 최적화)
    this.ambientLight = new THREE.AmbientLight(0x282c32, 0.58);
    this.scene.add(this.ambientLight);

    // 7. 플레이어 전술 손전등 (실시간 집중 단일 광원으로 최적화)
    this.flashlightOn = true;
    this.flashlightMaxIntensity = 26;
    this.flashlight = new THREE.SpotLight(0xf0f6ff, this.flashlightMaxIntensity, 36, Math.PI / 3.3, 0.72, 1.15);
    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.scene.add(this.flashlight);

    // 챕터 2 전용 음파 감지기 전방 소나 펄스(Sonar Pulse) 쿨타임 (초)
    this.sonarPulseCooldown = 0;
    this._cachedForward = new THREE.Vector3(0, 0, -1);
    this._extraBlipsPool = [];

    // 챕터 2 전용 자욱한 수증기/물안개 부유 입자 시스템 초기화
    this.createMistParticles();

    // 모바일 60FPS를 위해 불필요한 실시간 PointLight 제거
    this.playerFillLight = null;

    // 8. PC & 모바일 통합 컨트롤러
    this.controls = new FPSControls(this.playerCamera, this.renderer.domElement);

    // 9. 3D CCTV 감시 시스템 초기화
    this.cctv = new CCTVSystem3D(this.scene, this.map.cctvConfigs, {
      onDoorToggle: (doorId) => this.toggleDoor(doorId),
      onStateChange: (isOpen) => {
        this.controls.setDisabled(isOpen);
      }
    });
    if (this.cctv) {
      this.cctv.map = this.map;
      this.cctv.setConfigs(this.map.cctvConfigs);
      this.cctv.updateDoorButtons(this.map.doors);
    }

    // 10. 3D 괴물 & 캐릭터 모델링 쇼케이스 뷰어 초기화
    this.modelViewer = new ModelShowcaseViewer(
      (isOpen) => {
        this.controls.setDisabled(isOpen);
      },
      (skin) => {
        if (this.monsterAI) {
          this.monsterAI.setChapter1Skin(skin);
        }
      }
    );

    // 11. UI 엘리먼트 참조
    this.promptEl = document.getElementById('interact-prompt');
    this.promptDescEl = document.getElementById('prompt-desc');
    this.locationTextEl = document.getElementById('location-text');
    this.hudHintEl = document.getElementById('hud-hint-text');
    this.btnTouchCCTV = document.getElementById('btn-touch-cctv');
    this.btnTouchDrop = document.getElementById('btn-touch-drop');
    this.btnTouchInteract = document.getElementById('btn-touch-interact');
    this.btnTouchFlashlight = document.getElementById('btn-touch-flashlight');
    this.btnTriggerBlackout = document.getElementById('btn-trigger-blackout');
    this.btnOpenModelViewer = document.getElementById('btn-open-model-viewer');
    this.btnOpenShowcaseHud = document.getElementById('btn-open-showcase');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.staminaFillEl = document.getElementById('stamina-bar-fill');
    this.staminaPctEl = document.getElementById('stamina-pct');
    this.staminaStateEl = document.getElementById('stamina-state-text');
    this.gameToastEl = document.getElementById('game-toast');
    this.escapeModalEl = document.getElementById('escape-success-modal');
    this.btnRestartMatch = document.getElementById('btn-restart-match');
    this.gameOverModalEl = document.getElementById('game-over-modal');
    this.btnRetryMatch = document.getElementById('btn-retry-match');
    this.isPlayerDead = false;
    this.toastTimer = null;

    // Phase 3: CCTV 사망 감시 및 전술 판단 시스템
    this.isDeathCamActive = false;
    this.deathCamTimer = 0;
    this.deathCamera = null;
    this.deathCamLight = null;
    this.deathCamLightTarget = null;
    this.fallenOperative = null;
    this.droppedFlashlight = null;
    this.droppedFlashlightTarget = null;
    this.deathTypeInterval = null;
    this.missionStartTime = performance.now();

    // 신규 모달 및 HUD DOM 요소
    this.deathSurveillanceHudEl = document.getElementById('death-surveillance-hud');
    this.deathCctvTimestampEl = document.getElementById('death-cctv-timestamp');
    this.tacticalDeathModalEl = document.getElementById('tactical-death-modal');
    this.btnDeathLobby = document.getElementById('btn-death-lobby');
    this.btnDeathRedeploy = document.getElementById('btn-death-redeploy');
    this.btnDeathSpectate = document.getElementById('btn-death-spectate');
    this.btnEscapeLobby = document.getElementById('btn-escape-lobby');

    // 작전 환경 설정 및 멀티플레이어 상태
    this.isDeployed = false;
    this.difficulty = 'normal';
    this.callsign = 'OPERATIVE-01';
    this.suitColor = 'steel';
    this.gameMode = 'solo';
    this.selectedChapterId = 'chapter2';
    this.selectedCoopMapId = 'chapter2';
    this.activeChapterId = 'chapter1';

    // 점프스케어 및 설정 모달 DOM
    this.jumpscareOverlayEl = document.getElementById('jumpscare-overlay');
    this.vignetteOverlayEl = document.getElementById('vignette-overlay');
    this.gameSetupModalEl = document.getElementById('game-setup-modal');
    this.hudPingBadge = document.getElementById('hud-ping-badge');
    this.hudPingDot = document.getElementById('hud-ping-dot');
    this.hudPingVal = document.getElementById('hud-ping-val');
    this.btnDeployMission = document.getElementById('btn-deploy-mission');
    this.btnOpenSettings = document.getElementById('btn-open-settings');
    this.callsignInput = document.getElementById('setup-callsign');
    this.mouseSensInput = document.getElementById('setup-mouse-sens');
    this.sensValEl = document.getElementById('setup-sens-val');
    this.audioVolInput = document.getElementById('setup-audio-vol');
    this.volValEl = document.getElementById('setup-vol-val');
    this.btnModeSolo = document.getElementById('btn-mode-solo');
    this.btnModeCoop = document.getElementById('btn-mode-coop');
    this.coopPanel = document.getElementById('coop-panel');
    this.serverStatusPill = document.getElementById('server-status-pill');
    this.btnHostRoom = document.getElementById('btn-host-room');
    this.btnJoinRoom = document.getElementById('btn-join-room');
    this.roomCodeInput = document.getElementById('setup-room-code-input');
    this.roomInfoBox = document.getElementById('room-info-box');
    this.roomCodeDisplay = document.getElementById('current-room-code-display');
    this.btnCopyRoomCode = document.getElementById('btn-copy-room-code');
    this.roomPlayerCount = document.getElementById('room-player-count');
    this.roomPlayerList = document.getElementById('room-player-list');
    this.btnStartCoop = document.getElementById('btn-start-coop');
    this.coopWaitingMsg = document.getElementById('coop-waiting-msg');
    this.btnLeaveCoop = document.getElementById('btn-leave-coop');
    this.currentRoomMapDisplay = document.getElementById('current-room-map-display');
    this.coopModeTabs = document.getElementById('coop-mode-tabs');
    this.coopTabCreateView = document.getElementById('coop-tab-create-view');
    this.coopTabJoinView = document.getElementById('coop-tab-join-view');
    this.currentRoomPlayers = [];
    this.setupStatusMsg = document.getElementById('setup-status-msg');

    // 모바일 터치 패드 커스텀 컨트롤 DOM
    this.sliderJoystickSize = document.getElementById('setup-joystick-size');
    this.valJoystickSize = document.getElementById('setup-joystick-size-val');
    this.sliderBtnSize = document.getElementById('setup-btn-size');
    this.valBtnSize = document.getElementById('setup-btn-size-val');
    this.sliderTouchOpacity = document.getElementById('setup-touch-opacity');
    this.valTouchOpacity = document.getElementById('setup-opacity-val');
    this.btnTriggerHudEdit = document.getElementById('btn-trigger-hud-edit');
    this.btnResetHudLayout = document.getElementById('btn-reset-hud-layout');

    // 시설 종합 전술 작전 지도 DOM
    this.tacticalMapModalEl = document.getElementById('tactical-map-modal');
    this.fullscreenMapCanvas = document.getElementById('fullscreen-map-canvas');
    this.btnCloseTacticalMap = document.getElementById('btn-close-tactical-map');
    this.btnOpenTacticalMap = document.getElementById('btn-open-tactical-map');
    this.btnTouchMap = document.getElementById('btn-touch-map');
    this.isTacticalMapOpen = false;

    this.showGameToast = (msg, level = 'info') => {
      if (!this.gameToastEl) {
        this.gameToastEl = document.getElementById('game-toast');
      }
      if (!this.gameToastEl) return;
      this.gameToastEl.textContent = msg;
      this.gameToastEl.className = '';
      if (level === 'danger') this.gameToastEl.classList.add('toast-danger');
      else if (level === 'warn') this.gameToastEl.classList.add('toast-warn');
      else if (level === 'success') this.gameToastEl.classList.add('toast-success');

      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        if (this.gameToastEl) this.gameToastEl.classList.add('hidden');
      }, 4200);
    };

    this.handleEscapeSuccess = () => {
      this.controls.setDisabled(true);
      if (this.escapeModalEl) {
        this.escapeModalEl.classList.remove('hidden');
      }
    };

    this.handlePlayerCaught = () => {
      this.startCinematicDeathSequence();
    };

    // 심장 박동 타이밍에 맞춘 화면 비네트 수축/확장 펄스 연동
    sound.onHeartbeatPulse = (tension) => {
      if (this.vignetteOverlayEl) {
        this.vignetteOverlayEl.classList.remove('pulse');
        void this.vignetteOverlayEl.offsetWidth;
        this.vignetteOverlayEl.classList.add('pulse');
      }
    };

    // 12. 멀티플레이어 네트워크 매니저 초기화
    this.networkManager = new NetworkManager(this.scene, {
      onToast: (msg, level) => this.showGameToast(msg, level),
      onPingUpdate: (ping) => this.updatePingHUD(ping),
      onDoorSync: (doorId, isOpen) => {
        const d = this.map.doors.find(x => x.id === doorId);
        if (d && d.isOpen !== isOpen) {
          d.isOpen = isOpen;
          sound.playDoorSound(isOpen);
          if (this.cctv) this.cctv.updateDoorButtons(this.map.doors);
        }
      },
      onItemPickupSync: (itemId) => {
        if (this.interactionSystem) {
          const idx = this.interactionSystem.worldItems.findIndex(w => w.id === itemId);
          if (idx !== -1) {
            const item = this.interactionSystem.worldItems[idx];
            this.interactionSystem.group.remove(item.mesh);
            this.interactionSystem.worldItems.splice(idx, 1);
          }
        }
      },
      onLockerOpenSync: (lockerId) => {
        if (this.interactionSystem) {
          this.interactionSystem.applyRemoteLockerOpen(lockerId);
        }
      },
      onItemDropSync: (item, x, z) => {
        if (this.interactionSystem) {
          const typeStr = typeof item === 'object' && item ? (item.type || item.id) : item;
          if (typeStr) {
            const inCh2Water = this.interactionSystem.map && this.interactionSystem.map.chapterId === 'chapter2' && this.interactionSystem.map.isWaterAt && this.interactionSystem.map.isWaterAt(x, z);
            const dropY = inCh2Water ? 0.62 : 0.22;
            this.interactionSystem.spawnWorldItem(typeStr, x, dropY, z, '동료 대원이 내려놓음');
          }
        }
      },
      onCoreInsertSync: (partType, total) => {
        if (this.interactionSystem) {
          this.interactionSystem.applyRemoteCoreInsert(partType, total);
        }
      },
      onBlackoutSync: (isBlackout, reason) => {
        if (this.interactionSystem) {
          if (isBlackout && !this.interactionSystem.isBlackout) {
            this.interactionSystem.triggerBlackout(reason || '원격 통신: 시설 전체가 정전되었습니다!');
          } else if (!isBlackout && this.interactionSystem.isBlackout) {
            this.interactionSystem.restorePower('동료 대원이 전기실 배전반을 복구했습니다!');
          }
        }
      },
      onMonsterSync: (data) => {
        if (!this.networkManager.isHost && this.monsterAI) {
          this.monsterAI.applySyncData(data);
        }
      },
      onHostPromoted: () => {
        if (this.monsterAI) {
          this.monsterAI.isRemoteControlled = false;
        }
      },
      onRoomJoined: (info) => {
        if (this.monsterAI) {
          this.monsterAI.isRemoteControlled = !info.isHost;
        }
        if (info.mapId && info.mapId !== this.activeChapterId) {
          this.loadChapter(info.mapId);
        }
        if (info.matchSeed) {
          this.matchSeed = info.matchSeed;
        }
        this.currentRoomPlayers = (info.players && info.players.length > 0)
          ? [...info.players]
          : [{ id: info.playerId, callsign: this.callsign, isHost: info.isHost, ping: 0 }];

        if (this.coopModeTabs) this.coopModeTabs.classList.add('hidden');
        if (this.coopTabCreateView) this.coopTabCreateView.classList.add('hidden');
        if (this.coopTabJoinView) this.coopTabJoinView.classList.add('hidden');
        if (this.roomInfoBox) this.roomInfoBox.classList.remove('hidden');
        if (this.roomCodeDisplay) this.roomCodeDisplay.textContent = info.roomId;

        this.updateRoomRoster();

        if (this.setupStatusMsg) {
          this.setupStatusMsg.textContent = `작전 세션 [${info.roomId}] 접속 완료 (${info.isHost ? '지휘관' : '대원'}).`;
        }
        this.showGameToast(`[NET] 작전 세션 [${info.roomId}]에 성공적으로 연결되었습니다.`, 'success');
      },
      onPlayerJoined: (player) => {
        // 호스트 화면에 새 참가자 즉시 추가 및 실시간 갱신!
        if (!this.currentRoomPlayers.some(p => p.id === player.id)) {
          this.currentRoomPlayers.push(player);
        }
        this.updateRoomRoster();
      },
      onPlayerLeft: (playerId, callsign) => {
        this.currentRoomPlayers = this.currentRoomPlayers.filter(p => p.id !== playerId);
        this.updateRoomRoster();
      },
      onGameStarted: (msg) => {
        if (msg.matchSeed) {
          this.matchSeed = msg.matchSeed;
        }
        if (msg.mapId && msg.mapId !== this.activeChapterId) {
          this.loadChapter(msg.mapId);
        }
        this.showGameToast('[MISSION LAUNCH] 전 대원 작전 구역으로 일제히 투입됩니다!', 'success');
        this.deployMission();
      },
      onMapChanged: (mapId) => {
        if (this.networkManager) this.networkManager.mapId = mapId;
        this.updateRoomRoster();
      },
      onRoomError: (err) => {
        if (this.setupStatusMsg) this.setupStatusMsg.textContent = err;
        this.showGameToast('[NET] ' + err, 'danger');
      }
    });

    // 13. 무작위 아이템 파밍, 정전/전기실 복구 & 중앙 코어 탈출 시스템 초기화
    this.interactionSystem = new InteractionAndEscapeSystem(this.map, this.viewModel, {
      onToast: (msg, level) => this.showGameToast(msg, level),
      onEscapeSuccess: () => this.handleEscapeSuccess(),
      onBlackoutChange: (isBlackout) => {
        if (isBlackout && this.cctv && this.cctv.isOpen) {
          this.cctv.close();
        }
        if (this.cctv) {
          this.cctv.updateDoorButtons(this.map.doors);
        }
        if (this.networkManager && this.networkManager.roomId) {
          this.networkManager.sendBlackout(isBlackout, isBlackout ? '정전 발생' : '전력 복구');
        }
      },
      onItemPickup: (itemId, slot) => {
        if (this.networkManager && this.networkManager.roomId) {
          this.networkManager.sendItemPickup(itemId, slot);
        }
      },
      onLockerOpen: (lockerId) => {
        if (this.networkManager && this.networkManager.roomId) {
          this.networkManager.sendLockerOpen(lockerId);
        }
      },
      onItemDrop: (item, x, z) => {
        if (this.networkManager && this.networkManager.roomId) {
          this.networkManager.sendItemDrop(item, x, z);
        }
      },
      onCoreInsert: (partType, total) => {
        if (this.networkManager && this.networkManager.roomId) {
          this.networkManager.sendCoreInsert(partType, total);
        }
      }
    });

    // 14. 스켈드 환기구(Vent) 잠복 & 청각/시각 기반 괴물 AI 시스템 초기화
    this.monsterAI = new MonsterAI(this.scene, this.map, this.interactionSystem, {
      onToast: (msg, level) => this.showGameToast(msg, level),
      onKillStart: () => {
        // 괴물 피습: 즉시 조작 차단 및 인게임 모든 UI(HUD, 목표, 크로스헤어, 프롬프트) 감춤
        this.isPlayerDead = true;
        this.controls.setDisabled(true);
        this.controls.unlock();
        this.hideGameplayUI();
        this.hidePrompt();
        const bottomHud = document.getElementById('bottom-center-hud');
        if (bottomHud) {
          bottomHud.classList.add('hidden');
          bottomHud.classList.add('ui-hidden');
          bottomHud.style.display = 'none';
        }

        // 손전등 소등
        this.flashlightOn = false;
        this.flashlight.intensity = 0;

        // 점프스케어 시 괴물이 선명하게 보이도록 고광량 정면 스포트라이트 투광
        if (!this.jumpscareFlashLight) {
          this.jumpscareFlashLight = new THREE.SpotLight(0xfff6ee, 24.0, 8.0, Math.PI / 2.2, 0.35, 1.0);
          this.jumpscareFlashLightTarget = new THREE.Object3D();
          this.scene.add(this.jumpscareFlashLight);
          this.scene.add(this.jumpscareFlashLightTarget);
          this.jumpscareFlashLight.target = this.jumpscareFlashLightTarget;
        }
        this.jumpscareFlashLight.visible = true;
        this.jumpscareFlashLight.position.copy(this.playerCamera.position);
        this._tmpForward.set(0, 0, -1).applyQuaternion(this.playerCamera.quaternion);
        this.jumpscareFlashLightTarget.position.copy(this.playerCamera.position).addScaledVector(this._tmpForward, 1.2);

        // 환경광도 완전 0 대신 음산한 대비 조명 유지
        if (this.ambientLight) this.ambientLight.intensity = 0.55;
        if (this.playerFillLight) this.playerFillLight.intensity = 0;
        if (this.map.bunkerAmbient) this.map.bunkerAmbient.intensity = 0;
        if (this.map.genLight) this.map.genLight.intensity = 0;
        if (this.map.consoleLight) this.map.consoleLight.intensity = 0;

        if (this.jumpscareOverlayEl) this.jumpscareOverlayEl.classList.remove('hidden');
        if (this.networkManager && this.networkManager.roomId) {
          this.networkManager.sendPlayerDown(this.callsign);
        }
      },
      onPlayerCaught: () => {
        if (this.jumpscareOverlayEl) this.jumpscareOverlayEl.classList.add('hidden');
        if (this.jumpscareFlashLight) this.jumpscareFlashLight.visible = false;
        this.handlePlayerCaught();
      },
      onPlayerBittenByLurker: (lurkerPos) => {
        // 제2장 매복자 악어(#2) 기습: 플레이어를 수로 뒤쪽으로 강하게 밀쳐내고 2초간 이동 속도 저하 + 스태미나 타격
        if (lurkerPos) {
          const dx = this.playerPos.x - lurkerPos.x;
          const dz = this.playerPos.z - lurkerPos.z;
          const len = Math.max(0.01, Math.hypot(dx, dz));
          const nx = dx / len;
          const nz = dz / len;
          for (let s = 1; s <= 6; s++) {
            const tryX = this.playerPos.x + nx * 0.28;
            const tryZ = this.playerPos.z + nz * 0.28;
            if (!this.map.checkCollision(tryX, this.playerPos.z, this.playerRadius)) {
              this.playerPos.x = tryX;
            }
            if (!this.map.checkCollision(this.playerPos.x, tryZ, this.playerRadius)) {
              this.playerPos.z = tryZ;
            }
          }
        }
        this.lurkerSlowTimer = 2.0;
        this.stamina = Math.max(0, this.stamina - 35);
        this.showGameToast(
          '[AMBUSH] 경사로/사다리 밑에 숨어있던 매복자 악어에게 물려 수로로 밀려났습니다! 스토커 악어가 접근합니다!',
          'danger'
        );
      }
    });
    this.cctv.monsterAI = this.monsterAI;

    this.nearInteractable = null;
    this.lastTime = performance.now();
    this.footstepTimer = 0;

    // 접속 초기 상태: 작전 설정 모달이 열려 있으므로 포인터 락 비활성화
    this.controls.setDisabled(true);

    this.applyQualityPreset(this.qualityPreset);
    this.syncDeviceModeUI();
    this.initEvents();
    requestAnimationFrame((t) => this.loop(t));
  }

  /**
   * 그래픽 사양 모드 적용 (갤럭시 탭 S9 FE 및 저사양 노트북 지원)
   */
  applyQualityPreset(preset) {
    this.qualityPreset = preset || 'balanced';
    localStorage.setItem('monochrome_quality_preset', this.qualityPreset);

    const descEl = document.getElementById('quality-desc-text');

    if (this.qualityPreset === 'tab_low') {
      // 디벗 (갤럭시 탭 S9 FE) 및 저사양 노트북 최적화
      this.renderer.setPixelRatio(0.85);
      this.renderer.toneMappingExposure = 0.85;
      if (this.activeChapterId !== 'chapter2') {
        if (this.scene && this.scene.fog && this.scene.fog.isFogExp2) this.scene.fog.density = 0.048;
        if (this.flashlight) {
          this.flashlight.distance = 30;
          this.flashlight.intensity = 24;
        }
      }
      if (descEl) {
        descEl.textContent = '갤럭시 탭 S9 FE 및 구형 노트북 추천: 렌더 스케일 최적화로 발열과 끊김을 줄이고 60FPS를 방어합니다.';
      }
    } else if (this.qualityPreset === 'high') {
      // 고사양 게이밍 데스크톱
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.renderer.toneMappingExposure = 0.90;
      if (this.activeChapterId !== 'chapter2') {
        if (this.scene && this.scene.fog && this.scene.fog.isFogExp2) this.scene.fog.density = 0.055;
        if (this.flashlight) {
          this.flashlight.distance = 40;
          this.flashlight.intensity = 28;
        }
      }
      if (descEl) {
        descEl.textContent = '고사양 게이밍 PC 추천: 디스플레이 네이티브 해상도 및 최고 품질 조명을 적용합니다.';
      }
    } else {
      // 보통 (기본 밸런스 모드)
      this.renderer.setPixelRatio(1.0);
      this.renderer.toneMappingExposure = 0.88;
      if (this.activeChapterId !== 'chapter2') {
        if (this.scene && this.scene.fog && this.scene.fog.isFogExp2) this.scene.fog.density = 0.052;
        if (this.flashlight) {
          this.flashlight.distance = 36;
          this.flashlight.intensity = 26;
        }
      }
      if (descEl) {
        descEl.textContent = '표준 밸런스 모드: 100% 해상도와 기본 인더스트리얼 조명을 적용합니다.';
      }
    }

    // UI 버튼 상태 갱신 (이모지 일체 배제)
    document.querySelectorAll('.quality-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.quality === this.qualityPreset);
    });
  }

  /**
   * 실시간 네트워크 RTT 핑 HUD 업데이트
   */
  updatePingHUD(ping) {
    if (!this.hudPingVal) return;
    const p = Math.max(0, Math.round(ping));
    this.hudPingVal.textContent = `PING: ${p}ms`;

    if (this.hudPingDot) {
      this.hudPingDot.classList.remove('dot-good', 'dot-warn', 'dot-bad');
      if (p >= 150) {
        this.hudPingDot.classList.add('dot-bad');
      } else if (p >= 80) {
        this.hudPingDot.classList.add('dot-warn');
      } else {
        this.hudPingDot.classList.add('dot-good');
      }
    }
  }

  /**
   * 새로운 무작위 작전 배치로 재투입 (Redeploy)
   */
  restartNewRandomMatch() {
    if (this.tacticalDeathModalEl) this.tacticalDeathModalEl.classList.add('hidden');
    if (this.deathSurveillanceHudEl) this.deathSurveillanceHudEl.classList.add('hidden');
    if (this.escapeModalEl) this.escapeModalEl.classList.add('hidden');
    if (this.gameOverModalEl) this.gameOverModalEl.classList.add('hidden');
    if (this.jumpscareOverlayEl) this.jumpscareOverlayEl.classList.add('hidden');
    if (this.cctv && this.cctv.isOpen) this.cctv.close();

    if (this.deathTypeInterval) {
      clearTimeout(this.deathTypeInterval);
      this.deathTypeInterval = null;
    }

    this.isPlayerDead = false;
    this.isDeathCamActive = false;
    this.isDeployed = true;
    this.showGameplayUI();

    if (this.fallenOperative) {
      this.fallenOperative.root.visible = false;
    }
    if (this.droppedFlashlight) {
      this.droppedFlashlight.visible = false;
    }
    if (this.deathCamLight) {
      this.deathCamLight.visible = false;
    }
    if (this.viewModel) {
      this.viewModel.root.visible = true;
    }

    // 암전 해제 및 챕터별 정상 조명 복구
    this.applyChapterLighting(false);
    if (this.map.bunkerAmbient) this.map.bunkerAmbient.intensity = this.activeChapterId === 'chapter2' ? 1.25 : 0.45;
    if (this.map.genLight) this.map.genLight.intensity = this.activeChapterId === 'chapter2' ? 5.2 : 2.2;
    if (this.map.consoleLight) this.map.consoleLight.intensity = 2.0;

    this.map.setBlackoutState(false);
    sound.setBlackout(false);
    this.playerPos.set(this.map.spawnPos.x, this.playerEyeHeight, this.map.spawnPos.z);
    this.playerCamera.position.copy(this.playerPos);
    this.playerCamera.rotation.z = 0;
    this.stamina = this.maxStamina;
    this.staminaExhausted = false;
    this.sonarPulseCooldown = 0;

    if (this.interactionSystem) {
      this.interactionSystem.setupNewMatch();
    }
    if (this.monsterAI) {
      this.monsterAI.resetForNewMatch();
    }
    if (this.cctv) {
      this.cctv.map = this.map;
      this.cctv.setConfigs(this.map.cctvConfigs);
      this.cctv.updateDoorButtons(this.map.doors);
    }
    this.controls.setDisabled(false);
    this.controls.requestPointerLock();
    this.missionStartTime = performance.now();
    this.showGameToast('[REDEPLOY] 벙커 재투입 완료. 새로운 무작위 배치로 작전을 개시합니다.', 'success');
  }

  /**
   * 작전 사령부 브리핑 룸(로비 메뉴)으로 복귀
   */
  returnToLobby() {
    if (this.tacticalDeathModalEl) this.tacticalDeathModalEl.classList.add('hidden');
    if (this.deathSurveillanceHudEl) this.deathSurveillanceHudEl.classList.add('hidden');
    if (this.gameOverModalEl) this.gameOverModalEl.classList.add('hidden');
    if (this.escapeModalEl) this.escapeModalEl.classList.add('hidden');
    if (this.jumpscareOverlayEl) this.jumpscareOverlayEl.classList.add('hidden');
    if (this.cctv && this.cctv.isOpen) this.cctv.close();

    if (this.deathTypeInterval) {
      clearTimeout(this.deathTypeInterval);
      this.deathTypeInterval = null;
    }

    this.isPlayerDead = false;
    this.isDeathCamActive = false;
    this.isDeployed = false;
    this.showGameplayUI();

    if (this.fallenOperative) {
      this.fallenOperative.root.visible = false;
    }
    if (this.droppedFlashlight) {
      this.droppedFlashlight.visible = false;
    }
    if (this.deathCamLight) {
      this.deathCamLight.visible = false;
    }

    if (this.viewModel) {
      this.viewModel.root.visible = true;
    }
    this.applyChapterLighting(false);
    if (this.map.bunkerAmbient) this.map.bunkerAmbient.intensity = this.activeChapterId === 'chapter2' ? 1.25 : 0.45;
    if (this.map.genLight) this.map.genLight.intensity = this.activeChapterId === 'chapter2' ? 5.2 : 2.2;
    if (this.map.consoleLight) this.map.consoleLight.intensity = 2.0;

    this.map.setBlackoutState(false);
    sound.setBlackout(false);
    this.playerPos.set(this.map.spawnPos.x, this.playerEyeHeight, this.map.spawnPos.z);
    this.playerCamera.position.copy(this.playerPos);
    this.playerCamera.rotation.z = 0;
    this.stamina = this.maxStamina;
    this.staminaExhausted = false;
    this.sonarPulseCooldown = 0;

    if (this.interactionSystem) {
      this.interactionSystem.setupNewMatch();
    }
    if (this.monsterAI) {
      this.monsterAI.resetForNewMatch();
    }
    if (this.cctv) {
      this.cctv.map = this.map;
      this.cctv.setConfigs(this.map.cctvConfigs);
      this.cctv.updateDoorButtons(this.map.doors);
    }

    this.controls.setDisabled(true);
    this.controls.unlock();
    if (this.gameSetupModalEl) {
      this.gameSetupModalEl.classList.remove('hidden');
    }

    this.showGameToast('[LOBBY] 작전 사령부 브리핑 룸으로 복귀했습니다.', 'info');
  }

  /**
   * Phase 3: 점프스케어 직후 CCTV 감시 시점 및 사망확인 터미널 연출 개시
   */
  startCinematicDeathSequence() {
    this.isPlayerDead = true;
    this.isDeathCamActive = true;
    this.deathCamTimer = 0;
    this.controls.setDisabled(true);
    this.controls.unlock();

    // 1. 점프스케어 오버레이 제거
    if (this.jumpscareOverlayEl) {
      this.jumpscareOverlayEl.classList.add('hidden');
    }

    // 2. 1인칭 손 모델 숨김
    if (this.viewModel) {
      this.viewModel.root.visible = false;
    }

    // 3. 쓰러진 대원 3D 모델 현 위치 바닥에 정확히 배치 (수몰 및 지하 파묻힘 방지)
    const floorY = this.map ? this.map.getFloorHeightAt(this.playerPos.x, this.playerPos.z) : 0.0;

    if (!this.fallenOperative) {
      this.fallenOperative = new PlayerCharacterEntity(this.callsign || 'OPERATIVE', false);
      this.scene.add(this.fallenOperative.root);
    }
    this.fallenOperative.root.visible = true;
    this.fallenOperative.root.position.set(this.playerPos.x, floorY + 0.10, this.playerPos.z);
    this.fallenOperative.setFallenPose();

    // 바닥에 떨어진 손전등 조명 (바닥을 비추는 희미한 빛줄기)
    if (!this.droppedFlashlight) {
      this.droppedFlashlight = new THREE.SpotLight(0xffecc0, 3.2, 14, Math.PI / 4.5, 0.7, 1.2);
      this.droppedFlashlightTarget = new THREE.Object3D();
      this.scene.add(this.droppedFlashlight);
      this.scene.add(this.droppedFlashlightTarget);
      this.droppedFlashlight.target = this.droppedFlashlightTarget;
    }
    this.droppedFlashlight.visible = true;
    this.droppedFlashlight.position.set(this.playerPos.x + 0.35, floorY + 0.08, this.playerPos.z + 0.35);
    const dropFwd = new THREE.Vector3(1, 0, 0.8).normalize();
    this.droppedFlashlightTarget.position.copy(this.droppedFlashlight.position).addScaledVector(dropFwd, 6.0);

    // 4. CCTV 감시 카메라 위치 설정 (벽 및 천장 관통 방지)
    if (!this.deathCamera) {
      this.deathCamera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 80);
    }
    this.deathCamera.aspect = window.innerWidth / window.innerHeight;
    this.deathCamera.updateProjectionMatrix();

    const camPos = this.calculateDeathCamPos(this.playerPos, floorY);
    this.deathCamera.position.copy(camPos);
    this.deathCamera.lookAt(this.playerPos.x, floorY + 0.28, this.playerPos.z);

    // CCTV 야간 투시 스포트라이트
    if (!this.deathCamLight) {
      this.deathCamLight = new THREE.SpotLight(0xccffdd, 14.0, 32.0, Math.PI / 2.3, 0.65, 1.1);
      this.deathCamLightTarget = new THREE.Object3D();
      this.scene.add(this.deathCamLight);
      this.scene.add(this.deathCamLightTarget);
      this.deathCamLight.target = this.deathCamLightTarget;
    }
    this.deathCamLight.visible = true;
    this.deathCamLight.position.copy(camPos);
    this.deathCamLightTarget.position.set(this.playerPos.x, floorY + 0.20, this.playerPos.z);

    // 5. 괴물 사후 대치 및 복도 이탈 상태 진입
    if (this.monsterAI) {
      this.monsterAI.enterPostKillStalk(this.playerPos);
    }

    // 6. 음향 효과: CCTV 화면 전환 치직거림 + 전자기 험 노이즈
    sound.playCctvSwitch(0.35);
    sound.playLampFlickerBuzz(0.2);

    // 7. CCTV 감시 화면 HUD 및 좌측 상단 터미널 타이핑 시퀀스 개시
    if (this.deathSurveillanceHudEl) {
      this.deathSurveillanceHudEl.classList.remove('hidden');
    }
    this.startDeathTerminalTyping();
  }

  /**
   * 벽 및 천장 관통을 방지하는 안전한 CCTV 감시 카메라 위치 탐색
   */
  calculateDeathCamPos(targetPos, floorY = 0) {
    const isCh2 = this.activeChapterId === 'chapter2';
    // 천장/아치에 파묻히지 않도록 바닥 기준 1.85m(챕터2) ~ 2.10m(챕터1)로 안전하게 설정
    const camY = floorY + (isCh2 ? 1.85 : 2.10);

    const candidates = [
      { x: -1.8, z: 1.6 },
      { x: 1.8, z: -1.6 },
      { x: 1.6, z: 1.6 },
      { x: -1.6, z: -1.6 },
      { x: 0, z: 2.0 },
      { x: 0, z: -2.0 },
      { x: 2.0, z: 0 },
      { x: -2.0, z: 0 }
    ];

    for (const cand of candidates) {
      const cx = targetPos.x + cand.x;
      const cz = targetPos.z + cand.z;
      const { col, row } = worldToTile(cx, cz);
      const ch = this.map ? this.map.getTileChar(col, row) : ' ';
      if (ch !== '#' && ch !== ' ') {
        if (!this.map || !this.map.checkCollision(cx, cz, 0.35)) {
          return new THREE.Vector3(cx, camY, cz);
        }
      }
    }
    return new THREE.Vector3(targetPos.x - 0.8, camY, targetPos.z + 0.8);
  }

  /**
   * 좌측 상단 군용 터미널 타이핑 연출
   */
  startDeathTerminalTyping() {
    const screenEl = document.getElementById('death-terminal-screen');
    if (!screenEl) return;
    screenEl.innerHTML = '';

    const lines = [
      `>> [SEC_NET] SYSTEM OVERRIDE FEED: ACTIVE`,
      `>> [BIOMETRICS] OPERATIVE CALLSIGN: ${this.callsign || 'OPERATIVE-01'}`,
      `>> [TELEMETRY] 생체 바이탈 급감... 38... 11... 0 BPM [FLATLINE]`,
      `>> [STATUS: 0x4F_FATAL] 사망 확인 // 무전 통신 두절 (M.I.A)`,
      `>> [PROTOCOL] 벙커 차단 격벽 전면 폐쇄 및 감시망 전환 완료`
    ];

    let currentLineIdx = 0;
    let currentCharIdx = 0;
    let currentLineEl = null;

    if (this.deathTypeInterval) {
      clearTimeout(this.deathTypeInterval);
      this.deathTypeInterval = null;
    }

    const typeNextChar = () => {
      if (currentLineIdx >= lines.length) {
        // 모든 라인 출력 완료 후 1.1초 뒤 선택 모달 표시
        this.deathTypeInterval = setTimeout(() => {
          this.showTacticalDeathModal();
        }, 1100);
        return;
      }

      if (!currentLineEl) {
        currentLineEl = document.createElement('div');
        currentLineEl.className = 'terminal-line';
        if (currentLineIdx === 2) currentLineEl.classList.add('danger');
        if (currentLineIdx === 3) currentLineEl.classList.add('fatal');
        screenEl.appendChild(currentLineEl);
        screenEl.scrollTop = screenEl.scrollHeight;

        if (currentLineIdx === 2) {
          sound.playFlatlineBeep(0.2);
        }
      }

      const lineText = lines[currentLineIdx];
      currentLineEl.textContent = lineText.slice(0, currentCharIdx + 1) + '█';
      currentCharIdx++;

      if (currentCharIdx % 2 === 0) {
        sound.playTerminalKey(0.04);
      }

      if (currentCharIdx >= lineText.length) {
        currentLineEl.textContent = lineText;
        currentLineIdx++;
        currentCharIdx = 0;
        currentLineEl = null;
        this.deathTypeInterval = setTimeout(typeNextChar, 180);
      } else {
        this.deathTypeInterval = setTimeout(typeNextChar, 24);
      }
    };

    this.deathTypeInterval = setTimeout(typeNextChar, 350);
  }

  /**
   * 사망 후 1초 뒤 표시되는 작전 실패 판단 모달
   */
  showTacticalDeathModal() {
    if (!this.tacticalDeathModalEl) return;

    const callsignEl = document.getElementById('death-stat-callsign');
    const timeEl = document.getElementById('death-stat-time');
    const coresEl = document.getElementById('death-stat-cores');
    const blackoutsEl = document.getElementById('death-stat-blackouts');

    if (callsignEl) callsignEl.textContent = this.callsign || 'OPERATIVE-01';
    if (timeEl) {
      const elapsed = Math.floor((performance.now() - (this.missionStartTime || performance.now())) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      timeEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    if (coresEl && this.interactionSystem) {
      coresEl.textContent = `${this.interactionSystem.restoredCores || 0} / 3 개`;
    }
    if (blackoutsEl && this.interactionSystem) {
      blackoutsEl.textContent = `${this.interactionSystem.blackoutCount || 0} 회`;
    }

    const isCoop = this.networkManager && this.networkManager.roomId;
    const hasTeammates = isCoop && this.networkManager.remotePlayers && this.networkManager.remotePlayers.size > 0;

    if (this.btnDeathSpectate) {
      if (hasTeammates) {
        this.btnDeathSpectate.classList.remove('hidden');
      } else {
        this.btnDeathSpectate.classList.add('hidden');
      }
    }

    this.tacticalDeathModalEl.classList.remove('hidden');
  }

  /**
   * 협동전 사망 시 생존 팀원 CCTV 관전 모드 진입
   */
  startSpectateMode() {
    if (this.tacticalDeathModalEl) {
      this.tacticalDeathModalEl.classList.add('hidden');
    }
    if (this.deathSurveillanceHudEl) {
      this.deathSurveillanceHudEl.classList.add('hidden');
    }
    this.isDeathCamActive = false;
    if (this.cctv) {
      this.cctv.open();
      this.showGameToast('[SPECTATE] 생존 대원 관전 모드 가동. CCTV 및 방호문을 원격 조작하십시오.', 'info');
    }
  }

  hideGameplayUI() {
    document.body.classList.add('in-death-sequence');
    const hud = document.getElementById('game-hud');
    if (hud) hud.classList.add('hidden');
    const obj = document.getElementById('objective-panel');
    if (obj) obj.classList.add('hidden');
    const crosshair = document.getElementById('crosshair');
    if (crosshair) crosshair.classList.add('hidden');
    const touch = document.getElementById('touch-controls');
    if (touch) touch.classList.add('hidden');
    const prompt = document.getElementById('interact-prompt');
    if (prompt) prompt.classList.add('hidden');
    const toast = document.getElementById('game-toast');
    if (toast) toast.classList.add('hidden');
    const bottomHud = document.getElementById('bottom-center-hud');
    if (bottomHud) {
      bottomHud.classList.add('hidden');
      bottomHud.classList.add('ui-hidden');
      bottomHud.style.display = 'none';
    }
  }

  showGameplayUI() {
    document.body.classList.remove('in-death-sequence');
    const hud = document.getElementById('game-hud');
    if (hud) hud.classList.remove('hidden');
    const obj = document.getElementById('objective-panel');
    if (obj) obj.classList.remove('hidden');
    const crosshair = document.getElementById('crosshair');
    if (crosshair) crosshair.classList.remove('hidden');
    const bottomHud = document.getElementById('bottom-center-hud');
    if (bottomHud) {
      bottomHud.classList.remove('hidden');
      bottomHud.classList.remove('ui-hidden');
      bottomHud.style.display = 'flex';
    }
    this.syncDeviceModeUI();
  }

  syncDeviceModeUI() {
    const isTablet = this.controls.deviceMode === 'tablet';
    if (this.hudHintEl) {
      this.hudHintEl.textContent = isTablet
        ? '[TOUCH: MOVE JOYSTICK / DRAG VIEW / USE BUTTONS]'
        : '[WASD: 이동 | Shift: 달리기 | E: 작동/습득 | Q: 버리기/점화 | 1~3: 슬롯 | F: 손전등 | P: 정전테스트]';
    }
  }

  initEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.playerCamera.aspect = w / h;
      this.playerCamera.updateProjectionMatrix();
      if (this.cctv) this.cctv.resize(w / h);
      if (this.deathCamera) {
        this.deathCamera.aspect = w / h;
        this.deathCamera.updateProjectionMatrix();
      }
      if (this.modelViewer && this.modelViewer.isOpen) this.modelViewer.resize();
    });

    if (this.btnTriggerBlackout) {
      this.btnTriggerBlackout.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnTriggerBlackout.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.interactionSystem) {
          this.interactionSystem.triggerBlackout('수동 테스트: 괴물이 전력망을 절단하여 벙커 전체가 정전되었습니다!');
        }
      });
    }

    if (this.btnRestartMatch) {
      this.btnRestartMatch.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnRestartMatch.addEventListener('click', (e) => {
        e.stopPropagation();
        this.restartNewRandomMatch();
      });
    }

    if (this.btnRetryMatch) {
      this.btnRetryMatch.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnRetryMatch.addEventListener('click', (e) => {
        e.stopPropagation();
        this.restartNewRandomMatch();
      });
    }

    // Phase 3 신규 버튼 이벤트 바인딩
    if (this.btnDeathLobby) {
      this.btnDeathLobby.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnDeathLobby.addEventListener('click', (e) => {
        e.stopPropagation();
        this.returnToLobby();
      });
    }

    if (this.btnDeathRedeploy) {
      this.btnDeathRedeploy.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnDeathRedeploy.addEventListener('click', (e) => {
        e.stopPropagation();
        this.restartNewRandomMatch();
      });
    }

    if (this.btnDeathSpectate) {
      this.btnDeathSpectate.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnDeathSpectate.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startSpectateMode();
      });
    }

    if (this.btnEscapeLobby) {
      this.btnEscapeLobby.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnEscapeLobby.addEventListener('click', (e) => {
        e.stopPropagation();
        this.returnToLobby();
      });
    }

    const bindShowcaseOpen = (btn) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModelViewer();
      });
    };

    bindShowcaseOpen(this.btnOpenModelViewer);
    bindShowcaseOpen(this.btnOpenShowcaseHud);

    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnFullscreen.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      });
    }

    // 작전 구역 투입 버튼
    if (this.btnDeployMission) {
      this.btnDeployMission.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnDeployMission.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deployMission();
      });
    }

    // -------------------------------------------------------------------------
    // 미니멀 레트로 호러 메인 메뉴 네비게이션 제어기 (Lost Tunnel Style)
    // -------------------------------------------------------------------------
    const menuNavItems = document.querySelectorAll('.menu-nav-item');
    const menuCards = document.querySelectorAll('.menu-card');
    const menuCategoryTitle = document.getElementById('menu-current-category');
    const menuCategoryDesc = document.getElementById('menu-current-desc');

    const switchMenuTab = (target) => {
      menuNavItems.forEach(item => {
        item.classList.toggle('active', item.dataset.target === target);
      });
      menuCards.forEach(card => card.classList.add('hidden'));

      if (target === 'campaign') {
        const c = document.getElementById('card-campaign');
        if (c) c.classList.remove('hidden');
        if (menuCategoryTitle) menuCategoryTitle.textContent = '캠페인';
        if (menuCategoryDesc) {
          menuCategoryDesc.textContent = '폐쇄된 지하 연구 단지에서 생존하십시오. 비상 발전기를 복구하고 환기구의 위협을 피해 탈출해야 합니다.';
        }
      } else if (target === 'coop') {
        const c = document.getElementById('card-coop');
        if (c) c.classList.remove('hidden');
        if (menuCategoryTitle) menuCategoryTitle.textContent = '협동 플레이';
        if (menuCategoryDesc) {
          menuCategoryDesc.textContent = '다른 대원들과 세션을 공유하여 함께 벙커를 수색하십시오. 방호문 제어와 코어 수리가 실시간 동기화됩니다.';
        }
        if (!this.networkManager.isConnected) {
          this.networkManager.connect().then(connected => {
            if (this.serverStatusPill) {
              this.serverStatusPill.className = connected ? 'status-pill online' : 'status-pill offline';
              this.serverStatusPill.textContent = connected ? '서버 연결됨' : '서버 대기 중';
            }
          });
        }
      } else if (target === 'achievements') {
        const c = document.getElementById('card-achievements');
        if (c) c.classList.remove('hidden');
        if (menuCategoryTitle) menuCategoryTitle.textContent = '업적';
        if (menuCategoryDesc) {
          menuCategoryDesc.textContent = '지하 벙커와 침수 터널에서 달성한 생존 및 탈출 전술 메달 목록입니다.';
        }
      } else if (target === 'settings') {
        const c = document.getElementById('card-settings');
        if (c) c.classList.remove('hidden');
        if (menuCategoryTitle) menuCategoryTitle.textContent = '설정';
        if (menuCategoryDesc) {
          menuCategoryDesc.textContent = '대원 호출 부호, 방호복 도장, 마우스 시점 감도, 터치 컨트롤러 및 오디오 환경을 조정합니다.';
        }
      } else if (target === 'showcase') {
        this.openModelViewer();
      }
    };

    menuNavItems.forEach(item => {
      item.addEventListener('click', () => {
        switchMenuTab(item.dataset.target);
      });
    });

    // 협동 플레이 내부 서브탭 (세션 개설 vs 참가)
    document.querySelectorAll('[data-coop-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-coop-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.coopTab;
        const createView = document.getElementById('coop-tab-create-view');
        const joinView = document.getElementById('coop-tab-join-view');
        if (createView) createView.classList.toggle('hidden', tab !== 'create');
        if (joinView) joinView.classList.toggle('hidden', tab !== 'join');
      });
    });

    // 설정 내부 서브탭 (일반 vs 조작 vs 오디오)
    document.querySelectorAll('[data-settings-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-settings-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.settingsTab;
        const genView = document.getElementById('settings-tab-general-view');
        const ctrlView = document.getElementById('settings-tab-controls-view');
        const audioView = document.getElementById('settings-tab-audio-view');
        if (genView) genView.classList.toggle('hidden', tab !== 'general');
        if (ctrlView) ctrlView.classList.toggle('hidden', tab !== 'controls');
        if (audioView) audioView.classList.toggle('hidden', tab !== 'audio');
      });
    });

    // 그래픽 사양 모드 버튼 이벤트 (갤럭시 탭 S9 FE & 저사양 PC 프리셋)
    document.querySelectorAll('.quality-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const quality = btn.dataset.quality;
        this.applyQualityPreset(quality);
        if (typeof sound.playClick === 'function') sound.playClick();
      });
    });

    // 챕터 데이터 및 네비게이션 제어
    const CHAPTERS = [
      {
        num: 1,
        diff: 'easy',
        badge: 'CHAPTER 01',
        title: '제1장: 버려진 격리 벙커',
        desc: '비상 발전기가 침묵한 연구 기지 벙커. 환기구의 신호음이 감지됩니다.',
        artBg: 'radial-gradient(circle at 50% 50%, #1e1a0a 0%, #0d0c06 50%, #020202 90%)',
        mistColor: 'rgba(255, 190, 80, 0.45)'
      },
      {
        num: 2,
        diff: 'normal',
        badge: 'CHAPTER 02',
        title: '제2장: 어둠 속의 침수 수로',
        desc: '지하수가 차오른 방류 수로 터널. 물살을 가르는 소리가 괴물을 자극합니다.',
        artBg: 'radial-gradient(circle at 50% 50%, #07192a 0%, #030a12 50%, #010204 90%)',
        mistColor: 'rgba(120, 210, 255, 0.45)'
      },
      {
        num: 3,
        diff: 'hard',
        badge: 'CHAPTER 03',
        title: '제3장: 심연의 지열 갱도',
        desc: '심도 300m 지하 광산. 증기 터빈과 광차 레일 너머에서 지진 같은 진동이 울립니다.',
        artBg: 'radial-gradient(circle at 50% 50%, #2a0707 0%, #120303 50%, #040101 90%)',
        mistColor: 'rgba(255, 80, 80, 0.5)'
      }
    ];

    let curChapterIdx = 1; // 기본 제2장 (표준)

    const updateChapterUI = (idx) => {
      curChapterIdx = (idx + CHAPTERS.length) % CHAPTERS.length;
      const ch = CHAPTERS[curChapterIdx];
      this.selectedChapterId = 'chapter' + ch.num;

      document.querySelectorAll('.chapter-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === curChapterIdx);
      });

      const badgeEl = document.getElementById('chapter-badge-text');
      const titleEl = document.getElementById('chapter-title-text');
      const descEl = document.getElementById('chapter-desc-text');
      const artEl = document.getElementById('viewport-art');
      const mistEl = document.querySelector('.tunnel-mist');

      if (badgeEl) badgeEl.textContent = ch.badge;
      if (titleEl) titleEl.textContent = ch.title;
      if (descEl) descEl.textContent = ch.desc;
      if (artEl) artEl.style.background = ch.artBg;
      if (mistEl) mistEl.style.background = `radial-gradient(circle, ${ch.mistColor} 0%, transparent 75%)`;

      this.difficulty = ch.diff;
      if (this.monsterAI) {
        this.monsterAI.setDifficulty(this.difficulty);
      }
    };

    const btnChapPrev = document.getElementById('btn-chapter-prev');
    const btnChapNext = document.getElementById('btn-chapter-next');
    if (btnChapPrev) btnChapPrev.addEventListener('click', () => updateChapterUI(curChapterIdx - 1));
    if (btnChapNext) btnChapNext.addEventListener('click', () => updateChapterUI(curChapterIdx + 1));

    document.querySelectorAll('.chapter-tab').forEach((tab, i) => {
      tab.addEventListener('click', () => updateChapterUI(i));
    });

    // 협동 플레이 맵 선택 버튼
    document.querySelectorAll('.coop-map-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.coop-map-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCoopMapId = btn.dataset.coopMap || 'chapter1';
      });
    });

    // 뒤로가기 버튼
    document.querySelectorAll('.btn-minimal-back').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isDeployed) {
          this.toggleSettingsModal();
        } else {
          switchMenuTab('campaign');
        }
      });
    });

    // 제작진 크레딧
    const btnCredits = document.getElementById('btn-show-credits');
    if (btnCredits) {
      btnCredits.addEventListener('click', () => {
        this.showGameToast('MONOCHROME // LOST BUNKER - 개발: KAERURU STUDIO', 'info');
      });
    }

    // 상단 HUD 설정 및 전술 지도 버튼
    if (this.btnOpenSettings) {
      this.btnOpenSettings.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnOpenSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSettingsModal();
      });
    }

    if (this.btnOpenTacticalMap) {
      this.btnOpenTacticalMap.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnOpenTacticalMap.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleTacticalMapModal();
      });
    }

    if (this.btnCloseTacticalMap) {
      this.btnCloseTacticalMap.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnCloseTacticalMap.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTacticalMapModal();
      });
    }

    // 작전 모드 탭 (솔로 vs 코옵 멀티플레이)
    if (this.btnModeSolo && this.btnModeCoop) {
      this.btnModeSolo.addEventListener('click', () => {
        this.gameMode = 'solo';
        this.btnModeSolo.classList.add('active');
        this.btnModeCoop.classList.remove('active');
        if (this.coopPanel) this.coopPanel.style.display = 'none';
      });

      this.btnModeCoop.addEventListener('click', () => {
        this.gameMode = 'coop';
        this.btnModeCoop.classList.add('active');
        this.btnModeSolo.classList.remove('active');
        if (this.coopPanel) this.coopPanel.style.display = 'flex';

        if (!this.networkManager.isConnected) {
          this.networkManager.connect().then(connected => {
            if (this.serverStatusPill) {
              this.serverStatusPill.className = connected ? 'status-pill online' : 'status-pill offline';
              this.serverStatusPill.textContent = connected ? '[SERVER: ONLINE]' : '[SERVER: STANDBY]';
            }
          });
        }
      });
    }

    // 코옵 방 개설 및 참가 버튼
    if (this.btnHostRoom) {
      this.btnHostRoom.addEventListener('click', () => {
        this.callsign = (this.callsignInput?.value || 'OPERATIVE-01').trim();
        const mapToHost = this.selectedCoopMapId || this.selectedChapterId || 'chapter1';
        this.networkManager.createRoom(this.callsign, this.suitColor, '', mapToHost);
      });
    }

    if (this.btnJoinRoom) {
      this.btnJoinRoom.addEventListener('click', () => {
        this.callsign = (this.callsignInput?.value || 'OPERATIVE-01').trim();
        const code = (this.roomCodeInput?.value || '').trim();
        if (!code) {
          this.showGameToast('[NET] 참가할 세션 코드를 입력하십시오.', 'warn');
          return;
        }
        this.networkManager.joinRoom(this.callsign, this.suitColor, code);
      });
    }

    if (this.btnCopyRoomCode) {
      this.btnCopyRoomCode.addEventListener('click', () => {
        const code = this.roomCodeDisplay?.textContent || '';
        if (code) {
          navigator.clipboard.writeText(code).then(() => {
            this.showGameToast(`[COPIED] 작전 세션 코드 [${code}] 복사 완료`, 'info');
          }).catch(() => {});
        }
      });
    }

    // 협동 세션 전원 출격 (작전 시작) 버튼
    if (this.btnStartCoop) {
      this.btnStartCoop.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnStartCoop.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.networkManager || !this.networkManager.isHost) {
          this.showGameToast('[NET] 작전 개시 명령은 지휘관(호스트)만 하달할 수 있습니다.', 'warn');
          return;
        }
        const mapToLaunch = this.selectedCoopMapId || this.activeChapterId || 'chapter2';
        this.networkManager.startGame(mapToLaunch);
      });
    }

    // 협동 세션 퇴장 버튼
    if (this.btnLeaveCoop) {
      this.btnLeaveCoop.addEventListener('click', () => {
        if (this.networkManager && this.networkManager.ws) {
          this.networkManager.ws.close();
        }
        this.currentRoomPlayers = [];
        if (this.roomInfoBox) this.roomInfoBox.classList.add('hidden');
        if (this.coopModeTabs) this.coopModeTabs.classList.remove('hidden');
        if (this.coopTabCreateView) this.coopTabCreateView.classList.remove('hidden');
        this.networkManager.connect();
        this.showGameToast('[NET] 세션에서 퇴장했습니다.', 'info');
      });
    }

    // 난이도 프리셋 버튼
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.diff || 'normal';
        if (this.monsterAI) {
          this.monsterAI.setDifficulty(this.difficulty);
        }
      });
    });

    // 수트 컬러 프리셋 버튼
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.suitColor = btn.dataset.suit || 'steel';
      });
    });

    // 마우스 감도 & 오디오 슬라이더
    if (this.mouseSensInput) {
      this.mouseSensInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.controls.mouseSensitivity = val;
        if (this.sensValEl) this.sensValEl.textContent = `${val.toFixed(1)}x`;
      });
    }

    if (this.audioVolInput) {
      this.audioVolInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        sound.volume = val / 100;
        if (this.volValEl) this.volValEl.textContent = `${val}%`;
      });
    }

    // 터치/모바일 조작 모드 선택 버튼
    const activePref = this.controls.controlPref || 'auto';
    document.querySelectorAll('.ctrl-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === activePref);
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ctrl-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        this.controls.setControlPref(mode);
        const labels = {
          'auto': '[CONTROLS] 기기 자동 감지 모드가 적용되었습니다.',
          'touch': '[CONTROLS] 모바일/가상 패드 강제 활성화 모드가 적용되었습니다.',
          'pc': '[CONTROLS] PC 마우스/키보드 전용 모드가 적용되었습니다.'
        };
        this.showGameToast(labels[mode] || '[CONTROLS] 조작 방식이 변경되었습니다.', 'info');
      });
    });

    // 조이스틱 크기 조절 슬라이더
    if (this.sliderJoystickSize && this.controls.touchConfig) {
      this.sliderJoystickSize.value = this.controls.touchConfig.joystickSize || 130;
      if (this.valJoystickSize) this.valJoystickSize.textContent = `${this.sliderJoystickSize.value}px`;
      this.sliderJoystickSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.valJoystickSize) this.valJoystickSize.textContent = `${val}px`;
        this.controls.applyTouchConfig({ joystickSize: val });
      });
    }

    // 액션 버튼 크기 조절 슬라이더
    if (this.sliderBtnSize && this.controls.touchConfig) {
      this.sliderBtnSize.value = this.controls.touchConfig.btnSize || 60;
      if (this.valBtnSize) this.valBtnSize.textContent = `${this.sliderBtnSize.value}px`;
      this.sliderBtnSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.valBtnSize) this.valBtnSize.textContent = `${val}px`;
        this.controls.applyTouchConfig({ btnSize: val });
      });
    }

    // 터치 투명도 조절 슬라이더
    if (this.sliderTouchOpacity && this.controls.touchConfig) {
      this.sliderTouchOpacity.value = this.controls.touchConfig.opacity || 85;
      if (this.valTouchOpacity) this.valTouchOpacity.textContent = `${this.sliderTouchOpacity.value}%`;
      this.sliderTouchOpacity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.valTouchOpacity) this.valTouchOpacity.textContent = `${val}%`;
        this.controls.applyTouchConfig({ opacity: val });
      });
    }

    // 좌우 손잡이 스왑 버튼
    const isSwapped = Boolean(this.controls.touchConfig?.isSwapped);
    document.querySelectorAll('.swap-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.swap === 'true') === isSwapped);
      btn.addEventListener('click', () => {
        document.querySelectorAll('.swap-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const swap = btn.dataset.swap === 'true';
        this.controls.applyTouchConfig({ isSwapped: swap });
        this.showGameToast(swap ? '[CONTROLS] 왼손잡이 배치(좌:액션/우:이동)로 스왑되었습니다.' : '[CONTROLS] 기본 배치(좌:이동/우:액션)로 복원되었습니다.', 'info');
      });
    });

    // 화면 직접 드래그 HUD 재배치 모드 진입
    if (this.btnTriggerHudEdit) {
      this.btnTriggerHudEdit.addEventListener('click', () => {
        if (this.gameSetupModalEl) {
          this.gameSetupModalEl.classList.add('hidden');
        }
        this.controls.openHudEditor();
        this.showGameToast('[HUD EDIT] 조이스틱과 각 버튼을 손가락이나 마우스로 드래그하여 편한 위치로 이동하십시오.', 'info');
      });
    }

    // HUD 재배치 기본값 복원 버튼
    if (this.btnResetHudLayout) {
      this.btnResetHudLayout.addEventListener('click', () => {
        this.controls.resetTouchLayout();
        this.showGameToast('[HUD RESET] 기본 인체공학적 부채꼴 배치로 초기화되었습니다.', 'success');
      });
    }

    window.addEventListener('keydown', (e) => {
      if (this.isPlayerDead || this.isDeathCamActive) return;
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
      if (
        !e.repeat &&
        this.monsterAI &&
        this.monsterAI.isPlayerSnared &&
        (e.code === 'Space' || e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD')
      ) {
        this.monsterAI.addSnareStruggle(20);
      }
      if (e.code === 'KeyM') {
        e.preventDefault();
        this.toggleTacticalMapModal();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (this.isTacticalMapOpen) {
          this.closeTacticalMapModal();
        } else if (this.modelViewer && this.modelViewer.isOpen) {
          this.modelViewer.close();
        } else if (this.cctv && this.cctv.isOpen) {
          this.cctv.close();
        } else if (this.isDeployed) {
          this.toggleSettingsModal();
        }
      }
    });

    window.addEventListener('pointerdown', () => {
      if (this.isDeployed && !this.isPlayerDead && this.monsterAI && this.monsterAI.isPlayerSnared) {
        this.monsterAI.addSnareStruggle(18);
      }
    });

    const unlockAudio = () => {
      sound.init();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
  }

  updateRoomRoster() {
    if (!this.roomPlayerList) return;
    if (this.roomPlayerCount) {
      this.roomPlayerCount.textContent = this.currentRoomPlayers.length;
    }
    this.roomPlayerList.innerHTML = this.currentRoomPlayers.map(p => {
      const isHost = p.isHost;
      const roleBadge = isHost ? '[HOST/지휘관]' : '[대원]';
      return `<div class="roster-item" style="display:flex; justify-content:space-between; align-items:center; padding:5px 8px; background:rgba(255,255,255,0.06); border-left:3px solid ${isHost ? '#55ccee' : '#8899aa'}; margin-bottom:4px; font-size:12px;">
        <span style="font-weight:bold; color:${isHost ? '#55ccee' : '#eef2f7'};">${roleBadge} ${p.callsign}</span>
        <span style="color:#8899aa; font-size:11px;">${p.ping ? p.ping + 'ms' : 'ONLINE'}</span>
      </div>`;
    }).join('');

    const isHost = this.networkManager && this.networkManager.isHost;
    if (this.btnStartCoop) {
      this.btnStartCoop.style.display = isHost ? 'block' : 'none';
    }
    if (this.coopWaitingMsg) {
      this.coopWaitingMsg.style.display = isHost ? 'none' : 'block';
    }
    if (this.currentRoomMapDisplay && this.networkManager && this.networkManager.mapId) {
      const mapNames = {
        chapter1: 'CHAPTER 1: 격리 벙커',
        chapter2: 'CHAPTER 2: 침수 터널',
        chapter3: 'CHAPTER 3: 지열 갱도'
      };
      this.currentRoomMapDisplay.textContent = mapNames[this.networkManager.mapId] || this.networkManager.mapId.toUpperCase();
    }
  }

  deployMission() {
    if (this.isDeploying) return;
    this.isDeploying = true;

    if (this.gameSetupModalEl) {
      this.gameSetupModalEl.classList.add('hidden');
    }

    const targetChapter = this.selectedChapterId || 'chapter2';
    this.callsign = (this.callsignInput?.value || 'OPERATIVE-01').trim();

    // 전술 로딩 스크린 생성 및 깔끔한 진입 애니메이션
    let loadingEl = document.getElementById('tactical-loading-screen');
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.id = 'tactical-loading-screen';
      loadingEl.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: radial-gradient(circle at center, #0a0f14 0%, #030507 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: #d8e4ec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        transition: opacity 0.45s ease-out;
      `;
      loadingEl.innerHTML = `
        <div style="width: 400px; max-width: 90vw; text-align: center; border: 1px solid rgba(88,140,180,0.35); background: rgba(8,14,20,0.92); padding: 26px 22px; border-radius: 4px; box-shadow: 0 0 35px rgba(0,0,0,0.9);">
          <div style="font-size: 11px; letter-spacing: 3px; color: #64b5f6; font-weight: bold; margin-bottom: 8px;">[ CBRN TACTICAL INFILTRATION ]</div>
          <div id="loading-stage-title" style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 16px;">작전 구역 환경 데이터 동기화 중...</div>
          <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 12px; border: 1px solid rgba(88,140,180,0.25);">
            <div id="loading-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #1976d2, #64b5f6); transition: width 0.12s ease-out;"></div>
          </div>
          <div id="loading-log-text" style="font-size: 11px; color: #8899a6; font-family: monospace; text-align: left; height: 18px; overflow: hidden;">> INITIALIZING SECTOR MAP GEOMETRY...</div>
        </div>
      `;
      document.body.appendChild(loadingEl);
    } else {
      loadingEl.style.display = 'flex';
      loadingEl.style.opacity = '1';
    }

    const progressBar = loadingEl.querySelector('#loading-progress-bar');
    const stageTitle = loadingEl.querySelector('#loading-stage-title');
    const logText = loadingEl.querySelector('#loading-log-text');

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 14) + 12;
      if (progress > 100) progress = 100;

      if (progressBar) progressBar.style.width = `${progress}%`;

      if (progress < 35) {
        if (stageTitle) stageTitle.textContent = '시설 3D 지형 및 수로 격자 로딩...';
        if (logText) logText.textContent = '> LOADING SECTOR GEOMETRY & ACOUSTIC NODES...';
      } else if (progress < 75) {
        if (stageTitle) stageTitle.textContent = '원격 감시 센서 및 생체 신호 연결...';
        if (logText) logText.textContent = '> SYNCHRONIZING CCTV GRID & LIFE-SIGN RADAR...';
      } else if (progress < 100) {
        if (stageTitle) stageTitle.textContent = '대원 전술 슈트 신경망 동기화...';
        if (logText) logText.textContent = '> SECURING BIO-CONTAINMENT PERIMETER...';
      } else {
        if (stageTitle) stageTitle.textContent = '투입 준비 완료. 전술 침투 개시.';
        if (logText) logText.textContent = '[CONFIRMED] ALL SYSTEMS ARMED & READY.';
      }

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          this.isDeployed = true;
          this.isDeploying = false;
          this.loadChapter(targetChapter);
          this.showGameplayUI();
          this.missionStartTime = performance.now();
          if (this.monsterAI) {
            this.monsterAI.setDifficulty(this.difficulty);
          }
          this.controls.setDisabled(false);
          this.controls.requestPointerLock();
          sound.playDoorSound(true);
          this.showGameToast(`[DEPLOYED] 대원 [${this.callsign}] 작전 투입 완료.`, 'success');

          // 부드럽게 페이드 아웃
          loadingEl.style.opacity = '0';
          setTimeout(() => {
            loadingEl.style.display = 'none';
          }, 450);
        }, 220);
      }
    }, 120);
  }

  /**
   * 챕터 2 전용 침수 수로 자욱한 수증기/물안개 부유 입자 시스템 생성
   */
  createMistParticles() {
    const count = 140;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 14.0;
      positions[i * 3 + 1] = 0.1 + Math.random() * 2.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14.0;
      speeds[i] = 0.15 + Math.random() * 0.25;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._mistSpeeds = speeds;

    // 몽글몽글한 수증기/물안개 미세 입자 재질
    const mat = new THREE.PointsMaterial({
      color: 0x88c0d0,
      size: 0.045,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      fog: true,
      depthWrite: false
    });
    this.mistParticles = new THREE.Points(geom, mat);
    this.mistParticles.visible = false;
    this.scene.add(this.mistParticles);
  }

  applyChapterLighting(isBlackout = false) {
    const isCh2 = this.activeChapterId === 'chapter2';
    if (isCh2) {
      // 챕터 2: 차가운 암흑 침수 수로 전술 조명 & 뿌연 수증기 물안개 (가시거리 11.5m)
      this.flashlightOn = true;
      this.flashlight.color.setHex(0xeef5fc); // 차가운 청백색 전술 스포트라이트
      this.flashlight.distance = 12.0; // 안개 한계선(11.5m)과 맞춰 저 멀리서 다가오는 악어의 붉은 코어와 실루엣이 먼저 시야에 들어오도록 설정
      this.flashlight.angle = Math.PI / 3.4; // 좁고 집중된 전술 빔
      this.flashlight.penumbra = 0.85; // 부드러운 수중 빛 번짐
      this.flashlight.intensity = isBlackout ? 0 : 22.0;
      if (this.playerFillLight) this.playerFillLight.intensity = isBlackout ? 0 : 0.35;

      if (this.btnTouchFlashlight) {
        const lbl = this.btnTouchFlashlight.querySelector('.btn-label');
        if (lbl) lbl.textContent = 'PULSE';
        const sub = this.btnTouchFlashlight.querySelector('.btn-sub');
        if (sub) sub.textContent = '[ F ]';
        this.btnTouchFlashlight.classList.add('active');
        this.btnTouchFlashlight.style.opacity = '1.0';
        this.btnTouchFlashlight.title = '소나 펄스 충격파 발사 (F키 / 매복자 퇴치 & 추격자 악어 유인)';
      }

      // 챕터 2에서는 CCTV가 없으므로 터치 CCTV 버튼 숨김
      if (this.btnTouchCCTV) {
        this.btnTouchCCTV.style.display = 'none';
      }

      // 선형 안개 THREE.Fog(color, near, far) 사용:
      // near=1.8m에서 안개가 시작되어 far=11.5m에서 정확히 100% 완전 불투명 안개 차단!
      // 안개 너머의 원거리 실루엣은 자연스럽게 감춰지며, 11m 이내로 들어온 거대 악어가 공포스럽게 가시화됨
      const fogColor = isBlackout ? 0x010203 : 0x03060a;
      this.scene.background.setHex(fogColor);
      this.scene.fog = new THREE.Fog(fogColor, 1.8, 11.5);

      if (this.ambientLight) {
        this.ambientLight.color.setHex(isBlackout ? 0x04080c : 0x060f16);
        this.ambientLight.intensity = isBlackout ? 0.04 : 0.12; // 어둡고 음산한 침수 수로 환경광
      }
      if (this.mistParticles) this.mistParticles.visible = true;
    } else {
      this.flashlightOn = !isBlackout;
      this.flashlight.color.setHex(0xf0f6ff);
      this.flashlight.distance = 36;
      this.flashlight.angle = Math.PI / 3.3;
      this.flashlight.penumbra = 0.72;
      this.flashlight.intensity = isBlackout ? 0 : this.flashlightMaxIntensity;
      if (this.playerFillLight) this.playerFillLight.intensity = isBlackout ? 0.22 : 1.45;
      if (this.btnTouchCCTV) this.btnTouchCCTV.style.display = '';
      if (this.btnTouchFlashlight) {
        const lbl = this.btnTouchFlashlight.querySelector('.btn-label');
        if (lbl) lbl.textContent = 'LIGHT';
        const sub = this.btnTouchFlashlight.querySelector('.btn-sub');
        if (sub) sub.textContent = '[ F ]';
        this.btnTouchFlashlight.classList.toggle('active', this.flashlightOn);
        this.btnTouchFlashlight.style.opacity = '1.0';
        this.btnTouchFlashlight.title = '전술 손전등 온/오프';
      }
      this.scene.background.setHex(0x040405);
      this.scene.fog = new THREE.FogExp2(0x040405, 0.052);
      if (this.ambientLight) {
        this.ambientLight.color.setHex(isBlackout ? 0xff2211 : 0x282c32);
        this.ambientLight.intensity = isBlackout ? 0.25 : 0.58;
      }
      if (this.mistParticles) this.mistParticles.visible = false;
    }
  }

  loadChapter(chapterId = 'chapter1') {
    const cfg = CHAPTER_CONFIGS[chapterId] || CHAPTER_CONFIGS.chapter1;
    this.activeChapterId = cfg.id;
    this.currentChapterConfig = cfg;
    this.sonarBeepTimer = 0.5;
    this.sonarPulseCooldown = 0;

    // 1. 3D 맵 재구성 (지오메트리, 벽, 문, 수면, 전등)
    if (this.map) {
      this.map.rebuildMap(cfg.data, cfg.id);
      if (this.map.spawnPos) {
        let spawnX = this.map.spawnPos.x;
        let spawnZ = this.map.spawnPos.z;

        // 멀티플레이 분산 스폰: 대원들이 같은 위치에 겹쳐서 끼이지 않도록 방 인덱스별로 2m 이상 분산 스폰
        if (this.currentRoomPlayers && this.currentRoomPlayers.length > 1 && this.networkManager && this.networkManager.playerId) {
          const myIdx = this.currentRoomPlayers.findIndex(p => p.id === this.networkManager.playerId);
          if (myIdx > 0) {
            const offsets = [
              { x: 0, z: 0 },
              { x: 2.2, z: 0.8 },
              { x: -2.2, z: 0.8 },
              { x: 0.8, z: 2.2 },
              { x: -0.8, z: 2.2 },
              { x: 2.4, z: -1.6 },
              { x: -2.4, z: -1.6 }
            ];
            const off = offsets[myIdx % offsets.length];
            const testX = spawnX + off.x;
            const testZ = spawnZ + off.z;
            if (!this.map.checkCollision(testX, testZ, this.playerRadius)) {
              spawnX = testX;
              spawnZ = testZ;
            }
          }
        }

        this.playerFootY = this.map.getFloorHeightAt(spawnX, spawnZ);
        this.playerPos.set(
          spawnX,
          this.playerFootY + this.playerEyeHeight,
          spawnZ
        );
        this.playerCamera.position.copy(this.playerPos);
      }
    }

    // 1-1. 환경 조명 및 1인칭 장비(손전등 vs 직육면체 감지기) 적용
    this.applyChapterLighting(false);
    if (this.viewModel) {
      this.viewModel.setChapterMode(cfg.id);
    }

    // 2. 괴물 AI 챕터 설정 및 벤트/노드 재구성
    if (this.monsterAI) {
      this.monsterAI.setChapter(cfg);
    }

    // 3. 상호작용 및 파밍 시스템 리셋
    if (this.interactionSystem) {
      this.interactionSystem.setupNewMatch(cfg, this.matchSeed);
    }

    // 4. CCTV 콘솔 연동 업데이트
    if (this.cctv) {
      this.cctv.map = this.map;
      this.cctv.setConfigs(this.map.cctvConfigs);
      this.cctv.updateDoorButtons(this.map.doors);
    }

    // 5. 위치 HUD 구역 업데이트
    if (this.locationTextEl) {
      const tile = worldToTile(this.playerPos.x, this.playerPos.z);
      const ch = this.map ? this.map.getTileChar(tile.col, tile.row) : 'S';
      this.locationTextEl.textContent = `위치: ${getZoneName(tile.col, tile.row, ch, this.activeChapterId)}`;
    }
  }

  toggleSettingsModal() {
    if (!this.gameSetupModalEl) return;
    const isHidden = this.gameSetupModalEl.classList.contains('hidden');
    if (isHidden) {
      this.gameSetupModalEl.classList.remove('hidden');
      this.controls.setDisabled(true);
      this.controls.unlock();
      // 인게임에서 열 때 설정 탭으로 전환
      const settingsNav = document.querySelector('.menu-nav-item[data-target="settings"]');
      if (settingsNav) settingsNav.click();
    } else {
      this.gameSetupModalEl.classList.add('hidden');
      this.controls.setDisabled(false);
      this.controls.requestPointerLock();
    }
  }

  toggleDoor(doorId) {
    if (this.interactionSystem && this.interactionSystem.isBlackout) {
      this.showGameToast('[ERROR] 방호문 전원이 차단되어 조작할 수 없습니다. 전기실 배전반을 복구하십시오.', 'danger');
      return;
    }
    const isOpen = this.map.toggleDoor(doorId);
    sound.playDoorSound(isOpen);
    if (this.networkManager && this.networkManager.roomId) {
      this.networkManager.sendDoorToggle(doorId, isOpen);
    }
    if (this.monsterAI) {
      const door = this.map.doors.find(d => d.id === doorId);
      if (door) {
        this.monsterAI.notifyPlayerSound(door.x, door.z, 18.0, '방호문 개폐음');
      }
    }
    if (this.viewModel) {
      this.viewModel.triggerInteractAnim();
    }
    if (this.cctv) {
      this.cctv.updateDoorButtons(this.map.doors);
    }
  }

  update(dt) {
    if (this.modelViewer && this.modelViewer.isOpen) {
      this.modelViewer.updateAndRender(dt);
      return;
    }
    if (!this.isDeployed) {
      // 투입 전 로비 상태: 배경 씬 렌더링만 유지
      return;
    }

    // Phase 3: 사망 직후 CCTV 감시 시점 업데이트 (괴물 사후 이탈, 맵 전등 지직거림, CCTV 타임스탬프)
    if (this.isDeathCamActive) {
      this.deathCamTimer += dt;
      this.map.update(dt, this.playerPos, this.monsterAI ? this.monsterAI.pos : null);
      if (this.monsterAI) {
        this.monsterAI.update(dt, this.playerPos, this.deathCamera || this.playerCamera, false, false, false);
      }
      if (this.deathCamera) {
        this.deathCamera.rotation.z = Math.sin(this.deathCamTimer * 0.42) * 0.025;
      }
      if (this.deathCctvTimestampEl) {
        const elapsed = Math.floor(this.deathCamTimer);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        const ms = Math.floor((this.deathCamTimer % 1) * 100);
        this.deathCctvTimestampEl.textContent = `TIME: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')} | SENSOR: BIO_HAZARD ALERT | IR: ACTIVE`;
      }
      return;
    }

    // 1-2. 괴물에게 붙잡힌 처형(Jumpscare) 연출 진행 중이면 카메라 고정 및 점프스케어 애니메이션 업데이트 수행
    if (this.monsterAI && this.monsterAI.isKillingPlayer) {
      if (this.cctv && this.cctv.isOpen) this.cctv.close();
      this.monsterAI.update(dt, this.playerPos, this.playerCamera, false, false, false);
      return;
    }

    if (this.isPlayerDead) return;
    if (this.interactionSystem && this.interactionSystem.isGameCleared) return;

    // 1. 맵 애니메이션 (발전기 코어 회전, 방호문 슬라이딩, 괴물 근접 시 전등 지직거림)
    this.map.update(dt, this.playerPos, this.monsterAI ? this.monsterAI.pos : null);

    // 1-1. 상호작용 & 파밍 & 정전/탈출 시스템 업데이트
    if (this.interactionSystem) {
      this.interactionSystem.update(dt);
    }

    // 2. CCTV 모니터가 열려 있을 때의 업데이트 (괴물도 실시간으로 활동)
    if (this.cctv && this.cctv.isOpen) {
      if (this.monsterAI) {
        this.monsterAI.update(dt, this.playerPos, this.playerCamera, this.flashlightOn, false, false);
      }
      this.cctv.update(dt, this.map, this.playerPos);
      return;
    }

    // 2-1. 인벤토리 슬롯 전환 (숫자키 1~3 또는 슬롯 클릭)
    const reqSlot = this.controls.consumeSlotSelect();
    if (reqSlot !== null && this.interactionSystem) {
      this.interactionSystem.selectSlot(reqSlot);
    }

    // 2-2. 들고 있는 아이템 내려놓기 / 조명탄 점화 (Q키 또는 버리기 버튼)
    if (this.controls.consumeDrop() && this.interactionSystem) {
      this._tmpForward.set(0, 0, -1).applyQuaternion(this.playerCamera.quaternion);
      this._tmpForward.y = 0;
      if (this._tmpForward.lengthSq() > 0.001) this._tmpForward.normalize();
      this.interactionSystem.dropOrUseHeldItem(this.playerPos, this._tmpForward);
    }

    // 2-3. 챕터 2 소나 펄스 쿨타임 감소 및 HUD 동기화
    if (this.sonarPulseCooldown > 0) {
      this.sonarPulseCooldown = Math.max(0, this.sonarPulseCooldown - dt);
      if (this.activeChapterId === 'chapter2' && this.btnTouchFlashlight) {
        const lbl = this.btnTouchFlashlight.querySelector('.btn-label');
        if (lbl) {
          if (this.sonarPulseCooldown > 0) {
            lbl.textContent = `${this.sonarPulseCooldown.toFixed(1)}s`;
            this.btnTouchFlashlight.classList.remove('active');
            this.btnTouchFlashlight.style.opacity = '0.45';
          } else {
            lbl.textContent = 'PULSE';
            this.btnTouchFlashlight.classList.add('active');
            this.btnTouchFlashlight.style.opacity = '1.0';
          }
        }
      }
    }

    // 3. F키 조작: 챕터 1 전술 손전등 온오프 vs 챕터 2 소나 펄스 충격파
    if (this.controls.consumeFlashlight()) {
      if (this.activeChapterId === 'chapter2') {
        this.triggerSonarPulse();
      } else {
        this.flashlightOn = !this.flashlightOn;
        this.flashlight.intensity = this.flashlightOn ? this.flashlightMaxIntensity : 0;
        if (this.playerFillLight) {
          this.playerFillLight.intensity = this.flashlightOn ? 1.45 : 0;
        }
        sound.playFlashlightClick(this.flashlightOn);
        if (this.viewModel) {
          this.viewModel.triggerFlashlightAnim(this.flashlightOn);
        }
        if (this.btnTouchFlashlight) {
          this.btnTouchFlashlight.classList.toggle('active', this.flashlightOn);
        }
      }
    }

    // 4. CCTV 단축키/버튼 또는 챕터 2 보조 소나 펄스 발사
    if (this.controls.consumeCCTV()) {
      if (this.activeChapterId === 'chapter2') {
        this.triggerSonarPulse();
      } else {
        if (this.nearInteractable && this.nearInteractable.type === 'console') {
          if (this.interactionSystem && this.interactionSystem.isBlackout) {
            this.showGameToast('[ERROR] CCTV 관제 전원이 차단되었습니다. 전기실 배전반을 먼저 복구하십시오.', 'danger');
          } else {
            this.cctv.open();
            return;
          }
        }
      }
    }

    // 5. 플레이어 1인칭 이동, 달리기(Sprint + 스태미나 + 시야각 연출) 및 충돌 처리
    const isSnared = Boolean(this.monsterAI && this.monsterAI.isPlayerSnared);
    const moveDir = this.controls.getMovementDirection();
    const isMoving = !isSnared && moveDir.lengthSq() > 0.0001;
    const wantsSprint = this.controls.isSprinting();
    const isActivelySprinting = isMoving && wantsSprint && !this.staminaExhausted && this.stamina > 0;

    if (this.lurkerSlowTimer && this.lurkerSlowTimer > 0) {
      this.lurkerSlowTimer = Math.max(0, this.lurkerSlowTimer - dt);
    }

    if (isActivelySprinting) {
      this.stamina = Math.max(0, this.stamina - 22 * dt);
      if (this.stamina <= 0) {
        this.staminaExhausted = true;
      }
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 18 * dt);
      if (this.staminaExhausted && this.stamina >= 28) {
        this.staminaExhausted = false;
      }
    }
    this.updateStaminaHUD(isActivelySprinting);

    const inWater = this.map ? this.map.isWaterAt(this.playerPos.x, this.playerPos.z) : false;
    const isCh2 = this.activeChapterId === 'chapter2';

    // 달리기 시 시야각(FOV) 자연스럽게 확장 (챕터 1: 74도->82도, 챕터 2 침수 수로: 84도->92도로 넓은 시야각 제공)
    const baseFov = isCh2 ? 84 : 74;
    const sprintFov = isCh2 ? 92 : 82;
    const targetFov = isActivelySprinting ? sprintFov : baseFov;
    if (Math.abs(this.playerCamera.fov - targetFov) > 0.05) {
      this.playerCamera.fov += (targetFov - this.playerCamera.fov) * Math.min(1, dt * 8);
      this.playerCamera.updateProjectionMatrix();
    }

    // 챕터 2에서는 물이 허벅지까지 차올라 -35% 속도 감소 (0.65배 속도) + 매복자 기습 피격 시 추가 감속
    const slowMult = (this.lurkerSlowTimer && this.lurkerSlowTimer > 0) ? 0.55 : 1.0;
    const waterMult = (inWater ? (isCh2 ? (isActivelySprinting ? 0.70 : 0.65) : (isActivelySprinting ? 0.94 : 0.82)) : 1.0) * slowMult;

    if (isMoving) {
      const currentSpeed = (isActivelySprinting ? this.sprintSpeed : this.walkSpeed) * waterMult;
      const step = currentSpeed * dt;
      const nextX = this.playerPos.x + moveDir.x * step;
      const nextZ = this.playerPos.z + moveDir.z * step;

      if (!this.map.checkCollision(nextX, this.playerPos.z, this.playerRadius)) {
        this.playerPos.x = nextX;
      }
      if (!this.map.checkCollision(this.playerPos.x, nextZ, this.playerRadius)) {
        this.playerPos.z = nextZ;
      }
    }

    // 경사로('M') 및 벽면 철제 사다리('H' - 사다리 앞으로 전진 시 자동 등반)에 따른 플레이어 고도(Y) 부드럽게 보간
    const targetFootY = this.map ? this.map.getFloorHeightAt(this.playerPos.x, this.playerPos.z) : 0;
    this.playerFootY = THREE.MathUtils.lerp(
      this.playerFootY !== undefined ? this.playerFootY : targetFootY,
      targetFootY,
      Math.min(1, dt * 14)
    );
    const targetEyeH = this.playerFootY + ((inWater && isCh2) ? this.playerEyeHeight - 0.26 : this.playerEyeHeight);
    this.playerPos.y = targetEyeH;

    if (isMoving) {
      const bobFreq = isActivelySprinting ? 15.5 : 10.0;
      const bobAmp = isActivelySprinting ? (inWater ? 0.095 : 0.085) : (inWater ? 0.065 : 0.052);
      this.walkCycle += dt * bobFreq;
      this.playerCamera.position.y = targetEyeH + Math.sin(this.walkCycle) * bobAmp;

      this.footstepTimer += dt;
      const stepInterval = isActivelySprinting ? (inWater ? 0.32 : 0.27) : (inWater ? 0.50 : 0.44);
      if (this.footstepTimer > stepInterval) {
        if (inWater && isCh2 && sound.playWaterFootstep) {
          sound.playWaterFootstep(isActivelySprinting);
        } else {
          sound.playFootstep(isActivelySprinting, inWater);
        }
        if (this.monsterAI) {
          const soundRad = inWater ? (isActivelySprinting ? 34.0 : 18.0) : (isActivelySprinting ? 22.0 : 9.0);
          this.monsterAI.notifyPlayerSound(this.playerPos.x, this.playerPos.z, soundRad, inWater ? '수로 물살 첨벙거림' : '발소리');
        }
        this.footstepTimer = 0;
      }
    } else {
      this.playerCamera.position.y = targetEyeH;
    }

    const struggleJitter = isSnared ? 0.032 : ((this.lurkerSlowTimer && this.lurkerSlowTimer > 1.4) ? 0.025 : 0);
    this.playerCamera.position.x = this.playerPos.x + (struggleJitter ? (Math.random() - 0.5) * struggleJitter : 0);
    this.playerCamera.position.z = this.playerPos.z + (struggleJitter ? (Math.random() - 0.5) * struggleJitter : 0);

    // 5-1. 1인칭 손 & 들고 있는 아이템 뷰모델 애니메이션 업데이트
    if (this.viewModel) {
      this.viewModel.update(dt, {
        isMoving,
        isSprinting: isActivelySprinting,
        walkCycle: this.walkCycle,
        yaw: this.controls.yaw,
        pitch: this.controls.pitch
      });
    }

    // 6. 손전등 & 챕터 2 직육면체 감지기 상단 발광 작업등 / 음파 레이더 동기화
    this.flashlight.position.copy(this.playerCamera.position);
    if (this.playerFillLight) {
      this.playerFillLight.position.copy(this.playerCamera.position);
    }
    const forward = this._cachedForward.set(0, 0, -1).applyQuaternion(this.playerCamera.quaternion);
    this.flashlightTarget.position.copy(this.playerCamera.position).addScaledVector(forward, 15);

    if (isCh2) {
      // 챕터 2: 플레이어가 이동하면 조명이 자동으로 밝아지고(22.0), 정지하면 레이더 화면 확인을 위해 은은하게(6.0) 자동 전환
      this.flashlightOn = true;
      const targetSonarLight = isMoving ? 22.0 : 6.0;
      this.flashlight.intensity = THREE.MathUtils.lerp(this.flashlight.intensity, targetSonarLight, Math.min(1, dt * 7));
      if (this.playerFillLight) {
        this.playerFillLight.intensity = THREE.MathUtils.lerp(this.playerFillLight.intensity, isMoving ? 0.35 : 0.10, Math.min(1, dt * 7));
      }

      // 삼두 괴수(#1 스토커, #2 매복자, #3 맹글)와의 거리 및 상대 각도를 계산해 레이더 화면 갱신 + 접근 비프음 재생
      const mActive = Boolean(this.monsterAI && this.monsterAI.state !== 'VENT_LURK');
      let mDist = 99;
      let relAngle = 0;
      const extraBlips = this._extraBlipsPool;
      extraBlips.length = 0;
      if (mActive && this.monsterAI) {
        const camYaw = Math.atan2(forward.x, forward.z);
        const trioList = this.monsterAI.getTrioPositions ? this.monsterAI.getTrioPositions() : [{ pos: this.monsterAI.pos, role: 'ripper' }];
        for (let i = 0; i < trioList.length; i++) {
          const tEntry = trioList[i];
          const dx = tEntry.pos.x - this.playerPos.x;
          const dz = tEntry.pos.z - this.playerPos.z;
          const d = Math.hypot(dx, dz);
          const ang = camYaw - Math.atan2(dx, dz);
          if (extraBlips[i]) {
            extraBlips[i].dist = d;
            extraBlips[i].relAngle = ang;
            extraBlips[i].role = tEntry.role;
          } else {
            extraBlips.push({ dist: d, relAngle: ang, role: tEntry.role });
          }
          if (d < mDist) {
            mDist = d;
            relAngle = ang;
          }
        }
      }
      if (this.viewModel && this.viewModel.updateSonarRadar) {
        this.viewModel.updateSonarRadar(dt, mDist, relAngle, mActive, extraBlips);
      }

      if (mActive && mDist < 26.0) {
        this.sonarBeepTimer = (this.sonarBeepTimer || 0) - dt;
        const closeness = Math.max(0, Math.min(1, 1 - (mDist - 2.5) / 23.5));
        const beepInterval = Math.max(0.52, 1.35 - closeness * 0.85);
        if (this.sonarBeepTimer <= 0) {
          this.sonarBeepTimer = beepInterval;
          if (sound.playSonarPing) sound.playSonarPing(closeness);
        }
      }
    }

    // 6-0. 챕터 2 전용 자욱한 수증기 물안개 부유 입자 업데이트 (플레이어 주변 맴돌기)
    if (this.mistParticles && this.mistParticles.visible) {
      const posAttr = this.mistParticles.geometry.attributes.position;
      const posArr = posAttr.array;
      const pCam = this.playerCamera.position;
      const count = this._mistSpeeds ? this._mistSpeeds.length : 0;
      for (let i = 0; i < count; i++) {
        posArr[i * 3 + 1] += this._mistSpeeds[i] * dt * 0.4;
        const dx = posArr[i * 3 + 0] - pCam.x;
        const dz = posArr[i * 3 + 2] - pCam.z;
        if ((dx * dx + dz * dz > 56.25) || posArr[i * 3 + 1] > pCam.y + 1.8) {
          posArr[i * 3 + 0] = pCam.x + (Math.random() - 0.5) * 11.0;
          posArr[i * 3 + 1] = Math.max(0.1, pCam.y - 1.2 + Math.random() * 0.4);
          posArr[i * 3 + 2] = pCam.z + (Math.random() - 0.5) * 11.0;
        }
      }
      posAttr.needsUpdate = true;
    }

    // 6-1. 괴물 AI 시스템 업데이트 (벤트 이동, 청각/시각 수색, 추격, 방호문 강타, 조명탄 스턴)
    if (this.monsterAI) {
      this.monsterAI.update(
        dt,
        this.playerPos,
        this.playerCamera,
        this.flashlightOn,
        isActivelySprinting,
        isMoving
      );

      // 6-2. 괴물 거리 비례 서스펜스 텐션(심장 박동음) & 전등/손전등 지지직 점멸 전조 연출
      const distToMonster = Math.hypot(
        this.playerPos.x - this.monsterAI.pos.x,
        this.playerPos.z - this.monsterAI.pos.z
      );
      const isVisible = this.monsterAI.hasGridLineOfSight
        ? this.monsterAI.hasGridLineOfSight(this.playerPos.x, this.playerPos.z, this.monsterAI.pos.x, this.monsterAI.pos.z)
        : false;

      // 1) 실시간 거리 비례 심장 박동음 갱신
      sound.updateMonsterTension(distToMonster, dt, isVisible, this.monsterAI.state);

      // 2) 괴물이 15m 이내로 접근 시 손전등 빛 지지직 떨림 & 전기 스파크 소리 전조 현상
      if (distToMonster < 15.0 && this.monsterAI.state !== 'VENT_LURK') {
        this.flickerTimer = (this.flickerTimer || 0) - dt;
        if (this.flickerTimer <= 0) {
          const isFlicker = Math.random() < 0.38;
          this.flickerTimer = isFlicker ? (0.05 + Math.random() * 0.12) : (0.2 + Math.random() * 0.5);

          if (this.flashlight && this.flashlightOn) {
            this.flashlight.intensity = isFlicker
              ? (Math.random() * 3.5)
              : this.flashlightMaxIntensity;
          }

          if (isFlicker && Math.random() < 0.15) {
            sound.playLampFlickerBuzz(0.18);
          }
        }
      } else if (this.flashlight && this.flashlightOn) {
        this.flashlight.intensity = this.flashlightMaxIntensity;
      }
    }

    // 7. 현재 구역 이름 표시 업데이트
    this.updateLocationHUD();

    // 8. 주변 상호작용 대상(CCTV 콘솔, 1칸 상하 방호문) 탐색
    this.checkInteractables();

    if (this.controls.consumeInteract()) {
      if (this.monsterAI && this.monsterAI.isPlayerSnared) {
        this.monsterAI.addSnareStruggle(24);
      } else if (this.nearInteractable) {
        this.triggerInteraction(this.nearInteractable);
      }
    }

    if (this.controls.consumeMap()) {
      this.toggleTacticalMapModal();
    }

    if (this.isTacticalMapOpen) {
      this.renderTacticalMapModal();
    }

    // 메인 벙커 벽면 3D 전술 지도판 실시간 동적 갱신
    if (this.map && this.map.tacticalMapBoard && this.map.tacticalMapBoard.screenTex) {
      const distToBoard = Math.hypot(
        this.playerPos.x - this.map.tacticalMapBoard.x,
        this.playerPos.z - this.map.tacticalMapBoard.z
      );
      if (distToBoard < 12.0) {
        this.mapBoardUpdateTimer = (this.mapBoardUpdateTimer || 0) + dt;
        if (this.mapBoardUpdateTimer > 0.08) {
          this.mapBoardUpdateTimer = 0;
          const isCh2 = this.map.chapterId === 'chapter2';
          const remotePlayers = this.networkManager ? this.networkManager.remotePlayers : null;
          this.map.drawTacticalMapToCanvas(
            this.map.tacticalMapBoard.canvas,
            isCh2,
            this.playerPos.x,
            this.playerPos.z,
            this.controls.yaw,
            remotePlayers,
            this.map.doors
          );
          this.map.tacticalMapBoard.screenTex.needsUpdate = true;
        }
      }
    }

    // 9. 멀티플레이어 위치/동작 및 괴물 동기화 브로드캐스트
    if (this.networkManager && this.networkManager.roomId) {
      const heldType = this.interactionSystem ? this.interactionSystem.getHeldItemType() : null;
      this.networkManager.sendPlayerSync(
        this.playerPos,
        this.controls.yaw,
        this.controls.pitch,
        isMoving,
        isActivelySprinting,
        heldType,
        this.flashlightOn
      );
      if (this.networkManager.isHost && this.monsterAI) {
        this.networkManager.sendMonsterSync(
          this.monsterAI.state,
          this.monsterAI.pos,
          this.monsterAI.yaw,
          this.monsterAI.monster.animMode,
          this.monsterAI.targetVentIdx,
          this.monsterAI.currentVentIdx
        );
      }
    }
    if (this.networkManager) {
      this.networkManager.update(dt);
    }

    // 모바일 터치 DROP 버튼 상태 및 라벨 동적 갱신
    if (this.btnTouchDrop && this.interactionSystem) {
      const held = this.interactionSystem.getHeldItemType();
      if (held) {
        this.btnTouchDrop.style.opacity = '1';
        this.btnTouchDrop.style.borderColor = (held === 'flare') ? '#ffaa33' : '#55ccee';
        const label = this.btnTouchDrop.querySelector('.btn-label');
        if (label) label.textContent = (held === 'flare') ? 'IGNITE' : 'DROP';
      } else {
        this.btnTouchDrop.style.opacity = '0.45';
        this.btnTouchDrop.style.borderColor = 'rgba(255, 255, 255, 0.25)';
        const label = this.btnTouchDrop.querySelector('.btn-label');
        if (label) label.textContent = 'DROP';
      }
    }
  }

  updateLocationHUD() {
    if (!this.locationTextEl) return;
    const t = worldToTile(this.playerPos.x, this.playerPos.z);
    const ch = this.map.getTileChar(t.col, t.row);
    const zoneName = getZoneName(t.col, t.row, ch, this.activeChapterId);
    if (this._lastZoneName !== zoneName) {
      this._lastZoneName = zoneName;
      this.locationTextEl.textContent = '위치: ' + zoneName;
    }
  }

  updateStaminaHUD(isSprinting) {
    const pct = Math.round(this.stamina);
    const isExhausted = this.staminaExhausted;
    if (this._lastStaminaPct !== pct || this._lastStaminaExhausted !== isExhausted) {
      this._lastStaminaPct = pct;
      this._lastStaminaExhausted = isExhausted;
      if (this.staminaFillEl) {
        this.staminaFillEl.style.width = pct + '%';
        this.staminaFillEl.classList.toggle('exhausted', isExhausted);
      }
      if (this.staminaPctEl) {
        this.staminaPctEl.textContent = pct + '%';
      }
    }
    if (this.staminaStateEl) {
      const stateText = isExhausted
        ? '[EXHAUSTED] 호흡 회복 중'
        : (isSprinting ? '[SPRINT] 전력 질주' : 'SPRINT [SHIFT]');
      if (this._lastStaminaStateText !== stateText) {
        this._lastStaminaStateText = stateText;
        this.staminaStateEl.textContent = stateText;
      }
    }
  }

  triggerSonarPulse() {
    if (this.activeChapterId !== 'chapter2') return;
    if (this.sonarPulseCooldown > 0) {
      sound.playFlashlightClick(false);
      return;
    }
    this.sonarPulseCooldown = 7.0;
    sound.playSonarPulse();
    if (this.viewModel && this.viewModel.triggerSonarPulseAnim) {
      this.viewModel.triggerSonarPulseAnim();
    }
    this._tmpForward.set(0, 0, -1).applyQuaternion(this.playerCamera.quaternion);
    this._tmpForward.y = 0;
    if (this._tmpForward.lengthSq() > 0.001) this._tmpForward.normalize();

    const repelled = this.monsterAI && this.monsterAI.repelLurkerBySonarPulse
      ? this.monsterAI.repelLurkerBySonarPulse(this.playerPos, this._tmpForward)
      : false;

    if (repelled) {
      this.showGameToast('[PULSE] 전방 매복자를 소나 충격파로 격퇴했습니다! (수로 크롤러가 반응합니다)', 'warn');
    } else {
      this.showGameToast('[PULSE] 소나 충격파 발사! (충격파 소음으로 수로 크롤러가 유인됩니다)', 'info');
    }
  }

  checkInteractables() {
    this.nearInteractable = null;
    let bestDist = 2.85; // 최대 상호작용 거리 (m)

    // 1) 아이템, 캐비닛, 전기 배전반, 중앙 코어, 탈출 게이트 등 탐색
    if (this.interactionSystem) {
      const found = this.interactionSystem.findNearestInteractable(this.playerPos, bestDist);
      if (found.item) {
        bestDist = found.dist;
        this.nearInteractable = found.item;
      }
    }

    let bestDistSq = bestDist * bestDist;
    const px = this.playerPos.x;
    const pz = this.playerPos.z;

    // 2) CCTV 관제 콘솔 거리 체크 (거리 제곱 비교)
    if (this.map.consolePos) {
      const dx = px - this.map.consolePos.x;
      const dz = pz - this.map.consolePos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestDist = Math.sqrt(dSq);
        if (!this._cachedConsoleInteractable) {
          this._cachedConsoleInteractable = { type: 'console' };
        }
        this.nearInteractable = this._cachedConsoleInteractable;
      }
    }

    // 3) 방화문(D) 거리 체크 (거리 제곱 비교)
    if (this.map.doors) {
      for (let i = 0; i < this.map.doors.length; i++) {
        const door = this.map.doors[i];
        const dx = px - door.x;
        const dz = pz - door.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestDist = Math.sqrt(dSq);
          if (!this._cachedDoorInteractable) {
            this._cachedDoorInteractable = { type: 'door', door: null };
          }
          this._cachedDoorInteractable.door = door;
          this.nearInteractable = this._cachedDoorInteractable;
        }
      }
    }

    // 4) 벙커 작전 지도판(tacticalMapBoard) 거리 체크
    if (this.map && this.map.tacticalMapBoard) {
      const dx = px - this.map.tacticalMapBoard.x;
      const dz = pz - this.map.tacticalMapBoard.z;
      const dSq = dx * dx + dz * dz;
      const mapBoardMaxSq = 3.2 * 3.2;
      if (dSq < mapBoardMaxSq && dSq < bestDistSq) {
        bestDistSq = dSq;
        bestDist = Math.sqrt(dSq);
        if (!this._cachedMapBoardInteractable) {
          this._cachedMapBoardInteractable = {
            type: 'map_board',
            keyText: '[ E / MAP ]',
            descText: '시설 종합 작전 지도 확인'
          };
        }
        this.nearInteractable = this._cachedMapBoardInteractable;
      }
    }

    const isBlackout = this.interactionSystem && this.interactionSystem.isBlackout;

    if (this.monsterAI && this.monsterAI.isPlayerSnared) {
      const pct = Math.round(this.monsterAI.snareEscapeProgress || 0);
      this.showPrompt(
        '[ SPACE / E / USE 연타 ]',
        `맹글 크롤러 결박 탈출 중... (${pct}%)`
      );
      if (this.btnTouchInteract) {
        this.btnTouchInteract.classList.add('active');
      }
      return;
    }

    if (this.nearInteractable) {
      if (this.nearInteractable.type === 'console') {
        this.showPrompt(
          '[ E / USE ]',
          isBlackout ? '[ERROR] CCTV 전원 차단됨 (전기실 복구 필요)' : 'CCTV 보안 모니터 접속'
        );
        if (this.btnTouchCCTV) this.btnTouchCCTV.style.display = isBlackout ? 'none' : 'flex';
      } else if (this.nearInteractable.type === 'door') {
        const d = this.nearInteractable.door;
        this.showPrompt(
          '[ E / USE ]',
          isBlackout
            ? `[MALFUNCTION] ${d.name} 무력화됨 (정전 잠금 불가)`
            : `${d.name} ${d.isOpen ? '아래로 닫기(잠금)' : '위로 열기(개방)'}`
        );
        if (this.btnTouchCCTV) this.btnTouchCCTV.style.display = 'none';
      } else {
        this.showPrompt(this.nearInteractable.keyText || '[ E / USE ]', this.nearInteractable.descText || '상호작용');
        if (this.btnTouchCCTV) this.btnTouchCCTV.style.display = 'none';
      }
      if (this.btnTouchInteract) {
        this.btnTouchInteract.classList.add('active');
      }
    } else {
      this.hidePrompt();
      if (this.btnTouchCCTV) this.btnTouchCCTV.style.display = 'none';
      if (this.btnTouchInteract) {
        this.btnTouchInteract.classList.remove('active');
      }
    }
  }

  showPrompt(keyText, descText) {
    if (!this.promptEl) return;
    if (this._lastPromptKey === keyText && this._lastPromptDesc === descText && !this.promptEl.classList.contains('hidden')) {
      return;
    }
    this._lastPromptKey = keyText;
    this._lastPromptDesc = descText;
    this.promptEl.classList.remove('hidden');
    if (!this._promptKeyEl) {
      this._promptKeyEl = this.promptEl.querySelector('.prompt-key');
    }
    if (this._promptKeyEl) this._promptKeyEl.textContent = keyText;
    if (this.promptDescEl) this.promptDescEl.textContent = descText;
  }

  hidePrompt() {
    if (this.promptEl && !this.promptEl.classList.contains('hidden')) {
      this.promptEl.classList.add('hidden');
      this._lastPromptKey = null;
      this._lastPromptDesc = null;
    }
  }

  showGameToast(msg, level = 'info') {
    if (!this.gameToastEl) return;
    this.gameToastEl.textContent = msg;
    this.gameToastEl.className = '';
    if (level === 'danger') this.gameToastEl.classList.add('toast-danger');
    else if (level === 'warn') this.gameToastEl.classList.add('toast-warn');
    else if (level === 'success') this.gameToastEl.classList.add('toast-success');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (this.gameToastEl) this.gameToastEl.classList.add('hidden');
    }, 2900);
  }

  handleEscapeSuccess() {
    this.controls.setDisabled(true);
    if (this.escapeModalEl) {
      this.escapeModalEl.classList.remove('hidden');
    }
  }

  triggerInteraction(item) {
    if (item.type === 'map_board') {
      this.openTacticalMapModal();
      return;
    }
    if (item.type === 'console') {
      if (this.interactionSystem && this.interactionSystem.isBlackout) {
        this.showGameToast('[ERROR] CCTV 관제 전원이 차단되었습니다. 전기실 배전반을 먼저 복구하십시오.', 'danger');
        return;
      }
      this.cctv.open();
    } else if (item.type === 'door') {
      this.toggleDoor(item.door.id);
    } else if (this.interactionSystem) {
      this.interactionSystem.executeInteract(item);
      if (this.monsterAI && (item.type === 'locker' || item.type === 'breaker' || item.type === 'central_core')) {
        this.monsterAI.notifyPlayerSound(this.playerPos.x, this.playerPos.z, 16.0, '시설 조작 소음');
      }
    }
  }

  openModelViewer() {
    if (!this.modelViewer) return;
    if (this.cctv && this.cctv.isOpen) this.cctv.close();
    if (this.isTacticalMapOpen) this.closeTacticalMapModal();
    this.modelViewer.open();
  }

  toggleTacticalMapModal() {
    if (this.isTacticalMapOpen) {
      this.closeTacticalMapModal();
    } else {
      this.openTacticalMapModal();
    }
  }

  openTacticalMapModal() {
    if (!this.tacticalMapModalEl) return;
    this.isTacticalMapOpen = true;
    this.tacticalMapModalEl.classList.remove('hidden');
    if (this.controls && this.controls.isLocked) {
      this.controls.unlock();
    }
    const titleEl = document.getElementById('tactical-map-title');
    const subEl = document.getElementById('tactical-map-subtitle');
    if (titleEl && this.map) {
      titleEl.textContent = this.map.chapterId === 'chapter2'
        ? 'CHAPTER 2 // SECTOR-02 FLOODED CISTERN'
        : 'CHAPTER 1 // SECTOR-01 SKELD BUNKER';
    }
    if (subEl && this.map) {
      subEl.textContent = this.map.chapterId === 'chapter2'
        ? '심도 140m 침수 저류조 및 대구경 수로망 작전 전술 지도'
        : '심도 140m 벙커 통제 시설 및 격벽 방호망 작전 전술 지도';
    }
    this.renderTacticalMapModal();
    if (typeof sound.playClick === 'function') {
      sound.playClick();
    }
  }

  closeTacticalMapModal() {
    if (!this.tacticalMapModalEl) return;
    this.isTacticalMapOpen = false;
    this.tacticalMapModalEl.classList.add('hidden');
    if (typeof sound.playClick === 'function') {
      sound.playClick();
    }
  }

  renderTacticalMapModal() {
    if (!this.fullscreenMapCanvas || !this.map) return;
    const isCh2 = this.map.chapterId === 'chapter2';
    const remotePlayers = this.networkManager ? this.networkManager.remotePlayers : null;
    this.map.drawTacticalMapToCanvas(
      this.fullscreenMapCanvas,
      isCh2,
      this.playerPos.x,
      this.playerPos.z,
      this.controls ? this.controls.yaw : 0,
      remotePlayers,
      this.map.doors
    );
  }

  render() {
    if (this.modelViewer && this.modelViewer.isOpen) return;

    // Phase 3: 사망 시 CCTV 감시 카메라 뷰 렌더링
    if (this.isDeathCamActive && this.deathCamera) {
      if (this.viewModel) this.viewModel.root.visible = false;
      this.renderer.render(this.scene, this.deathCamera);
      return;
    }

    if (this.cctv && this.cctv.isOpen) {
      const cctvCam = this.cctv.getActiveCamera();
      if (cctvCam) {
        if (this.viewModel) this.viewModel.root.visible = false;
        this.renderer.render(this.scene, cctvCam);
        if (this.viewModel) this.viewModel.root.visible = true;
        return;
      }
    }
    if (this.viewModel) this.viewModel.root.visible = true;
    this.renderer.render(this.scene, this.playerCamera);
  }

  loop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MonochromeBunker3D();
});
