"""
Summary:
This script converts participant/session chat messages into CSV files.

It supports three data download formats:
1. A folder of raw .txt files from S3
2. The full JSON export from the admin panel
3. The full CSV export from the admin panel

For each participant/session, it exports one CSV file with the chat messages.

Search for: CONFIG YOU WILL EDIT to edit relevant changes
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ------------------------------------------------------------
# 1) Paths and data format settings
# ------------------------------------------------------------

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
# this script needs the full message text, not only message counts.
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
# Folder where one message CSV per participant/session will be saved.
OUTPUT_DIR = PROJECT_DIR / "exampleDataFiles" / "messagesCSVs"


# ------------------------------------------------------------
# 2) Reading + parsing helpers
# ------------------------------------------------------------

def load_json_from_txt(txt_path: Path | str) -> Dict[str, Any]:
    """
    Loads one raw submission log from a .txt file.

    Why this exists:
    - Some exports might contain extra characters before the JSON starts.
    - We safely find the first '{' and parse from there.
    """
    txt_path = Path(txt_path)

    with txt_path.open("r", encoding="utf-8") as f:
        raw = f.read().strip()

    first_brace = raw.find("{")
    if first_brace == -1:
        raise ValueError(f"No JSON object found in file: {txt_path}")

    raw_json = raw[first_brace:]
    return json.loads(raw_json)


def safe_load_json(path: Path | str) -> Optional[Any]:
    """
    Safely loads a JSON file and returns None if it cannot be read.
    """
    path = Path(path)

    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[SKIP] Could not read JSON file {path}: {e}")
        return None


def parse_json_field(value: Any, default: Any = None) -> Any:
    """
    Converts JSON-like fields from the full CSV/JSON export into Python objects.

    In the full CSV export, fields such as messages and logs are often stored as
    JSON strings. This helper converts those strings back into Python lists/dicts.
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
    """
    Returns a clean participant/session ID without a trailing .txt extension.
    """
    text = str(value or fallback or "").strip()
    if text.lower().endswith(".txt"):
        return text[:-4]
    return text


def safe_filename(value: str) -> str:
    """
    Makes a participant/session ID safe to use as a file name.
    """
    keep = []
    for char in value:
        if char.isalnum() or char in {"-", "_"}:
            keep.append(char)
        else:
            keep.append("_")
    return "".join(keep).strip("_") or "unknown_session"


# ------------------------------------------------------------
# 3) Normalize TXT / full JSON / full CSV into one structure
# ------------------------------------------------------------

def normalize_downloaded_session(record: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    """
    Converts one downloaded session into the format expected by this script.

    Raw .txt logs usually contain:
      - id
      - messages

    Full CSV/JSON admin exports may contain:
      - session_id
      - messages
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

    session_id = (
        record.get("id")
        or record.get("session_id")
        or logs.get("id")
        or stem_without_txt(record.get("s3_key"), fallback=Path(source_name).stem)
    )

    normalized = dict(logs)
    normalized["id"] = stem_without_txt(session_id, fallback=Path(source_name).stem)
    normalized["messages"] = messages if isinstance(messages, list) else []

    # Keep useful metadata from the admin export when available.
    for key in ["session_id", "condition", "created_at", "s3_key"]:
        if key in record and key not in normalized:
            normalized[key] = record[key]

    return normalized


def load_sessions_from_txt_files(data_dir: Path) -> List[Tuple[str, Dict[str, Any]]]:
    """
    Reads a folder of raw .txt/.json session files.
    """
    if not data_dir.exists():
        print(f"Data folder not found: {data_dir}")
        return []

    sessions: List[Tuple[str, Dict[str, Any]]] = []

    files = sorted(list(data_dir.glob("*.txt")) + list(data_dir.glob("*.json")))

    for path in files:
        try:
            if path.suffix.lower() == ".txt":
                payload = load_json_from_txt(path)
            else:
                payload = safe_load_json(path)

            if not isinstance(payload, dict):
                continue

            normalized = normalize_downloaded_session(payload, source_name=path.name)
            sessions.append((path.name, normalized))

        except Exception as e:
            print(f"[SKIP] {path.name}: could not parse session ({e})")

    return sessions


def load_sessions_from_full_json(path: Path) -> List[Tuple[str, Dict[str, Any]]]:
    """
    Reads the full JSON export from the admin panel.
    """
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
    skipped_without_messages = 0

    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            continue

        source_name = str(record.get("s3_key") or record.get("session_id") or f"{path.name}:row{index}")
        normalized = normalize_downloaded_session(record, source_name=source_name)

        if not normalized.get("messages"):
            skipped_without_messages += 1

        sessions.append((source_name, normalized))

    if skipped_without_messages == len(sessions) and sessions:
        print(
            "Warning: This JSON file looks like a table-only export. "
            "Use the FULL JSON export so full messages are included."
        )

    return sessions


def load_sessions_from_full_csv(path: Path) -> List[Tuple[str, Dict[str, Any]]]:
    """
    Reads the full CSV export from the admin panel.
    """
    if not path.exists():
        print(f"CSV file not found: {path}")
        return []

    sessions: List[Tuple[str, Dict[str, Any]]] = []
    skipped_without_messages = 0

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        for index, record in enumerate(reader, start=1):
            source_name = str(record.get("s3_key") or record.get("session_id") or f"{path.name}:row{index}")
            normalized = normalize_downloaded_session(record, source_name=source_name)

            if not normalized.get("messages"):
                skipped_without_messages += 1

            sessions.append((source_name, normalized))

    if skipped_without_messages == len(sessions) and sessions:
        print(
            "Warning: This CSV file looks like a table-only export. "
            "Use the FULL CSV export so full messages are included."
        )

    return sessions


def load_sessions() -> List[Tuple[str, Dict[str, Any]]]:
    """
    Loads sessions based on DATA_FORMAT.
    """
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


# ------------------------------------------------------------
# 4) Message extraction + CSV writing
# ------------------------------------------------------------

def clean_message_rows(messages: List[Any]) -> List[Dict[str, Any]]:
    """
    Converts the raw messages array into clean CSV rows.
    """
    rows: List[Dict[str, Any]] = []

    for index, message in enumerate(messages, start=1):
        if not isinstance(message, dict):
            continue

        rows.append({
            "message_number": index,
            "timestamp": message.get("timestamp", ""),
            "sender": message.get("sender", ""),
            "text": message.get("text", ""),
        })

    def sort_key(row: Dict[str, Any]) -> Tuple[bool, float]:
        timestamp = row["timestamp"]

        if isinstance(timestamp, (int, float)):
            return (False, float(timestamp))

        try:
            return (False, float(timestamp))
        except Exception:
            return (True, float("inf"))

    rows.sort(key=sort_key)
    return rows


def write_one_message_csv(
    participant_id: str,
    messages: List[Any],
    output_dir: Path,
) -> Optional[Path]:
    """
    Writes one message CSV for one participant/session.
    """
    rows = clean_message_rows(messages)

    if not rows:
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{safe_filename(participant_id)}_messages.csv"
    out_file = output_dir / filename

    with out_file.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["message_number", "timestamp", "sender", "text"],
        )
        writer.writeheader()
        writer.writerows(rows)

    return out_file


def logs_to_message_csvs(output_dir: Path) -> None:
    """
    Loads sessions according to DATA_FORMAT and exports one messages CSV
    per participant/session.
    """
    sessions = load_sessions()

    if not sessions:
        print("No data found.")
        print(f"Current DATA_FORMAT: {DATA_FORMAT}")
        print(f"TXT_DATA_DIR: {TXT_DATA_DIR}")
        print(f"FULL_JSON_PATH: {FULL_JSON_PATH}")
        print(f"FULL_CSV_PATH: {FULL_CSV_PATH}")
        return

    written_count = 0
    skipped_count = 0

    for source_name, log in sessions:
        participant_id = str(log.get("id", stem_without_txt(source_name, fallback="unknown_session")))
        messages = log.get("messages", [])

        if not isinstance(messages, list) or not messages:
            print(f"[SKIP] {source_name}: no messages found")
            skipped_count += 1
            continue

        out_file = write_one_message_csv(participant_id, messages, output_dir)

        if out_file is None:
            print(f"[SKIP] {source_name}: no valid message rows")
            skipped_count += 1
            continue

        written_count += 1
        print(f"[OK] Wrote {out_file.name}")

    print("-" * 72)
    print("Message CSV export completed.")
    print(f"Data format: {DATA_FORMAT}")
    print(f"Sessions loaded: {len(sessions)}")
    print(f"Message CSVs written: {written_count}")
    print(f"Sessions skipped: {skipped_count}")
    print(f"Output folder: {output_dir}")


if __name__ == "__main__":
    logs_to_message_csvs(OUTPUT_DIR)
