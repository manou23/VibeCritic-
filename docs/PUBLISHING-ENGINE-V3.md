# VibeCritic Publishing Engine V3

V3 is a clean, isolated publishing engine. It does not import V2 runtime modules.

## Pipeline
1. Discover one released, unpublished candidate from TMDB or RAWG.
2. Collect catalog evidence plus a separate encyclopedia source.
3. Validate identity, source domains, and evidence completeness.
4. Generate one complete Arabic critical review using explicitly enabled free-only providers.
5. Validate length, score fields, pros/cons, verdict, and sources.
6. Create a new Markdown file with exclusive-create semantics; never overwrite existing content.
7. Verify the public article URL before marking the job published.

## Reliability
- A filesystem lock prevents overlapping local runs; GitHub Actions concurrency provides the hosted lock.
- State is versioned and atomically replaced.
- Jobs are resumed from durable state and retried with bounded exponential backoff.
- A failed generation is never published.
- Provider allowlisting is explicit. OpenRouter is restricted to model IDs ending in :free.
- The workflow runs tests before every publishing cycle and commits state even when a cycle fails.
- No paid provider or paid fallback is permitted by the V3 provider router.

## Safety boundaries
- Existing manual reviews are not modified.
- The publisher creates files with exclusive-create semantics and refuses to overwrite.
- A successful build is not considered a successful publication; the live article URL must be checked.
- V3 is not activated until the migration PR passes CI and deployment configuration is verified.
