import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
        hostname: "fvzxfbzujvkkvniyphps.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
