'use strict';

// ===== ルール =====
// board[r][c]: r=0 が上段（一段目）、c=0 が左端（9筋）。owner 0=先手, 1=後手

const FACE = {
  K: ['玉', '玉'], R: ['飛', '龍'], B: ['角', '馬'], G: ['金', '金'],
  S: ['銀', '全'], N: ['桂', '圭'], L: ['香', '杏'], P: ['歩', 'と'],
};
const KIFU_NAME = {
  K: ['玉', '玉'], R: ['飛', '龍'], B: ['角', '馬'], G: ['金', '金'],
  S: ['銀', '成銀'], N: ['桂', '成桂'], L: ['香', '成香'], P: ['歩', 'と'],
};
const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
const PROMOTABLE = new Set(['R', 'B', 'S', 'N', 'L', 'P']);
const ZEN = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const MARK = ['☗', '☖'];
const SIDE_NAME = ['先手', '後手'];

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const STEP = {
  K: [...ORTHO, ...DIAG],
  G: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]],
  S: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]],
  N: [[-2, -1], [-2, 1]],
  P: [[-1, 0]],
};
const SLIDE = { L: [[-1, 0]], B: DIAG, R: ORTHO };

const inBoard = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;
const piece = (t, o, p = false) => ({ t, o, p });
const emptyHand = () => ({ R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 });

function initialBoard() {
  const b = Array.from({ length: 9 }, () => Array(9).fill(null));
  const back = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];
  for (let c = 0; c < 9; c++) {
    b[0][c] = piece(back[c], 1);
    b[2][c] = piece('P', 1);
    b[6][c] = piece('P', 0);
    b[8][c] = piece(back[c], 0);
  }
  b[1][1] = piece('R', 1);
  b[1][7] = piece('B', 1);
  b[7][1] = piece('B', 0);
  b[7][7] = piece('R', 0);
  return b;
}

function movement(p) {
  if (p.p) {
    if (p.t === 'B') return { steps: ORTHO, slides: DIAG };
    if (p.t === 'R') return { steps: DIAG, slides: ORTHO };
    return { steps: STEP.G, slides: [] };
  }
  return { steps: STEP[p.t] || [], slides: SLIDE[p.t] || [] };
}

function targets(board, r, c) {
  const p = board[r][c];
  const s = p.o === 0 ? 1 : -1;
  const { steps, slides } = movement(p);
  const out = [];
  for (const [dr, dc] of steps) {
    const nr = r + dr * s, nc = c + dc * s;
    if (!inBoard(nr, nc)) continue;
    const q = board[nr][nc];
    if (!q || q.o !== p.o) out.push([nr, nc]);
  }
  for (const [dr, dc] of slides) {
    let nr = r + dr * s, nc = c + dc * s;
    while (inBoard(nr, nc)) {
      const q = board[nr][nc];
      if (q) {
        if (q.o !== p.o) out.push([nr, nc]);
        break;
      }
      out.push([nr, nc]);
      nr += dr * s;
      nc += dc * s;
    }
  }
  return out;
}

const inZone = (o, r) => (o === 0 ? r <= 2 : r >= 6);

function canPromote(p, fr, tr) {
  return !p.p && PROMOTABLE.has(p.t) && (inZone(p.o, fr) || inZone(p.o, tr));
}

// 行き所のない駒になるか
function isDead(t, o, r) {
  const rel = o === 0 ? r : 8 - r;
  return ((t === 'P' || t === 'L') && rel === 0) || (t === 'N' && rel <= 1);
}

function clonePos(pos) {
  return {
    board: pos.board.map(row => row.map(x => x && { ...x })),
    hands: pos.hands.map(h => ({ ...h })),
  };
}

function doMove(pos, m, o) {
  const q = clonePos(pos);
  const [tr, tc] = m.to;
  if (m.drop) {
    q.board[tr][tc] = piece(m.drop, o);
    q.hands[o][m.drop]--;
  } else {
    const [fr, fc] = m.from;
    const p = q.board[fr][fc];
    const cap = q.board[tr][tc];
    if (cap) q.hands[o][cap.t]++;
    q.board[tr][tc] = piece(p.t, o, p.p || !!m.promote);
    q.board[fr][fc] = null;
  }
  return q;
}

function findKing(board, o) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.t === 'K' && p.o === o) return [r, c];
    }
  return null;
}

function isAttacked(board, r, c, by) {
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++) {
      const p = board[i][j];
      if (p && p.o === by && targets(board, i, j).some(([a, b]) => a === r && b === c)) return true;
    }
  return false;
}

function inCheck(board, o) {
  const k = findKing(board, o);
  return k ? isAttacked(board, k[0], k[1], 1 - o) : false;
}

function pseudoMoves(pos, o) {
  const out = [];
  const b = pos.board;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const p = b[r][c];
      if (!p || p.o !== o) continue;
      for (const to of targets(b, r, c)) {
        const must = !p.p && isDead(p.t, o, to[0]);
        if (!must) out.push({ from: [r, c], to, promote: false });
        if (canPromote(p, r, to[0])) out.push({ from: [r, c], to, promote: true });
      }
    }
  for (const t of HAND_ORDER) {
    if (!pos.hands[o][t]) continue;
    const pawnCols = new Set();
    if (t === 'P') {
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
          const p = b[r][c];
          if (p && p.o === o && p.t === 'P' && !p.p) pawnCols.add(c);
        }
    }
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (b[r][c] || isDead(t, o, r) || pawnCols.has(c)) continue;
        out.push({ drop: t, to: [r, c] });
      }
  }
  return out;
}

function isLegal(pos, m, o, checkUchifuzume = true) {
  const q = doMove(pos, m, o);
  if (inCheck(q.board, o)) return false;
  if (checkUchifuzume && m.drop === 'P' && inCheck(q.board, 1 - o) && !hasLegalMove(q, 1 - o, false)) {
    return false;
  }
  return true;
}

function hasLegalMove(pos, o, checkUchifuzume = true) {
  return pseudoMoves(pos, o).some(m => isLegal(pos, m, o, checkUchifuzume));
}

function legalMoves(pos, o) {
  return pseudoMoves(pos, o).filter(m => isLegal(pos, m, o));
}

const sameSq = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

function sameMove(a, b) {
  return (a.drop || null) === (b.drop || null)
    && sameSq(a.to, b.to)
    && (a.drop ? true : sameSq(a.from, b.from) && !!a.promote === !!b.promote);
}

function formatMove(pos, m, o, prevTo) {
  const [tr, tc] = m.to;
  const sq = sameSq(prevTo, m.to) ? '同　' : ZEN[9 - tc] + KAN[tr + 1];
  if (m.drop) return MARK[o] + sq + KIFU_NAME[m.drop][0] + '打';
  const p = pos.board[m.from[0]][m.from[1]];
  let s = MARK[o] + sq + KIFU_NAME[p.t][p.p ? 1 : 0];
  if (canPromote(p, m.from[0], tr)) s += m.promote ? '成' : '不成';
  return s;
}

// ===== 対局状態 =====

let game = null;
let undoStack = [];
let selected = null;   // { from:[r,c] } | { drop:'P' } と、その合法手 moves
let mode = null;       // 'local' | 'online'
let localFlip = false;
// seats[0]=先手, seats[1]=後手 に座っている人の peer id（空席は null）
// rematch[s]: 席 s の対局者が再戦を希望しているか
let room = { seats: [null, null], members: [], rematch: [false, false] };

function newGame() {
  room.rematch = [false, false];
  game = {
    board: initialBoard(),
    hands: [emptyHand(), emptyHand()],
    turn: 0,
    kifu: [],
    last: null,
    over: null,
  };
  undoStack = [];
  selected = null;
}

function applyGameMove(m) {
  const o = game.turn;
  undoStack.push(JSON.stringify(game));
  game.kifu.push(formatMove(game, m, o, game.last));
  const q = doMove(game, m, o);
  game.board = q.board;
  game.hands = q.hands;
  game.last = m.to;
  game.turn = 1 - o;
  selected = null;
  if (!hasLegalMove(game, game.turn)) {
    game.over = { winner: o, reason: inCheck(game.board, game.turn) ? '詰み' : '手詰まり' };
  }
}

const mySeat = () => (net.myId ? room.seats.indexOf(net.myId) : -1);
const bothSeated = () => !!room.seats[0] && !!room.seats[1];

function viewSide() {
  if (mode === 'online' && mySeat() >= 0) return mySeat();
  return localFlip ? 1 : 0;
}

function canControl(side) {
  if (!game || game.over) return false;
  if (mode === 'local') return true;
  return net.connected && bothSeated() && room.seats[side] === net.myId;
}

function memberName(id) {
  const m = room.members.find(x => x.id === id);
  return m ? m.name : '？';
}

// ===== 入力 =====

async function onSquare(r, c) {
  if (!canControl(game.turn)) return;

  if (selected) {
    const cands = selected.moves.filter(m => sameSq(m.to, [r, c]));
    if (cands.length) {
      let m = cands[0];
      if (cands.length > 1) {
        const p = game.board[selected.from[0]][selected.from[1]];
        const promote = await askPromotion(p);
        m = cands.find(x => x.promote === promote);
      }
      commitMove(m);
      return;
    }
  }

  const p = game.board[r][c];
  if (p && p.o === game.turn && !(selected && sameSq(selected.from, [r, c]))) {
    const moves = legalMoves(game, game.turn).filter(m => !m.drop && sameSq(m.from, [r, c]));
    selected = { from: [r, c], moves };
  } else {
    selected = null;
  }
  render();
}

function onHand(o, t) {
  if (o !== game.turn || !canControl(o)) return;
  if (selected && selected.drop === t) {
    selected = null;
  } else {
    const moves = legalMoves(game, o).filter(m => m.drop === t);
    selected = { drop: t, moves };
  }
  render();
}

function commitMove(m) {
  const clean = m.drop
    ? { drop: m.drop, to: m.to }
    : { from: m.from, to: m.to, promote: !!m.promote };
  if (mode === 'online') {
    selected = null;
    act({ type: 'move', move: clean });
  } else {
    applyGameMove(clean);
  }
  render();
}

function askPromotion(p) {
  return new Promise(resolve => {
    const modal = $('promo');
    const yes = $('promo-yes');
    const no = $('promo-no');
    yes.textContent = `成る（${FACE[p.t][1]}）`;
    no.textContent = `成らない（${FACE[p.t][0]}）`;
    modal.hidden = false;
    const done = v => {
      modal.hidden = true;
      yes.onclick = no.onclick = null;
      resolve(v);
    };
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
  });
}

// ===== 描画 =====

const $ = id => document.getElementById(id);

function pieceEl(t, promoted, opp, o) {
  const el = document.createElement('div');
  el.className = 'piece' + (promoted ? ' promoted' : '') + (opp ? ' opp' : '');
  const face = document.createElement('div');
  face.className = 'face';
  face.textContent = t === 'K' ? (o === 0 ? '玉' : '王') : FACE[t][promoted ? 1 : 0];
  el.appendChild(face);
  return el;
}

function render() {
  if (!game) return;
  const view = viewSide();
  const flip = view === 1;

  const files = $('files');
  files.innerHTML = '';
  for (let vc = 0; vc < 9; vc++) {
    const d = document.createElement('div');
    d.textContent = flip ? vc + 1 : 9 - vc;
    files.appendChild(d);
  }
  const ranks = $('ranks');
  ranks.innerHTML = '';
  for (let vr = 0; vr < 9; vr++) {
    const d = document.createElement('div');
    d.textContent = KAN[flip ? 9 - vr : vr + 1];
    ranks.appendChild(d);
  }

  const targetSet = new Set((selected?.moves || []).map(m => m.to[0] * 9 + m.to[1]));
  const boardEl = $('board');
  boardEl.innerHTML = '';
  for (let vr = 0; vr < 9; vr++)
    for (let vc = 0; vc < 9; vc++) {
      const r = flip ? 8 - vr : vr;
      const c = flip ? 8 - vc : vc;
      const p = game.board[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (sameSq(game.last, [r, c])) cell.classList.add('last');
      if (selected?.from && sameSq(selected.from, [r, c])) cell.classList.add('selected');
      if (targetSet.has(r * 9 + c)) cell.classList.add('target');
      if (p) {
        cell.classList.add('has-piece');
        cell.appendChild(pieceEl(p.t, p.p, p.o !== view, p.o));
      }
      cell.onclick = () => onSquare(r, c);
      boardEl.appendChild(cell);
    }

  renderHand($('hand-top'), 1 - view, view);
  renderHand($('hand-bottom'), view, view);

  const kifu = $('kifu');
  kifu.innerHTML = '';
  for (const k of game.kifu) {
    const li = document.createElement('li');
    li.textContent = k;
    kifu.appendChild(li);
  }
  kifu.scrollTop = kifu.scrollHeight;

  renderStatus();
  renderRoom();

  const online = mode === 'online';
  const seated = !online || mySeat() >= 0;
  $('btn-undo').hidden = online;
  $('btn-undo').disabled = !undoStack.length || !!game.over;
  $('btn-flip').hidden = online && mySeat() >= 0;
  $('btn-resign').hidden = !seated;
  $('btn-resign').disabled = !!game.over || (online && !(net.connected && bothSeated()));
  const rematchBtn = $('btn-rematch');
  rematchBtn.hidden = !game.over || !seated;
  if (online && seated) {
    const s = mySeat();
    const iAsked = room.rematch[s];
    const oppAsked = room.rematch[1 - s];
    rematchBtn.disabled = !net.connected || iAsked;
    rematchBtn.textContent = iAsked ? '相手の返事を待っています…'
      : oppAsked ? '再戦を受ける（先後入替）'
      : '再戦を申し込む（先後入替）';
  } else {
    rematchBtn.disabled = false;
    rematchBtn.textContent = '再戦';
  }
  $('chat').hidden = !online;
  $('chat-input').disabled = !net.connected;
}

function renderHand(el, o, view) {
  el.innerHTML = '';
  for (const t of HAND_ORDER) {
    const n = game.hands[o][t];
    if (!n) continue;
    const item = document.createElement('div');
    item.className = 'hand-item';
    if (selected?.drop === t && game.turn === o) item.classList.add('selected');
    item.appendChild(pieceEl(t, false, o !== view, o));
    if (n > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'count';
      cnt.textContent = n;
      item.appendChild(cnt);
    }
    item.onclick = () => onHand(o, t);
    el.appendChild(item);
  }
}

function renderStatus() {
  const st = $('status');
  st.classList.remove('check');
  const online = mode === 'online';
  const who = o => MARK[o] + SIDE_NAME[o] + (online && room.seats[o] ? `（${memberName(room.seats[o])}）` : '');
  let text;
  if (game.over) {
    const { winner, reason } = game.over;
    text = `${who(winner)}の勝ち（${reason}）`;
    if (online && mySeat() >= 0) text += winner === mySeat() ? ' — あなたの勝ちです！' : ' — あなたの負けです';
  } else if (online && !net.connected) {
    text = 'ホストとの接続が切れました';
  } else if (online && !bothSeated()) {
    text = mySeat() >= 0
      ? '対局相手を待っています'
      : '対局者を待っています — 空いている席の「着席」を押すと対局に参加できます';
  } else {
    if (online && mySeat() >= 0) {
      text = game.turn === mySeat() ? 'あなたの番です' : '相手の番です';
    } else if (online) {
      text = `観戦中 — ${who(game.turn)}の番`;
    } else {
      text = `${who(game.turn)}の番`;
    }
    if (inCheck(game.board, game.turn)) {
      text += '（王手！）';
      st.classList.add('check');
    }
  }
  st.textContent = text;
}

function renderRoom() {
  const online = mode === 'online';
  $('room').hidden = !online;
  $('invite-banner').hidden = !online || bothSeated() || !net.connected;
  if (!online) return;
  $('room-code').textContent = net.roomCode;
  $('invite-url').value = inviteUrl();
  $('btn-invite-share').hidden = !navigator.share;

  for (const s of [0, 1]) {
    const el = $('seat-' + s);
    el.innerHTML = '';
    el.classList.toggle('turn', !game.over && game.turn === s);
    const id = room.seats[s];

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = MARK[s] + SIDE_NAME[s];
    el.appendChild(label);

    const name = document.createElement('span');
    name.className = 'name' + (id ? '' : ' empty');
    name.textContent = id ? memberName(id) + (id === net.myId ? '（あなた）' : '') : '空席';
    el.appendChild(name);

    if (id === net.myId) {
      const b = document.createElement('button');
      b.textContent = '席を立つ';
      b.disabled = !net.connected;
      b.onclick = () => {
        if (!game.over && game.kifu.length && !confirm('対局中です。席を立って観戦に移りますか？')) return;
        act({ type: 'stand' });
      };
      el.appendChild(b);
    } else if (!id) {
      const b = document.createElement('button');
      b.textContent = '着席';
      b.disabled = !net.connected;
      b.onclick = () => act({ type: 'sit', side: s });
      el.appendChild(b);
    }
  }

  const watchers = room.members.filter(m => !room.seats.includes(m.id));
  $('spectators').textContent = watchers.length
    ? '観戦: ' + watchers.map(m => m.name + (m.id === net.myId ? '（あなた）' : '')).join('、')
    : '観戦者はいません';
}

function addChat(entry) {
  const log = $('chat-log');
  const div = document.createElement('div');
  if (entry.system) {
    div.className = 'chat-msg system';
    div.textContent = entry.text;
  } else {
    div.className = 'chat-msg ' + (entry.id === net.myId ? 'me' : 'opp');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = entry.name;
    div.appendChild(who);
    div.appendChild(document.createTextNode(entry.text));
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ===== 通信（PeerJS） =====
// 部屋を作った人（ホスト）が全員と接続し、盤と席の状態を管理して配信する

const PEER_PREFIX = 'shogi-1v1-gh-';
const MAX_GUESTS = 16;
const net = {
  peer: null,
  myId: null,
  roomCode: '',
  isHost: false,
  connected: false,
  conn: null,            // ゲスト → ホストの接続
  ver: -1,               // 盤面状態の版番号。ホストが配信のたびに増やす
  heartbeat: null,
  guests: new Map(),     // ホスト側: peer id → { conn, name, joined }
  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  },
  destroy() {
    clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.ver = -1;
    if (this.peer) this.peer.destroy();
    this.peer = this.conn = this.myId = null;
    this.guests.clear();
    this.connected = false;
    this.isHost = false;
    this.roomCode = '';
  },
};

function randomCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function cleanName(v) {
  const s = typeof v === 'string' ? v.trim().slice(0, 16) : '';
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

const BUTTON_LABELS = { 'btn-host': '部屋を作る', 'btn-join': '参加', 'btn-accept': 'この部屋に参加する' };

function setBusy(busyText) {
  for (const [id, label] of Object.entries(BUTTON_LABELS)) {
    $(id).disabled = !!busyText;
    $(id).textContent = label;
  }
  if (busyText) $(busyText.id).textContent = busyText.text;
}

// 招待リンクがまるごと貼り付けられても部屋コードを取り出す
function parseRoomCode(input) {
  const s = input.trim();
  try {
    const room = new URL(s).searchParams.get('room');
    if (room) return room.toLowerCase();
  } catch { /* URL ではない */ }
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inviteUrl() {
  return `${location.origin}${location.pathname}?room=${net.roomCode}`;
}

async function copyInvite(btn) {
  const url = inviteUrl();
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'コピーしました';
  } catch {
    prompt('このリンクを友人に送ってください', url);
  }
  setTimeout(() => (btn.textContent = label), 1500);
}

function requirePeerJs() {
  if (typeof Peer === 'undefined') {
    lobbyMsg('通信ライブラリを読み込めませんでした。ネット接続を確認してください。');
    return false;
  }
  return true;
}

function act(msg) {
  if (net.isHost) handleAction(net.myId, msg);
  else net.send(msg);
}

// --- ホスト ---

function hostRoom() {
  if (!requirePeerJs()) return;
  net.destroy();
  const name = myName();
  const code = randomCode();
  const peer = new Peer(PEER_PREFIX + code);
  net.peer = peer;
  net.isHost = true;
  setBusy({ id: 'btn-host', text: '部屋を作成中…' });
  lobbyMsg('');

  peer.on('open', id => {
    net.myId = id;
    net.roomCode = code;
    net.connected = true;
    room = { seats: [null, null], members: [{ id, name }], rematch: [false, false] };
    const pref = $('side-pref').value;
    if (pref !== 'watch') {
      const side = pref === 'sente' ? 0 : pref === 'gote' ? 1 : (Math.random() < 0.5 ? 0 : 1);
      room.seats[side] = id;
    }
    newGame();
    net.ver = 0;
    // 途中で取りこぼしたゲストがいても、定期的な再配信で最新状態に追いつける
    net.heartbeat = setInterval(() => broadcast(stateMsg()), 4000);
    setBusy(null);
    enterGame('online');
    addChat({ system: true, text: '部屋を作りました。招待リンクを友人に送ってください。' });
  });

  peer.on('connection', c => {
    c.on('open', () => {
      if (net.guests.size >= MAX_GUESTS) {
        c.send({ type: 'full' });
        setTimeout(() => c.close(), 500);
        return;
      }
      net.guests.set(c.peer, { conn: c, name: 'ゲスト', joined: false });
    });
    c.on('data', msg => handleAction(c.peer, msg));
    c.on('close', () => onGuestLeave(c.peer));
  });

  // シグナリングサーバーとの接続だけが切れた場合、既存の接続は生きているので再登録する
  peer.on('disconnected', () => {
    if (net.peer === peer && !peer.destroyed) peer.reconnect();
  });

  peer.on('error', e => {
    if (e.type === 'unavailable-id') {
      hostRoom();
      return;
    }
    if (mode !== 'online') {
      setBusy(null);
      lobbyMsg('部屋を作れませんでした。時間をおいてもう一度お試しください。（' + e.type + '）');
    }
  });
}

function hostName(id) {
  if (id === net.myId) return room.members[0].name;
  return net.guests.get(id)?.name || 'ゲスト';
}

function memberList() {
  const list = [{ id: net.myId, name: hostName(net.myId) }];
  for (const [id, g] of net.guests) if (g.joined) list.push({ id, name: g.name });
  return list;
}

function broadcast(msg) {
  for (const g of net.guests.values()) {
    if (g.joined && g.conn.open) g.conn.send(msg);
  }
}

function stateMsg() {
  return { type: 'state', ver: net.ver, game, seats: room.seats, members: room.members, rematch: room.rematch };
}

function broadcastState() {
  net.ver++;
  room.members = memberList();
  broadcast(stateMsg());
  render();
}

function systemChat(text) {
  const entry = { system: true, text };
  broadcast({ type: 'chat', entry });
  addChat(entry);
}

function handleAction(id, msg) {
  if (!msg || typeof msg !== 'object') return;
  const guest = net.guests.get(id);
  if (id !== net.myId && !guest) return;
  if (guest && !guest.joined && msg.type !== 'hello') return;
  const seat = room.seats.indexOf(id);

  switch (msg.type) {
    case 'hello': {
      if (!guest || guest.joined) return;
      guest.name = cleanName(msg.name);
      guest.joined = true;
      const empty = room.seats.indexOf(null);
      if (empty >= 0) room.seats[empty] = id;
      systemChat(`${guest.name}さんが入室しました（${empty >= 0 ? SIDE_NAME[empty] + 'に着席' : '観戦'}）`);
      break;
    }
    case 'move': {
      const ok = msg.move && !game.over && bothSeated() && room.seats[game.turn] === id
        && legalMoves(game, game.turn).some(x => sameMove(x, msg.move));
      if (!ok) return;
      applyGameMove(msg.move);
      break;
    }
    case 'resign':
      if (seat < 0 || game.over) return;
      game.over = { winner: 1 - seat, reason: '投了' };
      systemChat(`${hostName(id)}さんが投了しました`);
      break;
    case 'rematch': {
      if (seat < 0 || !game.over || room.rematch[seat]) return;
      room.rematch[seat] = true;
      const allAgreed = [0, 1].every(s => !room.seats[s] || room.rematch[s]);
      if (allAgreed) {
        room.seats = [room.seats[1], room.seats[0]];
        newGame();
        systemChat('先後を入れ替えて新しい対局を始めます');
      } else {
        systemChat(`${hostName(id)}さんが再戦を申し込みました`);
      }
      break;
    }
    case 'sit': {
      const s = msg.side;
      if ((s !== 0 && s !== 1) || room.seats[s]) return;
      if (seat >= 0) room.seats[seat] = null;
      room.seats[s] = id;
      room.rematch = [false, false];
      systemChat(`${hostName(id)}さんが${SIDE_NAME[s]}に着席しました`);
      break;
    }
    case 'stand':
      if (seat < 0) return;
      room.seats[seat] = null;
      room.rematch = [false, false];
      systemChat(`${hostName(id)}さんが席を立ちました`);
      break;
    case 'sync':
      if (guest) guest.conn.send(stateMsg());
      return;
    case 'chat': {
      if (typeof msg.text !== 'string' || !msg.text.trim()) return;
      const entry = { id, name: hostName(id), text: msg.text.trim().slice(0, 200) };
      broadcast({ type: 'chat', entry });
      addChat(entry);
      return;
    }
    default:
      return;
  }
  broadcastState();
}

function onGuestLeave(id) {
  const g = net.guests.get(id);
  if (!g) return;
  net.guests.delete(id);
  if (!g.joined) return;
  const seat = room.seats.indexOf(id);
  if (seat >= 0) {
    room.seats[seat] = null;
    room.rematch = [false, false];
  }
  systemChat(`${g.name}さんが退室しました`);
  broadcastState();
}

// --- ゲスト ---

function joinRoom(input, btnId) {
  if (!requirePeerJs()) return;
  const code = parseRoomCode(input);
  if (!code) {
    lobbyMsg('招待リンクか部屋コードを入力してください。');
    $('join-code').focus();
    return;
  }
  net.destroy();
  const name = myName();
  const peer = new Peer();
  net.peer = peer;
  net.roomCode = code;
  setBusy({ id: btnId, text: '接続中…' });
  lobbyMsg('');

  peer.on('open', id => {
    net.myId = id;
    const c = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    net.conn = c;
    c.on('open', () => {
      net.connected = true;
      c.send({ type: 'hello', name });
    });
    setTimeout(() => {
      if (net.peer !== peer || mode === 'online') return;
      net.destroy();
      setBusy(null);
      lobbyMsg('部屋に接続できませんでした。通信環境（モバイル回線や社内ネットワークなど）によってはつながらないことがあります。別の回線でもお試しください。');
    }, 15000);
    c.on('data', onHostData);
    c.on('close', () => {
      if (net.conn !== c) return;
      net.connected = false;
      if (mode === 'online') {
        addChat({ system: true, text: 'ホストとの接続が切れました（部屋が閉じられた可能性があります）' });
        render();
      }
    });
  });

  peer.on('error', e => {
    if (mode === 'online') return;
    setBusy(null);
    lobbyMsg(e.type === 'peer-unavailable'
      ? '部屋が見つかりませんでした。部屋を作った人がページを閉じていないか確認し、閉じていた場合は部屋を作り直してもらってください。'
      : '接続できませんでした。時間をおいてもう一度お試しください。（' + e.type + '）');
  });
}

function onHostData(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'state': {
      if (typeof msg.ver !== 'number' || msg.ver <= net.ver) return;
      net.ver = msg.ver;
      const changed = !game || game.kifu.length !== msg.game.kifu.length
        || room.seats.join() !== msg.seats.join();
      game = msg.game;
      room.seats = msg.seats;
      room.members = msg.members;
      room.rematch = msg.rematch || [false, false];
      if (changed) selected = null;
      if (mode !== 'online') {
        setBusy(null);
        enterGame('online');
      } else {
        render();
      }
      break;
    }
    case 'chat':
      addChat(msg.entry);
      break;
    case 'full':
      setBusy(null);
      lobbyMsg('この部屋は満員のため参加できませんでした。');
      break;
  }
}

// ===== 画面遷移・ボタン =====

function enterGame(m) {
  mode = m;
  $('lobby').hidden = true;
  $('game').hidden = false;
  render();
}

function backToLobby() {
  if (mode === 'online') {
    const warn = net.isHost
      ? 'あなたは部屋のホストです。退出すると部屋が閉じ、全員の接続が切れます。退出しますか？'
      : (mySeat() >= 0 && !game.over ? '対局中です。退出しますか？' : null);
    if (warn && !confirm(warn)) return;
  }
  net.destroy();
  mode = null;
  game = null;
  room = { seats: [null, null], members: [], rematch: [false, false] };
  $('game').hidden = true;
  $('lobby').hidden = false;
  $('chat-log').innerHTML = '';
  setBusy(null);
  showLobby(null);
}

// 招待リンクから来た人には参加ボタンだけを見せ、部屋作成などの選択肢で迷わせない
function showLobby(invitedCode) {
  $('card-invited').hidden = !invitedCode;
  $('lobby-normal').hidden = !!invitedCode;
  $('invited-code').textContent = invitedCode || '';
  lobbyMsg('');
  if (!invitedCode) history.replaceState(null, '', location.pathname);
}

$('player-name').value = localStorage.getItem('shogi-name') || `ゲスト${Math.floor(Math.random() * 900) + 100}`;

$('btn-local').onclick = () => {
  localFlip = false;
  newGame();
  enterGame('local');
};
$('btn-host').onclick = hostRoom;
$('btn-join').onclick = () => joinRoom($('join-code').value, 'btn-join');
$('join-code').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !$('btn-join').disabled) joinRoom($('join-code').value, 'btn-join');
});
$('btn-accept').onclick = () => joinRoom($('invited-code').textContent, 'btn-accept');
$('link-top').onclick = e => {
  e.preventDefault();
  showLobby(null);
};
$('btn-copy').onclick = () => copyInvite($('btn-copy'));
$('btn-invite-copy').onclick = () => copyInvite($('btn-invite-copy'));
$('btn-invite-share').onclick = () => {
  navigator.share({ title: '将棋で対局しよう', text: '将棋の部屋に招待します', url: inviteUrl() }).catch(() => {});
};
$('invite-url').addEventListener('focus', e => e.target.select());

$('btn-undo').onclick = () => {
  if (mode !== 'local' || !undoStack.length) return;
  game = JSON.parse(undoStack.pop());
  selected = null;
  render();
};
$('btn-flip').onclick = () => {
  localFlip = !localFlip;
  render();
};
$('btn-resign').onclick = () => {
  if (!game || game.over) return;
  if (!confirm('投了しますか？')) return;
  if (mode === 'online') {
    act({ type: 'resign' });
  } else {
    game.over = { winner: 1 - game.turn, reason: '投了' };
    selected = null;
    render();
  }
};
$('btn-rematch').onclick = () => {
  if (mode === 'online') {
    act({ type: 'rematch' });
  } else {
    newGame();
    render();
  }
};
$('btn-lobby').onclick = backToLobby;

$('chat-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text || !net.connected) return;
  act({ type: 'chat', text });
  input.value = '';
});

// スマホでアプリを切り替えている間に届かなかった更新を、戻ってきた時点で取り直す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && mode === 'online' && !net.isHost && net.connected) {
    net.send({ type: 'sync' });
  }
});

const roomParam = parseRoomCode(new URLSearchParams(location.search).get('room') || '');
showLobby(roomParam || null);
$('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter' && roomParam && !$('btn-accept').disabled) $('btn-accept').click();
});
