const CAPACITY = 8;
const REFILL_WINDOW_MS = 10 * 60 * 1000;

export class AiReviewLimiter {
  constructor(ctx) {
    this.ctx = ctx;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS token_bucket (id INTEGER PRIMARY KEY CHECK (id = 1), tokens REAL NOT NULL, updated_at INTEGER NOT NULL)"
    );
  }

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/check") {
      return new Response("Not found", { status: 404 });
    }

    const now = Date.now();
    const row = this.ctx.storage.sql
      .exec("SELECT tokens, updated_at FROM token_bucket WHERE id = 1")
      .toArray()[0];

    const elapsed = row ? Math.max(0, now - Number(row.updated_at)) : REFILL_WINDOW_MS;
    const available = row
      ? Math.min(CAPACITY, Number(row.tokens) + (elapsed * CAPACITY) / REFILL_WINDOW_MS)
      : CAPACITY;
    const allowed = available >= 1;
    const remaining = allowed ? available - 1 : available;

    this.ctx.storage.sql.exec(
      "INSERT INTO token_bucket (id, tokens, updated_at) VALUES (1, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET tokens = excluded.tokens, updated_at = excluded.updated_at",
      remaining,
      now
    );

    return Response.json({
      allowed,
      remaining: Math.floor(remaining),
      limit: CAPACITY,
      refillWindowMs: REFILL_WINDOW_MS
    });
  }
}

export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  }
};
