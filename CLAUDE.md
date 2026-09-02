# Monky.com — Arquitectura de Proyecto

Sistema dual: **Wiki LLM** (documentación persistente) + **Sistema QR para Restaurantes** (código/desarrollo).

---

## 📋 Objetivo General

Construir y documentar un sistema digital de atención y pedidos para restaurantes (QR-based), manteniendo:
1. **Wiki LLM** (`wiki/`) — Base de conocimiento actualizada, síntesis de decisiones, documentación de diseño
2. **Raw Sources** (`raw/`) — Documentos originales de UX, arquitectura, reglas de negocio (inmutables)
3. **Código** (TBD) — Implementación del MVP (cuando empecemos desarrollo)

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
│   │   └── reglas-negocio-mvp.md
│   ├── comparisons/          # Análisis comparativos (problema vs solución)
│   │   └── problema-vs-solucion.md
│   ├── syntheses/            # Síntesis cross-referenciadas
│   │   ├── fase-ux-wireframes.md
│   │   └── proyecto-qr-vision-general.md
│   └── .obsidian/            # Config de Obsidian (plugins, graph settings)
├── src/ (TBD)                # Código fuente (cuando empiece desarrollo)
├── tests/ (TBD)              # Tests automatizados
├── docs/ (TBD)               # Documentación técnica derivada del wiki
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

- **Páginas wiki**: 12 (conceptos, entities, syntheses, comparisons)
- **Fuentes raw**: 7 (documentos UX, wireframes, especificaciones)
- **Wikilinks totales**: 60+ (red densa, bien interconectada)
- **Nodos centrales**: 5 (Flujos, Mapa, Reglas, MVP-Alcance, Pantallas)
- **Tasa de actualización**: Variable (depende de ingesta)
- **Estado del código**: TBD (aún sin implementación)

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

## 🚀 Próximas Prioridades

1. ✅ Definir arquitectura (ESTE DOCUMENTO)
2. ✅ Crear memoria persistente del proyecto
3. ⏳ Corregir aliases en todas las páginas wiki (para Obsidian)
4. ⏳ Definir arquitectura del código/MVP
5. ⏳ Iniciar desarrollo (si aplica)

---

*Última actualización: 2026-09-01 (arquitectura initial + workflow definido)*
