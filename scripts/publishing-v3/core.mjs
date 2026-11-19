export const ENGINE_VERSION = 3;
export const JOB_STATES = Object.freeze(["queued","researching","writing","reviewing","ready","publishing","verifying","published","waiting","rejected"]);
const ACTIVE = new Set(["queued","researching","writing","reviewing","ready","publishing","verifying","waiting"]);
export function createState() {
  return { version: ENGINE_VERSION, updatedAt: new Date(0).toISOString(), jobs: {}, providers: {}, history: [] };
}
export function validateState(state) {
  if (!state || state.version !== ENGINE_VERSION || !state.jobs || typeof state.jobs !== "object" || Array.isArray(state.jobs)) throw new Error("Invalid V3 state schema");
  for (const [key, job] of Object.entries(state.jobs)) {
    if (!job || job.key !== key || !JOB_STATES.includes(job.status) || !["game","movie","series"].includes(job.type) || !String(job.id || "").trim()) throw new Error("Invalid V3 job: " + key);
    if (!Number.isInteger(job.attempts) || job.attempts < 0) throw new Error("Invalid attempts: " + key);
  }
  return state;
}
export function enqueue(state, item, now = Date.now()) {
  const type = String(item?.type || ""), id = String(item?.id || "").trim(), key = type + ":" + id;
  if (!["game","movie","series"].includes(type) || !id) throw new Error("Invalid candidate identity");
  if (state.jobs[key]) return { job: state.jobs[key], created: false };
  const job = { key, type, id, title: String(item.name || item.title || "").trim(), item, status: "queued", stage: 0, attempts: 0, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), nextAttemptAt: null, evidence: null, sections: [], article: null, lastError: null };
  if (!job.title) throw new Error("Candidate title is required");
  state.jobs[key] = job;
  return { job, created: true };
}
const NEXT = Object.freeze({
  queued: new Set(["researching","waiting","rejected"]),
  researching: new Set(["writing","waiting","rejected"]),
  writing: new Set(["reviewing","waiting","rejected"]),
  reviewing: new Set(["ready","writing","waiting","rejected"]),
  ready: new Set(["publishing","waiting","rejected"]),
  publishing: new Set(["verifying","waiting","rejected"]),
  verifying: new Set(["published","ready","waiting","rejected"]),
  waiting: new Set(["queued","researching","writing","reviewing","ready","publishing","verifying","rejected"])
});
export function transition(job, status, patch = {}, now = Date.now()) {
  if (!JOB_STATES.includes(status)) throw new Error("Unknown job state: " + status);
  if (job.status !== status && !NEXT[job.status]?.has(status)) throw new Error("Illegal transition " + job.status + " -> " + status);
  Object.assign(job, patch, { status, updatedAt: new Date(now).toISOString() });
  return job;
}
export function chooseJob(state, now = Date.now()) {
  return Object.values(state.jobs).filter(j => ACTIVE.has(j.status) && (j.status !== "waiting" || !j.nextAttemptAt || Date.parse(j.nextAttemptAt) <= now))
    .sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0] || null;
}
export function validateEvidence(evidence) {
  if (!evidence || !evidence.title || !["game","movie","series"].includes(evidence.type)) throw new Error("Evidence identity missing");
  const sources = Array.isArray(evidence.sources) ? evidence.sources : [];
  const domains = new Set();
  for (const source of sources) {
    try { const u = new URL(source.url); if (u.protocol === "https:") domains.add(u.hostname.replace(/^www\./,"")); } catch {}
  }
  if (domains.size < 2) throw new Error("At least two independent HTTPS source domains are required");
  if (!evidence.overview || String(evidence.overview).trim().length < 80) throw new Error("Evidence overview is too thin");
  return true;
}
export function validateArticle(article, { minWords = 650, minCharacters = 3200 } = {}) {
  if (!article || !article.title || !article.body || !article.verdict) throw new Error("Article required fields are missing");
  const words = (String(article.body).match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
  if (words < minWords) throw new Error("Article is too short: " + words + " words");
  if (String(article.body).length < minCharacters) throw new Error("Article is too short in characters");
  if (!Array.isArray(article.pros) || article.pros.length < 3 || !Array.isArray(article.cons) || article.cons.length < 2) throw new Error("Article strengths/limitations are incomplete");
  for (const k of ["story","visuals","sound","pacing"]) if (!Number.isFinite(article.scores?.[k]) || article.scores[k] < 0 || article.scores[k] > 10) throw new Error("Invalid score: " + k);
  if (!Number.isFinite(article.score) || article.score <= 0 || article.score > 10) throw new Error("Invalid weighted score");
  if (!Array.isArray(article.sources) || article.sources.length < 2) throw new Error("Article sources are missing");
  return { words, characters: String(article.body).length };
}
export function isDuplicate(candidate, published) {
  const key = candidate.type + ":" + candidate.id;
  return published.has(key) || published.has("title:" + String(candidate.name || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,""));
}
