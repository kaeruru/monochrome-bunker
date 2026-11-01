import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');

const PORT = process.env.PORT || 3001;

function getLocalIpAddress() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (_) {}
  return 'localhost';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

// HTTP 서버 (클라우드 단일 포트 배포 시 dist 정적 파일 서빙 + API 헬스체크 제공)
const server = http.createServer((req, res) => {
  const reqUrl = req.url.split('?')[0];

  if (reqUrl === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      status: 'ONLINE',
      system: 'MONOCHROME // BUNKER CO-OP TACTICAL SERVER',
      activeRooms: rooms.size,
      timestamp: Date.now()
    }));
    return;
  }

  // dist 디렉토리가 빌드되어 있는 경우 정적 파일 서빙 (Render/Railway 원클릭 배포 지원)
  if (fs.existsSync(DIST_DIR)) {
    let filePath = path.join(DIST_DIR, reqUrl === '/' ? 'index.html' : reqUrl);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    try {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
      });
      res.end(content);
      return;
    } catch (_) {}
  }

  // 로컬 개발 모드 등 dist가 없을 때의 기본 응답
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({
    status: 'ONLINE',
    system: 'MONOCHROME // BUNKER CO-OP TACTICAL SERVER',
    activeRooms: rooms.size,
    timestamp: Date.now()
  }));
});

const wss = new WebSocketServer({ server });

/**
 * 방(Room) 데이터 구조
 * roomId -> {
 *   id: string,
 *   hostId: string,
 *   players: Map(ws -> { id, callsign, suitColor, x, y, z, yaw, pitch, isMoving, isSprinting, heldItem }),
 *   doors: Map(doorId -> isOpen),
 *   coreProgress: number,
 *   isBlackout: boolean
 * }
 */
const rooms = new Map();

function generateRoomCode() {
  const num = Math.floor(100 + Math.random() * 900);
  return `SKELD-${num}`;
}

function broadcastToRoom(room, msgObj, excludeWs = null) {
  const jsonStr = JSON.stringify(msgObj);
  for (const [ws] of room.players) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(jsonStr);
    }
  }
}

wss.on('connection', (ws) => {
  if (ws._socket && ws._socket.setNoDelay) {
    ws._socket.setNoDelay(true);
  }
  ws.isAlive = true;
  ws.currentRoomId = null;
  ws.playerId = `OP-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, msg);
    } catch (err) {
      console.error('[SERVER ERROR] Failed to parse message:', err);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error(`[WS ERROR ${ws.playerId}]`, err);
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'create_room': {
      const requestedCode = (msg.roomCode || generateRoomCode()).toUpperCase().trim();
      const roomId = requestedCode;

      if (rooms.has(roomId)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `작전 세션 [${roomId}]이(가) 이미 존재합니다. 다른 코드를 사용하십시오.`
        }));
        return;
      }

      const playerInfo = {
        id: ws.playerId,
        callsign: msg.callsign || 'OPERATIVE-01',
        suitColor: msg.suitColor || 'steel',
        isHost: true,
        x: 0,
        y: 1.72,
        z: -2,
        yaw: 0,
        pitch: 0,
        isMoving: false,
        isSprinting: false,
        heldItem: null,
        flashlightOn: true,
        ping: 0
      };

      const room = {
        id: roomId,
        hostId: ws.playerId,
        mapId: msg.mapId || 'chapter1',
        players: new Map([[ws, playerInfo]]),
        doors: new Map(),
        coreProgress: 0,
        isBlackout: false
      };

      rooms.set(roomId, room);
      ws.currentRoomId = roomId;

      ws.send(JSON.stringify({
        type: 'room_joined',
        roomId,
        playerId: ws.playerId,
        isHost: true,
        mapId: room.mapId,
        players: [playerInfo]
      }));

      console.log(`[ROOM CREATED] ${roomId} by ${playerInfo.callsign} (${ws.playerId})`);
      break;
    }

    case 'join_room': {
      const targetRoomId = (msg.roomCode || '').toUpperCase().trim();
      const room = rooms.get(targetRoomId);

      if (!room) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `작전 세션 [${targetRoomId}]을(를) 찾을 수 없습니다. 코드를 확인하십시오.`
        }));
        return;
      }

      if (room.players.size >= 8) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `작전 세션 [${targetRoomId}]의 정원(최대 8인)이 초과되었습니다.`
        }));
        return;
      }

      const playerInfo = {
        id: ws.playerId,
        callsign: msg.callsign || `OPERATIVE-${room.players.size + 1}`,
        suitColor: msg.suitColor || 'steel',
        isHost: false,
        x: 0,
        y: 1.72,
        z: -2,
        yaw: 0,
        pitch: 0,
        isMoving: false,
        isSprinting: false,
        heldItem: null,
        flashlightOn: true,
        ping: 0
      };

      room.players.set(ws, playerInfo);
      ws.currentRoomId = targetRoomId;

      const playerList = Array.from(room.players.values());

      // 접속한 플레이어에게 기존 방 정보 전송
      ws.send(JSON.stringify({
        type: 'room_joined',
        roomId: targetRoomId,
        playerId: ws.playerId,
        isHost: false,
        mapId: room.mapId || 'chapter1',
        players: playerList,
        doors: Array.from(room.doors.entries())
      }));

      // 기존 플레이어들에게 새 대원 참여 브로드캐스트
      broadcastToRoom(room, {
        type: 'player_joined',
        player: playerInfo
      }, ws);

      console.log(`[PLAYER JOINED] ${playerInfo.callsign} (${ws.playerId}) joined ${targetRoomId}`);
      break;
    }

    case 'ping_probe': {
      ws.send(JSON.stringify({
        type: 'pong_ack',
        clientTime: msg.clientTime,
        serverTime: Date.now()
      }));
      break;
    }

    case 'player_sync': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      const p = room.players.get(ws);
      if (p) {
        p.x = msg.x;
        p.y = msg.y;
        p.z = msg.z;
        p.yaw = msg.yaw;
        p.pitch = msg.pitch;
        p.isMoving = msg.isMoving;
        p.isSprinting = msg.isSprinting;
        p.heldItem = msg.heldItem;
        if (typeof msg.flashlightOn === 'boolean') p.flashlightOn = msg.flashlightOn;
        if (typeof msg.ping === 'number') p.ping = msg.ping;

        broadcastToRoom(room, {
          type: 'player_sync',
          id: p.id,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
          pitch: p.pitch,
          isMoving: p.isMoving,
          isSprinting: p.isSprinting,
          heldItem: p.heldItem,
          flashlightOn: p.flashlightOn,
          ping: p.ping
        }, ws);
      }
      break;
    }

    case 'door_toggle': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      room.doors.set(msg.doorId, msg.isOpen);
      broadcastToRoom(room, {
        type: 'door_toggle',
        doorId: msg.doorId,
        isOpen: msg.isOpen,
        playerId: ws.playerId
      });
      break;
    }

    case 'item_pickup': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      broadcastToRoom(room, {
        type: 'item_pickup',
        itemId: msg.itemId,
        slot: msg.slot,
        playerId: ws.playerId
      });
      break;
    }

    case 'item_drop': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      broadcastToRoom(room, {
        type: 'item_drop',
        item: msg.item,
        x: msg.x,
        z: msg.z,
        playerId: ws.playerId
      });
      break;
    }

    case 'core_insert': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      broadcastToRoom(room, {
        type: 'core_insert',
        partType: msg.partType,
        totalInserted: msg.totalInserted,
        playerId: ws.playerId
      });
      break;
    }

    case 'blackout_state': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      room.isBlackout = msg.isBlackout;
      broadcastToRoom(room, {
        type: 'blackout_state',
        isBlackout: msg.isBlackout,
        reason: msg.reason
      });
      break;
    }

    case 'monster_sync': {
      // 호스트(방장) 클라이언트가 계산한 괴물 AI 상태를 세션 전체 대원에게 동기화
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room || room.hostId !== ws.playerId) return;

      broadcastToRoom(room, {
        type: 'monster_sync',
        state: msg.state,
        pos: msg.pos,
        yaw: msg.yaw,
        animMode: msg.animMode,
        targetVent: msg.targetVent,
        currentVent: msg.currentVent
      }, ws);
      break;
    }

    case 'player_down': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      broadcastToRoom(room, {
        type: 'player_down',
        playerId: ws.playerId,
        callsign: msg.callsign || '대원'
      }, ws);
      break;
    }

    case 'chat_radio': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      broadcastToRoom(room, {
        type: 'chat_radio',
        sender: msg.sender || ws.playerId,
        text: msg.text
      });
      break;
    }

    case 'start_game': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room) return;

      // 오직 호스트(방장)만 작전 시작 명령을 하달할 수 있음
      if (room.hostId !== ws.playerId) {
        ws.send(JSON.stringify({
          type: 'error',
          message: '작전 개시 명령은 지휘관(호스트)만 하달할 수 있습니다.'
        }));
        return;
      }

      const mapId = msg.mapId || room.mapId || 'chapter2';
      room.mapId = mapId;
      room.isStarted = true;

      console.log(`[GAME STARTED] Room ${room.id} launched into ${mapId} by host ${ws.playerId}`);

      // 방 안의 모든 대원에게 작전 개시 및 투입 브로드캐스트
      broadcastToRoom(room, {
        type: 'game_started',
        roomId: room.id,
        mapId: room.mapId,
        startedBy: ws.playerId
      });
      break;
    }

    case 'change_map': {
      if (!ws.currentRoomId) return;
      const room = rooms.get(ws.currentRoomId);
      if (!room || room.hostId !== ws.playerId) return;

      room.mapId = msg.mapId;
      broadcastToRoom(room, {
        type: 'map_changed',
        mapId: room.mapId
      });
      break;
    }
  }
}

function handleDisconnect(ws) {
  if (!ws.currentRoomId) return;
  const room = rooms.get(ws.currentRoomId);
  if (!room) return;

  const playerInfo = room.players.get(ws);
  room.players.delete(ws);

  if (room.players.size === 0) {
    rooms.delete(ws.currentRoomId);
    console.log(`[ROOM CLOSED] ${ws.currentRoomId} (all players left)`);
  } else {
    // 퇴장 대원 브로드캐스트
    broadcastToRoom(room, {
      type: 'player_left',
      playerId: ws.playerId,
      callsign: playerInfo?.callsign || '대원'
    });

    // 호스트가 나갔을 경우 다음 대원을 호스트로 자동 승격
    if (room.hostId === ws.playerId) {
      const [nextWs, nextPlayer] = room.players.entries().next().value;
      room.hostId = nextPlayer.id;
      nextPlayer.isHost = true;
      nextWs.send(JSON.stringify({
        type: 'host_promoted',
        hostId: nextPlayer.id
      }));
      console.log(`[HOST PROMOTED] ${nextPlayer.callsign} is now host of ${room.id}`);
    }
  }
}

// 15초 주기 하트비트 핑 검사
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

wss.on('close', () => {
  clearInterval(interval);
});

// HTTP 소켓 TCP Nagle 알고리즘 비활성화 (지연 버퍼링 방지)
server.on('connection', (socket) => {
  if (socket && socket.setNoDelay) {
    socket.setNoDelay(true);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`=======================================================`);
  console.log(`[MONOCHROME BUNKER] Tactical Co-op Server online on port ${PORT}`);
  console.log(`- Local Host:       http://localhost:${PORT} / ws://localhost:${PORT}`);
  console.log(`- LAN (Same Wi-Fi): http://${localIp}:${PORT} / ws://${localIp}:${PORT}`);
  console.log(`  (동일 Wi-Fi 공간에서 친구나 태블릿으로 접속 시 1~3ms 초저지연)`);
  console.log(`=======================================================`);
});

