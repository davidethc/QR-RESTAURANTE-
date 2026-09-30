# M18 · QA end-to-end

## Estado en Monky

**Ya existe:** rondas de QA en vivo documentadas en `app/TESTING.md`, siempre contra el restaurante aislado de pruebas `monky-qa` — nunca contra `omm-siri`, que es el restaurante real en producción. Ya hay precedentes de QA en vivo para el módulo de Cobro y Caja registrados ahí, con fecha, credenciales de prueba (en `.env.qa.local`, nunca en el archivo versionado) y resultado.

**Es nuevo:** una suite Playwright que cubra cada proceso operativo completo de punta a punta (no solo módulos sueltos), y una lista de control ejecutable de los casos límite transversales del proyecto, con un estado (Pasa / Falla / No aplica en Monky) por cada fila, también registrado en `app/TESTING.md`.

## 1. Objetivo y alcance

**Entra:** pruebas E2E (Playwright) de cada proceso operativo de principio a fin, una prueba (manual o automatizada) por cada caso límite transversal identificado en el roadmap, y una ronda final de QA en vivo en `monky-qa` antes de considerar el sistema listo.

**No entra:** pruebas unitarias de cada módulo (esas viven en las tareas de `test-writer` de cada módulo específico); este es la capa de integración final.

## 2. Dependencias
Todos los módulos del sistema.

## 3. Datos
No introduce entidades nuevas. Usa siempre el restaurante de prueba `monky-qa` (nunca `omm-siri`, que es el restaurante real en producción — ver `app/TESTING.md`).

## 4. Estados y transiciones
No aplica.

## 5. Reglas de negocio y cálculos
No aplica (módulo de verificación, no de producto).

## 6. Permisos por rol
Ejecutado por `test-writer`/`qa-e2e`, con revisión final de `security-reviewer` para los flujos de dinero (cobro, caja).

## 7. Pantallas
No aplica — este módulo no agrega pantallas, las recorre todas.

## 8. Procesos paso a paso a cubrir

| # | Proceso | Módulos involucrados |
|---|---|---|
| 1 | Puesta en marcha del restaurante (registro → menú → zonas → cajas → miembros → dispositivos → impresión → menú digital → cocina) | Base, Catálogo, Zonas y mesas, Caja y cortes, Dispositivos con PIN, Impresión, Menú digital, KDS |
| 2 | Apertura del turno (PIN, fondo de caja, disponibilidad, pausa si aplica) | Dispositivos con PIN, Caja y cortes, Disponibilidad, Menú digital |
| 3 | Servicio en mesa tomado por el mesero (abrir, comandas, correcciones, transferir, cuenta, cobro, cancelar) | Pedido de mesa, KDS, Cobro |
| 4 | Servicio en mesa pedido por el cliente vía QR (abrir, pedir, llamar mesero, pedir cuenta) | Cliente por QR de mesa, Tiempo real |
| 5 | Pedido de mostrador: comer aquí sin mesa | POS de mostrador, Cobro |
| 6 | Pedido para llevar | POS de mostrador, Cobro |
| 7 | Pedido a domicilio tomado por el personal | POS de mostrador, Cobro |
| 8 | Pedido en línea: domicilio o recoger (menú digital) | Menú digital, Promociones, Tiempo real |
| 9 | Cocina (KDS) | KDS |
| 10 | Entradas y retiros de efectivo durante el día | Caja y cortes |
| 11 | Cierre del turno: corte de caja a ciegas | Caja y cortes |
| 12 | Pausas y cierres temporales | Menú digital |
| 13 | Supervisión del dueño (Hoy, historial de seguridad, uso de suscripción) | M14, Base, Configuración general |

## 9. Textos de la interfaz
No aplica directamente; las pruebas deben **verificar** los textos exactos definidos en cada módulo (comparación literal, no aproximada).

## 10. Lista de control de casos límite transversales — una verificación por fila

| # | Caso | Módulo responsable | Cómo se verifica |
|---|---|---|---|
| 1 | Promo por rango de fechas activa se aplica correctamente | Promociones | Test cruzando medianoche en hora local |
| 2 | Selector de días de promo empieza vacío | Promociones | Test de UI/estado inicial |
| 3 | Editar el envío de un pedido pagado avisa antes de pasar a Parcial | Cobro | Test de confirmación explícita |
| 4 | Pedido web se confirma dentro del sistema, no depende del envío de WhatsApp | Menú digital | Test de expiración de no confirmados |
| 5 | Cobro: caja y método realmente seleccionados, primer toque funciona | Cobro | Test de estado real vs. visual |
| 6 | Botones y casillas responden al primer toque | POS de mostrador, Cobro | Test manual en pantalla táctil real |
| 7 | Validaciones muestran el error junto al campo | Catálogo, Pedido de mesa, POS de mostrador | Test de variante/tipo obligatorio |
| 8 | Alta de miembro guarda la sucursal preseleccionada | Base | Test de guardado |
| 9 | Editar miembro Mesero no bloquea por campo oculto | Base | Test de validación condicional |
| 10 | No se crean pedidos de mesa vacíos que bloqueen el corte | Pedido de mesa, Caja y cortes | Test de exclusión en el bloqueo de corte |
| 11 | Mesa cobrada: reapertura/anulación posterior con permiso, motivo y auditoría | Pedido de mesa | Test de flujo excepcional |
| 12 | Cancelar pedido siempre pide motivo (mostrador y mesa) | Pedido de mesa, POS de mostrador | Test en ambos flujos |
| 13 | Pedido cancelado oculta el cobro | Cobro | Test de UI en los lugares donde aparece "Cobrar" |
| 14 | KDS cuenta comandas, no pedidos | KDS | Test con pedido de 2 comandas |
| 15 | Pantalla completa del KDS no deja botones inutilizables al salir | KDS | Test manual con Esc y botón de salir |
| 16 | Contadores de mesas se sincronizan entre dispositivos | Tiempo real | Test con 2 contextos de navegador |
| 17 | QR de mesa con token aleatorio, no adivinable | Zonas y mesas, Cliente por QR | Revisión de seguridad de la URL |
| 18 | Pedido del cliente por QR: directo o con aprobación, configurable | Cliente por QR de mesa | Test de ambas configuraciones |
| 19 | Menú de navegación oculta lo que el rol no puede usar | Base | Test por cada rol operativo |
| 20 | Subir el logo no borra el alias sin guardar | Configuración general | Test de formulario |
| 21 | Teléfono se precarga al editar el pedido | POS de mostrador | Test de edición |
| 22 | Textos de pausa sin errores de ortografía | Menú digital | Revisión de copy antes de publicar |
| 23 | Borrar sucursal exige escribir el nombre | Multi-sucursal | Test de confirmación |
| 24 | "Separar uno" conserva la cantidad total | Pedido de mesa | Test automático de conservación |
| 25 | Filtro de fecha del panel de pedidos = mismo componente que Hoy | M14 | Test de componente compartido |
| 26 | Si se ofrecen propinas, la opción es reversible | Cobro, Caja y cortes | Test de reactivación |

## 11. Criterios de aceptación
- Los 13 procesos de §8 pasan de punta a punta en Playwright sobre `monky-qa`, sin pasos manuales salvo los explícitamente marcados como "test manual" en §10.
- Los 26 casos de §10 quedan cada uno con una prueba automatizada o, si no es automatizable (por ejemplo #6, #15, #22), con un resultado de QA en vivo registrado en `app/TESTING.md` con fecha, quien lo probó y el resultado.
- Ningún caso de §10 queda "no verificado" al cerrar el proyecto: cada fila tiene un estado (Pasa / Falla / No aplica en Monky, con motivo).

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M18-T01 | Suite Playwright: proceso 1 (puesta en marcha completa) | QA | test-writer | L | Base–Catálogo, Impresión | Corre en CI contra `monky-qa` |
| M18-T02 | Suite Playwright: procesos 2–3 (apertura de turno + servicio de mesa por mesero) | QA | test-writer | L | Pedido de mesa, KDS, Cobro, Caja y cortes, Dispositivos con PIN | — |
| M18-T03 | Suite Playwright: proceso 4 (cliente QR) + tiempo real (2 contextos) | QA | test-writer | L | Tiempo real, Cliente por QR de mesa | Verifica latencia menor a 5s |
| M18-T04 | Suite Playwright: procesos 5–7 (mostrador, para llevar, domicilio) | QA | test-writer | M | POS de mostrador, Cobro | — |
| M18-T05 | Suite Playwright: proceso 8 (menú digital domicilio/recoger) + promociones | QA | test-writer | L | Menú digital, Promociones | — |
| M18-T06 | Suite Playwright: procesos 9–11 (KDS, movimientos, corte de caja) | QA | test-writer | L | KDS, Caja y cortes | — |
| M18-T07 | Suite Playwright: procesos 12–13 (pausas, dashboard, historial de seguridad) | QA | test-writer | M | Base, Menú digital, M14 | — |
| M18-T08 | Lista de control ejecutable de los 26 casos de §10 con resultado documentado por fila | QA | qa-e2e | L | M18-T01..T07 | Tabla de §10 completa con estado por fila en `app/TESTING.md` |
| M18-T09 | Revisión de seguridad final de todos los flujos de dinero (cobro, caja, multi-sucursal) | QA | security-reviewer | L | Cobro, Caja y cortes, Multi-sucursal | Informe consolidado sin hallazgos críticos |
| M18-T10 | Ronda de QA en vivo completa en `monky-qa`, actualizando `app/TESTING.md` | QA | qa-e2e | L | M18-T01..T09 | Registro final con fecha y resultado de cada proceso |

Basado en el relevamiento interno de funcionalidades del POS.
