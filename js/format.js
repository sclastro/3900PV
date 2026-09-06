/*
 * format.js —— fx-3900PV 顯示格式化
 *
 * 真機顯示為 10 位尾數 + 2 位指數。所有數值先按顯示設定（NORM / FIX / SCI）
 * 折算成顯示字串，再交由 UI 繪出。指數部分獨立回傳，方便右上角小字顯示。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.FXFormat = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DIGITS = 10;            // 尾數位數上限
  var OVERFLOW = 1e100;       // |x| ≥ 1e100 即溢位（指數位只有兩位）

  // NORM 1 於 |x| < 10⁻² 轉指數顯示；NORM 2 於 |x| < 10⁻⁹ 才轉。
  var NORM_THRESHOLD = { 1: 1e-2, 2: 1e-9 };

  function isOverflow(v) {
    return typeof v !== 'number' || !isFinite(v) || Math.abs(v) >= OVERFLOW;
  }

  // 真機整數亦帶小數點（例如「5.」），故只削去尾隨的 0。
  function trimTail(s) {
    if (s.indexOf('.') < 0) { return s + '.'; }
    s = s.replace(/0+$/, '');
    return s;
  }

  function sciParts(a, sig) {
    var s = a.toExponential(Math.max(1, Math.min(sig, DIGITS)) - 1);
    var i = s.indexOf('e');
    return { m: s.slice(0, i), e: parseInt(s.slice(i + 1), 10) };
  }

  function expText(e) {
    var d = Math.abs(e).toString();
    if (d.length < 2) { d = '0' + d; }
    return (e < 0 ? '-' : '') + d;
  }

  // 有效數字（不計前導 0 與小數點）
  function significantLength(text) {
    return text.replace('.', '').replace(/^0+/, '').length;
  }

  function normFormat(a, threshold) {
    if (a === 0) { return { mantissa: '0.', exponent: null }; }
    var p = sciParts(a, DIGITS);
    if (p.e >= DIGITS || a < threshold) {
      return { mantissa: trimTail(p.m), exponent: expText(p.e) };
    }
    var intLen = p.e >= 0 ? p.e + 1 : 1;
    var dec = DIGITS - intLen;
    var t = a.toFixed(dec);
    // 進位可能令整數部分變長（例如 9.9999999996 → 10.000000000），需退一位。
    if (significantLength(t) > DIGITS && dec > 0) {
      t = a.toFixed(dec - 1);
    }
    return { mantissa: trimTail(t), exponent: null };
  }

  function fixFormat(a, n) {
    if (a !== 0 && a >= 1e10) {
      var p = sciParts(a, n + 1);
      return { mantissa: p.m, exponent: expText(p.e) };
    }
    return { mantissa: a.toFixed(n), exponent: null };
  }

  function sciFormat(a, n) {
    var sig = n === 0 ? DIGITS : n;
    if (a === 0) {
      return { mantissa: (0).toFixed(sig - 1), exponent: '00' };
    }
    var p = sciParts(a, sig);
    return { mantissa: p.m, exponent: expText(p.e) };
  }

  /*
   * formatValue(value, disp)
   *   disp = { type: 'NORM'|'FIX'|'SCI', n: 數字 }
   *   NORM 時 n 為 1 或 2；FIX / SCI 時 n 為 0–9。
   * 回傳 { mantissa, exponent, error }
   */
  function formatValue(value, disp) {
    if (isOverflow(value)) {
      return { mantissa: '-E-', exponent: null, error: true };
    }
    var neg = value < 0;
    var a = Math.abs(value);
    var r;
    if (disp && disp.type === 'FIX') { r = fixFormat(a, disp.n); }
    else if (disp && disp.type === 'SCI') { r = sciFormat(a, disp.n); }
    else { r = normFormat(a, NORM_THRESHOLD[(disp && disp.n) === 2 ? 2 : 1]); }

    if (neg && /[1-9]/.test(r.mantissa)) { r.mantissa = '-' + r.mantissa; }
    r.error = false;
    return r;
  }

  // 依顯示設定把內部值四捨五入（[RND] 鍵；FIX/SCI 下方有意義）
  function roundToDisplay(value, disp) {
    var f = formatValue(value, disp);
    if (f.error) { return value; }
    var text = f.mantissa;
    if (f.exponent !== null) { text += 'e' + f.exponent; }
    var n = Number(text.replace(/\.$/, ''));
    return isFinite(n) ? n : value;
  }

  /*
   * [ENG]：工程記數法顯示。數值本身不變，只把指數調成 3 的倍數；
   * step 為按 ENG／SHIFT ENG 的累積次數（每次 ±3）。
   */
  function engFormat(value, step) {
    if (isOverflow(value)) { return { mantissa: '-E-', exponent: null, error: true }; }
    if (value === 0) { return { mantissa: '0.', exponent: '00', error: false }; }
    var a = Math.abs(value);
    var e = Math.floor(Math.log10(a) + 1e-12);
    var e3 = Math.floor(e / 3) * 3 + (step || 0) * 3;
    if (Math.abs(e3) > 99) { return formatValue(value, { type: 'NORM', n: 1 }); }
    var m = a / Math.pow(10, e3);
    var intLen = Math.max(1, Math.floor(Math.log10(m) + 1e-12) + 1);
    var t = m.toFixed(Math.max(0, DIGITS - intLen));
    if (significantLength(t) > DIGITS) { t = m.toFixed(Math.max(0, DIGITS - intLen - 1)); }
    t = trimTail(t);
    if (value < 0) { t = '-' + t; }
    return { mantissa: t, exponent: expText(e3), error: false };
  }

  return {
    DIGITS: DIGITS,
    OVERFLOW: OVERFLOW,
    isOverflow: isOverflow,
    formatValue: formatValue,
    roundToDisplay: roundToDisplay,
    engFormat: engFormat
  };
});
