"use strict";!function(){var e=document.documentElement,t=window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):{matches:!1},n=function(){return!t.matches};"object"==typeof CONFERENCE&&null!==CONFERENCE&&(document.querySelectorAll("[data-conf]").forEach(function(e){var t=CONFERENCE[e.getAttribute("data-conf")];"string"==typeof t&&(e.textContent=t)}),document.querySelectorAll("[data-conf-mailto]").forEach(function(e){"string"==typeof CONFERENCE.email&&/^[\w.+-]+@[\w.-]+$/.test(CONFERENCE.email)&&(e.setAttribute("href","mailto:"+CONFERENCE.email),e.textContent=CONFERENCE.email)}));var o=document.querySelector("[data-countdown]");if(o&&"object"==typeof CONFERENCE&&null!==CONFERENCE){var r=Date.parse(CONFERENCE.startDateISO),a=document.querySelector(".cd-live"),i={d:o.querySelector("[data-cd-days]"),h:o.querySelector("[data-cd-hours]"),m:o.querySelector("[data-cd-mins]"),s:o.querySelector("[data-cd-secs]")},c={},l=null,d=function(e){return String(e).padStart(2,"0")},s=function(e,t){var o=i[e];if(o&&c[e]!==t){var r=!(e in c);c[e]=t,o.textContent=t,!r&&n()&&(o.classList.remove("tick"),o.offsetWidth,o.classList.add("tick"))}},u=function(){var e=Math.max(0,r-Date.now()),t=Math.floor(e/1e3);s("d",String(Math.floor(t/86400))),s("h",d(Math.floor(t/3600)%24)),s("m",d(Math.floor(t/60)%60)),s("s",d(t%60)),0===e&&a&&(o.hidden=!0,a.hidden=!1,null!==l&&clearInterval(l))};isNaN(r)||(u(),l=setInterval(u,1e3))}var f=document.querySelector(".nav-toggle"),E=document.querySelector(".main-nav");if(f&&E){var m=function(e){E.classList.toggle("open",e),f.setAttribute("aria-expanded",e?"true":"false")};f.addEventListener("click",function(){m(!E.classList.contains("open"))}),document.addEventListener("keydown",function(e){"Escape"===e.key&&E.classList.contains("open")&&(m(!1),f.focus())}),document.addEventListener("click",function(e){!E.classList.contains("open")||E.contains(e.target)||f.contains(e.target)||m(!1)}),E.addEventListener("click",function(e){e.target.closest("a")&&m(!1)})}var v=document.querySelector("[data-program-download]"),p=document.querySelector("[data-program-note]");v&&p&&v.addEventListener("click",function(e){e.preventDefault(),p.hidden=!1});var y=document.querySelector("[data-conf-explorer]"),h=document.querySelector("[data-conf-grid]"),g=document.querySelectorAll(".conf-detail");if(y&&h&&g.length){var C=h.querySelectorAll("[data-conf-open]"),w=function(){y.classList.remove("active"),g.forEach(function(e){e.hidden=!0}),C.forEach(function(e){e.setAttribute("aria-expanded","false")})};C.forEach(function(e){e.addEventListener("click",function(){var t=document.getElementById("conf-detail-"+e.getAttribute("data-conf-open"));if(t)if("true"!==e.getAttribute("aria-expanded")){y.classList.add("active"),g.forEach(function(e){e.hidden=!0}),C.forEach(function(e){e.setAttribute("aria-expanded","false")}),e.setAttribute("aria-expanded","true"),t.hidden=!1;var n=t.querySelector("h3");n&&(n.setAttribute("tabindex","-1"),n.focus({preventScroll:!1}))}else w()})}),document.querySelectorAll("[data-conf-back]").forEach(function(e){e.addEventListener("click",function(){w();var e=C[0];e&&e.focus({preventScroll:!0})})}),h.addEventListener("keydown",function(e){if("ArrowDown"===e.key||"ArrowUp"===e.key||"ArrowRight"===e.key||"ArrowLeft"===e.key){var t=Array.prototype.slice.call(C),n=t.indexOf(document.activeElement);if(!(n<0)){e.preventDefault();var o="ArrowDown"===e.key||"ArrowRight"===e.key?(n+1)%t.length:(n-1+t.length)%t.length;t[o].focus(),y.classList.contains("active")&&t[o].click()}}}),document.addEventListener("keydown",function(e){"Escape"===e.key&&y.classList.contains("active")&&w()})}var N=document.querySelector("[data-year]");N&&(N.textContent=String((new Date).getFullYear())),document.querySelectorAll(".card-grid, .info-grid, .gallery-grid, .table tbody").forEach(function(e){Array.prototype.forEach.call(e.children,function(e,t){e.classList.add("reveal"),e.setAttribute("data-rd",String(Math.min(70*t,420)))})});var b=document.querySelectorAll(".reveal"),A=function(e){e.classList.add("in")};if(n()&&"IntersectionObserver"in window&&b.length){var S=new IntersectionObserver(function(e){e.forEach(function(e){if(e.isIntersecting){S.unobserve(e.target);var t=parseInt(e.target.getAttribute("data-rd")||"0",10);t>0?setTimeout(function(){A(e.target)},t):A(e.target)}})},{threshold:.12});b.forEach(function(e){var t=e.getBoundingClientRect();if(t.top<window.innerHeight&&t.bottom>0){var n=parseInt(e.getAttribute("data-rd")||"0",10);n>0?setTimeout(function(){A(e)},n):A(e)}else S.observe(e)}),setTimeout(function(){b.forEach(A)},3e3)}else b.forEach(A);var L=document.querySelector(".site-header"),q=document.createElement("div");q.className="scroll-progress",q.setAttribute("aria-hidden","true"),document.body.appendChild(q);var R=document.createElement("button");R.type="button",R.className="to-top",R.textContent="↑",R.setAttribute("aria-label","Back to top"),document.body.appendChild(R),R.addEventListener("click",function(){window.scrollTo({top:0,behavior:n()?"smooth":"auto"})});var k=!1,O=function(){k=!1;var t=window.scrollY,n=e.scrollHeight-window.innerHeight;e.style.setProperty("--scroll-p",n>0?String(Math.min(t/n,1)):"0"),L&&L.classList.toggle("scrolled",t>8),R.classList.toggle("show",t>600)};window.addEventListener("scroll",function(){k||(k=!0,window.requestAnimationFrame(O))},{passive:!0}),O(),window.matchMedia&&window.matchMedia("(hover: hover) and (pointer: fine)").matches&&document.querySelectorAll(".card").forEach(function(e){e.addEventListener("pointermove",function(t){var n=e.getBoundingClientRect();e.style.setProperty("--mx",t.clientX-n.left+"px"),e.style.setProperty("--my",t.clientY-n.top+"px")})});var x=document.querySelector("[data-map-load]");x&&"object"==typeof CONFERENCE&&null!==CONFERENCE&&"string"==typeof CONFERENCE.mapQuery&&CONFERENCE.mapQuery.length>0&&CONFERENCE.mapQuery.length<=200&&x.addEventListener("click",function(){var e=x.closest(".map-surface");if(e&&!e.querySelector("iframe")){var t=document.createElement("iframe");t.src="https://www.google.com/maps?q="+encodeURIComponent(CONFERENCE.mapQuery)+"&output=embed",t.title="Interactive map of the conference venue",t.setAttribute("loading","lazy"),t.setAttribute("referrerpolicy","strict-origin-when-cross-origin"),t.setAttribute("allowfullscreen","true"),e.appendChild(t),e.classList.add("loaded")}});var F=document.querySelector("[data-copy-email]");if(F&&"object"==typeof CONFERENCE&&null!==CONFERENCE&&"string"==typeof CONFERENCE.email&&/^[\w.+-]+@[\w.-]+$/.test(CONFERENCE.email)){var I=function(e){var t=document.createElement("textarea");t.value=e,t.setAttribute("readonly",""),t.setAttribute("aria-hidden","true"),t.style.position="fixed",t.style.left="-9999px",document.body.appendChild(t),t.select();var n=!1;try{n=document.execCommand("copy")}catch(e){n=!1}return document.body.removeChild(t),n};F.hidden=!1;var M=F.textContent,D=null,T=function(e){!function(e,t){F.textContent=e,F.classList.toggle("ok",t),null!==D&&clearTimeout(D),D=setTimeout(function(){F.textContent=M,F.classList.remove("ok")},2e3)}(e?"Copied ✓":"Copy failed",e)};F.addEventListener("click",function(){navigator.clipboard&&"function"==typeof navigator.clipboard.writeText?navigator.clipboard.writeText(CONFERENCE.email).then(function(){T(!0)},function(){T(I(CONFERENCE.email))}):T(I(CONFERENCE.email))})}}();
/* Top information bar + floating quick links: fill phone/email from
   conference-data.js and slide the quick links in once the visitor scrolls. */
!function(){
  var C = (typeof CONFERENCE === "object" && CONFERENCE !== null) ? CONFERENCE : {};
  var email = typeof C.email === "string" && /^[\w.+-]+@[\w.-]+$/.test(C.email) ? C.email : "";
  var phone = typeof C.phone === "string" && /^\+?[\d\s()-]{6,24}$/.test(C.phone.trim()) ? C.phone.trim() : "";

  if (email) document.querySelectorAll("[data-qc-mail]").forEach(function(a){ a.setAttribute("href", "mailto:" + email); });
  if (email) document.querySelectorAll(".utility-bar [data-qc-mail]").forEach(function(a){ a.setAttribute("aria-label", "Email " + email); });
  if (phone) {
    var tel = "tel:" + phone.replace(/[^\d+]/g, "");
    document.querySelectorAll("[data-qc-tel]").forEach(function(a){ a.setAttribute("href", tel); });
    document.querySelectorAll(".utility-bar [data-qc-tel]").forEach(function(a){ a.setAttribute("aria-label", "Call " + phone); });
    document.querySelectorAll("[data-qc-phone]").forEach(function(el){ el.hidden = false; });
  }

  var dock = document.querySelector("[data-quick-dock]");
  if (!dock) return;

  /* Narrow screens: the links fold into one button that fans them out (see css/main.css). */
  var toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "qd-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Quick links: contact, call for papers, dates and venue");
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
  dock.appendChild(toggle);
  var setOpen = function(open){ dock.classList.toggle("open", open); toggle.setAttribute("aria-expanded", open ? "true" : "false"); };
  toggle.addEventListener("click", function(){ setOpen(!dock.classList.contains("open")); });
  dock.addEventListener("click", function(e){ if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("click", function(e){ if (dock.classList.contains("open") && !dock.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && dock.classList.contains("open")) { setOpen(false); toggle.focus(); } });

  var ticking = false;
  var update = function(){
    ticking = false;
    var show = window.scrollY > 420;
    dock.classList.toggle("show", show);
    if (!show) setOpen(false);
  };
  window.addEventListener("scroll", function(){ if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }, { passive: true });
  update();
}();
/* Conference tracks (conference pages): an accordion on phones and tablets.
   From 881px wide the same markup becomes tabs: a track list on the left and
   the selected track's topics on the right (see css/main.css). */
!function(){
  var box = document.querySelector("[data-tracks]");
  if (!box) return;
  var tracks = [].slice.call(box.querySelectorAll(".track"));
  if (!tracks.length) return;
  var current = 0, tabsOn = false;
  var allOpen = function(){ return tracks.every(function(t){ return t.open; }); };

  var expand = box.querySelector("[data-tracks-expand]");
  var syncExpand = function(){ if (expand) expand.textContent = allOpen() ? "Collapse all" : "Expand all"; };
  if (expand) {
    expand.hidden = false;
    expand.addEventListener("click", function(){ var open = !allOpen(); tracks.forEach(function(t){ t.open = open; }); syncExpand(); });
  }

  var list = document.createElement("div");
  list.className = "tracks-tablist";
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-orientation", "vertical");
  list.setAttribute("aria-label", "Conference tracks");
  list.hidden = true;
  var tabs = tracks.map(function(t, i){
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tracks-tab";
    b.id = t.id + "-tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", t.id + "-topics");
    b.innerHTML = '<span class="n"></span><span class="t"></span>';
    b.querySelector(".n").textContent = t.querySelector(".track-num").textContent;
    b.querySelector(".t").textContent = t.querySelector(".track-title").textContent;
    b.addEventListener("click", function(){ select(i, false); });
    list.appendChild(b);
    t.querySelector(".track-topics").id = t.id + "-topics";
    t.querySelector("summary").addEventListener("click", function(e){ if (tabsOn) e.preventDefault(); });
    t.addEventListener("toggle", function(){ if (!tabsOn) syncExpand(); });
    return b;
  });
  box.insertBefore(list, tracks[0]);

  function select(i, focus){
    current = i;
    tracks.forEach(function(t, j){
      var on = j === i;
      t.classList.toggle("is-active", on);
      tabs[j].setAttribute("aria-selected", on ? "true" : "false");
      tabs[j].tabIndex = on ? 0 : -1;
    });
    tracks[i].open = true;
    if (focus) tabs[i].focus();
  }
  list.addEventListener("keydown", function(e){
    var k = e.key, n = tabs.length, i = current;
    if (k === "ArrowDown" || k === "ArrowRight") i = (current + 1) % n;
    else if (k === "ArrowUp" || k === "ArrowLeft") i = (current - 1 + n) % n;
    else if (k === "Home") i = 0;
    else if (k === "End") i = n - 1;
    else return;
    e.preventDefault();
    select(i, true);
  });

  var mq = window.matchMedia("(min-width: 881px)");
  var apply = function(){
    tabsOn = mq.matches;
    box.classList.toggle("is-tabs", tabsOn);
    list.hidden = !tabsOn;
    tracks.forEach(function(t, i){
      var s = t.querySelector("summary"), ul = t.querySelector(".track-topics");
      if (tabsOn) {
        s.tabIndex = -1; s.setAttribute("aria-hidden", "true");
        ul.setAttribute("role", "tabpanel"); ul.setAttribute("aria-labelledby", tabs[i].id);
      } else {
        s.removeAttribute("tabindex"); s.removeAttribute("aria-hidden");
        ul.removeAttribute("role"); ul.removeAttribute("aria-labelledby");
        t.classList.remove("is-active");
      }
    });
    if (tabsOn) select(current, false);
    else syncExpand();
  };
  if (mq.addEventListener) mq.addEventListener("change", apply); else mq.addListener(apply);
  apply();
}();
