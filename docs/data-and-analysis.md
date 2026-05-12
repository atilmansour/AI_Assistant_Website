# Data and Analysis Guide

This guide explains the saved experiment logs in researcher-friendly terms.

## Where Data Is Saved

In the AWS deployment, every submitted session is saved as one `.txt` file in S3.

The file name is the participant completion/session code:

```text
AVL4K9PU.txt
```

The file content is JSON, even though the extension is `.txt`.

## Why Completion Codes Matter

Participants receive a completion code after submitting. That same code is stored as:

- `logs.id`
- the S3 file name
- the dashboard Session ID

This lets researchers match platform logs with external survey data.

## Condition Mapping

| Code pattern | Condition |
| --- | --- |
| `OLxxxxxC` | No LLM / control |
| `AVLxxxxxU` | Always Visible LLM |
| `TLxxxxxO` | Toggleable LLM |
| `PIxxxxxB` | Participant-Initiated LLM |
| `OCxxxxxA` | Only Chat |

## Main Log Fields

| Field | Plain-language meaning |
| --- | --- |
| `id` | Unique session/completion code. |
| `LLMProvider` | Which provider the condition used, such as ChatGPT, Gemini, Claude, or Groq. |
| `LLMModel` | Which model name was selected. |
| `backgroundLLMMessage` | Hidden background context/instructions sent to the assistant. |
| `messages` | Participant and assistant chat messages with timestamps. |
| `editor` | Text-editor snapshots with timestamps. |
| `chatEvents` | Events such as assistant open, expand, or collapse. |
| `ButtonPressed` | Timestamp for participant-initiated assistant activation. |
| `NumOfSubmitClicks` | Number of times the participant tried to submit. |
| `TimeStampOfSubmitClicks` | Timestamps for submit attempts. |
| `navigatedAway` | Number of times the participant left and returned to the page. |
| `totalNavigatedAwayMs` | Total time away from the page. |
| `navigatedAwayExplained` | Detailed leave/return episodes. |

## Editor Snapshots

The text editor saves snapshots in:

```json
[
  { "t_ms": 8709, "text": "<p>I am writing</p>" }
]
```

The text is HTML because the editor is a rich-text editor.

The final submitted editor content is normally:

```js
editor[editor.length - 1].text
```

> [!NOTE]
> The editor logs progress snapshots after space insertions or deletions, and also adds the latest snapshot on submit.

## Chat Messages

Chat messages are saved in:

```json
[
  {
    "timestamp": 450,
    "text": "Hello, this is a present message...",
    "sender": "LLMAssistant"
  },
  {
    "timestamp": 9210,
    "text": "Can you help me improve this paragraph?",
    "sender": "user"
  }
]
```

Useful derived metrics:

| Metric | How it is derived |
| --- | --- |
| Participant messages | Count `messages` where `sender === "user"`. |
| AI messages | Count `messages` where `sender === "LLMAssistant"`. |
| Rounds of interaction | Currently derived from participant message count. |

## Dashboard Exports

The dashboard supports two export scopes:

| Export option | What it includes |
| --- | --- |
| Table only | Only fields currently visible in the main dashboard table. |
| Full session data | Full available session data, including raw logs, messages, editor progress, configuration, and derived metrics. |

Exports are available as:

- CSV
- JSON

## Analysis Scripts

The `CodeAnalysisData/` folder contains Python scripts for post-study processing.

| Script | What it helps analyze |
| --- | --- |
| `getPlainTexts.py` | Extracts final submitted text from each log file. |
| `getMessagesInCSV.py` | Extracts chat messages into CSV format. |
| `writingPatterns.py` | Estimates words added per minute, pauses, and writing bursts. |
| `consultationPatterns.py` | Measures when and how often participants consult the LLM. |
| `behaviorPostConsultation.py` | Compares writing before and after LLM consultations. |
| `literalLLMLanguageIncorporation.py` | Estimates direct reuse of LLM-generated words/phrases. |
| `IndirectLLMLanguageIncorporation.py` | Estimates semantic similarity between final text and LLM responses. |

## Example Data

The `exampleDataFiles/` folder contains example log files and derived files that can help you understand the data format before running your own study.

> [!CAUTION]
> If you replace example files with real participant data, confirm that the data is anonymized and approved for repository storage before committing it.

## Recommended Research Workflow

1. Run one pilot session per condition.
2. Confirm all files appear in S3 or your chosen storage backend.
3. Open the dashboard and inspect every pilot session.
4. Export table-only data to confirm summary columns.
5. Export full-session data to confirm raw logs are preserved.
6. Download raw files before deleting any sessions.
7. Run analysis scripts on a local copy of the data.

## Data Privacy Notes

- Treat writing content and chat messages as participant data.
- Avoid collecting names or direct identifiers inside writing prompts unless required by the study.
- Store downloaded data in an approved research storage location.
- Remove pilot/test data before final analysis.
- Restrict dashboard access to study staff.
