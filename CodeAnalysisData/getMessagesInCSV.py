import json
import csv
from pathlib import Path


def logs_to_message_csvs(input_dir: str, output_dir: str) -> None:
    """
    Reads participant log files (*.txt) that contain JSON.
    For each file, exports a CSV with the chat messages:
    columns = timestamp, sender, text
    """

    # Where the input .txt logs are located
    in_path = Path(input_dir)

    # Where we will save the output CSV files
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)  # create folder if it doesn't exist

    # Loop over every .txt file in the input folder
    for file in in_path.glob("*.txt"):

        # 1) Read and parse the JSON log
        try:
            log = json.loads(file.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[SKIP] {file.name}: could not parse JSON ({e})")
            continue

        # Use the participant ID from the log, or fall back to the filename
        participant_id = str(log.get("id", file.stem))

        # 2) Extract the messages array
        messages = log.get("messages", [])
        if not isinstance(messages, list):
            print(f"[SKIP] {file.name}: 'messages' is not a list")
            continue

        # 3) Convert messages into rows for the CSV
        rows = []
        for m in messages:
            # Each message should be a dictionary like:
            # { "timestamp": 12345, "sender": "user"|"chatbot", "text": "..." }
            if not isinstance(m, dict):
                continue

            rows.append(
                {
                    "timestamp": m.get("timestamp", ""),       # time in ms since page load
                    "sender": m.get("sender", ""),   # "user" or "chatbot"
                    "text": m.get("text", ""),       # message text
                }
            )

        # 4) Sort rows by time (just in case they are not already in order)
        def sort_key(r):
            t = r["timestamp"]
            # Put missing times at the end, otherwise sort by the numeric value
            return (t == "" or t is None, t if isinstance(t, (int, float)) else 10**18)

        rows.sort(key=sort_key)

        # 5) Write one CSV per participant
        out_file = out_path / f"{participant_id}_messages.csv"
        with out_file.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["timestamp", "sender", "text"])
            writer.writeheader()
            writer.writerows(rows)

        print(f"[OK] Wrote {out_file.name}")


if __name__ == "__main__":
    #CONFIG YOU WILL EDIT
    # Change these folder names to match your computer
    # In our example, we want to import and save to the same folder, but you can have seperate folders for the .txts and .csvs:
    #   input_dir  = "s3_downloaded_logs"
    #   output_dir = "messages_csv"
    logs_to_message_csvs(input_dir="exampleDataFiles", output_dir="exampleDataFiles")