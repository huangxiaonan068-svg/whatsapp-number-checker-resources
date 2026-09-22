/**
 * WhatsApp 号码格式校验 —— 核心算法
 * ------------------------------------------------------------------
 * 纯本地计算，不发起任何网络请求。
 *
 * 校验顺序：
 *   1. 归一化：全角转半角、剔除视觉分隔符（空格 / - / ( ) / . / ,）
 *   2. 识别国际前缀：+ 或 00
 *   3. 最长前缀匹配国家/地区区号
 *   4. 校验国内号码长度是否符合该国规则
 *   5. 校验常见非法模式（以 0 开头、纯重复数字、北美区号以 0/1 开头）
 *
 * 返回状态：
 *   valid   ✅ 格式合规
 *   warn    ⚠️ 可识别但不规范（如缺少 + 前缀，国家码为自动识别）
 *   invalid ❌ 格式不合规
 */

const RULES = (typeof module !== "undefined" && typeof require === "function")
  ? require("./countries.js")
  : { COUNTRY_INDEX: COUNTRY_INDEX, MAX_CODE_LEN: MAX_CODE_LEN };

/** 允许出现的视觉分隔符（会被直接删除） */
const SEPARATOR_RE = /[\s\u00a0\u3000\-().,\u2010-\u2015]/g;

/**
 * 全角字符转半角（中文输入法下常见）
 * @param {string} s
 * @returns {string}
 */
function toHalfWidth(s) {
  const map = {
    "\uFF0B": "+", "\uFF0D": "-", "\uFF08": "(",
    "\uFF09": ")", "\uFF0E": ".", "\uFF0C": ","
  };
  return s.replace(/[\uFF10-\uFF19\uFF0B\uFF0D\uFF08\uFF09\uFF0E\uFF0C]/g, (c) => {
    if (c >= "\uFF10" && c <= "\uFF19") {
      return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
    }
    return map[c] || c;
  });
}

/**
 * 归一化输入：全角转半角 + 去掉分隔符
 * @param {string} raw
 * @returns {string}
 */
function normalizeInput(raw) {
  return toHalfWidth(String(raw == null ? "" : raw)).replace(SEPARATOR_RE, "");
}

/**
 * 最长前缀匹配国家/地区区号
 * @param {string} digits 纯数字串
 * @returns {{rule: object, nsn: string}|null}
 */
function matchCountryCode(digits) {
  const max = Math.min(RULES.MAX_CODE_LEN, digits.length - 1);
  for (let n = max; n >= 1; n--) {
    const rule = RULES.COUNTRY_INDEX.get(digits.slice(0, n));
    if (rule) return { rule: rule, nsn: digits.slice(n) };
  }
  return null;
}

/**
 * 校验单个号码
 * @param {string} raw 原始输入
 * @returns {{raw:string,status:string,e164:string|null,country:object|null,reason:string}}
 */
function validateNumber(raw) {
  const out = {
    raw: String(raw == null ? "" : raw),
    status: "invalid",
    e164: null,
    country: null,
    reason: ""
  };

  if (!out.raw.trim()) {
    out.reason = "空行，已跳过";
    return out;
  }

  let s = normalizeInput(out.raw);

  // --- 识别国际前缀 ---
  let hasPrefix = false;
  if (s.charAt(0) === "+") {
    s = s.slice(1);
    hasPrefix = true;
  } else if (s.slice(0, 2) === "00") {
    s = s.slice(2);
    hasPrefix = true;
  }

  // --- 剩余必须全为数字 ---
  if (!/^\d+$/.test(s)) {
    const bad = Array.from(new Set(s.replace(/\d/g, ""))).join("");
    out.reason = "含非法字符「" + bad + "」，号码只能包含数字与 + ( ) - 空格";
    return out;
  }

  // --- 总长度粗筛（E.164 上限 15 位） ---
  if (s.length > 15) {
    out.reason = "总位数 " + s.length + " 位，超过 E.164 上限 15 位";
    return out;
  }
  if (s.length < 7) {
    out.reason = "总位数仅 " + s.length + " 位，远短于任何合法号码";
    return out;
  }

  // --- 匹配国家/地区码 ---
  const matched = matchCountryCode(s);
  if (!matched) {
    out.reason = "无法识别国家/地区代码（数字以 " + s.slice(0, 3) + " 开头）";
    return out;
  }

  const rule = matched.rule;
  const nsn = matched.nsn;
  out.country = { code: rule.code, iso: rule.iso, name: rule.name };
  out.e164 = "+" + rule.code + nsn;

  // --- 长度规则 ---
  if (rule.len.indexOf(nsn.length) === -1) {
    out.reason = rule.name + " 的号码应为 " + rule.len.join(" 或 ") +
      " 位（不含区号），实际 " + nsn.length + " 位";
    return out;
  }

  // --- 常见非法模式 ---
  if (nsn.charAt(0) === "0") {
    out.reason = "国内号码不应以 0 开头（0 是长途前缀，不属于号码本身）";
    return out;
  }
  if (/^(\d)\1+$/.test(nsn)) {
    out.reason = "号码为重复数字，明显无效";
    return out;
  }
  if (rule.code === "1" && /^[01]/.test(nsn)) {
    out.reason = "北美号码的区号不能以 0 或 1 开头";
    return out;
  }

  out.status = hasPrefix ? "valid" : "warn";
  out.reason = hasPrefix
    ? "格式合规"
    : "格式合规，但缺少「+」国际前缀，国家/地区码为自动识别结果";
  return out;
}

/**
 * 批量校验：按行拆分，跳过空行，行号以原始文本为准
 * @param {string} text
 * @returns {{items:Array, stats:object}}
 */
function validateMany(text) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const r = validateNumber(lines[i]);
    r.line = i + 1;
    items.push(r);
  }
  return { items: items, stats: summarize(items) };
}

/**
 * 汇总统计
 * @param {Array} items validateNumber 的结果数组
 */
function summarize(items) {
  const stats = {
    total: items.length, valid: 0, warn: 0, invalid: 0,
    unique: 0, duplicates: 0
  };
  const seen = new Set();
  for (const it of items) {
    stats[it.status] = (stats[it.status] || 0) + 1;
    const key = it.e164 || it.raw;
    if (seen.has(key)) stats.duplicates++;
    else seen.add(key);
  }
  stats.unique = seen.size;
  return stats;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    toHalfWidth: toHalfWidth,
    normalizeInput: normalizeInput,
    matchCountryCode: matchCountryCode,
    validateNumber: validateNumber,
    validateMany: validateMany,
    summarize: summarize
  };
}
