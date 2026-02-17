export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeEventSystem } = await import('@oppsera/core');
    await initializeEventSystem();
  }
}
