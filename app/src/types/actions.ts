/**
 * Forma común de retorno de toda Server Action del sistema.
 * `ActionButton` (src/components/shared/action-button.tsx) sabe leer
 * esta forma directamente: si ok es false, muestra el error en un toast;
 * si es true, dispara el éxito. Ninguna action debería lanzar una
 * excepción sin capturar — siempre resuelve a esta forma.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
