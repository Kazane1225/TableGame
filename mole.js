'use strict';

// ===== ルール（ホストだけが動かす） =====

const C = {
  HOLES: 9,
  ROUNDS: 2,
  ROUND_MS: 30000,
  COUNTDOWN_MS: 3000,
  RUMBLE_MS: 300,   // モグラが出る前の予兆（叩く側には場所が分からない）
  UP_MIN_MS: 200,   // モグラが顔を出している時間（毎回この範囲でランダム）
  UP_MAX_MS: 450,
  COOL_MS: 350,     // モグラ側が次に動けるまで
  STUN_MS: 300,     // 叩かれたあとの追加の待ち
  MISS_LOCK_MS: 800, // お手付きしたハンマーが使えない時間
  MISS_BONUS: 0.5,  // お手付き1回につきモグラ側に入る点
};

function createEngine(onChange) {
  const now = () => performance.now();
  const g = {
    phase: 'waiting', // waiting | countdown | playing | over
    round: 0,
    moleSeat: 0,
    scores: [0, 0],
    names: ['', ''],
    seated: [false, false],
    cpu: false,
    rematch: [false, false],
    mole: null,       // { hole, stage: 'rumble'|'up', end, fake }
    lastHole: -1,
    fxId: 0,
    fx: null,
    phaseEnd: 0,
    moleReadyAt: 0,
    lockUntil: 0,
    bot: { next: 0, target: null },
  };

  const emit = () => onChange();
  const addFx = (type, hole) => { g.fx = { id: ++g.fxId, type, hole }; };

  function beginCountdown() {
    g.phase = 'countdown';
    g.moleSeat = g.round % 2 === 1 ? 0 : 1;
    g.mole = null;
    g.lastHole = -1;
    g.phaseEnd = now() + C.COUNTDOWN_MS;
  }

  function startMatch() {
    g.scores = [0, 0];
    g.rematch = [false, false];
    g.round = 1;
    beginCountdown();
  }

  function resetToWaiting() {
    g.phase = 'waiting';
    g.round = 0;
    g.scores = [0, 0];
    g.rematch = [false, false];
    g.mole = null;
  }

  function endMole(t, extra = 0) {
    g.lastHole = g.mole.hole;
    g.mole = null;
    g.moleReadyAt = t + C.COOL_MS + extra;
  }

  function seat(i, name, isCpu = false) {
    g.seated[i] = true;
    g.names[i] = name;
    if (i === 1) g.cpu = isCpu;
    if (g.seated[0] && g.seated[1] && g.phase === 'waiting') startMatch();
    emit();
  }

  function unseat(i) {
    g.seated[i] = false;
    g.names[i] = '';
    if (i === 1) g.cpu = false;
    resetToWaiting();
    emit();
  }

  function handle(s, msg) {
    if (!msg || typeof msg !== 'object') return;
    const t = now();
    const hole = msg.hole;
    const validHole = Number.isInteger(hole) && hole >= 0 && hole < C.HOLES;
    const playing = g.phase === 'playing';

    if (msg.type === 'pop') {
      if (!playing || s !== g.moleSeat || g.mole || t < g.moleReadyAt) return;
      if (!validHole || hole === g.lastHole) return;
      g.mole = { hole, stage: 'rumble', end: t + C.RUMBLE_MS, fake: !!msg.fake };
      emit();
    } else if (msg.type === 'whack') {
      if (!playing || s === g.moleSeat || t < g.lockUntil || !validHole) return;
      const m = g.mole;
      if (m && m.stage === 'up' && m.hole === hole) {
        g.scores[s]++;
        addFx('hit', hole);
        endMole(t, C.STUN_MS);
      } else {
        g.lockUntil = t + C.MISS_LOCK_MS;
        g.scores[g.moleSeat] += C.MISS_BONUS;
        addFx('miss', hole);
      }
      emit();
    } else if (msg.type === 'rematch') {
      if (g.phase !== 'over') return;
      g.rematch[s] = true;
      if (g.rematch[0] && g.rematch[1]) startMatch();
      emit();
    }
  }

  function runBot(t) {
    if (!g.cpu || g.phase !== 'playing') return;
    const bot = g.bot;
    if (g.moleSeat === 1) {
      if (g.mole || t < g.moleReadyAt || t < bot.next) return;
      let hole;
      do { hole = Math.floor(Math.random() * C.HOLES); } while (hole === g.lastHole);
      handle(1, { type: 'pop', hole, fake: Math.random() < 0.25 });
      bot.next = t + 300 + Math.random() * 600;
      return;
    }
    const m = g.mole;
    if (m && m.stage === 'up') {
      if (!bot.target || bot.target.m !== m) {
        bot.target = { m, at: t + 200 + Math.random() * 200 };
      }
      if (!bot.target.done && t >= bot.target.at) {
        bot.target.done = true;
        handle(1, { type: 'whack', hole: m.hole });
      }
    } else if (t >= bot.next) {
      bot.next = t + 1200 + Math.random() * 1500;
      if (Math.random() < 0.2) handle(1, { type: 'whack', hole: Math.floor(Math.random() * C.HOLES) });
    }
  }

  function tick() {
    const t = now();
    let changed = false;

    if (g.phase === 'countdown' && t >= g.phaseEnd) {
      g.phase = 'playing';
      g.phaseEnd = t + C.ROUND_MS;
      g.moleReadyAt = t;
      g.lockUntil = 0;
      g.bot = { next: t + 800, target: null };
      changed = true;
    }

    if (g.phase === 'playing') {
      const m = g.mole;
      if (m && t >= m.end) {
        if (m.stage === 'rumble') {
          if (m.fake) {
            endMole(t);
          } else {
            m.stage = 'up';
            m.end = t + C.UP_MIN_MS + Math.random() * (C.UP_MAX_MS - C.UP_MIN_MS);
          }
        } else {
          g.scores[g.moleSeat]++;
          addFx('escape', m.hole);
          endMole(t);
        }
        changed = true;
      }
      if (t >= g.phaseEnd) {
        g.mole = null;
        if (g.round < C.ROUNDS) {
          g.round++;
          beginCountdown();
        } else {
          g.phase = 'over';
          g.rematch = [false, g.cpu];
        }
        changed = true;
      }
    }

    if (changed) emit();
    runBot(t);
  }

  function snap(forSeat = 0) {
    const t = now();
    const left = ms => Math.max(0, Math.round(ms));
    const hideHole = g.mole && g.mole.stage === 'rumble' && forSeat !== g.moleSeat;
    return {
      type: 'state',
      phase: g.phase,
      round: g.round,
      rounds: C.ROUNDS,
      moleSeat: g.moleSeat,
      scores: g.scores.slice(),
      names: g.names.slice(),
      seated: g.seated.slice(),
      cpu: g.cpu,
      rematch: g.rematch.slice(),
      mole: g.mole ? { hole: hideHole ? -1 : g.mole.hole, stage: g.mole.stage, ms: left(g.mole.end - t) } : null,
      lastHole: g.lastHole,
      timeLeft: g.phase === 'countdown' || g.phase === 'playing' ? left(g.phaseEnd - t) : 0,
      lockMs: left(g.lockUntil - t),
      coolMs: g.mole ? 0 : left(g.moleReadyAt - t),
      fx: g.fx,
    };
  }

  return { seat, unseat, handle, tick, snap };
}

// ===== 効果音 =====

let soundOn = localStorage.getItem('mole-sound') !== 'off';
let audioCtx = null;

function audio() {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, dur, { type = 'sine', vol = 0.3, to = null, delay = 0 } = {}) {
  const ac = audio();
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, vol, freq) {
  const ac = audio();
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ac.createBufferSource();
  const bp = ac.createBiquadFilter();
  const gain = ac.createGain();
  src.buffer = buf;
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  gain.gain.value = vol;
  src.connect(bp).connect(gain).connect(ac.destination);
  src.start();
}

const SFX = {
  rumble: () => tone(90, 0.25, { type: 'sawtooth', vol: 0.25, to: 60 }),
  pop: () => tone(300, 0.12, { type: 'square', vol: 0.12, to: 700 }),
  hit: () => { noise(0.08, 0.9, 1500); tone(220, 0.15, { type: 'triangle', vol: 0.5, to: 90 }); },
  miss: () => tone(320, 0.22, { vol: 0.3, to: 130 }),
  escape: () => { tone(660, 0.1, { vol: 0.2 }); tone(880, 0.15, { vol: 0.2, delay: 0.1 }); },
  beep: () => tone(660, 0.12, { vol: 0.25 }),
  go: () => tone(990, 0.35, { vol: 0.3 }),
  end: () => { tone(523, 0.15, { vol: 0.25 }); tone(659, 0.15, { vol: 0.25, delay: 0.15 }); tone(784, 0.3, { vol: 0.25, delay: 0.3 }); },
};

function sfx(name) {
  if (!soundOn) return;
  try {
    SFX[name]();
  } catch { /* 音が出せなくても対戦は続ける */ }
}

// ===== 通信・画面 =====

const $ = id => document.getElementById(id);
const PEER_PREFIX = 'mole-1v1-gh-';
const MAX_NAME = 16;
const JOIN_TIMEOUT_MS = 10000;

const view = {
  mode: null,       // 'host' | 'guest' | 'cpu'
  seat: 0,
  snap: null,
  t0: 0,
  lastFx: -1,
  lastSec: -1,
  fake: false,
  code: '',
};
let engine = null;
let peer = null;
let guestConn = null;
let tickTimer = null;
let heartbeat = null;
let joinTimer = null;

function randomCode(len = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function cleanName(v) {
  const s = typeof v === 'string' ? v.trim().slice(0, MAX_NAME) : '';
  return s || 'ゲスト';
}

function myName() {
  const name = cleanName($('player-name').value);
  localStorage.setItem('shogi-name', name);
  return name;
}

function lobbyMsg(text) {
  $('lobby-msg').textContent = text;
  $('lobby-msg').hidden = !text;
}

const BUTTON_LABELS = { 'btn-host': '部屋を作る', 'btn-join': '参加', 'btn-accept': 'この部屋に参加する', 'btn-cpu': 'はじめる' };

function setBusy(busyText) {
  for (const [id, label] of Object.entries(BUTTON_LABELS)) {
    $(id).disabled = !!busyText;
    $(id).textContent = label;
  }
  if (busyText) $(busyText.id).textContent = busyText.text;
}

function parseRoomCode(input) {
  const s = input.trim();
  try {
    const room = new URL(s).searchParams.get('room');
    if (room) return room.toLowerCase();
  } catch { /* URL ではない */ }
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inviteUrl() {
  return `${location.origin}${location.pathname}?room=${view.code}`;
}

function enterGame() {
  $('lobby').hidden = true;
  $('mgame').hidden = false;
  buildBoard();
  if (view.snap) render();
  requestAnimationFrame(frame);
}

function shutdown() {
  clearInterval(tickTimer);
  clearInterval(heartbeat);
  clearTimeout(joinTimer);
  if (peer) peer.destroy();
  peer = guestConn = null;
}

function backToLobby() {
  if (view.mode === 'guest' && guestConn?.open) guestConn.send({ type: 'leave' });
  shutdown();
  location.href = location.pathname;
}

// --- 入力の送信 ---

function sendInput(msg) {
  if (view.mode === 'guest') {
    if (guestConn?.open) guestConn.send(msg);
  } else {
    engine.handle(0, msg);
  }
}

// --- ホスト / CPU ---

function startEngine(name) {
  engine = createEngine(() => {
    onSnap(engine.snap(0));
    if (guestConn?.open) guestConn.send(engine.snap(1));
  });
  engine.seat(0, name);
  tickTimer = setInterval(() => engine.tick(), 40);
}

function startCpu() {
  view.mode = 'cpu';
  view.seat = 0;
  startEngine(myName());
  enterGame();
  engine.seat(1, 'CPU', true);
}

function hostRoom() {
  if (typeof Peer === 'undefined') return lobbyMsg('通信ライブラリを読み込めませんでした。ネット接続を確認してください。');
  setBusy({ id: 'btn-host', text: '部屋を作成中…' });
  lobbyMsg('');
  startHostPeer(randomCode());
}

function startHostPeer(code) {
  const p = new Peer(PEER_PREFIX + code);
  peer = p;

  p.on('open', () => {
    if (peer !== p || view.mode === 'host') return;
    view.mode = 'host';
    view.seat = 0;
    view.code = code;
    startEngine(myName());
    heartbeat = setInterval(() => {
      if (guestConn?.open) guestConn.send(engine.snap(1));
    }, 1000);
    setBusy(null);
    enterGame();
  });

  p.on('connection', c => {
    c.on('open', () => {
      if (guestConn?.open) {
        c.send({ type: 'full' });
        setTimeout(() => c.close(), 500);
        return;
      }
      guestConn = c;
    });
    c.on('data', msg => onHostData(c, msg));
    c.on('close', () => {
      if (c !== guestConn) return;
      guestConn = null;
      engine.unseat(1);
    });
  });

  p.on('disconnected', () => {
    if (peer === p && !p.destroyed) p.reconnect();
  });

  p.on('error', e => {
    if (peer !== p) return;
    if (e.type === 'unavailable-id') {
      p.destroy();
      startHostPeer(randomCode());
      return;
    }
    if (view.mode === 'host') return;
    shutdown();
    setBusy(null);
    lobbyMsg('部屋を作れませんでした。時間をおいてもう一度お試しください。（' + e.type + '）');
  });
}

function onHostData(c, msg) {
  if (c !== guestConn || !msg || typeof msg !== 'object') return;
  if (msg.type === 'hello') {
    engine.seat(1, cleanName(msg.name));
  } else if (msg.type === 'leave') {
    c.close();
  } else if (guestConnSeated()) {
    engine.handle(1, msg);
  }
}

const guestConnSeated = () => !!engine.snap().seated[1];

// --- ゲスト ---

function joinRoom(code) {
  if (!code) return lobbyMsg('部屋コードを入力してください。');
  if (typeof Peer === 'undefined') return lobbyMsg('通信ライブラリを読み込めませんでした。ネット接続を確認してください。');
  setBusy({ id: 'btn-join', text: '接続中…' });
  lobbyMsg('');
  const name = myName();
  const p = new Peer();
  peer = p;
  view.mode = null;

  const fail = text => {
    if (peer !== p) return;
    shutdown();
    setBusy(null);
    lobbyMsg(text);
  };
  joinTimer = setTimeout(() => fail('部屋に接続できませんでした。リンクを確認してください。'), JOIN_TIMEOUT_MS);

  p.on('open', () => {
    const c = p.connect(PEER_PREFIX + code, { reliable: true });
    guestConn = c;
    c.on('open', () => c.send({ type: 'hello', name }));
    c.on('data', msg => onGuestData(msg, fail));
    c.on('close', () => {
      if (guestConn !== c) return;
      if (view.mode === 'guest') {
        view.closed = true;
        renderStatus();
      } else {
        fail('部屋に接続できませんでした。');
      }
    });
  });
  p.on('error', e => {
    if (e.type === 'peer-unavailable') fail('部屋が見つかりません。リンクが古いか、ホストが退室した可能性があります。');
    else fail('接続できませんでした。（' + e.type + '）');
  });
}

function onGuestData(msg, fail) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'full') {
    fail('この部屋はすでに2人そろっています。');
  } else if (msg.type === 'state') {
    if (view.mode !== 'guest') {
      clearTimeout(joinTimer);
      view.mode = 'guest';
      view.seat = 1;
      setBusy(null);
      enterGame();
    }
    onSnap(msg);
  }
}

// ===== 描画 =====

const role = () => (view.snap && view.snap.moleSeat === view.seat ? 'mole' : 'hammer');

const ICON_SRC = {
  mole: 'assets/mole.svg?v=2',
  hammer: 'assets/hammer.svg?v=2',
  hit: 'assets/fx-hit.svg?v=2',
  miss: 'assets/fx-miss.svg?v=2',
  escape: 'assets/fx-escape.svg?v=2',
};

function iconEl(name, cls = 'ico') {
  const img = new Image();
  img.src = ICON_SRC[name];
  img.alt = '';
  img.className = cls;
  img.draggable = false;
  return img;
}

function buildBoard() {
  const board = $('m-board');
  if (board.children.length) return;
  for (let i = 0; i < C.HOLES; i++) {
    const h = document.createElement('div');
    h.className = 'hole';
    h.dataset.i = i;
    const fx = document.createElement('span');
    fx.className = 'fx';
    h.append(iconEl('mole', 'mole'), fx);
    board.appendChild(h);
  }
}

function showFx(hole, name) {
  const fx = $('m-board').children[hole]?.querySelector('.fx');
  if (!fx) return;
  fx.replaceChildren(iconEl(name, 'fx-img'));
  fx.classList.remove('show');
  void fx.offsetWidth;
  fx.classList.add('show');
}

function onSnap(s) {
  const prev = view.snap;
  view.snap = s;
  view.t0 = performance.now();
  if (view.lastFx < 0) view.lastFx = s.fx ? s.fx.id : 0;

  if (s.mole && (!prev || !prev.mole || prev.mole.stage !== s.mole.stage || prev.mole.hole !== s.mole.hole)) {
    sfx(s.mole.stage === 'rumble' ? 'rumble' : 'pop');
  }
  if (s.fx && s.fx.id !== view.lastFx) {
    view.lastFx = s.fx.id;
    showFx(s.fx.hole, s.fx.type);
    sfx(s.fx.type);
  }
  if (prev && prev.phase !== 'over' && s.phase === 'over') sfx('end');
  if (prev && prev.phase === 'countdown' && s.phase === 'playing') sfx('go');
  if (prev && prev.phase === 'over' && s.phase !== 'over') view.lastSec = -1;
  if (s.moleSeat !== (prev ? prev.moleSeat : s.moleSeat) || s.phase !== 'playing') view.fake = false;

  render();
}

function render() {
  const s = view.snap;
  if (!s) return;
  const me = view.seat;
  const isMole = role() === 'mole';

  for (let i = 0; i < 2; i++) {
    const el = $('m-p' + i);
    const name = el.querySelector('.m-name');
    name.replaceChildren();
    if (s.phase !== 'waiting') name.append(iconEl(s.moleSeat === i ? 'mole' : 'hammer'));
    name.append(s.names[i] || '（待機中）');
    el.querySelector('b').textContent = s.scores[i];
    el.classList.toggle('me', i === me);
  }

  const holes = $('m-board').children;
  for (let i = 0; i < holes.length; i++) {
    const stage = s.mole && s.mole.hole === i ? s.mole.stage : '';
    holes[i].className = 'hole' + (stage ? ' ' + stage : '')
      + (isMole && s.phase === 'playing' && s.lastHole === i ? ' blocked' : '');
  }
  $('m-board').classList.toggle('rumble-all', !isMole && s.mole?.stage === 'rumble');

  const online = view.mode === 'host';
  $('m-invite').hidden = !(online && s.phase === 'waiting');
  if (online) $('invite-url').value = inviteUrl();

  $('btn-fake').hidden = !(isMole && s.phase !== 'waiting' && s.phase !== 'over');
  $('btn-fake').classList.toggle('on', view.fake);
  $('btn-fake').textContent = `フェイント: ${view.fake ? 'ON（次の1回）' : 'OFF'}`;
  $('btn-rematch').hidden = s.phase !== 'over';
  $('btn-rematch').disabled = s.rematch[me];
  $('btn-rematch').textContent = s.rematch[me] ? '相手を待っています…' : '再戦';
  $('btn-sound').textContent = `音: ${soundOn ? 'ON' : 'OFF'}`;

  renderStatus();
}

function renderStatus() {
  const s = view.snap;
  const el = $('m-status');
  if (!s) return;
  if (view.closed) {
    el.innerHTML = '<span class="big">ホストとの接続が切れました</span>';
    return;
  }
  const me = view.seat;
  const isMole = role() === 'mole';
  const roleSpan = () => {
    const r = document.createElement('span');
    r.className = 'role';
    r.append(iconEl(isMole ? 'mole' : 'hammer'), isMole ? 'モグラ側' : '叩く側');
    return r;
  };
  const hint = isMole
    ? '穴をタップして顔を出そう。叩かれる前に引っ込めば得点！'
    : '盤が揺れたらモグラが出る合図。出たらすぐ叩こう！お手付きは相手に +0.5点';
  const parts = [];
  let small = '';
  let result = '';

  if (s.phase === 'waiting') {
    parts.push('対戦相手を待っています…');
  } else if (s.phase === 'countdown') {
    parts.push(`ラウンド ${s.round}/${s.rounds} — あなたは`, roleSpan());
    small = hint;
  } else if (s.phase === 'playing') {
    parts.push(`ラウンド ${s.round}/${s.rounds} — `, roleSpan());
    small = hint;
  } else {
    const a = s.scores[me];
    const b = s.scores[1 - me];
    parts.push(a > b ? 'あなたの勝ち！' : a < b ? 'あなたの負け…' : '引き分け');
    result = a > b ? 'win' : '';
    small = `${a} 対 ${b}`;
  }
  el.innerHTML = '';
  const b = document.createElement('span');
  b.className = 'big' + (result ? ' ' + result : '');
  b.append(...parts);
  el.append(b, small);
}

function frame() {
  const s = view.snap;
  if (s) {
    const elapsed = performance.now() - view.t0;
    const left = Math.max(0, s.timeLeft - elapsed);
    const sec = Math.ceil(left / 1000);
    $('m-timer').textContent = s.phase === 'countdown' || s.phase === 'playing' ? sec : '--';
    if (s.phase === 'countdown' && sec !== view.lastSec && sec > 0) sfx('beep');
    view.lastSec = s.phase === 'countdown' ? sec : -1;

    const waitMs = role() === 'hammer' ? s.lockMs : s.coolMs;
    $('m-board').classList.toggle('locked', s.phase === 'playing' && waitMs - elapsed > 0);
  }
  requestAnimationFrame(frame);
}

// ===== 操作 =====

$('m-board').addEventListener('pointerdown', e => {
  const h = e.target.closest('.hole');
  const s = view.snap;
  if (!h || !s || s.phase !== 'playing') return;
  audio();
  const hole = Number(h.dataset.i);
  if (role() === 'mole') {
    sendInput({ type: 'pop', hole, fake: view.fake });
    if (view.fake) {
      view.fake = false;
      render();
    }
  } else {
    if (s.lockMs - (performance.now() - view.t0) > 0) return;
    showFx(hole, 'hammer');
    sendInput({ type: 'whack', hole });
  }
});

$('btn-fake').onclick = () => {
  view.fake = !view.fake;
  render();
};
$('btn-rematch').onclick = () => sendInput({ type: 'rematch' });
$('btn-sound').onclick = () => {
  soundOn = !soundOn;
  localStorage.setItem('mole-sound', soundOn ? 'on' : 'off');
  if (soundOn) sfx('beep');
  if (view.snap) render();
};
$('btn-lobby').onclick = backToLobby;
$('btn-host').onclick = hostRoom;
$('btn-cpu').onclick = startCpu;
$('btn-join').onclick = () => joinRoom(parseRoomCode($('join-code').value));
$('btn-accept').onclick = () => joinRoom(view.code);
$('btn-invite-copy').onclick = async () => {
  const btn = $('btn-invite-copy');
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(inviteUrl());
    btn.textContent = 'コピーしました';
  } catch {
    prompt('このリンクを友人に送ってください', inviteUrl());
  }
  setTimeout(() => (btn.textContent = label), 1500);
};

// ===== 起動 =====

$('player-name').value = localStorage.getItem('shogi-name') || '';
const invitedRoom = (new URLSearchParams(location.search).get('room') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
if (invitedRoom) {
  view.code = invitedRoom;
  $('invited-code').textContent = invitedRoom;
  $('card-invited').hidden = false;
  $('lobby-normal').hidden = true;
}
