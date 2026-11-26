(function (win) {
  "use strict";
  const scriptUrl = new URL(win.document.currentScript.src);
  if (scriptUrl.origin !== win.location.origin) throw new Error("壳脚本必须与入口同源");
  const shellRoot = new URL("./", scriptUrl);
  win.Aomen28ShellRootHref = shellRoot.href;
  win.aomen28BuildFrameUrl = function (routeUrl, pageHref = win.location.href) {
    const page = new URL(pageHref);
    if (page.origin !== shellRoot.origin || !page.pathname.startsWith(shellRoot.pathname)) throw new Error("入口不在壳目录内");
    if (!httpsOrigin(routeUrl)) throw new Error("线路必须使用 HTTPS");
    const relativePath = page.pathname.slice(shellRoot.pathname.length);
    const pagePath = !relativePath || relativePath === "index.html" ? "frontend-web/index.html" : relativePath;
    const target = new URL(routeUrl);
    target.pathname = target.pathname.replace(/\/+$/, "") + "/" + pagePath;
    const keys = new Set([...page.searchParams.keys()].filter(key => key !== "open"));
    keys.forEach(key => target.searchParams.delete(key));
    page.searchParams.forEach((value, key) => { if (key !== "open") target.searchParams.append(key, value); });
    if (page.hash) target.hash = page.hash;
    return target.href;
  };
  const PROTOCOL = "aomen28.embed.v1";
  const KEY = "aomen28.embed.session.v1";
  const valid = auth => auth && /^emb_[a-f0-9]{64}$/.test(auth.token || "")
    && Number.isFinite(auth.expiresAt) && auth.expiresAt > Date.now()
    && auth.expiresAt <= Date.now() + 11 * 60 * 1000;
  function httpsOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.origin : "";
    } catch (_) { return ""; }
  }
  win.createAomen28ShellBridge = function (frame) {
    let allowed = new Set();
    let activeOrigin = "";
    let nonce = "";
    let auth = null;
    let loggedOut = false;
    try {
      const saved = JSON.parse(win.sessionStorage.getItem(KEY) || "null");
      auth = valid(saved?.auth) ? saved.auth : null;
      loggedOut = Boolean(saved?.loggedOut || saved?.auth && !auth);
    } catch (_) {}
    function persist() {
      try { win.sessionStorage.setItem(KEY, JSON.stringify({ auth, loggedOut })); } catch (_) {}
    }
    function send(type, extra = {}) {
      if (activeOrigin && nonce) frame.contentWindow.postMessage({ protocol: PROTOCOL, type, nonce, ...extra }, activeOrigin);
    }
    win.addEventListener("message", event => {
      const data = event.data;
      if (!activeOrigin || !allowed.has(event.origin) || event.origin !== activeOrigin || event.source !== frame.contentWindow
        || !data || data.protocol !== PROTOCOL || !/^[a-f0-9]{32}$/.test(data.nonce || "")) return;
      if (data.type === "READY") {
        nonce = data.nonce;
        if (auth && !valid(auth)) { auth = null; loggedOut = true; persist(); }
        send("SYNC", { auth, loggedOut });
        return;
      }
      if (data.nonce !== nonce || !Number.isSafeInteger(data.id) || data.id <= 0) return;
      if (data.type === "LOGIN" && valid(data.auth)) {
        auth = { token: data.auth.token, expiresAt: data.auth.expiresAt };
        loggedOut = false;
        persist();
        send("ACK", { id: data.id });
      } else if (data.type === "LOGOUT") {
        auth = null;
        loggedOut = true;
        persist();
        send("ACK", { id: data.id });
      }
    });
    return {
      configure(routes) { allowed = new Set(routes.map(route => httpsOrigin(route.url)).filter(Boolean)); },
      select(url) {
        const origin = httpsOrigin(url);
        if (!allowed.has(origin)) throw new Error("线路来源不被允许");
        activeOrigin = origin;
        nonce = "";
      }
    };
  };
  win.aomen28HttpsOrigin = httpsOrigin;
})(window);
