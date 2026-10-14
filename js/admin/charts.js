// Gráficas SVG ligeras (sin librerías) con animación.
import { esc, fmtMoney } from "../core/ui.js";

let gid = 0;
const niceMax = (v) => { if (v <= 0) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p * 1.15) * p; };

/** Línea con área. data: [{label, value}] */
export function lineChart(data, { height = 220, money = false, labelEvery, width = 640 } = {}) {
  const W = width, H = height, L = 40, R = 12, T = 14, B = 28;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const x = (i) => L + (data.length <= 1 ? 0 : (i * (W - L - R)) / (data.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const id = `gArea${++gid}`;
  const every = labelEvery || Math.max(1, Math.ceil(data.length / 8));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:auto" role="img">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".35"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${money ? compact(t) : Math.round(t)}</text>`).join("")}
    ${data.length ? `<path d="${path} L${x(data.length - 1)} ${H - B} L${L} ${H - B} Z" fill="url(#${id})"/><path class="line" d="${path}"/>` : ""}
    ${pts.map((p, i) => `<circle class="dotp" cx="${p[0]}" cy="${p[1]}" r="3"><title>${esc(data[i].label)}: ${money ? fmtMoney(data[i].value) : data[i].value}</title></circle>`).join("")}
    ${data.map((d, i) => (i % every === 0 || i === data.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>` : "").join("")}
  </svg>`;
}

/** Barras verticales. data: [{label, value}] */
export function barChart(data, { height = 220, money = false, width = 640 } = {}) {
  const W = width, H = height, L = 40, R = 8, T = 14, B = 28;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const bw = (W - L - R) / Math.max(1, data.length);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const every = Math.max(1, Math.ceil(data.length / 12));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:auto" role="img">
    ${[0, 0.5, 1].map((t) => `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(max * t)}" y2="${y(max * t)}"/><text x="${L - 8}" y="${y(max * t) + 4}" text-anchor="end">${money ? compact(max * t) : Math.round(max * t)}</text>`).join("")}
    ${data.map((d, i) => `<rect class="bar" style="animation-delay:${i * 18}ms" x="${L + i * bw + bw * 0.18}" y="${y(d.value)}" width="${bw * 0.64}" height="${Math.max(0, H - B - y(d.value))}" rx="3"><title>${esc(d.label)}: ${money ? fmtMoney(d.value) : d.value}</title></rect>`).join("")}
    ${data.map((d, i) => i % every === 0 ? `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>` : "").join("")}
  </svg>`;
}

/** Barras horizontales. data: [{label, value}] */
export function hbars(data, { money = false } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return `<div class="hbar">${data.map((d, i) => `<div class="hb-row"><span class="truncate">${esc(d.label)}</span><div class="hb-track"><div class="hb-fill" style="width:${(d.value / max) * 100}%;animation-delay:${i * 60}ms"></div></div><b class="mono">${money ? fmtMoney(d.value) : d.value}</b></div>`).join("") || '<div class="empty">Sin datos</div>'}</div>`;
}

/** Mapa de calor día x hora. grid[dow][hour] = n */
export function heatmap(grid) {
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const max = Math.max(1, ...grid.flat());
  let html = `<div class="heat"><span></span>${Array.from({ length: 24 }, (_, h) => `<span style="text-align:center">${h % 3 === 0 ? h : ""}</span>`).join("")}`;
  [1, 2, 3, 4, 5, 6, 0].forEach((d) => {
    html += `<span>${days[d]}</span>` + grid[d].map((v, h) => `<i style="opacity:${v ? 0.12 + 0.88 * (v / max) : 0.05}" title="${days[d]} ${h}:00 · ${v} accesos"></i>`).join("");
  });
  return html + "</div>";
}

function compact(n) {
  return n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;
}
