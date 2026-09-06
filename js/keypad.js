/*
 * keypad.js —— fx-3600Pv 鍵盤佈局
 *
 * 依實機照片重建：上半函數區 6 欄 × 4 行，下半數字區 5 欄 × 4 行。
 * 每鍵三組標籤：
 *   label —— 鍵面主功能
 *   shift —— 鍵上方橙字（SHIFT 功能）
 *   foot  —— 鍵下方小字（BASE-N 的 A–F 與邏輯運算，或統計變數的方括號標籤）
 * SD／LR／BASE 模式下的鍵義差異放在 modes 內覆寫。
 *
 * 統計變數的讀取方式：Kout + 數字鍵取左方括號的值，SHIFT + 數字鍵取右方括號的值。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.FXKeypad = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function k(id, label, action, shift, shiftAction, extra) {
    var key = {
      id: id, label: label, action: action,
      shift: shift || null, shiftAction: shiftAction || null,
      foot: null, kind: 'fn', modes: null
    };
    if (extra) { for (var p in extra) { key[p] = extra[p]; } }
    return key;
  }

  // 統計變數在 SD／LR 下的鍵面小字與 SHIFT 功能
  function stat(footL, footR, shiftLabel, shiftAction) {
    return {
      foot: footR ? '⌊' + footL + '⌋⌊' + footR + '⌋' : '⌊' + footL + '⌋',
      shift: shiftLabel || null,
      shiftAction: shiftAction || null
    };
  }

  var ROWS = [
    // ---- 函數區：6 欄 ----
    { span: 5, keys: [
      k('shift', 'SHIFT', 'shift', null, null, { kind: 'shift' }),
      k('dec', 'DEC', 'base:DEC', 'BIN', 'base:BIN'),
      k('hex', 'HEX', 'base:HEX', 'OCT', 'base:OCT'),
      k('p1', 'P1', 'prog:P1'),
      k('p2', 'P2', 'prog:P2'),
      k('mode', 'MODE', 'mode', 'PCL', 'prog:PCL', { kind: 'mode' })
    ] },
    { span: 5, keys: [
      k('abc', 'a b/c', 'frac', 'd/c', 'improper'),
      k('eng', 'ENG', 'eng', '←', 'engback', {
        foot: 'NOT',
        modes: { BASE: { shift: 'NOT', shiftAction: 'not' } }
      }),
      k('sqrt', '√', 'sqrt', 'x²', 'sqr', {
        foot: 'AND',
        modes: { BASE: { shift: 'AND', shiftAction: 'and' } }
      }),
      k('log', 'log', 'log', '10ˣ', 'pow10', {
        foot: 'OR',
        modes: { BASE: { shift: 'OR', shiftAction: 'or' } }
      }),
      k('ln', 'ln', 'ln', 'eˣ', 'expe', {
        foot: 'XOR',
        modes: { BASE: { shift: 'XOR', shiftAction: 'xor' } }
      }),
      k('pow', 'xʸ', 'pow', 'x¹ᐟʸ', 'xroot', {
        foot: 'XNOR',
        modes: { BASE: { shift: 'XNOR', shiftAction: 'xnor' } }
      })
    ] },
    // BASE-N 的十六進 A–F 剛好佔滿這一行
    { span: 5, keys: [
      k('sign', '+/−', 'sign', '∛', 'cbrt', {
        foot: 'A  NEG',
        modes: { BASE: { label: 'A', action: 'hex:A', shift: 'NEG', shiftAction: 'neg' } }
      }),
      k('dms', '°’”', 'dms', '←', 'todms', {
        foot: 'B',
        modes: { BASE: { label: 'B', action: 'hex:B', shift: null, shiftAction: null } }
      }),
      k('hyp', 'hyp', 'hyp', 'hyp⁻¹', 'ahyp', {
        foot: 'C',
        modes: { BASE: { label: 'C', action: 'hex:C', shift: null, shiftAction: null } }
      }),
      k('sin', 'sin', 'sin', 'sin⁻¹', 'asin', {
        foot: 'D',
        modes: { BASE: { label: 'D', action: 'hex:D', shift: null, shiftAction: null } }
      }),
      k('cos', 'cos', 'cos', 'cos⁻¹', 'acos', {
        foot: 'E',
        modes: { BASE: { label: 'E', action: 'hex:E', shift: null, shiftAction: null } }
      }),
      k('tan', 'tan', 'tan', 'tan⁻¹', 'atan', {
        foot: 'F',
        modes: { BASE: { label: 'F', action: 'hex:F', shift: null, shiftAction: null } }
      })
    ] },
    { span: 5, keys: [
      k('open', '[(', 'open', '1/x', 'inv'),
      k('close', ')]', 'close', 'x!', 'fact', {
        modes: {
          SD: { foot: '⌊ŷ⌋⌊x̂⌋' },
          LR: { foot: '⌊ŷ⌋⌊x̂⌋', shift: 'x̂', shiftAction: 'stat:xhat' }
        }
      }),
      k('kin', 'Kin', 'kin', 'X↔Y', 'swap'),
      k('kout', 'Kout', 'kout', 'X↔K', 'swapk'),
      k('mr', 'MR', 'mr', 'Min', 'min'),
      k('mplus', 'M+', 'mplus', 'M−', 'mminus')
    ] },
    // ---- 數字區：5 欄 ----
    { span: 6, keys: [
      k('d7', '7', 'digit:7', 'x>0', 'prog:x>0', { kind: 'num', modes: {
        SD: stat('A', null, null, null), LR: stat('A', null, null, null)
      } }),
      k('d8', '8', 'digit:8', 'x≥M', 'prog:x≥M', { kind: 'num', modes: {
        SD: stat('B', null, null, null), LR: stat('B', null, null, null)
      } }),
      k('d9', '9', 'digit:9', 'RTN', 'prog:RTN', { kind: 'num', modes: {
        SD: stat('r', null, null, null), LR: stat('r', null, null, null)
      } }),
      k('c', 'C', 'clear', null, null, { kind: 'ac' }),
      k('ac', 'AC', 'ac', 'KAC', 'kac', { kind: 'ac' })
    ] },
    { span: 6, keys: [
      k('d4', '4', 'digit:4', null, null, { kind: 'num', modes: {
        SD: stat('ȳ', 'Σy²', 'Σy²', 'stat:sumy2'),
        LR: stat('ȳ', 'Σy²', 'Σy²', 'stat:sumy2')
      } }),
      k('d5', '5', 'digit:5', null, null, { kind: 'num', modes: {
        SD: stat('yσn', 'Σy', 'Σy', 'stat:sumy'),
        LR: stat('yσn', 'Σy', 'Σy', 'stat:sumy')
      } }),
      k('d6', '6', 'digit:6', null, null, { kind: 'num', modes: {
        SD: stat('yσn-1', 'Σxy', 'Σxy', 'stat:sumxy'),
        LR: stat('yσn-1', 'Σxy', 'Σxy', 'stat:sumxy')
      } }),
      k('mul', '×', 'mul', 'nPr', 'npr', { kind: 'op' }),
      k('div', '÷', 'div', 'nCr', 'ncr', { kind: 'op' })
    ] },
    { span: 6, keys: [
      k('d1', '1', 'digit:1', null, null, { kind: 'num', modes: {
        SD: stat('x̄', 'Σx²', 'Σx²', 'stat:sumx2'),
        LR: stat('x̄', 'Σx²', 'Σx²', 'stat:sumx2')
      } }),
      k('d2', '2', 'digit:2', null, null, { kind: 'num', modes: {
        SD: stat('xσn', 'Σx', 'Σx', 'stat:sumx'),
        LR: stat('xσn', 'Σx', 'Σx', 'stat:sumx')
      } }),
      k('d3', '3', 'digit:3', null, null, { kind: 'num', modes: {
        SD: stat('xσn-1', 'n', 'n', 'stat:n'),
        LR: stat('xσn-1', 'n', 'n', 'stat:n')
      } }),
      k('add', '+', 'add', 'R→P', 'pol', { kind: 'op' }),
      k('sub', '−', 'sub', 'P→R', 'rec', { kind: 'op' })
    ] },
    { span: 6, keys: [
      k('d0', '0', 'digit:0', 'RND', 'rnd', { kind: 'num' }),
      k('dot', '·', 'point', 'RAN#', 'random', { kind: 'num' }),
      k('exp', 'EXP', 'exp', 'π', 'pi', { kind: 'num' }),
      k('equals', '=', 'equals', '%', 'percent', { kind: 'eq' }),
      k('run', 'RUN', 'prog:RUN', 'ENT', 'prog:ENT', { kind: 'run', modes: {
        SD: { label: 'RUN', action: 'dt', foot: 'DATA', shift: 'DEL', shiftAction: 'statdel' },
        LR: { label: 'RUN', action: 'dt', foot: 'DATA', shift: 'DEL', shiftAction: 'statdel' }
      } })
    ] }
  ];

  // Kout + 數字鍵讀取的統計變數（左方括號）
  var KOUT_STAT = {
    d1: 'meanx', d2: 'sdxn', d3: 'sdxn1',
    d4: 'meany', d5: 'sdyn', d6: 'sdyn1',
    d7: 'A', d8: 'B', d9: 'r',
    close: 'yhat'
  };

  var BY_ID = {};
  var ALL = [];
  ROWS.forEach(function (row) {
    row.keys.forEach(function (key) { BY_ID[key.id] = key; ALL.push(key); });
  });

  // 取得某鍵在指定模式下的實際定義（已套用模式覆寫）
  function view(key, mode) {
    var o = key.modes && key.modes[mode];
    if (!o) { return key; }
    var merged = {};
    for (var p in key) { merged[p] = key[p]; }
    for (var q in o) { merged[q] = o[q]; }
    return merged;
  }

  function resolve(id, mode, shifted) {
    var key = BY_ID[id];
    if (!key) { return null; }
    var v = view(key, mode);
    return shifted ? v.shiftAction : v.action;
  }

  return {
    ROWS: ROWS, BY_ID: BY_ID, ALL: ALL, KOUT_STAT: KOUT_STAT,
    view: view, resolve: resolve
  };
});
