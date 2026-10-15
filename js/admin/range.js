// Selector de periodo: un día, de tal día a tal día, de tal mes a tal mes, de tal año a tal año.
import { ymd } from "../core/membership.js";

const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m: 1-12

export function rangePicker(onChange, { mode = "dia" } = {}) {
  const t = ymd(), ym = t.slice(0, 7), y = Number(t.slice(0, 4));
  const el = document.createElement("div");
  el.className = "toolbar";
  el.innerHTML = `<div class="seg" data-mode>${[["dia", "Día"], ["rango", "Días"], ["mes", "Meses"], ["anio", "Años"]].map(([k, l]) => `<button type="button" data-m="${k}" class="${k === mode ? "on" : ""}">${l}</button>`).join("")}</div>
    <span data-in="dia"><input type="date" class="input" style="width:auto" data-a value="${t}"></span>
    <span data-in="rango" class="row"><input type="date" class="input" style="width:auto" data-a value="${t.slice(0, 8)}01"><span class="dim">a</span><input type="date" class="input" style="width:auto" data-b value="${t}"></span>
    <span data-in="mes" class="row"><input type="month" class="input" style="width:auto" data-a value="${ym}"><span class="dim">a</span><input type="month" class="input" style="width:auto" data-b value="${ym}"></span>
    <span data-in="anio" class="row"><input type="number" class="input mono" style="width:110px" data-a value="${y}" min="2020" max="2100"><span class="dim">a</span><input type="number" class="input mono" style="width:110px" data-b value="${y}" min="2020" max="2100"></span>`;
  const show = () => el.querySelectorAll("[data-in]").forEach((s) => (s.hidden = s.dataset.in !== mode));
  const get = () => {
    const box = el.querySelector(`[data-in="${mode}"]`);
    const a = box.querySelector("[data-a]").value, b = box.querySelector("[data-b]")?.value || a;
    let from, to;
    if (mode === "dia") from = to = a || t;
    if (mode === "rango") { from = a; to = b; }
    if (mode === "mes") { from = `${a}-01`; const [yy, mm] = b.split("-").map(Number); to = `${b}-${pad(lastDay(yy, mm))}`; }
    if (mode === "anio") { from = `${a}-01-01`; to = `${b}-12-31`; }
    if (from > to) [from, to] = [to, from];
    return { from, to, mode };
  };
  el.querySelector("[data-mode]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    mode = b.dataset.m; el.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("on", x === b)); show(); onChange(get());
  });
  el.addEventListener("change", (e) => { if (e.target.matches("input")) onChange(get()); });
  show();
  return { el, get };
}

export function rangeLabel({ from, to }) {
  const f = (s, o) => new Date(s + "T00:00:00").toLocaleDateString("es-MX", o);
  if (from === to) return f(from, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${f(from, { day: "numeric", month: "short", year: "numeric" })} – ${f(to, { day: "numeric", month: "short", year: "numeric" })}`;
}
