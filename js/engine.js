/*
 * engine.js —— fx-3600Pv 運算核心（不觸碰 DOM，可獨立在 Node 下測試）
 *
 * 設計要點：
 *   1. 即時執行（immediate execution）＋ 真正代數優先次序：按下運算子時會先
 *      收斂優先次序不低於它的待處理運算，並把中間結果顯示出來，與真機一致。
 *   2. 函數鍵為後置輸入：先按數值，再按 sin、x² 等。此為 VPAM 之前機種的做法。
 *   3. 內部保留 12 位有效數字，顯示 10 位；此為 Casio 同期機種的規格。
 *   4. 括號最多 6 層。
 */
(function (root, factory) {
  'use strict';
  var isNode = (typeof module === 'object' && module.exports);
  var Format = isNode ? require('./format.js') : root.FXFormat;
  var Keypad = isNode ? require('./keypad.js') : root.FXKeypad;
  var api = factory(Format, Keypad);
  if (isNode) { module.exports = api; } else { root.FXEngine = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Format, Keypad) {
  'use strict';

  var MAX_PAREN = 6;
  var INTERNAL_DIGITS = 12;

  /* ---------- 數學小工具 ---------- */

  // 抹去浮點雜訊，模擬真機 12 位內部精度
  function clean(v) {
    if (!isFinite(v) || v === 0) { return v; }
    return Number(v.toPrecision(INTERNAL_DIGITS));
  }

  function mod(a, m) { return ((a % m) + m) % m; }

  // 以「度」為單位的三角函數：整數倍角回傳精確值，避免 sin 180° 出現 1e-16
  function sinDeg(d) {
    var m = mod(d, 360);
    if (m === 0 || m === 180) { return 0; }
    if (m === 90) { return 1; }
    if (m === 270) { return -1; }
    return Math.sin(m * Math.PI / 180);
  }
  function cosDeg(d) { return sinDeg(d + 90); }
  function tanDeg(d) {
    var m = mod(d, 180);
    if (m === 90) { return NaN; }      // 真機顯示錯誤
    if (m === 0) { return 0; }
    return sinDeg(m) / cosDeg(m);
  }

  function nthRoot(v, n) {
    if (n === 0) { return NaN; }
    if (v < 0) {
      if (Math.abs(n % 2) !== 1) { return NaN; }
      return -Math.pow(-v, 1 / n);
    }
    return Math.pow(v, 1 / n);
  }

  function factorial(v) {
    if (v < 0 || v !== Math.floor(v) || v > 69) { return NaN; }
    var r = 1;
    for (var i = 2; i <= v; i++) { r *= i; }
    return r;
  }

  // nPr = a!/(a-b)!，逐項相乘以免中途溢位
  function permutation(a, b) {
    if (a < 0 || b < 0 || a !== Math.floor(a) || b !== Math.floor(b) || b > a) { return NaN; }
    var r = 1;
    for (var i = 0; i < b; i++) { r *= (a - i); }
    return r;
  }

  // 找出 v 的分數表示（分母上限 maxDen），找不到回傳 null
  function toFraction(v, maxDen) {
    if (!isFinite(v) || Math.abs(v) >= 1e10) { return null; }
    var neg = v < 0;
    var a = Math.abs(v);
    for (var den = 1; den <= maxDen; den++) {
      var num = a * den;
      var rounded = Math.round(num);
      if (Math.abs(num - rounded) < 1e-9 * Math.max(1, num)) {
        return { neg: neg, num: rounded, den: den };
      }
    }
    return null;
  }

  /*
   * 分數顯示：真機以「⌐」分隔整數、分子、分母，總位數超過 10 位即改回小數。
   * improper 為真時顯示假分數（[d/c] 切換）。
   */
  function fracText(v, improper) {
    var f = toFraction(v, 9999);
    if (!f || f.den === 1) { return null; }
    var whole = 0;
    var num = f.num;
    if (!improper) {
      whole = Math.floor(num / f.den);
      num -= whole * f.den;
    }
    var digits = String(whole || '').length + String(num).length + String(f.den).length;
    if (digits > 10) { return null; }
    return (f.neg ? '-' : '') + (whole ? whole + '⌐' : '') + num + '⌐' + f.den;
  }

  function toInt32(v) {
    if (!isFinite(v)) { return NaN; }
    return Math.trunc(v) | 0;
  }

  /* ---------- 運算子 ---------- */

  var OPS = {
    add:   { p: 1, bp: 3, f: function (a, b) { return a + b; } },
    sub:   { p: 1, bp: 3, f: function (a, b) { return a - b; } },
    mul:   { p: 2, bp: 4, f: function (a, b) { return a * b; } },
    div:   { p: 2, bp: 4, f: function (a, b) { return b === 0 ? NaN : a / b; } },
    pow:   { p: 3, bp: 4, f: function (a, b) { return Math.pow(a, b); } },
    xroot: { p: 3, bp: 4, f: function (a, b) { return nthRoot(b, a); } },
    pol:   { p: 3, bp: 4, dual: true },
    rec:   { p: 3, bp: 4, dual: true },
    and:   { p: 1, bp: 2, f: function (a, b) { return a & b; } },
    or:    { p: 1, bp: 1, f: function (a, b) { return a | b; } },
    xor:   { p: 1, bp: 1, f: function (a, b) { return a ^ b; } },
    xnor:  { p: 1, bp: 1, f: function (a, b) { return ~(a ^ b); } },
    npr:   { p: 3, bp: 4, f: function (a, b) { return permutation(a, b); } },
    ncr:   { p: 3, bp: 4, f: function (a, b) { return permutation(a, b) / factorial(b); } }
  };

  var BASE_RADIX = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };

  /* ---------- 輸入緩衝 ---------- */

  function newEntry() {
    return { digits: '0', point: false, neg: false, exp: null, expNeg: false, parts: null };
  }

  function entryDigitCount(e) {
    return e.digits.replace('.', '').replace(/^0+/, '').length;
  }

  function entryValue(e) {
    if (e.parts && e.parts.length) {
      var nums = e.parts.concat([e.digits]).map(Number);
      var v = nums.length === 2
        ? (nums[1] === 0 ? NaN : nums[0] / nums[1])
        : (nums[2] === 0 ? NaN : nums[0] + nums[1] / nums[2]);
      return e.neg ? -v : v;
    }
    var t = (e.neg ? '-' : '') + e.digits;
    if (e.exp !== null) {
      t += 'e' + (e.expNeg ? '-' : '') + (e.exp === '' ? '0' : e.exp);
    }
    var v = Number(t);
    return isFinite(v) ? v : NaN;
  }

  function entryText(e) {
    if (e.parts && e.parts.length) {
      return (e.neg ? '-' : '') + e.parts.join('⌐') + '⌐' + e.digits;
    }
    var t = e.digits;
    if (!e.point) { t += '.'; }
    return (e.neg ? '-' : '') + t;
  }

  /* ---------- 計算機 ---------- */

  function Calculator() {
    this.reset();
  }

  Calculator.prototype.reset = function () {
    this.on = true;
    this.mode = 'COMP';
    this.angle = 'DEG';
    this.disp = { type: 'NORM', n: 1 };
    this.base = 'DEC';
    this.memM = 0;
    this.memK = null;
    this.statData = [];
    this.shift = false;
    this.hypPending = false;
    this.pendingMode = null;
    this.pendingKout = false;
    this.fracImproper = false;
    this.note = null;
    this.clearAll();
  };

  // [AC]：清除算式與顯示，但保留記憶、模式與統計資料
  Calculator.prototype.clearAll = function () {
    this.frames = [{ stack: [] }];
    this.entry = null;
    this.x = 0;
    this.yValue = 0;
    this.opPending = true;
    this.error = false;
    this.override = null;
    this.engStep = 0;
    this.engActive = false;
    this.commaBuf = [];
    this.dmsBuf = [];
    this.hypPending = false;
    this.pendingKout = false;
    this.fracUsed = false;
  };

  Calculator.prototype.top = function () { return this.frames[this.frames.length - 1]; };

  Calculator.prototype.prec = function (op) {
    return this.mode === 'BASE' ? OPS[op].bp : OPS[op].p;
  };

  // 輸入緩衝的數值；BASE 模式下按目前基數解讀
  Calculator.prototype.currentValue = function () {
    if (!this.entry) { return this.x; }
    if (this.mode === 'BASE') {
      return toInt32(parseInt(this.entry.digits, BASE_RADIX[this.base]));
    }
    return entryValue(this.entry);
  };

  // 取出目前輸入值並關閉輸入緩衝（含度分秒未完成的輸入）
  Calculator.prototype.commitEntry = function () {
    var hasEntry = !!this.entry;
    var v = this.currentValue();
    if (this.dmsBuf.length) {
      var parts = this.dmsBuf.slice();
      if (hasEntry) { parts.push(v); }
      v = combineDms(parts);
      this.dmsBuf = [];
    }
    this.entry = null;
    return v;
  };

  Calculator.prototype.setValue = function (v) {
    this.entry = null;
    this.override = null;
    this.engStep = 0;
    this.engActive = false;
    if (this.mode === 'BASE') {
      v = toInt32(v);
      if (isNaN(v)) { this.error = true; this.x = 0; return; }
      this.x = v;
      return;
    }
    v = clean(v);
    if (typeof v !== 'number' || isNaN(v) || !isFinite(v) || Math.abs(v) >= Format.OVERFLOW) {
      this.error = true;
      this.x = 0;
      return;
    }
    this.x = v;
  };

  Calculator.prototype.compute = function (op, a, b) {
    var spec = OPS[op];
    if (op === 'pol') {
      var r = Math.sqrt(a * a + b * b);
      this.yValue = this.fromRad(Math.atan2(b, a));
      return r;
    }
    if (op === 'rec') {
      var th = this.toRad(b);
      this.yValue = clean(a * Math.sin(th));
      return clean(a * Math.cos(th));
    }
    var v = spec.f(a, b);
    return this.mode === 'BASE' ? toInt32(v) : clean(v);
  };

  Calculator.prototype.foldFrame = function (frame, v) {
    while (frame.stack.length) {
      var t = frame.stack.pop();
      v = this.compute(t.op, t.value, v);
    }
    return v;
  };

  /* ---------- 角度 ---------- */

  Calculator.prototype.toRad = function (v) {
    if (this.angle === 'RAD') { return v; }
    if (this.angle === 'GRA') { return v * Math.PI / 200; }
    return v * Math.PI / 180;
  };

  Calculator.prototype.fromRad = function (v) {
    if (this.angle === 'RAD') { return clean(v); }
    if (this.angle === 'GRA') { return clean(v * 200 / Math.PI); }
    return clean(v * 180 / Math.PI);
  };

  // 以目前角度單位計算三角函數
  Calculator.prototype.trig = function (name, v) {
    if (this.angle === 'RAD') {
      if (name === 'tan' && Math.abs(mod(v / Math.PI, 1) - 0.5) < 1e-12) { return NaN; }
      return clean(Math[name](v));
    }
    var d = this.angle === 'GRA' ? v * 0.9 : v;
    if (name === 'sin') { return clean(sinDeg(d)); }
    if (name === 'cos') { return clean(cosDeg(d)); }
    return clean(tanDeg(d));
  };

  /* ---------- 度分秒 ---------- */

  function combineDms(parts) {
    var sign = parts[0] < 0 ? -1 : 1;
    var v = 0;
    for (var i = 0; i < parts.length && i < 3; i++) {
      v += Math.abs(parts[i]) / Math.pow(60, i);
    }
    return clean(sign * v);
  }

  function dmsText(v) {
    var sign = v < 0 ? '-' : '';
    var a = Math.abs(v);
    var d = Math.floor(a);
    var rem = (a - d) * 60;
    var m = Math.floor(rem + 1e-9);
    var s = (rem - m) * 60;
    if (s >= 59.999999995) { s = 0; m += 1; }
    if (m >= 60) { m -= 60; d += 1; }
    var st = Number(s.toFixed(4)).toString();
    return sign + d + '°' + m + '’' + st + '”';
  }

  /* ---------- 統計 ---------- */

  Calculator.prototype.stats = function () {
    var n = 0, sx = 0, sx2 = 0, sy = 0, sy2 = 0, sxy = 0;
    this.statData.forEach(function (d) {
      n += d.f;
      sx += d.f * d.x;
      sx2 += d.f * d.x * d.x;
      sy += d.f * d.y;
      sy2 += d.f * d.y * d.y;
      sxy += d.f * d.x * d.y;
    });
    return { n: n, sx: sx, sx2: sx2, sy: sy, sy2: sy2, sxy: sxy };
  };

  Calculator.prototype.statValue = function (name, arg) {
    var s = this.stats();
    var n = s.n;
    if (name === 'n') { return n; }
    if (name === 'sumx') { return s.sx; }
    if (name === 'sumx2') { return s.sx2; }
    if (name === 'sumy') { return s.sy; }
    if (name === 'sumy2') { return s.sy2; }
    if (name === 'sumxy') { return s.sxy; }
    if (n === 0) { return NaN; }
    var mx = s.sx / n, my = s.sy / n;
    var sxx = s.sx2 - n * mx * mx;
    var syy = s.sy2 - n * my * my;
    var sxy = s.sxy - n * mx * my;
    switch (name) {
      case 'meanx': return mx;
      case 'meany': return my;
      case 'sdxn': return Math.sqrt(Math.max(0, sxx) / n);
      case 'sdxn1': return n > 1 ? Math.sqrt(Math.max(0, sxx) / (n - 1)) : NaN;
      case 'sdyn': return Math.sqrt(Math.max(0, syy) / n);
      case 'sdyn1': return n > 1 ? Math.sqrt(Math.max(0, syy) / (n - 1)) : NaN;
      case 'B': return sxx === 0 ? NaN : sxy / sxx;
      case 'A': return sxx === 0 ? NaN : my - (sxy / sxx) * mx;
      case 'r': return (sxx === 0 || syy === 0) ? NaN : sxy / Math.sqrt(sxx * syy);
      case 'xhat': {
        var b1 = sxx === 0 ? NaN : sxy / sxx;
        var a1 = my - b1 * mx;
        return b1 === 0 ? NaN : (arg - a1) / b1;
      }
      case 'yhat': {
        var b2 = sxx === 0 ? NaN : sxy / sxx;
        var a2 = my - b2 * mx;
        return a2 + b2 * arg;
      }
      default: return NaN;
    }
  };

  /* ---------- 按鍵 ---------- */

  Calculator.prototype.press = function (id) {
    var wasShift = this.shift;
    this.note = null;
    if (id !== 'shift' && wasShift) { this.shift = false; }
    // [Kout] 之後直接按數字鍵：在 SD／LR 讀取該鍵左方括號的統計變數
    if (this.pendingKout && !wasShift && id !== 'shift') {
      this.pendingKout = false;
      var name = Keypad.KOUT_STAT[id];
      if (name && (this.mode === 'SD' || this.mode === 'LR')) {
        this.statRecall(name);
        return this.getDisplay();
      }
    }
    var action = Keypad.resolve(id, this.mode, wasShift);
    if (action) { this.exec(action); }
    return this.getDisplay();
  };

  Calculator.prototype.exec = function (action) {
    // 關機狀態下只認 [AC]（兼作 ON）
    if (!this.on) {
      if (action === 'ac') { this.on = true; this.clearAll(); }
      return;
    }
    // 錯誤狀態下只認 [AC]／[C]／[SHIFT]
    if (this.error && action !== 'ac' && action !== 'clear' && action !== 'shift') {
      return;
    }
    // MODE 之後等待數字選擇
    if (this.pendingMode) {
      if (action.indexOf('digit:') === 0) {
        this.modeSelect(parseInt(action.slice(6), 10));
        return;
      }
      if (this.pendingMode === 'mode' && action === 'point') {   // MODE · = RUN
        this.pendingMode = null;
        this.mode = 'COMP';
        this.clearAll();
        return;
      }
      if (this.pendingMode === 'mode' && action === 'exp') {     // MODE EXP = LRN
        this.pendingMode = null;
        this.note = '本模擬器未實作程式輸入模式（LRN）';
        return;
      }
      if (action !== 'shift') { this.pendingMode = null; }
    }

    if (action.indexOf('digit:') === 0) { this.inputDigit(action.slice(6)); return; }
    if (action.indexOf('hex:') === 0) { this.inputDigit(action.slice(4)); return; }
    if (action.indexOf('base:') === 0) {
      if (this.mode !== 'BASE') { this.note = 'DEC／HEX／BIN／OCT 只在 BASE-N 模式（MODE 0）有效'; return; }
      this.changeBase(action.slice(5));
      return;
    }
    if (action.indexOf('stat:') === 0) { this.statRecall(action.slice(5)); return; }
    if (action.indexOf('prog:') === 0) {
      this.note = '本模擬器未實作程式功能（' + action.slice(5) + '）';
      return;
    }
    if (OPS[action] && action !== 'pol' && action !== 'rec') { this.applyOperator(action); return; }

    switch (action) {
      case 'shift': this.shift = !this.shift; break;
      case 'mode': this.pendingMode = 'mode'; break;
      case 'ac': this.clearAll(); break;
      case 'clear': this.error = false; this.entry = null; this.x = 0; this.override = null; break;
      case 'point': this.inputPoint(); break;
      case 'exp': this.inputExp(); break;
      case 'sign': this.inputSign(); break;
      case 'equals': this.equals(); break;
      case 'open': this.openParen(); break;
      case 'close': this.closeParen(); break;
      case 'percent': this.percent(); break;
      case 'comma': this.commaBuf.push(this.commitEntry()); break;
      case 'pi': this.setValue(Math.PI); this.opPending = false; break;
      case 'random': this.setValue(Math.floor(Math.random() * 1000) / 1000); this.opPending = false; break;
      case 'pol': case 'rec': this.applyOperator(action); break;
      case 'swap': this.swapXY(); break;
      case 'hyp': this.hypPending = true; break;
      case 'ahyp': this.hypPending = 'inv'; break;
      case 'sin': case 'cos': case 'tan': this.trigKey(action); break;
      case 'asin': case 'acos': case 'atan': this.arcTrigKey(action); break;
      case 'log': this.unary(function (v) { return v > 0 ? Math.log10(v) : NaN; }); break;
      case 'ln': this.unary(function (v) { return v > 0 ? Math.log(v) : NaN; }); break;
      case 'pow10': this.unary(function (v) { return Math.pow(10, v); }); break;
      case 'expe': this.unary(function (v) { return Math.exp(v); }); break;
      case 'sqr': this.unary(function (v) { return v * v; }); break;
      case 'sqrt': this.unary(function (v) { return v < 0 ? NaN : Math.sqrt(v); }); break;
      case 'inv': this.unary(function (v) { return v === 0 ? NaN : 1 / v; }); break;
      case 'fact': this.unary(factorial); break;
      case 'not': this.unary(function (v) { return ~toInt32(v); }); break;
      case 'neg': this.unary(function (v) { return -toInt32(v); }); break;
      case 'min': this.memM = this.commitEntry(); this.setValue(this.memM); break;
      case 'mr': this.setValue(this.memM); this.opPending = false; break;
      case 'mplus': this.memoryAdd(1); break;
      case 'mminus': this.memoryAdd(-1); break;
      case 'kin': this.memK = this.commitEntry(); this.setValue(this.memK); break;
      case 'dms': this.dmsKey(); break;
      case 'todms': this.override = { mantissa: dmsText(this.commitEntry()), exponent: null }; break;
      case 'eng': this.engKey(-1); break;
      case 'engback': this.engKey(1); break;
      case 'rnd': this.setValue(Format.roundToDisplay(this.commitEntry(), this.disp)); break;
      case 'dt': this.dataInput(); break;
      case 'statclear': this.statData = []; this.commaBuf = []; break;
      case 'statdel': this.statData.pop(); break;
      case 'kout': this.koutKey(); break;
      case 'swapk': this.swapXK(); break;
      case 'kac': this.memK = null; this.statData = []; this.commaBuf = []; break;
      case 'frac': this.fracKey(); break;
      case 'improper': this.fracImproper = !this.fracImproper; break;
      case 'cbrt': this.unary(function (v) { return nthRoot(v, 3); }); break;
      case 'npr': case 'ncr': this.applyOperator(action); break;
      default: break;
    }
  };

  // 轉換基數前先把輸入緩衝按舊基數收妥，數值不變、只換顯示方式
  Calculator.prototype.changeBase = function (base) {
    var v = this.commitEntry();
    this.base = base;
    this.setValue(v);
    this.opPending = false;
  };

  Calculator.prototype.modeSelect = function (d) {
    var state = this.pendingMode;
    this.pendingMode = null;
    if (state === 'fix') { this.disp = { type: 'FIX', n: d }; return; }
    if (state === 'sci') { this.disp = { type: 'SCI', n: d }; return; }
    if (state === 'norm') { this.disp = { type: 'NORM', n: d === 2 ? 2 : 1 }; return; }
    switch (d) {
      case 0: this.mode = 'BASE'; this.base = 'DEC'; this.clearAll(); this.x = 0; break;
      case 1: this.note = '本模擬器未實作積分運算（∫dx）'; break;
      case 2: this.mode = 'LR'; this.statData = []; this.clearAll(); break;
      case 3: this.mode = 'SD'; this.statData = []; this.clearAll(); break;
      case 4: this.angle = 'DEG'; break;
      case 5: this.angle = 'RAD'; break;
      case 6: this.angle = 'GRA'; break;
      case 7: this.pendingMode = 'fix'; break;
      case 8: this.pendingMode = 'sci'; break;
      case 9: this.pendingMode = 'norm'; break;
      default: break;
    }
  };

  /* ---------- 數值輸入 ---------- */

  Calculator.prototype.startEntry = function () {
    if (!this.entry) {
      if (!this.opPending && this.frames.length === 1 && !this.frames[0].stack.length) {
        this.fracUsed = false;      // 上一條算式已完結，重新開始
      }
      this.entry = newEntry();
      this.override = null;
      this.engActive = false;
    }
    this.opPending = false;
  };

  Calculator.prototype.inputDigit = function (ch) {
    if (this.mode === 'BASE') {
      var radix = BASE_RADIX[this.base];
      var val = parseInt(ch, 16);
      if (isNaN(val) || val >= radix) { return; }
      this.startEntry();
      var e = this.entry;
      if (e.digits === '0') { e.digits = ch; } else if (e.digits.length < 32) { e.digits += ch; }
      return;
    }
    this.startEntry();
    var en = this.entry;
    if (en.exp !== null) {
      if (en.exp.length < 2) { en.exp += ch; } else { en.exp = en.exp.slice(1) + ch; }
      return;
    }
    if (entryDigitCount(en) >= Format.DIGITS) { return; }
    if (en.digits === '0' && !en.point) { en.digits = ch; } else { en.digits += ch; }
  };

  Calculator.prototype.inputPoint = function () {
    if (this.mode === 'BASE') { return; }
    this.startEntry();
    if (this.entry.exp === null && !this.entry.point) {
      this.entry.digits += '.';
      this.entry.point = true;
    }
  };

  Calculator.prototype.inputExp = function () {
    if (this.mode === 'BASE') { return; }
    var fresh = !this.entry;
    this.startEntry();
    if (fresh) { this.entry.digits = '1'; }
    if (this.entry.exp === null) { this.entry.exp = ''; }
  };

  Calculator.prototype.inputSign = function () {
    if (this.mode === 'BASE') { this.setValue(-this.commitEntry()); return; }
    if (!this.entry) { this.setValue(-this.commitEntry()); this.opPending = false; return; }
    if (this.entry.exp !== null) { this.entry.expNeg = !this.entry.expNeg; }
    else { this.entry.neg = !this.entry.neg; }
  };

  /* ---------- 運算流程 ---------- */

  Calculator.prototype.applyOperator = function (op) {
    var frame = this.top();
    if (this.opPending && frame.stack.length) {
      // 連按兩個運算子：後者取代前者
      frame.stack[frame.stack.length - 1].op = op;
      return;
    }
    var v = this.commitEntry();
    var acc = v;
    while (frame.stack.length && this.prec(frame.stack[frame.stack.length - 1].op) >= this.prec(op)) {
      var t = frame.stack.pop();
      acc = this.compute(t.op, t.value, acc);
    }
    frame.stack.push({ value: acc, op: op });
    this.setValue(acc);
    this.opPending = true;
  };

  Calculator.prototype.equals = function () {
    var v = this.commitEntry();
    while (this.frames.length > 1) {
      v = this.foldFrame(this.frames.pop(), v);
    }
    v = this.foldFrame(this.frames[0], v);
    this.frames = [{ stack: [] }];
    this.setValue(v);
    this.opPending = false;
  };

  Calculator.prototype.openParen = function () {
    if (!this.opPending) { this.applyOperator('mul'); }   // 數字後直接按「(」視為乘
    if (this.frames.length > MAX_PAREN) { return; }
    this.frames.push({ stack: [] });
    this.entry = null;
    this.x = 0;
    this.override = null;
    this.opPending = true;
  };

  Calculator.prototype.closeParen = function () {
    if (this.frames.length === 1) { return; }
    var v = this.commitEntry();
    v = this.foldFrame(this.frames.pop(), v);
    this.setValue(v);
    this.opPending = false;
  };

  Calculator.prototype.percent = function () {
    var v = this.commitEntry();
    var frame = this.top();
    var t = frame.stack[frame.stack.length - 1];
    var r;
    if (!t) {
      r = v / 100;
    } else {
      frame.stack.pop();
      switch (t.op) {
        case 'add': r = t.value + t.value * v / 100; break;
        case 'sub': r = t.value - t.value * v / 100; break;
        case 'mul': r = t.value * v / 100; break;
        case 'div': r = v === 0 ? NaN : t.value / v * 100; break;
        default: r = v / 100; break;
      }
      r = this.foldFrame(frame, r);
    }
    this.frames = [{ stack: [] }];
    this.setValue(r);
    this.opPending = false;
  };

  Calculator.prototype.unary = function (fn) {
    var v = this.commitEntry();
    this.setValue(fn(v));
    this.opPending = false;
  };

  Calculator.prototype.trigKey = function (name) {
    var self = this;
    var h = this.hypPending;
    this.hypPending = false;
    if (h === true) {
      this.unary(function (v) {
        return clean(name === 'sin' ? Math.sinh(v) : name === 'cos' ? Math.cosh(v) : Math.tanh(v));
      });
      return;
    }
    if (h === 'inv') {
      this.unary(function (v) {
        if (name === 'sin') { return clean(Math.asinh(v)); }
        if (name === 'cos') { return v < 1 ? NaN : clean(Math.acosh(v)); }
        return Math.abs(v) >= 1 ? NaN : clean(Math.atanh(v));
      });
      return;
    }
    this.unary(function (v) { return self.trig(name, v); });
  };

  Calculator.prototype.arcTrigKey = function (name) {
    var self = this;
    var h = this.hypPending;
    this.hypPending = false;
    if (h) {
      // [hyp] 之後按 sin⁻¹ 等鍵即雙曲反函數
      this.hypPending = 'inv';
      this.trigKey(name.slice(1));
      return;
    }
    this.unary(function (v) {
      if (name === 'asin') { return Math.abs(v) > 1 ? NaN : self.fromRad(Math.asin(v)); }
      if (name === 'acos') { return Math.abs(v) > 1 ? NaN : self.fromRad(Math.acos(v)); }
      return self.fromRad(Math.atan(v));
    });
  };

  /*
   * [Kout]：在 COMP／BASE 讀回常數記憶 K；在 SD／LR 則等待下一個數字鍵，
   * 以讀取該鍵下方左方括號的統計變數（x̄、xσn、A、B、r 等）。
   */
  Calculator.prototype.koutKey = function () {
    if (this.mode === 'SD' || this.mode === 'LR') {
      this.pendingKout = true;
      return;
    }
    this.setValue(this.memK === null ? 0 : this.memK);
    this.opPending = false;
  };

  // [SHIFT][Kout] X↔K：顯示值與常數記憶互換
  Calculator.prototype.swapXK = function () {
    var v = this.commitEntry();
    this.setValue(this.memK === null ? 0 : this.memK);
    this.memK = v;
    this.opPending = false;
  };

  /*
   * [a b/c]：輸入中則加一個分隔（整數⌐分子⌐分母）；沒有輸入中則把目前結果
   * 在分數與小數之間切換。
   */
  Calculator.prototype.fracKey = function () {
    if (this.mode === 'BASE') { return; }
    if (!this.entry) {
      if (this.fracUsed) { this.fracUsed = false; }
      else if (fracText(this.x, this.fracImproper)) { this.fracUsed = true; }
      else { this.note = '此數值無法以分數顯示'; }
      return;
    }
    var e = this.entry;
    if (!e.parts) { e.parts = []; }
    if (e.parts.length >= 2 || e.point || e.exp !== null) { return; }
    e.parts.push(e.digits);
    e.digits = '0';
    this.fracUsed = true;
  };

  Calculator.prototype.swapXY = function () {
    var v = this.commitEntry();
    this.setValue(this.yValue);
    this.yValue = v;
    this.opPending = false;
  };

  Calculator.prototype.memoryAdd = function (sign) {
    this.equals();
    if (this.error) { return; }
    this.memM = clean(this.memM + sign * this.x);
  };

  Calculator.prototype.dmsKey = function () {
    if (this.dmsBuf.length >= 3) { return; }
    var v = this.entry ? entryValue(this.entry) : this.x;
    this.dmsBuf.push(v);
    this.entry = null;
    if (this.dmsBuf.length === 3) {
      var total = combineDms(this.dmsBuf);
      this.dmsBuf = [];
      this.setValue(total);
      this.override = { mantissa: dmsText(total), exponent: null };
      this.opPending = false;
    } else {
      this.override = { mantissa: this.dmsBuf.map(function (p) { return p + '°'; }).join(''), exponent: null };
    }
  };

  /*
   * [ENG]：首按化為工程記數法（指數為 3 的倍數）；再按每次把小數點右移三位、
   * 指數減 3，[SHIFT][ENG→] 則反向。數值本身不變。
   */
  Calculator.prototype.engKey = function (dir) {
    var v = this.commitEntry();
    if (!this.engActive) { this.engStep = 0; this.engActive = true; }
    else { this.engStep += dir; }
    this.x = v;
    this.override = Format.engFormat(v, this.engStep);
    this.opPending = false;
  };

  /* ---------- 統計輸入 ---------- */

  Calculator.prototype.dataInput = function () {
    if (this.mode !== 'SD' && this.mode !== 'LR') { return; }
    var v = this.commitEntry();
    var vals = this.commaBuf.concat([v]);
    this.commaBuf = [];
    var frame = this.top();
    var t = frame.stack[frame.stack.length - 1];
    var x, y = 0, f = 1;
    if (this.mode === 'SD') {
      // x [DATA]，或 x [×] 次數 [DATA]
      if (vals.length >= 2) { x = vals[0]; f = vals[1]; }
      else if (t && t.op === 'mul') { frame.stack.pop(); x = t.value; f = v; }
      else { x = v; }
    } else {
      // x [×] y [DATA]
      if (t && t.op === 'mul') { frame.stack.pop(); x = t.value; y = v; }
      else if (vals.length >= 2) { x = vals[0]; y = vals[1]; }
      else { x = v; y = 0; this.note = 'LR 模式應輸入 x [×] y [DATA]'; }
    }
    if (!isFinite(x) || !isFinite(y) || !isFinite(f) || f <= 0) { this.error = true; return; }
    this.statData.push({ x: x, y: y, f: f });
    this.setValue(this.mode === 'SD' ? x : y);
    this.opPending = false;
  };

  Calculator.prototype.statRecall = function (name) {
    var arg = (name === 'xhat' || name === 'yhat') ? this.commitEntry() : 0;
    this.setValue(this.statValue(name, arg));
    this.opPending = false;
  };

  /* ---------- 顯示 ---------- */

  Calculator.prototype.baseText = function (v) {
    var u = v >>> 0;
    switch (this.base) {
      case 'HEX': return u.toString(16).toUpperCase();
      case 'OCT': return u.toString(8);
      case 'BIN': return u.toString(2);
      default: return String(v);
    }
  };

  Calculator.prototype.getDisplay = function () {
    var ind = {
      shift: this.shift,
      hyp: !!this.hypPending,
      m: this.memM !== 0,
      k: this.memK !== null,
      error: this.error,
      angle: this.angle,
      disp: this.disp.type === 'NORM' ? null : this.disp.type + this.disp.n,
      mode: this.mode === 'COMP' ? null : this.mode,
      base: this.mode === 'BASE' ? this.base : null,
      paren: this.frames.length - 1,
      pendingMode: this.pendingMode,
      pendingKout: this.pendingKout,
      note: this.note,
      statCount: this.statData.length
    };
    if (!this.on) { return { on: false, mantissa: '', exponent: null, indicators: ind }; }
    if (this.error) { return { on: true, mantissa: '-E-', exponent: null, indicators: ind }; }

    if (this.entry) {
      if (this.mode === 'BASE') {
        return { on: true, mantissa: this.entry.digits, exponent: null, indicators: ind };
      }
      var ex = null;
      if (this.entry.exp !== null) {
        ex = (this.entry.expNeg ? '-' : '') + (this.entry.exp === '' ? '00' : this.entry.exp);
      }
      return { on: true, mantissa: entryText(this.entry), exponent: ex, indicators: ind };
    }
    if (this.override) {
      return { on: true, mantissa: this.override.mantissa, exponent: this.override.exponent, indicators: ind };
    }
    if (this.mode === 'BASE') {
      return { on: true, mantissa: this.baseText(this.x), exponent: null, indicators: ind };
    }
    if (this.fracUsed) {
      var ft = fracText(this.x, this.fracImproper);
      if (ft) { return { on: true, mantissa: ft, exponent: null, indicators: ind }; }
    }
    var f = Format.formatValue(this.x, this.disp);
    return { on: true, mantissa: f.mantissa, exponent: f.exponent, indicators: ind };
  };

  // 顯示字串（測試與記錄用）
  Calculator.prototype.text = function () {
    var d = this.getDisplay();
    return d.mantissa + (d.exponent !== null ? ' ×10^' + d.exponent : '');
  };

  Calculator.prototype.value = function () { return this.x; };

  /* ---------- 測試／文件用的簡易輸入器 ---------- */

  var TOKENS = {
    '0': 'd0', '1': 'd1', '2': 'd2', '3': 'd3', '4': 'd4',
    '5': 'd5', '6': 'd6', '7': 'd7', '8': 'd8', '9': 'd9',
    '+': 'add', '-': 'sub', '−': 'sub', '*': 'mul', '×': 'mul',
    '/': 'div', '÷': 'div', '=': 'equals', '(': 'open', ')': 'close',
    '.': 'dot', 'AC': 'ac', 'S': 'shift', 'DATA': 'run', 'DT': 'run'
  };

  // run('2 + 3 =')、run('S sin') —— 以空白分隔的鍵序列
  Calculator.prototype.run = function (seq) {
    var self = this;
    String(seq).trim().split(/\s+/).forEach(function (tok) {
      if (!tok) { return; }
      var id = Keypad.BY_ID[tok] ? tok : TOKENS[tok];
      if (!id) { throw new Error('未知按鍵：' + tok); }
      self.press(id);
    });
    return this.text();
  };

  return {
    Calculator: Calculator,
    helpers: { clean: clean, dmsText: dmsText, combineDms: combineDms, factorial: factorial, nthRoot: nthRoot }
  };
});
