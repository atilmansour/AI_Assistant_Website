# Customization Guide

This guide explains where researchers usually edit the experiment.

The fastest way to find editable sections is to search the project for:

```text
CONFIG YOU WILL EDIT
```

## Main Condition Files

| File | Condition |
| --- | --- |
| `src/pages/NoLLM.js` | No LLM / control |
| `src/pages/AlwaysVisibleLLM.js` | Always Visible LLM |
| `src/pages/ToggleableLLM.js` | Toggleable LLM |
| `src/pages/ParticipantInitiated.js` | Participant-Initiated LLM |
| `src/pages/OnlyChat.js` | Only Chat |

## Edit Participant Instructions

Each condition page contains visible instructions near the returned JSX.

Search for:

```text
Instructions:
```

or:

```text
CONFIG YOU WILL EDIT: put your participant instructions here
```

Use plain, study-specific instructions. Avoid telling participants which experimental condition they are in.

## Edit Routes

Routes are defined in:

```text
src/pages/Routes.js
```

Current routes:

| Route | Condition |
| --- | --- |
| `/c` | No LLM / control |
| `/u` | Always Visible LLM |
| `/o` | Toggleable LLM |
| `/b` | Participant-Initiated LLM |
| `/a` | Only Chat |
| `/admin/login` | Admin login |
| `/admin` | Admin dashboard |

> [!TIP]
> Use route names that are meaningful to you but not transparent to participants.

## Edit Completion Code Patterns

Each condition has a `getRandomString()` function.

Current patterns:

| Condition | Pattern |
| --- | --- |
| No LLM / control | `OLxxxxxC` |
| Always Visible LLM | `AVLxxxxxU` |
| Toggleable LLM | `TLxxxxxO` |
| Participant-Initiated LLM | `PIxxxxxB` |
| Only Chat | `OCxxxxxA` |

The dashboard derives condition labels from these patterns. If you change them, update:

- `backend/server.js`
- `lambda/index.mjs`
- `src/pages/admin/AdminPanel.js`

Search for:

```text
deriveConditionFromId
```

## Edit LLM Provider and Model

In LLM condition pages, edit:

```js
const LLMProvider = "chatgpt";
const LLMModel = "gpt-4o";
const backgroundAIMessage = "";
```

Supported provider names are handled by the backend:

| Provider value | Provider |
| --- | --- |
| `chatgpt` | OpenAI |
| `claude` | Anthropic Claude |
| `gemini` | Google Gemini |
| `groq` | Groq |

Provider keys belong in backend or cloud environment variables, never in frontend code.

## Edit Assistant Background Context

The assistant receives:

1. the participant's chat message
2. previous chat history
3. the current editor text, when available
4. `backgroundAIMessage`

Use `backgroundAIMessage` for task context, role instructions, or constraints.

Example:

```js
const backgroundAIMessage =
  "You are helping a participant brainstorm arguments for a short essay. Do not write the full essay for them.";
```

## Edit Initial Assistant Messages

Some conditions pass `initialMessages` into `AI_API`.

Use these for visible participant-facing assistant messages, such as:

```js
initialMessages={[
  "You can ask me for help if you want to brainstorm or revise your text.",
]}
```

## Edit Minimum Time and Word Count Rules

The condition pages contain state and checks for:

- live word count
- minimum time in the task
- submit attempts
- early-submit modal text

Search for:

```text
canSubmit
```

and:

```text
word
```

> [!NOTE]
> Keep time and word-count rules identical across conditions unless your research design intentionally manipulates them.

## Edit Paste Behavior

The text editor is implemented in:

```text
src/components/QuillTextEditor.js
```

Paste behavior is controlled by `pasteFlag`.

If `pasteFlag` is false, paste events inside the editor are blocked.

> [!WARNING]
> Paste blocking can affect participant experience and may need ethics/IRB explanation if it is part of the research design.

## Edit Logging Behavior

Logs are built in each condition page inside `handleConfirmSubmit()`.

Common fields:

- `id`
- `LLMProvider`
- `LLMModel`
- `backgroundLLMMessage`
- `messages`
- `editor`
- `chatEvents`
- `NumOfSubmitClicks`
- `TimeStampOfSubmitClicks`
- `navigatedAway`
- `totalNavigatedAwayMs`
- `navigatedAwayExplained`

Logs are sent to:

```text
POST /api/logs
```

## Edit Admin Dashboard

Dashboard files are in:

```text
src/pages/admin/
```

Important files:

| File | Purpose |
| --- | --- |
| `AdminLogin.js` | Password form and token storage. |
| `AdminPanel.js` | Session table, filters, detail modal, exports, delete action. |

The dashboard calls:

```text
POST /api/admin/login
GET /api/admin/sessions
DELETE /api/admin/sessions
```

## Edit Backend Defaults

Local backend:

```text
backend/server.js
```

AWS Lambda backend:

```text
lambda/index.mjs
```

If you change backend behavior, keep both files aligned unless you intentionally use different local and deployed behavior.
