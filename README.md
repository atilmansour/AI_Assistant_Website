# AI_Assistant_Website

# Download GitHub

To set up your computer, you need to download git on your laptop.

Please use this link to download git: https://git-scm.com/install/

# Download This Repository

To get save this code and get it ready to edit, follow these few steps:

1. Click **Fork** (top-right on GitHub) to create your own copy of this repository.
2. Open your CMD
3. Go to the folder where you want to save the project using the following command:

   ```
   cd PATH/TO/FOLDER
   ```

4. Clone **your fork** to your computer:

   ```
   git clone https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
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

7. Create a new branch for your changes:
   `    git checkout -b my-change`
   Now you are free to start editing and saving your changes locally and in github:

8. After you make changes
9. Save your changes and push them to your fork:
   For the first time edits:
   ```
   git add .
   git commit -m "Describe your change"
   git push -u origin my-change
   ```
   Afterwards, you can simply run :
   ```
   git add .
   git commit -m "Describe your change"
   git push
   ```

# Download Node JS

First, make sure Node.js is downloaded.

You can download it from the following website: https://nodejs.org/en/download

# Backend Folder (API and Environment Variables)

This project includes a `backend/` folder that runs a small server (proxy) for:

1. Calling AI providers (OpenAI / Claude / Gemini) securely
2. Handling AWS actions (e.g., S3) securely

**Why do we need a backend?**

- API keys and AWS secret keys must NOT be stored in the React frontend (they become public after deployment).
- Some providers also block browser requests due to CORS.
- The backend keeps secrets server-side and returns only the needed data to the frontend.

### What is inside `backend/`?

- **server.js**: The backend server. It exposes an endpoint like:
  - `POST /api/ai` (the frontend sends `{ provider, chatHistory }` and receives `{ text }`)
- **package.json**: Backend dependencies (express, axios, cors, dotenv, etc.)
- **.env**: Backend secrets (API keys + AWS keys). This file must NOT be uploaded to GitHub.

### Backend environment variables

Create `backend/.env` file (name the file `.env` and put it in the `backend` folder) and add your secrets there (see the Environment Variables section).

- In this file you will need to write 6 rows, just like this:
  ```
  REACT_APP_SECRET_ACCESS_KEY=Your secret key
  REACT_APP_ACCESS_KEY_ID= Your key
  REACT_APP_BucketS3=Your s3 bucket name
  OPENAI_KEY=Your GPT key
  CLAUDE_KEY=Your claude key
  GEMINI_KEY=Your gemini key
  ```
- Depending on which AI you will use, you will need to generate a key.

  Note that if you want to use only some of the following AI's you can leave the key empty.
  For example, if you only want to use ChatGPT as your AI, you can write `GEMINI_KEY=''` and `CLAUDE_KEY=''`:
  1. To generate ChatGPT key: `OPENAI_KEY=Bearer XXXX`

     To get a GPT key, go to [OpenAI API's official website](https://openai.com/api/). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to ChatGPT.

  2. To generate Claude key: `CLAUDE_KEY=sk-ant-api03-...`

     To generate a claude key, go to [Claude API's official website](https://claude.com/platform/api). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Claude.

  3. To generate Gemini key: `GEMINI_KEY=AIzaSy...`
     To generate a claude key, go to [Gemini API's official website](https://ai.google.dev/gemini-api/docs/api-key). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Gemini.

- For the other environment keys, please go to the [Amazon Web Services (AWS) section](<#Amazon_Web_Services_(AWS)>)
- **Make sure `backend/.env` is in `.gitignore`**.

- **_backend/server.js_**: Calls OpenAI/Claude/Gemini securely (API keys stay server-side). You can change model names and max tokens here.

  > You may change the components of each AI's API: The default is max_tokens = 1000, and the following models: gpt-4o (ChatGPT), 2.5-flash (Gemini), 4 sonnet (Clause). You may adjust these to your liking.

  > You can find more information about each AI's models on their official API website, and choose the model that best fits your needs.

# Code Overview:

Here you can find important information about all pages:

| Folder                                  | Brief Information                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Components Folder](#Components_Folder) | Reusable UI building blocks (e.g., buttons, modals, editor parts) used across the app.           |
| [AI Options Folder](#AI_Options_Folder) | Code that handles the AI chat/providers (ChatGPT/Claude/Gemini), message sending, and responses. |
| [Pages Folder](#Pages_Folder)           | Full screens/routes of the app (each page is a main view the user can navigate to).              |
| [App CSS](#App.css)                     | Main styling file that controls the app’s look (colors, spacing, layout, chat bubbles, etc.).    |

## Components Folder

Here, you will find information about ChatGPT, Claude or Gemini's API, the text editor, and the updated data. For each AI, you can only change the specific model of AI, number of tokens, etc. See information about AI_API.js for relevant information.

- **_LogTable.js_**: A React functional component that receives an array of logs and displays each log’s timestamp and text in a two-column HTML table.
- **_Modal.js_**: A popup window that shows a message and buttons to confirm or cancel.
- **_QuillTextEditor.js_**: The text editor part, with a custom toolbar (and optional “AI Assistant” button) that can block pasting, track what the user types over time with timestamps, and send the latest text to the parent for things like word count.
- **_Button.js_**: A clickable button that can run a function and then take the user to a different page in the app.
- [**_AI_Options Folder_**](#AI_Options_Folder).

### AI_Options Folder:

This folder contains:

- **Message Components subfolder**:

  > **_MessageHistory.js_**: A chat message list that automatically scrolls down to show the newest message whenever a new message is added.

  > **_MessageInput.js_**: A message box that lets the user type a chat message and send it by clicking Send or pressing Enter.

- **_AI_API.js_**: A chat component that sends your messages (plus your current writing) to the backend proxy (`/api/ai`) and shows the AI’s replies on the screen.

  > AI settings such as model names and max tokens are configured in the backend (`backend/server.js`) because the backend is the part that communicates with OpenAI/Claude/Gemini securely.

## Pages Folder

This folder includes your conditions, link address, and thankyou webpage which shows up after the users submit their texts. For more information, see each code's comments.

- **_Routes.js_**: Responsible for the "tree" of the website links. Here, you can add the route to your conditions.
- **_ThankYou.js_**: This is the webpage users see after submitting their texts. You can adjust the instructions there according to the flow of your experiment.
- **_AIStillPage.js_**: This is the first condition, where users immediately have access to the AI, and cannot close the AI. Feel free to look for `CONFIG YOU WILL EDIT` for recommended changes.
- **_ButtonPress.js_**: The AI starts CLOSED and opens only if the participant clicks the AI button in the editor toolbar. We log when the AI was first opened (ms after page load) plus chat open/close/collapse events and submission attempts. Feel free to look for `CONFIG YOU WILL EDIT` for recommended changes.
- **_AIOpensAndCloses.js_**: The AI assistant opens automatically after 20 seconds, and participants can open and close the AI chat interface. Feel free to look for `CONFIG YOU WILL EDIT` for recommended changes.
- **_OnlyEditor.js_**: Participants write with no AI assistant (editor-only baseline). Feel free to look for `CONFIG YOU WILL EDIT` for recommended changes.
- **_OnlyAI.js_**: Participants chat with the AI only (no text editor). Feel free to look for 'CONFIG YOU WILL EDIT' for recommended changes.

## App.css

App.css is the main file that controls how the app looks (colors, spacing, fonts, layout).

To preview and debug style changes, open **Chrome DevTools**:

- **Windows/Linux:** press `F12` or `Ctrl + Shift + I`
- **Mac:** press `Cmd + Option + I`
- Or: **Right-click** anywhere on the page → **Inspect**

Then click the **Elements** tab, select an element on the page, and you’ll see the CSS rules (including from `App.css`) on the right side.

## Test your code locally

- Make sure your `backend/.env` is in `.gitignore` so your environment variables are not uploaded to your repository in github.

- Open **two terminals** (one for the backend, one for the frontend).

### Terminal 1 (Backend)

````
```bash
cd backend
npm install   # first time only
npm start
````

### Terminal 2 (frontend)

```
cd ..
npm install   # first time only
npm start
```

The app should open in your browser (usually at http://localhost:3000). To access your conditions, you add to your website line `/x` depending on the wording you chose in [Routes.js](#Pages_Folder)

To stop the local code from running, press `Ctrl+C`.

> `npm install` is needed the first time you set up the project (or any time `package.json` changes).  
> After that, you can usually run only `npm start`.

## Upload your code (ready-to-run): Amazon Web Services (AWS)

If you wish to deploy your website (we recommend doing so in order to make sure this version of the code runs smoothly), you need to have an AWS account.

Throughout the steps, please note that you choose ur console's region (you can view your current region on the top left, next to your name).

1.  To create an account, please [**click here**](portal.aws.amazon.com/billing/signup).
2.  Choose a region you’ll use consistently (example: `eu-north-1`).

3.  **Create an S3 bucket (for storing files)**
    1. In AWS Console, search **S3** → open it
    2. Click **Create bucket**
    3. Choose a bucket name (must be globally unique)
    4. Choose your AWS Region (example: `eu-north-1`) and keep using this region
    5. Click **Create bucket**
    6. Click Permissions, and scroll down to Cross-origin resource sharing (CORS). click edit, and paste the content of `cors.txt` there.
    7. In your `backend/.env`, add the following row: `REACT_APP_BucketS3=BUCKET_NAME`. This is the environment variable for your S3 bucket.

4.  **Create a Lambda function (backend)**
    1.  In AWS Console, search **Lambda** → open it.
    2.  Click **Create function** → **Author from scratch**.
    3.  Name: `ai-proxy` → create function.
    4.  In **Code source**, delete the default code and paste the entire content of `lambda/index.mjs`.
    5.  Click Deploy.
    6.  **Give Lambda permission to use S3 (no keys needed)**
    - In the Lambda function page: **Configuration** → **Permissions**
    - Under Execution role, click the role name (appears in blue).
    - In the new link that opens, click **Add permissions** → **Attach policies**. Attach a policy like: `AmazonS3FullAccess` (This is how Lambda can access S3 securely without any AWS keys).
    - Return again to Configuration → General Configuration, and change timeout to 1 min.
    7.  **Add your AI API keys to Lambda (safe storage)**
        - Press Configuration → Environment variables
        - Click edit, add, and add all the AI keys (even the empty ones) and your S3 bucket variable.
    8.  **Create an API Gateway endpoint**
        - In AWS Console, search **API Gateway**
        - Click Create API → choose HTTP API → Build
        - Integration: Lambda → select `ai-proxy` (with the same region).
        - Add a route: Method: `POST`, Path: `/api/ai`, and Method: `POST`, Path: `/api/logs`.
        - Click create.
        - On the left, under `develop`, click CORS.
        - Click configure, for Access-Control-Allow-Origin, enter `*`, for allowed methods, choose `POST, OPTIONS`, and for Access-Control-Allow-Headers enter `Content-Type`.
        - Click save.
        - On your left, click on `API:NAME`, and copy the url you find under invoke url.
    9.  **Create an Amplify app (connect it to GitHub)**
        - In AWS Console, search Amplify → open it.
        - Click Create new app → Host web app.
        - Choose GitHub → Continue.
        - Authorize AWS Amplify to access your GitHub (first time only).
        - Select:

          > Repository: your repo

          > Branch: the branch you pushed

          > Click Next → Next → Save and deploy

        - Click on Hosting, environment variables, and add:
          `REACT_APP_API_BASE = UR_INVOKE_URL` >Amplify will build and give you a website URL.

## Download your submissions

1. To download your submissions, you can access your S3 bucket and download each file.txt alone.
2. To bulk download your submissions, follow the next few steps:

   **Create an IAM user for CLI** 2. AWS Console → IAM 3. Left menu → Users → Create user 4. Username: cli-downloader (or anything) 5. Permissions: choose Attach policies directly, create policy, JSON, and paste the content of `s3_policy_download.json` → create policy. Choose your policy and press next, then create user. 6. Click on your IAM new user name you just created, on security credentials, and create access key. Please select **Command Line Interface CLI**. Copy both the **access key** and **secret access** key and save them in a private place.

   **Install AWS CLI** using the following [**link**](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

   **In your CMD**

   ```
   aws configure (will ask you to include your keys, and region)
   aws s3 sync s3://YOUR_BUCKET_NAME "PATH/TO/Local/Folder"
   ```

# Optional code uses:

The following code is written in python, in case you do not have python installed, please install it from [the official Python page](https://www.python.org/downloads/).

We provide in the `CodeAnalysisData` folder:

- **_getPlainTexts.py_**: A code that receives the .txt folder path, and extracts the last version of the text (as a plain text) for usage. Please read the comments in the code, as you can also merge the texts with your data according to the codes/texts' names.
- **_getMessageInCSV.py_**: A code that receives the .txt folder path, and extracts the messages between the chatbot and user (as a csv file) for usage. The csv file includes a timestamp column, a sender column, and a message content column.

That's it! Please feel free to contact me atil@campus.technion.ac.il or atilxmansour@gmail.com for any questions.
