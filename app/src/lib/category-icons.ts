/**
 * Emoji por categoría de la carta.
 *
 * Se resuelve por palabra clave del nombre y no por id: el dueño crea
 * y renombra categorías desde su panel, así que atarlo a ids fijos se
 * rompería en cuanto cree una nueva. Si nada coincide cae al genérico
 * — nunca queda un hueco.
 *
 * Es texto, no imágenes: cero peso de red, escala con la tipografía y
 * se ve nítido en cualquier pantalla.
 */
const KEYWORD_ICONS: [string[], string][] = [
  [["desayuno", "breakfast"], "🍳"],
  [["pizza"], "🍕"],
  [["bebida", "jugo", "drink", "cafe", "café"], "🥤"],
  [["postre", "dulce", "helado"], "🍰"],
  [["snack", "sanduche", "sánduche", "sandwich", "empanada"], "🥪"],
  [["plato fuerte", "fuerte", "almuerzo", "principal"], "🍽️"],
  [["porcion", "porción", "adicional", "extra", "acompañ"], "➕"],
  [["reunion", "reunión", "grupo", "parrillada", "compartir"], "🔥"],
  [["sopa", "caldo"], "🍲"],
  [["ensalada", "vegetal", "verdura"], "🥗"],
  [["carne", "pollo", "res"], "🍗"],
  [["mariscos", "pescado", "ceviche"], "🐟"],
];

const FALLBACK_ICON = "🍽️";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function getCategoryIcon(categoryName: string): string {
  const name = normalize(categoryName);
  for (const [keywords, icon] of KEYWORD_ICONS) {
    if (keywords.some((k) => name.includes(normalize(k)))) return icon;
  }
  return FALLBACK_ICON;
}
