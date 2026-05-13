from __future__ import annotations

import csv
import json
import math
import re
from collections import Counter
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ------------------------------------------------------------
# Indirect incorporation: similarity between LLM language
# and participants' text
# ------------------------------------------------------------
# Folder structure assumed:
#
# code_website/
#   CodeAnalysisData/
#       indirectIncorporationSimilarity.py   <-- place this file here
#   exampleDataFiles/
#       participant1.txt
#       participant2.txt
#       ...
#
# Output:
#   1. indirect_incorporation_similarity_summary.csv
#
# Main outputs:
# - participant-level indirect incorporation metrics:
#    * participant_id = participant identifier from the saved data file
#    * source_file = name of the participant data file analyzed
#    * similarity_final_text_to_llm_text = cosine similarity between the participant's final text and the LLM assistant's messages
#    * similarity_threshold = threshold used to classify whether similarity is high enough to count as indirect incorporation
#    * meets_similarity_threshold = True/False indicator for whether the participant's similarity score meets the threshold
#    * final_text_word_count = number of words in the participant's final submitted text
#    * llm_text_word_count = number of words in the LLM assistant messages used for the comparison
#    * n_assistant_messages_used = number of LLM assistant messages included in the similarity calculation
#    * include_initial_assistant_messages = whether initial/present assistant messages were included in the analysis
#    * has_messages_field = whether the participant/session contains a messages field
#    * has_editor_field = whether the participant/session contains an editor field
#
# This script estimates indirect incorporation as the degree of similarity
# between the LLM-generated language and the participant's final submitted text.
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
# this script needs the full chat messages and text-editor progress.
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

OUTPUT_CSV = SCRIPT_DIR / "indirect_incorporation_similarity_summary.csv"

USER_SENDER_VALUES = {"user"}
ASSISTANT_SENDER_VALUES = {"llmassistant", "assistant", "ai", "model"}

# CONFIG YOU WILL EDIT:
# If False, assistant messages before the first user message are excluded.
INCLUDE_INITIAL_ASSISTANT_MESSAGES = False

# CONFIG YOU WILL EDIT:
# Similarity threshold used to mark whether a participant's final text
# reaches your chosen level of indirect incorporation.
# Example: 0.30 = 30% similarity, 0.50 = 50% similarity.
SIMILARITY_THRESHOLD = 0.30

# CONFIG YOU WILL EDIT:
# Add phrases here if you want to ignore known present/welcome messages by content.
PRESENT_MESSAGE_PHRASES_TO_IGNORE = [
    "present message",
    "this is the second message",
]


def strip_html(html_text: str) -> str:
    if not html_text:
        return ""
    text = re.sub(r"<[^>]+>", " ", html_text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize(text: str) -> List[str]:
    if not text:
        return []
    return re.findall(r"\b\w+\b", text.lower())


def safe_load_json(path: Path) -> Optional[Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Skipping {path.name}: could not read JSON ({e})")
        return None


def parse_json_field(value: Any, default: Any = None) -> Any:
    """
    Convert values from the full CSV/JSON export into Python objects.

    In the full CSV export, fields such as messages, text_editor_progress,
    and logs are saved as JSON strings. This helper turns those strings back
    into lists/dictionaries so the rest of the analysis can use them.
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

    The original .txt files usually already contain:
      - id
      - messages
      - editor

    The full CSV/JSON admin export may instead contain:
      - session_id
      - messages
      - text_editor_progress
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


def get_messages(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    messages = data.get("messages", [])
    if not isinstance(messages, list):
        return []

    cleaned: List[Dict[str, Any]] = []
    for item in messages:
        if not isinstance(item, dict):
            continue

        timestamp = item.get("timestamp")
        sender = item.get("sender")
        text = item.get("text", "")

        if isinstance(timestamp, (int, float)) and isinstance(sender, str):
            cleaned.append({
                "timestamp": int(timestamp),
                "sender": sender.strip().lower(),
                "text": str(text),
            })

    cleaned.sort(key=lambda x: x["timestamp"])
    return cleaned


def get_editor_snapshots(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    snapshots = data.get("editor", [])
    if not isinstance(snapshots, list):
        return []

    cleaned: List[Dict[str, Any]] = []
    for item in snapshots:
        if not isinstance(item, dict):
            continue

        t_ms = item.get("t_ms")
        text = item.get("text", "")

        if isinstance(t_ms, (int, float)):
            cleaned.append({
                "t_ms": int(t_ms),
                "text": strip_html(str(text)),
            })

    cleaned.sort(key=lambda x: x["t_ms"])
    return cleaned


def get_first_user_timestamp(messages: List[Dict[str, Any]]) -> Optional[int]:
    for msg in messages:
        if msg["sender"] in USER_SENDER_VALUES:
            return msg["timestamp"]
    return None


def is_present_message_by_content(text: str) -> bool:
    text_lower = text.lower()
    return any(phrase.lower() in text_lower for phrase in PRESENT_MESSAGE_PHRASES_TO_IGNORE)


def filter_assistant_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not messages:
        return []

    first_user_timestamp = get_first_user_timestamp(messages)
    filtered: List[Dict[str, Any]] = []

    for msg in messages:
        if msg["sender"] not in ASSISTANT_SENDER_VALUES:
            continue

        if not INCLUDE_INITIAL_ASSISTANT_MESSAGES and first_user_timestamp is not None:
            if msg["timestamp"] < first_user_timestamp:
                continue

        if is_present_message_by_content(msg["text"]):
            continue

        filtered.append(msg)

    return filtered


def get_final_text(data: Dict[str, Any]) -> str:
    snapshots = get_editor_snapshots(data)
    if not snapshots:
        return ""
    return snapshots[-1]["text"]


def cosine_similarity_from_tokens(tokens_a: List[str], tokens_b: List[str]) -> Optional[float]:
    if not tokens_a or not tokens_b:
        return None

    counter_a = Counter(tokens_a)
    counter_b = Counter(tokens_b)

    dot_product = 0.0
    for token, count_a in counter_a.items():
        dot_product += count_a * counter_b.get(token, 0)

    norm_a = math.sqrt(sum(count ** 2 for count in counter_a.values()))
    norm_b = math.sqrt(sum(count ** 2 for count in counter_b.values()))

    if norm_a == 0 or norm_b == 0:
        return None

    return round(dot_product / (norm_a * norm_b), 4)


def analyze_session_data(data: Dict[str, Any], source_name: str) -> Optional[Dict[str, Any]]:
    participant_id = str(data.get("id", Path(source_name).stem))
    messages = get_messages(data)
    assistant_messages = filter_assistant_messages(messages)

    final_text = get_final_text(data)
    final_tokens = tokenize(final_text)

    llm_text = " ".join(msg["text"] for msg in assistant_messages)
    llm_tokens = tokenize(llm_text)

    similarity_final_text_to_llm_text = cosine_similarity_from_tokens(final_tokens, llm_tokens)

    similarity_meets_threshold = (
        similarity_final_text_to_llm_text is not None
        and similarity_final_text_to_llm_text >= SIMILARITY_THRESHOLD
    )

    return {
        "participant_id": participant_id,
        "source_file": source_name,
        "similarity_final_text_to_llm_text": similarity_final_text_to_llm_text,
        "similarity_threshold": SIMILARITY_THRESHOLD,
        "meets_similarity_threshold": similarity_meets_threshold,
        "final_text_word_count": len(final_tokens),
        "llm_text_word_count": len(llm_tokens),
        "n_assistant_messages_used": len(assistant_messages),
        "include_initial_assistant_messages": INCLUDE_INITIAL_ASSISTANT_MESSAGES,
        "has_messages_field": "messages" in data,
        "has_editor_field": "editor" in data,
    }


def get_txt_data_files(data_dir: Path) -> List[Path]:
    if not data_dir.exists():
        print(f"Data folder not found: {data_dir}")
        return []

    files: List[Path] = []
    for pattern in ("*.txt", "*.json"):
        files.extend(sorted(data_dir.glob(pattern)))
    return files


def load_sessions_from_txt_files(data_dir: Path) -> List[Tuple[str, Dict[str, Any]]]:
    sessions: List[Tuple[str, Dict[str, Any]]] = []

    for path in get_txt_data_files(data_dir):
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
    skipped_without_process_data = 0

    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            continue
        normalized = normalize_downloaded_session(record, source_name=f"{path.name}:row{index}")
        if not normalized.get("messages") and not normalized.get("editor"):
            skipped_without_process_data += 1
        source_name = str(record.get("s3_key") or record.get("session_id") or f"{path.name}:row{index}")
        sessions.append((source_name, normalized))

    if skipped_without_process_data == len(sessions) and sessions:
        print(
            "Warning: This JSON file looks like a table-only export. "
            "Use the FULL JSON export so messages and text-editor progress are included."
        )

    return sessions


def load_sessions_from_full_csv(path: Path) -> List[Tuple[str, Dict[str, Any]]]:
    if not path.exists():
        print(f"CSV file not found: {path}")
        return []

    sessions: List[Tuple[str, Dict[str, Any]]] = []
    skipped_without_process_data = 0

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for index, record in enumerate(reader, start=1):
            normalized = normalize_downloaded_session(record, source_name=f"{path.name}:row{index}")
            if not normalized.get("messages") and not normalized.get("editor"):
                skipped_without_process_data += 1
            source_name = str(record.get("s3_key") or record.get("session_id") or f"{path.name}:row{index}")
            sessions.append((source_name, normalized))

    if skipped_without_process_data == len(sessions) and sessions:
        print(
            "Warning: This CSV file looks like a table-only export. "
            "Use the FULL CSV export so messages and text-editor progress are included."
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


def write_csv(rows: List[Dict[str, Any]], output_path: Path | str) -> None:
    if not rows:
        print("No rows to save.")
        return

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = list(rows[0].keys())
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


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

    for source_name, data in sessions:
        row = analyze_session_data(data, source_name=source_name)
        if row is not None:
            all_rows.append(row)

    write_csv(all_rows, OUTPUT_CSV)

    print("Indirect incorporation similarity analysis completed.")
    print(f"Data format: {DATA_FORMAT}")
    print(f"Processed sessions: {len(all_rows)}")
    print(f"Output CSV saved to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
