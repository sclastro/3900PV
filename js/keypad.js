/*
 * keypad.js —— 鍵盤佈局與各模式下的鍵義
 *
 * 每個鍵有主功能（action）與 SHIFT 功能（shiftAction）；部分鍵在 SD／LR／BASE
 * 模式下另有定義，放在 modes 內覆寫。引擎只認 action 字串，UI 只認 label，
 * 兩者靠本檔連繫。
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
      kind: 'fn', modes: null
    };
    if (extra) { for (var p in extra) { key[p] = extra[p]; } }
    return key;
  }

  var ROWS = [
    [
      k('shift', 'SHIFT', 'shift', null, null, { kind: 'shift' }),
      k('mode', 'MODE', 'mode'),
      k('pi', 'π', 'pi', 'RAN#', 'random', {
        modes: { BASE: { shift: 'Neg', shiftAction: 'neg' } }
      }),
      k('min', 'Min', 'min', 'Kin', 'kin'),
      k('mr', 'MR', 'mr', 'Kout', 'kout', {
        modes: {
          SD: { shift: 'DEL', shiftAction: 'statdel' },
          LR: { shift: 'DEL', shiftAction: 'statdel' }
        }
      })
    ],
    [
      k('inv', 'x⁻¹', 'inv', 'x!', 'fact', {
        modes: {
          LR: { shift: 'x̂', shiftAction: 'stat:xhat' },
          BASE: { label: 'A', action: 'hex:A', shift: 'DEC', shiftAction: 'base:DEC' }
        }
      }),
      k('sqr', 'x²', 'sqr', '√', 'sqrt', {
        modes: {
          LR: { shift: 'ŷ', shiftAction: 'stat:yhat' },
          BASE: { label: 'B', action: 'hex:B', shift: 'HEX', shiftAction: 'base:HEX' }
        }
      }),
      k('pow', 'xʸ', 'pow', 'ˣ√y', 'xroot', {
        modes: { BASE: { label: 'C', action: 'hex:C', shift: 'BIN', shiftAction: 'base:BIN' } }
      }),
      k('log', 'log', 'log', '10ˣ', 'pow10', {
        modes: {
          LR: { shift: 'ȳ', shiftAction: 'stat:meany' },
          BASE: { label: 'D', action: 'hex:D', shift: 'OCT', shiftAction: 'base:OCT' }
        }
      }),
      k('ln', 'ln', 'ln', 'eˣ', 'expe', {
        modes: {
          LR: { shift: 'yσn', shiftAction: 'stat:sdyn' },
          BASE: { label: 'E', action: 'hex:E', shift: null, shiftAction: null }
        }
      })
    ],
    [
      k('sin', 'sin', 'sin', 'sin⁻¹', 'asin', {
        modes: {
          LR: { shift: 'yσn-1', shiftAction: 'stat:sdyn1' },
          BASE: { label: 'F', action: 'hex:F', shift: 'and', shiftAction: 'and' }
        }
      }),
      k('cos', 'cos', 'cos', 'cos⁻¹', 'acos', {
        modes: { BASE: { shift: 'or', shiftAction: 'or' } }
      }),
      k('tan', 'tan', 'tan', 'tan⁻¹', 'atan', {
        modes: { BASE: { shift: 'xor', shiftAction: 'xor' } }
      }),
      k('hyp', 'hyp', 'hyp', 'hyp⁻¹', 'ahyp', {
        modes: { BASE: { shift: 'xnor', shiftAction: 'xnor' } }
      }),
      k('dms', '°’”', 'dms', '←', 'todms', {
        modes: { BASE: { shift: 'Not', shiftAction: 'not' } }
      })
    ],
    [
      k('open', '(', 'open', 'Pol(', 'pol'),
      k('close', ')', 'close', 'Rec(', 'rec', {
        modes: {
          SD: { shift: ',', shiftAction: 'comma' },
          LR: { shift: ',', shiftAction: 'comma' }
        }
      }),
      k('eng', 'ENG', 'eng', 'ENG→', 'engback'),
      k('dt', 'x↔y', 'swap', null, null, {
        modes: {
          SD: { label: 'DT', action: 'dt', shift: 'CL', shiftAction: 'statclear' },
          LR: { label: 'DT', action: 'dt', shift: 'CL', shiftAction: 'statclear' }
        }
      }),
      k('mplus', 'M+', 'mplus', 'M−', 'mminus')
    ],
    [
      k('d7', '7', 'digit:7', null, null, { kind: 'num', modes: {
        SD: { shift: 'n', shiftAction: 'stat:n' },
        LR: { shift: 'A', shiftAction: 'stat:A' }
      } }),
      k('d8', '8', 'digit:8', null, null, { kind: 'num', modes: {
        SD: { shift: 'Σx', shiftAction: 'stat:sumx' },
        LR: { shift: 'B', shiftAction: 'stat:B' }
      } }),
      k('d9', '9', 'digit:9', null, null, { kind: 'num', modes: {
        SD: { shift: 'Σx²', shiftAction: 'stat:sumx2' },
        LR: { shift: 'r', shiftAction: 'stat:r' }
      } }),
      k('ac', 'AC', 'ac', 'OFF', 'off', { kind: 'ac' }),
      k('c', 'C', 'clear', 'RND', 'rnd', { kind: 'ac' })
    ],
    [
      k('d4', '4', 'digit:4', null, null, { kind: 'num', modes: {
        SD: { shift: 'x̄', shiftAction: 'stat:meanx' },
        LR: { shift: 'x̄', shiftAction: 'stat:meanx' }
      } }),
      k('d5', '5', 'digit:5', null, null, { kind: 'num', modes: {
        SD: { shift: 'xσn', shiftAction: 'stat:sdxn' },
        LR: { shift: 'xσn', shiftAction: 'stat:sdxn' }
      } }),
      k('d6', '6', 'digit:6', null, null, { kind: 'num', modes: {
        SD: { shift: 'xσn-1', shiftAction: 'stat:sdxn1' },
        LR: { shift: 'xσn-1', shiftAction: 'stat:sdxn1' }
      } }),
      k('mul', '×', 'mul', null, null, { kind: 'op' }),
      k('div', '÷', 'div', null, null, { kind: 'op' })
    ],
    [
      k('d1', '1', 'digit:1', null, null, { kind: 'num', modes: {
        SD: { shift: 'n', shiftAction: 'stat:n' },
        LR: { shift: 'n', shiftAction: 'stat:n' }
      } }),
      k('d2', '2', 'digit:2', null, null, { kind: 'num', modes: {
        SD: { shift: 'Σx', shiftAction: 'stat:sumx' },
        LR: { shift: 'Σx', shiftAction: 'stat:sumx' }
      } }),
      k('d3', '3', 'digit:3', null, null, { kind: 'num', modes: {
        SD: { shift: 'Σx²', shiftAction: 'stat:sumx2' },
        LR: { shift: 'Σx²', shiftAction: 'stat:sumx2' }
      } }),
      k('add', '+', 'add', null, null, { kind: 'op' }),
      k('sub', '−', 'sub', null, null, { kind: 'op' })
    ],
    [
      k('d0', '0', 'digit:0', null, null, { kind: 'num', modes: {
        LR: { shift: 'Σy', shiftAction: 'stat:sumy' }
      } }),
      k('dot', '·', 'point', null, null, { kind: 'num', modes: {
        LR: { shift: 'Σy²', shiftAction: 'stat:sumy2' }
      } }),
      k('exp', 'EXP', 'exp', null, null, { kind: 'num', modes: {
        LR: { shift: 'Σxy', shiftAction: 'stat:sumxy' }
      } }),
      k('sign', '+/−', 'sign', null, null, { kind: 'num' }),
      k('equals', '=', 'equals', '%', 'percent', { kind: 'eq' })
    ]
  ];

  var BY_ID = {};
  ROWS.forEach(function (row) {
    row.forEach(function (key) { BY_ID[key.id] = key; });
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

  // 解析按鍵：回傳實際要執行的 action（null 表示該鍵在此狀態下無定義）
  function resolve(id, mode, shifted) {
    var key = BY_ID[id];
    if (!key) { return null; }
    var v = view(key, mode);
    return shifted ? v.shiftAction : v.action;
  }

  return { ROWS: ROWS, BY_ID: BY_ID, view: view, resolve: resolve };
});
