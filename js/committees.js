/* C2 - Committee explorer.
   The markup is a <details> accordion and stays fully readable without JavaScript.
   From 881px wide the same markup becomes vertical tabs (role=tablist/tab/tabpanel, arrow/Home/End keys,
   roving tabindex) and it switches back live when the window is resized.
   Deep links: #committee-<id> opens (accordion) or selects (tabs) that committee. */
(function () {
  "use strict";

  var roots = document.querySelectorAll("[data-c2]");
  if (!roots.length) return;
  var mq = window.matchMedia ? window.matchMedia("(min-width: 881px)") : null;

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function setHash(id) {
    try { if (window.history && history.replaceState) history.replaceState(history.state, "", "#" + id); } catch (e) { /* ignore */ }
  }

  function init(root) {
    var items = [], tabs = [], current = 0, tabsOn = false;
    var expand = root.querySelector("[data-c2-expand]");

    var list = document.createElement("div");
    list.className = "c2-tablist";
    list.setAttribute("role", "tablist");
    list.setAttribute("aria-orientation", "vertical");
    list.setAttribute("aria-label", root.getAttribute("data-c2-label") || "Committees");
    list.hidden = true;

    /* Build the tab list from the accordion, in document order (group labels become decorative captions) */
    each(root.children, function (el) {
      if (el.classList.contains("c2-group")) {
        var g = document.createElement("p");
        g.className = "c2-tabgroup";
        g.setAttribute("aria-hidden", "true");
        g.textContent = el.textContent;
        list.appendChild(g);
        return;
      }
      if (!el.classList.contains("c2-item")) return;
      var body = el.querySelector(".c2-body"), name = el.querySelector(".c2-sum-name");
      if (!body || !name) return;
      var i = items.length;
      if (!el.id) el.id = "c2-committee-" + (i + 1);
      if (!body.id) body.id = el.id + "-panel";

      var b = document.createElement("button");
      b.type = "button";
      b.className = "c2-tab";
      b.id = el.id + "-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", body.id);
      b.setAttribute("aria-selected", "false");
      b.tabIndex = -1;
      var medal = el.querySelector(".c2-summary .c2-medal");
      if (medal) b.appendChild(medal.cloneNode(true));
      var n = document.createElement("span");
      n.className = "c2-tab-name";
      n.textContent = name.textContent;
      b.appendChild(n);
      /* Member count: a small pill ("1", "TBA"); the full wording is kept for screen readers */
      var count = el.getAttribute("data-c2-count");
      if (count) {
        var num = /^\d+/.exec(count);
        var pill = document.createElement("span");
        pill.className = "c2-tab-count" + (num ? "" : " c2-is-tba");
        pill.setAttribute("aria-hidden", "true");
        pill.textContent = num ? num[0] : "TBA";
        var sr = document.createElement("span");
        sr.className = "sr-only";
        sr.textContent = ", " + count;
        b.appendChild(sr);
        b.appendChild(pill);
      }
      b.addEventListener("click", function () { select(i, false, true); });
      list.appendChild(b);

      var summary = el.querySelector(".c2-summary");
      if (summary) summary.addEventListener("click", function (e) {
        if (tabsOn) { e.preventDefault(); return; }
        if (!el.open) setHash(el.id);
      });
      el.addEventListener("toggle", function () {
        if (tabsOn) return;
        if (el.open) current = i;
        syncExpand();
      });

      items.push(el);
      tabs.push(b);
    });
    if (!items.length) return;
    root.insertBefore(list, root.firstChild);

    /* Previous / next committee (tabs mode only) */
    var pager = document.createElement("div");
    pager.className = "c2-pager";
    pager.hidden = true;
    function pagerButton(cls, dir, arrow) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "c2-pager-btn " + cls;
      var d = document.createElement("span");
      d.className = "c2-pager-dir";
      d.textContent = dir;
      var a = document.createElement("span");
      a.className = "c2-pager-arrow";
      a.setAttribute("aria-hidden", "true");
      a.textContent = arrow;
      var t = document.createElement("span");
      t.className = "c2-pager-name";
      btn.appendChild(a);
      btn.appendChild(d);
      btn.appendChild(t);
      pager.appendChild(btn);
      return btn;
    }
    var prev = pagerButton("c2-pager-prev", "Previous committee", "\u2190");
    var next = pagerButton("c2-pager-next", "Next committee", "\u2192");
    function page(step, btn) {
      var i = current + step;
      if (i < 0 || i >= items.length) return;
      select(i, false, true);
      if (btn.hidden) tabs[current].focus();
    }
    prev.addEventListener("click", function () { page(-1, prev); });
    next.addEventListener("click", function () { page(1, next); });
    root.appendChild(pager);
    function syncPager() {
      prev.hidden = current === 0;
      next.hidden = current === items.length - 1;
      if (!prev.hidden) prev.querySelector(".c2-pager-name").textContent = tabs[current - 1].querySelector(".c2-tab-name").textContent;
      if (!next.hidden) next.querySelector(".c2-pager-name").textContent = tabs[current + 1].querySelector(".c2-tab-name").textContent;
    }

    function allOpen() { return items.every(function (it) { return it.open; }); }
    function syncExpand() { if (expand) expand.textContent = allOpen() ? "Collapse all" : "Expand all"; }
    if (expand) expand.addEventListener("click", function () {
      var open = !allOpen();
      items.forEach(function (it) { it.open = open; });
      syncExpand();
    });

    function select(i, focus, user) {
      current = i;
      items.forEach(function (it, j) {
        var on = j === i;
        it.classList.toggle("c2-is-active", on);
        it.open = on;
        tabs[j].setAttribute("aria-selected", on ? "true" : "false");
        tabs[j].tabIndex = on ? 0 : -1;
      });
      syncPager();
      if (focus) tabs[i].focus();
      if (user) setHash(items[i].id);
    }

    list.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return; /* leave browser shortcuts (e.g. Alt+Left = back) alone */
      var k = e.key, n = tabs.length, i;
      if (k === "ArrowDown" || k === "ArrowRight") i = (current + 1) % n;
      else if (k === "ArrowUp" || k === "ArrowLeft") i = (current - 1 + n) % n;
      else if (k === "Home") i = 0;
      else if (k === "End") i = n - 1;
      else return;
      e.preventDefault();
      select(i, true, true);
    });

    function apply() {
      var on = !!(mq && mq.matches);
      if (on && !items[current].open) {
        for (var j = 0; j < items.length; j++) if (items[j].open) { current = j; break; }
      }
      tabsOn = on;
      root.classList.toggle("c2-is-tabs", on);
      list.hidden = !on;
      pager.hidden = !on;
      if (expand) expand.hidden = on;
      items.forEach(function (it, i) {
        var s = it.querySelector(".c2-summary"), body = it.querySelector(".c2-body");
        if (on) {
          if (s) { s.tabIndex = -1; s.setAttribute("aria-hidden", "true"); }
          body.setAttribute("role", "tabpanel");
          body.setAttribute("aria-labelledby", tabs[i].id);
          body.tabIndex = 0;
        } else {
          if (s) { s.removeAttribute("tabindex"); s.removeAttribute("aria-hidden"); }
          body.removeAttribute("role");
          body.removeAttribute("aria-labelledby");
          body.removeAttribute("tabindex");
          it.classList.remove("c2-is-active");
        }
      });
      if (on) select(current, false, false);
      else syncExpand();
    }

    /* #committee-<id>: select or open that committee and bring it into view */
    function fromHash(scroll) {
      var id = "";
      try { id = decodeURIComponent((window.location.hash || "").slice(1)); } catch (e) { return; }
      if (!id) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id !== id && items[i].id + "-panel" !== id) continue;
        if (tabsOn) select(i, false, false);
        else { items[i].open = true; current = i; }
        if (scroll) {
          var target = tabsOn ? root : items[i];
          var go = function () { target.scrollIntoView({ block: "start" }); };
          if (window.requestAnimationFrame) window.requestAnimationFrame(go); else setTimeout(go, 0);
        }
        return;
      }
    }

    if (mq) { if (mq.addEventListener) mq.addEventListener("change", apply); else if (mq.addListener) mq.addListener(apply); }
    apply();
    fromHash(true);
    window.addEventListener("hashchange", function () { fromHash(true); });
  }

  each(roots, function (root) {
    try { init(root); } catch (e) { /* leave the plain accordion in place */ }
  });
})();
