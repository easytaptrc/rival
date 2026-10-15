// Lógica compartida de solicitudes de insumos (panel e insumos.html).

export const REQ_STATUS = {
  pendiente: ["bad", "Pendiente"],
  en_curso: ["warn", "En curso"],
  entregada: ["info", "Por confirmar"],
  recibida: ["ok", "Recibida"],
  cancelada: ["plain", "Cancelada"],
};

/** Líneas de una solicitud (compatibilidad con solicitudes antiguas de un solo artículo). */
export function reqItems(r) {
  if (Array.isArray(r.items) && r.items.length) return r.items;
  return [{ name: r.item || "Artículo", qty: Number(r.qty) || 1, unit: r.unit || "" }];
}

export function reqTitle(items) {
  if (!items.length) return "Solicitud";
  return items.length === 1 ? items[0].name : `${items[0].name} y ${items.length - 1} más`;
}

export function reqSummary(items, key = "qty") {
  return items.map((i) => `${i[key] ?? i.qty} ${i.unit || ""} ${i.name}`.replace(/\s+/g, " ").trim()).join(" · ");
}

/** ID estable para el inventario de recepción a partir del nombre del artículo. */
export function itemSlug(name) {
  return String(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "articulo";
}
