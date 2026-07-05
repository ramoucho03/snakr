/**
 * Tiny cross-component signal so the bottom-anchored overlays never fight:
 * the install card hides itself while the update banner (higher z, same spot)
 * is visible. Module-scope on purpose — both components live in one bundle.
 */
type Listener = (visible: boolean) => void;

let updateBannerVisible = false;
const listeners = new Set<Listener>();

export function setUpdateBannerVisible(visible: boolean): void {
  updateBannerVisible = visible;
  listeners.forEach((l) => l(visible));
}

/** Subscribe (fires immediately with the current value); returns unsubscribe. */
export function onUpdateBanner(listener: Listener): () => void {
  listeners.add(listener);
  listener(updateBannerVisible);
  return () => {
    listeners.delete(listener);
  };
}
