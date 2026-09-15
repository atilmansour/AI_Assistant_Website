from __future__ import annotations

import csv
import json
import re
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ------------------------------------------------------------
# Large paste detection with LLM-overlap check
# ------------------------------------------------------------
# Folder structure assumed:
#
# code_website/
#   CodeAnalysisData/
#       large_paste_without_llm_overlap.py   <-- place this file here
#   exampleDataFiles/
#       sessions_full.csv
#       sessions_full.json
#       participant1.txt
#       participant2.txt
#       ...
#
# Outputs:
#   1. large_paste_events.csv
#   2. large_paste_summary.csv
#
# Main idea:
# - Look at consecutive text-editor snapshots.
# - Detect a "large paste" when many words appear in one editor update.
# - Compare the newly inserted text against LLM assistant responses.
# - Mark whether the inserted text overlaps with LLM output.
#
# A paste is counted as "not from LLM" only when:
#   (a) many words were inserted in one editor transition
#   (b) the inserted text does not have substantial literal overlap with
#       assistant messages
#
# Notes:
# - This detects sudden insertion events from saved editor snapshots. It cannot
#   know the user's clipboard source directly.
# - The LLM overlap check is literal/near-literal. Paraphrases will not always
#   be detected.
# ------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent if (SCRIPT_DIR.parent / "exampleDataFiles").exists() else SCRIPT_DIR

# CONFIG YOU WILL EDIT
# Options:
#   "TXTFILES"  = a folder containing one .txt/.json file per participant/session
#   "FULL_JSON" = the full JSON export from the admin panel
#   "FULL_CSV"  = the full CSV export from the admin panel
DATA_FORMAT = "FULL_CSV"

# CONFIG YOU WILL EDIT
TXT_DATA_DIR = PROJECT_DIR / "exampleDataFiles"
FULL_JSON_PATH = PROJECT_DIR / "exampleDataFiles" / "sessions_full.json"
FULL_CSV_PATH = PROJECT_DIR / "exampleDataFiles" / "sessions_full.csv"

EVENTS_OUTPUT_CSV = SCRIPT_DIR / "large_paste_events.csv"
SUMMARY_OUTPUT_CSV = SCRIPT_DIR / "large_paste_summary.csv"

USER_SENDER_VALUES = {"user"}
ASSISTANT_SENDER_VALUES = {"llmassistant", "assistant", "ai", "model", "chatbot"}

# CONFIG YOU WILL EDIT:
# Minimum size for an insertion to be treated as a paste-like event.
MIN_PASTE_WORDS = 60
MIN_PASTE_CHARS = 500

# CONFIG YOU WILL EDIT:
# Optional timing rule for between-snapshot insertions. Large growth across a
# long snapshot gap is often ordinary writing that was saved late, not a paste.
MAX_PASTE_TRANSITION_MS: Optional[int] = 5000

# CONFIG YOU WILL EDIT:
# Flag files where the only editor snapshot is already a long text. This catches
# cases where the final text appears all at once, with no incremental typing
# evidence in the editor log.
DETECT_SINGLE_SNAPSHOT_LARGE_TEXT = True

# CONFIG YOU WILL EDIT:
# If True, compare pasted text only with assistant messages sent before the paste.
# This is usually safest for causal interpretation.
ONLY_CHECK_PRIOR_ASSISTANT_MESSAGES = True

# CONFIG YOU WILL EDIT:
# Inserted text is marked as overlapping LLM output when either threshold is met.
MIN_LLM_OVERLAP_WORDS = 8
MIN_LLM_OVERLAP_RATIO = 0.70

# CONFIG YOU WILL EDIT:
# If False, assistant messages before the first user message are excluded.
INCLUDE_INITIAL_ASSISTANT_MESSAGES = False

# CONFIG YOU WILL EDIT:
# Add phrases here if you want to ignore known present/welcome messages by content.
PRESENT_MESSAGE_PHRASES_TO_IGNORE = [
    "present message",
    "this is the second message",
]

# CONFIG YOU WILL EDIT:
# Text previews saved to CSV are shortened to this many characters.
PREVIEW_CHARS = 250


def strip_html(html_text: str) -> str:
    if not html_text:
        return ""
    text = re.sub(r"<[^>]+>", " ", html_text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def preview(text: str, max_chars: int = PREVIEW_CHARS) -> str:
    text = normalize_space(text)
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def tokenize(text: str) -> List[str]:
    if not text:
        return []
    return re.findall(r"\b\w+\b", text.lower())


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


def safe_load_json(path: Path) -> Optional[Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Skipping {path.name}: could not read JSON ({e})")
        return None


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


def stem_without_txt(value: Any, fallback: str = "") -> str:
    text = str(value or fallback or "").strip()
    if text.lower().endswith(".txt"):
        return text[:-4]
    return text


def normalize_downloaded_session(record: Dict[str, Any], source_name: str) -> Dict[str, Any]:
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
        sender = item.get("sender")
        text = item.get("text", "")

        if timestamp is not None and isinstance(sender, str):
            cleaned.append(
                {
                    "timestamp": int(timestamp),
                    "sender": sender.strip().lower(),
                    "text": str(text),
                }
            )

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
        text = item.get("text", "")

        if t_ms is not None:
            cleaned.append(
                {
                    "t_ms": int(t_ms),
                    "text": strip_html(str(text)),
                }
            )

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


def extract_inserted_text(previous_text: str, current_text: str) -> str:
    """
    Return the text that appeared between two editor snapshots.

    This assumes each snapshot transition is mostly one editing action, which is
    how text-editor progress logs are usually saved. If a user edits multiple
    separate regions between two snapshots, the returned text may include some
    surrounding changed content.
    """
    previous_text = previous_text or ""
    current_text = current_text or ""

    if len(current_text) <= len(previous_text):
        return ""

    prefix_len = 0
    max_prefix_len = min(len(previous_text), len(current_text))
    while prefix_len < max_prefix_len:
        if previous_text[prefix_len] != current_text[prefix_len]:
            break
        prefix_len += 1

    previous_suffix_index = len(previous_text)
    current_suffix_index = len(current_text)
    while previous_suffix_index > prefix_len and current_suffix_index > prefix_len:
        if previous_text[previous_suffix_index - 1] != current_text[current_suffix_index - 1]:
            break
        previous_suffix_index -= 1
        current_suffix_index -= 1

    return current_text[prefix_len:current_suffix_index]


def longest_common_token_span(
    inserted_tokens: List[str],
    assistant_tokens: List[str],
) -> Tuple[int, int, int]:
    """
    Returns:
    - longest overlap length
    - start index in inserted_tokens
    - start index in assistant_tokens
    """
    if not inserted_tokens or not assistant_tokens:
        return 0, -1, -1

    previous_row = [0] * (len(assistant_tokens) + 1)
    best_len = 0
    best_inserted_end = 0
    best_assistant_end = 0

    for i, inserted_token in enumerate(inserted_tokens, start=1):
        current_row = [0] * (len(assistant_tokens) + 1)
        for j, assistant_token in enumerate(assistant_tokens, start=1):
            if inserted_token == assistant_token:
                current_row[j] = previous_row[j - 1] + 1
                if current_row[j] > best_len:
                    best_len = current_row[j]
                    best_inserted_end = i
                    best_assistant_end = j
        previous_row = current_row

    return (
        best_len,
        best_inserted_end - best_len,
        best_assistant_end - best_len,
    )


def find_best_llm_overlap(
    inserted_text: str,
    assistant_messages: List[Dict[str, Any]],
    paste_time_ms: int,
) -> Dict[str, Any]:
    inserted_tokens = tokenize(inserted_text)

    best: Dict[str, Any] = {
        "longest_llm_overlap_n_words": 0,
        "longest_llm_overlap_ratio": 0.0,
        "longest_llm_overlap_text": "",
        "overlap_assistant_timestamp": "",
        "overlap_assistant_preview": "",
    }

    if not inserted_tokens:
        return best

    for msg in assistant_messages:
        if ONLY_CHECK_PRIOR_ASSISTANT_MESSAGES and msg["timestamp"] >= paste_time_ms:
            continue

        assistant_tokens = tokenize(msg["text"])
        overlap_len, inserted_start, _assistant_start = longest_common_token_span(
            inserted_tokens=inserted_tokens,
            assistant_tokens=assistant_tokens,
        )

        if overlap_len > best["longest_llm_overlap_n_words"]:
            overlap_text = " ".join(inserted_tokens[inserted_start: inserted_start + overlap_len])
            best = {
                "longest_llm_overlap_n_words": overlap_len,
                "longest_llm_overlap_ratio": round(overlap_len / len(inserted_tokens), 4),
                "longest_llm_overlap_text": overlap_text,
                "overlap_assistant_timestamp": msg["timestamp"],
                "overlap_assistant_preview": preview(msg["text"]),
            }

    return best


def detect_large_paste_events(
    participant_id: str,
    source_name: str,
    editor_snapshots: List[Dict[str, Any]],
    assistant_messages: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []

    if DETECT_SINGLE_SNAPSHOT_LARGE_TEXT and len(editor_snapshots) == 1:
        only_snapshot = editor_snapshots[0]
        inserted_text = only_snapshot["text"]
        inserted_tokens = tokenize(inserted_text)

        if (
            len(inserted_tokens) >= MIN_PASTE_WORDS
            and len(normalize_space(inserted_text)) >= MIN_PASTE_CHARS
        ):
            overlap = find_best_llm_overlap(
                inserted_text=inserted_text,
                assistant_messages=assistant_messages,
                paste_time_ms=only_snapshot["t_ms"],
            )
            overlap_words = int(overlap["longest_llm_overlap_n_words"])
            overlap_ratio = float(overlap["longest_llm_overlap_ratio"])
            has_llm_overlap = (
                overlap_words >= MIN_LLM_OVERLAP_WORDS
                or overlap_ratio >= MIN_LLM_OVERLAP_RATIO
            )

            events.append(
                {
                    "participant_id": participant_id,
                    "source_file": source_name,
                    "paste_event_index": 1,
                    "event_type": "single_snapshot_large_text",
                    "previous_t_ms": "",
                    "paste_t_ms": only_snapshot["t_ms"],
                    "transition_ms": "",
                    "inserted_word_count": len(inserted_tokens),
                    "inserted_char_count": len(normalize_space(inserted_text)),
                    "inserted_text_preview": preview(inserted_text),
                    "has_llm_overlap": has_llm_overlap,
                    "likely_non_llm_large_paste": not has_llm_overlap,
                    **overlap,
                }
            )

        return events

    for previous_snapshot, current_snapshot in zip(editor_snapshots, editor_snapshots[1:]):
        previous_text = previous_snapshot["text"]
        current_text = current_snapshot["text"]
        inserted_text = extract_inserted_text(previous_text, current_text)
        inserted_tokens = tokenize(inserted_text)
        transition_ms = current_snapshot["t_ms"] - previous_snapshot["t_ms"]

        if MAX_PASTE_TRANSITION_MS is not None and transition_ms > MAX_PASTE_TRANSITION_MS:
            continue

        if len(inserted_tokens) < MIN_PASTE_WORDS:
            continue

        if len(normalize_space(inserted_text)) < MIN_PASTE_CHARS:
            continue

        overlap = find_best_llm_overlap(
            inserted_text=inserted_text,
            assistant_messages=assistant_messages,
            paste_time_ms=current_snapshot["t_ms"],
        )
        overlap_words = int(overlap["longest_llm_overlap_n_words"])
        overlap_ratio = float(overlap["longest_llm_overlap_ratio"])
        has_llm_overlap = (
            overlap_words >= MIN_LLM_OVERLAP_WORDS
            or overlap_ratio >= MIN_LLM_OVERLAP_RATIO
        )

        event_index = len(events) + 1
        events.append(
            {
                "participant_id": participant_id,
                "source_file": source_name,
                "paste_event_index": event_index,
                "event_type": "between_snapshots_large_insertion",
                "previous_t_ms": previous_snapshot["t_ms"],
                "paste_t_ms": current_snapshot["t_ms"],
                "transition_ms": transition_ms,
                "inserted_word_count": len(inserted_tokens),
                "inserted_char_count": len(normalize_space(inserted_text)),
                "inserted_text_preview": preview(inserted_text),
                "has_llm_overlap": has_llm_overlap,
                "likely_non_llm_large_paste": not has_llm_overlap,
                **overlap,
            }
        )

    return events


def summarize_session_events(
    participant_id: str,
    source_name: str,
    editor_snapshots: List[Dict[str, Any]],
    assistant_messages: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    non_llm_events = [event for event in events if event["likely_non_llm_large_paste"]]
    llm_overlap_events = [event for event in events if event["has_llm_overlap"]]

    return {
        "participant_id": participant_id,
        "source_file": source_name,
        "n_large_paste_events": len(events),
        "n_large_paste_events_with_llm_overlap": len(llm_overlap_events),
        "n_large_paste_events_without_llm_overlap": len(non_llm_events),
        "total_large_paste_words": sum(int(event["inserted_word_count"]) for event in events),
        "total_non_llm_large_paste_words": sum(
            int(event["inserted_word_count"]) for event in non_llm_events
        ),
        "max_large_paste_words": max(
            (int(event["inserted_word_count"]) for event in events),
            default=0,
        ),
        "max_non_llm_large_paste_words": max(
            (int(event["inserted_word_count"]) for event in non_llm_events),
            default=0,
        ),
        "n_editor_snapshots": len(editor_snapshots),
        "n_assistant_messages_used": len(assistant_messages),
        "min_paste_words": MIN_PASTE_WORDS,
        "min_paste_chars": MIN_PASTE_CHARS,
        "max_paste_transition_ms": MAX_PASTE_TRANSITION_MS,
        "detect_single_snapshot_large_text": DETECT_SINGLE_SNAPSHOT_LARGE_TEXT,
        "only_check_prior_assistant_messages": ONLY_CHECK_PRIOR_ASSISTANT_MESSAGES,
        "min_llm_overlap_words": MIN_LLM_OVERLAP_WORDS,
        "min_llm_overlap_ratio": MIN_LLM_OVERLAP_RATIO,
        "include_initial_assistant_messages": INCLUDE_INITIAL_ASSISTANT_MESSAGES,
    }


def analyze_session_data(
    data: Dict[str, Any],
    source_name: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    participant_id = str(data.get("id", Path(source_name).stem))
    messages = get_messages(data)
    editor_snapshots = get_editor_snapshots(data)
    assistant_messages = filter_assistant_messages(messages)

    if not editor_snapshots:
        print(f"Skipping {source_name}: no editor/text-editor progress data found.")
        return [], summarize_session_events(
            participant_id=participant_id,
            source_name=source_name,
            editor_snapshots=[],
            assistant_messages=assistant_messages,
            events=[],
        )

    events = detect_large_paste_events(
        participant_id=participant_id,
        source_name=source_name,
        editor_snapshots=editor_snapshots,
        assistant_messages=assistant_messages,
    )
    summary = summarize_session_events(
        participant_id=participant_id,
        source_name=source_name,
        editor_snapshots=editor_snapshots,
        assistant_messages=assistant_messages,
        events=events,
    )

    return events, summary


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
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not rows:
        print(f"No rows to save for {output_path.name}.")
        return

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

    all_events: List[Dict[str, Any]] = []
    all_summaries: List[Dict[str, Any]] = []

    for source_name, data in sessions:
        events, summary = analyze_session_data(data, source_name=source_name)
        all_events.extend(events)
        all_summaries.append(summary)

    write_csv(all_events, EVENTS_OUTPUT_CSV)
    write_csv(all_summaries, SUMMARY_OUTPUT_CSV)

    print("Large paste analysis completed.")
    print(f"Data format: {DATA_FORMAT}")
    print(f"Processed sessions: {len(all_summaries)}")
    print(f"Large paste events found: {len(all_events)}")
    print(f"Event CSV saved to: {EVENTS_OUTPUT_CSV}")
    print(f"Summary CSV saved to: {SUMMARY_OUTPUT_CSV}")


if __name__ == "__main__":
    main()
