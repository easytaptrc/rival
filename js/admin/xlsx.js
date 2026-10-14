// Carga diferida de SheetJS para leer y generar Excel.
let p;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  p = p || new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => res(window.XLSX);
    s.onerror = () => { p = null; rej(new Error("No se pudo cargar el lector de Excel (revisa tu conexión).")); };
    document.head.append(s);
  });
  return p;
}

/** Descarga un .xlsx con una o varias hojas: [{name, rows: [[...], ...]}] */
export async function exportXLSX(filename, sheets) {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  sheets.forEach((s) => {
    const ws = X.utils.aoa_to_sheet(s.rows);
    ws["!cols"] = (s.rows[0] || []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...s.rows.map((r) => String(r[i] ?? "").length + 2))) }));
    X.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  X.writeFile(wb, filename);
}
