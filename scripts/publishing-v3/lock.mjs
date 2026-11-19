import fs from "node:fs/promises";
import path from "node:path";

const STALE_LOCK_MS = 30 * 60 * 1000;

async function acquire(file) {
  try {
    return await fs.open(file, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  let stat;
  try { stat = await fs.stat(file); }
  catch (error) {
    if (error?.code === "ENOENT") return acquire(file);
    throw error;
  }
  if (Date.now() - stat.mtimeMs <= STALE_LOCK_MS) return null;

  await fs.rm(file, { force: true });
  try {
    return await fs.open(file, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") return null;
    throw error;
  }
}

export async function withRunLock(task, file = "data/publisher-v3.lock") {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const handle = await acquire(file);
  if (!handle) return { skipped: true, reason: "another-run-is-active" };

  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await task();
  } finally {
    await handle.close().catch(() => {});
    await fs.rm(file, { force: true }).catch(() => {});
  }
}
