(function () {
  "use strict";

  const KEY = "meniscus-v2";

  const state = {
    acknowledged: false,
    tab: "calc",
    // calculator
    peptideId: "semaglutide",
    vialMg: 5,
    waterMl: 2,
    doseValue: 0.25,
    doseUnit: "mg",
    syringeMl: 0.5,
    // library
    query: "",
    filter: "all",
    openId: null,
    // stack: [{ peptideId, doseValue, doseUnit, timesPerDay }]
    stack: [],
    // user schedule: [{ doseValue, doseUnit, duration, durationUnit, timesPerDay, note }]
    schedule: [],
    schedulePeptideId: "semaglutide",
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      Object.assign(state, {
        acknowledged: !!s.acknowledged,
        peptideId: s.peptideId || state.peptideId,
        vialMg: num(s.vialMg, state.vialMg),
        waterMl: num(s.waterMl, state.waterMl),
        doseValue: num(s.doseValue, state.doseValue),
        doseUnit: s.doseUnit || state.doseUnit,
        syringeMl: num(s.syringeMl, state.syringeMl),
        stack: Array.isArray(s.stack) ? s.stack : [],
        schedule: Array.isArray(s.schedule) ? s.schedule : [],
        schedulePeptideId: s.schedulePeptideId || state.schedulePeptideId,
      });
    } catch (_) {}
  }

  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          acknowledged: state.acknowledged,
          peptideId: state.peptideId,
          vialMg: state.vialMg,
          waterMl: state.waterMl,
          doseValue: state.doseValue,
          doseUnit: state.doseUnit,
          syringeMl: state.syringeMl,
          stack: state.stack,
          schedule: state.schedule,
          schedulePeptideId: state.schedulePeptideId,
        })
      );
    } catch (_) {}
  }

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function peptides() {
    return window.MENISCUS.peptides;
  }

  function getP(id) {
    return peptides().find((p) => p.id === id);
  }

  function doseMcg(value, unit) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return unit === "mg" ? value * 1000 : value;
  }

  function formatDose(value, unit) {
    if (!Number.isFinite(value)) return "—";
    if (unit === "mg") {
      const t = value >= 10 ? value.toFixed(2) : value.toFixed(3);
      return t.replace(/\.?0+$/, "") + " mg";
    }
    return (value >= 100 ? Math.round(value) : Number(value.toFixed(1))) + " mcg";
  }

  function trim(n) {
    if (!Number.isFinite(n)) return "";
    return String(Number(n.toFixed(4)));
  }

  function recon(vialMg, waterMl, doseMcg, syringeMl) {
    const capacity = Math.round(syringeMl * 100);
    const errors = [];
    const warnings = [];
    if (!(vialMg > 0)) errors.push("Enter vial mass > 0.");
    if (!(waterMl > 0)) errors.push("Enter diluent > 0.");
    if (!(doseMcg > 0)) errors.push("Enter a dose > 0.");
    if (errors.length) {
      return { ok: false, errors, warnings, units: null, drawMl: null, capacity, concMg: null, doses: null };
    }
    const vialMcg = vialMg * 1000;
    const conc = vialMcg / waterMl;
    const drawMl = doseMcg / conc;
    const units = drawMl * 100;
    const doses = vialMcg / doseMcg;
    if (units > capacity + 0.05) warnings.push(`Draw exceeds a ${syringeMl} mL U-100 syringe (${capacity} units).`);
    else if (units < 5) warnings.push("Under 5 units is hard to measure accurately on a U-100 syringe.");
    if (doseMcg > vialMcg) warnings.push("Dose is larger than the peptide mass in the vial.");
    return {
      ok: true,
      errors,
      warnings,
      units,
      drawMl,
      capacity,
      concMg: vialMg / waterMl,
      doses,
      per10: conc * 0.1,
    };
  }

  function rangeCheck(peptide, doseValue, doseUnit) {
    if (!peptide) return { kind: "none", text: "Unknown compound." };
    if (!peptide.researched) {
      return {
        kind: "none",
        text: "No established human dose range in this reference. Arithmetic only — not a protocol.",
      };
    }
    const mcg = doseMcg(doseValue, doseUnit);
    const min = peptide.researched.min * 1000;
    const max = peptide.researched.max * 1000;
    if (mcg < min * 0.5) {
      return {
        kind: "low",
        text: `Well below studied/label floor (${formatDose(peptide.researched.min, "mg")}). May be ineffective relative to published ranges.`,
      };
    }
    if (mcg < min) {
      return {
        kind: "low",
        text: `Below published minimum (${formatDose(peptide.researched.min, "mg")}). ${peptide.researched.note}`,
      };
    }
    if (mcg > max) {
      return {
        kind: "high",
        text: `Above published maximum in this reference (${formatDose(peptide.researched.max, "mg")}). ${peptide.researched.note}`,
      };
    }
    return {
      kind: "ok",
      text: `Within published reference range (${formatDose(peptide.researched.min, "mg")} – ${formatDose(
        peptide.researched.max,
        "mg"
      )}). ${peptide.researched.note}`,
    };
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function syringe(units, capacity) {
    const pct = units != null && capacity > 0 ? Math.min(1, Math.max(0, units / capacity)) : 0;
    return `
      <div class="syringe">
        <div class="syringe-track"><div class="syringe-fill" style="width:calc(${pct} * (100% - 0.56rem))"></div></div>
        <div class="syringe-scale"><span>0</span><span>${capacity / 2}</span><span>${capacity} u</span></div>
      </div>`;
  }

  function flagHtml(check) {
    if (!check) return "";
    if (check.kind === "high") return `<div class="flag flag-high">${check.text}</div>`;
    if (check.kind === "low") return `<div class="flag flag-low">${check.text}</div>`;
    if (check.kind === "ok") return `<div class="flag" style="border:1px solid var(--line);background:var(--surface-2);color:var(--ok)">${check.text}</div>`;
    return `<div class="flag flag-none">${check.text}</div>`;
  }

  /* ---------- GATE ---------- */
  function renderGate() {
    const root = document.getElementById("app");
    root.innerHTML = "";
    const gate = el(`
      <main class="gate">
        <p class="tiny" style="font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Research reference</p>
        <h1>Meniscus</h1>
        <p class="muted" style="margin-top:0.75rem">
          Reconstitution math, a peptide library, popular research blends, a stack builder with range flags,
          and <strong>your</strong> titration steps — not recommendations.
        </p>
        <div class="card" style="margin-top:1.2rem">
          <p class="label">What this is not</p>
          <ul class="muted" style="margin:0.4rem 0 0;padding-left:1.1rem">
            <li>Not medical advice or a prescription</li>
            <li>Not an instruction to take, give, or compound anything</li>
            <li>User schedules are yours alone — Meniscus does not endorse them</li>
          </ul>
        </div>
        <label class="gate-check">
          <input type="checkbox" id="ack" />
          <span>I understand this is a research calculator and reference, not medical advice.</span>
        </label>
        <button type="button" class="btn btn-primary btn-block" id="enter" disabled>Enter</button>
      </main>`);
    root.appendChild(gate);
    const ack = gate.querySelector("#ack");
    const enter = gate.querySelector("#enter");
    ack.addEventListener("change", () => (enter.disabled = !ack.checked));
    enter.addEventListener("click", () => {
      state.acknowledged = true;
      save();
      render();
    });
  }

  /* ---------- NAV ---------- */
  function nav(active) {
    const items = [
      { id: "calc", label: "Calc" },
      { id: "library", label: "Library" },
      { id: "blends", label: "Blends" },
      { id: "stack", label: "Stack" },
      { id: "plan", label: "Plan" },
    ];
    return `
      <nav class="nav"><div class="nav-inner">
        ${items
          .map(
            (i) =>
              `<button type="button" data-tab="${i.id}" class="${active === i.id ? "on" : ""}">${i.label}</button>`
          )
          .join("")}
      </div></nav>`;
  }

  /* ---------- CALC ---------- */
  function renderCalc() {
    const p = getP(state.peptideId);
    const mcg = doseMcg(state.doseValue, state.doseUnit);
    const r = recon(state.vialMg, state.waterMl, mcg, state.syringeMl);
    const check = rangeCheck(p, state.doseValue, state.doseUnit);

    return `
      <div class="stack">
        <section class="card">
          <p class="label">Draw</p>
          <div class="row">
            <div>
              <div class="hero-num">${r.units == null ? "—" : Math.round(r.units * 10) / 10}</div>
              <p class="hero-sub">units · U-100</p>
            </div>
            <div style="text-align:right;padding-top:0.35rem">
              <div style="font-size:1.35rem;font-weight:700;font-variant-numeric:tabular-nums">${
                r.drawMl == null ? "—" : r.drawMl.toFixed(3)
              } <span class="tiny">mL</span></div>
              <p class="tiny" style="margin-top:0.25rem">${formatDose(state.doseValue, state.doseUnit)}</p>
            </div>
          </div>
          ${syringe(r.units, r.capacity || 50)}
          ${
            r.ok
              ? `<dl class="stats">
                  <div><dt>Concentration</dt><dd>${r.concMg.toFixed(2)} mg/mL</dd></div>
                  <div><dt>Per 10 units</dt><dd>${formatDose(r.per10 / 1000, "mg")}</dd></div>
                  <div><dt>Doses in vial</dt><dd>${r.doses > 200 ? "200+" : (Math.floor(r.doses * 10) / 10)}</dd></div>
                  <div><dt>Syringe</dt><dd>${state.syringeMl} mL</dd></div>
                </dl>`
              : `<ul class="muted" style="margin:0.8rem 0 0;padding-left:1.1rem">${r.errors
                  .map((e) => `<li>${e}</li>`)
                  .join("")}</ul>`
          }
        </section>
        ${r.warnings.map((w) => `<div class="warn">${w}</div>`).join("")}
        ${flagHtml(check)}

        <section>
          <div class="row" style="align-items:center">
            <div>
              <h2 style="font-size:1.35rem">${p ? p.name : "Peptide"}</h2>
              <p class="tiny">${p ? p.klass : ""}</p>
            </div>
            <button type="button" class="btn-ghost" data-action="pick-pep">Change</button>
          </div>

          <div class="field">
            <label class="label" for="dose">Dose</label>
            <div class="input">
              <input id="dose" inputmode="decimal" value="${trim(state.doseValue)}" />
              <select id="dose-unit" style="width:auto;flex:0;padding-left:0.5rem;color:var(--muted)">
                <option value="mg" ${state.doseUnit === "mg" ? "selected" : ""}>mg</option>
                <option value="mcg" ${state.doseUnit === "mcg" ? "selected" : ""}>mcg</option>
              </select>
            </div>
          </div>

          <div class="grid-2">
            <div class="field" style="margin-top:0.75rem">
              <label class="label" for="vial">Vial</label>
              <div class="input"><input id="vial" inputmode="decimal" value="${trim(state.vialMg)}" /><span class="unit">mg</span></div>
              ${
                p
                  ? `<div class="chips">${p.vialPresets
                      .map(
                        (v) =>
                          `<button type="button" class="chip ${
                            Math.abs(v - state.vialMg) < 1e-9 ? "on" : ""
                          }" data-vial="${v}">${v}</button>`
                      )
                      .join("")}</div>`
                  : ""
              }
            </div>
            <div class="field" style="margin-top:0.75rem">
              <label class="label" for="water">Diluent</label>
              <div class="input"><input id="water" inputmode="decimal" value="${trim(state.waterMl)}" /><span class="unit">mL</span></div>
              ${
                p
                  ? `<div class="chips">${p.waterPresets
                      .map(
                        (v) =>
                          `<button type="button" class="chip ${
                            Math.abs(v - state.waterMl) < 1e-9 ? "on" : ""
                          }" data-water="${v}">${v}</button>`
                      )
                      .join("")}</div>`
                  : ""
              }
            </div>
          </div>

          <div class="field">
            <p class="label">Syringe</p>
            <div class="seg">
              ${[0.3, 0.5, 1]
                .map(
                  (ml) =>
                    `<button type="button" class="${state.syringeMl === ml ? "on" : ""}" data-syringe="${ml}">${ml} mL</button>`
                )
                .join("")}
            </div>
          </div>
        </section>
      </div>`;
  }

  /* ---------- LIBRARY ---------- */
  function renderLibrary() {
    const q = state.query.trim().toLowerCase();
    const list = peptides().filter((p) => {
      if (state.filter !== "all" && p.evidence !== state.filter) return false;
      if (!q) return true;
      return `${p.name} ${p.aka} ${p.klass} ${p.summary}`.toLowerCase().includes(q);
    });

    return `
      <div>
        <h2 style="font-size:1.5rem">Library</h2>
        <p class="muted" style="margin-top:0.35rem">All compounds in this reference. Evidence badges are honest.</p>
        <div class="search">
          <span class="search-ico">⌕</span>
          <input id="q" type="search" placeholder="Search peptides" value="${state.query.replace(/"/g, "&quot;")}" />
        </div>
        <div class="filters">
          ${["all", "label", "trial", "none"]
            .map((f) => {
              const label = f === "all" ? "All" : window.MENISCUS.evidence[f].label;
              return `<button type="button" class="chip ${state.filter === f ? "on" : ""}" data-filter="${f}">${label}</button>`;
            })
            .join("")}
        </div>
        ${list
          .map((p) => {
            const open = state.openId === p.id;
            const ev = window.MENISCUS.evidence[p.evidence];
            return `
              <article>
                <button type="button" class="list-item" data-open="${p.id}">
                  <div class="row">
                    <div>
                      <div class="title">${p.name}</div>
                      <p class="tiny" style="margin:0.15rem 0 0">${p.aka}</p>
                    </div>
                    <span class="badge ${ev.tone}">${ev.label}</span>
                  </div>
                  <p class="muted" style="margin:0.45rem 0 0">${p.klass}</p>
                </button>
                ${
                  open
                    ? `<div class="card" style="margin-top:0;border-top:0;border-top-left-radius:0;border-top-right-radius:0">
                        <p>${p.summary}</p>
                        ${p.halfLife ? `<p class="tiny" style="margin-top:0.5rem">Reported half-life: ${p.halfLife}</p>` : ""}
                        ${
                          p.researched
                            ? `<p class="muted" style="margin-top:0.5rem">${p.researched.note}</p>`
                            : `<p class="muted" style="margin-top:0.5rem">No established human dose range listed.</p>`
                        }
                        ${
                          p.notes.length
                            ? `<ul class="muted" style="margin:0.5rem 0 0;padding-left:1.1rem">${p.notes
                                .map((n) => `<li>${n}</li>`)
                                .join("")}</ul>`
                            : ""
                        }
                        <button type="button" class="btn btn-primary" style="margin-top:0.9rem" data-use="${p.id}">Use in calculator</button>
                        <button type="button" class="btn" style="margin-top:0.5rem;margin-left:0.4rem" data-stack-add="${p.id}">Add to stack</button>
                      </div>`
                    : ""
                }
              </article>`;
          })
          .join("")}
        ${list.length === 0 ? `<p class="empty">Nothing matches.</p>` : ""}
      </div>`;
  }

  /* ---------- BLENDS ---------- */
  function renderBlends() {
    return `
      <div>
        <h2 style="font-size:1.5rem">Blends</h2>
        <p class="muted" style="margin-top:0.35rem">Popular research combinations discussed online — not clinical regimens.</p>
        ${window.MENISCUS.blends
          .map((b) => {
            const names = b.items
              .map((i) => {
                const p = getP(i.peptideId);
                return p ? p.name : i.peptideId;
              })
              .join(" + ");
            return `
              <div class="card" style="margin-top:0.85rem">
                <div class="row">
                  <div>
                    <div class="title" style="font-family:var(--display);font-size:1.2rem">${b.name}</div>
                    <p class="tiny" style="margin-top:0.2rem">${b.tag}</p>
                  </div>
                </div>
                <p style="margin-top:0.65rem;font-weight:600">${names}</p>
                <p class="muted" style="margin-top:0.4rem">${b.summary}</p>
                <p class="tiny" style="margin-top:0.5rem">${b.caveat}</p>
                <ul class="muted" style="margin:0.55rem 0 0;padding-left:1.1rem">
                  ${b.items
                    .map((i) => {
                      const p = getP(i.peptideId);
                      return `<li>${p ? p.name : i.peptideId}${i.note ? ` — ${i.note}` : ""}</li>`;
                    })
                    .join("")}
                </ul>
                <button type="button" class="btn btn-primary" style="margin-top:0.85rem" data-blend="${b.id}">Load into stack</button>
              </div>`;
          })
          .join("")}
      </div>`;
  }

  /* ---------- STACK ---------- */
  function renderStack() {
    return `
      <div>
        <div class="row" style="align-items:center">
          <div>
            <h2 style="font-size:1.5rem">Stack</h2>
            <p class="muted" style="margin-top:0.25rem">Your combination. Range flags are reference only.</p>
          </div>
          <button type="button" class="btn" data-action="add-stack-item">+ Add</button>
        </div>

        ${
          state.stack.length === 0
            ? `<div class="empty card" style="margin-top:1rem">Stack is empty. Add from Library or Blends, or use + Add.</div>`
            : state.stack
                .map((item, idx) => {
                  const p = getP(item.peptideId);
                  const check = rangeCheck(p, item.doseValue, item.doseUnit);
                  const daily =
                    item.timesPerDay > 1
                      ? ` · ${item.timesPerDay}×/day = ${formatDose(item.doseValue * item.timesPerDay, item.doseUnit)}/day`
                      : "";
                  return `
                    <div class="card" style="margin-top:0.85rem">
                      <div class="row">
                        <div>
                          <div style="font-family:var(--display);font-weight:700;font-size:1.15rem">${
                            p ? p.name : "Unknown"
                          }</div>
                          <p class="tiny">${p ? p.klass : ""}</p>
                        </div>
                        <button type="button" class="btn-ghost" data-remove-stack="${idx}">Remove</button>
                      </div>
                      <div class="grid-2" style="margin-top:0.7rem">
                        <div>
                          <label class="label">Dose</label>
                          <div class="input">
                            <input data-stack-dose="${idx}" inputmode="decimal" value="${trim(item.doseValue)}" />
                            <select data-stack-unit="${idx}" style="width:auto;flex:0;color:var(--muted)">
                              <option value="mg" ${item.doseUnit === "mg" ? "selected" : ""}>mg</option>
                              <option value="mcg" ${item.doseUnit === "mcg" ? "selected" : ""}>mcg</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label class="label">Times / day</label>
                          <div class="input">
                            <input data-stack-times="${idx}" inputmode="numeric" value="${item.timesPerDay || 1}" />
                          </div>
                        </div>
                      </div>
                      <p class="tiny" style="margin-top:0.45rem">${formatDose(item.doseValue, item.doseUnit)}${daily}</p>
                      ${flagHtml(check)}
                    </div>`;
                })
                .join("")
        }

        ${
          state.stack.length
            ? `<p class="tiny" style="margin-top:1rem">Flags compare your entered dose to published min/max in this app when available. They are not safety limits or medical advice.</p>`
            : ""
        }
      </div>`;
  }

  /* ---------- PLAN (user titration) ---------- */
  function renderPlan() {
    const p = getP(state.schedulePeptideId);
    let running = 1;

    return `
      <div>
        <h2 style="font-size:1.5rem">Your plan</h2>
        <p class="muted" style="margin-top:0.35rem">
          You define every step. Meniscus does not recommend titration. Multiple doses per day are supported.
        </p>

        <div class="field">
          <label class="label" for="plan-pep">Compound</label>
          <div class="input">
            <select id="plan-pep">
              ${peptides()
                .map(
                  (x) =>
                    `<option value="${x.id}" ${x.id === state.schedulePeptideId ? "selected" : ""}>${x.name}</option>`
                )
                .join("")}
            </select>
          </div>
        </div>

        ${
          state.schedule.length === 0
            ? `<div class="empty card" style="margin-top:0.9rem">No steps yet. Add a block (e.g. 4 weeks at 2 mg).</div>`
            : state.schedule
                .map((step, idx) => {
                  const start = running;
                  const dur = Math.max(1, Number(step.duration) || 1);
                  const end =
                    step.durationUnit === "days"
                      ? start + dur - 1
                      : start + dur - 1;
                  const label =
                    step.durationUnit === "days"
                      ? dur === 1
                        ? `Day ${start}`
                        : `Days ${start}–${end}`
                      : dur === 1
                      ? `Week ${start}`
                      : `Weeks ${start}–${end}`;
                  running = end + 1;
                  const times = step.timesPerDay > 1 ? ` · ${step.timesPerDay}×/day` : "";
                  return `
                    <div class="step-card">
                      <div class="head">
                        <span class="tiny" style="font-weight:700;color:var(--accent)">${label}</span>
                        <button type="button" class="btn-ghost" data-remove-step="${idx}">Remove</button>
                      </div>
                      <div class="grid-2">
                        <div>
                          <label class="label">Dose</label>
                          <div class="input">
                            <input data-step-dose="${idx}" inputmode="decimal" value="${trim(step.doseValue)}" />
                            <select data-step-unit="${idx}" style="width:auto;flex:0;color:var(--muted)">
                              <option value="mg" ${step.doseUnit === "mg" ? "selected" : ""}>mg</option>
                              <option value="mcg" ${step.doseUnit === "mcg" ? "selected" : ""}>mcg</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label class="label">Times / day</label>
                          <div class="input">
                            <input data-step-times="${idx}" inputmode="numeric" value="${step.timesPerDay || 1}" />
                          </div>
                        </div>
                      </div>
                      <div class="grid-2" style="margin-top:0.55rem">
                        <div>
                          <label class="label">Duration</label>
                          <div class="input">
                            <input data-step-dur="${idx}" inputmode="numeric" value="${step.duration}" />
                          </div>
                        </div>
                        <div>
                          <label class="label">Unit</label>
                          <div class="input">
                            <select data-step-durunit="${idx}">
                              <option value="weeks" ${step.durationUnit === "weeks" ? "selected" : ""}>weeks</option>
                              <option value="days" ${step.durationUnit === "days" ? "selected" : ""}>days</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <p class="tiny" style="margin-top:0.45rem">${formatDose(step.doseValue, step.doseUnit)}${times}</p>
                      ${flagHtml(rangeCheck(p, step.doseValue, step.doseUnit))}
                    </div>`;
                })
                .join("")
        }

        <button type="button" class="btn btn-primary btn-block" style="margin-top:1rem" data-action="add-step">
          + Add step
        </button>
        <p class="tiny" style="margin-top:0.75rem">
          Example: 4 weeks at 2 mg, then 4 weeks at 4 mg, then ongoing — you enter it; nothing is suggested.
        </p>
      </div>`;
  }

  /* ---------- BIND + RENDER ---------- */
  function keepFocus(sel) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch (_) {}
  }

  function bind(root) {
    root.querySelectorAll("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        state.tab = b.getAttribute("data-tab");
        render();
      })
    );

    root.querySelectorAll("[data-action='pick-pep']").forEach((b) =>
      b.addEventListener("click", () => {
        state.tab = "library";
        render();
      })
    );

    const dose = root.querySelector("#dose");
    if (dose) {
      dose.addEventListener("input", () => {
        state.doseValue = num(dose.value, 0);
        save();
        render();
        keepFocus("#dose");
      });
    }
    const doseUnit = root.querySelector("#dose-unit");
    if (doseUnit) {
      doseUnit.addEventListener("change", () => {
        state.doseUnit = doseUnit.value;
        save();
        render();
      });
    }
    const vial = root.querySelector("#vial");
    if (vial) {
      vial.addEventListener("input", () => {
        state.vialMg = num(vial.value, 0);
        save();
        render();
        keepFocus("#vial");
      });
    }
    const water = root.querySelector("#water");
    if (water) {
      water.addEventListener("input", () => {
        state.waterMl = num(water.value, 0);
        save();
        render();
        keepFocus("#water");
      });
    }
    root.querySelectorAll("[data-vial]").forEach((b) =>
      b.addEventListener("click", () => {
        state.vialMg = Number(b.getAttribute("data-vial"));
        save();
        render();
      })
    );
    root.querySelectorAll("[data-water]").forEach((b) =>
      b.addEventListener("click", () => {
        state.waterMl = Number(b.getAttribute("data-water"));
        save();
        render();
      })
    );
    root.querySelectorAll("[data-syringe]").forEach((b) =>
      b.addEventListener("click", () => {
        state.syringeMl = Number(b.getAttribute("data-syringe"));
        save();
        render();
      })
    );

    const q = root.querySelector("#q");
    if (q) {
      q.addEventListener("input", () => {
        state.query = q.value;
        render();
        keepFocus("#q");
      });
    }
    root.querySelectorAll("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        state.filter = b.getAttribute("data-filter");
        render();
      })
    );
    root.querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-open");
        state.openId = state.openId === id ? null : id;
        render();
      })
    );
    root.querySelectorAll("[data-use]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = getP(b.getAttribute("data-use"));
        if (!p) return;
        state.peptideId = p.id;
        state.vialMg = p.defaultVialMg;
        state.waterMl = p.defaultWaterMl;
        state.doseUnit = p.doseUnit;
        state.doseValue = p.researched ? p.researched.min : p.doseUnit === "mg" ? 0.25 : 100;
        state.tab = "calc";
        save();
        render();
      })
    );
    root.querySelectorAll("[data-stack-add]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-stack-add");
        const p = getP(id);
        state.stack.push({
          peptideId: id,
          doseValue: p && p.researched ? p.researched.min : p && p.doseUnit === "mg" ? 0.25 : 100,
          doseUnit: p ? p.doseUnit : "mcg",
          timesPerDay: 1,
        });
        state.tab = "stack";
        save();
        render();
      })
    );

    root.querySelectorAll("[data-blend]").forEach((b) =>
      b.addEventListener("click", () => {
        const blend = window.MENISCUS.blends.find((x) => x.id === b.getAttribute("data-blend"));
        if (!blend) return;
        blend.items.forEach((i) => {
          const p = getP(i.peptideId);
          state.stack.push({
            peptideId: i.peptideId,
            doseValue: p && p.researched ? p.researched.min : p && p.doseUnit === "mg" ? 0.25 : 100,
            doseUnit: p ? p.doseUnit : "mcg",
            timesPerDay: 1,
          });
        });
        state.tab = "stack";
        save();
        render();
      })
    );

    root.querySelectorAll("[data-action='add-stack-item']").forEach((b) =>
      b.addEventListener("click", () => {
        state.tab = "library";
        render();
      })
    );
    root.querySelectorAll("[data-remove-stack]").forEach((b) =>
      b.addEventListener("click", () => {
        state.stack.splice(Number(b.getAttribute("data-remove-stack")), 1);
        save();
        render();
      })
    );
    root.querySelectorAll("[data-stack-dose]").forEach((inp) =>
      inp.addEventListener("input", () => {
        const i = Number(inp.getAttribute("data-stack-dose"));
        state.stack[i].doseValue = num(inp.value, 0);
        save();
        render();
        keepFocus(`[data-stack-dose="${i}"]`);
      })
    );
    root.querySelectorAll("[data-stack-unit]").forEach((sel) =>
      sel.addEventListener("change", () => {
        const i = Number(sel.getAttribute("data-stack-unit"));
        state.stack[i].doseUnit = sel.value;
        save();
        render();
      })
    );
    root.querySelectorAll("[data-stack-times]").forEach((inp) =>
      inp.addEventListener("input", () => {
        const i = Number(inp.getAttribute("data-stack-times"));
        state.stack[i].timesPerDay = Math.max(1, Math.floor(num(inp.value, 1)));
        save();
        render();
        keepFocus(`[data-stack-times="${i}"]`);
      })
    );

    const planPep = root.querySelector("#plan-pep");
    if (planPep) {
      planPep.addEventListener("change", () => {
        state.schedulePeptideId = planPep.value;
        save();
        render();
      });
    }
    root.querySelectorAll("[data-action='add-step']").forEach((b) =>
      b.addEventListener("click", () => {
        const p = getP(state.schedulePeptideId);
        state.schedule.push({
          doseValue: p && p.researched ? p.researched.min : 0.25,
          doseUnit: p ? p.doseUnit : "mg",
          duration: 4,
          durationUnit: "weeks",
          timesPerDay: 1,
          note: "",
        });
        save();
        render();
      })
    );
    root.querySelectorAll("[data-remove-step]").forEach((b) =>
      b.addEventListener("click", () => {
        state.schedule.splice(Number(b.getAttribute("data-remove-step")), 1);
        save();
        render();
      })
    );
    root.querySelectorAll("[data-step-dose]").forEach((inp) =>
      inp.addEventListener("input", () => {
        const i = Number(inp.getAttribute("data-step-dose"));
        state.schedule[i].doseValue = num(inp.value, 0);
        save();
        render();
        keepFocus(`[data-step-dose="${i}"]`);
      })
    );
    root.querySelectorAll("[data-step-unit]").forEach((sel) =>
      sel.addEventListener("change", () => {
        const i = Number(sel.getAttribute("data-step-unit"));
        state.schedule[i].doseUnit = sel.value;
        save();
        render();
      })
    );
    root.querySelectorAll("[data-step-times]").forEach((inp) =>
      inp.addEventListener("input", () => {
        const i = Number(inp.getAttribute("data-step-times"));
        state.schedule[i].timesPerDay = Math.max(1, Math.floor(num(inp.value, 1)));
        save();
        render();
        keepFocus(`[data-step-times="${i}"]`);
      })
    );
    root.querySelectorAll("[data-step-dur]").forEach((inp) =>
      inp.addEventListener("input", () => {
        const i = Number(inp.getAttribute("data-step-dur"));
        state.schedule[i].duration = Math.max(1, Math.floor(num(inp.value, 1)));
        save();
        render();
        keepFocus(`[data-step-dur="${i}"]`);
      })
    );
    root.querySelectorAll("[data-step-durunit]").forEach((sel) =>
      sel.addEventListener("change", () => {
        const i = Number(sel.getAttribute("data-step-durunit"));
        state.schedule[i].durationUnit = sel.value;
        save();
        render();
      })
    );
  }

  function render() {
    if (!state.acknowledged) {
      renderGate();
      return;
    }
    const root = document.getElementById("app");
    let body = "";
    if (state.tab === "calc") body = renderCalc();
    else if (state.tab === "library") body = renderLibrary();
    else if (state.tab === "blends") body = renderBlends();
    else if (state.tab === "stack") body = renderStack();
    else body = renderPlan();

    root.innerHTML = `
      <div class="shell">
        <header class="top">
          <div>
            <div class="brand">Meni<span>scus</span></div>
            <p class="tag">Research bench · not medical advice</p>
          </div>
          <span class="pill">Reference only</span>
        </header>
        <main>${body}</main>
      </div>
      ${nav(state.tab)}`;
    bind(root);
  }

  load();
  if (!getP(state.peptideId)) state.peptideId = "semaglutide";
  render();
})();
