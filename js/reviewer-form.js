/* =============================================================
   Reviewer application form (reviewer-application.html)
   - 5 steps with a progress indicator; each step is checked
     before moving on, and every step is checked again on submit.
   - Conditional questions: "Other" boxes, the reviewing-experience
     question (only after "Yes"), and the track picker (only for the
     conferences ticked in the question before it).
   - Phone: the country code follows the Country answer until the
     visitor picks a code themselves.
   - Keywords: typed chips (1 to 5).
   - CV: drag and drop or browse; PDF / DOC / DOCX up to 5 MB.
   - The last step shows a summary of all answers with Edit links.
   - Answers (not the CV) are kept in sessionStorage, so a reload
     does not lose them; cleared on submit and when the tab closes.
   - Sends with XMLHttpRequest to php/reviewer-apply.php (a normal
     form post is blocked by the site's CSP: form-action 'none';
     connect-src 'self' allows this request).
   ============================================================= */
!function(){
  "use strict";
  var shell = document.querySelector("[data-rv]");
  if (!shell) return;
  var form = shell.querySelector("[data-rv-form]");
  var panels = [].slice.call(form.querySelectorAll(".rv-panel"));
  var stepBtns = [].slice.call(shell.querySelectorAll(".rv-steps [data-goto]"));
  var bar = shell.querySelector("[data-rv-bar]");
  var statusEl = shell.querySelector("[data-rv-status]");
  var formError = shell.querySelector("[data-rv-form-error]");
  var endpoint = shell.getAttribute("data-endpoint");
  var STORE = "iceast-reviewer-draft";
  var MAX_CV = 5 * 1024 * 1024, MAX_KW = 5;
  var CV_TYPES = { pdf: "PDF", doc: "DOC", docx: "DOCX" };
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = 0, furthest = 0, token = "", cvFile = null, sending = false, nameTouched = false, codeTouched = false;

  shell.hidden = false;

  /* ---------- Small helpers ---------- */
  function qs(sel, root){ return (root || form).querySelector(sel); }
  function qsa(sel, root){ return [].slice.call((root || form).querySelectorAll(sel)); }
  function qOf(name){ return qs('[data-q="' + name + '"]'); }
  function typeOf(q){ return q.getAttribute("data-type"); }
  function stepName(i){ return panels[i].querySelector("h2").textContent; }
  function checked(name){ return qsa('input[name="' + name + '[]"]:checked, input[type=radio][name="' + name + '"]:checked').map(function(i){ return i.value; }); }
  function isShown(q){ return !q.hidden; }
  function fmtSize(b){ return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1) + " MB"; }
  function labelText(q){ var t = q.querySelector(".rv-qtext"); return t ? t.textContent.replace(/\s*\*\s*$/, "").trim() : ""; }
  function el(tag, cls, text){ var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  /* ---------- Sticky step bar sits just below the site header ---------- */
  var header = document.querySelector(".site-header");
  function headerH(){ return header ? header.getBoundingClientRect().height : 0; }
  function setSticky(){ shell.style.setProperty("--rv-sticky", Math.round(headerH()) + 10 + "px"); }
  setSticky();
  if (header && window.ResizeObserver) new ResizeObserver(setSticky).observe(header);
  else window.addEventListener("resize", setSticky);

  /* ---------- Country suggestions (from the phone code list) ---------- */
  var codeSel = form.elements.phoneCode, phoneNum = form.elements.phoneNumber;
  var countryNames = [].map.call(codeSel.options, function(o){ return o.value.replace(/\s*\(\+\d+\)$/, ""); });
  var dl = el("datalist"); dl.id = "rv-countries";
  countryNames.forEach(function(c){ var o = el("option"); o.value = c; dl.appendChild(o); });
  form.appendChild(dl);

  /* ---------- Date on the declaration ---------- */
  var today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  qsa("[data-rv-today]").forEach(function(i){ i.value = today; });

  /* ---------- Errors ---------- */
  function errEl(q){ var c = q.children; for (var i = c.length - 1; i >= 0; i--) if (c[i].classList.contains("rv-error")) return c[i]; return null; }
  function setError(q, msg, target){
    var p = target || errEl(q);
    if (!p) return;
    p.textContent = msg || "";
    p.hidden = !msg;
    if (target) {
      var oi = document.getElementById(target.id.replace(/-err$/, ""));
      if (oi) { oi.classList.toggle("is-invalid", !!msg); if (msg) oi.setAttribute("aria-invalid", "true"); else oi.removeAttribute("aria-invalid"); }
      return;
    }
    q.classList.toggle("is-invalid", !!msg);
    qsa(".rv-input, .rv-tag-entry", q).forEach(function(i){
      if (i.closest(".rv-other")) return;
      if (msg) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid");
    });
    if (q.matches("fieldset")) { if (msg) q.setAttribute("aria-invalid", "true"); else q.removeAttribute("aria-invalid"); }
  }

  /* ---------- Checks ---------- */
  var EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
  function validUrl(v){
    try { var u = new URL(v); return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.indexOf(".") > 0; } catch (e) { return false; }
  }
  /* ORCID iD: 16 characters with an ISO 7064 11,2 check digit. Returns 0000-0000-0000-000X or null. */
  function orcid(v){
    var d = v.trim().replace(/^(https?:\/\/)?(www\.)?orcid\.org\//i, "").replace(/[\s-]/g, "").toUpperCase();
    if (!/^\d{15}[\dX]$/.test(d)) return null;
    var total = 0;
    for (var i = 0; i < 15; i++) total = (total + +d[i]) * 2;
    var c = (12 - total % 11) % 11;
    if ((c === 10 ? "X" : String(c)) !== d[15]) return null;
    return d.match(/.{4}/g).join("-");
  }
  function dialDigits(){ var m = /\(\+(\d+)\)$/.exec(codeSel.value); return m ? m[1] : ""; }

  /* Validate one question; returns true when OK. show = display its error. */
  function validate(q, show, showOther){
    if (showOther === undefined) showOther = show;
    if (!isShown(q)) return true;
    var name = q.getAttribute("data-q"), type = typeOf(q), req = q.hasAttribute("data-required");
    var msg = "", otherMsg = "", otherErr = null, v, input;
    switch (type) {
      case "radio": case "checkbox":
        var vals = checked(name);
        if (req && !vals.length) msg = type === "checkbox" ? "Please select at least one option." : "Please choose one option.";
        var other = qs(".rv-other", q);
        if (other) {
          otherErr = qs(".rv-error", other);
          if (vals.indexOf("Other") !== -1 && !qs("input", other).value.trim()) otherMsg = "Please specify.";
        }
        break;
      case "trackpick":
        if (req && !qsa(".rv-tp-group:not([hidden]) input[name='trackDetail[]']:checked", q).length) msg = "Please tick at least one track.";
        break;
      case "keywords":
        var n = kwList().length;
        if (req && !n) msg = "Please add at least one keyword (type it, then press Enter).";
        else if (n > MAX_KW) msg = "Please keep to 5 keywords or fewer.";
        break;
      case "phone":
        v = phoneNum.value.trim();
        var digits = v.replace(/\D/g, "");
        if (!codeSel.value) msg = "Please choose a country code.";
        else if (!v) msg = "Please enter your phone number.";
        else if (!/^[\d\s().\-]+$/.test(v)) msg = "Please use digits only (spaces and dashes are fine).";
        else if (digits.length < 4 || digits.length + dialDigits().length > 15) msg = "Please check the number: enter it without the country code.";
        break;
      case "file":
        if (!cvFile) msg = "Please attach your CV (PDF, DOC or DOCX, up to 5 MB).";
        break;
      case "consent":
        if (req && !qs("input", q).checked) msg = name === "declaration" ? "Please confirm the declaration to submit your application." : "Please tick this box to submit your application.";
        break;
      case "date":
        return true;
      default:   /* text, textarea, email, url, orcid, number */
        input = qs(".rv-input", q);
        v = input.value.trim();
        if (!v) { if (req) msg = "Please answer this question."; }
        else if (type === "email" && !EMAIL.test(v)) msg = "Please enter a valid email address, for example name@university.edu.";
        else if (type === "url" && !validUrl(v)) msg = "Please enter a full web address starting with https://";
        else if (type === "orcid" && !orcid(v)) msg = "Please check your ORCID iD: it should be 16 digits, like 0000-0002-1825-0097.";
        else if (type === "number" && !(/^\d+$/.test(v) && +v >= +input.min && +v <= +input.max)) msg = "Please enter a whole number between " + input.min + " and " + input.max + ".";
        else if ((name === "fullName" || name === "applicantName") && v.length < 3) msg = "Please enter your full name.";
        else if (name === "altEmail" && v.toLowerCase() === form.elements.email.value.trim().toLowerCase()) msg = "This is the same as your main email address. Leave it empty or enter a different one.";
    }
    var ok = !msg && !otherMsg;
    if (show) setError(q, msg);
    else if (!msg && q.classList.contains("is-invalid")) setError(q, "");
    if (otherErr && (showOther || !otherMsg)) setError(q, showOther ? otherMsg : "", otherErr);
    q.classList.toggle("is-complete", ok && hasAnswer(q));
    return ok;
  }
  function hasAnswer(q){
    var name = q.getAttribute("data-q");
    switch (typeOf(q)) {
      case "radio": case "checkbox": return checked(name).length > 0;
      case "trackpick": return qsa(".rv-tp-group:not([hidden]) input[name='trackDetail[]']:checked", q).length > 0;
      case "keywords": return kwList().length > 0;
      case "phone": return !!phoneNum.value.trim();
      case "file": return !!cvFile;
      case "consent": return qs("input", q).checked;
      case "date": return false;
      default: return !!qs(".rv-input", q).value.trim();
    }
  }
  function validatePanel(i, show){
    var ok = true, first = null;
    qsa(".rv-q", panels[i]).forEach(function(q){ if (!validate(q, show) && !first) { ok = false; first = q; } });
    if (show) stepBtns[i].classList.toggle("has-error", !ok);
    else if (ok) stepBtns[i].classList.remove("has-error");
    return first;
  }
  function focusQuestion(q){
    var t = qs(".rv-input.is-invalid", q) || qs("input:not([type=hidden]):not([readonly]):not([tabindex='-1']), select, textarea", q);
    if (t && t.closest("[hidden]")) t = null;
    q.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    if (t) setTimeout(function(){ t.focus({ preventScroll: true }); }, reduced ? 0 : 250);
  }

  /* ---------- Steps ---------- */
  function scrollToShell(){
    var top = shell.getBoundingClientRect().top + window.pageYOffset - headerH() - 16;
    if (window.pageYOffset > top) window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
  }
  function go(i, mode){
    if (i === current && mode !== "init") return;
    var back = i < current;
    panels[current].hidden = true;
    current = i;
    var p = panels[i];
    p.hidden = false;
    if (!reduced && mode !== "init") {
      p.classList.remove("is-entering", "is-entering-back");
      void p.offsetWidth;
      p.classList.add(back ? "is-entering-back" : "is-entering");
    }
    if (i === panels.length - 1) { prefillName(); buildSummary(); }
    updateSteps();
    formError.hidden = true;
    if (mode !== "init") {
      scrollToShell();
      var h = p.querySelector("h2");
      setTimeout(function(){ h.focus({ preventScroll: true }); }, 30);
    }
    save();
  }
  function updateSteps(){
    stepBtns.forEach(function(b, j){
      if (j === current) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      b.disabled = j > furthest;
      b.classList.toggle("is-done", j < furthest && j !== current && !b.classList.contains("has-error"));
      b.setAttribute("aria-label", "Step " + (j + 1) + ": " + stepName(j) + (j < furthest && j !== current ? " (completed)" : ""));
    });
    bar.style.width = ((current + 1) / panels.length * 100) + "%";
    statusEl.textContent = "Step " + (current + 1) + " of " + panels.length + ": " + stepName(current);
  }
  qsa("[data-next]").forEach(function(b){
    b.addEventListener("click", function(){
      addPendingKeyword();
      var bad = validatePanel(current, true);
      if (bad) { focusQuestion(bad); return; }
      furthest = Math.max(furthest, current + 1);
      go(current + 1);
    });
  });
  qsa("[data-back]").forEach(function(b){ b.addEventListener("click", function(){ go(current - 1); }); });
  stepBtns.forEach(function(b, j){ b.addEventListener("click", function(){ if (!b.disabled) go(j); }); });

  /* Enter in a one-line box moves to the next box instead of submitting */
  form.addEventListener("keydown", function(e){
    var t = e.target;
    if (e.key !== "Enter" || t.tagName !== "INPUT" || /^(checkbox|radio|file)$/.test(t.type) || t.classList.contains("rv-tag-entry")) return;
    e.preventDefault();
    var fields = qsa(".rv-input:not([readonly]), .rv-tag-entry", panels[current]).filter(function(f){ return f.offsetParent; });
    var k = fields.indexOf(t);
    if (k > -1 && k < fields.length - 1) fields[k + 1].focus();
    else { var nx = qs("[data-next]", panels[current]); if (nx) nx.click(); }
  });

  /* ---------- Conditional questions ---------- */
  function reveal(node){ if (!reduced) { node.classList.remove("is-revealing"); void node.offsetWidth; node.classList.add("is-revealing"); } }
  function updateConditions(animate){
    qsa("[data-showif]").forEach(function(q){
      var rule = q.getAttribute("data-showif").split("=");
      var show = checked(rule[0]).indexOf(rule[1]) !== -1;
      if (show === !q.hidden) return;
      q.hidden = !show;
      if (show && animate) reveal(q);
      if (!show) setError(q, "");
    });
    qsa(".rv-other").forEach(function(o){
      var name = o.getAttribute("data-other-for");
      var show = checked(name).indexOf("Other") !== -1;
      if (show === !o.hidden) return;
      o.hidden = !show;
      if (show && animate) { reveal(o); var oi = qs("input", o); setTimeout(function(){ oi.focus(); }, 0); }
      if (!show) setError(o.closest(".rv-q"), "", qs(".rv-error", o));
    });
    /* track picker: one group per ticked conference */
    var tp = qOf("trackDetail"), confs = checked("tracks"), any = false;
    qsa(".rv-tp-group", tp).forEach(function(g){
      var show = confs.indexOf(g.getAttribute("data-conf")) !== -1;
      if (show) any = true;
      if (show === !g.hidden) return;
      g.hidden = !show;
      if (show && animate) reveal(g);
    });
    if (any === tp.hidden) { tp.hidden = !any; if (any && animate) reveal(tp); if (!any) setError(tp, ""); }
  }

  /* ---------- Track picker: topics inside each track ---------- */
  var tpQ = qOf("trackDetail");
  function syncTrack(track){
    var box = qs("input[name='trackDetail[]']", track);
    var picked = qsa("input[name='topics[]']:checked", track).length, all = qsa("input[name='topics[]']", track).length;
    qs("[data-rv-tp-count]", track).textContent = picked ? picked + " of " + all : String(all);
    track.classList.toggle("has-topics", picked > 0);
    track.classList.toggle("is-on", box.checked);
  }
  qsa(".rv-tp-track", tpQ).forEach(function(track){
    var btn = qs(".rv-tp-more", track), panel = qs(".rv-tp-topics", track), box = qs("input[name='trackDetail[]']", track);
    btn.addEventListener("click", function(){
      var open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      panel.hidden = !open;
      if (open) reveal(panel);
    });
    panel.addEventListener("change", function(e){
      if (e.target.checked && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
      syncTrack(track);
    });
    box.addEventListener("change", function(){
      if (!box.checked) qsa("input[name='topics[]']:checked", track).forEach(function(c){ c.checked = false; });
      syncTrack(track);
    });
    syncTrack(track);
  });

  /* ---------- Keywords (chips) ---------- */
  var kwQ = qOf("keywords"), kwBox = qs("[data-rv-tags]", kwQ), kwUl = qs("[data-rv-tag-list]", kwQ), kwEntry = qs(".rv-tag-entry", kwQ), kwCount = qs("[data-rv-tag-count]", kwQ);
  function kwList(){ return qsa("input[name='keywords[]']", kwUl).map(function(i){ return i.value; }); }
  function kwSync(){
    var n = kwList().length;
    kwCount.textContent = n + " of " + MAX_KW + " keywords";
    kwEntry.disabled = n >= MAX_KW;
    kwEntry.placeholder = n >= MAX_KW ? "Maximum of 5 keywords reached" : (n ? "Add another keyword" : "Type a keyword and press Enter");
  }
  function addKeyword(raw, silent){
    raw.split(/[,;\n]/).forEach(function(part){
      var k = part.replace(/\s+/g, " ").trim().slice(0, 60);
      if (!k || kwList().length >= MAX_KW) return;
      if (kwList().some(function(x){ return x.toLowerCase() === k.toLowerCase(); })) return;
      var li = el("li", "rv-tag"), span = el("span", null, k), rm = el("button", "rv-tag-x", "×"), hid = el("input");
      rm.type = "button"; rm.setAttribute("aria-label", "Remove keyword " + k);
      hid.type = "hidden"; hid.name = "keywords[]"; hid.value = k;
      rm.addEventListener("click", function(){ li.remove(); kwSync(); validate(kwQ, kwQ.classList.contains("is-invalid")); save(); kwEntry.focus(); });
      li.appendChild(span); li.appendChild(rm); li.appendChild(hid); kwUl.appendChild(li);
      if (!silent && !reduced) reveal(li);
    });
    kwSync();
  }
  function addPendingKeyword(){ if (kwEntry.value.trim()) { addKeyword(kwEntry.value); kwEntry.value = ""; validate(kwQ, kwQ.classList.contains("is-invalid")); save(); } }
  kwEntry.addEventListener("keydown", function(e){
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      if (kwEntry.value.trim()) addPendingKeyword();
      else if (e.key === "Enter") { var nx = qs("[data-next]", panels[current]); if (nx && !kwList().length) validate(kwQ, true); }
    } else if (e.key === "Backspace" && !kwEntry.value) {
      var last = kwUl.lastElementChild;
      if (last) { last.remove(); kwSync(); save(); }
    }
  });
  kwEntry.addEventListener("input", function(){ if (/[,;]/.test(kwEntry.value)) { var v = kwEntry.value; kwEntry.value = ""; addKeyword(v); validate(kwQ, kwQ.classList.contains("is-invalid")); save(); } });
  kwEntry.addEventListener("blur", addPendingKeyword);
  kwBox.addEventListener("click", function(e){ if (e.target === kwBox || e.target === kwUl) kwEntry.focus(); });

  /* ---------- Phone: country code follows the Country answer ---------- */
  var dialEl = qs("[data-rv-dial]");
  function syncDial(){ dialEl.textContent = "+" + dialDigits(); }
  codeSel.addEventListener("change", function(){ codeTouched = true; syncDial(); });
  form.elements.country.addEventListener("change", function(){
    if (codeTouched) return;
    var c = form.elements.country.value.trim().toLowerCase(), k = countryNames.map(function(n){ return n.toLowerCase(); }).indexOf(c);
    if (k > -1) { codeSel.selectedIndex = k; syncDial(); save(); }
  });

  /* ---------- Small tidy-ups on leaving a box ---------- */
  function tidyUrl(input){
    var v = input.value.trim();
    if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[\w-]+(\.[\w-]+)+/.test(v)) input.value = "https://" + v;
  }
  ["profileLink", "scholarLink"].forEach(function(n){ var i = form.elements[n]; if (i) i.addEventListener("blur", function(){ tidyUrl(i); }); });
  var orcidIn = form.elements.orcid;
  orcidIn.addEventListener("blur", function(){ var id = orcid(orcidIn.value); if (id) orcidIn.value = id; });

  /* ---------- Character counters ---------- */
  qsa("[data-count-for]").forEach(function(c){
    var t = document.getElementById(c.getAttribute("data-count-for"));
    function upd(){ c.textContent = t.value.length + " / " + t.maxLength; }
    t.addEventListener("input", upd); upd();
  });

  /* ---------- Applicant name follows the full name until edited ---------- */
  var fullName = form.elements.fullName, appName = form.elements.applicantName;
  appName.addEventListener("input", function(){ nameTouched = true; });
  function prefillName(){ if (!nameTouched || !appName.value.trim()) appName.value = fullName.value.trim(); if (appName.value) validate(qOf("applicantName"), false); }

  /* ---------- Live feedback ---------- */
  function onChange(e){
    var t = e.target, q = t.closest(".rv-q");
    if (e.type === "change" && (t.type === "checkbox" || t.type === "radio")) updateConditions(true);
    if (q && typeOf(q) !== "file") validate(q, q.classList.contains("is-invalid"), !!qs(".rv-other .rv-error:not([hidden])", q));   // the CV has its own messages (setFile)
    if (t.name === "tracks[]") validate(tpQ, tpQ.classList.contains("is-invalid"));
    if (t.name === "email") { var aq = qOf("altEmail"); if (aq.classList.contains("is-invalid")) validate(aq, true); }
    if (stepBtns[current].classList.contains("has-error") && !validatePanel(current, false)) { stepBtns[current].classList.remove("has-error"); updateSteps(); }
    if (t.name !== "cv") save();
  }
  form.addEventListener("input", onChange);
  form.addEventListener("change", onChange);
  form.addEventListener("focusout", function(e){
    var t = e.target, q = t.closest && t.closest(".rv-q");
    if (q && t.classList.contains("rv-input") && t.value.trim()) validate(q, true);
  });

  /* ---------- CV upload ---------- */
  var cvQ = qOf("cv"), cvInput = form.elements.cv, drop = qs("[data-rv-drop]"), fileBox = qs("[data-rv-file]");
  function setFile(f){
    cvFile = null;
    if (f) {
      var ext = (f.name.split(".").pop() || "").toLowerCase();
      if (!CV_TYPES[ext]) { setError(cvQ, "This file type is not accepted. Please upload a PDF, DOC or DOCX file."); cvInput.value = ""; return showFile(); }
      if (f.size > MAX_CV) { setError(cvQ, "This file is " + fmtSize(f.size) + ". The maximum size is 5 MB."); cvInput.value = ""; return showFile(); }
      if (!f.size) { setError(cvQ, "This file is empty. Please choose another file."); cvInput.value = ""; return showFile(); }
      cvFile = f;
      setError(cvQ, "");
    }
    showFile();
    validate(cvQ, false);
  }
  function showFile(){
    fileBox.hidden = !cvFile;
    drop.hidden = !!cvFile;
    if (!cvFile) return;
    var ext = cvFile.name.split(".").pop().toLowerCase(), t = qs("[data-rv-file-type]", fileBox);
    t.className = "rv-file-type t-" + ext;
    t.textContent = "";
    t.appendChild(el("span", null, CV_TYPES[ext]));
    qs("[data-rv-file-name]", fileBox).textContent = cvFile.name;
    qs("[data-rv-file-size]", fileBox).textContent = fmtSize(cvFile.size);
  }
  cvInput.addEventListener("change", function(){ setFile(cvInput.files && cvInput.files[0]); });
  ["dragenter", "dragover"].forEach(function(t){ drop.addEventListener(t, function(){ drop.classList.add("is-over"); }); });
  ["dragleave", "drop"].forEach(function(t){ drop.addEventListener(t, function(){ drop.classList.remove("is-over"); }); });
  qs("[data-rv-file-remove]", fileBox).addEventListener("click", function(){
    cvFile = null; cvInput.value = ""; showFile(); validate(cvQ, false); cvInput.focus();
  });

  /* ---------- Summary on the last step ---------- */
  function answerOf(q){
    var name = q.getAttribute("data-q");
    switch (typeOf(q)) {
      case "radio": case "checkbox":
        return checked(name).map(function(v){
          if (v !== "Other") return v;
          var o = qs(".rv-other input", q);
          return o && o.value.trim() ? "Other: " + o.value.trim() : "Other";
        }).join(typeOf(q) === "checkbox" ? "\n" : "; ");
      case "trackpick":
        return qsa(".rv-tp-group:not([hidden]) .rv-tp-track", q).filter(function(t){ return qs("input[name='trackDetail[]']", t).checked; }).map(function(t){
          var ac = t.closest(".rv-tp-group").querySelector(".rv-conf").textContent;
          var title = qs(".rv-opt-text", t).textContent.replace(/^\d{2}/, "").trim();
          var topics = qsa("input[name='topics[]']:checked", t).map(function(c){ return c.nextElementSibling.textContent; });
          return ac + ": " + title + (topics.length ? " (" + topics.join("; ") + ")" : "");
        }).join("\n");
      case "keywords": return kwList().join(", ");
      case "phone": return phoneNum.value.trim() ? "+" + dialDigits() + " " + phoneNum.value.trim() : "";
      case "file": return cvFile ? cvFile.name + " (" + fmtSize(cvFile.size) + ")" : "";
      default: return qs(".rv-input", q).value.trim();
    }
  }
  function buildSummary(){
    var box = qs("[data-rv-summary]");
    box.textContent = "";
    panels.slice(0, -1).forEach(function(p, i){
      var sec = el("section", "rv-sum"), head = el("div", "rv-sum-head"), ed = el("button", "rv-sum-edit", "Edit");
      ed.type = "button"; ed.setAttribute("aria-label", "Edit " + stepName(i));
      ed.addEventListener("click", function(){ go(i); });
      head.appendChild(el("h3", null, stepName(i))); head.appendChild(ed); sec.appendChild(head);
      var dlist = el("dl");
      qsa(".rv-q", p).filter(isShown).forEach(function(q){
        var a = answerOf(q), dd = el("dd", a ? null : "is-empty", a || "Not provided");
        dlist.appendChild(el("dt", null, labelText(q))); dlist.appendChild(dd);
      });
      sec.appendChild(dlist); box.appendChild(sec);
    });
  }

  /* ---------- Keep answers in this tab (not the CV) ---------- */
  function collect(){
    var data = {};
    qsa("input, textarea, select").forEach(function(i){
      if (!i.name || i.type === "file" || i.name === "website" || i.readOnly) return;
      if (i.type === "checkbox" || i.type === "radio") { if (i.checked) (data[i.name] = data[i.name] || []).push(i.value); }
      else if (/\[\]$/.test(i.name)) (data[i.name] = data[i.name] || []).push(i.value);
      else data[i.name] = i.value;
    });
    return data;
  }
  function save(){
    try { sessionStorage.setItem(STORE, JSON.stringify({ v: 2, step: current, furthest: furthest, nameTouched: nameTouched, codeTouched: codeTouched, data: collect() })); } catch (e) {}
  }
  function restore(){
    var s;
    try { s = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch (e) { s = null; }
    if (!s || s.v !== 2 || !s.data) return;
    Object.keys(s.data).forEach(function(n){
      var v = s.data[n];
      if (n === "keywords[]") { if (Array.isArray(v)) addKeyword(v.join(","), true); return; }
      qsa('[name="' + n.replace(/"/g, "") + '"]').forEach(function(i){
        if (i.type === "checkbox" || i.type === "radio") i.checked = Array.isArray(v) && v.indexOf(i.value) !== -1;
        else if (typeof v === "string") i.value = v;
      });
    });
    nameTouched = !!s.nameTouched; codeTouched = !!s.codeTouched;
    furthest = Math.min(Math.max(0, s.furthest | 0), panels.length - 1);
    current = Math.min(Math.max(0, s.step | 0), furthest);
    qsa("textarea").forEach(function(t){ t.dispatchEvent(new Event("input")); });
    qsa(".rv-tp-track", tpQ).forEach(syncTrack);
  }

  /* ---------- Anti-spam token from the server ---------- */
  function getToken(){
    return fetch(endpoint + "?action=token", { credentials: "same-origin", cache: "no-store", headers: { "Accept": "application/json" } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if (j && j.token) token = j.token; return token; })
      .catch(function(){ return token; });
  }

  /* ---------- Submit ---------- */
  var submitBtn = qs("[data-submit]"), sendingBox = shell.querySelector("[data-rv-sending]");
  function showFormError(text){
    formError.textContent = text;
    formError.hidden = false;
    formError.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }
  function setSending(on){
    sending = on;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? "Sending…" : "Submit Application";
    sendingBox.hidden = !on;
    qsa("[data-back], .rv-sum-edit").concat(stepBtns).forEach(function(b){
      if (on) { b.setAttribute("data-was", b.disabled ? "1" : ""); b.disabled = true; }
      else b.disabled = b.getAttribute("data-was") === "1";
    });
    if (!on) updateSteps();
  }
  function buildData(){
    var fd = new FormData();
    panels.forEach(function(p){
      qsa(".rv-q", p).filter(isShown).forEach(function(q){
        var name = q.getAttribute("data-q"), type = typeOf(q);
        switch (type) {
          case "radio": case "checkbox":
            var vals = checked(name);
            vals.forEach(function(v){ fd.append(type === "checkbox" ? name + "[]" : name, v); });
            var o = qs(".rv-other input", q);
            if (o && vals.indexOf("Other") !== -1) fd.append(o.name, o.value.trim());
            break;
          case "trackpick":
            qsa(".rv-tp-group:not([hidden]) .rv-tp-track", q).forEach(function(t){
              var box = qs("input[name='trackDetail[]']", t);
              if (!box.checked) return;
              fd.append("trackDetail[]", box.value);
              qsa("input[name='topics[]']:checked", t).forEach(function(c){ fd.append("topics[]", c.value); });
            });
            break;
          case "keywords": kwList().forEach(function(k){ fd.append("keywords[]", k); }); break;
          case "phone": fd.append("phoneCode", codeSel.value); fd.append("phoneNumber", phoneNum.value.trim()); break;
          case "file": if (cvFile) fd.append("cv", cvFile, cvFile.name); break;
          case "consent": fd.append(name, qs("input", q).checked ? "yes" : ""); break;
          default: var i = qs(".rv-input", q); if (i && i.name) fd.append(i.name, i.value.trim());
        }
      });
    });
    fd.append("website", form.elements.website.value);
    fd.append("token", token);
    return fd;
  }
  form.addEventListener("submit", function(e){
    e.preventDefault();
    if (sending) return;
    formError.hidden = true;
    for (var i = 0; i < panels.length; i++) {
      var bad = validatePanel(i, true);
      if (bad) {
        var moved = i !== current;
        if (moved) go(i);
        setTimeout(function(){ focusQuestion(bad); }, moved ? 350 : 0);
        return;
      }
    }
    setSending(true);
    (token ? Promise.resolve(token) : getToken()).then(function(){ send(buildData()); });
  });
  function send(fd){
    var xhr = new XMLHttpRequest();
    var pct = shell.querySelector("[data-rv-pct]"), upbar = shell.querySelector("[data-rv-upbar]");
    pct.textContent = "0%"; upbar.style.width = "0";
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = 120000;
    xhr.upload.onprogress = function(ev){
      if (!ev.lengthComputable) return;
      var p = Math.min(99, Math.round(ev.loaded / ev.total * 100));
      pct.textContent = p + "%"; upbar.style.width = p + "%";
    };
    xhr.onload = function(){
      var res = null;
      try { res = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300 && res && res.ok) { pct.textContent = "100%"; upbar.style.width = "100%"; return done(res.ref || ""); }
      setSending(false);
      if (res && res.expired) token = "";
      if (res && res.fields) {
        var first = null, step = -1;
        Object.keys(res.fields).forEach(function(n){
          var base = n.replace(/Other$/, ""), q = qOf(n) || qOf(base);
          if (!q && (n === "phoneCode" || n === "phoneNumber")) q = qOf("phone");
          if (!q && n === "topics") q = tpQ;
          if (!q) return;
          setError(q, res.fields[n], n !== base && qOf(base) ? qs(".rv-other .rv-error", q) : null);
          var s = panels.indexOf(q.closest(".rv-panel"));
          stepBtns[s].classList.add("has-error");
          if (step === -1 || s < step) { step = s; first = q; }
        });
        updateSteps();
        if (first) { if (step !== current) go(step); setTimeout(function(){ focusQuestion(first); }, 350); }
      }
      showFormError((res && res.message) || "Sorry, your application could not be sent right now. Please try again in a few minutes, or contact iceast@mtc.edu.om.");
    };
    xhr.onerror = xhr.ontimeout = function(){
      setSending(false);
      showFormError("The connection was interrupted and your application was not sent. Please check your internet connection and press Submit again.");
    };
    xhr.send(fd);
  }
  function done(ref){
    try { sessionStorage.removeItem(STORE); } catch (e) {}
    var box = shell.querySelector("[data-rv-done]"), n = (fullName.value || "").trim();
    shell.querySelector("[data-rv-done-name]").textContent = n ? ", " + n : "";
    shell.querySelector("[data-rv-ref]").textContent = ref || "—";
    shell.querySelector("[data-rv-ref]").parentNode.hidden = !ref;
    form.hidden = true;
    shell.querySelector(".rv-steps").hidden = true;
    box.hidden = false;
    scrollToShell();
    box.focus({ preventScroll: true });
  }

  /* ---------- Start ---------- */
  restore();
  syncDial();
  kwSync();
  updateConditions(false);
  panels.forEach(function(p, i){ p.hidden = i !== current; qsa(".rv-q", p).forEach(function(q){ validate(q, false); }); });
  go(current, "init");
  getToken();
}();
