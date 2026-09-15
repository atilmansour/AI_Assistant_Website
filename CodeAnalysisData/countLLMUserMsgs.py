from __future__ import annotations

import csv
import json
import re
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ------------------------------------------------------------
# User/LLM message counts and interaction rounds
# ------------------------------------------------------------
# Folder structure assumed:
#
# code_website/
#   CodeAnalysisData/
#       count_llm_user_messages.py   <-- place this file here
#   exampleDataFiles/
#       participant1.txt
#       participant2.txt
#       ...
#
# Output:
#   1. message_counts.csv
#
# Main idea:
# - Count participant messages and LLM assistant messages.
# - Count simple exchange rounds:
#     one user message followed by at least one LLM response = 1 round.
# - Count continued rounds:
#     grouped consultation episodes, where multiple user/LLM messages can
#     belong to the same continued interaction if they happen close together.
#
# Main outputs:
# - participant_id = participant/session identifier
# - source_file = name of the data file analyzed
# - user_message_count = participant messages after initial/present-message filtering
# - llm_message_count = LLM messages after initial/present-message filtering
# - total_user_llm_messages = user_message_count + llm_message_count
# - exchange_rounds = simple user-to-LLM reply rounds
# - continued_rounds = grouped consultation episodes using timing/editor activity
# - raw_user_message_count = user messages before filtering
# - raw_llm_message_count = LLM messages before filtering
# - n_editor_snapshots = number of text-editor snapshots found
#
# Definitions:
# - exchange_rounds:
#     Count every user message that receives at least one later LLM response
#     before the next user message.
# - continued_rounds:
#     Count broader consultation episodes. A new episode starts after a large
#     time gap, or after meaningful editor activity, matching the consultation
#     pattern logic used in the fuller timing script.
#
# ------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent if (SCRIPT_DIR.parent / "exampleDataFiles").exists() else SCRIPT_DIR

# CONFIG YOU WILL EDIT
# Choose the data download format you want this script to read.
# Options:
#   "TXTFILES"  = a folder containing one .txt/.json file per participant/session
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

# CONFIG YOU WILL EDIT
# Output file saved by this script.
OUTPUT_CSV = SCRIPT_DIR / "message_counts.csv"

# CONFIG YOU WILL EDIT
# Sender labels treated as participant messages.
USER_SENDER_VALUES = {"user", "participant"}

# CONFIG YOU WILL EDIT
# Sender labels treated as LLM assistant messages.
LLM_SENDER_VALUES = {"chatbot", "llmassistant", "assistant", "ai", "model"}

# CONFIG YOU WILL EDIT
# If False, assistant messages before the first user message are excluded.
INCLUDE_INITIAL_ASSISTANT_MESSAGES = False

# CONFIG YOU WILL EDIT
# Add phrases here if you want to ignore known present/welcome messages by content.
PRESENT_MESSAGE_PHRASES_TO_IGNORE = [
    "present message",
    "this is the second message",
    "Hello! I'm your LLM",
]

# CONFIG YOU WILL EDIT
# User messages matching these patterns are not counted as substantive when
# deciding whether a new continued_round should start.
NON_SUBSTANTIVE_USER_PATTERNS = [
    r"^\s*(thanks|thank you|thx|ok|okay|great|cool|nice|awesome|got it|perfect|sounds good)[!. ]*\s*$",
    r"^\s*(thanks|thank you).{0,20}\s*$",
]

# CONFIG YOU WILL EDIT
# Minimum characters for a user message to start or continue a substantive
# consultation episode.
MIN_SUBSTANTIVE_USER_CHARS = 8

# CONFIG YOU WILL EDIT
# If the gap between LLM/user interaction messages is this large, start a new
# continued_round.
EPISODE_GAP_MS = 60000

# CONFIG YOU WILL EDIT
# If enough editor activity happens between messages, start a new continued_round
# even when the time gap is short.
MIN_EDITOR_SNAPSHOTS_BETWEEN_EPISODES = 3
MIN_WORD_CHANGE_BETWEEN_EPISODES = 5


def safe_load_json(path: Path) -> Dict[str, Any] | None:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Skipping {path.name}: could not read JSON ({e})")
        return None

    if not isinstance(data, dict):
        print(f"Skipping {path.name}: expected a JSON object.")
        return None

    return data


def parse_json_field(value: Any, default: Any = None) -> Any:
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


def normalize_sender(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "")


def stem_without_txt(value: Any, fallback: str = "") -> str:
    text = str(value or fallback or "").strip()
    if text.lower().endswith(".txt"):
        return text[:-4]
    return text


def strip_html(html_text: str) -> str:
    if not html_text:
        return ""
    text = re.sub(r"<br\s*/?>", " ", html_text, flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = text.replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def count_words(text: str) -> int:
    if not text:
        return 0
    return len(re.findall(r"\b\w+\b", text.lower()))


def timestamp_to_ms(value: Any) -> Optional[int]:
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value or "").strip()
    if not text:
        return None

    if re.fullmatch(r"\d+(\.\d+)?", text):
        return int(float(text))

    match = re.fullmatch(
        r"(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?\s*([AP]M)?",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None

    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = int(match.group(3) or 0)
    milliseconds = int((match.group(4) or "0").ljust(3, "0")[:3])
    am_pm = (match.group(5) or "").upper()

    if am_pm == "AM" and hours == 12:
        hours = 0
    elif am_pm == "PM" and hours != 12:
        hours += 12

    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds


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

        timestamp = timestamp_to_ms(item.get("timestamp"))
        sender = normalize_sender(item.get("sender"))
        text = str(item.get("text", ""))

        if timestamp is None or not sender:
            continue

        cleaned.append({
            "timestamp": timestamp,
            "sender": sender,
            "text": text,
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

        t_ms = timestamp_to_ms(item.get("t_ms"))
        if t_ms is None:
            t_ms = timestamp_to_ms(item.get("timestamp"))

        if t_ms is None:
            continue

        plain_text = strip_html(str(item.get("text", "")))
        cleaned.append({
            "t_ms": t_ms,
            "text": plain_text,
            "word_count": count_words(plain_text),
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


def filter_messages_for_interactions(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    first_user_timestamp = get_first_user_timestamp(messages)
    filtered: List[Dict[str, Any]] = []

    for msg in messages:
        if msg["sender"] in LLM_SENDER_VALUES:
            if not INCLUDE_INITIAL_ASSISTANT_MESSAGES and first_user_timestamp is not None:
                if msg["timestamp"] < first_user_timestamp:
                    continue
            if is_present_message_by_content(msg["text"]):
                continue

        filtered.append(msg)

    return filtered


def is_substantive_user_message(text: str) -> bool:
    plain = strip_html(text).lower().strip()
    if len(plain) < MIN_SUBSTANTIVE_USER_CHARS:
        return False
    return not any(re.match(pattern, plain) for pattern in NON_SUBSTANTIVE_USER_PATTERNS)


def get_latest_editor_snapshot_before_or_at(
    target_ms: int,
    editor: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    latest = None
    for snap in editor:
        if snap["t_ms"] <= target_ms:
            latest = snap
        else:
            break
    return latest


def editor_activity_between(
    start_ms: int,
    end_ms: int,
    editor: List[Dict[str, Any]],
) -> Dict[str, int]:
    window_snaps = [snap for snap in editor if start_ms < snap["t_ms"] <= end_ms]
    before_snap = get_latest_editor_snapshot_before_or_at(start_ms, editor)

    start_word_count = before_snap["word_count"] if before_snap else 0
    end_word_count = window_snaps[-1]["word_count"] if window_snaps else start_word_count

    return {
        "n_snapshots": len(window_snaps),
        "net_word_change": end_word_count - start_word_count,
    }


def should_start_new_episode(
    next_user_ts: int,
    current_last_message_ts: Optional[int],
    editor: List[Dict[str, Any]],
    current_has_llm: bool,
) -> bool:
    if current_last_message_ts is None:
        return False

    gap_ms = next_user_ts - current_last_message_ts
    if gap_ms >= EPISODE_GAP_MS:
        return True

    if current_has_llm:
        activity = editor_activity_between(
            start_ms=current_last_message_ts,
            end_ms=next_user_ts,
            editor=editor,
        )
        if activity["n_snapshots"] >= MIN_EDITOR_SNAPSHOTS_BETWEEN_EPISODES:
            return True
        if abs(activity["net_word_change"]) >= MIN_WORD_CHANGE_BETWEEN_EPISODES:
            return True

    return False


def build_consultation_episodes(
    messages: List[Dict[str, Any]],
    editor: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Same episode logic as the consultation-patterns script:
    a consultation episode starts with a substantive user message and can contain
    multiple user/LLM messages unless enough time or editor activity separates
    them.
    """
    filtered_messages = filter_messages_for_interactions(messages)
    episodes: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for msg in filtered_messages:
        sender = msg["sender"]
        timestamp = msg["timestamp"]
        text = msg["text"]

        is_user = sender in USER_SENDER_VALUES
        is_llm = sender in LLM_SENDER_VALUES

        if not (is_user or is_llm):
            continue

        if current is not None and is_user:
            if should_start_new_episode(
                next_user_ts=timestamp,
                current_last_message_ts=current["last_message_ts"],
                editor=editor,
                current_has_llm=current["n_llm_messages"] > 0,
            ):
                episodes.append(current)
                current = None

        if is_user and not is_substantive_user_message(text):
            continue

        if current is None:
            if is_user:
                current = {
                    "episode_start_ms": timestamp,
                    "episode_end_ms": timestamp,
                    "last_message_ts": timestamp,
                    "n_user_messages": 1,
                    "n_llm_messages": 0,
                }
            continue

        if is_user:
            current["n_user_messages"] += 1
        elif is_llm and current["n_user_messages"] > 0:
            current["n_llm_messages"] += 1

        current["last_message_ts"] = timestamp
        current["episode_end_ms"] = max(current["episode_end_ms"], timestamp)

    if current is not None:
        episodes.append(current)

    return episodes


def count_paired_user_llm_rounds(messages: List[Dict[str, Any]]) -> int:
    """
    Old/simple definition: count every user message that receives at least one
    later LLM response before the next user message.
    """
    rounds = 0
    waiting_for_llm = False

    for msg in filter_messages_for_interactions(messages):
        sender = msg["sender"]

        if sender in USER_SENDER_VALUES:
            waiting_for_llm = True
        elif sender in LLM_SENDER_VALUES and waiting_for_llm:
            rounds += 1
            waiting_for_llm = False

    return rounds


def analyze_session_data(data: Dict[str, Any], source_name: str) -> Dict[str, Any] | None:
    messages = get_messages(data)
    editor = get_editor_snapshots(data)
    filtered_messages = filter_messages_for_interactions(messages)

    raw_user_messages = [
        msg for msg in messages if msg["sender"] in USER_SENDER_VALUES
    ]
    raw_llm_messages = [
        msg for msg in messages if msg["sender"] in LLM_SENDER_VALUES
    ]
    interaction_user_messages = [
        msg for msg in filtered_messages if msg["sender"] in USER_SENDER_VALUES
    ]
    interaction_llm_messages = [
        msg for msg in filtered_messages if msg["sender"] in LLM_SENDER_VALUES
    ]

    episodes = build_consultation_episodes(messages, editor)
    paired_rounds = count_paired_user_llm_rounds(messages)
    participant_id = str(data.get("id") or Path(source_name).stem)

    return {
        "participant_id": participant_id,
        "source_file": source_name,
        "user_message_count": len(interaction_user_messages),
        "llm_message_count": len(interaction_llm_messages),
        "total_user_llm_messages": len(interaction_user_messages) + len(interaction_llm_messages),
        "exchange_rounds": paired_rounds,
        "continued_rounds": len(episodes),
        "raw_user_message_count": len(raw_user_messages),
        "raw_llm_message_count": len(raw_llm_messages),
        "n_editor_snapshots": len(editor),
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


def write_csv(rows: List[Dict[str, Any]], output_path: Path) -> None:
    if not rows:
        print("No rows to save.")
        return

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

    rows: List[Dict[str, Any]] = []

    for source_name, data in sessions:
        row = analyze_session_data(data, source_name=source_name)
        if row is not None:
            rows.append(row)

    write_csv(rows, OUTPUT_CSV)

    print("Message count analysis completed.")
    print(f"Data format: {DATA_FORMAT}")
    print(f"Processed sessions: {len(rows)}")
    print(f"Output CSV saved to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()

