import re
import json
import logging
from typing import Optional, Dict, Any, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

_CUTLET_INSTANCE = None


def get_cutlet():
    """Lazy initialize Cutlet Japanese Romaji converter singleton."""
    global _CUTLET_INSTANCE
    if _CUTLET_INSTANCE is None:
        try:
            import cutlet
            _CUTLET_INSTANCE = cutlet.Cutlet()
            logger.info("[Romanization] Cutlet Japanese engine initialized successfully.")
        except Exception as e:
            logger.error(f"[Romanization] Failed to initialize Cutlet: {e}")
            _CUTLET_INSTANCE = False
    return _CUTLET_INSTANCE if _CUTLET_INSTANCE is not False else None


def detect_cjk_language(text: str) -> Optional[str]:
    """
    Detect whether text contains Korean (Hangul) or Japanese (Kana/Kanji).
    Returns 'korean', 'japanese', or None.
    """
    if not text:
        return None

    # Count Hangul syllables & jamo
    hangul_count = len(re.findall(r"[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]", text))

    # Count Japanese Kana (Hiragana & Katakana)
    kana_count = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF]", text))

    # Count Kanji / CJK Ideographs
    kanji_count = len(re.findall(r"[\u4E00-\u9FAF]", text))

    if hangul_count >= 5 and hangul_count >= kana_count:
        return "korean"

    if kana_count >= 3 or (kana_count >= 1 and kanji_count >= 3):
        return "japanese"

    # Edge case: single line or short text
    if hangul_count > 0 and kana_count == 0:
        return "korean"
    if kana_count > 0:
        return "japanese"

    # Only Kanji without Kana or Hangul: likely Japanese if artist/title suggests or CJK
    if kanji_count >= 5 and hangul_count == 0 and kana_count == 0:
        return "japanese"

    return None


def romanize_korean_text(text: str) -> str:
    """Romanize Korean Hangul to standard Revised Romanization."""
    if not text or not text.strip():
        return text

    try:
        from korean_romanizer.romanizer import Romanizer
        # Only romanize parts with Korean or process the line
        return Romanizer(text).romanize()
    except Exception as e:
        logger.debug(f"[Romanization] Korean romanize fallback for '{text[:20]}': {e}")
        return text


def romanize_japanese_text(text: str) -> str:
    """Romanize Japanese Kanji/Kana to standard Hepburn Romaji using Cutlet."""
    if not text or not text.strip():
        return text

    katsu = get_cutlet()
    if katsu:
        try:
            return katsu.romaji(text)
        except Exception as e:
            logger.debug(f"[Romanization] Cutlet fallback for '{text[:20]}': {e}")

    # Fallback to pykakasi if cutlet fails
    try:
        import pykakasi
        kks = pykakasi.kakasi()
        items = kks.convert(text)
        return " ".join(it["hepburn"] for it in items if it["hepburn"]).strip()
    except Exception:
        return text


def romanize_line(line: str, lang: str) -> str:
    """Romanize a single lyric line according to detected language."""
    if lang == "korean":
        return romanize_korean_text(line)
    elif lang == "japanese":
        return romanize_japanese_text(line)
    return line


def romanize_lrc(lrc_content: str, lang: str) -> str:
    """
    Romanize time-synced LRC content line-by-line while preserving
    all timestamp tags (e.g. [01:23.45]) with 100% precision.
    """
    if not lrc_content or not lang:
        return lrc_content

    tag_pattern = re.compile(r"^(\s*(?:\[\d{2}:\d{2}(?:\.\d{2,3})?\])+\s*)(.*)$")
    output_lines = []

    for line in lrc_content.splitlines():
        match = tag_pattern.match(line)
        if match:
            timestamps = match.group(1)
            lyric_text = match.group(2)
            if lyric_text.strip():
                romanized_text = romanize_line(lyric_text, lang)
                output_lines.append(f"{timestamps}{romanized_text}")
            else:
                output_lines.append(line)
        else:
            if line.strip():
                output_lines.append(romanize_line(line, lang))
            else:
                output_lines.append(line)

    return "\n".join(output_lines)


def romanize_plain(plain_content: str, lang: str) -> str:
    """Romanize plain unsynced lyric text line-by-line."""
    if not plain_content or not lang:
        return plain_content

    output_lines = []
    for line in plain_content.splitlines():
        if line.strip():
            output_lines.append(romanize_line(line, lang))
        else:
            output_lines.append("")
    return "\n".join(output_lines)


def enrich_lyrics_with_romanization(lyrics_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enrich a lyrics payload from lyrics_fetcher with romanized versions.
    Checks syncedLyrics and plainLyrics, detects language, and populates
    romanizedSynced, romanizedPlain, hasRomanization, and detectedLanguage.
    """
    if not lyrics_dict or lyrics_dict.get("notFound"):
        return lyrics_dict

    # Check if already cached/computed
    if "hasRomanization" in lyrics_dict and lyrics_dict.get("hasRomanization"):
        return lyrics_dict

    synced = lyrics_dict.get("syncedLyrics")
    plain = lyrics_dict.get("plainLyrics")

    sample_text = (synced or "") + "\n" + (plain or "")
    detected_lang = detect_cjk_language(sample_text)

    if detected_lang:
        romanized_synced = romanize_lrc(synced, detected_lang) if synced else None
        romanized_plain = romanize_plain(plain, detected_lang) if plain else None

        lyrics_dict["hasRomanization"] = True
        lyrics_dict["detectedLanguage"] = detected_lang
        lyrics_dict["romanizedSynced"] = romanized_synced
        lyrics_dict["romanizedPlain"] = romanized_plain
    else:
        lyrics_dict["hasRomanization"] = False
        lyrics_dict["detectedLanguage"] = None
        lyrics_dict["romanizedSynced"] = None
        lyrics_dict["romanizedPlain"] = None

    return lyrics_dict
