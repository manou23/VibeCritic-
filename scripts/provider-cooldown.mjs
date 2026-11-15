export function retryHintTimestamp(message, now = Date.now()) {
  const hint = String(message || '').match(/(?:retry|try again)\s+in\s+((?:\d+(?:\.\d+)?\s*[hms]\s*)+)/i)?.[1];
  if (!hint) return null;

  let seconds = 0;
  for (const match of hint.matchAll(/(\d+(?:\.\d+)?)\s*([hms])/gi)) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    seconds += value * (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1);
  }

  return seconds > 0 ? now + Math.ceil(seconds * 1000) : null;
}
