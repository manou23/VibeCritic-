import fs from "node:fs/promises";
import path from "node:path";
export async function withRunLock(task, file = "data/publisher-v3.lock") {
  await fs.mkdir(path.dirname(file), { recursive: true });
  let handle;
  try { handle = await fs.open(file, "wx"); }
  catch (error) {
    if (error?.code === "EEXIST") return { skipped: true, reason: "another-run-is-active" };
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await task();
  } finally {
    await handle.close().catch(() => {});
    await fs.rm(file, { force: true }).catch(() => {});
  }
}
