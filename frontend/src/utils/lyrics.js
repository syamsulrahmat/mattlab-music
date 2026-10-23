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

/**
 * Formats a time in seconds to standard LRC [mm:ss.xx]
 * e.g., 65.4 -> "[01:05.40]"
 */
export const formatTimestamp = (totalSeconds) => {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds < 0) {
    return '[00:00.00]';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const wholeSeconds = Math.floor(remainingSeconds);
  const hundredths = Math.floor((remainingSeconds - wholeSeconds) * 100);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(wholeSeconds).padStart(2, '0');
  const xx = String(hundredths).padStart(2, '0');
  return `[${mm}:${ss}.${xx}]`;
};

/**
 * Parses a timestamp string like "[01:23.45]" or "01:23.45" into seconds float
 */
export const parseTimestampToSeconds = (timestampStr) => {
  if (!timestampStr) return null;
  const match = timestampStr.match(/(?:\[)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?(?:\])?/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const fractionStr = match[3] || '0';
  const fraction = parseFloat(`0.${fractionStr.padEnd(2, '0').slice(0, 3)}`);
  return minutes * 60 + seconds + fraction;
};

/**
 * Parses an LRC string into structured line items for the studio editor
 */
export const parseLrcToEditorLines = (lrcString) => {
  if (!lrcString) return [];
  const rawLines = lrcString.split(/\r?\n/);
  return rawLines.map((rawLine, idx) => {
    const timeMatch = rawLine.match(/^(\[\d{1,2}:\d{2}(?:\.\d{1,3})?\])(.*)$/);
    if (timeMatch) {
      const timestampStr = timeMatch[1];
      const text = timeMatch[2].trimStart();
      const time = parseTimestampToSeconds(timestampStr);
      return {
        id: `line_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        timestampStr,
        time,
        text,
        hasTimestamp: true,
      };
    } else {
      return {
        id: `line_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        timestampStr: '',
        time: null,
        text: rawLine,
        hasTimestamp: false,
      };
    }
  });
};

/**
 * Converts editor line items back to a standard LRC text string
 */
export const editorLinesToLrc = (lines) => {
  if (!lines || lines.length === 0) return '';
  return lines
    .map((item) => {
      if (item.hasTimestamp && item.time !== null) {
        const formatted = formatTimestamp(item.time);
        return `${formatted} ${item.text || ''}`.trimEnd();
      }
      return item.text || '';
    })
    .join('\n');
};

/**
 * Validates chronological monotonicity of lines with timestamps
 * Returns an array of error objects: { lineIndex, time, prevIndex, prevTime, message }
 */
export const validateLrcChronology = (lines) => {
  const errors = [];
  let lastTimedIndex = -1;
  let lastTime = -1;

  for (let i = 0; i < lines.length; i++) {
    const item = lines[i];
    if (item.hasTimestamp && item.time !== null) {
      if (lastTimedIndex !== -1 && item.time < lastTime) {
        errors.push({
          lineIndex: i,
          time: item.time,
          prevIndex: lastTimedIndex,
          prevTime: lastTime,
          message: `Line ${i + 1} (${formatTimestamp(item.time)}) is earlier than Line ${lastTimedIndex + 1} (${formatTimestamp(lastTime)})`,
        });
      }
      lastTimedIndex = i;
      lastTime = item.time;
    }
  }

  return errors;
};

/**
 * Sorts lines chronologically while keeping plain text / metadata lines in place
 */
export const sortEditorLinesChronologically = (lines) => {
  const timed = lines
    .map((line, originalIndex) => ({ ...line, originalIndex }))
    .filter((l) => l.hasTimestamp && l.time !== null)
    .sort((a, b) => a.time - b.time);

  let timedPointer = 0;
  return lines.map((line) => {
    if (line.hasTimestamp && line.time !== null) {
      const nextSorted = timed[timedPointer++];
      return {
        ...nextSorted,
        id: line.id,
      };
    }
    return line;
  });
};

/**
 * Shifts lines by an offset (in seconds).
 * Scope: 'all', 'downward' (from targetIndex onward), or 'selection' (array of indices)
 */
export const offsetEditorLines = (lines, offsetSeconds, scope = 'all', targetIndex = 0, selectedIndices = []) => {
  return lines.map((item, idx) => {
    if (!item.hasTimestamp || item.time === null) return item;

    let shouldOffset = false;
    if (scope === 'all') {
      shouldOffset = true;
    } else if (scope === 'downward' && idx >= targetIndex) {
      shouldOffset = true;
    } else if (scope === 'selection' && selectedIndices.includes(idx)) {
      shouldOffset = true;
    }

    if (shouldOffset) {
      const newTime = Math.max(0, Math.round((item.time + offsetSeconds) * 100) / 100);
      return {
        ...item,
        time: newTime,
        timestampStr: formatTimestamp(newTime),
      };
    }

    return item;
  });
};

/**
 * Strips all LRC timestamps, leaving clean text
 */
export const stripLrcTimestamps = (text) => {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim())
    .join('\n');
};

/**
 * Converts plain text lyrics into synced placeholders [00:00.00]
 */
export const convertPlainToLrcPlaceholders = (text) => {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => {
      const clean = line.trim();
      return clean ? `[00:00.00] ${clean}` : '';
    })
    .join('\n');
};

