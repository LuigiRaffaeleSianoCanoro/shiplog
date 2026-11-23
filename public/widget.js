/* Shiplog "What's new" widget. https://shiplog.help
   <script src="https://shiplog.help/widget.js" data-feed="https://shiplog.help/OWNER/REPO/feed.json" defer></script>
   Optional: data-lang="es|en", data-limit="8". Feed text is untrusted: DOM is built with textContent only. */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var feedUrl = script.getAttribute("data-feed");
  if (!feedUrl) return;
  var lang = script.getAttribute("data-lang") || ((navigator.language || "").slice(0, 2) === "es" ? "es" : "en");
  var limit = Math.max(1, parseInt(script.getAttribute("data-limit"), 10) || 8);
  var es = lang === "es";
  var T = es
    ? { btn: "Novedades", title: "Qu\u00e9 hay de nuevo", full: "Ver changelog completo", Added: "Nuevo", Changed: "Cambio", Fixed: "Arreglo", Security: "Seguridad", Deprecated: "Obsoleto", Removed: "Eliminado" }
    : { btn: "What's new", title: "What's new", full: "Full changelog", Added: "Added", Changed: "Changed", Fixed: "Fixed", Security: "Security", Deprecated: "Deprecated", Removed: "Removed" };
  var ORDER = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
  var key = "shiplog-widget:seen:" + feedUrl;
  function load() { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(key, v); } catch (e) {} }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function safeUrl(u, fallback) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : fallback; }

  var CSS =
    ":host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,sans-serif}" +
    ".btn{position:fixed;right:24px;bottom:24px;z-index:2147483000;display:flex;align-items:center;gap:8px;background:#13235A;color:#FBF8F1;border:0;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 10px 28px rgba(19,35,90,.35)}" +
    ".btn:focus-visible{outline:3px solid #F2382B;outline-offset:2px}" +
    ".badge{background:#F2382B;color:#fff;border-radius:999px;min-width:22px;height:22px;padding:0 6px;display:inline-grid;place-items:center;font-size:12px}" +
    ".panel{position:fixed;right:24px;bottom:84px;z-index:2147483000;width:360px;max-width:calc(100vw - 32px);max-height:520px;overflow:auto;background:#FBF8F1;color:#13235A;border:1px solid #E3DED3;border-top:4px solid #F2382B;border-radius:16px;box-shadow:0 24px 60px rgba(19,35,90,.28);transition:opacity .2s,transform .2s}" +
    ".panel[hidden]{display:none}.panel:focus{outline:none}" +
    "h2{margin:0;padding:18px 20px 4px;font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}" +
    ".sub{padding:0 20px 12px;color:#5A6386;font-size:13px;border-bottom:1px solid #E3DED3}" +
    ".it{padding:14px 20px;border-bottom:1px solid #E3DED3}.it.new{background:#fff}" +
    ".tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:6px;margin-right:8px;background:#EEE;color:#444}" +
    ".Added{background:#E6F4EA;color:#16703a}.Fixed{background:#FDE7E5;color:#C9241A}.Changed{background:#E7EBF7;color:#13235A}.Security{background:#FFF4D6;color:#8a5b00}" +
    ".meta{font-size:12px;color:#5A6386}.txt{margin:8px 0 0;font-size:14px;line-height:1.45}" +
    ".foot{display:flex;justify-content:space-between;gap:12px;padding:12px 20px;font-size:12px;color:#5A6386}.foot a{color:#C9241A;font-weight:700;text-decoration:none}" +
    "@media (prefers-color-scheme:dark){.panel{background:#0E1A44;color:#FBF8F1;border-color:#26336a}.it.new{background:#13235A}.sub,.it,.foot{border-color:#26336a}.sub,.meta,.foot{color:#B8BFD9}.foot a{color:#FF6B5E}}" +
    "@media (prefers-reduced-motion:reduce){.panel{transition:none}}";

  fetch(feedUrl, { credentials: "omit" })
    .then(function (r) { if (!r.ok) throw new Error("feed " + r.status); return r.json(); })
    .then(render)
    .catch(function () {});

  function render(feed) {
    var releases = (feed && Array.isArray(feed.releases) ? feed.releases : []).filter(function (r) { return r && r.version && r.version !== "Unreleased"; });
    var seen = load();
    var seenIdx = -1;
    for (var i = 0; i < releases.length; i++) if (releases[i].version === seen) { seenIdx = i; break; }
    var entries = [];
    releases.forEach(function (r, idx) {
      ORDER.forEach(function (s) {
        var list = r.sections && r.sections[s];
        if (!Array.isArray(list)) return;
        list.forEach(function (text) { entries.push({ s: s, text: text, v: r.version, d: r.date, fresh: seenIdx === -1 || idx < seenIdx }); });
      });
    });
    entries = entries.slice(0, limit);
    if (!entries.length) return;
    var unread = entries.filter(function (e) { return e.fresh; }).length;
    var page = safeUrl(feed.page, new URL(feedUrl, location.href).origin);

    var host = el("div");
    host.id = "shiplog-widget";
    var root = host.attachShadow({ mode: "open" });
    root.appendChild(el("style", null, CSS));

    var btn = el("button", "btn", T.btn);
    btn.type = "button";
    btn.setAttribute("data-testid", "shiplog-widget-button");
    btn.setAttribute("aria-expanded", "false");
    var badge = null;
    if (unread) { badge = el("span", "badge", unread); badge.setAttribute("aria-label", unread + (es ? " sin leer" : " unread")); btn.appendChild(badge); }

    var panel = el("div", "panel");
    panel.id = "slw-panel";
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", T.title);
    panel.setAttribute("data-testid", "shiplog-widget-panel");
    panel.appendChild(el("h2", null, T.title));
    panel.appendChild(el("div", "sub", feed.repo || ""));
    entries.forEach(function (e) {
      var it = el("div", "it" + (e.fresh ? " new" : ""));
      it.setAttribute("data-testid", "shiplog-widget-entry");
      it.appendChild(el("span", "tag " + e.s, T[e.s] || e.s));
      it.appendChild(el("span", "meta", e.v + (e.d ? " \u00b7 " + e.d : "")));
      it.appendChild(el("p", "txt", e.text));
      panel.appendChild(it);
    });
    var foot = el("div", "foot");
    var full = el("a", null, T.full);
    full.href = page; full.target = "_blank"; full.rel = "noopener";
    var by = el("a", null, "Changelog by Shiplog");
    by.href = "https://shiplog.help"; by.target = "_blank"; by.rel = "noopener"; by.title = es ? "Shiplog para Cursor Origin" : "Shiplog for Cursor Origin";
    foot.appendChild(full); foot.appendChild(by);
    panel.appendChild(foot);

    function setOpen(on) {
      panel.hidden = !on;
      btn.setAttribute("aria-expanded", String(on));
      if (on) {
        if (releases[0]) save(releases[0].version);
        if (badge) { badge.remove(); badge = null; }
        panel.focus();
      }
    }
    btn.addEventListener("click", function () { setOpen(panel.hidden); });
    root.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); } });
    document.addEventListener("click", function (ev) { if (!panel.hidden && ev.composedPath().indexOf(host) === -1) setOpen(false); });

    root.appendChild(panel);
    root.appendChild(btn);
    // The feed can resolve before <body> exists when the tag has no defer.
    if (document.body) document.body.appendChild(host);
    else document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(host); });
  }
})();
