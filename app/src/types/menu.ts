export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
  available: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProductOption {
  id: string;
  product_id: string;
  name: string;
  type: string;
  required: boolean;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductOptionValue {
  id: string;
  product_option_id: string;
  name: string;
  price_modifier: number;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: PublicProduct;
  quantity: number;
  notes: string;
  subtotal: number;
}

/**
 * Lo que el mesero va anotando al tomar el pedido en la mesa.
 *
 * Más plano que `CartItem` a propósito: no arrastra el `PublicProduct`
 * entero porque la pantalla del mesero es una lista densa que solo muestra
 * nombre y precio — no hay foto, ni descripción, ni bebida sugerida que
 * pintar. El precio que viaja aquí es solo para mostrar el total mientras
 * arma el pedido; el que se cobra lo recalcula la base.
 */
export interface StaffCartItem {
  /**
   * Identidad de la línea, estable durante toda su vida.
   *
   * No basta con `productId` + notas: al escribir una indicación esa clave
   * cambiaría con cada tecla, React remontaría la fila y el cursor saltaría
   * fuera del campo. Esto lo fija de una vez al crear la línea.
   */
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

/* Carta pública — lo que devuelve el RPC get_public_menu.
   Deliberadamente más pequeño que Product: al cliente solo viaja
   lo que necesita para decidir. */

export interface PublicPairedDrink {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  available: boolean;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  available: boolean;
  featured: boolean;
  position: number;
  paired_drink: PublicPairedDrink | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  description: string | null;
  position: number;
  products: PublicProduct[];
}

export interface PublicRestaurant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  phone: string | null;
  address: string | null;
  timezone: string;
  opening_hours: Record<string, unknown> | null;
}

export interface PublicMenu {
  restaurant: PublicRestaurant;
  categories: PublicCategory[];
}
