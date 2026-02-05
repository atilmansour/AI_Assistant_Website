# AI_Assistant_Website

## Download GitHub

To set up your computer, you need to download git on your laptop.
Please use this link to download git: https://git-scm.com/install/

## Download This Repository

To get save this code and get it ready to edit, follow these few steps:

1. Click **Fork** (top-right on GitHub) to create your own copy of this repository.
2. Open your CMD
3. Go to the folder where you want to save the project using the following command: cd PATH/TO/FOLDER
4. Clone **your fork** to your computer:
   git clone https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
5. Move into project folder using cd AI_Assistant_Website
6. Add the original repository as upstream (so you can pull updates later), using the following commands:
   git remote add upstream https://github.com/atilmansour/AI_Assistant_Website
   git remote -v
7. Create a new branch for your changes:
   git checkout -b my-change

Now you are free to start editing and saving your changes locally and in github:

1. After you make changes
2. Save your changes:
   git add .
   git commit -m "Describe your change"
3. Push your changes to your fork:
   For the first time edits: git push -u origin my-change
   Afterwards, you can simply run: git push

## Download Node JS

First, make sure Node.js is downloaded (You can download it from the following website: https://nodejs.org/en/download)

## Enviroment Variables

- After you cloned the code, create a new file called: ".env.local"
- In this file you will need to write 4 rows, just like this:
  "REACT_APP_SECRET_ACCESS_KEY=AWS_SECRET_KEY
  REACT_APP_ACCESS_KEY_ID=AWS_KEY
  REACT_APP_BucketS3 = Name_of_S3_bucket"

- Depending on which AI you will use, you will need to generate a key:
  1. For ChatGPT: REACT_APP_GPT_KEY = Bearer XXXX
     To get a GPT_KEY, go to OpenAI API's official website. You will need to create an account, and get a personal key. It is important to keep this key private, as this is what allows you to connect to ChatGPT.

  2. For Claude: REACT_APP_CLAUDE_KEY =

  3. For Gemini: REACT_APP_GEMINI_KEY =

- For the other environment keys, please CHECK HON EDA ESA YRO7O TO AWS WALA LATERXXXXXXXXXXXXXXXXXXXX

## Code overview:

Here you can find important information about all pages:

## Components Folder

Here, you will find information about ChatGPT's API, the text editor, and the updated data. You can only change the model of ChatGPT, number of tokens, etc. See information about ChatGPT.js for relevant information.

- LogTable.js: Transforms the data into a table with a timestamp, and the text written in the text editor.
- Modal.js: XXXX
- QuillTextEditor.js: The text editor part. Here, we update the toolbar (showAI = include an AI button to open ChatGPT in the toolbar). The text editor saves a timestamp and the updated text after each space insert or deletion.
- ChatGPT Folder.

### ChatGPT Folder:

The subfolder MessageComponents handles message history and input, do not change anything there.
For the ChatGPT.js:

- You may change the components of ChatGPT's API - the current model is gpt-4o, with max_tokens = 1000. You may adjust these to your liking. You can find more information about ChatGPT's models in their official OpenAI API's website, and choose the model that best fits your needs.
- process.env.REACT_APP_GPT_KEY is the environment variable that includes your private key. Please make sure that you do not share it.

## Pages Folder

- This folder includes your conditions, link address, and thankyou webpage which shows up after the users submit their texts. For more information, see each code's comments.

- Routes.js: Responsible for the "tree" of the website links. Here, you can add the route to your conditions.
- ThankYou.js: This is the webpage users see after submitting their texts. You can adjust the instructions there according to the flow of your experiment.
