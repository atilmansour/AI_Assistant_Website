from __future__ import annotations

import csv
import json
import re
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ------------------------------------------------------------
# Literal overlap with temporal precedence (simplified output)
# ------------------------------------------------------------
# Folder structure assumed:
#
# code_website/
#   CodeAnalysisData/
#       literalLanguageUse_simple.py   <-- place this file here
#   exampleDataFiles/
#       participant1.txt
#       participant2.txt
#       ...
#
# Output:
#   1. literal_language_use_simple_summary.csv
#
# Main outputs:
# - participant-level direct incorporation metrics:
#    * participant_id = participant identifier from the saved data file
#    * source_file = name of the participant data file analyzed
#    * n_words_from_llm = number of words in the final text covered by LLM-generated phrases
#    * longest_phrase_from_llm_n_words = length, in words, of the longest matched LLM-generated phrase
#    * longest_phrase_from_llm_text = text of the longest matched LLM-generated phrase
#    * final_text_word_count = number of words in the participant's final submitted text
#    * n_assistant_messages_used = number of LLM assistant messages included in the analysis
#    * include_initial_assistant_messages = whether initial/present assistant messages were included in the analysis
#    * has_messages_field = whether the participant file contains a messages field
#    * has_editor_field = whether the participant file contains an editor field
#
#
# A word/phrase counts as direct incorporation only if:
#   (a) it appears in the final submitted text
#   (b) it appears in an assistant message
#   (c) it appeared in the assistant BEFORE it first appeared in the editor text
# ------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "exampleDataFiles"

OUTPUT_CSV = SCRIPT_DIR / "literal_language_use_simple_summary.csv"

USER_SENDER_VALUES = {"user"}
ASSISTANT_SENDER_VALUES = {"llmassistant", "assistant", "ai", "model"}

# CONFIG YOU WILL EDIT:
# If False, assistant messages before the first user message are excluded.
INCLUDE_INITIAL_ASSISTANT_MESSAGES = False

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


def safe_load_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Skipping {path.name}: could not read JSON ({e})")
        return None


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


def find_phrase_first_time(tokens: List[str], snapshots: List[Dict[str, Any]], phrase: Tuple[str, ...]) -> Optional[int]:
    n = len(phrase)
    if n == 0:
        return None

    for snap in snapshots:
        snap_tokens = tokenize(snap["text"])
        if len(snap_tokens) < n:
            continue
        for i in range(len(snap_tokens) - n + 1):
            if tuple(snap_tokens[i:i+n]) == phrase:
                return snap["t_ms"]
    return None


def assistant_first_occurrence_times(assistant_messages: List[Dict[str, Any]]) -> Dict[Tuple[str, ...], int]:
    first_times: Dict[Tuple[str, ...], int] = {}

    for msg in assistant_messages:
        tokens = tokenize(msg["text"])
        for n in range(1, len(tokens) + 1):
            for i in range(len(tokens) - n + 1):
                phrase = tuple(tokens[i:i+n])
                if phrase not in first_times:
                    first_times[phrase] = msg["timestamp"]

    return first_times


def longest_temporally_prior_phrases(
    final_tokens: List[str],
    assistant_phrase_times: Dict[Tuple[str, ...], int],
    editor_snapshots: List[Dict[str, Any]],
) -> Tuple[int, List[str], int]:
    """
    Returns:
    - total number of words in the final text that can be covered by the
      longest non-overlapping temporally prior phrases
    - list of the matched phrases
    - length of the longest matched phrase in words
    """
    matches: List[Tuple[int, int, str]] = []

    for start in range(len(final_tokens)):
        best_end = None
        best_phrase_text = None

        for end in range(len(final_tokens), start, -1):
            phrase = tuple(final_tokens[start:end])
            assistant_time = assistant_phrase_times.get(phrase)
            if assistant_time is None:
                continue

            editor_time = find_phrase_first_time(final_tokens, editor_snapshots, phrase)
            if editor_time is None:
                continue

            if assistant_time < editor_time:
                best_end = end
                best_phrase_text = " ".join(phrase)
                break

        if best_end is not None and best_phrase_text is not None:
            matches.append((start, best_end, best_phrase_text))

    # Greedy non-overlapping selection, preferring earlier longest matches.
    selected: List[Tuple[int, int, str]] = []
    current_end = -1
    for start, end, text in sorted(matches, key=lambda x: (x[0], -(x[1] - x[0]))):
        if start >= current_end:
            selected.append((start, end, text))
            current_end = end

    total_words_covered = sum(end - start for start, end, _ in selected)
    phrase_texts = [text for _, _, text in selected]
    longest_phrase_len = max((end - start for start, end, _ in selected), default=0)

    return total_words_covered, phrase_texts, longest_phrase_len


def analyze_file(path: Path) -> Optional[Dict[str, Any]]:
    data = safe_load_json(path)
    if data is None:
        return None

    participant_id = str(data.get("id", path.stem))
    messages = get_messages(data)
    editor_snapshots = get_editor_snapshots(data)
    assistant_messages = filter_assistant_messages(messages)

    final_text = get_final_text(data)
    final_tokens = tokenize(final_text)

    assistant_phrase_times = assistant_first_occurrence_times(assistant_messages)

    n_words_from_llm, phrase_matches, longest_phrase_len = longest_temporally_prior_phrases(
        final_tokens=final_tokens,
        assistant_phrase_times=assistant_phrase_times,
        editor_snapshots=editor_snapshots,
    )

    longest_phrase_text = ""
    if phrase_matches:
        longest_phrase_text = max(phrase_matches, key=lambda x: len(x.split()))

    return {
        "participant_id": participant_id,
        "source_file": path.name,
        "n_words_from_llm": n_words_from_llm,
        "longest_phrase_from_llm_n_words": longest_phrase_len,
        "longest_phrase_from_llm_text": longest_phrase_text,
        "final_text_word_count": len(final_tokens),
        "n_assistant_messages_used": len(assistant_messages),
        "include_initial_assistant_messages": INCLUDE_INITIAL_ASSISTANT_MESSAGES,
        "has_messages_field": "messages" in data,
        "has_editor_field": "editor" in data,
    }


def get_data_files(data_dir: Path) -> List[Path]:
    if not data_dir.exists():
        print(f"Data folder not found: {data_dir}")
        return []

    files: List[Path] = []
    for pattern in ("*.txt", "*.json"):
        files.extend(sorted(data_dir.glob(pattern)))
    return files


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
    files = get_data_files(DATA_DIR)

    if not files:
        print("No data files found.")
        print(f"Expected files inside: {DATA_DIR}")
        return

    all_rows: List[Dict[str, Any]] = []

    for path in files:
        row = analyze_file(path)
        if row is not None:
            all_rows.append(row)

    write_csv(all_rows, OUTPUT_CSV)

    print("Literal language use analysis completed.")
    print(f"Processed files: {len(all_rows)}")
    print(f"Output CSV saved to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()