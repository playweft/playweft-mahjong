/** A shared recognition beat, sampled once and measured from visible contact. */
export function createMahjongClaimPacing({
  state, afterDiscardContact, random = Math.random,
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
} = {}) {
  const delayMs = Math.round(250 + 150 * Math.max(0, Math.min(1, random())));
  let timer, cancelContact, resolve;
  let cancelled = false, hasLanded = false;
  const ready = new Promise((done) => { resolve = done; });
  const landed = () => {
    if (cancelled || hasLanded) return;
    hasLanded = true;
    timer = setTimer(() => { timer = undefined; resolve(); }, delayMs);
  };
  cancelContact = afterDiscardContact?.(state, landed) ?? null;
  if (!cancelContact) landed();
  return {
    ready, delayMs,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
      cancelContact?.();
      resolve();
    },
  };
}
