/** Shared reads refresh every thirty minutes unless the user asks. */
export const RESOURCE_REFRESH_INTERVAL = 1800000;

let generation = 0;
const listeners = new Set<() => void>();

export const resourceRefreshGeneration = () => generation;

export function subscribeResourceRefresh(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Invalidate every common read without remounting pages or resetting forms. */
export function invalidateResources() {
  generation += 1;
  for (const listener of listeners) listener();
}
