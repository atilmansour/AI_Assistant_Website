from __future__ import annotations

import csv
import json
import math
import re
from collections import Counter
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional

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
#    * has_messages_field = whether the participant file contains a messages field
#    * has_editor_field = whether the participant file contains an editor field
#
#
# This script estimates indirect incorporation as the degree of similarity
# between the LLM-generated language and the participant's final submitted text.
#
# ------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "exampleDataFiles"

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


def analyze_file(path: Path) -> Optional[Dict[str, Any]]:
    data = safe_load_json(path)
    if data is None:
        return None

    participant_id = str(data.get("id", path.stem))
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
        "source_file": path.name,
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

    print("Indirect incorporation similarity analysis completed.")
    print(f"Processed files: {len(all_rows)}")
    print(f"Output CSV saved to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
