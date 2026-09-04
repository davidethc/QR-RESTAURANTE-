"use client";

let audioCtx: AudioContext | null = null;

/**
 * Un solo tono generado con Web Audio API — sin archivo de audio que
 * empaquetar. Solo para avisos que el personal no puede darse el lujo
 * de perder (pedido nuevo, llamada de mesa): la pantalla sola no
 * basta en un piso de restaurante ruidoso donde nadie está mirando la
 * tablet todo el tiempo.
 */
export function playAlertSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const ctx = audioCtx;
    const start = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 988;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  } catch {
    // Silencioso: si el navegador bloquea audio, el toast visual sigue avisando igual.
  }
}
