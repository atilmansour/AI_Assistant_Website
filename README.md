# A Tutorial for Using an Open-Source Platform for Controlled Experiments with LLM Assistance

This tutorial introduces a friendly, open-source foundation for controlled experiments on how people use large language model assistance while writing, revising, and making decisions.

The tutorial introduces free open-source code, with detailed step-by-step instructions including the installation of the code, building experimental conditions, the deployment of the web application, and data cleaning suggestions.

This project is designed for psychology researchers, behavioral scientists, graduate students, and research labs that want to run web-based studies with carefully controlled LLM access conditions.

> [!NOTE]
> The platform is free and open-source, but deployed studies may incur costs from LLM providers and cloud services such as AWS or Azure.

## Table of Contents

**Understand the Platform**

- [What This Platform Does and Who It Is For](#what-this-platform-does)
- [Experimental Conditions](#experimental-conditions)
- [Researcher Dashboard](#researcher-dashboard)
- [Architecture](#architecture)

**Preparing your Experiment (Tutorial from installation of the code to deployment)**

- [Installation and Local Setup](#installation-and-local-setup)
- [Customizing your Experimental Conditions](#customizing-your-experimental-conditions)
- [Local Testing](#local-testing)
- [Deployment Options](#deployment-options)

**Use the Data**

- [What Data Is Collected](#what-data-is-collected)
- [Data Analysis](#data-analysis)

**Project Reference**

- [Repository Map](#repository-map)
- [Troubleshooting](#troubleshooting)
- [License and Credits](#license-and-credits)

## What This Platform Does

The platform lets researchers run browser-based experiments where participants complete a writing task under different LLM-access conditions. Depending on the condition, participants may write without LLM, see an always-visible LLM assistant, toggle the LLM assistant open and closed, initiate LLM assistance only when needed, or interact with chat only.

It records study-relevant behavior such as:

- The final submitted text.
- Time-stamped text-editor progress snapshots after each space addition and deletion.
- Time-stamped chat messages between participant and LLM.
- LLM provider/model configuration per condition.
- Time-stamped submission attempts.
- Tab/window leave behavior.
- LLM assistant open/collapse events where applicable.
- Completion/session codes for matching with survey data.

### Who It Is For

This tutorial is intended for researchers, graduate students, research labs, and technical collaborators interested in conducting controlled experiments on LLM-assisted writing. The platform is especially useful for those who want to compare different forms of LLM assistance, customize experimental instructions and prompts, deploy reusable web-based studies, and collect detailed process-level data without building a full experimental system from scratch.

## Experimental Conditions

The current project includes five customizable conditions. Each condition has its own route and completion-code pattern.

| Index | Condition                 | URL  | Completion code pattern | Core manipulation                                                  | Research Purpose                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------- | ---- | ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | No LLM / control          | `/c` | `OLxxxxxC`              | Text editor only, no LLM access.                                   | It allows examining your dependent variable (DV) without having access to an LLM Assistant, and can serve as a control condition to all others.                                                                                                                                                                                                                                   |
| 2     | Always Visible LLM        | `/u` | `AVLxxxxxU`             | Text editor and assistant visible throughout the task.             | It allows examining your DV when LLM assistance is highly available and continuously salient.                                                                                                                                                                                                                                                                                     |
| 3     | Toggleable LLM            | `/o` | `TLxxxxxO`              | Text editor plus assistant that can be shown/collapsed.            | It allows examining your DV when participants have control over the visibility of the LLM assistant window. Thus, making this condition especially useful when studying help-seeking decisions.                                                                                                                                                                                   |
| 4     | Participant-Initiated LLM | `/b` | `PIxxxxxB`              | Assistant opens only after the participant chooses to activate it. | It allows examining your DV when participants initiate the LLM assistant window rather than being proactively offered, placing greater emphasis on intentional help seeking. Thus, this condition may be especially useful when the goal is to examine the threshold for consulting the LLM assistant and the circumstances under which participants decide they need assistance. |
| 5     | Only Chat                 | `/a` | `OCxxxxxA`              | Chat-only interaction without a separate text editor.              | It allows examining your DV when participants produce their writing only by interacting with the LLM assistant, without an option to independently write in a text editor. Thus, this condition may be especially useful when the LLM is not merely a support tool but the primary medium through which text is produced.                                                         |

### 1. No LLM / Control

Below is a screenshot of how this mode looks to participants.

![No LLM condition](images/c_No_LLM.png)

Use this condition when you need a baseline for writing without LLM assistance. It supports questions about how outcomes differ when participants complete the task independently.

### 2. Always Visible LLM

Below is a screenshot of how this mode looks to participants.

![Always Visible LLM condition](images/u_Always_Visible_LLM.png)

Use this condition when the LLM should be highly available and continuously salient. It supports questions about reliance, cognitive offloading, writing quality, and behavior when assistance is always present.

### 3. Toggleable LLM

This condition is useful when you want to study how participants manage access to assistance over time.

Below are screenshots of how this mode looks before and after the assistant is visible.

| Before assistant is visible                                               | After assistant is visible                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ![Toggleable LLM before assistant appears](images/o_Toggleable_LLM_1.png) | ![Toggleable LLM after assistant appears](images/o_Toggleable_LLM_2.png) |

It supports questions about help-seeking, avoidance, attention, and whether participants choose to keep LLM assistance visible.

### 4. Participant-Initiated LLM

Below is a screenshot of how this mode looks to participants.

![Participant-Initiated LLM condition](images/b_Participant_Initiated_LLM.png)

Use this condition when you want the participant to make an explicit decision to request LLM assistance. It is especially useful for studying thresholds for help-seeking and intentional LLM use.

### 5. Only Chat

Below is a screenshot of how this mode looks to participants.

![Only Chat condition](images/a_Only_Chat.png)

Use this condition when the LLM is the primary production medium rather than a support tool. It supports questions about prompting, delegation, authorship, and text generation through conversational interaction.

> Note: In all conditions, participants who try to submit before they meet the adjustable word count threshold and minimum time spent in the writing task (default thresholds are 50 words and 3 minutes) will receive a customizable pop-up message.
>
> Moreover, in all conditions, after participants submit their responses, they are directed to a thank-you page (`thankyou.js` file, located in `src/pages` folder) that instructs participants on how to continue the study. Finally, in all conditions that include an LLM Assistant window, the window includes messages displayed to participants that can be customized or deleted. These messages can be customized to instruct or encourage participants to interact with the LLM Assistant.

### 6. **Creating new conditions**:

- **_Purpose_**: In addition to selecting the experimental conditions, several features within each of the conditions can be customized, and thus, allow the comparison of the condition and its duplicated version to compare certain features. Creating new conditions allows testing differences between several features of the same original condition, such as the option to copy and paste, LLM types, background information given to the LLM Assistant, etc.
- **_How to duplicate_**:
  1. Create a new JavaScript file (.js file) by pressing the 'new file' button, the file name needs to start with a capital letter.
  2. Copy-paste the original condition's content into the new one.
  3. Change the name of the condition by going to the last line 'export default NAME' and changing all the appearances of the name to fit your new condition (press `Ctrl+F` to find all the appearances of the condition's name), the name needs to start with a capital letter.
  4. Create a specific path to the new condition, access the `Routes.js` file, which is located in the `src/pages` folder. In the `Routes.js` file, add an import line `import NAME from "./JS_FILE_NAME";`, and a Route path, as instructed in the file's comments.

## Researcher Dashboard

The admin dashboard is available at:

```text
/admin/login
```

It lets researchers to:

- view sessions stored in the configured log bucket
- filter sessions by condition
- inspect final submitted text and editor progress
- inspect chat messages and raw logs
- review derived metrics such as rounds of interaction, final word count, session duration, participant messages, and LLM messages
- export table-only or full-session data as CSV or JSON
- delete a session when needed

![Admin dashboard](images/Dashboard.png)

## Architecture

At a high level, the platform separates participant-facing code from sensitive backend work.

```text
Participant browser
  |
  | React app: experiment routes, editor, chat UI, dashboard UI
  v
Backend API
  |
  | /api/ai           -> forwards chat requests to the selected LLM provider
  | /api/logs         -> saves experiment logs
  | /api/admin/login  -> authenticates dashboard access
  | /api/admin/sessions -> lists/deletes session files
  v
Cloud storage
  |
  | AWS S3 in the current deployment path
  | Azure Blob Storage in the Azure-equivalent path
  v
Researcher dashboard and analysis scripts
```

# Preparing your Experiment

In this section, we provide step-by-step guidance for setting up the platform, beginning with the installation of the required applications and ending with the deployment of the experiment. To help with planning, each step includes an estimated completion time.

## Installation and Local Setup

The first step is to have all the needed applications downloaded to your computer, so you can use the platform locally and easily make changes.

### _Installing Required Applications_

> **Time estimation for this step: 40 mins**

First, you need to install the required applications and download a copy of the platform and source code from GitHub, in order for the platform to run locally.

### 1. Download GitHub

The first step is to create a GitHub account and download the Git application on your computer so you can work with the repository.

To set up your computer, you need to download git on your laptop. Please use this link to download git: https://git-scm.com/install/ (you can keep the default settings).

Next, sign in (or sign up) into your account using the github downloaded on your laptop. The GitHub account is used to save the source code in an online repository and to help deploy it as a web application.

### 2. Download This Repository

After you download github, to save this code and get it ready to edit, follow these steps:

1. Click **Fork** (top-right on GitHub, next to watch) to create your own copy of this repository.
2. Open your Command Prompt - CMD (write "cmd" in your computer search).
3. Go to the folder where you want to save the code using the following command:

   ```
   cd PATH/TO/FOLDER
   ```

4. Clone **your fork** to your computer:

   ```
   git clone https://github.com/<YOUR_USERNAME>/AI_Assistant_Website.git
   ```

5. Move into project folder using:

   ```
   cd AI_Assistant_Website
   ```

6. Add the original repository as upstream (so you can pull updates later), using the following commands:

   ```bash
   git remote add upstream https://github.com/atilmansour/AI_Assistant_Website
   git remote -v
   ```

7. Make sure your branch is main using the following:

   ```
   git checkout main
   git status
   ```

   Now you are free to start editing and saving your changes locally and in github:

8. Next, open the local repository in your preferred IDE (for exmaple, using [Visual Studio Code](https://code.visualstudio.com/)).
   Throughout the code, you can look for relevant change suggestions by searching **`CONFIG YOU WILL EDIT`**. To search for this term across files, you can click `Ctrl+shift+f`.

   Now, you can make a small change just to test that your changes are being saved. For example, open the `ThankYou.js` file, which is located in `src/pages` folder, and change "Your submission was recorded!" to "This is the new submission message!".

9. Save your changes, by saving the file, and then push them to your fork:

   ```
   git add .
   git commit -m "Describe your change"
   git push
   ```

   Note that, for the first use, git may ask you to identify your information. To do that, run:

   ```
   git config --global user.email "YOUR_GIT_EMAIL@EMAIL.COM"
   ```

   To make sure that your changes are saved, git shows you the number of files updated.

### 3. Download Node JS

First, make sure Node.js is downloaded (you can install the windows installer). This will allow you to locally test your code and make sure it looks as you expect it to look.

You can download it from the following website: https://nodejs.org/en/download

You may need to close and reopen your cmd and code folder that you are working on. To make sure Node JS is downloaded, run:

```
node -v
npm -v
```

### _Local Setup and Environment Variables_

> **Time estimation for this step: 10 mins (if you have API keys ready), 30 mins (if you don't have API keys ready)**

Next, you need to set up the platform locally and securely store the sensitive information (e.g., API Keys that provide access to LLMs) required to use the LLM Assistant.

**Backend Folder (API and Environment Variables)**

This project includes a `backend/` folder that runs a small server for:

1. Calling LLM providers (ChatGPT / Claude / Gemini / Groq) securely.
2. Handling AWS actions (e.g., S3) securely.

**Why do we need a backend?**

- API keys and AWS secret keys must NOT be stored in the React frontend (so they don't become public after deployment).
- Some providers also block browser requests due to CORS.
- The backend keeps secrets server-side and returns only the needed data to the frontend.

**How do we do it?**

Create `backend/.env` file (name the file `.env` and put it in the `backend` folder) and add your secrets there.

- In this file you will need to write 10 rows, just like this:

  ```
  REACT_APP_SECRET_ACCESS_KEY=Your secret key
  REACT_APP_ACCESS_KEY_ID= Your key
  REACT_APP_BucketS3=Your s3 bucket name

  OPENAI_KEY=Bearer Your GPT key
  CLAUDE_KEY=Your claude key
  GEMINI_KEY=Your gemini key
  GROQ_KEY=Bearer Your Groq key

  ALLOWED_ORIGIN=http://localhost:3000
  PORT=5050
  ADMIN_PASSWORD=change_this_admin_password
  ```

> [!TIP]
> The dashboard password is controlled by `ADMIN_PASSWORD` in the backend or Lambda environment. Please replace this value with the admin password you would like to use.

> [!CAUTION]
> Never commit `.env`, `.env.local`, or `backend/.env`. The repository keeps `.env.example` files because they are safe templates, not real secrets.

- Depending on which LLM you will use, you will need to generate a key. Please note models' abilities and pricing.

  Note that if you want to use only some of the following LLMs, you can leave the key empty.
  For example, if you only want to use ChatGPT as your LLM, you can write `GEMINI_KEY=''`, `CLAUDE_KEY=''`, and `GROQ_KEY=''`:
  1. To generate ChatGPT key: `OPENAI_KEY=Bearer XXXX`

     Go to [OpenAI API's official website](https://openai.com/api/). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to ChatGPT.

  2. To generate Claude key: `CLAUDE_KEY=sk-ant-api03-...`

     Go to [Claude API's official website](https://claude.com/platform/api). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Claude.

  3. To generate Gemini key: `GEMINI_KEY=AIzaSy...`

     Go to [Gemini API's official website](https://ai.google.dev/gemini-api/docs/api-key). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Gemini.

  4. To generate Groq Key: `GROQ_KEY=Bearer XXXX`

     Go To [Groq API's official website](https://console.groq.com/). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Groq.

- For the other environment keys, you can keep them empty for now, we will get back to them when we deploy the platform to AWS in [Amazon Web Services (AWS) section](<#Amazon_Web_Services_(AWS)>).
- **Make sure `backend/.env` is in `.gitignore`** (in your local code) before you push your code again to github. To do that, you need to have a line that says `backend/.env` inside your .gitignore file.

- **_backend/server.js_**: This file calls ChatGPT/Claude/Gemini securely (API keys stay private). Here, you can change model names and max tokens here.

  > You may change the components of each LLM's API: The default is max_tokens = 1000, and the following models: gpt-4o (ChatGPT), 2.5-flash (Gemini), 4 sonnet (Claude), and llama-3.3-70b-versatile (Groq). You may adjust these to your liking in each experimental condition.

  > You can find more information about each LLM on their official API website, and choose the model that best fits your needs.

## Customizing your Experimental Conditions

> **Time estimation for this step: 60 mins+**

After downloading all the required applications, having your own copy of the code locally, and setting up the LLM API keys, the second step is to prepare the experimental conditions you want to use in your experiments. This includes preparing and customizing the experimental conditions according to your purposes.

For relevant change suggestions only, search **`CONFIG YOU WILL EDIT`** (press `Ctrl+F`) to find out about all appearances of the required or recommended adjustments in the experiemntal file.

We remind you that if you want to view all possible adjustments you can press `Shift+Ctrl+F` to search for `CONFIG YOU WILL EDIT` across files.

Moreover, make sure you are working with the LLM version you like, as specified earlier.

Finally, after the participants submit their responses, they are redirected to a thank-you page that instructs them on how to continue. Please edit the thank-you page by accessing the `thankyou.js` file, located in the `src/pages` folder, to match the flow of your study.

Common changes:

| What you want to change           | Where to look                                       |
| --------------------------------- | --------------------------------------------------- |
| Participant instructions          | condition pages in `src/pages/`                     |
| Completion-code prefixes/suffixes | `getRandomString()` in each condition page          |
| LLM provider/model                | `LLMProvider` and `LLMModel` in LLM condition pages |
| Assistant background prompt       | `backgroundAIMessage` in LLM condition pages        |
| Initial assistant messages        | `initialMessages` passed into `AI_API`              |
| Minimum word/time rules           | condition pages in `src/pages/`                     |
| Paste behavior                    | `pasteFlag` and `QuillTextEditor.js`                |
| Routes/URLs                       | `src/pages/Routes.js`                               |
| Thank-you message                 | `src/pages/ThankYou.js`                             |
| Dashboard behavior                | `src/pages/admin/`                                  |
| Design/Style                      | `App.css`                                           |

See [Customization guide](docs/customization.md) for a more detailed walkthrough.

## Local Testing

> **Time estimation for this step: 20-30 mins**

- It is now time to test the platform locally and make sure it appears as expected. Even after running the code locally (as described below), you can continue making changes, save them, and the local version will update automatically, allowing you to view your changes in real time..

- Open **two terminals** (one for the backend, one for the frontend):
  - To open a terminal, you can click on View, New Terminal.
  - Make sure to use **git bash** as your terminals (you can change the terminal using the arrow next to the plus after you open the terminal).

### Terminal 1 (Backend)

```
cd backend
npm install
npm start
```

### Terminal 2 (frontend)

```
cd AI_Assistant_Website
npm install
npm start
```

The app should open in your browser (usually at http://localhost:3000). To access your conditions, you add to your website line `/x` depending on the wording you chose in `Routes.js` file. For example:

The app usually opens at:

```text
http://localhost:3000
```

Try condition routes such as:

```text
http://localhost:3000/c
http://localhost:3000/u
http://localhost:3000/o
http://localhost:3000/b
http://localhost:3000/a
http://localhost:3000/admin/login
```

To stop the local code from running, press `Ctrl+C`.

> `npm install` is needed the first time you set up the project (or any time `package.json` changes).  
> After that, you can run only `cd XXX` depending on the terminal, and `npm start`.
> Windows may require you to accept the installation of npm (after running npm install), or run `npm audit fix`.

## Deployment Options

Now that you tested your conditions, it's time to deploy it!

| Platform | Status                                                                                                                                         | Guide                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| AWS      | Current primary deployment path. Uses Amplify, Lambda, API Gateway, and S3.                                                                    | [docs/deployment/aws.md](docs/deployment/aws.md)     |
| Azure    | Azure-equivalent architecture. Requires adding an Azure Functions + Blob Storage adapter because the current deployed backend is AWS-specific. | [docs/deployment/azure.md](docs/deployment/azure.md) |

> [!IMPORTANT]
> The AWS guide preserves the original technical deployment instructions and adds structure, admin-route coverage, and troubleshooting notes.

> [!IMPORTANT]
> To avoid technical errors, please make sure you test your entire experiment before running the actual study.

## What Data Is Collected

Each submitted session is saved as a `.txt` file containing JSON. The exact fields depend on the condition.

| Field                     | Meaning                                                                                     | Conditions                           |
| ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `id`                      | Completion/session code. Also used as the saved file name.                                  | All                                  |
| `LLMProvider`             | Provider selected in the condition page, for example `chatgpt`.                             | LLM conditions                       |
| `LLMModel`                | Model selected in the condition page, for example `gpt-4o`.                                 | LLM conditions                       |
| `backgroundLLMMessage`    | Background instruction/context sent to the assistant.                                       | LLM conditions                       |
| `messages`                | Timestamped participant and assistant messages.                                             | LLM conditions                       |
| `editor`                  | Timestamped text-editor snapshots. The last snapshot is the final submitted editor content. | Editor conditions                    |
| `chatEvents`              | Assistant open/expand/collapse events.                                                      | Toggleable and Participant-Initiated |
| `ButtonPressed`           | Time at which participant initiated assistant access.                                       | Participant-Initiated                |
| `NumOfSubmitClicks`       | Number of submit attempts.                                                                  | All                                  |
| `TimeStampOfSubmitClicks` | Submit attempt timestamps in milliseconds.                                                  | All                                  |
| `navigatedAway`           | Number of tab/window leave events.                                                          | All                                  |
| `totalNavigatedAwayMs`    | Total time away from the experiment page.                                                   | All                                  |
| `navigatedAwayExplained`  | Detailed away/return episodes.                                                              | All                                  |

For a more detailed researcher-facing explanation, see [Data and analysis](docs/data-and-analysis.md).

## Data Analysis

The `CodeAnalysisData/` folder contains Python scripts for extracting and analyzing saved study logs.

| Script                                | Purpose                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `getPlainTexts.py`                    | Extract final plain-text submissions from log files.               |
| `getMessagesInCSV.py`                 | Extract chat messages to CSV.                                      |
| `writingPatterns.py`                  | Analyze writing bursts, pauses, and words added over time.         |
| `consultationPatterns.py`             | Analyze timing and distribution of LLM consultations.              |
| `behaviorPostConsultation.py`         | Compare writing behavior before and after consultation events.     |
| `literalLLMLanguageIncorporation.py`  | Estimate direct reuse of LLM-generated language.                   |
| `IndirectLLMLanguageIncorporation.py` | Estimate semantic similarity between final text and LLM responses. |

See [Data and analysis](docs/data-and-analysis.md), example data, and analysis output for more details.

## Repository Map

```text
AI_Assistant_Website/
  src/pages/                 experiment conditions and admin dashboard
  src/components/            text editor and LLM chat components
  backend/server.js          local Express backend
  lambda/index.mjs           AWS Lambda backend
  images/                    documentation screenshots
  CodeAnalysisData/          Python analysis scripts and example outputs
  exampleDataFiles/          example log files and derived example CSVs
  docs/                      deployment, customization, and data guides
```

## Troubleshooting

| Problem                                           | What to check                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Failed to fetch`                                 | Confirm `REACT_APP_API_BASE` points to the backend/API Gateway URL and does not include an extra trailing path. |
| Dashboard says `ADMIN_PASSWORD is not configured` | Set `ADMIN_PASSWORD` in `backend/.env` locally or Lambda environment variables in deployment.                   |
| CORS error                                        | Confirm your frontend origin is allowed by the backend/Lambda and API Gateway configuration.                    |
| Logs are not saved                                | Confirm `REACT_APP_BucketS3` or `BUCKET_NAME` is set and the backend has storage permissions.                   |
| LLM replies fail                                  | Confirm the selected provider key is configured and the provider/model name is valid.                           |
| Condition is not recognized in dashboard          | Confirm the completion code pattern matches the expected prefix/suffix table above.                             |

## License and Credits

This project is released under the [MIT License](LICENSE). MIT is widely used for open-source scientific tooling because it allows reuse, modification, teaching, and research deployment while preserving attribution.

Developed by:

- Atil Mansour
- Ori Goldfryd
- Ofra Amir
- Liat Levontin
- Technion - Israel Institute of Technology

For questions, contact Atil Mansour at `atil@campus.technion.ac.il` or `atilxmansour@gmail.com`.
