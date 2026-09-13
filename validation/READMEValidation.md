# Technical validation runner

This folder contains an automated validation runner for the LLM writing platform.
It opens each experimental template like a participant, performs scripted actions,
submits, and checks whether the submitted log contains the expected fields.

## What it validates

- The five template routes: `/c`, `/u`, `/o`, `/b`, `/a`
- 50-word submission threshold on editor templates
- 3-minute submission threshold
- final text recording
- editor snapshot recording
- LLM message recording
- chat open/collapse event recording where the template supports it
- simulated page/tab-away logging and return timing
- condition IDs and submit timestamps
- blocked submissions before the word-count and/or time thresholds are met

## Install once

From this folder:

```bash
npm install
npm run install-browsers
```

## Safe dry run

This mode does not write to S3. It captures the submission request in the browser
and validates the payload.

```bash
set BASE_URL=https://YOUR DEPLOYED URL
npm run validate
```

PowerShell:

```powershell
$env:BASE_URL = "https://https://YOUR DEPLOYED URL"
npm run validate
```

Bash:

```bash
BASE_URL="https://https://YOUR DEPLOYED URL" npm run validate
```

Or use the included Bash wrapper:

```bash
./run_validation.sh
```

## Real submission mode

This mode allows `/api/logs` to submit to the backend. Use it only when you are
ready for validation sessions to appear in your storage/admin export.

```powershell
$env:BASE_URL = "https://https://YOUR DEPLOYED URL"
$env:REAL_SUBMIT = "true"
npm run validate
```

Bash:

```bash
BASE_URL="https://main.d2gkp0fur5ysdy.amplifyapp.com" REAL_SUBMIT=true npm run validate
```

With the wrapper:

```bash
REAL_SUBMIT=true ./run_validation.sh
```

## Real LLM API mode

To call the deployed site's real LLM API instead, set
`USE_REAL_LLM=true`.

Dry run with real LLM calls, without saving submissions:

```bash
USE_REAL_LLM=true ./run_validation.sh
```

Real LLM calls and real S3 submissions:

```bash
USE_REAL_LLM=true REAL_SUBMIT=true ./run_validation.sh
```

## Useful options

```powershell
$env:BROWSERS = "chromium,firefox"
$env:REPETITIONS = "3"
$env:MIN_DURATION_MS = "180000"
$env:WORD_THRESHOLD = "50"
$env:REAL_DURATION = "false"
$env:USE_REAL_LLM = "true"
$env:RUN_GUARD_CHECKS = "true"
$env:RUN_NAVIGATION_CHECKS = "true"
$env:NAVIGATION_AWAY_MS = "5000"
```

Set `REAL_DURATION=true` only when you want the runner to actually wait 3 minutes
per session. The default uses a browser-side time jump, which preserves the
threshold logic without making the validation painfully slow.

`RUN_GUARD_CHECKS=true` validates blocked submissions on the no-LLM template:
short text before time, short text after time, and long text before time.

`RUN_NAVIGATION_CHECKS=true` simulates a participant leaving and returning to
the page during each submitted validation session, then checks that the saved
logs include `navigatedAway`, `totalNavigatedAwayMs`, and
`navigatedAwayExplained` with numeric timing fields.
