// Pulsante ACCENDI/SPEGNI per ogni progetto (tutti i suoi container), sotto il titolo del gruppo.
// Servizio di controllo: projects-ctl (docker-global).
(function () {
  var API = "http://proj-ctl.localhost";
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
    var s = g.querySelector(".proj-strip");
    if (s) return s;
    var header = g.querySelector("button");
    if (!header) return null;
    s = document.createElement("div");
    s.className = "proj-strip grp";
    s.innerHTML =
      '<button type="button" class="kc-btn" disabled>…</button>' +
      '<div class="kc-bar"><i></i></div>' +
      '<span class="kc-txt"></span>';
    s.querySelector(".kc-btn").addEventListener("click", function () { onClick(slug); });
    header.insertAdjacentElement("afterend", s);
    return s;
  }

  function render() {
    Object.keys(data).forEach(function (slug) {
      var s = strip(data[slug].name, slug);
      if (!s) return;
      var st = data[slug];
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
        Object.keys(data).forEach(function (slug) {
          data[slug] = { name: data[slug].name, state: "error", progress: 0, stage: "Controllo non raggiungibile", seconds: 0 };
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
    data[slug] = { name: st.name, state: action === "stop" ? "stopping" : "starting", progress: 5, stage: "…", seconds: 0 };
    render();
    fetch(API + "/api/projects/" + slug + "/" + action, { method: "POST", headers: { "X-Projects-Ctl": "1" } }).then(poll);
  }

  setInterval(render, 1500);
  poll();
})();