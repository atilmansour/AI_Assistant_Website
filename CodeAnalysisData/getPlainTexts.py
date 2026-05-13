"""
Summary:
This script converts downloaded experiment data into clean, plain-text files
(one per participant/session) that are ready to use for text analysis.

It supports three data download formats:
1. A folder of raw .txt files from S3
2. The full JSON export from the admin panel
3. The full CSV export from the admin panel

The script extracts the final text-editor content, removes Quill/HTML tags,
writes one clean text file per participant/session, and also saves one combined
CSV file with a participant/session ID column and a cleaned_text column.
Optionally, it can also merge those cleaned texts into an existing CSV using a
participant/code column.

Search for: CONFIG YOU WILL EDIT to edit relevant changes
"""

from __future__ import annotations

import csv
import json
import os
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from bs4 import BeautifulSoup


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
# this script needs the final text or full text-editor progress.
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
# Folder where the clean plain-text files will be saved.
# Recommendation: keep this different from the raw data folder to avoid overwriting files.
OUTPUT_FOLDER = PROJECT_DIR / "exampleDataFiles" / "cleanTexts"

# CONFIG YOU WILL EDIT
# CSV file where all cleaned texts will also be saved together.
# This file will include one row per participant/session.
CLEAN_TEXTS_CSV = PROJECT_DIR / "exampleDataFiles" / "clean_texts.csv"


# ------------------------------------------------------------
# 2) Reading + parsing helpers
# ------------------------------------------------------------

def load_json_from_txt(txt_path: Path | str) -> dict:
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
        print(f"Could not read JSON file {path}: {e}")
        return None


def parse_json_field(value: Any, default: Any = None) -> Any:
    """
    Converts JSON-like fields from the full CSV/JSON export into Python objects.

    In the full CSV export, fields such as text_editor_progress, messages,
    chat_events, and logs are often stored as JSON strings. This helper converts
    those strings back into Python lists/dictionaries.
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


# ------------------------------------------------------------
# 3) Data normalization across TXT / full JSON / full CSV
# ------------------------------------------------------------

def normalize_downloaded_session(record: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    """
    Converts one downloaded session into a common internal format.

    Raw .txt logs usually contain:
      - id
      - editor

    Full CSV/JSON admin exports may contain:
      - session_id
      - text_editor_final_submission
      - text_editor_progress
      - logs

    This function makes all formats look similar internally.
    """
    logs = parse_json_field(record.get("logs"), default={})
    if not isinstance(logs, dict):
        logs = {}

    editor = parse_json_field(record.get("editor"), default=None)
    if editor is None:
        editor = parse_json_field(record.get("text_editor_progress"), default=None)
    if editor is None:
        editor = parse_json_field(record.get("editor_progress_json"), default=None)
    if editor is None:
        editor = logs.get("editor", [])

    final_text = (
        record.get("text_editor_final_submission")
        or record.get("final_solution")
        or logs.get("final_solution")
        or ""
    )

    session_id = (
        record.get("id")
        or record.get("session_id")
        or logs.get("id")
        or stem_without_txt(record.get("s3_key"), fallback=Path(source_name).stem)
    )

    normalized = dict(logs)
    normalized["id"] = stem_without_txt(session_id, fallback=Path(source_name).stem)
    normalized["editor"] = editor if isinstance(editor, list) else []
    normalized["text_editor_final_submission"] = str(final_text or "")

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

    for path in sorted(list(data_dir.glob("*.txt")) + list(data_dir.glob("*.json"))):
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
            print(f"Failed on {path}: {e}")

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
    skipped_without_text_data = 0

    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            continue

        source_name = str(record.get("s3_key") or record.get("session_id") or f"{path.name}:row{index}")
        normalized = normalize_downloaded_session(record, source_name=source_name)

        if not normalized.get("text_editor_final_submission") and not normalized.get("editor"):
            skipped_without_text_data += 1

        sessions.append((source_name, normalized))

    if skipped_without_text_data == len(sessions) and sessions:
        print(
            "Warning: This JSON file looks like a table-only export. "
            "Use the FULL JSON export so final text or text-editor progress is included."
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
    skipped_without_text_data = 0

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        for index, record in enumerate(reader, start=1):
            source_name = str(record.get("s3_key") or record.get("session_id") or f"{path.name}:row{index}")
            normalized = normalize_downloaded_session(record, source_name=source_name)

            if not normalized.get("text_editor_final_submission") and not normalized.get("editor"):
                skipped_without_text_data += 1

            sessions.append((source_name, normalized))

    if skipped_without_text_data == len(sessions) and sessions:
        print(
            "Warning: This CSV file looks like a table-only export. "
            "Use the FULL CSV export so final text or text-editor progress is included."
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
# 4) Extracting final text
# ------------------------------------------------------------

def get_final_editor_html(payload: Dict[str, Any]) -> str:
    """
    Returns the final editor HTML/plain-text from the normalized payload.

    Priority:
    1. text_editor_final_submission from the full CSV/JSON export, if available
    2. Last item in payload["editor"], if available
    """
    direct_final = payload.get("text_editor_final_submission", "")
    if isinstance(direct_final, str) and direct_final.strip():
        return direct_final

    editor = payload.get("editor", [])
    if not isinstance(editor, list) or len(editor) == 0:
        return ""

    last = editor[-1]
    if isinstance(last, dict):
        return str(last.get("text", ""))

    return ""


def quill_html_to_plain_text(raw_html: str) -> str:
    """
    Converts Quill/HTML into plain text.
    - Preserves line breaks from <br>
    - Strips HTML tags
    - Unescapes HTML entities such as &nbsp;
    """
    if not raw_html:
        return ""

    soup = BeautifulSoup(raw_html, "html.parser")

    for br in soup.find_all("br"):
        br.replace_with("\n")

    text = soup.get_text()
    text = unescape(text)
    text = text.replace("\r\n", "\n").strip()

    return text


# ------------------------------------------------------------
# 5) Main batch processing
# ------------------------------------------------------------

def export_texts(output_folder: Path, output_csv: Path) -> None:
    """
    Loads sessions according to DATA_FORMAT, extracts final editor content,
    converts it to plain text, and saves:

    1. One clean .txt file per participant/session
       Output file name: <id>.txt

    2. One combined CSV file with one row per participant/session
       Main columns:
       - participant_id
       - source_file
       - condition
       - created_at
       - cleaned_text
    """
    sessions = load_sessions()

    if not sessions:
        print("No data found.")
        print(f"Current DATA_FORMAT: {DATA_FORMAT}")
        print(f"TXT_DATA_DIR: {TXT_DATA_DIR}")
        print(f"FULL_JSON_PATH: {FULL_JSON_PATH}")
        print(f"FULL_CSV_PATH: {FULL_CSV_PATH}")
        return

    output_folder.mkdir(parents=True, exist_ok=True)
    output_csv.parent.mkdir(parents=True, exist_ok=True)

    csv_rows: List[Dict[str, Any]] = []
    written_count = 0
    skipped_count = 0

    for source_name, payload in sessions:
        pid = str(payload.get("id", stem_without_txt(source_name, fallback="unknown_session")))

        final_html = get_final_editor_html(payload)
        clean_text = quill_html_to_plain_text(final_html)

        row = {
            "participant_id": pid,
            "session_id": payload.get("session_id", pid),
            "source_file": source_name,
            "condition": payload.get("condition", ""),
            "created_at": payload.get("created_at", ""),
            "cleaned_text": clean_text,
        }
        csv_rows.append(row)

        if not clean_text.strip():
            print(f"Skipping text file for {source_name}: no final editor text found.")
            skipped_count += 1
            continue

        out_path = output_folder / f"{pid}.txt"

        with out_path.open("w", encoding="utf-8") as out:
            out.write(clean_text)

        written_count += 1
        print(f"Wrote text: {out_path}")

    if csv_rows:
        fieldnames = ["participant_id", "session_id", "source_file", "condition", "created_at", "cleaned_text"]

        with output_csv.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(csv_rows)

        print(f"Wrote combined clean-text CSV: {output_csv}")

    print("-" * 72)
    print("Clean text export completed.")
    print(f"Data format: {DATA_FORMAT}")
    print(f"Sessions loaded: {len(sessions)}")
    print(f"Texts written as .txt files: {written_count}")
    print(f"Rows written to CSV: {len(csv_rows)}")
    print(f"Sessions skipped for .txt output: {skipped_count}")
    print(f"Output folder: {output_folder}")
    print(f"Clean-text CSV: {output_csv}")


# ------------------------------------------------------------
# 6) Optional: merge into a CSV
# ------------------------------------------------------------

def add_text_column_from_txt(
    csv_file: str | Path,
    cleaned_text_dir: str | Path,
    output_csv: str | Path,
    code_col: str = "code",
    text_col: str = "textT1",
) -> None:
    """
    Adds a text column to an existing CSV by matching df[code_col]
    to <code>.txt in cleaned_text_dir.

    Example:
    If your CSV has a column named "code" and one row has code = ABC123,
    this function looks for:
      cleaned_text_dir/ABC123.txt
    and adds its contents to the output CSV.
    """
    csv_file = Path(csv_file)
    cleaned_text_dir = Path(cleaned_text_dir)
    output_csv = Path(output_csv)

    df = pd.read_csv(csv_file)
    texts: List[Optional[str]] = []

    for code in df[code_col].astype(str):
        txt_path = cleaned_text_dir / f"{code}.txt"

        if txt_path.is_file():
            with txt_path.open("r", encoding="utf-8") as f:
                texts.append(f.read())
        else:
            texts.append(None)

    df[text_col] = texts
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_csv, index=False)
    print(f"Wrote merged CSV: {output_csv}")


if __name__ == "__main__":
    export_texts(OUTPUT_FOLDER, CLEAN_TEXTS_CSV)

    # CONFIG YOU WILL EDIT
    # Optional: If you have a CSV with a participant/code column and want to add
    # the cleaned texts into it, uncomment and edit the lines below.
    #
    # CSV_FILE = r"C:\path\to\data.csv"
    # OUT_CSV = r"C:\path\to\data_with_text.csv"
    # add_text_column_from_txt(CSV_FILE, OUTPUT_FOLDER, OUT_CSV, code_col="code", text_col="textT1")
