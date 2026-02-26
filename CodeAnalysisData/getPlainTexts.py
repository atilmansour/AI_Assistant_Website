"""
This script converts your S3 submission .txt files (JSON logs) into clean, plain-text files
(one per participant ID) that are ready to use. Optionally, it can also merge
those texts into an existing CSV using a 'code' column.
"""

import os
import json
import pandas as pd
from html import unescape
from bs4 import BeautifulSoup


# ----------------------------
# 1) Reading + parsing helpers
# ----------------------------

def load_json_from_txt(txt_path: str) -> dict:
    """
    Loads your submission log from a .txt file.

    Why this exists:
    - Some exports might contain extra characters before the JSON starts.
    - We safely find the first '{' and parse from there.
    """
    with open(txt_path, "r", encoding="utf-8") as f:
        raw = f.read().strip()

    # If the file ever has a prefix before the JSON, this makes it robust.
    first_brace = raw.find("{")
    if first_brace == -1:
        raise ValueError(f"No JSON object found in file: {txt_path}")

    raw_json = raw[first_brace:]
    return json.loads(raw_json)


def get_final_editor_html(payload: dict) -> str:
    """
    Returns the *final* editor HTML (Quill output) from the JSON payload.

    Your data structure has:
      payload["editor"] = [ { "t_ms": "...", "text": "<p>...</p>" }, ... ]

    We take the last snapshot because it represents the final response at submit time.
    """
    editor = payload.get("editor", [])
    if not isinstance(editor, list) or len(editor) == 0:
        return ""

    last = editor[-1]
    if isinstance(last, dict):
        return str(last.get("text", ""))
    return ""


# ----------------------------
# 2) HTML -> plain text cleanup
# ----------------------------

def quill_html_to_plain_text(html: str) -> str:
    """
    Converts Quill/HTML into plain text.
    - Preserves line breaks (<br>)
    - Strips tags
    - Unescapes HTML entities (&nbsp; etc.)
    """
    if not html:
        return ""

    soup = BeautifulSoup(html, "html.parser")

    # Convert <br> into real newlines before extracting text
    for br in soup.find_all("br"):
        br.replace_with("\n")

    text = soup.get_text()
    text = unescape(text)

    # Optional: normalize whitespace a bit
    text = text.replace("\r\n", "\n").strip()
    return text


# ----------------------------
# 3) Main batch processing
# ----------------------------

def export_texts(input_folder: str, output_folder: str) -> None:
    """
    Reads all .txt files in input_folder, extracts the final editor content,
    converts it to plain text, and saves one clean file per participant ID.

    Output file name: <id>.txt
    """
    os.makedirs(output_folder, exist_ok=True)

    for filename in os.listdir(input_folder):
        if not filename.lower().endswith(".txt"):
            continue

        in_path = os.path.join(input_folder, filename)

        try:
            payload = load_json_from_txt(in_path)
            pid = str(payload.get("id", os.path.splitext(filename)[0]))

            final_html = get_final_editor_html(payload)
            clean_text = quill_html_to_plain_text(final_html)

            out_path = os.path.join(output_folder, f"{pid}.txt")
            with open(out_path, "w", encoding="utf-8") as out:
                out.write(clean_text)

            print(f" Wrote text: {out_path}")

        except Exception as e:
            print(f"Failed on {in_path}: {e}")


# ----------------------------
# 4) Optional: merge into a CSV
# ----------------------------

def add_text_column_from_txt(csv_file: str, cleaned_text_dir: str, output_csv: str,
                            code_col: str = "code", text_col: str = "textT1") -> None:
    """
    Adds a text column to your existing CSV by matching df[code_col] to <code>.txt in cleaned_text_dir.
    (Same idea as your movingTextstoCSV.py, just parameterized + a little safer.)
    """
    df = pd.read_csv(csv_file)
    texts = []

    for code in df[code_col].astype(str):
        txt_path = os.path.join(cleaned_text_dir, f"{code}.txt")
        if os.path.isfile(txt_path):
            with open(txt_path, "r", encoding="utf-8") as f:
                texts.append(f.read())
        else:
            texts.append(None)

    df[text_col] = texts
    df.to_csv(output_csv, index=False)
    print(f"Wrote merged CSV: {output_csv}")


if __name__ == "__main__":
    #CONFIG YOU WILL EDIT
    # Step 1: Put your downloaded S3 .txt logs folder in INPUT_FOLDER
    INPUT_FOLDER = r"exampleDataFiles"
    #CONFIG YOU WILL EDIT
    # Step 2: This folder will get clean ready texts (<id>.txt)
    # Note that if the output and input folder are the same, the code will delete the raw files.
    OUTPUT_FOLDER = r"exampleDataFiles/cleanTexts"

    export_texts(INPUT_FOLDER, OUTPUT_FOLDER)
    #CONFIG YOU WILL EDIT
    # Optional Step 3: If you have a CSV with a 'code' column and want to add the texts into it:
    # CSV_FILE = r"C:\path\to\data.csv"
    # OUT_CSV  = r"C:\path\to\data_with_text.csv"
    # add_text_column_from_txt(CSV_FILE, OUTPUT_FOLDER, OUT_CSV, code_col="code", text_col="textT1")
