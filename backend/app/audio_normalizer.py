"""
MattLab Audio Normalization Engine (EBU R128 Loudness Standard).

Analyzes audio files using FFmpeg's native ebur128 filter to determine integrated loudness (LUFS)
and true peak (dBFS), then calculates the non-destructive target gain (gain_db) required to hit
the target integrated loudness of -14.0 LUFS (matching Spotify, YouTube Music, and Tidal standards).
"""

import os
import re
import subprocess
import logging
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger("audio_normalizer")
TARGET_LUFS = -14.0
# Safeguard bounds: Never boost more than +8 dB or cut more than -12 dB to prevent anomalous tracks
MAX_BOOST_DB = 8.0
MAX_CUT_DB = -12.0
# Peak safety margin: Ensure we leave at least 0.5 dB headroom below 0 dBFS
SAFE_PEAK_HEADROOM = -0.5

def analyze_audio_loudness(file_path: str | Path, timeout_seconds: int = 45) -> Optional[Dict[str, float]]:
    """
    Measure integrated loudness (LUFS) and true peak (dBFS) using FFmpeg ebur128 filter.
    Returns dict with keys: 'lufs_i', 'gain_db', 'true_peak' or None on failure.
    """
    path_str = str(file_path)
    if not os.path.exists(path_str):
        logger.warning(f"[AudioNormalizer] File not found: {path_str}")
        return None

    cmd = [
        "ffmpeg",
        "-nostats",
        "-i", path_str,
        "-filter_complex", "ebur128=peak=true",
        "-f", "null",
        "-"
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_seconds
        )
        stderr = proc.stderr
    except subprocess.TimeoutExpired:
        logger.warning(f"[AudioNormalizer] Timeout analyzing {path_str}")
        return None
    except Exception as e:
        logger.warning(f"[AudioNormalizer] FFmpeg invocation error for {path_str}: {e}")
        return None

    # Parse ebur128 summary output
    # Example:
    #   Integrated loudness:
    #     I:         -14.1 LUFS
    #     Threshold: -24.4 LUFS
    #   ...
    #   True peak:
    #     Peak:       -6.3 dBFS
    i_match = re.search(r'Integrated loudness:\s+I:\s+([-\d\.]+)\s+LUFS', stderr)
    peak_match = re.search(r'True peak:\s+Peak:\s+([-\d\.]+)\s+dBFS', stderr)

    if not i_match:
        logger.debug(f"[AudioNormalizer] Could not parse ebur128 output for {path_str}")
        return None

    try:
        lufs_i = float(i_match.group(1))
        true_peak = float(peak_match.group(1)) if peak_match else 0.0

        # Calculate nominal gain to hit -14.0 LUFS
        raw_gain = TARGET_LUFS - lufs_i

        # Clamp gain within reasonable artistic bounds
        clamped_gain = max(MAX_CUT_DB, min(MAX_BOOST_DB, raw_gain))

        # Check true peak clipping headroom:
        # If boosting would push true_peak above SAFE_PEAK_HEADROOM, reduce gain to avoid digital clipping
        if clamped_gain > 0 and (true_peak + clamped_gain > SAFE_PEAK_HEADROOM):
            peak_limited_gain = SAFE_PEAK_HEADROOM - true_peak
            gain_db = max(0.0, peak_limited_gain)
        else:
            gain_db = clamped_gain

        return {
            "lufs_i": round(lufs_i, 2),
            "gain_db": round(gain_db, 2),
            "true_peak": round(true_peak, 2)
        }
    except Exception as parse_err:
        logger.warning(f"[AudioNormalizer] Error calculating gain for {path_str}: {parse_err}")
        return None
