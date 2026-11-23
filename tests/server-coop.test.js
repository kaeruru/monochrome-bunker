import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function startServerProcess() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: rootDir,
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timeout.\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 8000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]) });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}: ${stderr}`));
    });
  });
}

function httpGet(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: reqPath }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
  });
}

class WsClient {
  constructor(ws) {
    this.ws = ws;
    this.queue = [];
    this.waiters = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const idx = this.waiters.findIndex((w) => w.predicate(msg));
      if (idx !== -1) {
        const waiter = this.waiters.splice(idx, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        this.queue.push(msg);
      }
    });
  }

  static connect(port) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.once('open', () => resolve(new WsClient(ws)));
      ws.once('error', reject);
    });
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  waitFor(typeOrFn, timeoutMs = 3000) {
    const predicate = typeof typeOrFn === 'function' ? typeOrFn : (m) => m.type === typeOrFn;
    const queuedIdx = this.queue.findIndex(predicate);
    if (queuedIdx !== -1) {
      return Promise.resolve(this.queue.splice(queuedIdx, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i !== -1) this.waiters.splice(i, 1);
        reject(new Error(`Timed out waiting for message (${typeOrFn})`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  close() {
    this.ws.close();
  }
}

test('HTTP status & static security checks and full Co-op WebSocket lifecycle', async (t) => {
  const { child, port } = await startServerProcess();
  t.after(() => {
    child.kill();
  });

  // 1. HTTP health check & path traversal protection
  const statusRes = await httpGet(port, '/api/status');
  assert.equal(statusRes.status, 200);
  const statusJson = JSON.parse(statusRes.body);
  assert.equal(statusJson.status, 'ONLINE');

  const traversalRes = await httpGet(port, '/../package.json');
  assert.ok([403, 404].includes(traversalRes.status));
  assert.ok(!traversalRes.body.includes('"monochrome-bunker"'));

  const encodedTraversal = await httpGet(port, '/..%2fserver.js');
  assert.ok([403, 404].includes(encodedTraversal.status));
  assert.ok(!encodedTraversal.body.includes('WebSocketServer'));

  // 2. Host creates room
  const host = await WsClient.connect(port);
  const guest = await WsClient.connect(port);
  let lateJoiner = null;
  t.after(() => {
    host.close();
    guest.close();
    if (lateJoiner) lateJoiner.close();
  });

  host.send({ type: 'create_room', roomCode: 'TEST-901', callsign: 'ALPHA', suitColor: 'steel', mapId: 'chapter3' });
  const hostJoined = await host.waitFor('room_joined');
  assert.equal(hostJoined.roomId, 'TEST-901');
  assert.equal(hostJoined.isHost, true);
  assert.equal(hostJoined.mapId, 'chapter3');

  // 3. Guest joins room
  guest.send({ type: 'join_room', roomCode: 'TEST-901', callsign: 'BRAVO', suitColor: 'hazmat' });
  const guestJoined = await guest.waitFor('room_joined');
  assert.equal(guestJoined.isHost, false);
  assert.equal(guestJoined.players.length, 2);
  await host.waitFor('player_joined');

  // 4. Host starts game -> room.isStarted = true
  host.send({ type: 'start_game', mapId: 'chapter3' });
  const hostStart = await host.waitFor('game_started');
  const guestStart = await guest.waitFor('game_started');
  assert.equal(hostStart.mapId, 'chapter3');
  assert.equal(guestStart.matchSeed, hostStart.matchSeed);

  // 5. Item pickup deduplication race check
  host.send({ type: 'item_pickup', itemId: 'core_energy_0', slot: 0 });
  const pickupBroadcast = await guest.waitFor('item_pickup');
  assert.equal(pickupBroadcast.itemId, 'core_energy_0');

  // Duplicate pickup of same itemId from guest should be ignored (not rebroadcast)
  guest.send({ type: 'item_pickup', itemId: 'core_energy_0', slot: 1 });
  host.send({ type: 'locker_open', lockerId: 'locker_2' });
  const lockerMsg = await guest.waitFor('locker_open');
  assert.equal(lockerMsg.lockerId, 'locker_2');

  // 6. Core insert, gondola sync, radio chat, blackout sync
  host.send({ type: 'core_insert', partType: 'energy_cell', totalInserted: 1 });
  const coreMsg = await guest.waitFor('core_insert');
  assert.equal(coreMsg.totalInserted, 1);

  host.send({ type: 'gondola_sync', progress: 42.5, isEscapeOpen: false });
  const gondolaMsg = await guest.waitFor('gondola_sync');
  assert.equal(gondolaMsg.progress, 42.5);

  guest.send({ type: 'chat_radio', sender: 'BRAVO', text: '21F 배전반 확인' });
  const hostRadio = await host.waitFor('chat_radio');
  const guestRadio = await guest.waitFor('chat_radio');
  assert.equal(hostRadio.text, '21F 배전반 확인');
  assert.equal(guestRadio.sender, 'BRAVO');

  // 7. Monster sync including Ch.2 trio data relay
  host.send({
    type: 'monster_sync',
    state: 'CHASE',
    pos: { x: 1, y: 0, z: 2 },
    yaw: 0.5,
    animMode: 'chase',
    lurker: { pos: { x: 3, y: 0, z: 4 }, yaw: 1.1, state: 'LURK_PATROL', animMode: 'stalk' },
    snare: { pos: { x: 5, y: 2.5, z: 6 }, yaw: -0.4, state: 'SNARE_CRAWL', animMode: 'stalk' }
  });
  const monMsg = await guest.waitFor('monster_sync');
  assert.equal(monMsg.lurker.state, 'LURK_PATROL');
  assert.equal(monMsg.snare.state, 'SNARE_CRAWL');

  // 8. Late joiner restores full match state
  lateJoiner = await WsClient.connect(port);
  lateJoiner.send({ type: 'join_room', roomCode: 'TEST-901', callsign: 'CHARLIE', suitColor: 'blue' });
  const lateJoined = await lateJoiner.waitFor('room_joined');
  assert.equal(lateJoined.isStarted, true);
  assert.equal(lateJoined.gondolaProgress, 42.5);
  assert.deepEqual(lateJoined.pickedItems, ['core_energy_0']);
  assert.deepEqual(lateJoined.openedLockers, ['locker_2']);
  assert.deepEqual(lateJoined.installedCoreParts, ['energy_cell']);

  // 9. Escape & host restart clears state
  guest.send({ type: 'escape_success', callsign: 'BRAVO' });
  const escMsg = await host.waitFor('escape_success');
  assert.equal(escMsg.callsign, 'BRAVO');

  host.send({ type: 'restart_match' });
  const restartGuest = await guest.waitFor('match_restarted');
  assert.equal(restartGuest.mapId, 'chapter3');

  // 10. Host disconnect promotes next player & notifies remaining room
  host.close();
  const promoted = await guest.waitFor('host_promoted');
  assert.equal(promoted.hostId, guestJoined.playerId);
  const hostChanged = await lateJoiner.waitFor('host_changed');
  assert.equal(hostChanged.hostId, guestJoined.playerId);
});
