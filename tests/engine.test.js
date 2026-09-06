/*
 * 運算核心測試： node --test tests/*.test.js
 *
 * 以按鍵序列驅動，貼近真機操作：'S' = SHIFT，數字逐位輸入，
 * 其餘可直接用 keypad.js 的鍵 id（如 sin、mode、run、kout、d5）。
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

test('MODE 9：NORM 1 與 NORM 2 的指數門檻', () => {
  assert.strictEqual(show('1 ÷ 1 0 0 0 ='), '1. ×10^-03');
  assert.strictEqual(show('mode 9 2 1 ÷ 1 0 0 0 ='), '0.001');
  assert.strictEqual(show('1 2 3 4 5 6 7 8 9 0 × 1 0 0 ='), '1.23456789 ×10^11');
});

test('括號（[( 與 )]）', () => {
  assert.strictEqual(show('( 2 + 3 ) × 4 ='), '20.');
  assert.strictEqual(show('2 × ( 3 + ( 4 - 1 ) ) ='), '12.');
  assert.strictEqual(show('( 2 + 3 × ( 4 - 1 ='), '11.');   // = 自動補回括號
  const c = calc();
  c.run('( ( ( ( ( ( (');
  assert.strictEqual(c.getDisplay().indicators.paren, 6);   // 最多 6 層
});

test('百分比（SHIFT =）', () => {
  assert.strictEqual(show('2 0 0 + 1 0 S ='), '220.');
  assert.strictEqual(show('2 0 0 - 1 0 S ='), '180.');
  assert.strictEqual(show('2 0 0 × 1 0 S ='), '20.');
  assert.strictEqual(show('2 0 ÷ 2 0 0 S ='), '10.');
  assert.strictEqual(show('5 0 S ='), '0.5');
});

test('倒數、平方、開方、立方根、階乘、任意次方根', () => {
  assert.strictEqual(show('4 S ('), '0.25');          // SHIFT [( = 1/x
  assert.strictEqual(show('1 2 S sqrt'), '144.');     // SHIFT √ = x²
  assert.strictEqual(show('2 5 sqrt'), '5.');
  assert.strictEqual(show('2 7 S sign'), '3.');       // SHIFT +/− = ∛
  assert.strictEqual(show('5 S )'), '120.');          // SHIFT )] = x!
  assert.strictEqual(show('2 pow 1 0 ='), '1024.');
  assert.strictEqual(show('3 S pow 8 ='), '2.');      // 3ˣ√8
});

test('排列與組合（SHIFT × 與 SHIFT ÷）', () => {
  assert.strictEqual(show('5 S × 3 ='), '60.');
  assert.strictEqual(show('5 S ÷ 3 ='), '10.');
});

test('三角函數（DEG）', () => {
  assert.strictEqual(show('3 0 sin'), '0.5');
  assert.strictEqual(show('1 8 0 sin'), '0.');
  assert.strictEqual(show('6 0 cos'), '0.5');
  assert.strictEqual(show('4 5 tan'), '1.');
  assert.strictEqual(show('0 . 5 S sin'), '30.');
});

test('MODE 5／6：RAD 與 GRA', () => {
  assert.strictEqual(show('mode 5 S exp ÷ 2 = sin'), '1.');   // SHIFT EXP = π
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
  assert.strictEqual(show('1 sign sqrt'), '-E-');       // √(−1)
});

test('分數 a b/c', () => {
  assert.strictEqual(show('1 abc 2 + 1 abc 3 ='), '5⌐6');
  assert.strictEqual(show('3 abc 1 abc 2 + 1 abc 2 ='), '4⌐0⌐1'.replace('4⌐0⌐1', '4.'));
  assert.strictEqual(show('2 abc 3 × 3 ='), '2.');
  assert.strictEqual(show('1 abc 2 + 1 abc 3 = S abc'), '5⌐6');   // d/c 假分數：5/6 本已是真分數
  assert.strictEqual(show('1 abc 2 + 1 abc 3 = abc'), '0.833333333');  // 再按 a b/c 轉小數
  assert.strictEqual(show('7 abc 4 ='), '1⌐3⌐4');
  assert.strictEqual(show('7 abc 4 = S abc'), '7⌐4');             // 帶分數 ↔ 假分數
});

test('記憶 M 與常數記憶 K', () => {
  const c = calc();
  c.run('5 S mr 3 mplus');                              // SHIFT MR = Min
  assert.strictEqual(c.run('mr'), '8.');
  c.run('2 S mplus');
  assert.strictEqual(c.run('mr'), '6.');
  assert.strictEqual(c.getDisplay().indicators.m, true);

  const d = calc();
  d.run('9 kin');
  assert.strictEqual(d.run('1 + kout ='), '10.');
  assert.strictEqual(d.getDisplay().indicators.k, true);
  d.run('4 2 S kout');                                  // X↔K
  assert.strictEqual(d.run('kout'), '42.');
  d.run('S ac');                                        // KAC
  assert.strictEqual(d.getDisplay().indicators.k, false);
});

test('EXP 與正負號', () => {
  assert.strictEqual(show('2 . 5 exp 3 ='), '2500.');
  assert.strictEqual(show('2 exp 3 sign ='), '2. ×10^-03');
  assert.strictEqual(show('5 sign + 2 ='), '-3.');
});

test('MODE 7／8：FIX、SCI 與 RND', () => {
  assert.strictEqual(show('mode 7 2 1 ÷ 3 ='), '0.33');
  assert.strictEqual(show('mode 8 3 1 2 3 4 ='), '1.23 ×10^03');
  const c = calc();
  c.run('mode 7 2 1 ÷ 3 = S d0');                       // SHIFT 0 = RND
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

test('座標轉換 R→P 與 P→R（SHIFT + 與 SHIFT −）', () => {
  const c = calc();
  assert.strictEqual(c.run('3 S + 4 ='), '5.');         // R→P(3,4) → r
  assert.strictEqual(c.run('S kin'), '53.13010235');    // X↔Y → θ
  const d = calc();
  assert.strictEqual(d.run('2 S - 6 0 ='), '1.');       // P→R(2,60°) → x
  assert.strictEqual(d.run('S kin'), '1.732050808');
});

test('MODE 3（SD）：資料輸入與統計值', () => {
  const c = calc();
  c.run('mode 3 1 0 DATA 2 0 DATA 3 0 DATA');
  assert.strictEqual(c.run('S d3'), '3.');              // SHIFT 3 = n
  assert.strictEqual(c.run('S d2'), '60.');             // SHIFT 2 = Σx
  assert.strictEqual(c.run('S d1'), '1400.');           // SHIFT 1 = Σx²
  assert.strictEqual(c.run('kout d1'), '20.');          // Kout 1 = x̄
  assert.strictEqual(c.run('kout d2'), '8.164965809');  // Kout 2 = xσn
  assert.strictEqual(c.run('kout d3'), '10.');          // Kout 3 = xσn−1
});

test('MODE 3（SD）：帶次數輸入、刪除與清除', () => {
  const c = calc();
  c.run('mode 3 5 × 3 DATA 1 0 DATA');
  assert.strictEqual(c.run('S d3'), '4.');
  assert.strictEqual(c.run('kout d1'), '6.25');

  c.run('9 9 9 DATA');
  c.run('S run');                                       // SHIFT RUN = DEL
  assert.strictEqual(c.run('S d3'), '4.');
  c.run('S ac');                                        // KAC 一併清除統計記憶
  assert.strictEqual(c.run('S d3'), '0.');
});

test('MODE 2（LR）：迴歸係數與估計值', () => {
  const c = calc();
  c.run('mode 2 1 × 3 0 DATA 2 × 4 5 DATA 3 × 5 5 DATA 4 × 7 0 DATA');
  assert.strictEqual(c.run('S d3'), '4.');              // n
  assert.strictEqual(c.run('kout d7'), '17.5');         // A
  assert.strictEqual(c.run('kout d8'), '13.');          // B
  assert.strictEqual(c.run('kout d9'), '0.997054486');  // r
  assert.strictEqual(c.run('5 kout )'), '82.5');        // Kout )] = ŷ(5)
  assert.strictEqual(c.run('8 2 . 5 S )'), '5.');       // SHIFT )] = x̂(82.5)
  assert.strictEqual(c.run('S d6'), '565.');            // SHIFT 6 = Σxy
});

test('MODE 0（BASE-N）：數制轉換', () => {
  const c = calc();
  c.run('mode 0 2 5 5');
  assert.strictEqual(c.run('hex'), 'FF');
  assert.strictEqual(c.run('S hex'), '377');            // SHIFT HEX = OCT
  assert.strictEqual(c.run('S dec'), '11111111');       // SHIFT DEC = BIN
  assert.strictEqual(c.run('dec'), '255');
});

test('MODE 0（BASE-N）：負數、邏輯運算與整數除法', () => {
  const c = calc();
  c.run('mode 0 1 S sign');                             // SHIFT +/− = NEG
  assert.strictEqual(c.run('hex'), 'FFFFFFFF');
  // 十六進 A–F 在 +/−、°’”、hyp、sin、cos、tan 一行：F0 and 3C
  assert.strictEqual(c.run('AC tan 0 S sqrt 3 hyp ='), '30');
  assert.strictEqual(c.run('AC 3 0 S ln 0 hyp ='), '3C');         // 30 xor 0C
  assert.strictEqual(c.run('dec 7 ÷ 2 ='), '3');
});

test('基數鍵在其他模式無效並給出提示', () => {
  const c = calc();
  c.press('hex');
  assert.ok(/BASE-N/.test(c.getDisplay().indicators.note));
  assert.strictEqual(c.text(), '0.');
});

test('未實作的程式功能會提示而不改變狀態', () => {
  const c = calc();
  c.run('1 2 3');
  c.press('p1');
  assert.ok(/未實作/.test(c.getDisplay().indicators.note));
  assert.strictEqual(c.text(), '123.');
  c.press('mode'); c.press('d1');
  assert.ok(/∫dx/.test(c.getDisplay().indicators.note));
});

test('MODE · 回到 RUN（一般計算）', () => {
  const c = calc();
  c.run('mode 3 1 0 DATA');
  assert.strictEqual(c.mode, 'SD');
  c.run('mode .');
  assert.strictEqual(c.mode, 'COMP');
  assert.strictEqual(c.run('2 + 3 ='), '5.');
});
