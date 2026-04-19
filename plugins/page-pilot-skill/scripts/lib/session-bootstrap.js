export async function openHydratedSession({ browserManager, siteIntelligenceStore, openOptions } = {}) {
  const session = await browserManager.openSession(openOptions);

  try {
    await siteIntelligenceStore.hydrateSession(session);
    return session;
  } catch (error) {
    await browserManager.closeSession(session.id).catch(() => {});
    throw error;
  }
}
