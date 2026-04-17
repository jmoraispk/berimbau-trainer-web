"""
Dump v1's Python SONG_CATALOG to JSON for v2 to consume.

Run once (or whenever v1's catalog changes):

    uv run --project "C:/Users/joaom/OneDrive - NVIDIA Corporation/Documents/GitHub/berimbau-trainer" \\
        python "scripts/dump-songs.py" > src/data/songs.json

The output is an array of song objects with camelCase keys matching
src/engine/songs.ts. One-off glue; not part of the v2 build.
"""

import json
import sys
from dataclasses import asdict
from pathlib import Path

V1_ROOT = Path(
    r"C:\Users\joaom\OneDrive - NVIDIA Corporation\Documents\GitHub\berimbau-trainer"
)
sys.path.insert(0, str(V1_ROOT))

from engine.songs import SONG_CATALOG  # type: ignore  # noqa: E402


_TOQUE_SLUG_TO_NAME = {
    "sao_bento_grande": "São Bento Grande (Regional)",
    "sao_bento_pequeno": "São Bento Pequeno",
    "angola": "Angola",
    "iuna": "Iuna",
    "cavalaria": "Cavalaria",
}


def to_json(song):
    d = asdict(song)
    # Optional fields are omitted when empty so the TS side sees `undefined`
    # (missing key) rather than `null`, which doesn't match `T | undefined`.
    out = {
        "title": d["title"],
        "slug": d["slug"],
        "style": d["style"],
        "typicalToques": [
            _TOQUE_SLUG_TO_NAME[t] for t in d["typical_toques"] if t in _TOQUE_SLUG_TO_NAME
        ],
        "source": d.get("source") or "lalaue.com",
        "hasLyrics": bool(d.get("has_lyrics")),
        "hasTranslation": bool(d.get("has_translation")),
        "audioType": d.get("audio_type") or "mixed",
        "lyrics": [
            {
                "pt": line["pt"],
                **({"en": line["en"]} if line.get("en") else {}),
                **(
                    {"beatStart": line["beat_start"]}
                    if line.get("beat_start", -1) != -1
                    else {}
                ),
            }
            for line in d.get("lyrics", [])
        ],
        "bpmRange": list(d.get("bpm_range", (80, 120))),
    }
    if d.get("author"):
        out["author"] = d["author"]
    if d.get("source_url"):
        out["sourceUrl"] = d["source_url"]
    if d.get("youtube_id"):
        out["youtubeId"] = d["youtube_id"]
    if d.get("youtube_views", -1) != -1:
        out["youtubeViews"] = d["youtube_views"]
    return out


OUT_PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "songs.json"

catalog = [to_json(s) for s in SONG_CATALOG]
catalog.sort(key=lambda s: s["title"].lower())

OUT_PATH.write_text(
    json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(f"wrote {len(catalog)} songs to {OUT_PATH}")
