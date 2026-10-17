import re
import time
import difflib
import threading
from typing import Optional, List, Dict, Any, Tuple
from collections import Counter
import sqlite3

_BUILD_LOCK = threading.Lock()
_LAST_BUILD_TIME: float = 0.0
_VOCAB_COUNTER: Counter = Counter()
_ARTISTS_CACHE: List[Dict[str, Any]] = []
_ALBUMS_CACHE: List[Dict[str, Any]] = []
_TRACKS_CACHE: List[Dict[str, Any]] = []

COMMON_SLANG_MAP = {
    "wat": "what",
    "u": "you",
    "ur": "your",
    "r": "are",
    "luv": "love",
    "thru": "through",
    "cuz": "cause",
    "bout": "about",
    "gon": "gonna",
    "wanna": "want to",
    "til": "until",
    "till": "until",
    "tonite": "tonight",
}


def ensure_catalog_loaded(conn: sqlite3.Connection, force: bool = False):
    """
    Populate or refresh the in-memory library vocabulary and entity catalog.
    Refreshes automatically if older than 1 hour or when force=True.
    """
    global _LAST_BUILD_TIME, _VOCAB_COUNTER, _ARTISTS_CACHE, _ALBUMS_CACHE, _TRACKS_CACHE

    now = time.time()
    if not force and _VOCAB_COUNTER and (now - _LAST_BUILD_TIME < 3600):
        return

    with _BUILD_LOCK:
        if not force and _VOCAB_COUNTER and (now - _LAST_BUILD_TIME < 3600):
            return

        cursor = conn.cursor()

        # 1. Fetch artists
        cursor.execute("SELECT id, name FROM artists")
        artists = []
        for r in cursor.fetchall():
            if r["name"]:
                low = r["name"].strip().lower()
                toks = [t for t in re.findall(r"[a-zA-Z0-9']+", low) if len(t) >= 2]
                artists.append({"id": r["id"], "name": r["name"], "lower": low, "tokens": toks})

        # 2. Fetch albums
        cursor.execute("SELECT id, title, artist_id FROM albums")
        albums = []
        for r in cursor.fetchall():
            if r["title"]:
                low = r["title"].strip().lower()
                base_low = re.sub(r"\s*[\(\[].*?[\)\]]", "", low).strip()
                albums.append({
                    "id": r["id"],
                    "title": r["title"],
                    "artist_id": r["artist_id"],
                    "lower": low,
                    "base_lower": base_low,
                })

        # 3. Fetch tracks
        cursor.execute("SELECT id, title, artist_id, album_id FROM tracks")
        tracks = []
        for r in cursor.fetchall():
            if r["title"]:
                low = r["title"].strip().lower()
                base_low = re.sub(r"\s*[\(\[].*?[\)\]]", "", low).strip()
                tracks.append({
                    "id": r["id"],
                    "title": r["title"],
                    "artist_id": r["artist_id"],
                    "album_id": r["album_id"],
                    "lower": low,
                    "base_lower": base_low,
                })

        # 4. Fetch lyrics text from FTS table if available
        lyrics_texts = []
        try:
            cursor.execute("SELECT plain_lyrics FROM tracks_lyrics_fts")
            lyrics_texts = [r["plain_lyrics"] for r in cursor.fetchall() if r["plain_lyrics"]]
        except Exception:
            pass

        # 5. Build weighted vocabulary
        new_vocab = Counter()
        for a in artists:
            for w in re.findall(r"[a-zA-Z0-9']+", a["lower"]):
                if len(w) >= 2:
                    new_vocab[w] += 10  # Artists given high authority

        for t in tracks:
            for w in re.findall(r"[a-zA-Z0-9']+", t["lower"]):
                if len(w) >= 2:
                    new_vocab[w] += 5   # Song titles given strong authority

        for al in albums:
            for w in re.findall(r"[a-zA-Z0-9']+", al["lower"]):
                if len(w) >= 2:
                    new_vocab[w] += 3   # Albums given medium authority

        for ly in lyrics_texts:
            for w in re.findall(r"[a-zA-Z0-9']+", ly.lower()):
                if len(w) >= 2:
                    new_vocab[w] += 1   # Lyrics terms given base weight

        _ARTISTS_CACHE = artists
        _ALBUMS_CACHE = albums
        _TRACKS_CACHE = tracks
        _VOCAB_COUNTER = new_vocab
        _LAST_BUILD_TIME = now


def _edits1(word: str) -> set:
    """Generate all strings that are 1 edit distance away (delete, transpose, replace, insert)."""
    letters = "abcdefghijklmnopqrstuvwxyz0123456789"
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    deletes = [L + R[1:] for L, R in splits if R]
    transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R) > 1]
    replaces = [L + c + R[1:] for L, R in splits if R for c in letters]
    inserts = [L + c + R for L, R in splits for c in letters]
    return set(deletes + transposes + replaces + inserts)


def _edits2(word: str):
    """Generate all strings that are 2 edit distances away."""
    return (e2 for e1 in _edits1(word) for e2 in _edits1(e1))


def correct_single_word(word: str) -> str:
    """
    Intelligently correct a single misspelled word using library vocabulary.
    Preserves known words, handles phonetic slang, and uses edit distance + frequency.
    """
    w = word.strip().lower()
    if len(w) < 3:
        return w

    # Phonetic slang direct conversion
    if w in COMMON_SLANG_MAP:
        return COMMON_SLANG_MAP[w]

    # Convert trailing -in to -ing if applicable (e.g. burnin -> burning, dancin -> dancing)
    if w.endswith("in") and len(w) >= 4 and not w.endswith("ain"):
        candidate_ing = w + "g"
        if candidate_ing in _VOCAB_COUNTER:
            return candidate_ing

    # If already a valid known word in our library vocabulary, do not touch it
    if w in _VOCAB_COUNTER:
        return w

    # Candidates within 1 edit distance
    c1 = [cand for cand in _edits1(w) if cand in _VOCAB_COUNTER]
    if c1:
        return max(c1, key=lambda cand: _VOCAB_COUNTER[cand])

    # Candidates within 2 edit distances (if word is not too long to keep execution < 1ms)
    if len(w) <= 7:
        c2 = [cand for cand in _edits2(w) if cand in _VOCAB_COUNTER]
        if c2:
            return max(c2, key=lambda cand: _VOCAB_COUNTER[cand])

    # Fallback: difflib close match on vocabulary keys
    matches = difflib.get_close_matches(w, _VOCAB_COUNTER.keys(), n=1, cutoff=0.75)
    if matches:
        return matches[0]

    return w


def correct_query_sentence(query: str) -> str:
    """
    Correct every misspelled word in a multi-word general query.
    E.g. 'love stroy' -> 'love story', 'we are geting back togethr' -> 'we are getting back together'.
    """
    tokens = [t.strip() for t in query.split() if t.strip()]
    if not tokens:
        return query
    corrected = [correct_single_word(t) for t in tokens]
    return " ".join(corrected)


def find_matched_artist(query: str, threshold: float = 0.75) -> Optional[Tuple[Dict[str, Any], float]]:
    """
    Check if query closely matches an artist name in the library.
    Handles full artist name matching and token matching for single-word queries.
    Returns (artist_dict, match_score).
    """
    q_low = query.strip().lower()
    q_tokens = [t for t in q_low.split() if t]
    best_artist = None
    best_score = 0.0

    for a in _ARTISTS_CACHE:
        a_low = a["lower"]
        if q_low == a_low:
            return (a, 1.0)
        s_full = difflib.SequenceMatcher(None, q_low, a_low).ratio()
        s_tok = 0.0
        if len(q_tokens) == 1 and a.get("tokens"):
            s_tok = max((difflib.SequenceMatcher(None, q_low, tok).ratio() for tok in a["tokens"]), default=0.0) * 0.88
        score = max(s_full, s_tok)
        if score > best_score:
            best_score = score
            best_artist = a

    if best_score >= threshold and best_artist:
        return (best_artist, best_score)
    return None


def find_matched_track(query: str, threshold: float = 0.75) -> Optional[Tuple[Dict[str, Any], float]]:
    """
    Check if query closely matches a track title in the library.
    Compares against both full title and bracket-stripped base title.
    Returns (track_dict, match_score).
    """
    q_low = query.strip().lower()
    best_track = None
    best_score = 0.0

    for t in _TRACKS_CACHE:
        t_low = t["lower"]
        base_low = t.get("base_lower", t_low)
        if q_low == t_low or q_low == base_low:
            return (t, 1.0)
        score = max(
            difflib.SequenceMatcher(None, q_low, t_low).ratio(),
            difflib.SequenceMatcher(None, q_low, base_low).ratio(),
        )
        if score > best_score:
            best_score = score
            best_track = t

    if best_score >= threshold and best_track:
        return (best_track, best_score)
    return None


def find_matched_album(query: str, threshold: float = 0.75) -> Optional[Tuple[Dict[str, Any], float]]:
    """
    Check if query closely matches an album title in the library.
    Compares against both full title and bracket-stripped base title.
    Returns (album_dict, match_score).
    """
    q_low = query.strip().lower()
    best_album = None
    best_score = 0.0

    for al in _ALBUMS_CACHE:
        al_low = al["lower"]
        base_low = al.get("base_lower", al_low)
        if q_low == al_low or q_low == base_low:
            return (al, 1.0)
        score = max(
            difflib.SequenceMatcher(None, q_low, al_low).ratio(),
            difflib.SequenceMatcher(None, q_low, base_low).ratio(),
        )
        if score > best_score:
            best_score = score
            best_album = al

    if best_score >= threshold and best_album:
        return (best_album, best_score)
    return None


def resolve_compound_artist_and_track(query: str) -> Optional[Dict[str, Any]]:
    """
    Detect compound queries like 'katy pery firwork' or 'tylor switf blank space'
    where one portion is an artist and the remaining portion is a track title.
    Requires high component thresholds and boosts matching artist-track pairs.
    """
    tokens = [t.strip().lower() for t in query.split() if t.strip()]
    if len(tokens) < 2:
        return None

    best_match = None
    best_score = 0.0

    for i in range(1, len(tokens)):
        artist_sub = " ".join(tokens[:i])
        track_sub = " ".join(tokens[i:])

        artist_match = find_matched_artist(artist_sub, threshold=0.70)
        if artist_match:
            a_dict, a_score = artist_match
            track_match = find_matched_track(track_sub, threshold=0.70)
            if track_match:
                t_dict, t_score = track_match
                artist_bonus = 0.25 if t_dict.get("artist_id") == a_dict.get("id") else 0.0
                combined_score = (a_score + t_score) / 2.0 + artist_bonus
                if combined_score > best_score:
                    best_score = combined_score
                    best_match = {
                        "artist": a_dict,
                        "track": t_dict,
                        "canonical_artist": a_dict["name"],
                        "canonical_track": t_dict["title"],
                        "score": combined_score,
                    }

    return best_match


def resolve_fuzzy_query(query: str) -> Dict[str, Any]:
    """
    Unified fuzzy scoring engine that evaluates all candidate interpretations
    (compound, artist, track, album, sentence correction) concurrently and selects
    the highest confidence intent.
    """
    q_clean = query.strip()
    q_low = q_clean.lower()
    q_tokens = [t for t in q_low.split() if t]
    if not q_tokens:
        return {"type": "none"}

    # 1. Best Compound
    best_comp = resolve_compound_artist_and_track(q_clean)

    # 2. Best Artist
    art_match = find_matched_artist(q_clean, threshold=0.75)
    best_art = art_match[0] if art_match else None
    best_art_score = art_match[1] if art_match else 0.0

    # 3. Best Track
    trk_match = find_matched_track(q_clean, threshold=0.75)
    best_trk = trk_match[0] if trk_match else None
    best_trk_score = trk_match[1] if trk_match else 0.0

    # 4. Best Album
    alb_match = find_matched_album(q_clean, threshold=0.75)
    best_alb = alb_match[0] if alb_match else None
    best_alb_score = alb_match[1] if alb_match else 0.0

    # 5. Corrected sentence
    corr_sent = correct_query_sentence(q_clean)

    # Decision Cascade:
    # A. Compound with high score (>= 0.95)
    if best_comp and best_comp.get("score", 0.0) >= 0.95:
        return {"type": "compound", "compound": best_comp, "score": best_comp["score"]}

    # B. High confidence track match (>= 0.88) beating artist match
    if best_trk and best_trk_score >= 0.88 and best_trk_score > best_art_score:
        return {"type": "track", "track": best_trk, "score": best_trk_score}

    # C. Artist match (>= 0.75)
    if best_art and best_art_score >= 0.75:
        if best_trk and best_trk_score > best_art_score:
            return {"type": "track", "track": best_trk, "score": best_trk_score}
        return {"type": "artist", "artist": best_art, "score": best_art_score}

    # D. Track match (>= 0.75)
    if best_trk and best_trk_score >= 0.75:
        return {"type": "track", "track": best_trk, "score": best_trk_score}

    # E. Album match (>= 0.80)
    if best_alb and best_alb_score >= 0.80:
        return {"type": "album", "album": best_alb, "score": best_alb_score}

    # F. Sentence correction (if any words corrected)
    if corr_sent.lower() != q_low:
        return {"type": "sentence", "corrected_sentence": corr_sent}

    return {"type": "none"}
