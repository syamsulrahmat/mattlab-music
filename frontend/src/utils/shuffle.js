// Unbiased Fisher-Yates shuffle. Returns a new array; never mutates the input.
export const shuffleArray = (arr) => {
  const out = Array.isArray(arr) ? [...arr] : [];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Build a queue that starts with `first` followed by the rest of `tracks` shuffled.
export const shuffledQueueStartingWith = (first, tracks) => {
  const others = (tracks || []).filter((t) => t.id !== first.id);
  return [first, ...shuffleArray(others)];
};
