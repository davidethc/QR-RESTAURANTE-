# Monky.com — Arquitectura de Proyecto

Sistema dual: **Wiki LLM** (documentación persistente) + **Sistema QR para Restaurantes** (código/desarrollo).

---

## 📋 Objetivo General

Construir y documentar un sistema digital de atención y pedidos para restaurantes (QR-based), manteniendo:
1. **Wiki LLM** (`wiki/`) — Base de conocimiento actualizada, síntesis de decisiones, documentación de diseño
2. **Raw Sources** (`raw/`) — Documentos originales de UX, arquitectura, reglas de negocio (inmutables)
3. **Código** (`app/`) — Sistema en producción (Next.js 16 + Supabase + PostgreSQL, desplegado en Vercel)

---

## 🗂️ Estructura de Carpetas

```
monky.com/
├── CLAUDE.md                 # Este archivo (arquitectura + reglas)
├── README.md                 # Visión general pública
├── raw/                      # ⚠️ INMUTABLE — fuentes originales
│   └── assets/               # Documentos UX, wireframes, especificaciones
│       ├── PROYECTO_*.md     # Especificaciones generales
│       ├── FASE UX_*.md      # Wireframes por rol (cocina, mesero, cliente)
│       ├── MAPA DE PANTALLAS.md
│       ├── Roles y flujo operativo.md
│       └── [nuevas fuentes aquí]
├── app/                      # 🚀 Código en producción (Next.js 16 + Supabase)
│   ├── src/
│   │   ├── app/              # Rutas y layouts de Next.js
│   │   ├── components/       # Componentes reutilizables (shadcn + custom)
│   │   ├── lib/              # Utilidades, acciones, validaciones
│   │   ├── hooks/            # Hooks custom de React
│   │   ├── types/            # TypeScript types (generados de Supabase)
│   │   └── proxy.ts          # Rutas protegidas del panel (en Next 16 reemplaza a middleware)
│   ├── supabase/
│   │   ├── migrations/       # Migraciones SQL (versión = la aplicada en producción)
│   │   └── tests/            # Pruebas SQL (BEGIN … ROLLBACK, restaurante monky-qa)
│   ├── AGENTS.md             # Documentación de API cambios en Next.js 16
│   ├── TESTING.md            # Registro de QA (versionado: nunca poner credenciales; están en .env.qa.local)
│   └── package.json          # Dependencias (React 19, Tailwind, shadcn)
├── .github/workflows/ci.yml  # CI: typegen, tsc, lint, vitest, build
├── .claude/agents/           # Agentes especializados del proyecto
├── wiki/                     # ✏️ GENERADA POR CLAUDE — síntesis
│   ├── index.md              # Catálogo maestro (actualizar siempre)
│   ├── log.md                # Registro cronológico de cambios
│   ├── sources.md            # Index de raw sources
│   ├── search-index.md       # Búsqueda rápida
│   ├── entity/               # Páginas sobre roles, actores
│   │   └── roles-del-sistema.md
│   ├── concepts/             # Ideas, frameworks, especificaciones
│   │   ├── arquitectura-tecnica-mvp.md
│   │   ├── flujos-operativos-mvp.md
│   │   ├── mapa-pantallas-general.md
│   │   ├── mvp-alcance.md
│   │   ├── pantallas-cliente-detalles.md
│   │   ├── reglas-negocio-mvp.md
│   │   ├── modelo-datos-definitivo.md
│   │   └── panel-del-admin.md
│   ├── comparisons/          # Análisis comparativos (problema vs solución)
│   │   └── problema-vs-solucion.md
│   ├── syntheses/            # Síntesis cross-referenciadas
│   │   ├── proyecto-qr-vision-general.md
│   │   ├── fase-ux-wireframes.md
│   │   ├── estado-del-sistema-2026-09-26.md
│   │   ├── estado-del-sistema-2026-09-28.md
│   │   └── diseno-cobro-reportes-inventario.md
│   └── .obsidian/            # Config de Obsidian (plugins, graph settings)
└── .git                       # Control de versión
```

---

## 🎯 Tipos de Tareas

### 1. **Ingest** — Añadir/procesar fuentes
- Leer nuevo documento en `raw/`
- Extraer conceptos clave
- Crear/actualizar páginas wiki
- Actualizar cross-references en todas las páginas relacionadas
- Registrar en `log.md` e `index.md`

**Comando**: "Ingesta `raw/[nombre]`"

### 2. **Query** — Hacer preguntas sobre el wiki
- Encontrar información existente
- Sintetizar respuestas desde múltiples páginas
- Opcionalmente crear nueva página si la síntesis es valiosa
- Formato: respuesta markdown, tabla, diagrama, o análisis

**Comando**: Preguntas normales ("¿Cuáles son los roles?", "¿Cómo es el flujo de cliente?")

### 3. **Architecture** — Diseño y decisiones
- Proponer arquitectura de código/sistema
- Documentar decisiones en wiki
- Crear diagramas de flujo/datos
- Actualizar `arquitectura-tecnica-mvp.md`

**Comando**: "Diseña la arquitectura para [componente]"

### 4. **Code** — Desarrollo
- Crear/editar código del sistema QR
- Seguir convenciones definidas
- Mantener tests
- Actualizar docs/ desde cambios en wiki

**Comando**: "Implementa [feature]"

### 5. **Lint** — Mantenimiento del wiki
- Buscar contradicciones entre páginas
- Identificar páginas huérfanas (sin backlinks)
- Verificar broken links
- Actualizar información obsoleta
- Proponer nuevas páginas para conceptos mencionados sin documento

**Comando**: "Lint del wiki"

---

## 📝 Convenciones de Formato

### Frontmatter YAML (obligatorio en wiki/)
```yaml
---
title: "Título de la Página (Sentence case)"
type: "entity|concept|comparison|synthesis|reference"
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
sources: ["raw/archivo1.md", "raw/archivo2.md"]
tags: ["tag1", "tag2", "tag3"]
aliases: ["nombre-archivo-sin-md"]  # ⚠️ CRÍTICO para wikilinks
---
```

### Wikilinks
- Formato: `[[Título de la Página]]` (Title Case, coincide con frontmatter `title:`)
- Links deben ser bidireccionales cuando sea posible
- Usar alias si el archivo tiene nombre kebab-case
- En Obsidian, verifica que aparezcan azules (resolved) no rojo (unresolved)

### Enlaces a Fuentes Raw
- `[Descripción](../raw/assets/nombre-archivo.md)` — link interno relativo
- Siempre incluir en frontmatter `sources:`

### Estructura de Contenido
```markdown
# Título Principal (H1 — UNO solo por página)

Brief intro (1-2 sentences).

## Sección Principal (H2)

Contenido detallado.

### Subsección (H3)

Más detalle.

## Véase También
- [[Página Relacionada 1]]
- [[Página Relacionada 2]]
```

---

## 🔄 Archivos Clave del Wiki

### `index.md` — Catálogo Maestro
Actualizar SIEMPRE cuando se añada o cambien páginas:
```markdown
## Entities (Actores/Roles)
- [[Roles del Sistema]] — Descripción breve (sources: N)

## Concepts (Ideas/Especificaciones)
- [[Flujos Operativos del MVP]] — Descripción (sources: N)
- [[Arquitectura Técnica MVP]] — Descripción (sources: N)
...

## Syntheses (Composiciones)
- [[Proyecto QR - Visión General]] — Descripción (sources: N)
...

## Comparisons
- [[Análisis: Problema vs Solución]] — Descripción (sources: N)

## References
- [[Fuentes Originales]] — Index de raw/

## Meta
- **Páginas wiki**: N
- **Fuentes raw**: N
- **Última actualización**: YYYY-MM-DD
```

### `log.md` — Registro de Cambios
Append-only (nunca borrar). Formato consistente:
```markdown
## [YYYY-MM-DD] [operación] | Breve descripción

- **Resumen**: Qué se hizo (1-2 líneas)
- **Páginas actualizadas**: [[página1]], [[página2]]
- **Nuevas páginas**: [[nueva1]], [[nueva2]] (si aplica)
- **Contradiciones detectadas**: ninguno / [descripción]
- **Duración**: Xmin
```

### `sources.md` — Index de Raw Sources
Listar todos los archivos en `raw/` con:
- Nombre original
- Descripción
- Fecha de ingesta
- Link a páginas wiki que lo referencian

---

## 👤 Reglas para Claude

### Lectura
1. **Siempre** leer `CLAUDE.md` al iniciar (esto)
2. **Siempre** consultar `memory/` para contexto persistente entre sesiones
3. Cuando se trabaje con wiki, leer `index.md` primero para orientación
4. Leer `log.md` últimas 5 entradas para entender decisiones recientes
5. **Antes de hacer QA o probar algo del código** (`app/`), leer `app/TESTING.md`
   — registro de qué ya se probó, cómo, y con qué credenciales/datos de prueba.
   Actualizarlo después de cada ronda de QA nueva, no solo leerlo.

### Escritura
1. **Nunca** modificar `raw/` — es inmutable
2. **Siempre** mantener `index.md` actualizado si se añaden páginas
3. **Siempre** registrar cambios en `log.md` (append, nunca borrar)
4. **Siempre** usar frontmatter YAML correcto (con `aliases:`)
5. **Siempre** crear wikilinks bidireccionales (si A→B, verificar que B→A si es lógico)
6. Actualizar `updated:` en frontmatter cuando se modifique una página

### Estilo
1. **Sin comentarios innecesarios** — el código habla por sí solo
2. **Favorecer claridad** sobre brevedad
3. **Usar listas** para estructurar información compleja
4. **Evitar jerga técnica sin definir**
5. **Citar fuentes** siempre (links a raw/)

### Cuando Contactar (preguntar al usuario)
- Antes de proponer cambios de arquitectura significativos
- Antes de eliminar páginas wiki (aunque sean "duplicadas")
- Cuando haya contradiciones entre fuentes que no pueden resolverse automáticamente
- Cuando se necesite hacer cambios destructivos (git reset, rm -r, etc.)

---

## 🔧 Workflows Específicos

### Workflow: Ingesta de Nueva Fuente
```
1. Usuario coloca archivo en raw/assets/
2. Yo lo leo completamente
3. Extraigo 3-5 conceptos clave
4. Para cada concepto:
   - ¿Existe página en wiki? → Actualizar
   - ¿No existe? → Crear nueva página
5. Actualizar cross-references (wikilinks bidireccionales)
6. Actualizar index.md y log.md
7. Mostrar reporte de cambios
```

### Workflow: Query (Preguntas sobre el wiki)
```
1. Usuario hace pregunta ("¿Cuál es el flujo de X?")
2. Yo leo index.md para encontrar páginas relevantes
3. Leo esas páginas completamente
4. Sintetizo respuesta CON CITAS (links a las páginas)
5. Opcionalmente: si la síntesis es valiosa, crear nueva página
6. Actualizar log.md con la pregunta y respuesta
```

### Workflow: Lint del Wiki
```
1. Usuario dice "Lint del wiki"
2. Yo verifico:
   - Wikilinks rotos (red text en Obsidian)
   - Páginas sin backlinks (huérfanas)
   - Contradicciones de fechas/hechos
   - Frontmatter inconsistente
   - Conceptos mencionados sin página
3. Reportar hallazgos
4. Proponer arreglos (sin ejecutar hasta confirmar)
```

---

## 🛠️ Herramientas Recomendadas

- **Obsidian**: Editar wiki, ver Graph View (verificar conexiones), buscar
- **Claude Code**: Automatizar ingesta, queries, linting
- **Git**: Versioning del wiki
- **Dataview plugin** (opcional): Generar tablas dinámicas desde frontmatter
- **Daily Notes** (opcional): Notas rápidas (no van al wiki)

---

## 📊 Métricas del Proyecto (actualizar periódicamente)

- **Páginas wiki**: 16 (entities, concepts, syntheses, comparisons, references)
- **Fuentes raw**: 8 (documentos UX, wireframes, especificaciones, arquitectura)
- **Wikilinks totales**: 100+ (red densa, bien interconectada)
- **Nodos centrales**: 8 (Proyecto, Flujos, Mapa, Reglas, MVP-Alcance, Pantallas, Modelo de Datos, Panel del Admin)
- **Tasa de actualización**: Activa (última 2026-09-28)
- **Código en producción**: Next.js 16 + Supabase (`fvzxfbzujvkkvniyphps`) + Vercel (`qr-restaurante-d3b9.vercel.app`)
- **Migraciones versionadas**: 85+ (v20260902 a v20260928)
- **Módulos funcionales**: Pedidos QR, Cocina, Mesero, Cobro/Caja, Reportes, Personal, Dashboard "Hoy"
- **Primer restaurante**: Cafetería Omm Siri (`slug: omm-siri`)

---

## ❓ FAQ

**P: ¿Por qué `raw/` es inmutable?**
R: Para mantener una fuente de verdad auditoria. Si necesitas actualizar información, crea una nueva fuente o una página wiki que corrija la anterior.

**P: ¿Cuándo crear una nueva página wiki vs. actualizar existente?**
R: Nueva página si es un concepto distinto; actualizar si es contenido relacionado con tema existente.

**P: ¿Cómo manejo contradicciones entre fuentes?**
R: Crear página de `comparison/` que analice ambas perspectivas. Nunca borrar información.

**P: ¿Puedo pushear cambios del wiki a git?**
R: Sí, el wiki es un repo. Commit después de cambios significativos.

**P: ¿Cuándo hace lint?**
R: Periódicamente (ej. cada 10-15 pages nuevas, o cuando el usuario lo pide).

---

## 🔧 Flujo de trabajo del código

```
Rama por entrega (desde origin/main) → CI (ci + Vercel) → PR → revisión del jefe general
              ↓
            Merge a main (solo el jefe general) → Deploy automático a Vercel (producción)
```

### Sesiones y carpetas (git worktrees)

Varias sesiones de Claude trabajan a la vez. Cada una tiene su carpeta y nunca edita la de otra:

| Sesión | Carpeta | Qué hace |
|---|---|---|
| `[jefe general]` | `QR-RESTAURANTE-` (principal, siempre en `main`) | Orquesta, revisa y fusiona PRs, aplica migraciones, vigila producción |
| `{jefe diseno}` | `QR-RESTAURANTE--diseno` | UI/UX y estilos (tokens, componentes visuales) |
| `[jefe funcionalidades]` | `QR-RESTAURANTE--funcionalidades` | Funcionalidades nuevas (lógica, acciones, migraciones con OK) |

- Para crear una carpeta nueva: `git worktree add -b <rama> ../QR-RESTAURANTE--<nombre> origin/main`, copiar `app/.env.local` y `app/.env.qa.local`, y correr `npm ci` en `app/`. Turbopack no acepta `node_modules` como enlace simbólico.
- Los subagentes de un jefe usan `Agent` con `isolation: "worktree"` (rama y carpeta propias en `.claude/worktrees/`, que git ignora). El jefe revisa y fusiona su trabajo en su rama con `git merge --no-ff`.
- **Una rama por entrega**, creada desde `origin/main`. GitHub borra la rama al fusionar el PR.
- Para ponerse al día: `git fetch && git merge origin/main`. No se hace rebase de ramas ya publicadas.

### Reglas de `main` (protegida en GitHub)

- Nadie hace push directo, ni siquiera un admin. Todo entra por PR.
- Checks obligatorios: `ci` (typegen, tsc, lint, vitest, build) y `Vercel`.
- Solo el `[jefe general]` fusiona, con `gh pr merge <n> --merge`. El historial conserva los commits de merge.
- Antes de abrir el PR: `tsc`, `lint`, `test` y `build` en verde, y en la descripción qué cambia, cómo se probó y el orden de despliegue si hay migraciones.
- Después de cada merge: esperar el deploy de producción y comprobar `/api/health`, `/login` y `/r/omm-siri`.
- **Rollback:** `gh pr revert <n>` abre un PR que deshace el merge, y se fusiona igual que cualquier otro. En una emergencia, Instant Rollback en el panel de Vercel.

### Migraciones (expand → deploy → contract)

1. **Expand:** SQL compatible con la app que está hoy en producción (parámetros nuevos con `default`, columnas nuevas opcionales).
2. `db-architect` las escribe, `security-reviewer` las aprueba y el `[jefe general]` da el OK y las aplica en `fvzxfbzujvkkvniyphps`.
3. Probar la app **actual** contra la base migrada en `monky-qa`.
4. **Deploy:** fusionar el código que usa lo nuevo.
5. **Contract:** borrar lo viejo en un PR aparte, cuando nada lo use.
- `apply_migration` registra otra versión (la hora de aplicación). Después de aplicar, renombrar el archivo con la versión real: `select version, name from supabase_migrations.schema_migrations`.
- Regenerar tipos con `npx supabase gen types typescript --project-id fvzxfbzujvkkvniyphps > app/src/types/database.ts`.

**Testing**: Ver `app/TESTING.md` (QA en `monky-qa`, nunca en `omm-siri`). Los previews de Vercel usan la base de **producción**.

---

## 🚀 Próximas Prioridades

1. ✅ Arquitectura del proyecto (CLAUDE.md, wiki actualizada)
2. ✅ Sistema en producción con módulos de negocio (cobro, caja, reportes, personal)
3. **P0 — Seguridad y estabilidad**
   - [ ] Backups automáticos (plan Supabase Pro, PITR)
   - [ ] Repo privado en GitHub y rotar `qr_token` de mesas
   - [ ] Ambiente staging aislado de producción
4. **P1 — Confiabilidad operativa**
   - [ ] Tests de dinero en CI (Vitest + SQL de transacciones)
   - [ ] Monitoreo con Sentry y dashboards Vercel
   - [ ] Revisión de permisos: cocina no ve tokens ni ventas
5. **P2 — Roadmap del producto**
   - [ ] Módulo SRI (facturación electrónica) — punto de extensión ya marcado
   - [ ] Módulo Inventario completo (recetas, costos, waste, stock)
   - [ ] Página de Para Llevar/Delivery y pedidos por WhatsApp
6. **P3 — Escalabilidad**
   - [ ] Multi-restaurante (SaaS con planes y facturación)
   - [ ] Impresoras térmicas de cocina (integración CUPS o similar)
   - [ ] Cartas con IA, pronóstico de demanda, reportes inteligentes

---

*Última actualización: 2026-09-28 (sistema en producción, prioridades actualizadas)*
