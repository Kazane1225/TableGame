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
let mySide = 0;

function newGame() {
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

function viewSide() {
  return mode === 'online' ? mySide : (localFlip ? 1 : 0);
}

function canControl(side) {
  if (!game || game.over) return false;
  if (mode === 'local') return true;
  return side === mySide && net.connected;
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
  applyGameMove(clean);
  if (mode === 'online') net.send({ type: 'move', move: clean, ply: game.kifu.length });
  render();
}

function askPromotion(p) {
  return new Promise(resolve => {
    const modal = document.getElementById('promo');
    const yes = document.getElementById('promo-yes');
    const no = document.getElementById('promo-no');
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

  const online = mode === 'online';
  $('btn-undo').hidden = online;
  $('btn-undo').disabled = !undoStack.length || !!game.over;
  $('btn-flip').hidden = online;
  $('btn-resign').disabled = !!game.over || (online && !net.connected);
  $('btn-rematch').hidden = !game.over;
  $('btn-rematch').disabled = online && !net.connected;
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
  const who = o => MARK[o] + SIDE_NAME[o];
  let text;
  if (game.over) {
    const { winner, reason } = game.over;
    text = `${who(winner)}の勝ち（${reason}）`;
    if (mode === 'online') text += winner === mySide ? ' — あなたの勝ちです！' : ' — あなたの負けです';
  } else if (mode === 'online' && !net.connected) {
    text = '相手との接続が切れました';
  } else {
    if (mode === 'online') {
      text = `あなたは${who(mySide)} ／ ` + (game.turn === mySide ? 'あなたの番です' : '相手の番です');
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

// ===== 通信（PeerJS） =====

const PEER_PREFIX = 'shogi-1v1-gh-';
const net = {
  peer: null,
  conn: null,
  connected: false,
  isHost: false,
  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  },
  destroy() {
    if (this.peer) this.peer.destroy();
    this.peer = this.conn = null;
    this.connected = false;
    this.isHost = false;
  },
};

function randomCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function lobbyMsg(text) {
  $('lobby-msg').textContent = text;
}

function requirePeerJs() {
  if (typeof Peer === 'undefined') {
    lobbyMsg('通信ライブラリを読み込めませんでした。ネット接続を確認してください。');
    return false;
  }
  return true;
}

function hostRoom() {
  if (!requirePeerJs()) return;
  net.destroy();
  net.isHost = true;
  const code = randomCode();
  const peer = new Peer(PEER_PREFIX + code);
  net.peer = peer;
  $('btn-host').disabled = true;
  lobbyMsg('部屋を作成中…');

  peer.on('open', () => {
    const url = `${location.origin}${location.pathname}?room=${code}`;
    $('invite').hidden = false;
    $('invite-url').value = url;
    $('room-code').textContent = code;
    $('host-status').textContent = '相手の参加を待っています…';
    lobbyMsg('');
  });

  peer.on('connection', c => {
    if (net.conn && net.conn.open) {
      c.on('open', () => {
        c.send({ type: 'full' });
        setTimeout(() => c.close(), 500);
      });
      return;
    }
    setupConn(c, () => {
      const pref = $('side-pref').value;
      mySide = pref === 'sente' ? 0 : pref === 'gote' ? 1 : (Math.random() < 0.5 ? 0 : 1);
      startOnlineGame();
    });
  });

  peer.on('error', e => {
    if (e.type === 'unavailable-id') {
      hostRoom();
      return;
    }
    $('btn-host').disabled = false;
    lobbyMsg('通信エラー: ' + e.type);
  });
}

function joinRoom(code) {
  if (!requirePeerJs()) return;
  code = code.trim().toLowerCase();
  if (!code) return;
  net.destroy();
  const peer = new Peer();
  net.peer = peer;
  lobbyMsg('接続中…');

  peer.on('open', () => {
    setupConn(peer.connect(PEER_PREFIX + code, { reliable: true }), () => {
      lobbyMsg('接続しました。対局開始を待っています…');
    });
  });

  peer.on('error', e => {
    lobbyMsg(e.type === 'peer-unavailable'
      ? '部屋が見つかりません。コードを確認するか、相手に部屋を作り直してもらってください。'
      : '通信エラー: ' + e.type);
  });
}

function setupConn(c, onOpen) {
  net.conn = c;
  c.on('open', () => {
    net.connected = true;
    onOpen();
  });
  c.on('data', onData);
  c.on('close', () => {
    if (net.conn !== c) return;
    net.connected = false;
    if (mode === 'online') render();
  });
}

// ホストだけが対局開始を決め、ゲストへ手番を通知する
function startOnlineGame() {
  newGame();
  net.send({ type: 'start', side: 1 - mySide });
  enterGame('online');
}

function onData(msg) {
  switch (msg.type) {
    case 'start':
      mySide = msg.side;
      newGame();
      enterGame('online');
      break;
    case 'move': {
      if (!game || game.over || game.turn === mySide) return;
      const m = legalMoves(game, game.turn).find(x => sameMove(x, msg.move));
      if (!m) {
        console.warn('不正な手を受信しました', msg.move);
        return;
      }
      applyGameMove(msg.move);
      render();
      break;
    }
    case 'resign':
      if (game && !game.over) {
        game.over = { winner: mySide, reason: '投了' };
        render();
      }
      break;
    case 'rematch':
      if (net.isHost) {
        mySide = 1 - mySide;
        startOnlineGame();
      }
      break;
    case 'full':
      lobbyMsg('この部屋はすでに対局中です。');
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
  if (mode === 'online' && game && !game.over && !confirm('対局を終了してロビーに戻りますか？')) return;
  net.destroy();
  mode = null;
  game = null;
  $('game').hidden = true;
  $('lobby').hidden = false;
  $('invite').hidden = true;
  $('btn-host').disabled = false;
  lobbyMsg('');
  history.replaceState(null, '', location.pathname);
}

$('btn-local').onclick = () => {
  localFlip = false;
  newGame();
  enterGame('local');
};
$('btn-host').onclick = hostRoom;
$('btn-join').onclick = () => joinRoom($('join-code').value);
$('join-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinRoom($('join-code').value);
});
$('btn-copy').onclick = async () => {
  const input = $('invite-url');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  $('btn-copy').textContent = 'コピーしました';
  setTimeout(() => ($('btn-copy').textContent = 'コピー'), 1500);
};

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
  const loser = mode === 'online' ? mySide : game.turn;
  game.over = { winner: 1 - loser, reason: '投了' };
  selected = null;
  if (mode === 'online') net.send({ type: 'resign' });
  render();
};
$('btn-rematch').onclick = () => {
  if (mode === 'local') {
    newGame();
    render();
  } else if (net.isHost) {
    mySide = 1 - mySide;
    startOnlineGame();
  } else {
    net.send({ type: 'rematch' });
    $('status').textContent = '再戦を申し込みました…';
  }
};
$('btn-lobby').onclick = backToLobby;

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  $('join-code').value = roomParam;
  joinRoom(roomParam);
}
