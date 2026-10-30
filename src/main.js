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

    // 1-1. Three.js WebGL 렌더러 (모바일 필레이트 폭망 방지: DPR 1.0 적용)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !isMobileClient,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(isMobileClient ? 1.0 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;

    // 2. 3D 씬 및 모노크롬 안개 + 비플라스틱 인더스트리얼 환경광(PMREM)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040405);
    this.scene.fog = new THREE.FogExp2(0x040405, 0.052);
    this.scene.environment = createIndustrialEnvMap(this.renderer);

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
    this.cctv.updateDoorButtons(this.map.doors);

    // 10. 3D 괴물 & 캐릭터 모델링 쇼케이스 뷰어 초기화
    this.modelViewer = new ModelShowcaseViewer((isOpen) => {
      this.controls.setDisabled(isOpen);
    });

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
    this.gameSetupModalEl = document.getElementById('game-setup-modal');
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

    // 12. 멀티플레이어 네트워크 매니저 초기화
    this.networkManager = new NetworkManager(this.scene, {
      onToast: (msg, level) => this.showGameToast(msg, level),
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
      onItemDropSync: (item, x, z) => {
        if (this.interactionSystem) {
          this.interactionSystem.spawnWorldItem(item.id, x, 0.22, z, '동료 대원이 내려놓음');
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
        if (this.roomInfoBox) this.roomInfoBox.classList.remove('hidden');
        if (this.roomCodeDisplay) this.roomCodeDisplay.textContent = info.roomId;
        if (this.roomPlayerCount) this.roomPlayerCount.textContent = (info.players?.length || 1);
        if (this.roomPlayerList && info.players) {
          this.roomPlayerList.innerHTML = info.players.map(p =>
            `<div class="roster-item">[${p.isHost ? 'HOST' : 'MEMBER'}] ${p.callsign}</div>`
          ).join('');
        }
        if (this.setupStatusMsg) {
          this.setupStatusMsg.textContent = `작전 세션 [${info.roomId}] 접속 완료 (${info.isHost ? '지휘관' : '대원'}).`;
        }
        this.showGameToast(`[NET] 작전 세션 [${info.roomId}]에 성공적으로 연결되었습니다.`, 'success');
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
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.playerCamera.quaternion);
        this.jumpscareFlashLightTarget.position.copy(this.playerCamera.position).addScaledVector(fwd, 1.2);

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
      }
    });
    this.cctv.monsterAI = this.monsterAI;

    this.nearInteractable = null;
    this.lastTime = performance.now();
    this.footstepTimer = 0;

    // 접속 초기 상태: 작전 설정 모달이 열려 있으므로 포인터 락 비활성화
    this.controls.setDisabled(true);

    this.syncDeviceModeUI();
    this.initEvents();
    requestAnimationFrame((t) => this.loop(t));
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

    // 암전 해제 및 정상 조명 복구
    this.flashlightOn = true;
    this.flashlight.intensity = this.flashlightMaxIntensity;
    if (this.playerFillLight) this.playerFillLight.intensity = 1.45;
    if (this.ambientLight) this.ambientLight.intensity = 0.46;
    if (this.map.bunkerAmbient) this.map.bunkerAmbient.intensity = 0.45;
    if (this.map.genLight) this.map.genLight.intensity = 2.2;
    if (this.map.consoleLight) this.map.consoleLight.intensity = 2.0;

    this.map.setBlackoutState(false);
    sound.setBlackout(false);
    this.playerPos.set(this.map.spawnPos.x, this.playerEyeHeight, this.map.spawnPos.z);
    this.playerCamera.position.copy(this.playerPos);
    this.playerCamera.rotation.z = 0;
    this.stamina = this.maxStamina;
    this.staminaExhausted = false;

    if (this.interactionSystem) {
      this.interactionSystem.setupNewMatch();
    }
    if (this.monsterAI) {
      this.monsterAI.resetForNewMatch();
    }
    this.cctv.updateDoorButtons(this.map.doors);
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
    this.flashlightOn = true;
    this.flashlight.intensity = this.flashlightMaxIntensity;
    if (this.playerFillLight) this.playerFillLight.intensity = 1.45;
    if (this.ambientLight) this.ambientLight.intensity = 0.46;
    if (this.map.bunkerAmbient) this.map.bunkerAmbient.intensity = 0.45;
    if (this.map.genLight) this.map.genLight.intensity = 2.2;
    if (this.map.consoleLight) this.map.consoleLight.intensity = 2.0;

    this.map.setBlackoutState(false);
    sound.setBlackout(false);
    this.playerPos.set(this.map.spawnPos.x, this.playerEyeHeight, this.map.spawnPos.z);
    this.playerCamera.position.copy(this.playerPos);
    this.playerCamera.rotation.z = 0;
    this.stamina = this.maxStamina;
    this.staminaExhausted = false;

    if (this.interactionSystem) {
      this.interactionSystem.setupNewMatch();
    }
    if (this.monsterAI) {
      this.monsterAI.resetForNewMatch();
    }
    this.cctv.updateDoorButtons(this.map.doors);

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

    // 3. 쓰러진 대원 3D 모델 현 위치에 배치
    if (!this.fallenOperative) {
      this.fallenOperative = new PlayerCharacterEntity(this.callsign || 'OPERATIVE', false);
      this.scene.add(this.fallenOperative.root);
    }
    this.fallenOperative.root.visible = true;
    this.fallenOperative.root.position.set(this.playerPos.x, 0.12, this.playerPos.z);
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
    this.droppedFlashlight.position.set(this.playerPos.x + 0.35, 0.08, this.playerPos.z + 0.35);
    const dropFwd = new THREE.Vector3(1, 0, 0.8).normalize();
    this.droppedFlashlightTarget.position.copy(this.droppedFlashlight.position).addScaledVector(dropFwd, 6.0);

    // 4. CCTV 감시 카메라 위치 설정 (벽 관통 방지)
    if (!this.deathCamera) {
      this.deathCamera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 80);
    }
    this.deathCamera.aspect = window.innerWidth / window.innerHeight;
    this.deathCamera.updateProjectionMatrix();

    const camPos = this.calculateDeathCamPos(this.playerPos);
    this.deathCamera.position.copy(camPos);
    this.deathCamera.lookAt(this.playerPos.x, 0.28, this.playerPos.z);

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
    this.deathCamLightTarget.position.set(this.playerPos.x, 0.2, this.playerPos.z);

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
   * 벽 관통을 방지하는 안전한 천장 CCTV 감시 카메라 위치 탐색
   */
  calculateDeathCamPos(targetPos) {
    const candidates = [
      { x: -2.4, z: 2.2 },
      { x: 2.4, z: -2.2 },
      { x: 2.2, z: 2.2 },
      { x: -2.2, z: -2.2 },
      { x: 0, z: 2.8 },
      { x: 0, z: -2.8 },
      { x: 2.8, z: 0 },
      { x: -2.8, z: 0 }
    ];

    for (const cand of candidates) {
      const cx = targetPos.x + cand.x;
      const cz = targetPos.z + cand.z;
      const { col, row } = worldToTile(cx, cz);
      if (this.map.grid && this.map.grid[row] && this.map.grid[row][col] !== 1) {
        return new THREE.Vector3(cx, 3.25, cz);
      }
    }
    return new THREE.Vector3(targetPos.x - 1.2, 3.3, targetPos.z + 1.2);
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

    if (this.btnOpenModelViewer) {
      this.btnOpenModelViewer.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnOpenModelViewer.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.cctv && this.cctv.isOpen) this.cctv.close();
        this.modelViewer.open();
      });
    }

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

    // 상단 HUD 설정 열기/닫기 버튼
    if (this.btnOpenSettings) {
      this.btnOpenSettings.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.btnOpenSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSettingsModal();
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
      if (e.code === 'KeyM') {
        e.preventDefault();
        if (this.cctv && this.cctv.isOpen) this.cctv.close();
        if (this.modelViewer.isOpen) {
          this.modelViewer.close();
        } else {
          this.modelViewer.open();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (this.modelViewer && this.modelViewer.isOpen) {
          this.modelViewer.close();
        } else if (this.cctv && this.cctv.isOpen) {
          this.cctv.close();
        } else if (this.isDeployed) {
          this.toggleSettingsModal();
        }
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

  deployMission() {
    this.isDeployed = true;
    const targetChapter = this.selectedChapterId || 'chapter2';
    this.loadChapter(targetChapter);
    this.showGameplayUI();
    this.missionStartTime = performance.now();
    this.callsign = (this.callsignInput?.value || 'OPERATIVE-01').trim();
    if (this.monsterAI) {
      this.monsterAI.setDifficulty(this.difficulty);
    }
    if (this.gameSetupModalEl) {
      this.gameSetupModalEl.classList.add('hidden');
    }
    this.controls.setDisabled(false);
    this.controls.requestPointerLock();
    sound.playDoorSound(true);
    this.showGameToast(`[DEPLOYED] 대원 [${this.callsign}] 작전 투입 완료.`, 'success');
  }

  loadChapter(chapterId = 'chapter1') {
    const cfg = CHAPTER_CONFIGS[chapterId] || CHAPTER_CONFIGS.chapter1;
    this.activeChapterId = cfg.id;
    this.currentChapterConfig = cfg;

    // 1. 3D 맵 재구성 (지오메트리, 벽, 문, 수면, 전등)
    if (this.map) {
      this.map.rebuildMap(cfg.data);
      if (this.map.spawnPos) {
        this.playerPos.set(this.map.spawnPos.x, 1.62, this.map.spawnPos.z);
        this.playerCamera.position.copy(this.playerPos);
      }
    }

    // 2. 괴물 AI 챕터 설정 및 벤트/노드 재구성
    if (this.monsterAI) {
      this.monsterAI.setChapter(cfg);
    }

    // 3. 상호작용 및 파밍 시스템 리셋
    if (this.interactionSystem) {
      this.interactionSystem.setupNewMatch(cfg);
    }

    // 4. CCTV 콘솔 연동 업데이트
    if (this.cctv) {
      this.cctv.map = this.map;
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
    if (!this.isDeployed) {
      // 투입 전 로비 상태: 배경 씬 렌더링만 유지
      return;
    }
    if (this.modelViewer && this.modelViewer.isOpen) {
      this.modelViewer.updateAndRender(dt);
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
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.playerCamera.quaternion);
      forward.y = 0;
      if (forward.lengthSq() > 0.001) forward.normalize();
      this.interactionSystem.dropOrUseHeldItem(this.playerPos, forward);
    }

    // 3. 손전등 토글 (F키 또는 우측 하단 손전등 버튼) - 소등 시 괴물 시야 감지 반경이 대폭 축소됨
    if (this.controls.consumeFlashlight()) {
      this.flashlightOn = !this.flashlightOn;
      this.flashlight.intensity = this.flashlightOn ? this.flashlightMaxIntensity : 0;
      if (this.playerFillLight) {
        this.playerFillLight.intensity = this.flashlightOn ? 1.45 : 0.22;
      }
      sound.playFlashlightClick(this.flashlightOn);
      if (this.viewModel) {
        this.viewModel.triggerFlashlightAnim(this.flashlightOn);
      }
      if (this.btnTouchFlashlight) {
        this.btnTouchFlashlight.classList.toggle('active', this.flashlightOn);
      }
    }

    // 4. CCTV 단축키/버튼 요청 처리
    if (this.controls.consumeCCTV()) {
      if (this.nearInteractable && this.nearInteractable.type === 'console') {
        if (this.interactionSystem && this.interactionSystem.isBlackout) {
          this.showGameToast('[ERROR] CCTV 관제 전원이 차단되었습니다. 전기실 배전반을 먼저 복구하십시오.', 'danger');
        } else {
          this.cctv.open();
          return;
        }
      }
    }

    // 5. 플레이어 1인칭 이동, 달리기(Sprint + 스태미나 + 시야각 연출) 및 충돌 처리
    const moveDir = this.controls.getMovementDirection();
    const isMoving = moveDir.lengthSq() > 0.0001;
    const wantsSprint = this.controls.isSprinting();
    const isActivelySprinting = isMoving && wantsSprint && !this.staminaExhausted && this.stamina > 0;

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

    // 달리기 시 시야각(FOV) 자연스럽게 확장 (74도 -> 82도)
    const targetFov = isActivelySprinting ? 82 : 74;
    if (Math.abs(this.playerCamera.fov - targetFov) > 0.05) {
      this.playerCamera.fov += (targetFov - this.playerCamera.fov) * Math.min(1, dt * 8);
      this.playerCamera.updateProjectionMatrix();
    }

    if (isMoving) {
      const inWater = this.map ? this.map.isWaterAt(this.playerPos.x, this.playerPos.z) : false;
      const waterMult = inWater ? (isActivelySprinting ? 0.94 : 0.82) : 1.0;
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

      const bobFreq = isActivelySprinting ? 15.5 : 10.0;
      const bobAmp = isActivelySprinting ? 0.085 : 0.052;
      this.walkCycle += dt * bobFreq;
      this.playerCamera.position.y = this.playerEyeHeight + Math.sin(this.walkCycle) * bobAmp;

      this.footstepTimer += dt;
      const stepInterval = isActivelySprinting ? 0.27 : 0.44;
      if (this.footstepTimer > stepInterval) {
        sound.playFootstep(isActivelySprinting, inWater);
        if (this.monsterAI) {
          const soundRad = inWater ? (isActivelySprinting ? 30.0 : 16.0) : (isActivelySprinting ? 22.0 : 9.0);
          this.monsterAI.notifyPlayerSound(this.playerPos.x, this.playerPos.z, soundRad, inWater ? '물살 첨벙거림' : '발소리');
        }
        this.footstepTimer = 0;
      }
    } else {
      this.playerCamera.position.y = this.playerEyeHeight;
    }

    this.playerCamera.position.x = this.playerPos.x;
    this.playerCamera.position.z = this.playerPos.z;

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

    // 6. 손전등 & 근접 보조광 방향 동기화
    this.flashlight.position.copy(this.playerCamera.position);
    if (this.playerFillLight) {
      this.playerFillLight.position.copy(this.playerCamera.position);
    }
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.playerCamera.quaternion);
    this.flashlightTarget.position.copy(this.playerCamera.position).addScaledVector(forward, 15);

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
    }

    // 7. 현재 구역 이름 표시 업데이트
    this.updateLocationHUD();

    // 8. 주변 상호작용 대상(CCTV 콘솔, 1칸 상하 방호문) 탐색
    this.checkInteractables();

    if (this.controls.consumeInteract() && this.nearInteractable) {
      this.triggerInteraction(this.nearInteractable);
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
        heldType
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
    this.locationTextEl.textContent = `위치: ${zoneName}`;
  }

  updateStaminaHUD(isSprinting) {
    const pct = Math.round(this.stamina);
    if (this.staminaFillEl) {
      this.staminaFillEl.style.width = `${pct}%`;
      this.staminaFillEl.classList.toggle('exhausted', this.staminaExhausted);
    }
    if (this.staminaPctEl) {
      this.staminaPctEl.textContent = `${pct}%`;
    }
    if (this.staminaStateEl) {
      if (this.staminaExhausted) {
        this.staminaStateEl.textContent = '[EXHAUSTED] 호흡 회복 중';
      } else if (isSprinting) {
        this.staminaStateEl.textContent = '[SPRINT] 전력 질주 중';
      } else {
        this.staminaStateEl.textContent = 'SPRINT [SHIFT]';
      }
    }
  }

  checkInteractables() {
    this.nearInteractable = null;
    let bestDist = 2.85; // 최대 상호작용 거리 (m)

    // 1) 아이템, 캐비닛, 전기실 차단기, 중앙 코어, 탈출 게이트 등 탐색
    if (this.interactionSystem) {
      const found = this.interactionSystem.findNearestInteractable(this.playerPos, bestDist);
      if (found.item) {
        bestDist = found.dist;
        this.nearInteractable = found.item;
      }
    }

    // 2) CCTV 관제 콘솔 거리 체크
    if (this.map.consolePos) {
      const dx = this.playerPos.x - this.map.consolePos.x;
      const dz = this.playerPos.z - this.map.consolePos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        this.nearInteractable = { type: 'console' };
      }
    }

    // 3) 각 1칸 상하 방호문(D) 거리 체크
    for (const door of this.map.doors) {
      const dx = this.playerPos.x - door.x;
      const dz = this.playerPos.z - door.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        this.nearInteractable = { type: 'door', door };
      }
    }

    const isBlackout = this.interactionSystem && this.interactionSystem.isBlackout;

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
    this.promptEl.classList.remove('hidden');
    const keyEl = this.promptEl.querySelector('.prompt-key');
    if (keyEl) keyEl.textContent = keyText;
    if (this.promptDescEl) this.promptDescEl.textContent = descText;
  }

  hidePrompt() {
    if (this.promptEl) {
      this.promptEl.classList.add('hidden');
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
    }, 4200);
  }

  handleEscapeSuccess() {
    this.controls.setDisabled(true);
    if (this.escapeModalEl) {
      this.escapeModalEl.classList.remove('hidden');
    }
  }

  triggerInteraction(item) {
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
