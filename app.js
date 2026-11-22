"use strict";
const $ = (selector) => document.querySelector(selector);
const TIERS = ["S", "A", "B", "C", "D", "F"];
const POINTS = {S:5, A:4, B:3, C:2, D:1, F:0};
const HINTS = ["Built different.", "Would absolutely use.", "Solid. No notes. Mostly.", "It has potential.", "A generous D.", "We need to talk."];
const STORAGE = "six-sparks-blind-v1";
let manifest, state, answers, answerPromise, current, dragged, viewing, lastFocus;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const announce = text => { $("#status").textContent = text; };
function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    let j;
    const max = Math.floor(4294967296 / (i + 1)) * (i + 1);
    do { j = crypto.getRandomValues(new Uint32Array(1))[0]; } while (j >= max);
    j %= i + 1;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function fresh() {
  return {version:1, current:manifest.tests[0].id, rounds:Object.fromEntries(manifest.tests.map(t => [t.id, {
    order:shuffled(t.items.map(i => i.id)), placements:{}, revealed:false
  }]))};
}
function valid(saved) {
  return saved?.version === 1 && manifest.tests.every(t => {
    const r = saved.rounds?.[t.id], ids = t.items.map(i => i.id);
    return r && Array.isArray(r.order) && r.order.length === ids.length &&
      new Set(r.order).size === ids.length && r.order.every(id => ids.includes(id)) &&
      r.placements && typeof r.placements === "object" && typeof r.revealed === "boolean" &&
      Object.entries(r.placements).every(([id, tier]) => ids.includes(id) && TIERS.includes(tier)) &&
      (!r.revealed || ids.every(id => TIERS.includes(r.placements[id])));
  });
}
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  catch { }
}
function round() { return state.rounds[current.id]; }
function item(id) { return current.items.find(i => i.id === id); }
function letter(id) { return String.fromCharCode(65 + round().order.indexOf(id)); }
function options(value = "unranked") {
  return '<option value="unranked"' + (value === "unranked" ? " selected" : "") + '>Rank…</option>' +
    TIERS.map(t => '<option value="' + t + '"' + (value === t ? " selected" : "") + ">" + t + " tier</option>").join("");
}
function time(seconds) {
  if (seconds == null) return "not recorded";
  if (seconds < 60) return Math.round(seconds) + " sec";
  const m = Math.round(seconds / 60);
  return m >= 60 ? Math.floor(m/60) + " h " + String(m%60).padStart(2,"0") + " m" : m + " min";
}
function identity(entry) {
  if (!answers) return "";
  const a = answers.entries[entry.id], s = answers.setups[a.setup];
  return '<div class="identity"><h4>' + esc(s.name) + '</h4><div class="chips"><span class="chip">' +
    (s.sparks ? "ϟ ".repeat(s.sparks) + s.sparks + (s.sparks === 1 ? " Spark" : " Sparks") : "☁ Cloud") +
    '</span><span class="chip">Look ' + (a.score == null ? "—" : esc(a.score) + "/5") +
    '</span></div><p class="metric">Task: <b>' + esc(time(a.wallSeconds)) +
    '</b> · Suite: <b>' + esc(time(s.wallSeconds)) + '</b><br>Strict <b>' + s.strict +
    '/6</b> · Excl. README <b>' + s.excludingReadme + '/6</b> · Mean look <b>' + s.lookMean +
    '/5</b></p><p class="verdict">' + esc(a.checks.replace(/^certified: /,"")) +
    (a.timedOut ? " · hit time cap" : "") + '</p></div>';
}
function card(entry, index) {
  const l = letter(entry.id), revealed = round().revealed, p = round().placements[entry.id] || "unranked";
  const thumbnail = entry.poster
    ? '<img src="' + esc(entry.poster) + '" alt="Anonymous output ' + l + '" loading="lazy">'
    : '<span class="missing-visual"><b>' + (entry.src ? "◈" : "⌁") + '</b>' + (entry.src ? "INSPECT OUTPUT" : "DID NOT FINISH") + "</span>";
  return '<article class="card" draggable="' + !revealed + '" data-id="' + entry.id +
    '" style="--delay:' + index * 65 + 'ms"><button class="card-thumb" data-open="' + entry.id +
    '" aria-label="View contender ' + l + '">' + thumbnail + '<span class="letter">' + l +
    '</span>' + (entry.src ? '<span class="play-icon">' + (entry.kind === "video" ? "▶" : "↗") + '</span>' : "") +
    (["partial","failed"].includes(entry.status) ? '<span class="unfinished-label">DID NOT FINISH · ARTIFACT</span>' : "") +
    '</button><div class="card-meta"><span class="anonymous-title">Contender ' + l +
    '</span><select class="rank-select" data-rank="' + entry.id + '" aria-label="Rank contender ' + l +
    '"' + (revealed ? " disabled" : "") + ">" + options(p) + "</select></div>" +
    (revealed ? identity(entry) : "") + "</article>";
}
function render() {
  const r = round(), ranked = Object.keys(r.placements).length;
  const ids = r.order, n = manifest.tests.indexOf(current);
  document.body.classList.toggle("is-revealed", r.revealed);
  $("#tests").innerHTML = manifest.tests.map((t,i) => '<button class="test-tab ' +
    (current.id === t.id ? "active " : "") + (state.rounds[t.id].revealed ? "done" : "") +
    '" data-test="' + t.id + '" aria-current="' + (current.id === t.id ? "step" : "false") +
    '"><span>' + String(i+1).padStart(2,"0") + '</span>' + esc(t.name.replace(" video","")) +
    (state.rounds[t.id].revealed ? " ✓" : "") + "</button>").join("");
  $("#round-number").textContent = "ROUND " + String(n+1).padStart(2,"0") + " / 06 · " + (r.revealed ? "IDENTITIES REVEALED" : "IDENTITIES HIDDEN");
  $("#round-title").textContent = current.name;
  $("#prompt").textContent = current.prompt;
  $("#unranked-count").textContent = (ids.length-ranked) + " unranked";
  $("#rank-count").textContent = ranked + "/" + ids.length + " placed";
  $("#pool").innerHTML = ids.filter(id => !r.placements[id]).map((id,i) => card(item(id),i)).join("");
  $("#tiers").innerHTML = TIERS.map((tier,i) => '<div class="tier-row" style="--tier:var(--' + tier.toLowerCase() +
    ')"><button class="tier-label" tabindex="-1" disabled aria-label="' + tier + ' tier">' + tier +
    '</button><div class="tier-drop" data-tier="' + tier + '" aria-label="' + tier +
    ' tier drop zone" data-hint="' + HINTS[i] + '">' +
    ids.filter(id => r.placements[id] === tier).map((id,j) => card(item(id),j)).join("") + "</div></div>").join("");
  $(".coming").hidden = !manifest.comingSoon;
  $("#reveal").disabled = r.revealed || ranked !== ids.length;
  $("#reveal").innerHTML = r.revealed ? "REVEALED ✓" : "REVEAL <span>↗</span>";
  $("#reveal-title").textContent = r.revealed ? "Well. That was revealing." : ranked === ids.length ? "No taking it back. (Okay, until you reveal.)" : "Put your taste on the line.";
  $("#reveal-note").textContent = r.revealed ? "Picks locked. Were you rooting for the wrong setup?" : ranked === ids.length ? "Your picks are locked when you reveal." : "Rank all " + ids.length + " to unlock the reveal.";
  const remaining = manifest.tests.find(t => !state.rounds[t.id].revealed && t.id !== current.id);
  $("#next").hidden = !r.revealed;
  $("#next").textContent = remaining ? "Next blind round → " + remaining.name : "See your final verdict ↓";
  $("#next").dataset.next = remaining?.id || "";
  renderSummary();
}
function place(id, tier) {
  if (round().revealed || !item(id) || ![...TIERS,"unranked"].includes(tier)) return;
  if (tier === "unranked") delete round().placements[id]; else round().placements[id] = tier;
  save(); render();
  if (viewing === id && $("#viewer").open) $("#viewer-rank").value = tier;
  announce("Contender " + letter(id) + " moved to " + (tier === "unranked" ? "the contenders" : tier + " tier"));
}
async function loadAnswers() {
  if (!answerPromise) answerPromise = fetch("answer-key.json", {cache:"no-store"}).then(r => {
    if (!r.ok) throw new Error("Answer key unavailable");
    return r.json();
  }).then(data => { answers = data; return data; }).catch(e => { answerPromise = null; throw e; });
  return answerPromise;
}
async function choose(testId) {
  closeViewer();
  const target = manifest.tests.find(t => t.id === testId);
  if (!target) return;
  if (state.rounds[testId].revealed && !answers) {
    try { await loadAnswers(); } catch { announce("Could not load saved reveal. Please retry."); return; }
  }
  current = target; state.current = testId; save(); render();
}
function openViewer(id) {
  const entry = item(id);
  if (!entry) return;
  viewing = id; lastFocus = document.activeElement;
  $("#viewer-label").textContent = "Contender " + letter(id);
  $("#viewer-detail").textContent = round().revealed ? answers.setups[answers.entries[id].setup].name : current.name + " · identity hidden";
  const stage = $("#stage");
  stage.replaceChildren();
  if (!entry.src) {
    const text = document.createElement("div"); text.className = "missing-visual";
    text.innerHTML = "<b>⌁</b>DID NOT FINISH<span>No completed artifact was delivered.</span>";
    stage.append(text);
  } else if (entry.kind === "video") {
    const player = document.createElement("div"); player.className = "player";
    const video = document.createElement("video"); video.src = entry.src;
    video.playsInline = true; video.preload = "metadata";
    if (entry.poster) video.poster = entry.poster;
    video.setAttribute("aria-label", "Anonymous contender " + letter(id));
    video.addEventListener("error", () => { $("#viewer-help").textContent = "Video could not load. The artifact may be unavailable."; });
    player.append(video, playerBar(video, id));
    stage.append(player);
  } else {
    const frame = document.createElement("iframe"); frame.src = entry.src;
    frame.title = "Play contender " + letter(id);
    frame.setAttribute("sandbox", "allow-scripts allow-pointer-lock");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("allow", "fullscreen");
    stage.append(frame);
  }
  $("#viewer-help").textContent = ["partial","failed"].includes(entry.status)
    ? "DID NOT FINISH · This artifact exists, but did not pass the task. Judge what it actually made."
    : entry.src ? "Try it. Break it. Trust your eyes." : "No output is an output. You can still rank this card.";
  $("#viewer-rank").innerHTML = options(round().placements[id] || "unranked");
  $("#viewer-rank").disabled = round().revealed;
  $("#viewer").showModal();
}
// A <video controls> bar hides itself while playing and some browsers only show it on
// hover, so the blind game carries its own bar that never disappears mid-clip.
function clock(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return m + ":" + String(s).padStart(2, "0");
}
function playerBar(video, id) {
  const bar = document.createElement("div"); bar.className = "player-bar";
  bar.innerHTML = '<button type="button" class="pb-play" aria-label="Play or pause">▶</button>'
    + '<input class="pb-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek">'
    + '<span class="pb-time">0:00 / 0:00</span>'
    + '<button type="button" class="pb-mute" aria-label="Mute or unmute">Mute</button>';
  const play = bar.querySelector(".pb-play"), seek = bar.querySelector(".pb-seek");
  const time = bar.querySelector(".pb-time"), mute = bar.querySelector(".pb-mute");
  const paint = () => {
    const playing = !video.paused && !video.ended;
    play.textContent = playing ? "❚❚" : "▶";
    play.setAttribute("aria-label", playing ? "Pause" : "Play");
    time.textContent = clock(video.currentTime) + " / " + clock(video.duration);
    if (!seek.matches(":active")) seek.value = String(Math.round(1000 * (video.currentTime / (video.duration || 1))));
  };
  play.addEventListener("click", () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
  mute.addEventListener("click", () => { video.muted = !video.muted; mute.textContent = video.muted ? "Unmute" : "Mute"; });
  seek.addEventListener("input", () => { if (video.duration) video.currentTime = (seek.value / 1000) * video.duration; });
  video.addEventListener("click", () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
  ["loadedmetadata", "timeupdate", "play", "pause", "ended", "seeked"].forEach(ev => video.addEventListener(ev, paint));
  paint();
  return bar;
}
function closeViewer() {
  if ($("#viewer").open) $("#viewer").close();
  $("#stage").replaceChildren();
  viewing = null;
}
function renderSummary() {
  const done = manifest.tests.filter(t => state.rounds[t.id].revealed);
  const summary = $("#summary");
  summary.hidden = !done.length || !answers;
  if (summary.hidden) return;
  const groups = new Map();
  for (const test of done) for (const entry of test.items) {
    if (!groups.has(entry.setup)) groups.set(entry.setup, {setup:answers.setups[entry.setup], points:[], look:[], tiers:[]});
    const g = groups.get(entry.setup), tier = state.rounds[test.id].placements[entry.id];
    g.points.push(POINTS[tier]); g.look.push(answers.entries[entry.id].score ?? 0); g.tiers.push(tier);
  }
  const avg = xs => xs.reduce((a,b) => a+b,0)/xs.length;
  const rows = [...groups.values()].sort((a,b) => avg(b.points)-avg(a.points));
  summary.innerHTML = '<p class="eyebrow">THE RECEIPTS</p><h2 id="summary-title">' +
    (done.length === 6 ? "So… did your favorites win?" : "Your verdict, so far.") + '</h2><span class="session-progress">' +
    done.length + '/6 tasks revealed</span><p>Your tiers compared with the existing subjective look review. Your score: S=5, A=4, B=3, C=2, D=1, F=0. Missing look scores count as 0. This is not an objective quality ranking.</p><div class="table-scroll"><table class="summary-table"><thead><tr><th>SETUP</th><th>YOUR TIERS</th><th>YOUR MEAN /5</th><th>REVIEW MEAN /5*</th><th>STRICT /6</th></tr></thead><tbody>' +
    rows.map(g => '<tr><td>' + esc(g.setup.name) + '</td><td>' + g.tiers.join(" · ") + '</td><td>' +
      avg(g.points).toFixed(2) + '<span class="bar"><i style="width:' + avg(g.points)*20 + '%"></i></span></td><td>' +
      avg(g.look).toFixed(2) + '<span class="bar look"><i style="width:' + avg(g.look)*20 + '%"></i></span></td><td>' +
      g.setup.strict + "/6</td></tr>").join("") + "</tbody></table></div><p>*Means above cover only the " + done.length +
      " revealed tasks. Card suite means cover all six.</p><details><summary>How to read these results</summary>" +
      answers.caveats.map(c => "<p>" + esc(c) + "</p>").join("") + "</details>";
}
document.addEventListener("click", e => {
  const open = e.target.closest("[data-open]"), test = e.target.closest("[data-test]");
  if (open) openViewer(open.dataset.open);
  if (test) choose(test.dataset.test);
});
document.addEventListener("change", e => { if (e.target.matches("[data-rank]")) {
  const id = e.target.dataset.rank;
  place(id,e.target.value);
  document.querySelector('[data-rank="' + id + '"]')?.focus();
}});
document.addEventListener("dragstart", e => {
  const card = e.target.closest(".card");
  if (!card || round().revealed) return e.preventDefault();
  dragged = card.dataset.id; e.dataTransfer.setData("text/plain", dragged);
  e.dataTransfer.effectAllowed = "move"; card.classList.add("dragging");
});
document.addEventListener("dragover", e => {
  const zone = e.target.closest("[data-tier]");
  if (!zone || round().revealed || !dragged) return;
  e.preventDefault(); e.dataTransfer.dropEffect = "move"; zone.classList.add("drop-over");
});
document.addEventListener("dragleave", e => {
  const zone = e.target.closest("[data-tier]");
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("drop-over");
});
document.addEventListener("drop", e => {
  const zone = e.target.closest("[data-tier]");
  if (!zone) return;
  e.preventDefault(); place(dragged, zone.dataset.tier); dragged = null;
  document.querySelectorAll(".drop-over").forEach(n => n.classList.remove("drop-over"));
});
document.addEventListener("dragend", () => {
  dragged = null; document.querySelectorAll(".dragging,.drop-over").forEach(n => n.classList.remove("dragging","drop-over"));
});
$("#viewer-rank").addEventListener("change", e => place(viewing,e.target.value));
$("#close-viewer").addEventListener("click",closeViewer);
$("#viewer").addEventListener("close", () => { $("#stage").replaceChildren(); viewing = null; if (lastFocus?.isConnected) lastFocus.focus(); });
$("#viewer").addEventListener("click", e => { if (e.target === $("#viewer")) {
  const b = $("#viewer").getBoundingClientRect();
  if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) closeViewer();
}});
$("#reveal").addEventListener("click", async () => {
  if (Object.keys(round().placements).length !== current.items.length || round().revealed) return;
  const testId = current.id, originalState = state;
  $("#reveal").disabled = true; $("#reveal").textContent = "ONE MOMENT…";
  try {
    await loadAnswers(); if (state !== originalState) return; state.rounds[testId].revealed = true; save(); render();
    announce("Identities revealed. Your picks are now locked.");
    $("#next").focus({preventScroll:true});
  } catch {
    $("#reveal").disabled = false; $("#reveal").textContent = "RETRY REVEAL";
    $("#reveal-note").textContent = "The answer key did not load. Your picks are safe. Try again.";
  }
});
$("#next").addEventListener("click", () => {
  if ($("#next").dataset.next) {
    choose($("#next").dataset.next); $(".round-header").scrollIntoView({behavior:"smooth",block:"start"});
  } else $("#summary").scrollIntoView({behavior:"smooth",block:"start"});
});
$("#play-all").addEventListener("click", () => {
  const next = manifest.tests.find(t => !state.rounds[t.id].revealed) || manifest.tests[0];
  choose(next.id); announce("Playing all six. Rank, reveal, then continue to the next task.");
});
$("#reset").addEventListener("click", () => $("#reset-dialog").showModal());
$("#reset-dialog").addEventListener("close", () => {
  if ($("#reset-dialog").returnValue !== "reset") return;
  closeViewer(); state = fresh(); answers = null; answerPromise = null;
  current = manifest.tests[0]; save(); render(); announce("New blind session. All letters reshuffled.");
});
// Native video controls also gave keyboard scrubbing; keep it without them.
document.addEventListener("keydown", event => {
  const video = $("#stage video");
  if (!video || !$("#viewer").open || event.target.closest("input,select,textarea")) return;
  if (event.key === " " || event.key === "k") {
    event.preventDefault();
    if (video.paused) video.play().catch(() => {}); else video.pause();
  } else if (event.key === "ArrowRight") {
    event.preventDefault(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 2);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 2);
  }
});
(async () => {
  try {
    const response = await fetch("manifest.json", {cache:"no-store"});
    if (!response.ok) throw new Error("Manifest unavailable");
    manifest = await response.json();
    const count = manifest.tests[0].items.length;
    if (count !== 8) $(".lede").firstChild.textContent = count + " AI setups. The same six tasks. Watch, play, and rank what they made.";
    try { const saved = JSON.parse(localStorage.getItem(STORAGE)); state = valid(saved) ? saved : fresh(); }
    catch { state = fresh(); }
    current = manifest.tests.find(t => t.id === state.current) || manifest.tests[0];
    if (Object.values(state.rounds).some(r => r.revealed)) await loadAnswers();
    save(); render();
  } catch {
    $("#round-title").textContent = "The contenders couldn't load.";
    $("#prompt").textContent = "Please reload. If this is a fresh checkout, run python3 blind/build.py first.";
  }
})();
