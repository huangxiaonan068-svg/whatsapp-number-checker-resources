/**
 * 弹窗交互逻辑：读取输入 -> 调用 validateMany -> 渲染结果 / 复制 / 导出
 */
(function () {
  "use strict";

  var KEY = "wa-checker:input";
  var SAMPLES = [
    "+8613800138000",
    "8613800138001",
    "0086 138 0013 8002",
    "+1 415-555-2671",
    "+44 20 7946 0958",
    "+81 90-1234-5678",
    "+86 138 0013",          // 太短
    "+999 1234567890",       // 区号不存在
    "+86 00000000000",       // 以 0 开头
    "+86 11111111111"        // 重复数字
  ];

  var statusMeta = {
    valid:   { badge: "合规",   cls: "ok" },
    warn:    { badge: "不规范", cls: "warn" },
    invalid: { badge: "不合规", cls: "bad" }
  };

  var $ = function (id) { return document.getElementById(id); };
  var input = $("input");
  var results = $("results");
  var summary = $("summary");
  var lastItems = [];

  /* ---------------- 工具 ---------------- */

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 1400);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------------- 渲染 ---------------- */

  function render(res) {
    lastItems = res.items;
    results.textContent = "";
    summary.hidden = false;

    var s = res.stats;
    $("c-total").textContent = "共 " + s.total + " 条";
    $("c-valid").textContent = "合规 " + s.valid;
    $("c-warn").textContent = "不规范 " + s.warn;
    $("c-invalid").textContent = "不合规 " + s.invalid;
    $("c-unique").textContent = "去重后 " + s.unique +
      (s.duplicates ? "（重复 " + s.duplicates + "）" : "");

    if (!s.total) {
      summary.hidden = true;
      toast("请先输入号码");
      return;
    }

    var frag = document.createDocumentFragment();
    for (var i = 0; i < res.items.length; i++) {
      var it = res.items[i];
      var meta = statusMeta[it.status];

      var li = el("li", "item " + it.status);
      var top = el("div", "item-top");
      top.appendChild(el("span", "idx", "#" + (i + 1)));
      top.appendChild(el("span", "e164" + (it.e164 ? "" : " muted"),
        it.e164 || it.raw.trim()));
      top.appendChild(el("span", "badge " + meta.cls, meta.badge));
      li.appendChild(top);

      var sub = el("div", "item-sub");
      var c = document.createElement("span");
      c.className = "country";
      c.textContent = it.country
        ? it.country.name + " (+" + it.country.code + ")　"
        : "未识别国家/地区　";
      sub.appendChild(c);
      sub.appendChild(document.createTextNode(it.reason));
      li.appendChild(sub);

      frag.appendChild(li);
    }
    results.appendChild(frag);
  }

  /* ---------------- 动作 ---------------- */

  function check() {
    render(validateMany(input.value));
    try { localStorage.setItem(KEY, input.value); } catch (e) { /* 忽略 */ }
  }

  function asText() {
    if (!lastItems.length) return "";
    var lines = ["原始输入\tE.164\t国家/地区\t状态\t说明"];
    for (var i = 0; i < lastItems.length; i++) {
      var it = lastItems[i];
      lines.push([
        it.raw.trim(),
        it.e164 || "",
        it.country ? it.country.name + " (+" + it.country.code + ")" : "",
        statusMeta[it.status].badge,
        it.reason
      ].join("\t"));
    }
    return lines.join("\n");
  }

  function copyResult() {
    var text = asText();
    if (!text) { toast("还没有结果可复制"); return; }
    navigator.clipboard.writeText(text).then(
      function () { toast("已复制 " + lastItems.length + " 行"); },
      function () { toast("复制失败，请手动选择"); }
    );
  }

  function exportCsv() {
    if (!asText()) { toast("还没有结果可导出"); return; }
    var rows = asText().split("\n").map(function (line) {
      return line.split("\t").map(function (cell) {
        return '"' + cell.replace(/"/g, '""') + '"';
      }).join(",");
    });
    var blob = new Blob(["\ufeff" + rows.join("\r\n")], {
      type: "text/csv;charset=utf-8"
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "whatsapp-number-check-" + Date.now() + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast("已导出 CSV");
  }

  /* ---------------- 绑定 ---------------- */

  $("btn-check").addEventListener("click", check);
  $("btn-copy").addEventListener("click", copyResult);
  $("btn-csv").addEventListener("click", exportCsv);
  $("btn-sample").addEventListener("click", function () {
    input.value = SAMPLES.join("\n");
    check();
  });
  $("btn-clear").addEventListener("click", function () {
    input.value = "";
    results.textContent = "";
    summary.hidden = true;
    lastItems = [];
    try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    input.focus();
  });
  input.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") check();
  });

  /* ---------------- 初始化：恢复上次输入 ---------------- */
  try {
    var cached = localStorage.getItem(KEY);
    if (cached) { input.value = cached; check(); }
  } catch (e) { /* 忽略 */ }
})();
