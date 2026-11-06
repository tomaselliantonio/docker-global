// Pulsante ACCENDI/SPEGNI + barra di avvio dentro le card delle macchine del Lab.
// Ogni macchina ha il suo servizio di controllo (progetto kali-lab).
// Se Homepage ridisegna una card, la striscia viene rimessa.
(function () {
  var MACHINES = [
    { name: "Kali Linux", api: "http://kali-ctl.localhost" },
  ];

  MACHINES.forEach(function (m) {
    m.st = { state: "", progress: 0, stage: "", seconds: 0 };
    m.inflight = false;
  });

  function strip(m) {
    var li = document.querySelector('.service[data-name="' + m.name + '"]');
    if (!li) return null;
    var s = li.querySelector(".kali-ctl");
    if (s) return s;
    s = document.createElement("div");
    s.className = "kali-ctl";
    s.innerHTML =
      '<button type="button" class="kc-btn" disabled>…</button>' +
      '<div class="kc-bar"><i></i></div>' +
      '<span class="kc-txt"></span>';
    s.querySelector(".kc-btn").addEventListener("click", function () { onClick(m); });
    li.appendChild(s);
    return s;
  }

  function render(m) {
    var s = strip(m);
    if (!s) return;
    var st = m.st;
    var b = s.querySelector(".kc-btn");
    var busy = st.state === "starting" || st.state === "stopping";
    var running = st.state === "running";
    b.textContent = running ? "Spegni" : st.state === "starting" ? "Avvio…" : st.state === "stopping" ? "Spegnimento…" : "Accendi";
    b.disabled = busy || st.state === "error" || st.state === "missing" || st.state === "";
    b.classList.toggle("stop", running);
    s.querySelector(".kc-bar").classList.toggle("go", busy);
    s.querySelector(".kc-bar i").style.width = (st.progress || 0) + "%";
    s.querySelector(".kc-txt").textContent =
      (st.stage || "") + (st.seconds && st.state !== "stopped" && st.state !== "error" ? " · " + st.seconds + "s" : "");
  }

  function poll(m) {
    if (m.inflight) return;
    m.inflight = true;
    fetch(m.api + "/api/status", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { m.st = j; })
      .catch(function () { m.st = { state: "error", progress: 0, stage: "Controllo non raggiungibile", seconds: 0 }; })
      .then(function () {
        m.inflight = false;
        render(m);
        var busy = m.st.state === "starting" || m.st.state === "stopping";
        setTimeout(function () { poll(m); }, busy ? 700 : m.st.state === "error" ? 30000 : 3000);
      });
  }

  function onClick(m) {
    var path = m.st.state === "running" ? "/api/stop" : "/api/start";
    m.st.state = path === "/api/stop" ? "stopping" : "starting";
    m.st.progress = path === "/api/stop" ? 100 : 5;
    render(m);
    fetch(m.api + path, { method: "POST", headers: { "X-Kali-Ctl": "1" } }).then(function () { poll(m); });
  }

  // Homepage monta le card dopo il primo render e le ridisegna ogni tanto
  setInterval(function () { MACHINES.forEach(render); }, 1500);
  MACHINES.forEach(poll);
})();

// Pulsante ACCENDI/SPEGNI per ogni progetto (tutti i suoi container), sotto il titolo del gruppo.
// Servizio di controllo: projects-ctl (docker-global).
(function () {
  var API = "http://proj-ctl.localhost";
  var GROUPS = {
    "Blackbyrd": "blackbyrd",
    "Renova": "renova",
    "Italia in Classe A": "italiainclassea-2026",
  };
  var data = {};
  var inflight = false;

  function groupEl(name) {
    var names = document.querySelectorAll(".service-group-name");
    for (var i = 0; i < names.length; i++) {
      if (names[i].textContent.trim() === name) return names[i].closest(".services-group");
    }
    return null;
  }

  function strip(name, slug) {
    var g = groupEl(name);
    if (!g) return null;
    var s = g.querySelector(".kali-ctl");
    if (s) return s;
    var header = g.querySelector("button");
    if (!header) return null;
    s = document.createElement("div");
    s.className = "kali-ctl grp";
    s.innerHTML =
      '<button type="button" class="kc-btn" disabled>…</button>' +
      '<div class="kc-bar"><i></i></div>' +
      '<span class="kc-txt"></span>';
    s.querySelector(".kc-btn").addEventListener("click", function () { onClick(slug); });
    header.insertAdjacentElement("afterend", s);
    return s;
  }

  function render() {
    Object.keys(GROUPS).forEach(function (name) {
      var slug = GROUPS[name];
      var s = strip(name, slug);
      if (!s) return;
      var st = data[slug] || { state: "", progress: 0, stage: "", seconds: 0 };
      var busy = st.state === "starting" || st.state === "stopping";
      var running = st.state === "running";
      var b = s.querySelector(".kc-btn");
      b.textContent = running ? "Spegni" : st.state === "starting" ? "Avvio…" : st.state === "stopping" ? "Spegnimento…" : st.state === "partial" ? "Accendi tutto" : "Accendi";
      b.disabled = busy || st.state === "error" || st.state === "missing" || st.state === "";
      b.classList.toggle("stop", running);
      s.querySelector(".kc-bar").classList.toggle("go", busy);
      s.querySelector(".kc-bar i").style.width = (st.progress || 0) + "%";
      s.querySelector(".kc-txt").textContent = (st.stage || "") + (busy && st.seconds ? " · " + st.seconds + "s" : "");
    });
  }

  function busyAny() {
    return Object.keys(data).some(function (k) { return data[k].state === "starting" || data[k].state === "stopping"; });
  }

  function poll() {
    if (inflight) return;
    inflight = true;
    fetch(API + "/api/projects", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { data = j; })
      .catch(function () {
        Object.keys(GROUPS).forEach(function (n) {
          data[GROUPS[n]] = { state: "error", progress: 0, stage: "Controllo non raggiungibile", seconds: 0 };
        });
      })
      .then(function () {
        inflight = false;
        render();
        setTimeout(poll, busyAny() ? 700 : 3000);
      });
  }

  function onClick(slug) {
    var st = data[slug] || {};
    var action = st.state === "running" ? "stop" : "start";
    data[slug] = { state: action === "stop" ? "stopping" : "starting", progress: 5, stage: "…", seconds: 0 };
    render();
    fetch(API + "/api/projects/" + slug + "/" + action, { method: "POST", headers: { "X-Kali-Ctl": "1" } }).then(poll);
  }

  setInterval(render, 1500);
  poll();
})();