import path from "node:path";
import type { NextConfig } from "next";

/**
 * Host de Supabase para las fotos de la carta (Storage). Sale de la misma
 * variable que usa el cliente, así un proyecto nuevo (staging, QA) no exige
 * tocar este archivo. El host fijo queda solo como respaldo si la variable no
 * está o no es una URL válida.
 */
function supabaseHostname(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "fvzxfbzujvkkvniyphps.supabase.co";
  }
}

/**
 * Cabeceras de seguridad para todas las rutas. La CSP lleva SOLO
 * `frame-ancestors` (lo mismo que X-Frame-Options, para navegadores
 * modernos): una CSP completa necesita inventariar scripts, estilos, Supabase
 * Realtime y fuentes, y mal hecha rompe la app en producción.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Sin esto Turbopack sube buscando un lockfile y encuentra uno suelto en
  // el home del usuario, fuera del repo: infiere ahí la raíz del workspace
  // y avisa de que ignora el package-lock.json de verdad.
  turbopack: { root: path.resolve(import.meta.dirname) },
  // Prerenderiza un "shell" estático de cada ruta y lo sirve desde el CDN,
  // dejando que solo lo que depende de la petición (la sesión de mesa)
  // llegue por streaming. Es lo que permite que al tocar un enlace la
  // carta aparezca ya pintada en vez de esperar al servidor.
  cacheComponents: true,
  // Cada <Link> visible precarga el shell de su destino.
  partialPrefetching: true,
  experimental: {
    // Reescribe los imports con nombre a imports de módulo concreto, para
    // no arrastrar el barrel entero. `lucide-react` ya viene en la lista
    // por defecto de Next 16, así que solo hace falta declarar radix.
    optimizePackageImports: ["radix-ui"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname(),
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
