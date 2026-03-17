# A Tutorial for Building and Deploying a Web Application Platform for Experiments with Conversational AI

The tutorial introduces free open-source code, with detailed step-by-step instructions including the installation of the code, building experimental conditions, the deployment of the web application, and data cleaning suggestions. The open-source code is accompanied by detailed instructions and recommendations for adjustments to your needs and preferences. 

Throughout the code files, look for relevant change suggestions (e.g., conversational AI's present messages) by searching for `CONFIG YOU WILL EDIT` comments. These comments were written to allow optional user-friendly customization. 

Note that, although accessing the code is completely free to use, the code requires AI API keys and deployment on AWS, which may incur usage costs. For pricing, see the relevant sections and the official API website and AWS for more details.

The README file offers a step-by-step instructions that are divided into four main steps:

1. [Installation and Local Setup](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-1-installation-and-local-setup)
   1. [Installing Required Applications](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-11-installation-required-applications)
   2. [Local Setup and Environment Variables](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-12-local-setup-and-environment-variables)
2. [Preparing your experimental conditions](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-2-preparing-your-experimental-conditions)
   1. [Choose your experimental conditions according to your research goals](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-21-choose-your-experimental-conditions-according-to-your-research-goals)
   2. [Details regarding each experimental condition](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-22-details-regarding-each-experimental-condition-)
   3. [Editing your experimental conditions](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-23-editing-your-experimental-conditions)
3. [Local Testing and Deployment](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-3-local-testing-and-deployment)
   1. [Local testing to make sure your conditions look as you expect them to look](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-31-local-testing-to-make-sure-your-conditions-look-as-you-expect-them-to-look)
   2. [Deployment to AWS so your experiment is ready to run](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-32-deployment-to-aws-so-your-experiment-is-ready-to-run)
   3. [Downloading the submissions](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#download-your-submissions)
4. [Data Cleaning](https://github.com/atilmansour/AI_Assistant_Website?tab=readme-ov-file#step-4-data-cleaning)

# <code>_Step 1: Installation and Local Setup_</code>

The first step is to have all the needed applications downloaded to your computer, so you can use the platform locally and easily make changes. 

# <code>_Step 1.1: Installation Required Applications_</code>

First, you need to install the required applications and download a copy of the platform and source code from GitHub, in order for the platform to run locally.

# Download GitHub

The first step is to create a GitHub account and download the Git application on your computer so you can work with the repository.

To set up your computer, you need to download git on your laptop. Please use this link to download git: https://git-scm.com/install/ (you can keep the default settings).

Next, sign in (or sign up) into your account using the github downloaded on your laptop. The GitHub account is used to save the source code in an online repository and to help deploy it as a web application.

# Download This Repository

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
Throughout the code, you can look for relevant change suggestions by searching **`CONFIG YOU WILL EDIT`**. To search for this term across files, you can click `Ctrl+shift+f`. Now, you can make a small change just to test that your changes are being saved. For example, open the `ThankYou.js` file, which is located in `src/pages` folder, and change "Your submission was recorded!" to "This is the new submission message!".

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

# Download Node JS

First, make sure Node.js is downloaded (you can install the windows installer). This will allow you to locally test your code and make sure it looks as you expect it to look.

You can download it from the following website: https://nodejs.org/en/download

You may need to close and reopen your cmd and code folder that you are working on. To make sure Node JS is downloaded, run:

```
node -v
npm -v
```

# <code>_Step 1.2: Local Setup and Environment Variables_</code>

Next, you need to set up the platform locally and securely store the sensitive information (e.g., API Keys that provide access to LLMs) required to use the conversational AI. 

# Backend Folder (API and Environment Variables)

This project includes a `backend/` folder that runs a small server for:

1. Calling AI providers (ChatGPT / Claude / Gemini) securely.
2. Handling AWS actions (e.g., S3) securely.

**Why do we need a backend?**

- API keys and AWS secret keys must NOT be stored in the React frontend (so they don't become public after deployment).
- Some providers also block browser requests due to CORS.
- The backend keeps secrets server-side and returns only the needed data to the frontend.

### Backend environment variables

Create `backend/.env` file (name the file `.env` and put it in the `backend` folder) and add your secrets there.

- In this file you will need to write 6 rows, just like this:
  ```
  REACT_APP_SECRET_ACCESS_KEY=Your secret key
  REACT_APP_ACCESS_KEY_ID= Your key
  REACT_APP_BucketS3=Your s3 bucket name
  OPENAI_KEY=Your GPT key
  CLAUDE_KEY=Your claude key
  GEMINI_KEY=Your gemini key
  ```
- Depending on which LLM you will use, you will need to generate a key. Please note models' abilities and pricing.

  Note that if you want to use only some of the following LLMs, you can leave the key empty.
  For example, if you only want to use ChatGPT as your LLM, you can write `GEMINI_KEY=''` and `CLAUDE_KEY=''`:
  1. To generate ChatGPT key: `OPENAI_KEY=Bearer XXXX`

     Go to [OpenAI API's official website](https://openai.com/api/). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to ChatGPT.

  2. To generate Claude key: `CLAUDE_KEY=sk-ant-api03-...`

     Go to [Claude API's official website](https://claude.com/platform/api). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Claude.

  3. To generate Gemini key: `GEMINI_KEY=AIzaSy...`

     Go to [Gemini API's official website](https://ai.google.dev/gemini-api/docs/api-key). You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to Gemini.

- For the other environment keys, you can keep them empty for now, we will get back to them when we deploy the platform to AWS in [Amazon Web Services (AWS) section](<#Amazon_Web_Services_(AWS)>).
- **Make sure `backend/.env` is in `.gitignore`** (in your local code) before you push your code again to github. To do that, you need to have a line that says `backend/.env` inside your .gitignore file.

- **_backend/server.js_**: This file calls ChatGPT/Claude/Gemini securely (API keys stay private). Here, you can change model names and max tokens here.

  > You may change the components of each AI's API: The default is max_tokens = 1000, and the following models: gpt-4o (ChatGPT), 2.5-flash (Gemini), 4 sonnet (Claude). You may adjust these to your liking.

  > You can find more information about each AI's models on their official API website, and choose the model that best fits your needs.

# <code>_Step 2: Preparing your Experimental Conditions_</code>

After downloading all the required applications, having your own copy of the code locally, and setting up the AI API keys, the second step is to prepare the experimental conditions you want to use in your experiments. Step 2 includes preparing and customizing the experimental conditions according to your purposes.

# <code>_Step 2.1: Choosing your experimental conditions according to your research goals_</code>

First, you need to define your goal, and follow the instructions below to find the experimental conditions most suitable for your goal. The platform allows you to choose between some or all of the five experimental conditions and to update them. Here, we provide a table which includes examples of experimental conditions that can be used to test different research questions. 

| Condition | Research Purpose |
| -------- | -------- |
| [No AI]() | This condition includes only a text editor. It allows examining your dependent variable (DV) without having access to a conversational AI, and can serve as a control condition to all others. |
| [Always Visible AI]() | This condition includes a text editor alongside a conversational AI window that remains visible throughout the task. It allows examining your DV when conversational AI is continuously available. |
| [Toggleable AI]() | This condition includes a text editor alongside a conversational AI window that participants can close and reopen. It allows examining your DV when participants have control over the visibility of the conversational AI window. |
| [Participant-Initiated AI]() | This condition includes a text editor alongside a conversational AI window that opens only after participants press a button. It allows examining your DV when participants initiate the conversational AI window rather than being proactively offered. |
| [Chat Only]() | This condition includes only the conversational AI window. It allows examining your DV when participants produce their writing only by interacting with the conversational AI, without an option to independently write in a text editor. |

# <code>_Step 2.2: Details regarding each experimental condition_ </code>

After defining your goal and deciding on the conditions needed to use for your research goals. Here, we provide more details about each condition to facilitate understanding.

After participants successfully submit their response, a pop-up message will instruct participants how to continue and include a code (Example code: PIA35BCB). This code is the name of the .txt file that contains participants' data (see Figure 1). All submission files are given a random 5-character code with an additional prefix and suffix to match the condition.

The following presents the five experimental conditions the platform offers in more detail, and instructions on how to duplicate conditions. Note that all conditions are located in the `src/pages` folder:

1. **No AI Condition**:
   - This condition includes only a text editor. Participants do not have the option to use conversational AI. The condition can serve as a control condition for all other conditions, where participants have the option to use conversational AI. 
   - **_Route Suffix_**: Add `/c` to the base link of the platform, can be adjusted in `Routes.js` file, located in the pages folder.
   - **_Default participant-code_**: A default prefix of "NA" and a suffix of C.

1. **Always Visible AI Condition**:
   - This condition includes a text editor and a conversational AI interface. Participants constantly have the option to use conversational AI. 
   - **_Differences from other conditions_**: In this condition, the conversational AI automatically appears next to participants' text editor after a set number of seconds (the default is 100 milliseconds, so the conversational AI appears immediately upon page load). Participants cannot control (close and reopen) the conversational AI interface. 
   - **_Route Suffix_**: Add `/u` to the base link of the platform, can be adjusted in `Routes.js` file, located in the pages folder.
   - **_Default participant-code_**: A default prefix of "AVA" and a suffix of U.

2. **Toggleable AI Condition**:
   - This condition includes a text editor and a toggleable conversational AI interface, meaning that participants can close and reopen the conversational AI. 
   - **_Differences from other conditions_**: Compared to the Always Visible AI condition, in which the AI is constantly visible, here, participants can close and reopen that conversational AI. 
   - **_Route Suffix_**: Add `/o` to the base link of the platform, can be adjusted in `Routes.js` file, located in the pages folder.
   - **_Default participant-code_**: A default prefix of "TA" and a suffix of O.
3. **Participant-Initiated AI Condition**:
   - This condition includes a text editor and a conversational AI interface, where the conversational AI appears only if participants choose to activate it themselves, by pressing a button in the text editor's toolbar. 
   - **_Differences from other conditions_**: . Compared to the conditions above, here, participants need to press a button to activate the conversational AI actively. 
   - **_Route Suffix_**: Add `/b` to the base link of the platform, can be adjusted in `Routes.js` file, located in the pages folder.
   - **_Default participant-code_**: A default prefix of "PI" and a suffix of B.

5. **Chat Only Condition**:
   - **_Purpose_**: This condition includes a conversational AI interface only. Here, participants produce their writing by interacting with the conversational AI without access to a separate text editor. 
   - **_Differences from other conditions_**: In this condition, participants do not have access to a text editor.
   - **_Route Suffix_**: Add `/a` to the base link of the platform, can be adjusted in `Routes.js` file, located in the pages folder.
   - **_Default participant-code_**: A default prefix of "OA" and a suffix of A.

> Note: In all conditions, participants who try to submit before they meet the adjustable word count threshold and minimum time spent in the writing task (default thresholds are 50 words and 3 minutes) will receive a customizable pop-up message. Moreover, in all conditions, after participants submit their responses, they are directed to a thank-you page (`thankyou.js` file, located in `src/pages` folder) that instructs participants on how to continue the study. Finally, in all conditions that include a conversational AI window, the window includes messages displayed to participants that can be customized or deleted. These messages can be customized to instruct or encourage participants to interact with the conversational AI.


**Creating new conditions**:

- **_Purpose_**: In addition to selecting the experimental conditions, several features within each of the conditions can be customized, and thus, allow the comparison of the condition and its duplicated version to compare certain features. Creating new conditions allows testing differences between several features of the same original condition, such as the option to copy and paste, LLMs powering the conversational AI, background information given to the conversational AI, etc. 
- **_How to duplicate_**:
  1. Create a new JavaScript file (.js file) by pressing the 'new file' button.
  2. Copy-paste the original condition's content into the new one.
  3. Change the name of the condition by going to the last line 'export default NAME' and changing all the appearances of the name to fit your new condition (press `Ctrl+F` to find all the appearances of the condition's name).
  4. Create a specific path to the new condition, access the `Routes.js` file, which is located in the `src/pages` folder. In the `Routes.js` file, add an import line `import NAME from "./JS_FILE_NAME";`, and a Route path, as instructed in the file's comments.

# <code>_Step 2.3: Editing your experimental conditions_</code>

After you decided on your research goal and got more familiar with the experimental conditions you will use. It is time to edit them!

For relevant change suggestions only, search **`CONFIG YOU WILL EDIT`** (press `Ctrl+F`) to find out about all appearances of the required or recommended adjustments in the experiemntal file.

We remind you that if you want to view all possible adjustments you can press `Shift+Ctrl+F` to search for `CONFIG YOU WILL EDIT` across files.

Moreover, make sure you are working with the LLM version you like, as specified earlier in step 1.2.

Finally, after the participants submit their responses, they are redirected to a thank-you page that instructs them on how to continue. Please edit the thank-you page by accessing the `thankyou.js` file, located in the `src/pages` folder, to match the flow of your study.

## App.css

App.css is the main file that controls how the app looks (colors, spacing, fonts, layout). Therefore, if you needed to change anything regarding the _style_ of the page, you will need to change the elements in `App.css`:

To preview and debug style changes, open **Chrome DevTools**:

- **Windows/Linux:** press `F12` or `Ctrl + Shift + I`
- **Mac:** press `Cmd + Option + I`
- Or: **Right-click** anywhere on the page → **Inspect**

Then click the **Elements** tab, select an element on the page, and you’ll see the CSS rules (including from `App.css`) on the right side.

# <code>_Step 3: Running and Deploying the Platform_</code>

By now, you have an experiment ready to run! The third step is to test the platform locally and make sure the experiment looks as desired, and then deploy it as a web application! 

# <code>_Step 3.1: Local testing to make sure your conditions look as you expect them to look_</code>

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

The app should open in your browser (usually at http://localhost:3000). To access your conditions, you add to your website line `/x` depending on the wording you chose in `Routes.js` file.

To stop the local code from running, press `Ctrl+C`.

> `npm install` is needed the first time you set up the project (or any time `package.json` changes).  
> After that, you can run only `cd XXX` depending on the terminal, and `npm start`.

# <code>_Step 3.2: Deploying the Web Application_</code>

## Upload your code (ready-to-run): Amazon Web Services (AWS)

Now that your experiment is ready to run, it is time to deploy it! For this step, you need to have an AWS account. Note that, the deployment of the web application may incur usage costs.

Throughout the steps, please note that you are working within the same console's region (you can view your current region on the top left, next to your name).

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
    - Return again to Configuration → General Configuration, and change timeout to 1 min (if you think your data will need more time, adjust the timeout accordinngly).
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
          `REACT_APP_API_BASE = UR_INVOKE_URL`

          > Amplify will build and give you a website URL.

**Imporatant Note**: After deploying the web application, we recommend testing all conditions to ensure that there are no errors before running the experiments, and conducting a pretest to ensure that the entire study runs smoothly. If any errors occur, please return to the relevant step, resolve the error, and repeat the instructions if necessary.  
# <code>_Step 3.3: Download your submissions_</code>

After deploying the platform, time to download the data so you can view the responses. We recommend trying the web application yourselves, submitting a response in each of your experimental conditions, then viewing the data to verify that all responses are saved.

1. To download your submissions, you can access your S3 bucket and download each file.txt alone.
2. To bulk download your submissions, follow the next steps:

   **Create an IAM user for CLI**
   1. AWS Console → IAM
   2. Left menu → Users → Create user
   3. Username: cli-downloader (or anything)
   4. Permissions: choose Attach policies directly, create policy, JSON, and paste the content of `s3_policy_download.json` → create policy. Choose your policy and press next, then create user.
   5. Click on your IAM new user name you just created, on security credentials, and create access key. Please select **Command Line Interface CLI**. Copy both the **access key** and **secret access** key and save them in a private place.

3. **Install AWS CLI** using the following [**link**](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

4. **In your CMD**

   ```
   aws configure (will ask you to include your keys, and region)
   aws s3 sync s3://YOUR_BUCKET_NAME "PATH/TO/Local/Folder"
   ```

# <code>_Step 4: Data Cleaning._</code>

The following code is written in python, in case you do not have python installed, please install it from [the official Python page](https://www.python.org/downloads/).

We provide in the `CodeAnalysisData` folder:

- **_getPlainTexts.py_**: A code that receives the .txt folder path, and extracts the last version of the text (as a plain text) for usage. Please read the comments in the code, as you can also merge the texts with your data according to the codes/texts' names.
- **_getMessageInCSV.py_**: A code that receives the .txt folder path, and extracts the messages between the conversational AI and participants (as a csv file) for usage. The csv file includes a timestamp column, a sender column, and a message content column.

That's it! Please feel free to contact me atil@campus.technion.ac.il or atilxmansour@gmail.com for any questions.
