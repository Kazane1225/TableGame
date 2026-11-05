'use strict';

// 全ゲーム共通のチャット。通信はゲーム側が受け持ち、ここでは表示と入力だけを扱う
// 使う要素: #chat-log, #chat-form, #chat-input。#danmaku があれば盤の上にコメントを流す
// entry: { system: true, text } または { name, text, mine }

const DANMAKU_MS = 6000;
const DANMAKU_KEY = 'chat-danmaku';

// onSend(text) が false を返したら送信できなかったものとして入力欄を残す
function createChat(onSend) {
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const layer = document.getElementById('danmaku');
  const mobile = matchMedia('(max-width: 760px)');

  // lanes[i]: { free: 次のコメントを左端から出せる時刻, end: 今のコメントが右端へ消える時刻 }
  const lanes = [];
  let flowOn = (localStorage.getItem(DANMAKU_KEY) || localStorage.getItem('shogi-danmaku')
    || (mobile.matches ? 'on' : 'off')) === 'on';

  function flow(entry) {
    if (!flowOn || !layer) return;
    const W = layer.clientWidth;
    const H = layer.clientHeight;
    if (!W || !H) return;

    const el = document.createElement('div');
    el.className = 'danmaku-item' + (entry.mine ? ' me' : '');
    el.textContent = entry.text.length > 60 ? entry.text.slice(0, 60) + '…' : entry.text;
    el.style.transform = 'translateX(-100%)';
    layer.appendChild(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight + 4;

    // 前のコメントに重ならず、追い付きもしない段を上から探す。空きがなければ一番早く空く段に出す
    const now = performance.now();
    const laneCount = Math.max(1, Math.floor(H / h));
    const reachEdge = now + DANMAKU_MS * W / (W + w);
    let lane = -1;
    let earliest = 0;
    for (let i = 0; i < laneCount; i++) {
      const l = lanes[i] || { free: 0, end: 0 };
      if (l.free <= now && l.end <= reachEdge) {
        lane = i;
        break;
      }
      if (i === 0 || l.free < (lanes[earliest]?.free ?? 0)) earliest = i;
    }
    if (lane < 0) lane = earliest;

    lanes[lane] = { free: now + DANMAKU_MS * (w + 24) / (W + w), end: now + DANMAKU_MS };
    el.style.top = `${lane * h + 2}px`;
    el.animate(
      [{ transform: `translateX(${-w}px)` }, { transform: `translateX(${W}px)` }],
      { duration: DANMAKU_MS, easing: 'linear' },
    ).onfinish = () => el.remove();
  }

  function clearFlow() {
    if (layer) layer.innerHTML = '';
    lanes.length = 0;
  }

  function add(entry) {
    const div = document.createElement('div');
    if (entry.system) {
      div.className = 'chat-msg system';
      div.textContent = entry.text;
    } else {
      div.className = 'chat-msg ' + (entry.mine ? 'me' : 'opp');
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = entry.name;
      div.append(who, document.createTextNode(entry.text));
      flow(entry);
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || input.disabled) return;
    if (onSend(text) !== false) input.value = '';
  });

  // スマホでは入力欄を画面下に固定している。iOS はキーボードを出すときにページを下まで
  // スクロールしてしまい盤が隠れるので、元の位置に戻し、入力欄のほうをキーボードの上へ動かす
  const vv = window.visualViewport;
  let keepY = null;
  let restoreUntil = 0;
  function followKeyboard() {
    if (keepY === null || !vv) return;
    if (performance.now() < restoreUntil && Math.abs(window.scrollY - keepY) > 1) window.scrollTo(0, keepY);
    const covered = window.innerHeight - vv.height - vv.offsetTop;
    form.style.transform = covered > 0 ? `translateY(${-covered}px)` : '';
  }
  input.addEventListener('focus', () => {
    if (!mobile.matches) return;
    keepY = window.scrollY;
    restoreUntil = performance.now() + 1000;
    followKeyboard();
  });
  input.addEventListener('blur', () => {
    keepY = null;
    form.style.transform = '';
  });
  if (vv) {
    vv.addEventListener('resize', followKeyboard);
    vv.addEventListener('scroll', followKeyboard);
  }
  window.addEventListener('scroll', followKeyboard, { passive: true });

  return {
    add,
    clear() {
      log.innerHTML = '';
      clearFlow();
    },
    setEnabled(on) {
      input.disabled = !on;
    },
    get flowOn() {
      return flowOn;
    },
    toggleFlow() {
      flowOn = !flowOn;
      localStorage.setItem(DANMAKU_KEY, flowOn ? 'on' : 'off');
      if (!flowOn) clearFlow();
    },
  };
}
