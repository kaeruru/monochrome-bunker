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

    this.remotePlayers = new Map(); // id -> { entity, nametag, targetPos, targetYaw, isMoving, isSprinting }
    this.lastSyncTime = 0;
    this.syncInterval = 50; // 20Hz (50ms)
    this.lastMonsterSyncTime = 0;
    this.monsterSyncInterval = 50; // 20Hz (50ms)

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
          console.log('[NET] Connected to bunker co-op server:', this.serverUrl);
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handleServerMessage(event.data);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          console.log('[NET] Disconnected from server');
          this.cleanupRemotePlayers();
          resolve(false);
        };

        this.ws.onerror = (err) => {
          this.isConnected = false;
          console.warn('[NET] Connection error / Standalone offline mode active.');
          resolve(false);
        };
      } catch (err) {
        this.isConnected = false;
        resolve(false);
      }
    });
  }

  createRoom(callsign, suitColor, customCode = '') {
    this.callsign = callsign;
    this.suitColor = suitColor;
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
      suitColor: this.suitColor
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
              players: msg.players
            });
          }
          break;
        }

        case 'player_joined': {
          if (msg.player.id !== this.playerId) {
            this.spawnRemotePlayer(msg.player);
            if (this.callbacks.onToast) {
              this.callbacks.onToast(`[NET] 대원 [${msg.player.callsign}]이(가) 벙커 작전에 합류했습니다.`, 'info');
            }
          }
          break;
        }

        case 'player_left': {
          this.removeRemotePlayer(msg.playerId);
          if (this.callbacks.onToast) {
            this.callbacks.onToast(`[NET] 대원 [${msg.callsign}]과의 통신이 두절되었습니다. (퇴장)`, 'warning');
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

  spawnRemotePlayer(playerData) {
    if (this.remotePlayers.has(playerData.id)) return;

    const entity = new PlayerCharacterEntity(playerData.callsign || '동료 대원', false);
    entity.root.position.set(playerData.x || 0, 0, playerData.z || -2);
    this.scene.add(entity.root);

    // 머리 위 3D 빌보드 네임태그 생성
    const nametag = this.createNameplateSprite(playerData.callsign || 'OPERATIVE');
    nametag.position.set(0, 2.15, 0);
    entity.root.add(nametag);

    this.remotePlayers.set(playerData.id, {
      entity,
      nametag,
      targetPos: new THREE.Vector3(playerData.x || 0, 0, playerData.z || -2),
      targetYaw: playerData.yaw || 0,
      isMoving: false,
      isSprinting: false,
      heldItem: null
    });
  }

  createNameplateSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(10, 14, 18, 0.85)';
    ctx.strokeStyle = '#55ccee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 44, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`[ ${text} ]`, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.4, 0.35, 1);
    return sprite;
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

  sendPlayerSync(pos, yaw, pitch, isMoving, isSprinting, heldItem) {
    if (!this.isConnected || !this.ws || !this.roomId) return;
    const now = performance.now();
    if (now - this.lastSyncTime < this.syncInterval) return;
    this.lastSyncTime = now;

    this.ws.send(JSON.stringify({
      type: 'player_sync',
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      z: Math.round(pos.z * 100) / 100,
      yaw: Math.round(yaw * 100) / 100,
      pitch: Math.round(pitch * 100) / 100,
      isMoving,
      isSprinting,
      heldItem
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

