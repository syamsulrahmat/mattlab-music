// Multi-format LRC Parser supporting [m:ss], [mm:ss.xx], [mm:ss.xxx], multiple timestamps per line
export const parseLrc = (lrcString) => {
  if (!lrcString) return [];
  const lines = lrcString.split(/\r?\n/);
  const parsed = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip metadata headers like [ti:Title], [ar:Artist], etc.
    if (/^\[[a-zA-Z]+:/.test(line)) continue;

    let match;
    const timestamps = [];
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fractionStr = match[3] || '0';
      const fraction = parseFloat(`0.${fractionStr}`);
      timestamps.push(minutes * 60 + seconds + fraction);
    }

    if (timestamps.length > 0) {
      const text = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
      if (text) {
        for (const time of timestamps) {
          parsed.push({ time, text });
        }
      }
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
};

// Formats plain lyrics that may have word-by-word tokenized line breaks
export const formatPlainLyrics = (text) => {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return '';

  const totalWords = nonEmpty.reduce((acc, l) => acc + l.trim().split(/\s+/).length, 0);
  const avgWords = totalWords / nonEmpty.length;
  const hasTrailingSpaces = nonEmpty.some((l) => l.endsWith(' '));

  if (nonEmpty.length > 10 && (avgWords <= 2.3 || hasTrailingSpaces)) {
    const reconstructed = [];
    let current = [];
    for (const l of lines) {
      const stripped = l.trim();
      if (!stripped) {
        if (current.length > 0) {
          reconstructed.push(current.join(' '));
          current = [];
        }
        if (reconstructed.length > 0 && reconstructed[reconstructed.length - 1] !== '') {
          reconstructed.push('');
        }
        continue;
      }
      current.push(stripped);
      if (stripped.endsWith('.') || stripped.endsWith('!') || stripped.endsWith('?') || current.length >= 9 || (!l.endsWith(' ') && current.length >= 6)) {
        reconstructed.push(current.join(' '));
        current = [];
      }
    }
    if (current.length > 0) reconstructed.push(current.join(' '));
    return reconstructed.join('\n');
  }

  return normalized;
};

// Helper to determine the active lyric line index based on playback currentTime
export const findActiveLyricIndex = (parsedLines, currentTime, offset = 0.25) => {
  if (!parsedLines || parsedLines.length === 0) return -1;
  let foundIdx = -1;
  for (let i = 0; i < parsedLines.length; i++) {
    if (currentTime >= parsedLines[i].time - offset) {
      foundIdx = i;
    } else {
      break;
    }
  }
  return foundIdx;
};
