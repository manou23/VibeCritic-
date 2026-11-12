#!/usr/bin/env python3
"""Safe Groq-based source maintenance for VibeCritic."""
import os
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

import requests

ROOT = Path(__file__).resolve().parents[2]
API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = os.getenv("GROQ_MODEL", "").strip() or "openai/gpt-oss-20b"
EXTENSIONS = {".astro", ".ts", ".js", ".mjs", ".css"}
PREFIXES = ("src/components/", "src/layouts/", "src/pages/", "src/styles/")
EXACT = {"src/consts.ts", "src/content.config.ts"}
READ_ONLY = ("package.json", "astro.config.mjs", "scripts/validate-build.mjs")


def git(*args, input_text=None):
    p = subprocess.run(
        ["git", *args], cwd=ROOT, input=input_text, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    if p.returncode:
        raise RuntimeError("git command failed: " + p.stderr[-1000:])
    return p.stdout


def allowed(path):
    p = PurePosixPath(path)
    if p.is_absolute() or ".." in p.parts or "\\" in path:
        return False
    if path in EXACT:
        return p.suffix in EXTENSIONS
    return p.suffix in EXTENSIONS and any(path.startswith(x) for x in PREFIXES)


def context_files():
    tracked = git("ls-files", "-z").split("\0")
    paths = [p for p in tracked if p and allowed(p) and (ROOT / p).is_file()]
    def rank(p):
        return (0 if p.startswith("src/layouts/") else
                1 if p.startswith("src/components/") else
                2 if p.startswith("src/pages/") else
                3 if p in EXACT else 4, p)
    selected, blocks, total = [], [], 0
    for path in sorted(paths, key=rank):
        body = (ROOT / path).read_text(encoding="utf-8")
        if len(body) > 14000:
            continue
        block = "\n===== EDITABLE FILE: " + path + " =====\n" + body + "\n"
        if len(selected) >= 12 or total + len(block) > 85000:
            break
        selected.append(path)
        blocks.append(block)
        total += len(block)
    if not selected:
        raise RuntimeError("No eligible source files found.")
    for path in READ_ONLY:
        f = ROOT / path
        if f.is_file():
            blocks.insert(0, "\n===== READ-ONLY CONTEXT: " + path + " =====\n" +
                          f.read_text(encoding="utf-8")[:12000] + "\n")
    return selected, "".join(blocks)


def groq(api_key, context):
    system = """You are a cautious senior engineer maintaining the existing VibeCritic Astro website.
Review the supplied read-only project context and editable source files.
Fix only concrete bugs, accessibility issues, security problems, broken links,
or clear performance/rendering defects. Preserve the current design, features,
Arabic/English content, routes, SEO and Astro architecture.
Do not invent APIs, dependencies, environment variables or facts.
Never change generated reviews, user data, secrets, workflows, package files,
build/deployment configuration, or read-only context.
Do not refactor working code for style. At most 5 existing editable files.
If no worthwhile safe fix exists, return exactly NO_CHANGES.
Otherwise output ONLY a unified git diff. No markdown fences or explanation.
Only paths from EDITABLE FILE sections may be changed. No new/deleted/renamed files."""
    r = requests.post(
        API_URL,
        headers={"Authorization": "Bearer " + api_key,
                 "Content-Type": "application/json"},
        json={"model": MODEL, "temperature": 0.1, "max_tokens": 7000,
              "messages": [{"role": "system", "content": system},
                           {"role": "user", "content":
                            "READ-ONLY sections are informational only. "
                            "Patch only EDITABLE FILE sections.\n\n" + context}]},
        timeout=(20, 180)
    )
    if r.status_code >= 400:
        raise RuntimeError("Groq API HTTP " + str(r.status_code) +
                           "; verify model availability and API configuration.")
    choices = r.json().get("choices") or []
    if not choices:
        raise RuntimeError("Groq returned no completion.")
    value = choices[0].get("message", {}).get("content")
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError("Groq returned an empty response.")
    return value.strip()


def validate_patch(raw, editable):
    patch = raw.strip()
    fence = chr(96) * 3
    if patch.startswith(fence):
        patch = re.sub(r"^" + re.escape(fence) + r"(?:diff)?\s*", "", patch)
        patch = re.sub(r"\s*" + re.escape(fence) + r"$", "", patch)
    if len(patch) > 45000 or not patch.startswith("diff --git "):
        raise RuntimeError("Invalid or oversized unified diff.")
    sections = re.split(r"(?=^diff --git )", patch, flags=re.M)
    changed = []
    for section in sections:
        if not section.strip():
            continue
        first = section.splitlines()[0]
        m = re.match(r"^diff --git a/(.+?) b/(.+?)$", first)
        if not m:
            raise RuntimeError("Malformed diff header.")
        old, new = m.groups()
        if old != new or old not in editable or not allowed(old):
            raise RuntimeError("Patch attempted a protected or structural file change.")
        if re.search(r"^new file mode |^deleted file mode |^rename from |^rename to ", section, re.M):
            raise RuntimeError("File creation, deletion and rename are forbidden.")
        if "GIT binary patch" in section or "Binary files " in section:
            raise RuntimeError("Binary patches are forbidden.")
        if old not in changed:
            changed.append(old)
    if not changed or len(changed) > 5:
        raise RuntimeError("Patch is empty or changes more than 5 files.")
    return patch, changed


def main():
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        raise RuntimeError("GROQ_API_KEY is missing from repository Actions secrets.")
    editable, context = context_files()
    print("Sending " + str(len(editable)) + " eligible source files to " + MODEL)
    answer = groq(key, context)
    if answer.strip() == "NO_CHANGES":
        print("No safe, worthwhile code changes found.")
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write("changed=false\n")
        return
    patch, changed = validate_patch(answer, set(editable))
    check = subprocess.run(
        ["git", "apply", "--check", "--whitespace=error", "-"],
        cwd=ROOT, input=patch, text=True, capture_output=True
    )
    if check.returncode:
        raise RuntimeError("Patch does not apply cleanly: " + check.stderr[-1000:])
    apply = subprocess.run(
        ["git", "apply", "--whitespace=error", "-"],
        cwd=ROOT, input=patch, text=True, capture_output=True
    )
    if apply.returncode:
        raise RuntimeError("Patch application failed: " + apply.stderr[-1000:])
    actual = set(git("diff", "--name-only").splitlines())
    if actual != set(changed) or any(not allowed(p) for p in actual):
        raise RuntimeError("Post-apply file allowlist check failed.")
    git("diff", "--check")
    print("Verified source changes:")
    for path in sorted(actual):
        print(" - " + path)
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        out.write("changed=true\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Maintenance stopped safely: " + str(exc), file=sys.stderr)
        sys.exit(1)
