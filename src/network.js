import * as THREE from 'three';
import { PlayerCharacterEntity } from './models.js';

export class NetworkManager {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
    // callbacks: { onToast, onDoorSync, onItemPickupSync, onItemDropSync, onCoreInsertSync, onBlackoutSync, onMonsterSync, onPlayerDownSync, onRoomJoined, onRoomError }

    this.ws = null;
    this.isConnected = false;
    this.isHost = false;
    this.roomId = null;
    this.playerId = null;
    this.callsign = 'OPERATIVE-01';
    this.suitColor = 'steel';

    this.remotePlayers = new Map(); // id -> { entity, nametag, targetPos, targetYaw, isMoving, isSprinting, flashlightOn, ping }
    this.lastSyncTime = 0;
    this.syncInterval = 50; // 20Hz (50ms)
    this.lastMonsterSyncTime = 0;
    this.monsterSyncInterval = 50; // 20Hz (50ms)

    // 학교 와이파이 / 모바일 대역폭 절감용 델타 압축(Deadband Filter) 캐시
    this.lastSentPos = new THREE.Vector3(9999, 9999, 9999);
    this.lastSentYaw = 9999;
    this.lastSentPitch = 9999;
    this.lastSentIsMoving = false;
    this.lastSentIsSprinting = false;
    this.lastSentFlashlight = true;
    this.lastSentHeldItem = null;
    this.lastHeartbeatTime = 0;
    this.heartbeatInterval = 1200; // 정지 시 1.2초마다 하트비트 전송

    // RTT 핑 측정
    this.currentPing = 0;
    this.pingIntervalId = null;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (window.location.port === '5173') {
      // 로컬 Vite 개발 서버 실행 중일 때는 3001 포트로 접속
      this.serverUrl = `${proto}//${window.location.hostname || 'localhost'}:3001`;
    } else {
      // 클라우드 단일 포트 배포(Render/Railway 등) 또는 커스텀 포트 접속 시
      this.serverUrl = `${proto}//${window.location.host}`;
    }
  }

  connect() {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.startPingProbe();
          console.log('[NET] Connected to bunker co-op server:', this.serverUrl);
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handleServerMessage(event.data);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.stopPingProbe();
          console.log('[NET] Disconnected from server');
          this.cleanupRemotePlayers();
          resolve(false);
        };

        this.ws.onerror = (err) => {
          this.isConnected = false;
          this.stopPingProbe();
          console.warn('[NET] Connection error / Standalone offline mode active.');
          resolve(false);
        };
      } catch (err) {
        this.isConnected = false;
        resolve(false);
      }
    });
  }

  createRoom(callsign, suitColor, customCode = '', mapId = 'chapter1') {
    this.callsign = callsign;
    this.suitColor = suitColor;
    this.mapId = mapId;
    if (!this.isConnected || !this.ws) {
      if (this.callbacks.onRoomError) {
        this.callbacks.onRoomError('서버에 연결되지 않았습니다. 단독 작전(SOLO) 모드로 진행하거나 서버를 가동하십시오.');
      }
      return;
    }
    this.ws.send(JSON.stringify({
      type: 'create_room',
      roomCode: customCode,
      callsign: this.callsign,
      suitColor: this.suitColor,
      mapId: this.mapId
    }));
  }

  joinRoom(callsign, suitColor, roomCode) {
    this.callsign = callsign;
    this.suitColor = suitColor;
    if (!this.isConnected || !this.ws) {
      if (this.callbacks.onRoomError) {
        this.callbacks.onRoomError('서버에 연결되지 않았습니다. 단독 작전(SOLO) 모드로 진행하거나 서버를 가동하십시오.');
      }
      return;
    }
    this.ws.send(JSON.stringify({
      type: 'join_room',
      roomCode,
      callsign: this.callsign,
      suitColor: this.suitColor
    }));
  }

  startGame(mapId = null) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    this.ws.send(JSON.stringify({
      type: 'start_game',
      mapId: mapId || this.mapId || 'chapter2'
    }));
  }

  changeMap(mapId) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    this.mapId = mapId;
    this.ws.send(JSON.stringify({
      type: 'change_map',
      mapId
    }));
  }

  handleServerMessage(raw) {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case 'room_joined': {
          this.roomId = msg.roomId;
          this.playerId = msg.playerId;
          this.isHost = msg.isHost;

          console.log(`[NET] Joined room: ${this.roomId} as ${this.isHost ? 'HOST' : 'CLIENT'}`);

          // 기존 플레이어들 생성
          if (msg.players) {
            for (const p of msg.players) {
              if (p.id !== this.playerId) {
                this.spawnRemotePlayer(p);
              }
            }
          }

          if (this.callbacks.onRoomJoined) {
            this.callbacks.onRoomJoined({
              roomId: this.roomId,
              playerId: this.playerId,
              isHost: this.isHost,
              mapId: msg.mapId || 'chapter1',
              players: msg.players
            });
          }
          break;
        }

        case 'player_joined': {
          if (msg.player.id !== this.playerId) {
            this.spawnRemotePlayer(msg.player);
            if (this.callbacks.onPlayerJoined) {
              this.callbacks.onPlayerJoined(msg.player);
            }
            if (this.callbacks.onToast) {
              this.callbacks.onToast(`[NET] 대원 [${msg.player.callsign}]이(가) 벙커 작전에 합류했습니다.`, 'info');
            }
          }
          break;
        }

        case 'player_left': {
          this.removeRemotePlayer(msg.playerId);
          if (this.callbacks.onPlayerLeft) {
            this.callbacks.onPlayerLeft(msg.playerId, msg.callsign);
          }
          if (this.callbacks.onToast) {
            this.callbacks.onToast(`[NET] 대원 [${msg.callsign}]과의 통신이 두절되었습니다. (퇴장)`, 'warning');
          }
          break;
        }

        case 'game_started': {
          if (this.callbacks.onGameStarted) {
            this.callbacks.onGameStarted(msg);
          }
          break;
        }

        case 'map_changed': {
          if (this.callbacks.onMapChanged) {
            this.callbacks.onMapChanged(msg.mapId);
          }
          break;
        }

        case 'pong_ack': {
          if (typeof msg.clientTime === 'number') {
            const rawPing = Math.max(1, Math.round(performance.now() - msg.clientTime));
            if (!this.currentPing || this.currentPing <= 0) {
              this.currentPing = rawPing;
            } else {
              this.currentPing = Math.round(this.currentPing * 0.6 + rawPing * 0.4);
            }
            if (this.callbacks.onPingUpdate) {
              this.callbacks.onPingUpdate(this.currentPing);
            }
          }
          break;
        }

        case 'player_sync': {
          const rp = this.remotePlayers.get(msg.id);
          if (rp) {
            rp.targetPos.set(msg.x, msg.y - 1.72, msg.z);
            rp.targetYaw = msg.yaw;
            rp.isMoving = msg.isMoving;
            rp.isSprinting = msg.isSprinting;
            rp.heldItem = msg.heldItem;

            if (typeof msg.flashlightOn === 'boolean' && rp.flashlightOn !== msg.flashlightOn) {
              rp.flashlightOn = msg.flashlightOn;
              rp.entity.setFlashlight(rp.flashlightOn);
            }

            if (typeof msg.ping === 'number' && msg.ping !== rp.ping) {
              rp.ping = msg.ping;
              this.updateNameplate(rp);
            }
          }
          break;
        }

        case 'door_toggle': {
          if (this.callbacks.onDoorSync) {
            this.callbacks.onDoorSync(msg.doorId, msg.isOpen);
          }
          break;
        }

        case 'item_pickup': {
          if (this.callbacks.onItemPickupSync) {
            this.callbacks.onItemPickupSync(msg.itemId, msg.slot, msg.playerId);
          }
          break;
        }

        case 'item_drop': {
          if (this.callbacks.onItemDropSync) {
            this.callbacks.onItemDropSync(msg.item, msg.x, msg.z);
          }
          break;
        }

        case 'core_insert': {
          if (this.callbacks.onCoreInsertSync) {
            this.callbacks.onCoreInsertSync(msg.partType, msg.totalInserted, msg.playerId);
          }
          break;
        }

        case 'blackout_state': {
          if (this.callbacks.onBlackoutSync) {
            this.callbacks.onBlackoutSync(msg.isBlackout, msg.reason);
          }
          break;
        }

        case 'monster_sync': {
          // 비-호스트 클라이언트는 호스트로부터 전달받은 괴물 동기화 정보 적용
          if (!this.isHost && this.callbacks.onMonsterSync) {
            this.callbacks.onMonsterSync(msg);
          }
          break;
        }

        case 'player_down': {
          if (this.callbacks.onToast) {
            this.callbacks.onToast(`[RADIO EMERGENCY] 대원 [${msg.callsign}]이(가) 괴물에게 피습되었습니다!`, 'danger');
          }
          break;
        }

        case 'host_promoted': {
          this.isHost = true;
          if (this.callbacks.onHostPromoted) {
            this.callbacks.onHostPromoted();
          }
          if (this.callbacks.onToast) {
            this.callbacks.onToast('[NET] 귀하가 작전 지휘관(호스트)으로 승격되었습니다. 괴물 AI 통제 권한을 획득합니다.', 'success');
          }
          break;
        }

        case 'error': {
          if (this.callbacks.onRoomError) {
            this.callbacks.onRoomError(msg.message);
          }
          break;
        }
      }
    } catch (e) {
      console.error('[NET] Failed to handle message:', e);
    }
  }

  startPingProbe() {
    this.stopPingProbe();
    this.pingIntervalId = setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'ping_probe',
          clientTime: performance.now()
        }));
      }
    }, 1000);
  }

  stopPingProbe() {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  spawnRemotePlayer(playerData) {
    if (this.remotePlayers.has(playerData.id)) return;

    const entity = new PlayerCharacterEntity(playerData.callsign || '동료 대원', false);
    entity.root.position.set(playerData.x || 0, 0, playerData.z || -2);
    this.scene.add(entity.root);

    const initialFlashlight = playerData.flashlightOn !== false;
    entity.setFlashlight(initialFlashlight);

    // 머리 위 3D 빌보드 네임태그 생성 (이모지 없이 전술 폰트 및 실시간 핑 표시)
    const nameplate = this.createNameplateSprite(playerData.callsign || 'OPERATIVE', playerData.ping || 0);
    nameplate.sprite.position.set(0, 2.18, 0);
    entity.root.add(nameplate.sprite);

    this.remotePlayers.set(playerData.id, {
      entity,
      nametag: nameplate.sprite,
      nameplateData: nameplate,
      targetPos: new THREE.Vector3(playerData.x || 0, 0, playerData.z || -2),
      targetYaw: playerData.yaw || 0,
      isMoving: false,
      isSprinting: false,
      heldItem: null,
      flashlightOn: initialFlashlight,
      ping: playerData.ping || 0
    });
  }

  createNameplateSprite(text, ping = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 72;
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.65, 0.40, 1);
    sprite.renderOrder = 999;

    const nameplate = { sprite, canvas, texture, callsign: text, ping };
    this.renderNameplateCanvas(canvas, texture, text, ping);
    return nameplate;
  }

  renderNameplateCanvas(canvas, texture, text, ping) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let pingColor = '#55ee99'; // < 80ms (원활)
    if (ping >= 150) {
      pingColor = '#ff5555'; // >= 150ms (지연)
    } else if (ping >= 80) {
      pingColor = '#eecc55'; // 80~149ms (보통)
    }

    // 전술 박스 외곽선
    ctx.fillStyle = 'rgba(8, 12, 16, 0.88)';
    ctx.strokeStyle = pingColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 4);
    } else {
      ctx.rect(8, 8, canvas.width - 16, canvas.height - 16);
    }
    ctx.fill();
    ctx.stroke();

    // 대원 콜사인 (한국어 시스템 폰트 체인)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Pretendard", "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`[ ${text} ]`, 22, canvas.height / 2);

    // 핑 밀리초 (이모지 일체 배제, 순수 텍스트)
    ctx.fillStyle = pingColor;
    ctx.font = 'bold 16px "Share Tech Mono", monospace, sans-serif';
    ctx.textAlign = 'right';
    const pingStr = ping > 0 ? `${ping}ms` : 'SYNC';
    ctx.fillText(pingStr, canvas.width - 22, canvas.height / 2);

    texture.needsUpdate = true;
  }

  updateNameplate(rp) {
    if (!rp.nameplateData) return;
    this.renderNameplateCanvas(
      rp.nameplateData.canvas,
      rp.nameplateData.texture,
      rp.nameplateData.callsign,
      rp.ping || 0
    );
  }

  removeRemotePlayer(playerId) {
    const rp = this.remotePlayers.get(playerId);
    if (rp) {
      this.scene.remove(rp.entity.root);
      this.remotePlayers.delete(playerId);
    }
  }

  cleanupRemotePlayers() {
    for (const [_, rp] of this.remotePlayers) {
      this.scene.remove(rp.entity.root);
    }
    this.remotePlayers.clear();
  }

  sendPlayerSync(pos, yaw, pitch, isMoving, isSprinting, heldItem, flashlightOn = true) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    const now = performance.now();
    if (now - this.lastSyncTime < this.syncInterval) return;

    // 학교 와이파이 / 모바일 대역폭 절감용 델타 압축(Deadband Filter)
    const dx = pos.x - this.lastSentPos.x;
    const dy = pos.y - this.lastSentPos.y;
    const dz = pos.z - this.lastSentPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    const dyaw = Math.abs(yaw - this.lastSentYaw);
    const dpitch = Math.abs(pitch - this.lastSentPitch);

    const stateChanged = (isMoving !== this.lastSentIsMoving) ||
                         (isSprinting !== this.lastSentIsSprinting) ||
                         (heldItem !== this.lastSentHeldItem) ||
                         (flashlightOn !== this.lastSentFlashlight);

    const isDeadband = (distSq < 0.0001) && (dyaw < 0.02) && (dpitch < 0.02) && !stateChanged;
    const isHeartbeatDue = (now - this.lastHeartbeatTime >= this.heartbeatInterval);

    // 정지 상태이고 하트비트 주기도 안 되었으면 전송 패스
    if (isDeadband && !isHeartbeatDue) {
      return;
    }

    this.lastSyncTime = now;
    this.lastHeartbeatTime = now;
    this.lastSentPos.copy(pos);
    this.lastSentYaw = yaw;
    this.lastSentPitch = pitch;
    this.lastSentIsMoving = isMoving;
    this.lastSentIsSprinting = isSprinting;
    this.lastSentHeldItem = heldItem;
    this.lastSentFlashlight = flashlightOn;

    this.ws.send(JSON.stringify({
      type: 'player_sync',
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      z: Math.round(pos.z * 100) / 100,
      yaw: Math.round(yaw * 100) / 100,
      pitch: Math.round(pitch * 100) / 100,
      isMoving,
      isSprinting,
      heldItem,
      flashlightOn,
      ping: this.currentPing || 0
    }));
  }

  sendDoorToggle(doorId, isOpen) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    this.ws.send(JSON.stringify({
      type: 'door_toggle',
      doorId,
      isOpen
    }));
  }

  sendItemPickup(itemId, slot) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    this.ws.send(JSON.stringify({
      type: 'item_pickup',
      itemId,
      slot
    }));
  }

  sendItemDrop(item, x, z) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    this.ws.send(JSON.stringify({
      type: 'item_drop',
      item,
      x,
      z
    }));
  }

  sendCoreInsert(partType, totalInserted) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    this.ws.send(JSON.stringify({
      type: 'core_insert',
      partType,
      totalInserted
    }));
  }

  sendBlackout(isBlackout, reason) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    this.ws.send(JSON.stringify({
      type: 'blackout_state',
      isBlackout,
      reason
    }));
  }

  sendMonsterSync(state, pos, yaw, animMode, targetVent, currentVent) {
    if (!this.isConnected || !this.ws || !this.roomId || !this.isHost) return;
    const now = performance.now();
    if (now - this.lastMonsterSyncTime < this.monsterSyncInterval) return;
    this.lastMonsterSyncTime = now;

    this.ws.send(JSON.stringify({
      type: 'monster_sync',
      state,
      pos: {
        x: Math.round(pos.x * 100) / 100,
        y: Math.round(pos.y * 100) / 100,
        z: Math.round(pos.z * 100) / 100
      },
      yaw: Math.round(yaw * 100) / 100,
      animMode,
      targetVent,
      currentVent
    }));
  }

  sendPlayerDown(callsign) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    this.ws.send(JSON.stringify({
      type: 'player_down',
      callsign
    }));
  }

  update(dt) {
    // 원격 대원 3D 모델 보간 및 애니메이션 갱신
    for (const [_, rp] of this.remotePlayers) {
      rp.entity.root.position.lerp(rp.targetPos, Math.min(1, dt * 14));

      let diff = rp.targetYaw - rp.entity.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      rp.entity.root.rotation.y += diff * Math.min(1, dt * 14);

      const animMode = rp.isSprinting ? 'sprint' : rp.isMoving ? 'walk' : 'idle';
      rp.entity.update(dt, animMode);
    }
  }
}

