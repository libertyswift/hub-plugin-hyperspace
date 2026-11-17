// hyperspace plugin (agents-hub): the Hyperspace theme (hyperspace.json — in "Settings" → "Theme") and what built-in themes
// cannot do — gradients. The selected theme's "gradients" block: {page, sidebar, header, footer, primary}: a gradient
// {"colors": [...], "angle": 180} (colors spread evenly) or a color; "flow": {msg, task, result} — the colors of "Flow".
// "iconColors": {"icons", "avatars", <icon name>, <emoji>} — the color of the theme's icons and avatars: the picture is a
// stencil (CSS mask), the color comes from here; a per-item color wins over the general one.
// Works for any theme with these blocks: a theme change is the hub-theme event, we re-read the selected one.
const SURF = ["page", "sidebar", "header", "footer", "primary"];

function css(g) {
  if (typeof g === "string") return g;
  if (!g || !Array.isArray(g.colors) || !g.colors.length) return "";
  if (g.colors.length === 1) return g.colors[0];
  const n = g.colors.length - 1;
  return `linear-gradient(${Number.isFinite(g.angle) ? g.angle : 180}deg, ${g.colors.map((c, i) => `${c} ${Math.round(i / n * 100)}%`).join(", ")})`;
}

function selected() {
  try { return JSON.parse(localStorage.getItem("hub.theme") || "null")?.theme || null; } catch { return null; }
}

function sync() {
  const t = selected(), r = document.documentElement, set = (k, v) => {
    if (v) { r.style.setProperty(`--hx-${k}`, v); r.classList.add(`hx-${k}`); }
    else { r.style.removeProperty(`--hx-${k}`); r.classList.remove(`hx-${k}`); }
  };
  for (const k of SURF) set(k, css(t?.gradients?.[k]));
  const f = t?.flow || {};
  for (const k of ["msg", "task", "result"]) r.style.setProperty(`--hx-flow-${k}`, f[k] || "");
  r.classList.toggle("hx-flow", !!(f.msg || f.task || f.result));
  watcher?.disconnect(); watcher = null;
  paintAll();
}

// the theme's icons and avatars — as a stencil, in the color from iconColors (the pictures are .kit-img with a url in background-image)
function paint(node, colors) {
  const url = node.style.backgroundImage;
  if (!url || url === "none") return;
  const avatar = node.classList.contains("avatar");
  const name = (decodeURIComponent(url).match(/[?&]f=[ia]\/([\w-]+)\./) || [])[1];
  const color = colors[avatar ? node.getAttribute("aria-label") : name] || colors[avatar ? "avatars" : "icons"];
  if (!color) return;
  const st = node.style;
  for (const p of ["maskImage", "webkitMaskImage"]) st[p] = url;
  for (const [p, v] of [["Size", "contain"], ["Repeat", "no-repeat"], ["Position", "center"]]) { st["mask" + p] = v; st["webkitMask" + p] = v; }
  st.backgroundImage = "none";
  st.backgroundColor = color;
  node.dataset.hx = "1";
}

let watcher = null;
function paintAll() {
  const colors = selected()?.iconColors;
  if (!colors) { watcher?.disconnect(); watcher = null; return; }
  const run = () => document.querySelectorAll(".kit-img:not([data-hx])").forEach((n) => paint(n, colors));
  run();
  if (!watcher) { watcher = new MutationObserver(run); watcher.observe(document.body, { childList: true, subtree: true }); }
}

// this plugin's selected theme changed in the file (colors, icons, avatars) — take the fresh one: the built-in "Theme"
// does that only while its tab is open; reload once, until the browser's copy matches the file
async function refresh() {
  let cur = null;
  try { cur = JSON.parse(localStorage.getItem("hub.theme") || "null"); } catch { return; }
  if (!cur || !String(cur.id).endsWith(":hyperspace.json")) return;   // id: <plugin>:hyperspace.json
  try {
    const { themes } = await (await fetch("/api/themes")).json();
    const now = themes.find((x) => x.id === cur.id);
    const fresh = now && JSON.stringify({ id: now.id, theme: now.theme });
    if (fresh && fresh !== localStorage.getItem("hub.theme")) { localStorage.setItem("hub.theme", fresh); location.reload(); }
  } catch { /* no connection — the previous copy stays */ }
}

// The dark Clean in Hyperspace colors — clean-hyperspace.css, rules only under html.th-clean.th-clean-dark. Code
// highlighting as in Hyperspace needs two distinctions highlight.js does not make: control words (if, else, return…)
// apart from declarations (var, function), and operators apart from the text. We mark them in finished .hljs blocks:
// the class hs-ctl and span.hs-op — only while the dark Clean is selected.
const CTL = new Set(("if else elif return for while do switch case default break continue throw try catch finally except raise " +
  "await yield new delete typeof instanceof in of import export from as with not and or is then fi done esac").split(" "));
const FN = new Set(["function", "def", "fn", "func", "class", "lambda"]);
const OP = /[=+\-*/%<>!?:|&^~.]+/g;
const SKIP = 'span[class*="hljs-"], .mk, .hs-op';   // strings, comments etc., the diff sign, already marked

// a hyphen or a slash inside a word (th-clean-dark, src/app, -la) is part of the name, not an operator; a dot is an
// operator only as field access ($.event, foo().bar), not at the start of a path (./x) and not an ellipsis. The edge of a
// text node is a token boundary (a neighbouring span), we treat it as a letter.
const WORD = /[\w$Ѐ-ӿ]/;
function isOp(s, m) {
  const r = m[0], prev = m.index ? s[m.index - 1] : "a", next = s[m.index + r.length] ?? "a";
  if (r === ".") return /[\w$)\]]/.test(prev) && /[A-Za-z_$]/.test(next);
  if (/^\.+$/.test(r) || /^[-/.]*[/.][-/.]*$/.test(r) && r.includes("/")) return false;   // ellipsis, ./ ../
  if (/^[-/]+$/.test(r)) return !WORD.test(prev) && !WORD.test(next);
  return true;
}

function mark(root) {
  for (const k of root.querySelectorAll(".hljs-keyword:not(.hs-ctl, .hs-fn)")) {
    const w = k.textContent.trim();
    if (CTL.has(w)) k.classList.add("hs-ctl"); else if (FN.has(w)) k.classList.add("hs-fn");
  }
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), texts = [];
  for (let t; (t = walk.nextNode());) {
    if (t.parentElement.closest(SKIP)) continue;
    const ops = [...t.data.matchAll(OP)].filter(m => isOp(t.data, m));
    if (ops.length) texts.push([t, ops]);   // without real operators the node is left alone (otherwise the observer loops)
  }
  for (const [t, ops] of texts) {
    const f = document.createDocumentFragment(); let at = 0;
    for (const m of ops) {
      if (m.index > at) f.append(t.data.slice(at, m.index));
      const s = document.createElement("span"); s.className = "hs-op"; s.textContent = m[0]; f.append(s);
      at = m.index + m[0].length;
    }
    if (at < t.data.length) f.append(t.data.slice(at));
    t.replaceWith(f);
  }
}

// left the dark Clean — put the code back as it was: operators back into text, word classes removed
function unmark() {
  for (const s of document.querySelectorAll(".hs-op")) s.replaceWith(s.textContent);
  for (const k of document.querySelectorAll(".hs-ctl, .hs-fn")) k.classList.remove("hs-ctl", "hs-fn");
}

// code blocks arrive and are redrawn at any moment: collect the touched .hljs and mark them once per frame
const dark = () => document.documentElement.classList.contains("th-clean") && document.documentElement.classList.contains("th-clean-dark");
const queue = new Set(); let planned = false;
function flush() {
  planned = false;
  if (dark()) for (const r of queue) if (r.isConnected) mark(r);
  queue.clear();
}
function take(n) {
  if (!dark()) return;   // without the dark Clean the page is left alone
  if (n.nodeType !== 1) n = n.parentElement;
  if (!n) return;
  const own = n.closest(".hljs");
  if (own) queue.add(own); else for (const r of n.querySelectorAll(".hljs")) queue.add(r);
}
function plan() { if (queue.size && !planned) { planned = true; requestAnimationFrame(flush); } }

export default function register(hub) {
  hub.addStyle("hyperspace.css");
  hub.addStyle("clean-hyperspace.css");
  sync();
  window.addEventListener("hub-theme", sync);
  refresh();
  // watch the code on the page only while the dark Clean is selected; on leaving it, remove the marks
  const code = new MutationObserver(ms => { for (const m of ms) { take(m.target); for (const n of m.addedNodes) take(n); } plan(); });
  const sync2 = () => {
    code.disconnect();
    if (dark()) { code.observe(document.body, { childList: true, subtree: true }); take(document.body); plan(); }
    else unmark();
  };
  new MutationObserver(sync2).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  sync2();
}
