
from __future__ import annotations

import csv
import json
import re
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ------------------------------------------------------------
# Consultation Patterns
# ------------------------------------------------------------
# This script assumes the following folder structure:
#
# code_website/
#   CodeAnalysisData/
#       consultationPatterns.py   <-- this file
#   exampleDataFiles/
#       participant1.txt
#       participant2.txt
#       ...
#
# This file writes two CSV files to this folder:
#    CodeAnalysisData/consultation_summary_metrics.csv
#    CodeAnalysisData/consultation_event_metrics.csv
#
# Main goal:
# - analyze when and how often participants consult the LLM assistant
# - treat consultation as consultation episodes rather than counting
#   every user message separately
#
# Main outputs:
# - participant-level summary metrics:
#    * session_duration_min = total session duration in minutes
#    * total_consultation_episodes = number of LLM consultation episodes
#    * first_consultation_sec = time of the first LLM consultation, in seconds from page start
#    * consultations_per_minute = number of consultation episodes divided by session duration
#    * early_consultations = number of consultations in the first third of the session
#    * middle_consultations = number of consultations in the middle third of the session
#    * late_consultations = number of consultations in the final third of the session
#    * time_to_first_consultation_from_first_edit_sec = seconds from first edit to first LLM consultation
#    * time_to_first_consultation_from_chat_open_sec = seconds from first chat opening to first LLM consultation
#
# - event-level consultation metrics:
#    * consultation_start_ms = start time of the consultation episode, in ms from page start
#    * consultation_end_ms = end time of the consultation episode, in ms from page start
#    * consultation_duration_sec = duration of the consultation episode in seconds
#    * relative_task_position = consultation timing as a proportion of the full session duration
#    * task_stage_by_time = whether the consultation occurred early, middle, or late in the session
#    * words_written_so_far = number of words written before the consultation started
#    * final_word_count = number of words in the final editor snapshot
#    * proportion_of_final_text_written = proportion of the final text already written before consultation
#    * n_user_messages_in_episode = number of participant messages in the consultation episode
#    * n_assistant_messages_in_episode = number of LLM assistant messages in the consultation episode
#    * user_messages_joined = all participant messages in the episode combined into one field
#    * assistant_messages_joined = all LLM assistant messages in the episode combined into one field
#
# Definitions used here:
# - Consultation episode = one help-seeking exchange with the LLM,
#   potentially containing multiple user/assistant messages.
# - Early / middle / late stage = where the consultation falls in the
#   overall task based on its relative position in the session.
# - Short non-substantive messages (for example "thanks") can be ignored.
# ------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "exampleDataFiles"

SUMMARY_OUTPUT_CSV = SCRIPT_DIR / "consultation_summary_metrics.csv"
EVENT_OUTPUT_CSV = SCRIPT_DIR / "consultation_event_metrics.csv"

USER_SENDER_VALUES = {"user"}
ASSISTANT_SENDER_VALUES = {"llmassistant", "assistant", "ai", "model"}

# CONFIG YOU WILL EDIT
INCLUDE_INITIAL_ASSISTANT_MESSAGES = False

# CONFIG YOU WILL EDIT
PRESENT_MESSAGE_PHRASES_TO_IGNORE = [
    "present message",
    "this is the second message",
]

# CONFIG YOU WILL EDIT
NON_SUBSTANTIVE_USER_PATTERNS = [
    r"^\s*(thanks|thank you|thx|ok|okay|great|cool|nice|awesome|got it|perfect|sounds good)[!. ]*\s*$",
    r"^\s*(thanks|thank you).{0,20}\s*$",
]

# CONFIG YOU WILL EDIT
MIN_SUBSTANTIVE_USER_CHARS = 8

# CONFIG YOU WILL EDIT
EPISODE_GAP_MS = 60000

# CONFIG YOU WILL EDIT
MIN_EDITOR_SNAPSHOTS_BETWEEN_EPISODES = 3
MIN_WORD_CHANGE_BETWEEN_EPISODES = 5

def strip_html(html_text: str) -> str:
    if not html_text:
        return ""
    text = re.sub(r"<br\s*/?>", " ", html_text, flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def count_words(text: str) -> int:
    if not text:
        return 0
    return len(re.findall(r"\b\w+\b", text.lower()))


def safe_load_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Skipping {path.name}: could not read JSON ({e})")
        return None


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
            plain_text = strip_html(str(text))
            cleaned.append({
                "t_ms": int(t_ms),
                "text": plain_text,
                "word_count": count_words(plain_text),
            })

    cleaned.sort(key=lambda x: x["t_ms"])
    return cleaned


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


def get_chat_events(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    events = data.get("chatEvents", [])
    if not isinstance(events, list):
        return []

    cleaned: List[Dict[str, Any]] = []
    for item in events:
        if not isinstance(item, dict):
            continue
        t_ms = item.get("t_ms")
        event_type = item.get("type")
        if isinstance(t_ms, (int, float)) and isinstance(event_type, str):
            cleaned.append({
                "t_ms": int(t_ms),
                "type": event_type,
                "source": item.get("source"),
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


def filter_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    first_user_timestamp = get_first_user_timestamp(messages)
    filtered: List[Dict[str, Any]] = []

    for msg in messages:
        if msg["sender"] in ASSISTANT_SENDER_VALUES:
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
    window_snaps = [s for s in editor if start_ms < s["t_ms"] <= end_ms]
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
    current_has_assistant: bool,
) -> bool:
    if current_last_message_ts is None:
        return False

    gap_ms = next_user_ts - current_last_message_ts
    if gap_ms >= EPISODE_GAP_MS:
        return True

    if current_has_assistant:
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
    filtered_messages = filter_messages(messages)
    episodes: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for msg in filtered_messages:
        sender = msg["sender"]
        timestamp = msg["timestamp"]
        text = msg["text"]

        is_user = sender in USER_SENDER_VALUES
        is_assistant = sender in ASSISTANT_SENDER_VALUES

        if not (is_user or is_assistant):
            continue

        if current is not None and is_user:
            if should_start_new_episode(
                next_user_ts=timestamp,
                current_last_message_ts=current["last_message_ts"],
                editor=editor,
                current_has_assistant=current["n_assistant_messages"] > 0,
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
                    "first_user_message_ms": timestamp,
                    "last_message_ts": timestamp,
                    "n_user_messages": 1,
                    "n_assistant_messages": 0,
                    "user_messages": [text],
                    "assistant_messages": [],
                }
            continue

        if is_user:
            current["n_user_messages"] += 1
            current["user_messages"].append(text)
        elif is_assistant and current["n_user_messages"] > 0:
            current["n_assistant_messages"] += 1
            current["assistant_messages"].append(text)

        current["last_message_ts"] = timestamp
        current["episode_end_ms"] = max(current["episode_end_ms"], timestamp)

    if current is not None:
        episodes.append(current)

    return episodes


def get_session_end_ms(
    editor: List[Dict[str, Any]],
    messages: List[Dict[str, Any]],
    chat_events: List[Dict[str, Any]],
    submit_clicks: List[Any],
) -> Optional[int]:
    timestamps: List[int] = []
    timestamps.extend([x["t_ms"] for x in editor])
    timestamps.extend([x["timestamp"] for x in messages])
    timestamps.extend([x["t_ms"] for x in chat_events])

    for ts in submit_clicks:
        if isinstance(ts, (int, float)):
            timestamps.append(int(ts))

    return max(timestamps) if timestamps else None


def get_first_editor_time(editor: List[Dict[str, Any]]) -> Optional[int]:
    return editor[0]["t_ms"] if editor else None


def get_first_chat_open_time(data: Dict[str, Any], chat_events: List[Dict[str, Any]]) -> Optional[int]:
    candidates: List[int] = []

    button_pressed = data.get("ButtonPressed")
    if isinstance(button_pressed, (int, float)):
        candidates.append(int(button_pressed))

    for event in chat_events:
        if event["type"] in {"chat_open", "chat_expand"}:
            candidates.append(event["t_ms"])

    return min(candidates) if candidates else None


def classify_relative_stage(relative_position: Optional[float]) -> Optional[str]:
    if relative_position is None:
        return None
    if relative_position < 1 / 3:
        return "early"
    if relative_position < 2 / 3:
        return "middle"
    return "late"


def get_final_word_count(editor: List[Dict[str, Any]]) -> int:
    if not editor:
        return 0
    return editor[-1]["word_count"]


def write_csv(rows: List[Dict[str, Any]], output_path: Path | str) -> None:
    if not rows:
        print(f"No rows to save for {output_path}.")
        return

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = list(rows[0].keys())
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def analyze_file(path: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    data = safe_load_json(path)
    if data is None:
        return {}, []

    editor = get_editor_snapshots(data)
    messages = get_messages(data)
    chat_events = get_chat_events(data)
    submit_clicks = data.get("TimeStampOfSubmitClicks", [])
    if not isinstance(submit_clicks, list):
        submit_clicks = []

    participant_id = str(data.get("id", path.stem))
    episodes = build_consultation_episodes(messages, editor)

    session_end_ms = get_session_end_ms(editor, messages, chat_events, submit_clicks)
    first_editor_ms = get_first_editor_time(editor)
    first_chat_open_ms = get_first_chat_open_time(data, chat_events)
    final_word_count = get_final_word_count(editor)

    session_duration_min = (
        session_end_ms / 60000
        if isinstance(session_end_ms, int) and session_end_ms > 0
        else None
    )
    consultations_per_min = (
        len(episodes) / session_duration_min
        if session_duration_min not in (None, 0)
        else None
    )

    early_count = 0
    middle_count = 0
    late_count = 0

    event_rows: List[Dict[str, Any]] = []

    for i, episode in enumerate(episodes, start=1):
        consultation_start_ms = episode["episode_start_ms"]
        consultation_end_ms = episode["episode_end_ms"]

        relative_task_position = (
            consultation_start_ms / session_end_ms
            if isinstance(session_end_ms, int) and session_end_ms > 0
            else None
        )
        task_stage = classify_relative_stage(relative_task_position)
        if task_stage == "early":
            early_count += 1
        elif task_stage == "middle":
            middle_count += 1
        elif task_stage == "late":
            late_count += 1

        latest_snapshot = get_latest_editor_snapshot_before_or_at(consultation_start_ms, editor)
        words_written_so_far = latest_snapshot["word_count"] if latest_snapshot else 0
        proportion_of_final_text_written = (
            words_written_so_far / final_word_count
            if final_word_count > 0
            else None
        )

        time_since_first_edit_sec = (
            (consultation_start_ms - first_editor_ms) / 1000
            if first_editor_ms is not None
            else None
        )
        time_since_first_chat_open_sec = (
            (consultation_start_ms - first_chat_open_ms) / 1000
            if first_chat_open_ms is not None
            else None
        )

        event_rows.append({
            "participant_id": participant_id,
            "source_file": path.name,
            "consultation_number": i,
            "consultation_start_ms": consultation_start_ms,
            "consultation_end_ms": consultation_end_ms,
            "consultation_duration_sec": round((consultation_end_ms - consultation_start_ms) / 1000, 3),
            "consultation_start_sec": round(consultation_start_ms / 1000, 3),
            "task_stage_by_time": task_stage,
            "relative_task_position": round(relative_task_position, 4) if relative_task_position is not None else None,
            "words_written_so_far": words_written_so_far,
            "final_word_count": final_word_count,
            "proportion_of_final_text_written": round(proportion_of_final_text_written, 4) if proportion_of_final_text_written is not None else None,
            "time_since_first_edit_sec": round(time_since_first_edit_sec, 3) if time_since_first_edit_sec is not None else None,
            "time_since_first_chat_open_sec": round(time_since_first_chat_open_sec, 3) if time_since_first_chat_open_sec is not None else None,
            "n_user_messages_in_episode": episode["n_user_messages"],
            "n_assistant_messages_in_episode": episode["n_assistant_messages"],
            "user_messages_joined": " || ".join(episode["user_messages"]),
            "assistant_messages_joined": " || ".join(episode["assistant_messages"]),
        })

    first_consultation_ms = episodes[0]["episode_start_ms"] if episodes else None
    first_consultation_sec = (
        round(first_consultation_ms / 1000, 3)
        if first_consultation_ms is not None
        else None
    )
    time_to_first_consultation_from_first_edit_sec = (
        (first_consultation_ms - first_editor_ms) / 1000
        if first_consultation_ms is not None and first_editor_ms is not None
        else None
    )
    time_to_first_consultation_from_chat_open_sec = (
        (first_consultation_ms - first_chat_open_ms) / 1000
        if first_consultation_ms is not None and first_chat_open_ms is not None
        else None
    )

    summary_row = {
        "participant_id": participant_id,
        "source_file": path.name,
        "session_duration_min": round(session_duration_min, 4) if session_duration_min is not None else None,
        "total_consultation_episodes": len(episodes),
        "first_consultation_sec": first_consultation_sec,
        "consultations_per_minute": round(consultations_per_min, 4) if consultations_per_min is not None else None,
        "early_consultations": early_count,
        "middle_consultations": middle_count,
        "late_consultations": late_count,
        "time_to_first_consultation_from_first_edit_sec": round(time_to_first_consultation_from_first_edit_sec, 3) if time_to_first_consultation_from_first_edit_sec is not None else None,
        "time_to_first_consultation_from_chat_open_sec": round(time_to_first_consultation_from_chat_open_sec, 3) if time_to_first_consultation_from_chat_open_sec is not None else None,
        "has_messages_field": "messages" in data,
        "has_chatEvents_field": "chatEvents" in data,
        "has_editor_field": "editor" in data,
    }

    return summary_row, event_rows


def get_data_files(data_dir: Path) -> List[Path]:
    if not data_dir.exists():
        print(f"Data folder not found: {data_dir}")
        return []

    files: List[Path] = []
    for pattern in ("*.txt", "*.json"):
        files.extend(sorted(data_dir.glob(pattern)))
    return files


def main() -> None:
    files = get_data_files(DATA_DIR)

    if not files:
        print("No data files found.")
        print(f"Expected files inside: {DATA_DIR}")
        return

    all_summary_rows: List[Dict[str, Any]] = []
    all_event_rows: List[Dict[str, Any]] = []

    for path in files:
        summary_row, event_rows = analyze_file(path)
        if summary_row:
            all_summary_rows.append(summary_row)
        all_event_rows.extend(event_rows)

    write_csv(all_summary_rows, SUMMARY_OUTPUT_CSV)
    write_csv(all_event_rows, EVENT_OUTPUT_CSV)

    print("Consultation frequency and timing analysis completed.")
    print(f"Processed files: {len(files)}")
    print(f"Summary CSV saved to: {SUMMARY_OUTPUT_CSV}")
    print(f"Event-level CSV saved to: {EVENT_OUTPUT_CSV}")


if __name__ == "__main__":
    main()
