import { collectCameraHealth } from "../src/services/monitoring/collector";

const intervalMs = 5_000;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await collectCameraHealth();
  } catch (error) {
    console.error("[monitor] health collection failed", error);
  } finally {
    running = false;
  }
}

void tick();
const timer = setInterval(tick, intervalMs);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}
