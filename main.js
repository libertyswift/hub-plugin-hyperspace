// Плагин hyperspace (agents-hub): тема Hyperspace (hyperspace.json — во «Настройки» → «Тема») и то, чего встроенные темы не
// умеют, — градиенты. У выбранной темы блок "gradients": {page, sidebar, header, footer, primary}: градиент
// {"colors": [...], "angle": 180} (цвета равномерно) или цвет; "flow": {msg, task, result} — цвета «Потока».
// "iconColors": {"icons", "avatars", <имя значка>, <эмодзи>} — цвет значков и аватаров темы: картинка служит
// трафаретом (CSS-маска), цвет — отсюда; поштучный цвет главнее общего.
// Работает для любой темы с этими блоками: смена темы — событие hub-theme, перечитываем выбранную.
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

// значки и аватары темы — трафаретом, цветом из iconColors (картинки — .kit-img с url в background-image)
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

// выбранная тема этого плагина поменялась в файле (цвета, значки, аватары) — взять свежую: встроенная «Тема» делает
// это, только когда открыта её вкладка; перезагрузка — один раз, пока копия в браузере не совпадёт с файлом
async function refresh() {
  let cur = null;
  try { cur = JSON.parse(localStorage.getItem("hub.theme") || "null"); } catch { return; }
  if (!cur || !String(cur.id).endsWith(":hyperspace.json")) return;   // id: <плагин>:hyperspace.json
  try {
    const { themes } = await (await fetch("/api/themes")).json();
    const now = themes.find((x) => x.id === cur.id);
    const fresh = now && JSON.stringify({ id: now.id, theme: now.theme });
    if (fresh && fresh !== localStorage.getItem("hub.theme")) { localStorage.setItem("hub.theme", fresh); location.reload(); }
  } catch { /* нет связи — останется прежняя копия */ }
}

// Тёмная Clean (kalimullin/hub-plugin-clean) в цветах Hyperspace — clean-hyperspace.css, правила только под
// html.th-clean.th-clean-dark. Подсветке кода, как в Hyperspace, нужны два различия, которых нет у highlight.js:
// управляющие слова (if, else, return…) отдельно от объявлений (var, function) и операторы отдельно от текста. Помечаем их
// в готовых блоках .hljs: класс hs-ctl и span.hs-op — только пока выбрана тёмная Clean.
const CTL = new Set(("if else elif return for while do switch case default break continue throw try catch finally except raise " +
  "await yield new delete typeof instanceof in of import export from as with not and or is then fi done esac").split(" "));
const FN = new Set(["function", "def", "fn", "func", "class", "lambda"]);
const OP = /[=+\-*/%<>!?:|&^~.]+/g;
const SKIP = 'span[class*="hljs-"], .mk, .hs-op';   // строки, комментарии и т. п., знак диффа, уже помеченное

// дефис и косая внутри слова (th-clean-dark, src/app, -la) — часть имени, не оператор; точка — оператор только как
// обращение к полю ($.event, foo().bar), а не в начале пути (./x) и не многоточие. Край текстового узла — граница токена
// (соседний span), считаем его буквой.
const WORD = /[\w$Ѐ-ӿ]/;
function isOp(s, m) {
  const r = m[0], prev = m.index ? s[m.index - 1] : "a", next = s[m.index + r.length] ?? "a";
  if (r === ".") return /[\w$)\]]/.test(prev) && /[A-Za-z_$]/.test(next);
  if (/^\.+$/.test(r) || /^[-/.]*[/.][-/.]*$/.test(r) && r.includes("/")) return false;   // многоточие, ./ ../
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
    if (ops.length) texts.push([t, ops]);   // без настоящих операторов узел не трогаем (иначе наблюдатель зациклится)
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

// ушли с тёмной Clean — вернуть код как был: операторы обратно в текст, классы слов снять
function unmark() {
  for (const s of document.querySelectorAll(".hs-op")) s.replaceWith(s.textContent);
  for (const k of document.querySelectorAll(".hs-ctl, .hs-fn")) k.classList.remove("hs-ctl", "hs-fn");
}

// блоки кода приходят и перерисовываются в любой момент: собираем затронутые .hljs и метим их раз в кадр
const dark = () => document.documentElement.classList.contains("th-clean") && document.documentElement.classList.contains("th-clean-dark");
const queue = new Set(); let planned = false;
function flush() {
  planned = false;
  if (dark()) for (const r of queue) if (r.isConnected) mark(r);
  queue.clear();
}
function take(n) {
  if (!dark()) return;   // без тёмной Clean страницу не трогаем
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
  // за кодом на странице следим, только пока выбрана тёмная Clean; ушли с неё — метки снимаем
  const code = new MutationObserver(ms => { for (const m of ms) { take(m.target); for (const n of m.addedNodes) take(n); } plan(); });
  const sync2 = () => {
    code.disconnect();
    if (dark()) { code.observe(document.body, { childList: true, subtree: true }); take(document.body); plan(); }
    else unmark();
  };
  new MutationObserver(sync2).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  sync2();
}
