# M10 · Dispositivos vinculados y acceso por PIN

## Estado en Monky

**Nuevo.** Confirmado leyendo el esquema real: no existe ninguna tabla `devices` ni mecanismo de login por PIN en Monky hoy; el acceso es por sesión de usuario normal (correo/contraseña). Este módulo construye desde cero la vinculación de dispositivos a una sucursal y el login rápido por PIN de 4 dígitos para el personal.

## 1. Objetivo y alcance

**Entra:** vincular un dispositivo (QR o enlace), pantalla de activación del dispositivo, login por PIN en ese dispositivo (teclado numérico), revocar acceso, listar dispositivos vinculados con "último uso".

**NO entra:** la gestión de roles/permisos del miembro (M00), el contenido de cada pantalla de trabajo (M04/M05/M06).

## 2. Dependencias

M00 (miembros y PIN definidos ahí).

## 3. Datos

**A crear:**

| Entidad | Campos | Notas |
|---|---|---|
| `devices` | `restaurant_id`, `name` (ej. "Tablet de meseros"), `linked_at`, `last_used_at`, `revoked bool default false`, `link_token` (firmado, con `exp`) | El token de vinculación lleva `deviceId`, `restaurantId` y `exp` (vence); se entrega por QR o enlace |

**Índices:** `devices(restaurant_id)`, `devices(revoked)`.

**Seguridad:** el token de vinculación debe expirar (por ejemplo, 10 minutos) y ser de un solo uso. El login por PIN en un dispositivo vinculado no emite una sesión de usuario "normal" con los mismos privilegios que un login por correo — queda limitado a esa sucursal y expira razonablemente (ver M00 para el rate-limit del PIN).

## 4. Estados y transiciones

```
Enlace generado ("Detectando el dispositivo…") ──dispositivo abre el enlace──▶ Vinculado (se le pone nombre)
Vinculado ──miembro ingresa PIN──▶ En uso
Vinculado/En uso ──Revocar acceso──▶ Revocado (no permite más ingresos por PIN; puede volver a vincularse)
```

## 5. Reglas de negocio y cálculos

- Revocar un dispositivo corta el acceso por PIN de inmediato; se puede volver a vincular cuando se quiera.
- "Salir" en el dispositivo vuelve al teclado de PIN sin desvincular el dispositivo.
- El PIN de 4 dígitos ya es obligatorio para todo miembro (M00); este módulo solo consume esa validación desde un dispositivo vinculado.

## 6. Permisos por rol

Solo Dueño y Administrador (o Administrador de miembros y permisos) pueden vincular/revocar dispositivos. Cualquier miembro con PIN válido puede usar un dispositivo ya vinculado.

## 7. Pantallas

### 7.1 Configuración de miembros — sección "Dispositivos con acceso por PIN"

- Explicación de que los dispositivos vinculados permiten a cualquier miembro entrar rápido solo con su PIN.
- Lista de dispositivos: nombre, último uso, opción de revocar acceso con confirmación explicando que el corte es inmediato y reversible al volver a vincular.
- "Vincular dispositivo": muestra un código QR y un enlace para abrir en el dispositivo a vincular, con un indicador de "Detectando el dispositivo…" mientras espera.
- Estado vacío: invitación a vincular el primer dispositivo para agilizar el ingreso del equipo.

### 7.2 Activación del dispositivo

Pantalla que confirma a qué sucursal se vinculará el dispositivo y pide un nombre descriptivo (ej. "Computadora de caja", "Estación de comedor", "Tablet de meseros") antes de activar.

### 7.3 Login del dispositivo

Logo del negocio y la sucursal, teclado numérico 0–9 con borrar (bloqueado mientras valida), y una opción para iniciar sesión con correo electrónico en su lugar.

Tras el PIN, entra a la pantalla de su rol (ver M00 para la redirección por rol). "Salir" vuelve al teclado sin desvincular.

## 8. Procesos paso a paso

**Puesta en marcha:** en cada tablet o celular del local, "Vincular dispositivo" → abrir el enlace o escanear el QR → ponerle nombre → Activar.

## 9. Textos de la interfaz

Redactar textos propios de Monky con el mismo propósito, en español neutro y tono cálido y breve. Ejemplos de referencia (a redactar, no copiar literal):

- Explicación de qué es el acceso por PIN y para qué sirve.
- Confirmación de revocación explicando que el corte es inmediato y reversible.
- Instrucción para escanear el QR o abrir el enlace de vinculación.
- Indicador de "detectando dispositivo" durante la espera.
- Estado vacío invitando a vincular el primer dispositivo.
- Título de la pantalla de activación indicando la sucursal de destino.
- Instrucción para ingresar el PIN de miembro.
- Enlace alternativo para iniciar sesión con correo electrónico.

## 10. Casos límite y requisitos

| # | Situación | Requisito de Monky |
|---|---|---|
| 1 | Token de vinculación reutilizado o vencido | Se invalida tras el primer uso; mostrar mensaje de enlace vencido si se reintenta |
| 2 | PIN incorrecto repetido | Bloqueo temporal tras 5 intentos fallidos (mismo criterio que el rate-limit de M00) |
| 3 | Dispositivo revocado que sigue con sesión activa en pantalla | La sesión se corta de inmediato en el siguiente request, no se espera a que el usuario salga manualmente |

## 11. Criterios de aceptación

- Dado un enlace de vinculación, cuando se abre en el dispositivo antes de que expire, entonces pide el nombre del dispositivo y lo activa.
- Dado un dispositivo revocado, cuando se intenta ingresar con PIN desde él, entonces se rechaza inmediatamente aunque el PIN sea correcto.
- Dado un miembro que pulsa "Salir" en un dispositivo vinculado, cuando se hace, entonces vuelve al teclado de PIN y el dispositivo sigue vinculado.
- Dado un PIN incorrecto repetido, cuando se supera el límite de intentos, entonces se bloquea temporalmente el ingreso por PIN en ese dispositivo.

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M10-T01 | Migración: tabla `devices` con token firmado y expiración | BD | db-architect | M | M00-T01 | RLS por restaurante; token no legible desde el cliente tras usarse |
| M10-T02 | RPC: generar enlace/QR de vinculación, activar dispositivo, revocar | BD | db-architect | M | M10-T01 | Token de un solo uso, expira en tiempo configurable |
| M10-T03 | Server action de login por PIN limitado a dispositivo vinculado (reutiliza el PIN de M00) | Backend | general-purpose | M | M10-T02, M00-T03 | Sesión limitada a la sucursal del dispositivo |
| M10-T04 | UI "Vincular dispositivo" (QR, enlace, detección) en Miembros y permisos | Frontend | general-purpose | M | M10-T02 | Reproduce §7.1 con textos propios de Monky |
| M10-T05 | UI activación del dispositivo | Frontend | general-purpose | S | M10-T02 | Reproduce §7.2 |
| M10-T06 | UI login por PIN (teclado numérico, bloqueo durante validación, enlace a login por correo) | Frontend | general-purpose | M | M10-T03 | Reproduce §7.3 |
| M10-T07 | UI "Revocar acceso" con confirmación clara | Frontend | general-purpose | S | M10-T02 | Texto claro y consistente con §9 |
| M10-T08 | Tests: token de un solo uso, revocación inmediata, rate-limit de PIN | QA | test-writer | M | M10-T02, M10-T03 | Suite Vitest + SQL |
| M10-T09 | Revisión de seguridad: expiración de token, scoping de sesión por dispositivo, rate-limit | QA | security-reviewer | M | M10-T01..T06 | Informe sin hallazgos críticos |

Basado en el relevamiento interno de funcionalidades del POS.
