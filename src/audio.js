// =====================================================================
// Web Audio API 기반 호러 사운드 합성 & 외부 오디오 에셋 슬롯 시스템 (src/audio.js)
// - 추후 외부 사운드 파일(.mp3, .wav, .ogg)을 가져올 때 SOUND_ASSET_MANIFEST의
//   url 값만 채워 넣으면 프로시저럴 사운드 대신 해당 오디오 에셋이 즉시 재생됩니다.
// =====================================================================

export const SOUND_ASSET_MANIFEST = {
  // 1. 환경음 & 전등(형광등) 디테일 사운드
  ambient_bunker_drone: { url: './sounds/ambient_bunker_drone.mp3', desc: '벙커 지하 저주파 웅웅거림 배경음' },
  lamp_buzz_hum:        { url: './sounds/lamp_buzz_hum.mp3', desc: '천장 형광등 기본 험 노이즈' },
  lamp_flicker_spark:   { url: null, desc: '천장 전등 지직거릴 때 스파크/전류 노이즈' },

  // 2. 플레이어 이동 & 장비 사운드
  footstep_walk:        { url: './sounds/footstep_walk.mp3', desc: '대원 일반 걸음 발소리' },
  footstep_sprint:      { url: './sounds/footstep_sprint.mp3', desc: '대원 전술 달리기 발소리' },
  water_splash_walk:    { url: './sounds/water_splash_walk.mp3', desc: '침수 수로 보행 물살 첨벙거림' },
  water_splash_sprint:  { url: './sounds/water_splash_sprint.mp3', desc: '침수 수로 전력 질주 물살 소리' },
  flashlight_on:        { url: './sounds/flashlight_on.mp3', desc: '손전등 딸깍 켜짐' },
  flashlight_off:       { url: './sounds/flashlight_off.mp3', desc: '손전등 딸깍 꺼짐' },

  // 3. 아이템 파밍 & 1인칭 뷰모델 상호작용 사운드
  item_pickup:          { url: './sounds/item_pickup.mp3', desc: '아이템 획득 습득음' },
  item_equip_switch:    { url: './sounds/item_equip_switch.mp3', desc: '인벤토리 슬롯 장착 전환음' },
  item_drop:            { url: './sounds/item_drop.mp3', desc: '아이템 바닥에 내려놓음' },
  flare_ignite:         { url: './sounds/flare_ignite.mp3', desc: '조명탄 신관 점화 쉭- 소리' },
  locker_open:          { url: './sounds/locker_open.mp3', desc: '철제 사물함 캐비닛 개폐음' },
  terminal_scan:        { url: './sounds/terminal_scan.mp3', desc: '전술 힌트 콘솔 스캔음' },

  // 4. 정전(블랙아웃) & 전기실 배전반 복구 사운드
  blackout_power_down:  { url: './sounds/blackout_power_down.mp3', desc: '전력 차단 파워 다운 셧다운' },
  breaker_lever_pull:   { url: './sounds/breaker_lever_pull.mp3', desc: '고전압 배전반 레버 당김' },
  electric_arc_spark:   { url: './sounds/electric_arc_spark.mp3', desc: '고전압 전기 아크 스파크' },
  power_restore_up:     { url: './sounds/power_restore_up.mp3', desc: '전력망 복구 파워 온 웅장음' },

  // 5. 방호문 & CCTV & 중앙 코어 탈출 사운드
  door_open:            { url: './sounds/door_open.mp3', desc: '방호문 슬라이딩 개방음' },
  door_close:           { url: './sounds/door_close.mp3', desc: '방호문 슬라이딩 폐쇄음' },
  door_malfunction:     { url: null, desc: '정전으로 인한 방호문 강제 무력화/고장음' },
  cctv_switch:          { url: null, desc: 'CCTV 카메라 채널 전환 노이즈 클릭음' },
  core_part_insert:     { url: null, desc: '중앙 코어에 수집 부품(배터리/키카드/밸브) 장착음' },
  escape_siren:         { url: null, desc: '중앙 코어 100% 가동 및 탈출 게이트 개방 사이렌' },

  // 6. 괴물(제노-엔도스켈레톤) & 환기구(Vent) 사운드
  monster_footstep:     { url: null, desc: '괴물 철제 엔도스켈레톤 발소리 (쿵 + 철컥)' },
  monster_heartbeat:    { url: null, desc: '괴물 흉곽 내부 생체 심장 코어 두근거림' },
  monster_screech:      { url: null, desc: '괴물 폭주 추격/공격 시 기계-생체 변조 괴성' },
  vent_clank_thud:      { url: null, desc: '괴물이 천장 환기구(벤트) 내부를 기어 다닐 때 울리는 철판 쾅쾅 소리' },
  vent_grate_open:      { url: null, desc: '환기구 철제 그릴 뚜껑이 열리고 닫히는 금속 마찰음' },
  door_bash_impact:     { url: null, desc: '괴물이 닫힌 방호문을 쾅쾅 내리찍는 강철 충격음' },
  monster_stun_shriek:  { url: null, desc: '조명탄 섬광에 괴물이 눈이 멀어 고통스러워하는 비명음' },
  monster_attack_kill:  { url: null, desc: '괴물에게 붙잡혔을 때의 처형 사운드' },
  monster_jumpscare:    { url: null, desc: '괴물 처형 점프스케어 - 고주파 메탈릭 비명 + 디스토션 서브 베이스 충격음' }
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this._masterVolume = 0.8;
    this.ambientGain = null;
    this.ambientDroneSource = null;
    this.ambientDroneGain = null;
    this.lampBuzzSource = null;
    this.lampBuzzGain = null;
    this.proceduralAmbientOsc = null;
    this.proceduralHumOsc = null;
    this.noiseBuffer = null;
    this.isMuted = false;
    this.isBlackout = false;
    this.externalBuffers = new Map();
    this.loadingPromises = new Map();
  }

  set volume(val) {
    this._masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this._masterVolume, this.ctx.currentTime);
    }
  }

  get volume() {
    return this._masterVolume;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this._masterVolume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.createNoiseBuffer();
    this.startAmbient();
    this.preloadExternalAssets();
  }

  /**
   * 정전 및 전력 복구 시 형광등 험 노이즈 연동 제어
   */
  setBlackout(isBlackout) {
    this.isBlackout = isBlackout;
    if (this.lampBuzzGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.lampBuzzGain.gain.cancelScheduledValues(t);
      this.lampBuzzGain.gain.linearRampToValueAtTime(isBlackout ? 0.001 : 0.28, t + 0.35);
    }
  }

  /**
   * 추후 외부 오디오 에셋 경로를 코드에서 동적으로 등록할 때도 사용할 수 있는 헬퍼
   */
  registerSoundAsset(key, url) {
    if (SOUND_ASSET_MANIFEST[key]) {
      SOUND_ASSET_MANIFEST[key].url = url;
      if (this.ctx) {
        this.loadExternalBuffer(key, url);
      }
    }
  }

  preloadExternalAssets() {
    if (!this.ctx) return;
    for (const [key, entry] of Object.entries(SOUND_ASSET_MANIFEST)) {
      const assetUrl = entry.url || (typeof entry.desc === 'string' && entry.desc.startsWith('http') ? entry.desc : null);
      if (assetUrl) {
        entry.url = assetUrl;
        this.loadExternalBuffer(key, assetUrl);
      }
    }
  }

  loadExternalBuffer(key, url) {
    if (!this.ctx || !url || this.loadingPromises.has(key)) return;
    const p = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buf => this.ctx.decodeAudioData(buf))
      .then(decoded => {
        this.externalBuffers.set(key, decoded);
        // 지속 배경음(드론 및 형광등 험)인 경우 즉시 고품질 MP3 루프로 매끄럽게 전환
        if (key === 'ambient_bunker_drone') {
          this.playAmbientDroneLoop();
        } else if (key === 'lamp_buzz_hum') {
          this.playLampBuzzLoop();
        }
      })
      .catch(err => {
        console.warn(`[Audio] 외부 사운드 에셋 로드 실패 (${key}: ${url}), 프로시저럴 사운드로 대체합니다.`, err);
      });
    this.loadingPromises.set(key, p);
  }

  /**
   * 외부 에셋이 등록되어 있으면 재생하고 true 반환, 없으면 false 반환하여 프로시저럴 폴백 실행
   */
  tryPlayExternal(key, volume = 0.5, playbackRate = 1.0) {
    if (!this.ctx || this.isMuted) return false;
    const buf = this.externalBuffers.get(key);
    if (!buf) return false;

    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = playbackRate;
    gain.gain.setValueAtTime(Math.max(0.001, volume), this.ctx.currentTime);
    src.connect(gain);
    gain.connect(this.masterGain || this.ctx.destination);
    src.start(0);
    return true;
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 1.5;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  /**
   * 벙커 상시 배경음: 1) 심연 저주파 드론 + 2) 천장 형광등 험 노이즈 지속 루프
   */
  startAmbient() {
    if (!this.ctx) return;
    this.playAmbientDroneLoop();
    this.playLampBuzzLoop();
  }

  playAmbientDroneLoop() {
    if (!this.ctx || this.isMuted) return;

    const buf = this.externalBuffers.get('ambient_bunker_drone');
    if (buf) {
      if (this.proceduralAmbientOsc) {
        try { this.proceduralAmbientOsc.stop(); } catch(e) {}
        this.proceduralAmbientOsc = null;
      }
      if (this.ambientDroneSource) {
        try { this.ambientDroneSource.stop(); } catch(e) {}
        this.ambientDroneSource = null;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      if (!this.ambientDroneGain) {
        this.ambientDroneGain = this.ctx.createGain();
        this.ambientDroneGain.connect(this.masterGain || this.ctx.destination);
      }
      this.ambientDroneGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      src.connect(this.ambientDroneGain);
      src.start(0);
      this.ambientDroneSource = src;
      return;
    }

    if (!this.proceduralAmbientOsc) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      this.ambientGain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(46, this.ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, this.ctx.currentTime);

      this.ambientGain.gain.setValueAtTime(0.65, this.ctx.currentTime);

      osc.connect(filter);
      filter.connect(this.ambientGain);
      this.ambientGain.connect(this.masterGain || this.ctx.destination);

      osc.start();
      this.proceduralAmbientOsc = osc;
    }
  }

  playLampBuzzLoop() {
    if (!this.ctx || this.isMuted) return;

    const buf = this.externalBuffers.get('lamp_buzz_hum');
    if (buf) {
      if (this.proceduralHumOsc) {
        try { this.proceduralHumOsc.stop(); } catch(e) {}
        this.proceduralHumOsc = null;
      }
      if (this.lampBuzzSource) {
        try { this.lampBuzzSource.stop(); } catch(e) {}
        this.lampBuzzSource = null;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      if (!this.lampBuzzGain) {
        this.lampBuzzGain = this.ctx.createGain();
        this.lampBuzzGain.connect(this.masterGain || this.ctx.destination);
      }
      const targetVol = this.isBlackout ? 0.001 : 0.52;
      this.lampBuzzGain.gain.setValueAtTime(targetVol, this.ctx.currentTime);

      src.connect(this.lampBuzzGain);
      src.start(0);
      this.lampBuzzSource = src;
      return;
    }

    if (!this.proceduralHumOsc) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, this.ctx.currentTime);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(120, this.ctx.currentTime);
      filter.Q.setValueAtTime(3.5, this.ctx.currentTime);

      const targetVol = this.isBlackout ? 0.001 : 0.42;
      gain.gain.setValueAtTime(targetVol, this.ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);

      osc.start();
      this.proceduralHumOsc = osc;
      this.lampBuzzGain = gain;
    }
  }

  playFlashlightClick(isOn) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const key = isOn ? 'flashlight_on' : 'flashlight_off';
    if (this.tryPlayExternal(key, 0.35)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isOn ? 1200 : 800, t);
    osc.frequency.exponentialRampToValueAtTime(isOn ? 1850 : 380, t + 0.045);

    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.045);
  }

  /**
   * 천장 형광등이 지직거리며 깜빡일 때 나는 전기 스파크 & 안정기 노이즈 사운드
   */
  playLampFlickerBuzz(volume = 0.14) {
    this.init();
    if (!this.ctx || this.isMuted || volume <= 0.005) return;
    if (this.tryPlayExternal('lamp_flicker_spark', volume)) return;

    const t = this.ctx.currentTime;
    const dur = 0.07 + Math.random() * 0.09;

    // 1. 120Hz 형광등 안정기 험(Hum) + 고주파 지직거림
    const hum = this.ctx.createOscillator();
    const humGain = this.ctx.createGain();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(120 + (Math.random() - 0.5) * 25, t);

    humGain.gain.setValueAtTime(volume * 0.45, t);
    humGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    hum.connect(humGain);
    humGain.connect(this.ctx.destination);
    hum.start(t);
    hum.stop(t + dur);

    // 2. 필라멘트 스파크 크래클 노이즈
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2600 + Math.random() * 1400, t);
      filter.Q.setValueAtTime(4.0, t);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(volume * 0.75, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);

      noise.start(t, Math.random() * 0.5, dur);
    }
  }

  playDoorSound(isOpen) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal(isOpen ? 'door_open' : 'door_close', 0.4)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    if (isOpen) {
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(240, t + 0.55);
    } else {
      osc.frequency.setValueAtTime(210, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.55);
    }

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.6);
  }

  /**
   * 정전이나 괴물 강타로 인한 방호문 강제 무력화/고장음 (유압 파열 + 금속 마찰)
   */
  playDoorMalfunction(volume = 0.42) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('door_malfunction', volume)) return;

    const t = this.ctx.currentTime;
    const dur = 0.72;

    // 1. 유압 밸브 파열음
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.linearRampToValueAtTime(320, t + 0.22);
    osc.frequency.exponentialRampToValueAtTime(35, t + dur);

    gain.gain.setValueAtTime(volume * 0.75, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);

    // 2. 금속 마찰 스파크 노이즈
    this.playElectricArc(volume * 0.6);
  }

  /**
   * 고전압 전기 아크 스파크 사운드 (배전반 고장, 방호문 스파크, 괴물 스턴)
   */
  playElectricArc(volume = 0.35) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('electric_arc_spark', volume)) return;

    if (!this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const dur = 0.28;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, t);
    filter.Q.setValueAtTime(4.5, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + dur);
  }

  playFootstep(isSprint = false, isWater = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    if (isWater) {
      if (this.tryPlayExternal(isSprint ? 'water_splash_sprint' : 'water_splash_walk', isSprint ? 0.42 : 0.28)) return;
      const t = this.ctx.currentTime;

      // 물살을 강하게 밟는 둔탁한 저주파 충격파
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isSprint ? 210 : 160, t);
      osc.frequency.exponentialRampToValueAtTime(isSprint ? 45 : 35, t + 0.12);
      oscGain.gain.setValueAtTime(isSprint ? 0.32 : 0.20, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain || this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);

      // 물방울이 흩뿌려지는 첨벙거림 노이즈
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(isSprint ? 1750 : 1350, t);
        noiseFilter.Q.setValueAtTime(2.2, t);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(isSprint ? 0.36 : 0.22, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain || this.ctx.destination);
        noise.start(t);
        noise.stop(t + 0.14);
      }
      return;
    }

    if (this.tryPlayExternal(isSprint ? 'footstep_sprint' : 'footstep_walk', isSprint ? 0.34 : 0.22)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isSprint ? 160 : 132, t);
    osc.frequency.exponentialRampToValueAtTime(isSprint ? 44 : 36, t + 0.085);

    gain.gain.setValueAtTime(isSprint ? 0.26 : 0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain || this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  /**
   * 아이템 파밍/획득 사운드 (배터리, 키카드, 밸브, 조명탄)
   */
  playItemPickup(itemType = 'generic') {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('item_pickup', 0.35)) return;

    const t = this.ctx.currentTime;

    // 1. 장비 파지 묵직한 클립음
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(280, t);
    osc1.frequency.exponentialRampToValueAtTime(520, t + 0.09);
    gain1.gain.setValueAtTime(0.18, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.095);

    // 2. 아이템 종류별 확인 톤
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = itemType === 'security_keycard' ? 'sine' : 'triangle';
    const baseFreq = itemType === 'energy_cell' ? 680 : itemType === 'security_keycard' ? 980 : 540;
    osc2.frequency.setValueAtTime(baseFreq, t + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, t + 0.2);

    gain2.gain.setValueAtTime(0.14, t + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.21);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t + 0.06);
    osc2.stop(t + 0.21);
  }

  /**
   * 인벤토리 슬롯 전환 / 손에 고쳐 쥐는 사운드
   */
  playItemEquip() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('item_equip_switch', 0.25)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(360, t + 0.06);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.065);
  }

  /**
   * 아이템 내려놓기 사운드
   */
  playItemDrop() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('item_drop', 0.3)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.14);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /**
   * 조명탄(Flare) 점화 사운드 (치이익- 불꽃 파열음)
   */
  playFlareIgnite() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('flare_ignite', 0.38)) return;

    const t = this.ctx.currentTime;
    const dur = 0.65;
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, t);
      filter.frequency.exponentialRampToValueAtTime(3200, t + dur);
      filter.Q.setValueAtTime(1.8, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(t);
      noise.stop(t + dur);
    }
  }

  /**
   * 철제 캐비닛/락커 문 여는 끼익 덜컹 사운드
   */
  playLockerOpen() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('locker_open', 0.35)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(310, t + 0.18);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.32);

    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.34);
  }

  /**
   * 단말기 조사/스캔 사운드
   */
  playTerminalScan() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('terminal_scan', 0.3)) return;

    const t = this.ctx.currentTime;
    const notes = [880, 1174, 1568];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + i * 0.055);
      gain.gain.setValueAtTime(0.07, t + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.055 + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + i * 0.055);
      osc.stop(t + i * 0.055 + 0.055);
    });
  }

  /**
   * 정전(블랙아웃) 발생 시 시설 전원 차단 사운드 (변압기 폭음 + 전력 하강음)
   */
  playBlackoutPowerDown() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('blackout_power_down', 0.55)) return;

    const t = this.ctx.currentTime;
    const dur = 1.45;

    // 1. 퓨즈 차단 충격음
    this.playLampFlickerBuzz(0.35);

    // 2. 터빈/발전기 주파수 급강하 (Power Down Winding)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + dur);

    gain.gain.setValueAtTime(0.34, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  /**
   * 전기실 배전반 차단기 레버 올리는 사운드 (철컥 + 전류 스파크)
   */
  playBreakerSwitch(stepIndex = 1) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('breaker_lever_pull', 0.42)) return;

    const t = this.ctx.currentTime;

    // 금속 레버 클랭크
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160 + stepIndex * 65, t);
    osc.frequency.exponentialRampToValueAtTime(520 + stepIndex * 90, t + 0.12);

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);

    this.playLampFlickerBuzz(0.22);
  }

  /**
   * 전기실 전력 100% 복구 완료 시 발전기 재가동 사운드
   */
  playPowerRestore() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('power_restore_up', 0.5)) return;

    const t = this.ctx.currentTime;
    const dur = 1.2;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(45, t);
    osc.frequency.exponentialRampToValueAtTime(340, t + dur * 0.8);
    osc.frequency.setValueAtTime(440, t + dur * 0.8);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  /**
   * 중앙 코어에 수집 부품 장착 사운드
   */
  playCoreInsert(partCount = 1, maxParts = 4) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('core_part_insert', 0.45)) return;

    const t = this.ctx.currentTime;
    const base = 220 + (partCount / maxParts) * 260;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base * 0.6, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.42);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  /**
   * 중앙 코어 완전 가동 및 비상 탈출 게이트 개방 사이렌
   */
  playEscapeSiren() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('escape_siren', 0.5)) return;

    const t = this.ctx.currentTime;
    for (let cycle = 0; cycle < 3; cycle++) {
      const start = t + cycle * 0.75;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, start);
      osc.frequency.linearRampToValueAtTime(780, start + 0.38);
      osc.frequency.linearRampToValueAtTime(440, start + 0.72);

      gain.gain.setValueAtTime(0.22, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.74);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.74);
    }
  }

  /**
   * 괴물 엔도스켈레톤 발소리:
   * 묵직한 철판 진동 쿵 소리(Sub Thud) + 기계 골격 클랭크 금속음(Metallic Clank)
   */
  playMonsterFootstep(volume = 0.28, isChase = false) {
    this.init();
    if (!this.ctx || this.isMuted || volume <= 0.01) return;
    if (this.tryPlayExternal('monster_footstep', volume, isChase ? 1.2 : 1.0)) return;
    const t = this.ctx.currentTime;

    // 1. 무거운 바닥 진동 충격음
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(isChase ? 115 : 85, t);
    subOsc.frequency.exponentialRampToValueAtTime(24, t + 0.18);

    subGain.gain.setValueAtTime(volume * 0.9, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(t);
    subOsc.stop(t + 0.19);

    // 2. 엔도스켈레톤 금속 관절 & 발톱 마찰음
    const metalOsc = this.ctx.createOscillator();
    const metalFilter = this.ctx.createBiquadFilter();
    const metalGain = this.ctx.createGain();

    metalOsc.type = 'sawtooth';
    metalOsc.frequency.setValueAtTime(isChase ? 620 : 440, t);
    metalOsc.frequency.exponentialRampToValueAtTime(140, t + 0.09);

    metalFilter.type = 'bandpass';
    metalFilter.frequency.setValueAtTime(950, t);
    metalFilter.Q.setValueAtTime(3.5, t);

    metalGain.gain.setValueAtTime(volume * 0.45, t);
    metalGain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

    metalOsc.connect(metalFilter);
    metalFilter.connect(metalGain);
    metalGain.connect(this.ctx.destination);
    metalOsc.start(t);
    metalOsc.stop(t + 0.095);
  }

  /**
   * 괴물 흉곽 심장 코어 고동음 (두-근!)
   */
  playMonsterHeartbeat(volume = 0.22) {
    this.init();
    if (!this.ctx || this.isMuted || volume <= 0.01) return;
    if (this.tryPlayExternal('monster_heartbeat', volume)) return;
    const t = this.ctx.currentTime;

    const pulse = (offset, freq, amp) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + offset);
      osc.frequency.exponentialRampToValueAtTime(26, t + offset + 0.14);

      gain.gain.setValueAtTime(amp, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.15);
    };

    pulse(0, 72, volume * 0.85);
    pulse(0.14, 58, volume * 0.55);
  }

  /**
   * 괴물 폭주/공격 시 기계-생체 괴성 포효음 (Biomechanical Endoskeleton Screech)
   */
  playMonsterScreech(volume = 0.35) {
    this.init();
    if (!this.ctx || this.isMuted || volume <= 0.01) return;
    if (this.tryPlayExternal('monster_screech', volume)) return;
    const t = this.ctx.currentTime;
    const dur = 0.95;

    // 1. FM 변조 금속성 비명 오실레이터
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const mainGain = this.ctx.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(320, t);
    carrier.frequency.exponentialRampToValueAtTime(780, t + 0.18);
    carrier.frequency.exponentialRampToValueAtTime(190, t + dur);

    mod.type = 'square';
    mod.frequency.setValueAtTime(48, t);
    mod.frequency.linearRampToValueAtTime(115, t + dur);

    modGain.gain.setValueAtTime(220, t);

    mainGain.gain.setValueAtTime(0.01, t);
    mainGain.gain.linearRampToValueAtTime(volume * 0.65, t + 0.08);
    mainGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(mainGain);
    mainGain.connect(this.ctx.destination);

    carrier.start(t);
    mod.start(t);
    carrier.stop(t + dur);
    mod.stop(t + dur);

    // 2. 거친 호흡/파열 노이즈 레이어
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, t);
      filter.frequency.exponentialRampToValueAtTime(420, t + dur);
      filter.Q.setValueAtTime(2.2, t);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(volume * 0.55, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);

      noise.start(t);
      noise.stop(t + dur);
    }
  }

  playCCTVSwitch() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('cctv_switch', 0.25)) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.setValueAtTime(1600, t + 0.03);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  /**
   * 괴물이 천장 환기구(Vent) 내부를 기어 다닐 때 울리는 둔탁한 철판 진동음 (쿵... 끼기긱...)
   */
  playVentClank(volume = 0.26) {
    this.init();
    if (!this.ctx || this.isMuted || volume <= 0.01) return;
    if (this.tryPlayExternal('vent_clank_thud', volume)) return;
    const t = this.ctx.currentTime;

    // 1. 양철 환기구 덕트 공명 쿵 소리
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(110 + Math.random() * 25, t);
    thud.frequency.exponentialRampToValueAtTime(34, t + 0.24);
    thudGain.gain.setValueAtTime(volume * 0.85, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    thud.connect(thudGain);
    thudGain.connect(this.ctx.destination);
    thud.start(t);
    thud.stop(t + 0.25);

    // 2. 발톱으로 덕트 철판을 긁는 고주파 금속 마찰음
    const scrape = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const sGain = this.ctx.createGain();
    scrape.type = 'sawtooth';
    scrape.frequency.setValueAtTime(520 + Math.random() * 180, t + 0.04);
    scrape.frequency.exponentialRampToValueAtTime(190, t + 0.22);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1350, t + 0.04);
    filter.Q.setValueAtTime(4.5, t + 0.04);
    sGain.gain.setValueAtTime(volume * 0.35, t + 0.04);
    sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.23);
    scrape.connect(filter);
    filter.connect(sGain);
    sGain.connect(this.ctx.destination);
    scrape.start(t + 0.04);
    scrape.stop(t + 0.23);
  }

  /**
   * 환기구 그릴 뚜껑이 젖혀지며 괴물이 출현하거나 진입할 때 나는 금속 파열음
   */
  playVentGrate(volume = 0.34) {
    this.init();
    if (!this.ctx || this.isMuted || volume <= 0.01) return;
    if (this.tryPlayExternal('vent_grate_open', volume)) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.linearRampToValueAtTime(640, t + 0.14);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.38);

    gain.gain.setValueAtTime(volume * 0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /**
   * 괴물이 닫힌 방호문(Blast Door)을 부수기 위해 쾅쾅 내리찍는 강철 충격음
   */
  playDoorBash(volume = 0.45) {
    this.init();
    if (!this.ctx || this.isMuted || volume <= 0.01) return;
    if (this.tryPlayExternal('door_bash_impact', volume)) return;
    const t = this.ctx.currentTime;

    // 무거운 강철 문짝 진동 저음
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(145, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 0.34);
    subGain.gain.setValueAtTime(volume, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    sub.connect(subGain);
    subGain.connect(this.ctx.destination);
    sub.start(t);
    sub.stop(t + 0.35);

    // 철판 크래시 노이즈
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(980, t);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(volume * 0.75, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(t, 0, 0.29);
    }
  }

  /**
   * 조명탄 섬광에 괴물이 실명/스턴되었을 때 지르는 기계 스파크 비명음
   */
  playMonsterStun(volume = 0.42) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('monster_stun_shriek', volume)) return;
    this.playMonsterScreech(volume);
    this.playElectricArc(volume * 0.8);
  }

  /**
   * 괴물에게 붙잡혔을 때의 처형 사운드
   */
  playMonsterKill() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('monster_attack_kill', 0.65)) return;
    this.playMonsterScreech(0.65);
    this.playDoorBash(0.55);
  }

  /**
   * 전용 처형 점프스케어 사운드 (서브 베이스 충격음 + 날카로운 디스토션 비명 + 턱 파쇄음)
   */
  playJumpscare(volume = 0.85) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.tryPlayExternal('monster_jumpscare', volume)) return;

    const t = this.ctx.currentTime;

    // 1. 공포감 극대화를 위해 배경 앰비언트 사운드 일시적 음소거(Ducking)
    if (this.ambientGain) {
      this.ambientGain.gain.setValueAtTime(0.001, t);
      this.ambientGain.gain.linearRampToValueAtTime(0.22, t + 2.8);
    }
    if (this.ambientDroneGain) {
      this.ambientDroneGain.gain.setValueAtTime(0.001, t);
      this.ambientDroneGain.gain.linearRampToValueAtTime(0.48, t + 2.8);
    }
    if (this.lampBuzzGain) {
      this.lampBuzzGain.gain.setValueAtTime(0.001, t);
      this.lampBuzzGain.gain.linearRampToValueAtTime(this.isBlackout ? 0.001 : 0.28, t + 2.8);
    }

    // 2. 심장을 덜컥 내려앉게 만드는 극저역 서브 베이스 슬램 (360Hz -> 22Hz 드롭)
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(360, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 0.45);
    subGain.gain.setValueAtTime(volume * 0.98, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
    sub.connect(subGain);
    subGain.connect(this.ctx.destination);
    sub.start(t);
    sub.stop(t + 0.5);

    // 3. 공포 영화 특유의 불협화음 고주파 금속 비명 클러스터 (Violin / Xenomorph Shriek)
    const screechFreqs = [1580, 1820, 2190, 2680];
    for (let i = 0; i < screechFreqs.length; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(screechFreqs[i], t);
      osc.frequency.linearRampToValueAtTime(screechFreqs[i] * 1.25, t + 0.55);

      g.gain.setValueAtTime(volume * 0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.72);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    }

    // 4. 기계-생체 변조 FM 신시사이저 (거친 그로울링)
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const carrierGain = this.ctx.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(740, t);
    carrier.frequency.linearRampToValueAtTime(420, t + 0.85);

    mod.type = 'sawtooth';
    mod.frequency.setValueAtTime(280, t);

    modGain.gain.setValueAtTime(650, t);
    modGain.gain.exponentialRampToValueAtTime(40, t + 0.8);

    mod.connect(carrier.frequency);
    carrier.connect(carrierGain);
    carrierGain.gain.setValueAtTime(volume * 0.42, t);
    carrierGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    carrierGain.connect(this.ctx.destination);

    mod.start(t);
    carrier.start(t);
    mod.stop(t + 0.88);
    carrier.stop(t + 0.88);

    // 5. 폭발적인 노이즈 디스토션 크런치
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.Q.setValueAtTime(2.2, t);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(volume * 0.75, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(t, 0, 0.68);
    }

    // 6. 0.28초 뒤 내턱 돌출 및 뼈 파쇄음 (Secondary Crunch)
    const t2 = t + 0.28;
    const bite = this.ctx.createOscillator();
    const biteGain = this.ctx.createGain();
    bite.type = 'triangle';
    bite.frequency.setValueAtTime(420, t2);
    bite.frequency.exponentialRampToValueAtTime(45, t2 + 0.24);
    biteGain.gain.setValueAtTime(volume * 0.85, t2);
    biteGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.25);
    bite.connect(biteGain);
    biteGain.connect(this.ctx.destination);
    bite.start(t2);
    bite.stop(t2 + 0.26);
  }

  /**
   * 군용 터미널 타이핑 키스트로크 사운드 (미세한 고주파 기계식 펄스)
   */
  playTerminalKey(volume = 0.04) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540 + Math.random() * 280, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.035);
  }

  /**
   * UI 버튼 및 지도/메뉴 열람 클릭 사운드
   */
  playClick(volume = 0.18) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    this.playTerminalKey(volume);
  }

  /**
   * CCTV 감시 카메라 채널 전환 노이즈 및 정전기 지직거림
   */
  playCctvSwitch(volume = 0.28) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    this.playElectricArc(volume * 0.35);

    const bufferSize = Math.floor(this.ctx.sampleRate * 0.09);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1750, t);
    filter.Q.setValueAtTime(1.6, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
  }

  /**
   * 바이탈 모니터 생체 신호 정지 플랫라인 사운드 (경고 펄스 -> 지속 평탄음)
   */
  playFlatlineBeep(volume = 0.18) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    // 2회의 감속 심박 경고음
    const pulses = [0.0, 0.48];
    pulses.forEach((dt) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(840, t + dt);
      gain.gain.setValueAtTime(volume * 0.35, t + dt);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + dt);
      osc.stop(t + dt + 0.13);
    });

    // 0.95초 뒤 영구 플랫라인 연속 톤 (680Hz)
    const flatOsc = this.ctx.createOscillator();
    const flatGain = this.ctx.createGain();
    flatOsc.type = 'sine';
    flatOsc.frequency.setValueAtTime(680, t + 0.95);
    flatGain.gain.setValueAtTime(0.0001, t + 0.95);
    flatGain.gain.linearRampToValueAtTime(volume * 0.3, t + 1.02);
    flatGain.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);

    flatOsc.connect(flatGain);
    flatGain.connect(this.ctx.destination);
    flatOsc.start(t + 0.95);
    flatOsc.stop(t + 3.25);
  }

  /**
   * 챕터 2 직육면체 음파 감지기 근접 경고 비프음 (크롤러가 가까울수록 피치 상승 및 더블 빕)
   * @param {number} closeness 0.0 (멀리 있음) ~ 1.0 (초근접)
   */
  playSonarPing(closeness = 0) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const c = Math.max(0, Math.min(1, closeness));
    const baseFreq = 760 + c * 620;
    const vol = 0.06 + c * 0.14;

    const triggerTone = (offsetSec, freqMul = 1.0) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = c > 0.65 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(baseFreq * freqMul, t + offsetSec);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * freqMul * 0.88, t + offsetSec + 0.065);
      gain.gain.setValueAtTime(vol, t + offsetSec);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + offsetSec + 0.07);
      osc.connect(gain);
      gain.connect(this.masterGain || this.ctx.destination);
      osc.start(t + offsetSec);
      osc.stop(t + offsetSec + 0.075);
    };

    triggerTone(0, 1.0);
    if (c > 0.52) {
      triggerTone(0.085, 1.12);
    }
  }

  /**
   * 챕터 2 허벅지 깊이 침수 수로 보행/질주 시 철썩이는 물장구 발소리
   */
  playWaterFootstep(isSprint = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const dur = isSprint ? 0.22 : 0.18;

    // 1. 저음 물결 출렁임
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isSprint ? 135 : 105, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + dur);
    oscGain.gain.setValueAtTime(isSprint ? 0.22 : 0.14, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain || this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);

    // 2. 밴드패스 노이즈 물보라 철썩임
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isSprint ? 950 : 720, t);
      filter.frequency.exponentialRampToValueAtTime(380, t + dur);
      filter.Q.setValueAtTime(1.5, t);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(isSprint ? 0.18 : 0.11, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain || this.ctx.destination);
      noise.start(t);
      noise.stop(t + dur);
    }
  }
}

export const sound = new AudioManager();
