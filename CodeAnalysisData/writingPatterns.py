# ------------------------------------------------------------
# Writing Patterns
# ------------------------------------------------------------
# This script can read experiment data from one of three download formats:
#   1) TXTFILES  = a folder containing one .txt file per participant/session
#   2) FULL_JSON = the full JSON export from the admin panel
#   3) FULL_CSV  = the full CSV export from the admin panel
#
# This file writes one CSV file with participant-level metrics to this folder:
#    CodeAnalysisData/writing_patterns_metrics.csv
#
# Main goal:
# - analyze participants' writing process using the text-editor snapshots
#
# Main outputs:
# - writing pace:
#    * final_word_count
#    * total_words_added
#    * net_words_added
#    * words_added_per_minute
#    * net_words_per_minute
# - pauses:
#    * pause_count
#    * pause_frequency_per_minute
#    * mean_pause_duration_sec
#    * median_pause_duration_sec
#    * max_pause_duration_sec
# - bursts:
#    * burst_count
#    * mean_burst_duration_sec
#    * mean_burst_words_added
#    * max_burst_words_added
#
# Definitions used here:
# - Pause = gap of at least PAUSE_THRESHOLD_MS between consecutive editor snapshots.
# - Burst = a sequence of consecutive editor snapshots separated by less than PAUSE_THRESHOLD_MS.
# ------------------------------------------------------------

from __future__ import annotations

import csv
import html
import json
import re
import statistics
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

# CONFIG YOU WILL EDIT
# Choose the data download format you want this script to read.
# Options:
#   "TXTFILES"  = a folder containing one .txt file per participant/session
#   "FULL_JSON" = the full JSON export from the admin panel
#   "FULL_CSV"  = the full CSV export from the admin panel
#
# Important: use the FULL CSV/JSON export, not the table-only export, because
# this script needs the full text-editor progress.
DATA_FORMAT = "FULL_CSV"

# CONFIG YOU WILL EDIT
# Folder used when DATA_FORMAT = "TXTFILES".
TXT_DATA_DIR = PROJECT_DIR / "exampleDataFiles"

# CONFIG YOU WILL EDIT
# File used when DATA_FORMAT = "FULL_JSON".
FULL_JSON_PATH = PROJECT_DIR / "exampleDataFiles" / "sessions_full.json"

# CONFIG YOU WILL EDIT
# File used when DATA_FORMAT = "FULL_CSV".
FULL_CSV_PATH = PROJECT_DIR / "exampleDataFiles" / "sessions_full.csv"

# CONFIG YOU WILL EDIT
# Gap length used to define a pause between writing snapshots.
# Example: 2000 ms = 2 seconds.
PAUSE_THRESHOLD_MS = 2000

OUTPUT_CSV = SCRIPT_DIR / "writing_patterns_metrics.csv"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def safe_load_json(path: Path) -> Optional[Any]:
    try:
        return load_json(path)
    except Exception as e:
        print(f"Skipping {path.name}: could not read JSON ({e})")
        return None


def parse_json_field(value: Any, default: Any = None) -> Any:
    """
    Convert fields from the full CSV/JSON export into Python objects.

    In the full CSV export, fields such as messages, text_editor_progress,
    chat_events, submit_attempt_timestamps, and logs are saved as JSON strings.
    This helper turns those strings back into lists/dictionaries.
    """
    if value is None:
        return default

    if isinstance(value, (dict, list)):
        return value

    text = str(value).strip()
    if text == "" or text.lower() in {"nan", "none", "null", "-"}:
        return default

    try:
        return json.loads(text)
    except Exception:
        return default


def stem_without_txt(value: Any, fallback: str = "") -> str:
    text = str(value or fallback or "").strip()
    if text.lower().endswith(".txt"):
        return text[:-4]
    return text


def normalize_downloaded_session(record: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    """
    Convert one downloaded session into the format expected by this script.

    The original .txt files usually contain:
      - id
      - messages
      - editor
      - chatEvents
      - TimeStampOfSubmitClicks

    The full CSV/JSON admin export may instead contain:
      - session_id
      - messages
      - text_editor_progress
      - chat_events
      - submit_attempt_timestamps
      - logs

    This function makes all formats look the same internally.
    """
    logs = parse_json_field(record.get("logs"), default={})
    if not isinstance(logs, dict):
        logs = {}

    messages = parse_json_field(record.get("messages"), default=None)
    if messages is None:
        messages = parse_json_field(record.get("full_messages_json"), default=None)
    if messages is None:
        messages = logs.get("messages", [])

    editor = parse_json_field(record.get("editor"), default=None)
    if editor is None:
        editor = parse_json_field(record.get("text_editor_progress"), default=None)
    if editor is None:
        editor = parse_json_field(record.get("editor_progress_json"), default=None)
    if editor is None:
        editor = logs.get("editor", [])

    chat_events = parse_json_field(record.get("chatEvents"), default=None)
    if chat_events is None:
        chat_events = parse_json_field(record.get("chat_events"), default=None)
    if chat_events is None:
        chat_events = logs.get("chatEvents", [])

    submit_clicks = parse_json_field(record.get("TimeStampOfSubmitClicks"), default=None)
    if submit_clicks is None:
        submit_clicks = parse_json_field(record.get("submit_attempt_timestamps"), default=None)
    if submit_clicks is None:
        submit_clicks = logs.get("TimeStampOfSubmitClicks", [])

    session_id = (
        record.get("id")
        or record.get("session_id")
        or logs.get("id")
        or stem_without_txt(record.get("s3_key"), fallback=Path(source_name).stem)
    )

    normalized = dict(logs)
    normalized["id"] = stem_without_txt(session_id, fallback=Path(source_name).stem)
    normalized["messages"] = messages if isinstance(messages, list) else []
    normalized["editor"] = editor if isinstance(editor, list) else []
    normalized["chatEvents"] = chat_events if isinstance(chat_events, list) else []
    normalized["TimeStampOfSubmitClicks"] = submit_clicks if isinstance(submit_clicks, list) else []

    if "ButtonPressed" in record and "ButtonPressed" not in normalized:
        normalized["ButtonPressed"] = record.get("ButtonPressed")

    # Keep useful metadata from the admin export when available.
    for key in [
        "session_id",
        "condition",
        "created_at",
        "s3_key",
        "LLMProvider",
        "LLMModel",
        "backgroundLLMMessage",
        "backgroundAIMessage",
    ]:
        if key in record and key not in normalized:
            normalized[key] = record[key]

    return normalized


def iter_input_files(folder: Path) -> Iterable[Path]:
    seen = set()
    for pattern in ("*.json", "*.txt"):
        for path in sorted(folder.glob(pattern)):
            if path not in seen:
                seen.add(path)
                yield path


def html_to_plain_text(raw_html: str) -> str:
    if not raw_html:
        return ""
    text = re.sub(r"<br\s*/?>", " ", raw_html, flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def word_count(text: str) -> int:
    # Simple and stable word definition for English-like text.
    return len(re.findall(r"\b\w+\b", text))


def safe_messages(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    messages = data.get("messages", [])
    return messages if isinstance(messages, list) else []


def safe_chat_events(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    chat_events = data.get("chatEvents", [])
    return chat_events if isinstance(chat_events, list) else []


def safe_editor(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    editor = data.get("editor", [])
    return editor if isinstance(editor, list) else []


def get_max_timestamp(data: Dict[str, Any]) -> Optional[int]:
    timestamps: List[int] = []

    for msg in safe_messages(data):
        ts = msg.get("timestamp")
        if isinstance(ts, (int, float)):
            timestamps.append(int(ts))

    for snap in safe_editor(data):
        ts = snap.get("t_ms")
        if isinstance(ts, (int, float)):
            timestamps.append(int(ts))

    for event in safe_chat_events(data):
        ts = event.get("t_ms")
        if isinstance(ts, (int, float)):
            timestamps.append(int(ts))

    button_pressed = data.get("ButtonPressed")
    if isinstance(button_pressed, (int, float)):
        timestamps.append(int(button_pressed))

    submit_clicks = data.get("TimeStampOfSubmitClicks", [])
    if isinstance(submit_clicks, list):
        for ts in submit_clicks:
            if isinstance(ts, (int, float)):
                timestamps.append(int(ts))

    return max(timestamps) if timestamps else None


def build_editor_series(editor_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []

    for row in editor_rows:
        if not isinstance(row, dict):
            continue
        ts = row.get("t_ms")
        text_html = row.get("text", "")
        if not isinstance(ts, (int, float)):
            continue
        plain = html_to_plain_text(text_html if isinstance(text_html, str) else "")
        cleaned.append(
            {
                "t_ms": int(ts),
                "plain_text": plain,
                "word_count": word_count(plain),
            }
        )

    cleaned.sort(key=lambda x: x["t_ms"])
    return cleaned


def compute_pause_metrics(series: List[Dict[str, Any]], session_duration_min: Optional[float]) -> Dict[str, Any]:
    if len(series) < 2:
        return {
            "pause_count": 0,
            "pause_frequency_per_minute": None,
            "mean_pause_duration_sec": None,
            "median_pause_duration_sec": None,
            "max_pause_duration_sec": None,
        }

    gaps = [series[i]["t_ms"] - series[i - 1]["t_ms"] for i in range(1, len(series))]
    pause_gaps = [gap for gap in gaps if gap >= PAUSE_THRESHOLD_MS]

    pause_count = len(pause_gaps)
    pause_frequency_per_minute = (
        pause_count / session_duration_min if session_duration_min and session_duration_min > 0 else None
    )

    return {
        "pause_count": pause_count,
        "pause_frequency_per_minute": round(pause_frequency_per_minute, 4) if pause_frequency_per_minute is not None else None,
        "mean_pause_duration_sec": round(statistics.mean(pause_gaps) / 1000, 4) if pause_gaps else None,
        "median_pause_duration_sec": round(statistics.median(pause_gaps) / 1000, 4) if pause_gaps else None,
        "max_pause_duration_sec": round(max(pause_gaps) / 1000, 4) if pause_gaps else None,
    }


def split_into_bursts(series: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    if not series:
        return []

    bursts: List[List[Dict[str, Any]]] = [[series[0]]]

    for i in range(1, len(series)):
        gap = series[i]["t_ms"] - series[i - 1]["t_ms"]
        if gap >= PAUSE_THRESHOLD_MS:
            bursts.append([series[i]])
        else:
            bursts[-1].append(series[i])

    return bursts


def words_added_within_burst(burst: List[Dict[str, Any]]) -> int:
    if len(burst) < 2:
        return 0

    total_added = 0
    for i in range(1, len(burst)):
        delta = burst[i]["word_count"] - burst[i - 1]["word_count"]
        if delta > 0:
            total_added += delta
    return total_added


def compute_burst_metrics(series: List[Dict[str, Any]]) -> Dict[str, Any]:
    bursts = split_into_bursts(series)
    if not bursts:
        return {
            "burst_count": 0,
            "mean_burst_duration_sec": None,
            "mean_burst_words_added": None,
            "max_burst_words_added": None,
        }

    burst_durations_ms: List[int] = []
    burst_words_added: List[int] = []

    for burst in bursts:
        duration = burst[-1]["t_ms"] - burst[0]["t_ms"]
        burst_durations_ms.append(duration)
        burst_words_added.append(words_added_within_burst(burst))

    return {
        "burst_count": len(bursts),
        "mean_burst_duration_sec": round(statistics.mean(burst_durations_ms) / 1000, 4) if burst_durations_ms else None,
        "mean_burst_words_added": round(statistics.mean(burst_words_added), 4) if burst_words_added else None,
        "max_burst_words_added": max(burst_words_added) if burst_words_added else None,
    }


def compute_writing_pace_metrics(series: List[Dict[str, Any]], session_duration_min: Optional[float]) -> Dict[str, Any]:
    if not series:
        return {
            "first_editor_t_ms": None,
            "last_editor_t_ms": None,
            "editor_duration_min": None,
            "initial_word_count": None,
            "final_word_count": None,
            "total_words_added": None,
            "net_words_added": None,
            "words_added_per_minute": None,
            "net_words_per_minute": None,
        }

    first_t = series[0]["t_ms"]
    last_t = series[-1]["t_ms"]
    editor_duration_min = (last_t - first_t) / 60000 if last_t > first_t else 0.0

    initial_word_count = series[0]["word_count"]
    final_word_count = series[-1]["word_count"]

    total_words_added = 0
    for i in range(1, len(series)):
        delta = series[i]["word_count"] - series[i - 1]["word_count"]
        if delta > 0:
            total_words_added += delta

    net_words_added = final_word_count - initial_word_count

    # Prefer editor duration when possible, otherwise fall back to session duration.
    denominator_min = editor_duration_min if editor_duration_min > 0 else session_duration_min

    words_added_per_minute = (
        total_words_added / denominator_min if denominator_min and denominator_min > 0 else None
    )
    net_words_per_minute = (
        net_words_added / denominator_min if denominator_min and denominator_min > 0 else None
    )

    return {
        "first_editor_t_ms": first_t,
        "last_editor_t_ms": last_t,
        "editor_duration_min": round(editor_duration_min, 4),
        "initial_word_count": initial_word_count,
        "final_word_count": final_word_count,
        "total_words_added": total_words_added,
        "net_words_added": net_words_added,
        "words_added_per_minute": round(words_added_per_minute, 4) if words_added_per_minute is not None else None,
        "net_words_per_minute": round(net_words_per_minute, 4) if net_words_per_minute is not None else None,
    }


def analyze_session_data(data: Dict[str, Any], source_name: str) -> Optional[Dict[str, Any]]:
    participant_id = data.get("id", Path(source_name).stem)
    editor_rows = safe_editor(data)
    messages = safe_messages(data)
    chat_events = safe_chat_events(data)

    if not editor_rows:
        print(f"Skipping {source_name}: no editor data found.")
        return None

    series = build_editor_series(editor_rows)
    if not series:
        print(f"Skipping {source_name}: editor data exists but could not be parsed.")
        return None

    session_end_ms = get_max_timestamp(data)
    session_duration_min = (session_end_ms / 60000) if session_end_ms and session_end_ms > 0 else None

    result: Dict[str, Any] = {
        "source_file": source_name,
        "participant_id": participant_id,
        "condition": data.get("condition", ""),
        "created_at": data.get("created_at", ""),
        "has_messages": bool(messages),
        "has_chat_events": bool(chat_events),
        "message_count": len(messages),
        "chat_event_count": len(chat_events),
        "session_end_ms": session_end_ms,
        "session_duration_min": round(session_duration_min, 4) if session_duration_min is not None else None,
        "pause_threshold_ms": PAUSE_THRESHOLD_MS,
    }

    result.update(compute_writing_pace_metrics(series, session_duration_min))
    result.update(compute_pause_metrics(series, session_duration_min))
    result.update(compute_burst_metrics(series))

    return result


def write_csv(rows: List[Dict[str, Any]], output_path: Path) -> None:
    if not rows:
        print("No results to save.")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def load_sessions_from_txt_files(data_dir: Path) -> List[Tuple[str, Dict[str, Any]]]:
    if not data_dir.exists():
        print(f"Data folder not found: {data_dir}")
        return []

    sessions: List[Tuple[str, Dict[str, Any]]] = []

    for path in iter_input_files(data_dir):
        data = safe_load_json(path)
        if not isinstance(data, dict):
            continue
        sessions.append((path.name, normalize_downloaded_session(data, source_name=path.name)))

    return sessions


def load_sessions_from_full_json(path: Path) -> List[Tuple[str, Dict[str, Any]]]:
    data = safe_load_json(path)
    if data is None:
        return []

    if isinstance(data, dict) and isinstance(data.get("sessions"), list):
        records = data["sessions"]
    elif isinstance(data, list):
        records = data
    else:
        print(f"Expected a list of sessions in JSON file: {path}")
        return []

    sessions: List[Tuple[str, Dict[str, Any]]] = []
    skipped_without_editor_data = 0

    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            continue
        normalized = normalize_downloaded_session(record, source_name=f"{path.name}:row{index}")
        if not normalized.get("editor"):
            skipped_without_editor_data += 1
        source_name = str(record.get("s3_key") or record.get("session_id") or f"{path.name}:row{index}")
        sessions.append((source_name, normalized))

    if skipped_without_editor_data == len(sessions) and sessions:
        print(
            "Warning: This JSON file looks like a table-only export. "
            "Use the FULL JSON export so text-editor progress is included."
        )

    return sessions


def load_sessions_from_full_csv(path: Path) -> List[Tuple[str, Dict[str, Any]]]:
    if not path.exists():
        print(f"CSV file not found: {path}")
        return []

    sessions: List[Tuple[str, Dict[str, Any]]] = []
    skipped_without_editor_data = 0

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for index, record in enumerate(reader, start=1):
            normalized = normalize_downloaded_session(record, source_name=f"{path.name}:row{index}")
            if not normalized.get("editor"):
                skipped_without_editor_data += 1
            source_name = str(record.get("s3_key") or record.get("session_id") or f"{path.name}:row{index}")
            sessions.append((source_name, normalized))

    if skipped_without_editor_data == len(sessions) and sessions:
        print(
            "Warning: This CSV file looks like a table-only export. "
            "Use the FULL CSV export so text-editor progress is included."
        )

    return sessions


def load_sessions() -> List[Tuple[str, Dict[str, Any]]]:
    format_name = DATA_FORMAT.upper().strip()

    if format_name == "TXTFILES":
        return load_sessions_from_txt_files(TXT_DATA_DIR)

    if format_name == "FULL_JSON":
        return load_sessions_from_full_json(FULL_JSON_PATH)

    if format_name == "FULL_CSV":
        return load_sessions_from_full_csv(FULL_CSV_PATH)

    raise ValueError(
        f"Unknown DATA_FORMAT: {DATA_FORMAT}. "
        "Use one of: TXTFILES, FULL_JSON, FULL_CSV."
    )


def main() -> None:
    sessions = load_sessions()

    if not sessions:
        print("No data found.")
        print(f"Current DATA_FORMAT: {DATA_FORMAT}")
        print(f"TXT_DATA_DIR: {TXT_DATA_DIR}")
        print(f"FULL_JSON_PATH: {FULL_JSON_PATH}")
        print(f"FULL_CSV_PATH: {FULL_CSV_PATH}")
        return

    all_rows: List[Dict[str, Any]] = []

    print(f"Data format: {DATA_FORMAT}")
    print(f"Pause threshold: {PAUSE_THRESHOLD_MS} ms")
    print("-" * 72)

    for source_name, data in sessions:
        result = analyze_session_data(data, source_name=source_name)
        if result is not None:
            all_rows.append(result)
            print(
                f"{source_name}: "
                f"final_words={result['final_word_count']}, "
                f"words_added_per_min={result['words_added_per_minute']}, "
                f"pause_count={result['pause_count']}, "
                f"burst_count={result['burst_count']}"
            )

    print("-" * 72)
    write_csv(all_rows, OUTPUT_CSV)
    print(f"Processed sessions with writing data: {len(all_rows)}")
    print(f"Saved output to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
