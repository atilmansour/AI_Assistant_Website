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
   `     git checkout -b my-change
    `
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

# Amazon Web Services (AWS)

To get ready AWS >>>>>>>>

# Enviroment Variables

After you finished all the above steps, create a new file called: ".env.local"

- In this file you will need to write 6 rows, just like this:
  ```
  REACT_APP_SECRET_ACCESS_KEY=Your secret key
  REACT_APP_ACCESS_KEY_ID= Your key
  REACT_APP_BucketS3=Your s3 bucket name
  REACT_APP_GPT_KEY=Your GPT key
  REACT_APP_CLAUDE_KEY=Your claude key
  REACT_APP_GEMINI_KEY=Your gemini key
  ```
- Depending on which AI you will use, you will need to generate a key.

  Note that if you want to use only some of the following AI's you can leave the key empty.
  For example, if you only want to use ChatGPT as your AI, you can write `REACT_APP_GEMINI_KEY=''` and `REACT_APP_CLAUDE_KEY=''`:
  1. To generate ChatGPT key: `REACT_APP_GPT_KEY=Bearer XXXX`

     To get a GPT key, go to [OpenAI API's official website](https://openai.com/api/). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to ChatGPT.

  2. To generate Claude key: `REACT_APP_CLAUDE_KEY=sk-ant-api03-...`

     To generate a claude key, go to [Claude API's official website](https://claude.com/platform/api). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Claude.

  3. To generate Gemini key: `REACT_APP_GEMINI_KEY=AIzaSy...`
     To generate a claude key, go to [Gemini API's official website](https://ai.google.dev/gemini-api/docs/api-key). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Gemini.

- For the other environment keys, please go to the [Amazon Web Services (AWS) section](<#Amazon_Web_Services_(AWS)>)

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

- **_AI_API.js_**: A chat component that sends your messages (plus your current writing) to ChatGPT/Claude/Gemini and shows the AI’s replies on the screen.

  > You may change the components of each AI's API: The default is max_tokens = 1000, and the following models: gpt-4o (ChatGPT), 2.5-flash (Gemini), 3.5 sonnet (Clause). You may adjust these to your liking.

  > You can find more information about each AI's models on their official API website, and choose the model that best fits your needs.

## Pages Folder

This folder includes your conditions, link address, and thankyou webpage which shows up after the users submit their texts. For more information, see each code's comments.

- **_Routes.js_**: Responsible for the "tree" of the website links. Here, you can add the route to your conditions.
- **_ThankYou.js_**: This is the webpage users see after submitting their texts. You can adjust the instructions there according to the flow of your experiment.

## App.css

App.css is the main file that controls how the app looks (colors, spacing, fonts, layout).

To preview and debug style changes, open **Chrome DevTools**:

- **Windows/Linux:** press `F12` or `Ctrl + Shift + I`
- **Mac:** press `Cmd + Option + I`
- Or: **Right-click** anywhere on the page → **Inspect**

Then click the **Elements** tab, select an element on the page, and you’ll see the CSS rules (including from `App.css`) on the right side.

## Test your code locally

- Make sure your `.env.local` is in `.gitignore` so your environment variables are not uploaded to your repository in github.
- Start the app (local testing only):
  ```
  npm start
  ```
  The app should open in your browser (usually at http://localhost:3000). To access your conditions, you add to your website line `/x` depending on the wording you chose in [Routes.js](#Pages_Folder)
- To stop the local code from running, press `Ctrl+C`.

## Upload your code (ready-to-run):
