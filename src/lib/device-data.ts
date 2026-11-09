function removeKeys(shouldRemove: (key: string) => boolean) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && shouldRemove(key)) localStorage.removeItem(key);
    }
  } catch { /* Storage may be unavailable in private mode. */ }
}

async function clearLegacyCaches() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => /^limiar-cache-v[1-3]$/.test(key)).map(key => caches.delete(key)));
  } catch { /* Cache Storage may be unavailable. */ }
}

export async function clearLegacyDeviceData() {
  removeKeys(key => /^(?:limiar_plan_|limiar-exec-)\d{4}-\d{2}-\d{2}$/.test(key) || key === "limiar_onboarded");
  await clearLegacyCaches();
}

export async function clearPrivateDeviceData() {
  removeKeys(key => /^(limiar_plan_|limiar-exec-|limiar_setup:)/.test(key) || key === "limiar_onboarded");
  await clearLegacyCaches();
}
