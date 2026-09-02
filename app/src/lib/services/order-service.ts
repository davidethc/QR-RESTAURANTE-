// Lógica de negocio de pedidos
// Aquí viven las 26 reglas de negocio del MVP
//
// accept(orderId, userId) — Verificar PENDING, no duplicado, actualizar, audit
// reject(orderId, userId, reason) — Verificar PENDING, registrar motivo
// startPreparing(orderId) — Verificar ACCEPTED
// markReady(orderId) — Verificar PREPARING
// markDelivered(orderId, userId) — Verificar READY
