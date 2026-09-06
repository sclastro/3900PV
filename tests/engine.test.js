/*
 * 運算核心測試： node --test tests/
 *
 * 以按鍵序列驅動，貼近真機操作：'S' = SHIFT，數字逐位輸入，
 * 其餘可直接用 keypad.js 的鍵 id（如 sin、mode、dt、d5）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Calculator } = require('../js/engine.js');

function calc() { return new Calculator(); }
function show(seq) { return calc().run(seq); }
function val(seq) { const c = calc(); c.run(seq); return c.value(); }

test('四則運算與運算次序', () => {
  assert.strictEqual(show('2 + 3 ='), '5.');
  assert.strictEqual(show('2 + 3 × 4 ='), '14.');
  assert.strictEqual(show('2 × 3 + 4 ='), '10.');
  assert.strictEqual(show('1 0 - 2 × 3 ='), '4.');
});

test('按下運算子時顯示已收斂的中間結果', () => {
  const c = calc();
  c.run('2 + 3');
  assert.strictEqual(c.run('×'), '3.');    // × 優先於 +，2+3 未收斂
  assert.strictEqual(c.run('4 ='), '14.');

  const d = calc();
  d.run('2 × 3');
  assert.strictEqual(d.run('+'), '6.');    // + 不高於 ×，先算出 6
});

test('連按兩個運算子由後者取代', () => {
  assert.strictEqual(show('2 + × 3 ='), '6.');
});

test('顯示為 10 位有效數字', () => {
  assert.strictEqual(show('1 ÷ 3 ='), '0.333333333');
  assert.strictEqual(show('2 ÷ 3 ='), '0.666666667');
  assert.strictEqual(show('1 0 0 ÷ 3 ='), '33.33333333');
});

test('NORM 1 與 NORM 2 的指數門檻', () => {
  assert.strictEqual(show('1 ÷ 1 0 0 0 ='), '1. ×10^-03');
  assert.strictEqual(show('mode 9 2 1 ÷ 1 0 0 0 ='), '0.001');
  assert.strictEqual(show('1 2 3 4 5 6 7 8 9 0 × 1 0 0 ='), '1.23456789 ×10^11');
});

test('括號', () => {
  assert.strictEqual(show('( 2 + 3 ) × 4 ='), '20.');
  assert.strictEqual(show('2 × ( 3 + ( 4 - 1 ) ) ='), '12.');
  assert.strictEqual(show('( 2 + 3 × ( 4 - 1 ='), '11.');   // = 自動補回括號
});

test('括號最多 6 層', () => {
  const c = calc();
  c.run('( ( ( ( ( ( (');
  assert.strictEqual(c.getDisplay().indicators.paren, 6);
});

test('數字後直接按左括號視為乘（模擬器取捨）', () => {
  assert.strictEqual(show('3 ( 2 + 4 ) ='), '18.');
});

test('百分比', () => {
  assert.strictEqual(show('2 0 0 + 1 0 S ='), '220.');
  assert.strictEqual(show('2 0 0 - 1 0 S ='), '180.');
  assert.strictEqual(show('2 0 0 × 1 0 S ='), '20.');
  assert.strictEqual(show('2 0 ÷ 2 0 0 S ='), '10.');
  assert.strictEqual(show('5 0 S ='), '0.5');
});

test('倒數、平方、開方、階乘、任意次方根', () => {
  assert.strictEqual(show('4 inv'), '0.25');
  assert.strictEqual(show('1 2 sqr'), '144.');
  assert.strictEqual(show('2 5 S sqr'), '5.');
  assert.strictEqual(show('5 S inv'), '120.');
  assert.strictEqual(show('2 pow 1 0 ='), '1024.');
  assert.strictEqual(show('3 S pow 8 ='), '2.');
});

test('三角函數（DEG）', () => {
  assert.strictEqual(show('3 0 sin'), '0.5');
  assert.strictEqual(show('1 8 0 sin'), '0.');
  assert.strictEqual(show('6 0 cos'), '0.5');
  assert.strictEqual(show('4 5 tan'), '1.');
  assert.strictEqual(show('0 . 5 S sin'), '30.');
});

test('RAD 與 GRA', () => {
  assert.strictEqual(show('mode 5 pi ÷ 2 = sin'), '1.');
  assert.strictEqual(show('mode 6 1 0 0 sin'), '1.');
});

test('雙曲函數', () => {
  assert.strictEqual(show('0 hyp cos'), '1.');
  assert.strictEqual(Math.round(val('1 hyp sin') * 1e6) / 1e6, 1.175201);
});

test('對數與指數', () => {
  assert.strictEqual(show('1 0 0 0 log'), '3.');
  assert.strictEqual(show('1 ln'), '0.');
  assert.strictEqual(show('3 S log'), '1000.');
  assert.strictEqual(show('0 S ln'), '1.');
});

test('錯誤狀態只有 AC 或 C 可解除', () => {
  const c = calc();
  c.run('9 0 tan');
  assert.strictEqual(c.text(), '-E-');
  c.run('5');
  assert.strictEqual(c.text(), '-E-');
  c.run('AC');
  assert.strictEqual(c.text(), '0.');
  assert.strictEqual(show('1 ÷ 0 ='), '-E-');
  assert.strictEqual(show('1 sign S sqr'), '-E-');       // √(−1)
});

test('獨立記憶 M 與常數記憶 K', () => {
  const c = calc();
  c.run('5 min 3 mplus');
  assert.strictEqual(c.run('mr'), '8.');
  c.run('2 S mplus');
  assert.strictEqual(c.run('mr'), '6.');
  assert.strictEqual(c.getDisplay().indicators.m, true);

  const d = calc();
  d.run('9 S min');                                      // Kin
  assert.strictEqual(d.run('1 + S mr ='), '10.');        // Kout
  assert.strictEqual(d.getDisplay().indicators.k, true);
});

test('EXP 與正負號', () => {
  assert.strictEqual(show('2 . 5 exp 3 ='), '2500.');
  assert.strictEqual(show('2 exp 3 sign ='), '2. ×10^-03');
  assert.strictEqual(show('5 sign + 2 ='), '-3.');
});

test('FIX、SCI 與 RND', () => {
  assert.strictEqual(show('mode 7 2 1 ÷ 3 ='), '0.33');
  assert.strictEqual(show('mode 8 3 1 2 3 4 ='), '1.23 ×10^03');
  const c = calc();
  c.run('mode 7 2 1 ÷ 3 = S c');                         // RND：內部值亦捨入
  assert.strictEqual(c.value(), 0.33);
});

test('度分秒', () => {
  const c = calc();
  assert.strictEqual(c.run('1 2 dms 3 4 dms 5 6 dms'), '12°34’56”');
  assert.strictEqual(Math.round(c.value() * 1e6) / 1e6, 12.582222);
  assert.strictEqual(show('1 2 . 5 S dms'), '12°30’0”');
});

test('工程記數法 ENG', () => {
  assert.strictEqual(show('1 2 3 4 5 eng'), '12.345 ×10^03');
  assert.strictEqual(show('1 2 3 4 5 eng eng'), '12345. ×10^00');
  assert.strictEqual(show('1 2 3 4 5 eng S eng'), '0.012345 ×10^06');
});

test('極座標與直角座標轉換', () => {
  const c = calc();
  assert.strictEqual(c.run('3 S open 4 ='), '5.');       // Pol(3,4) → r
  assert.strictEqual(c.run('dt'), '53.13010235');        // x↔y → θ
  const d = calc();
  assert.strictEqual(d.run('2 S close 6 0 ='), '1.');    // Rec(2,60°) → x
  assert.strictEqual(d.run('dt'), '1.732050808');
});

test('SD 模式：n、Σx、平均數、標準差', () => {
  const c = calc();
  c.run('mode 1 1 0 dt 2 0 dt 3 0 dt');
  assert.strictEqual(c.run('S d1'), '3.');               // n
  assert.strictEqual(c.run('S d2'), '60.');              // Σx
  assert.strictEqual(c.run('S d3'), '1400.');            // Σx²
  assert.strictEqual(c.run('S d4'), '20.');              // x̄
  assert.strictEqual(c.run('S d5'), '8.164965809');      // xσn
  assert.strictEqual(c.run('S d6'), '10.');              // xσn−1
});

test('SD 模式：帶次數輸入的兩種方式', () => {
  const a = calc();
  a.run('mode 1 5 × 3 dt 1 0 dt');
  assert.strictEqual(a.run('S d1'), '4.');
  assert.strictEqual(a.run('S d4'), '6.25');

  const b = calc();
  b.run('mode 1 5 S close 3 dt 1 0 dt');
  assert.strictEqual(b.run('S d1'), '4.');
  assert.strictEqual(b.run('S d4'), '6.25');
});

test('SD 模式：刪除上一筆與清除全部', () => {
  const c = calc();
  c.run('mode 1 1 0 dt 2 0 dt 9 9 9 dt');
  c.run('S mr');                                         // DEL
  assert.strictEqual(c.run('S d1'), '2.');
  c.run('S dt');                                         // CL
  assert.strictEqual(c.run('S d1'), '0.');
});

test('LR 模式：迴歸係數與估計值', () => {
  const c = calc();
  c.run('mode 2 1 S close 2 dt 2 S close 4 dt 3 S close 6 dt');
  assert.strictEqual(c.run('S d1'), '3.');               // n
  assert.strictEqual(c.run('S d7'), '0.');               // A
  assert.strictEqual(c.run('S d8'), '2.');               // B
  assert.strictEqual(c.run('S d9'), '1.');               // r
  assert.strictEqual(c.run('1 0 S sqr'), '20.');         // ŷ(10)
  assert.strictEqual(c.run('2 0 S inv'), '10.');         // x̂(20)
  assert.strictEqual(c.run('S exp'), '28.');             // Σxy
});

test('BASE 模式：數制轉換', () => {
  const c = calc();
  c.run('mode 3 2 5 5');
  assert.strictEqual(c.run('S sqr'), 'FF');              // → HEX
  assert.strictEqual(c.run('S pow'), '11111111');        // → BIN
  assert.strictEqual(c.run('S log'), '377');             // → OCT
  assert.strictEqual(c.run('S inv'), '255');             // → DEC
});

test('BASE 模式：負數以 32 位二補數顯示', () => {
  const c = calc();
  c.run('mode 3 1 sign');
  assert.strictEqual(c.run('S sqr'), 'FFFFFFFF');
});

test('BASE 模式：邏輯運算與整數除法', () => {
  const c = calc();
  c.run('mode 3 S sqr');                                 // 轉 HEX
  assert.strictEqual(c.run('sin 0 S sin 3 pow ='), '30');  // F0 and 3C
  assert.strictEqual(c.run('S inv 7 ÷ 2 ='), '3');       // 轉 DEC，整數除法截尾
});

test('關機與開機', () => {
  const c = calc();
  c.run('5 + 3 =');
  c.press('shift');
  c.press('ac');                                         // SHIFT AC = OFF
  assert.strictEqual(c.getDisplay().on, false);
  c.press('ac');
  assert.strictEqual(c.text(), '0.');
});
