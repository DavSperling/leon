export async function register() {
  // Condition positive : webpack élimine alors la branche du bundle edge.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNodeInstrumentation } = await import('./instrumentation-node');
    await startNodeInstrumentation();
  }
}
