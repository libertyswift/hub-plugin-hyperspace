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

export default function register(hub) {
  hub.addStyle("hyperspace.css");
  sync();
  window.addEventListener("hub-theme", sync);
  refresh();
}
