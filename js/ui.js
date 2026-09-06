/*
 * ui.js —— 介面：由 keypad.js 產生鍵盤、把 engine.js 的顯示狀態畫上 LCD
 *
 * 鍵盤分兩區：函數區 6 欄、數字區 5 欄，故用 30 欄的 grid，各鍵按 row.span 佔格。
 */
(function () {
  'use strict';

  var calc = new window.FXEngine.Calculator();
  var Keypad = window.FXKeypad;

  var el = {
    keypad: document.getElementById('keypad'),
    mantissa: document.getElementById('lcd-mantissa'),
    exponent: document.getElementById('lcd-exponent'),
    lcd: document.getElementById('lcd'),
    log: document.getElementById('key-log'),
    legend: document.getElementById('legend'),
    statInfo: document.getElementById('stat-info'),
    clearLog: document.getElementById('clear-log')
  };

  var INDICATORS = ['shift', 'hyp', 'M', 'K', 'E', 'angle', 'disp', 'mode', 'base', 'paren'];
  var indEl = {};
  INDICATORS.forEach(function (name) {
    indEl[name] = document.getElementById('ind-' + name.toLowerCase());
  });

  var keyEls = {};
  var log = [];

  /* ---------- 鍵盤 ---------- */

  function buildKeypad() {
    Keypad.ROWS.forEach(function (row) {
      row.keys.forEach(function (key) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key key-' + key.kind;
        btn.dataset.id = key.id;
        btn.style.gridColumn = 'span ' + row.span;
        btn.innerHTML = '<span class="key-sub"></span><span class="key-label"></span>' +
                        '<span class="key-foot"></span>';
        btn.addEventListener('click', function () { pressKey(key.id); });
        el.keypad.appendChild(btn);
        keyEls[key.id] = btn;
      });
    });
  }

  function refreshKeyLabels() {
    Keypad.ALL.forEach(function (key) {
      var v = Keypad.view(key, calc.mode);
      var btn = keyEls[key.id];
      btn.querySelector('.key-label').textContent = v.label;
      btn.querySelector('.key-sub').textContent = v.shift || '';
      btn.querySelector('.key-foot').textContent = v.foot || '';
    });
  }

  /* ---------- 顯示 ---------- */

  function render() {
    var d = calc.getDisplay();
    el.lcd.classList.toggle('off', !d.on);
    el.mantissa.textContent = d.mantissa;
    el.exponent.textContent = d.exponent === null ? '' : d.exponent;
    el.mantissa.classList.toggle('long', d.mantissa.length > 13);

    var ind = d.indicators;
    setInd('shift', ind.shift && d.on);
    setInd('hyp', ind.hyp && d.on);
    setInd('M', ind.m && d.on);
    setInd('K', ind.k && d.on);
    setInd('E', ind.error && d.on);
    text('angle', d.on ? ind.angle : '');
    text('disp', d.on && ind.disp ? ind.disp : '');
    text('mode', d.on && ind.mode ? ind.mode : '');
    text('base', d.on && ind.base ? ind.base : '');
    text('paren', d.on && ind.paren ? '(' + ind.paren : '');

    if (ind.note) {
      el.statInfo.textContent = ind.note;
    } else if (ind.pendingKout) {
      el.statInfo.textContent = 'Kout 已按下，請按數字鍵讀取統計值';
    } else if (ind.pendingMode) {
      el.statInfo.textContent = ind.pendingMode === 'mode'
        ? 'MODE 已按下，請按 · 、EXP 或 0–9'
        : '請輸入位數 0–9';
    } else if (calc.mode === 'SD' || calc.mode === 'LR') {
      el.statInfo.textContent = '已輸入資料：' + ind.statCount + ' 組';
    } else {
      el.statInfo.textContent = '';
    }
    refreshKeyLabels();
    renderLegend();
  }

  function setInd(name, on) {
    if (indEl[name]) { indEl[name].classList.toggle('on', !!on); }
  }

  function text(name, s) {
    if (indEl[name]) { indEl[name].textContent = s; }
  }

  /* ---------- 側欄 ---------- */

  var MODE_NOTE = {
    COMP: 'RUN（一般計算）。函數為後置輸入：先按數值，再按 sin、√ 等。',
    SD: '單變數統計。輸入 x [RUN]，帶次數 x [×] 次數 [RUN]。統計值：[Kout] + 數字鍵取鍵下左方括號的值，[SHIFT] + 數字鍵取右方括號的值。',
    LR: '線性迴歸。輸入 x [×] y [RUN]。統計值：[Kout] + 數字鍵（7=A、8=B、9=r），[SHIFT] + 數字鍵取右方括號的值。',
    BASE: 'BASE-N 數制運算（32 位二補數）。[DEC] [HEX] 及其 SHIFT 的 [BIN] [OCT] 切換基數；A–F 在 +/− 至 tan 一行。'
  };

  function renderLegend() {
    var rows = [];
    Keypad.ALL.forEach(function (key) {
      var v = Keypad.view(key, calc.mode);
      if (v.shift) { rows.push('<tr><td>' + v.label + '</td><td>' + v.shift + '</td></tr>'); }
    });
    el.legend.innerHTML =
      '<p class="mode-note">' + MODE_NOTE[calc.mode] + '</p>' +
      '<table><thead><tr><th>鍵</th><th>SHIFT 功能</th></tr></thead><tbody>' +
      rows.join('') + '</tbody></table>';
  }

  function renderLog() {
    el.log.textContent = log.join(' ');
    el.log.scrollTop = el.log.scrollHeight;
  }

  /* ---------- 輸入 ---------- */

  function pressKey(id) {
    var key = Keypad.BY_ID[id];
    if (!key) { return; }
    var v = Keypad.view(key, calc.mode);
    var label = calc.shift && v.shift ? v.shift : v.label;
    if (id !== 'shift') { log.push(label); }
    if (log.length > 300) { log.splice(0, log.length - 300); }
    calc.press(id);
    flash(id);
    render();
    renderLog();
  }

  function flash(id) {
    var btn = keyEls[id];
    if (!btn) { return; }
    btn.classList.add('pressed');
    setTimeout(function () { btn.classList.remove('pressed'); }, 90);
  }

  var KEYMAP = {
    '0': 'd0', '1': 'd1', '2': 'd2', '3': 'd3', '4': 'd4', '5': 'd5',
    '6': 'd6', '7': 'd7', '8': 'd8', '9': 'd9', '.': 'dot',
    '+': 'add', '-': 'sub', '*': 'mul', '/': 'div',
    '=': 'equals', 'Enter': 'equals', '(': 'open', ')': 'close',
    'Escape': 'ac', 'Backspace': 'clear', 'Delete': 'clear',
    's': 'shift', 'S': 'shift', 'm': 'mode', 'M': 'mode'
  };

  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) { return; }
    var id = KEYMAP[ev.key];
    if (!id) { return; }
    ev.preventDefault();
    pressKey(id);
  });

  el.clearLog.addEventListener('click', function () {
    log = [];
    renderLog();
  });

  buildKeypad();
  render();
  renderLog();

  window.fx = calc;   // 方便在主控台示範
})();
