# AWS Deployment Guide

This guide preserves the original AWS deployment workflow and reorganizes it into a more beginner-friendly checklist.

The AWS deployment uses:

| Project layer | AWS service |
| --- | --- |
| Frontend website | AWS Amplify |
| API endpoint | API Gateway HTTP API |
| Backend code | AWS Lambda |
| Experiment logs | S3 bucket |
| Backend secrets | Lambda environment variables |

> [!IMPORTANT]
> Work in one AWS Region consistently. If you create S3 in one region and Lambda/API Gateway in another, permissions and integrations become harder to debug.

## Before You Start

You need:

- an AWS account
- a GitHub account
- your fork of this repository pushed to GitHub
- LLM API keys for the provider(s) you plan to use
- an admin password for the dashboard

The frontend calls one backend base URL through:

```env
REACT_APP_API_BASE=https://YOUR_API_GATEWAY_URL
```

Do not put LLM API keys in the frontend.

## 1. Create an AWS Account and Choose a Region

1. Create an AWS account: <https://portal.aws.amazon.com/billing/signup>
2. Choose one region, for example `eu-north-1` or `us-east-1`.
3. Use the same region for S3, Lambda, API Gateway, and Amplify where possible.

## 2. Create an S3 Bucket for Experiment Logs

1. Open the AWS Console.
2. Search for **S3**.
3. Click **Create bucket**.
4. Choose a globally unique bucket name.
5. Choose your AWS Region.
6. Click **Create bucket**.

Then configure bucket CORS:

1. Open the bucket.
2. Go to **Permissions**.
3. Scroll to **Cross-origin resource sharing (CORS)**.
4. Click **Edit**.
5. Paste the CORS configuration from [`src/cors.txt`](../../src/cors.txt).
6. Save.

In your local `backend/.env`, set:

```env
REACT_APP_BucketS3=YOUR_BUCKET_NAME
```

> [!NOTE]
> For deployed Lambda, prefer giving Lambda permission through its IAM execution role instead of storing AWS access keys inside Lambda.

## 3. Create the Lambda Function

1. Open the AWS Console.
2. Search for **Lambda**.
3. Click **Create function**.
4. Choose **Author from scratch**.
5. Name the function, for example `ai-proxy`.
6. Choose a Node.js runtime.
7. Create the function.

### Add the Lambda Code

1. Open your new Lambda function.
2. In **Code source**, delete the default code.
3. Paste the contents of [`lambda/index.mjs`](../../lambda/index.mjs).
4. Click **Deploy**.

If your Lambda deployment process packages dependencies, use the files in `lambda/`:

```bash
cd lambda
npm install
```

Then package `index.mjs`, `package.json`, `package-lock.json`, and `node_modules/` into a deployment ZIP. Do not commit the ZIP or `node_modules/` to GitHub.

### Give Lambda Permission to Use S3

1. In the Lambda page, open **Configuration**.
2. Open **Permissions**.
3. Click the Lambda execution role name.
4. In IAM, click **Add permissions**.
5. Attach a policy that allows the required S3 actions.

For quick testing, the original tutorial used `AmazonS3FullAccess`. For production, prefer a narrower policy limited to your study bucket.

Minimum actions usually needed:

- `s3:PutObject`
- `s3:GetObject`
- `s3:ListBucket`
- `s3:DeleteObject` if dashboard deletion should work

### Increase Lambda Timeout

1. Open **Configuration**.
2. Open **General configuration**.
3. Set timeout to about `1 min`.
4. Save.

## 4. Add Lambda Environment Variables

Open the Lambda function:

1. Go to **Configuration**.
2. Open **Environment variables**.
3. Add the values your experiment needs.

Recommended variables:

```env
OPENAI_KEY=Bearer your_openai_key
GEMINI_KEY=your_gemini_key
CLAUDE_KEY=your_claude_key
GROQ_KEY=Bearer your_groq_key

REACT_APP_BucketS3=your_s3_bucket_name
ADMIN_PASSWORD=your_private_dashboard_password
ALLOWED_ORIGINS=https://your-amplify-domain.amplifyapp.com,http://localhost:3000
```

> [!CAUTION]
> Never commit real API keys, admin passwords, or AWS credentials to GitHub.

## 5. Create an API Gateway HTTP API

1. Open the AWS Console.
2. Search for **API Gateway**.
3. Click **Create API**.
4. Choose **HTTP API**.
5. Choose **Build**.
6. Add Lambda integration and select your `ai-proxy` Lambda in the same region.

Create routes for the current project:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/ai` | Calls the selected LLM provider. |
| `POST` | `/api/logs` | Saves submitted experiment logs to S3. |
| `POST` | `/api/admin/login` | Authenticates dashboard access. |
| `GET` | `/api/admin/sessions` | Lists saved sessions for the dashboard. |
| `DELETE` | `/api/admin/sessions` | Deletes a selected session. |
| `OPTIONS` | each route, or global CORS | Supports browser preflight requests. |

> [!IMPORTANT]
> If `/api/admin/login` is missing, the deployed dashboard will fail with `404 Not Found`, and the browser may also show a CORS error because API Gateway generated the 404 response.

## 6. Configure API Gateway CORS

In API Gateway:

1. Open your HTTP API.
2. Under **Develop**, click **CORS**.
3. Configure:

```text
Access-Control-Allow-Origin: your Amplify domain
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Token
```

For early testing, `*` can help isolate CORS problems. For a real study, use your actual Amplify domain.

The Lambda code also returns CORS headers for success and error responses. Both layers should agree.

## 7. Copy the API Invoke URL

Open your API Gateway overview and copy the **Invoke URL**.

It will look similar to:

```text
https://abc123.execute-api.us-east-1.amazonaws.com
```

Use this value as `REACT_APP_API_BASE`.

Do not add `/api/ai` or `/api/logs` to the environment variable. The frontend adds those paths itself.

## 8. Deploy the Frontend with AWS Amplify

1. Open the AWS Console.
2. Search for **Amplify**.
3. Click **Create new app**.
4. Choose **Host web app**.
5. Choose GitHub.
6. Authorize Amplify if this is your first time.
7. Select your repository and branch.
8. Continue through the build setup.
9. Add the frontend environment variable:

```env
REACT_APP_API_BASE=https://YOUR_API_GATEWAY_INVOKE_URL
```

10. Save and deploy.

Amplify will build the React app and provide a public website URL.

> [!NOTE]
> React environment variables are baked into the built frontend. If you change `REACT_APP_API_BASE`, redeploy the frontend.

## 9. Test Before Running a Study

Before recruiting participants:

- open every condition route
- submit a test session in every condition
- confirm a `.txt` file appears in S3
- open `/admin/login`
- log in with `ADMIN_PASSWORD`
- confirm the dashboard lists the test sessions
- test CSV and JSON exports
- delete a disposable test session

Recommended condition URLs:

```text
/c
/u
/o
/b
/a
/admin/login
```

## 10. Download Submissions from S3

You can download individual `.txt` files directly from the S3 Console.

For bulk download, use the AWS CLI.

### Create an IAM User for CLI Download

1. Open **IAM**.
2. Go to **Users**.
3. Click **Create user**.
4. Name the user, for example `cli-downloader`.
5. Choose **Attach policies directly**.
6. Create a policy from [`s3_policy_download.json`](../../s3_policy_download.json), or create a narrower bucket-specific policy.
7. Attach the policy.
8. Create the user.
9. Open **Security credentials**.
10. Create an access key for **Command Line Interface (CLI)**.
11. Store the access key and secret access key privately.

> [!WARNING]
> The included `s3_policy_download.json` is broad. It is convenient for setup, but for production you should restrict access to the exact experiment bucket.

### Install and Use AWS CLI

Install AWS CLI:

<https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>

Configure it:

```bash
aws configure
```

Download all submissions:

```bash
aws s3 sync s3://YOUR_BUCKET_NAME "PATH/TO/Local/Folder"
```

## 11. Integrate with a Larger Survey Study

If this platform is used inside a larger study, include participant instructions like:

```text
Please open the writing task in a new tab.
When you finish, click Submit.
After submission, you will receive a completion code.
Copy that code into the survey box below to continue.
```

The completion code is also the saved `.txt` file name, which lets you match writing logs with survey responses.

## Troubleshooting

| Problem | Likely cause | Fix |
| --- | --- | --- |
| `Failed to fetch` | Frontend cannot reach API Gateway. | Check `REACT_APP_API_BASE`, redeploy Amplify, and inspect browser Network tab. |
| `404` on `/api/admin/login` | API Gateway route is missing or not integrated with Lambda. | Add `POST /api/admin/login` and redeploy the API stage. |
| CORS error | API Gateway or Lambda response lacks allowed origin headers. | Configure API Gateway CORS and set `ALLOWED_ORIGINS` in Lambda. |
| `ADMIN_PASSWORD is not configured` | Lambda env var missing. | Add `ADMIN_PASSWORD` to Lambda environment variables. |
| Logs do not save | Missing bucket env var or Lambda lacks S3 permission. | Check `REACT_APP_BucketS3`/`BUCKET_NAME` and IAM role permissions. |
| LLM replies fail | Provider key missing or invalid. | Check provider env vars and CloudWatch Lambda logs. |

## AWS Documentation Links

- AWS Lambda: <https://docs.aws.amazon.com/lambda/>
- API Gateway HTTP APIs: <https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html>
- Amazon S3: <https://docs.aws.amazon.com/s3/>
- AWS Amplify Hosting: <https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html>
- AWS CLI install guide: <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>
