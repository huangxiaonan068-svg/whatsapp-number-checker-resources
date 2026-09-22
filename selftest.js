/**
 * 自测脚本（Node 环境，可选）
 * 运行：node selftest.js
 * 作用：用真实断言验证 validator.js 的行为，不依赖浏览器。
 */
const { validateNumber, validateMany, normalizeInput } = require("./validator.js");

/** [输入, 期望状态] */
const CASES = [
  // ---- 正常号码 ----
  ["+8613800138000", "valid"],
  ["+86 138 0013 8000", "valid"],
  ["  +8613800138000  ", "valid"],
  ["+86-138-0013-8000", "valid"],
  ["＋86 138 0013 8000", "valid"],          // 全角加号，应自动转半角
  ["0086 138 0013 8000", "valid"],          // 00 国际前缀
  ["+1 415-555-2671", "valid"],
  ["+1 (415) 555-2671", "valid"],
  ["+44 20 7946 0958", "valid"],
  ["+81 90-1234-5678", "valid"],
  ["+852 9123 4567", "valid"],
  ["+49 30 12345678", "valid"],
  ["+234 803 123 4567", "valid"],
  ["+971 50 123 4567", "valid"],
  ["+7 916 123 45 67", "valid"],
  ["+62 812 3456 789", "valid"],

  // ---- 缺 + 前缀：可识别但不规范 ----
  ["8613800138001", "warn"],
  ["14155552671", "warn"],

  // ---- 不合规 ----
  ["+86 138 0013", "invalid"],              // 位数不足
  ["+999 1234567890", "invalid"],           // 区号不存在
  ["+86 00000000000", "invalid"],           // 以 0 开头
  ["+86 11111111111", "invalid"],           // 纯重复数字
  ["+1 115-555-2671", "invalid"],           // 北美区号以 1 开头
  ["+62 812 3456 78901", "invalid"],        // 超过印尼最大长度
  ["+86 13800138000abc", "invalid"],        // 含非法字符
  ["+86 138-0013-8000 ext 12", "invalid"],  // 含非法字符
  ["123", "invalid"],                       // 太短
  ["+86 13800138000123456", "invalid"]      // 超过 E.164 15 位上限
];

let pass = 0;
const failures = [];

console.log("输入".padEnd(28) + "期望".padEnd(10) + "实际".padEnd(10) + "结果");
console.log("-".repeat(72));

for (const [input, expect] of CASES) {
  const r = validateNumber(input);
  const ok = r.status === expect;
  if (ok) pass++;
  else failures.push({ input, expect, got: r.status, reason: r.reason });
  console.log(
    JSON.stringify(input).padEnd(28) +
    expect.padEnd(12) +
    r.status.padEnd(12) +
    (ok ? "PASS" : "FAIL  " + r.reason)
  );
}

/* ---- 批量与统计 ---- */
console.log("\n批量统计：");
const batch = validateMany([
  "+8613800138000",
  "+86 138 0013 8000",
  "8613800138001",
  "+999 1234567890",
  "",
  "  "
].join("\n"));

const expectStats = { total: 4, valid: 2, warn: 1, invalid: 1, unique: 3, duplicates: 1 };
for (const k of Object.keys(expectStats)) {
  const ok = batch.stats[k] === expectStats[k];
  if (ok) pass++;
  else failures.push({ input: "stats." + k, expect: expectStats[k], got: batch.stats[k], reason: "统计不符" });
  console.log("  " + k.padEnd(12) + "期望 " + expectStats[k] + "  实际 " + batch.stats[k] + "  " + (ok ? "PASS" : "FAIL"));
}

/* ---- 归一化 ---- */
console.log("\n归一化：");
const normCases = [["+86 138-0013-8000", "+8613800138000"], ["（＋86）138", "+86138"]];
for (const [raw, expect] of normCases) {
  const got = normalizeInput(raw);
  const ok = got === expect;
  if (ok) pass++;
  else failures.push({ input: raw, expect, got, reason: "归一化不符" });
  console.log("  " + JSON.stringify(raw).padEnd(24) + "-> " + got.padEnd(20) + (ok ? "PASS" : "FAIL"));
}

/* ---- 汇总 ---- */
console.log("\n" + "=".repeat(72));
if (failures.length === 0) {
  console.log("全部通过：" + pass + " / " + pass);
} else {
  console.log("通过 " + pass + " 项，失败 " + failures.length + " 项：");
  for (const f of failures) {
    console.log("  x 输入 " + JSON.stringify(f.input) + " 期望 " + f.expect + " 实际 " + f.got + "（" + f.reason + "）");
  }
  process.exitCode = 1;
}
