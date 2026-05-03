
from __future__ import annotations

import csv
import json
import re
import statistics
from difflib import SequenceMatcher
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ------------------------------------------------------------
# Behavior After Consultation
# ------------------------------------------------------------
# This script assumes the following folder structure:
#
# code_website/
#   CodeAnalysisData/
#       behaviorPostConsultation.py   <-- this file
#   exampleDataFiles/
#       participant1.txt
#       participant2.txt
#       ...
#
# This file writes two CSV files to this folder:
#    CodeAnalysisData/revision_after_consultation_summary.csv
#    CodeAnalysisData/revision_after_consultation_events.csv
#
# Main goal:
# - analyze how participants' writing changes before and after each
#   consultation episode with the LLM assistant
#
# Main outputs:
# - participant-level summary metrics:
#    * number_of_consultation_episodes = total number of LLM consultation episodes
#    * mean_words_written_in_pre_window = average number of words added before consultations
#    * mean_words_written_in_post_window = average number of words added after consultations
#    * mean_words_deleted_in_pre_window = average number of words deleted before consultations
#    * mean_words_deleted_in_post_window = average number of words deleted after consultations
#    * mean_words_edited_in_pre_window = average number of words replaced/edited before consultations
#    * mean_words_edited_in_post_window = average number of words replaced/edited after consultations
#    * mean_net_word_change_in_pre_window = average net word change before consultations
#    * mean_net_word_change_in_post_window = average net word change after consultations
#    * mean_burst_count_in_pre_window = average number of writing bursts before consultations
#    * mean_burst_count_in_post_window = average number of writing bursts after consultations
#    * mean_burst_words_added_in_pre_window = average number of words added within bursts before consultations
#    * mean_burst_words_added_in_post_window = average number of words added within bursts after consultations
#
# - event-level consultation metrics:
#    * consultation_start_ms = start time of the consultation episode, in ms from page start
#    * consultation_end_ms = end time of the consultation episode, in ms from page start
#    * consultation_duration_sec = duration of the consultation episode in seconds
#    * n_user_messages_in_episode = number of participant messages in the consultation episode
#    * n_assistant_messages_in_episode = number of LLM assistant messages in the consultation episode
#    * user_messages_joined = all participant messages in the episode combined into one field
#    * assistant_messages_joined = all LLM assistant messages in the episode combined into one field
#    * words_written_in_pre_window = number of words added in the window before consultation
#    * words_written_in_post_window = number of words added in the window after consultation
#    * words_deleted_in_pre_window = number of words deleted in the window before consultation
#    * words_deleted_in_post_window = number of words deleted in the window after consultation
#    * words_edited_in_pre_window = number of words replaced/edited in the window before consultation
#    * words_edited_in_post_window = number of words replaced/edited in the window after consultation
#    * net_word_change_in_pre_window = final word count minus initial word count before consultation
#    * net_word_change_in_post_window = final word count minus initial word count after consultation
#    * text_added_in_pre_window = text added in the window before consultation
#    * text_deleted_in_pre_window = text deleted in the window before consultation
#    * text_edited_from_in_pre_window = original text that was replaced before consultation
#    * text_edited_to_in_pre_window = new text that replaced earlier text before consultation
#    * text_added_in_post_window = text added in the window after consultation
#    * text_deleted_in_post_window = text deleted in the window after consultation
#    * text_edited_from_in_post_window = original text that was replaced after consultation
#    * text_edited_to_in_post_window = new text that replaced earlier text after consultation
#    * burst_count_in_pre_window = number of writing bursts before consultation
#    * burst_count_in_post_window = number of writing bursts after consultation
#    * mean_burst_duration_sec_in_pre_window = average burst duration before consultation
#    * mean_burst_duration_sec_in_post_window = average burst duration after consultation
#    * mean_burst_words_added_in_pre_window = average number of words added within bursts before consultation
#    * mean_burst_words_added_in_post_window = average number of words added within bursts after consultation
#    * max_burst_words_added_in_pre_window = largest number of words added in a single burst before consultation
#    * max_burst_words_added_in_post_window = largest number of words added in a single burst after consultation
#    * pre_window_ms = size of the pre-consultation window in milliseconds
#    * post_window_ms = size of the post-consultation window in milliseconds
#    * burst_pause_threshold_ms = pause length used to separate writing bursts
#
# Definitions used here:
# - Pre window = the fixed time window before a consultation episode.
# - Post window = the fixed time window after a consultation episode.
# - Written / deleted / edited words are estimated by comparing the text
#   at the start and end of each window.
# - Burst = a sequence of nearby editor snapshots separated by less than
#   BURST_PAUSE_THRESHOLD_MS.
# ------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "exampleDataFiles"

SUMMARY_OUTPUT_CSV = SCRIPT_DIR / "revision_after_consultation_summary.csv"
EVENT_OUTPUT_CSV = SCRIPT_DIR / "revision_after_consultation_events.csv"

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
MIN_EDITOR_SNAPSHOTS_BETWEEN_EPISODES = 3
MIN_WORD_CHANGE_BETWEEN_EPISODES = 5

# CONFIG YOU WILL EDIT
PRE_WINDOW_MS = 30000
POST_WINDOW_MS = 30000

# CONFIG YOU WILL EDIT
BURST_PAUSE_THRESHOLD_MS = 2000


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


def get_latest_snapshot_at_or_before(
    target_ms: int,
    snapshots: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    latest = None
    for snap in snapshots:
        if snap["t_ms"] <= target_ms:
            latest = snap
        else:
            break
    return latest


def get_text_at_or_before(target_ms: int, snapshots: List[Dict[str, Any]]) -> str:
    snap = get_latest_snapshot_at_or_before(target_ms, snapshots)
    return snap["text"] if snap else ""


def editor_activity_between(
    start_ms: int,
    end_ms: int,
    editor: List[Dict[str, Any]],
) -> Dict[str, int]:
    window_snaps = [s for s in editor if start_ms < s["t_ms"] <= end_ms]
    before_snap = get_latest_snapshot_at_or_before(start_ms, editor)

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


def compare_texts_word_level(text_before: str, text_after: str) -> Dict[str, Any]:
    before_words = text_before.split()
    after_words = text_after.split()
    matcher = SequenceMatcher(None, before_words, after_words)

    added_chunks: List[str] = []
    deleted_chunks: List[str] = []
    edited_from_chunks: List[str] = []
    edited_to_chunks: List[str] = []

    added_word_count = 0
    deleted_word_count = 0
    edited_from_word_count = 0
    edited_to_word_count = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "insert":
            chunk = " ".join(after_words[j1:j2]).strip()
            if chunk:
                added_chunks.append(chunk)
                added_word_count += len(after_words[j1:j2])

        elif tag == "delete":
            chunk = " ".join(before_words[i1:i2]).strip()
            if chunk:
                deleted_chunks.append(chunk)
                deleted_word_count += len(before_words[i1:i2])

        elif tag == "replace":
            old_chunk = " ".join(before_words[i1:i2]).strip()
            new_chunk = " ".join(after_words[j1:j2]).strip()

            if old_chunk:
                edited_from_chunks.append(old_chunk)
                edited_from_word_count += len(before_words[i1:i2])

            if new_chunk:
                edited_to_chunks.append(new_chunk)
                edited_to_word_count += len(after_words[j1:j2])

    return {
        "added_text": " || ".join(added_chunks),
        "deleted_text": " || ".join(deleted_chunks),
        "edited_from_text": " || ".join(edited_from_chunks),
        "edited_to_text": " || ".join(edited_to_chunks),
        "added_word_count": added_word_count,
        "deleted_word_count": deleted_word_count,
        "edited_from_word_count": edited_from_word_count,
        "edited_to_word_count": edited_to_word_count,
        "net_word_change": count_words(text_after) - count_words(text_before),
    }


def compare_window_texts(
    snapshots: List[Dict[str, Any]],
    start_ms: int,
    end_ms: int,
) -> Optional[Dict[str, Any]]:
    start_text = get_text_at_or_before(start_ms, snapshots)
    end_text = get_text_at_or_before(end_ms, snapshots)

    if not start_text and not end_text:
        return None

    result = compare_texts_word_level(start_text, end_text)
    result["start_text"] = start_text
    result["end_text"] = end_text
    return result


def split_into_bursts(series: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    if not series:
        return []

    bursts: List[List[Dict[str, Any]]] = [[series[0]]]

    for i in range(1, len(series)):
        gap = series[i]["t_ms"] - series[i - 1]["t_ms"]
        if gap >= BURST_PAUSE_THRESHOLD_MS:
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


def compute_burst_metrics_for_window(
    snapshots: List[Dict[str, Any]],
    start_ms: int,
    end_ms: int,
) -> Dict[str, Any]:
    window_snaps = [s for s in snapshots if start_ms <= s["t_ms"] <= end_ms]
    bursts = split_into_bursts(window_snaps)

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
        burst_durations_ms.append(burst[-1]["t_ms"] - burst[0]["t_ms"])
        burst_words_added.append(words_added_within_burst(burst))

    return {
        "burst_count": len(bursts),
        "mean_burst_duration_sec": round(statistics.mean(burst_durations_ms) / 1000, 4),
        "mean_burst_words_added": round(statistics.mean(burst_words_added), 4),
        "max_burst_words_added": max(burst_words_added),
    }


def mean_or_none(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return round(sum(values) / len(values), 4)


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

    snapshots = get_editor_snapshots(data)
    messages = get_messages(data)
    participant_id = str(data.get("id", path.stem))
    episodes = build_consultation_episodes(messages, snapshots)

    event_rows: List[Dict[str, Any]] = []

    pre_added_counts: List[int] = []
    post_added_counts: List[int] = []
    pre_deleted_counts: List[int] = []
    post_deleted_counts: List[int] = []
    pre_edited_counts: List[int] = []
    post_edited_counts: List[int] = []
    pre_net_changes: List[int] = []
    post_net_changes: List[int] = []
    pre_burst_counts: List[int] = []
    post_burst_counts: List[int] = []
    pre_burst_words: List[float] = []
    post_burst_words: List[float] = []

    for idx, episode in enumerate(episodes, start=1):
        consultation_start_ms = episode["episode_start_ms"]
        consultation_end_ms = episode["episode_end_ms"]

        pre_window = compare_window_texts(
            snapshots=snapshots,
            start_ms=max(0, consultation_start_ms - PRE_WINDOW_MS),
            end_ms=consultation_start_ms,
        )
        post_window = compare_window_texts(
            snapshots=snapshots,
            start_ms=consultation_end_ms,
            end_ms=consultation_end_ms + POST_WINDOW_MS,
        )

        pre_burst_metrics = compute_burst_metrics_for_window(
            snapshots=snapshots,
            start_ms=max(0, consultation_start_ms - PRE_WINDOW_MS),
            end_ms=consultation_start_ms,
        )
        post_burst_metrics = compute_burst_metrics_for_window(
            snapshots=snapshots,
            start_ms=consultation_end_ms,
            end_ms=consultation_end_ms + POST_WINDOW_MS,
        )

        pre_added = None if pre_window is None else pre_window["added_word_count"]
        post_added = None if post_window is None else post_window["added_word_count"]
        pre_deleted = None if pre_window is None else pre_window["deleted_word_count"]
        post_deleted = None if post_window is None else post_window["deleted_word_count"]
        pre_edited = None if pre_window is None else pre_window["edited_to_word_count"]
        post_edited = None if post_window is None else post_window["edited_to_word_count"]
        pre_net = None if pre_window is None else pre_window["net_word_change"]
        post_net = None if post_window is None else post_window["net_word_change"]

        if pre_added is not None:
            pre_added_counts.append(pre_added)
        if post_added is not None:
            post_added_counts.append(post_added)

        if pre_deleted is not None:
            pre_deleted_counts.append(pre_deleted)
        if post_deleted is not None:
            post_deleted_counts.append(post_deleted)

        if pre_edited is not None:
            pre_edited_counts.append(pre_edited)
        if post_edited is not None:
            post_edited_counts.append(post_edited)

        if pre_net is not None:
            pre_net_changes.append(pre_net)
        if post_net is not None:
            post_net_changes.append(post_net)

        pre_burst_counts.append(pre_burst_metrics["burst_count"])
        post_burst_counts.append(post_burst_metrics["burst_count"])

        if pre_burst_metrics["mean_burst_words_added"] is not None:
            pre_burst_words.append(pre_burst_metrics["mean_burst_words_added"])
        if post_burst_metrics["mean_burst_words_added"] is not None:
            post_burst_words.append(post_burst_metrics["mean_burst_words_added"])

        event_rows.append({
            "participant_id": participant_id,
            "source_file": path.name,
            "consultation_number": idx,
            "consultation_start_ms": consultation_start_ms,
            "consultation_end_ms": consultation_end_ms,
            "consultation_duration_sec": round((consultation_end_ms - consultation_start_ms) / 1000, 3),
            "n_user_messages_in_episode": episode["n_user_messages"],
            "n_assistant_messages_in_episode": episode["n_assistant_messages"],
            "user_messages_joined": " || ".join(episode["user_messages"]),
            "assistant_messages_joined": " || ".join(episode["assistant_messages"]),

            "words_written_in_pre_window": pre_added,
            "words_written_in_post_window": post_added,
            "words_deleted_in_pre_window": pre_deleted,
            "words_deleted_in_post_window": post_deleted,
            "words_edited_in_pre_window": pre_edited,
            "words_edited_in_post_window": post_edited,
            "net_word_change_in_pre_window": pre_net,
            "net_word_change_in_post_window": post_net,

            "text_added_in_pre_window": None if pre_window is None else pre_window["added_text"],
            "text_deleted_in_pre_window": None if pre_window is None else pre_window["deleted_text"],
            "text_edited_from_in_pre_window": None if pre_window is None else pre_window["edited_from_text"],
            "text_edited_to_in_pre_window": None if pre_window is None else pre_window["edited_to_text"],

            "text_added_in_post_window": None if post_window is None else post_window["added_text"],
            "text_deleted_in_post_window": None if post_window is None else post_window["deleted_text"],
            "text_edited_from_in_post_window": None if post_window is None else post_window["edited_from_text"],
            "text_edited_to_in_post_window": None if post_window is None else post_window["edited_to_text"],

            "burst_count_in_pre_window": pre_burst_metrics["burst_count"],
            "burst_count_in_post_window": post_burst_metrics["burst_count"],
            "mean_burst_duration_sec_in_pre_window": pre_burst_metrics["mean_burst_duration_sec"],
            "mean_burst_duration_sec_in_post_window": post_burst_metrics["mean_burst_duration_sec"],
            "mean_burst_words_added_in_pre_window": pre_burst_metrics["mean_burst_words_added"],
            "mean_burst_words_added_in_post_window": post_burst_metrics["mean_burst_words_added"],
            "max_burst_words_added_in_pre_window": pre_burst_metrics["max_burst_words_added"],
            "max_burst_words_added_in_post_window": post_burst_metrics["max_burst_words_added"],

            "pre_window_ms": PRE_WINDOW_MS,
            "post_window_ms": POST_WINDOW_MS,
            "burst_pause_threshold_ms": BURST_PAUSE_THRESHOLD_MS,
        })

    summary_row = {
        "participant_id": participant_id,
        "source_file": path.name,
        "number_of_consultation_episodes": len(episodes),

        "mean_words_written_in_pre_window": mean_or_none(pre_added_counts),
        "mean_words_written_in_post_window": mean_or_none(post_added_counts),
        "mean_words_deleted_in_pre_window": mean_or_none(pre_deleted_counts),
        "mean_words_deleted_in_post_window": mean_or_none(post_deleted_counts),
        "mean_words_edited_in_pre_window": mean_or_none(pre_edited_counts),
        "mean_words_edited_in_post_window": mean_or_none(post_edited_counts),
        "mean_net_word_change_in_pre_window": mean_or_none(pre_net_changes),
        "mean_net_word_change_in_post_window": mean_or_none(post_net_changes),

        "mean_burst_count_in_pre_window": mean_or_none(pre_burst_counts),
        "mean_burst_count_in_post_window": mean_or_none(post_burst_counts),
        "mean_burst_words_added_in_pre_window": mean_or_none(pre_burst_words),
        "mean_burst_words_added_in_post_window": mean_or_none(post_burst_words),

        "has_messages_field": "messages" in data,
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

    print("Revision-after-consultation analysis completed.")
    print(f"Processed files: {len(files)}")
    print(f"Summary CSV saved to: {SUMMARY_OUTPUT_CSV}")
    print(f"Event-level CSV saved to: {EVENT_OUTPUT_CSV}")


if __name__ == "__main__":
    main()
