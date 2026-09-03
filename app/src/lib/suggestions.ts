import type { PublicCategory, PublicProduct } from "@/types/menu";

export type MenuSuggestion =
  | { type: "single"; product: PublicProduct }
  | {
      type: "combo";
      dish: PublicProduct;
      drink: PublicProduct;
      comboPrice: number;
    };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function suggestionPrice(s: MenuSuggestion): number {
  return s.type === "combo" ? s.comboPrice : s.product.price;
}

/**
 * "Sugerencias para ti" nunca debe verse vacío ni depender de que el
 * restaurante configure algo primero:
 *
 * 1. Si hay productos marcados "Destacado" a mano, esos mandan (el
 *    restaurante los eligió a propósito) — se muestran como platos
 *    sueltos, sin combinar.
 * 2. Si no hay ninguno, se arman combos automáticos: un plato de cada
 *    categoría (menos la de bebidas) + una bebida, con el precio de
 *    los dos juntos — ordenados de más barato a más caro, como pidió
 *    el usuario ("desde baratos a caros").
 * 3. Si el restaurante no tiene una categoría reconocible como
 *    bebidas, se cae a mostrar platos sueltos (uno por categoría, por
 *    turnos) en vez de forzar un combo que no tiene sentido.
 */
export function getMenuSuggestions(
  categories: PublicCategory[],
  count = 4
): MenuSuggestion[] {
  const featured = categories
    .flatMap((c) => c.products)
    .filter((p) => p.featured && p.available);
  if (featured.length > 0) {
    return featured.map((product) => ({ type: "single", product }));
  }

  const drinksCategory = categories.find((c) =>
    normalize(c.name).includes("bebida")
  );
  const drinks = drinksCategory?.products.filter((p) => p.available) ?? [];

  if (drinks.length > 0) {
    const dishCategories = categories.filter((c) => c !== drinksCategory);
    const combos: MenuSuggestion[] = [];
    let drinkIndex = 0;

    for (const category of dishCategories) {
      const dish = category.products.find((p) => p.available);
      if (!dish) continue;
      const drink = drinks[drinkIndex % drinks.length];
      drinkIndex++;
      combos.push({
        type: "combo",
        dish,
        drink,
        comboPrice: dish.price + drink.price,
      });
      if (combos.length >= count) break;
    }

    if (combos.length > 0) {
      return combos.sort((a, b) => suggestionPrice(a) - suggestionPrice(b));
    }
  }

  // Sin categoría de bebidas reconocible: un plato por categoría, por
  // turnos, en vez de combos forzados sin sentido.
  const picks: PublicProduct[] = [];
  const cursors = new Array(categories.length).fill(0);
  const availableByCategory = categories.map((c) =>
    c.products.filter((p) => p.available)
  );

  let addedAny = true;
  while (picks.length < count && addedAny) {
    addedAny = false;
    for (let i = 0; i < categories.length && picks.length < count; i++) {
      const list = availableByCategory[i];
      if (cursors[i] < list.length) {
        picks.push(list[cursors[i]]);
        cursors[i]++;
        addedAny = true;
      }
    }
  }

  return picks
    .map((product): MenuSuggestion => ({ type: "single", product }))
    .sort((a, b) => suggestionPrice(a) - suggestionPrice(b));
}

/** Para el "¿Agregas algo más?" del carrito: productos sueltos, sin
 * armar combos ahí — agregar un combo de un solo toque sumaría dos
 * ítems distintos a la vez, y ese lugar es para un empujón rápido, no
 * para elegir un combo con calma. */
export function flattenSuggestions(
  suggestions: MenuSuggestion[]
): PublicProduct[] {
  const seen = new Set<string>();
  const products: PublicProduct[] = [];
  for (const s of suggestions) {
    const items = s.type === "combo" ? [s.dish, s.drink] : [s.product];
    for (const p of items) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        products.push(p);
      }
    }
  }
  return products;
}
