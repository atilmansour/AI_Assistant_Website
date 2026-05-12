# Azure Deployment Guide

This guide describes an Azure-equivalent deployment for the platform.

> [!IMPORTANT]
> The current production backend in this repository is AWS-specific: [`lambda/index.mjs`](../../lambda/index.mjs) uses AWS Lambda and S3. Azure deployment is therefore not a zero-click redeploy. To deploy on Azure, add an Azure Functions backend that exposes the same endpoints and saves logs to Azure Blob Storage.

## AWS-to-Azure Service Mapping

| Current AWS role | Azure equivalent | Notes |
| --- | --- | --- |
| AWS Amplify | Azure Static Web Apps | Hosts the React frontend and can integrate with GitHub Actions. |
| AWS Lambda | Azure Functions | Runs server-side API code and keeps API keys private. |
| API Gateway HTTP API | Azure Functions HTTP triggers, optionally Azure API Management | Functions can expose HTTP endpoints directly; API Management is optional for larger deployments. |
| S3 | Azure Blob Storage | Stores one JSON `.txt` file per submitted session. |
| Lambda environment variables | Function App application settings | Stores LLM keys, storage connection strings, and admin password. |

Useful Microsoft documentation:

- Azure Static Web Apps: <https://learn.microsoft.com/en-us/azure/static-web-apps/>
- Deploy a React app to Azure Static Web Apps: <https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-react>
- Azure Functions HTTP triggers: <https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger>
- Azure Functions app settings: <https://learn.microsoft.com/en-us/azure/azure-functions/functions-how-to-use-azure-function-app-settings>
- Azure Blob Storage JavaScript SDK: <https://learn.microsoft.com/en-us/azure/storage/blobs/quickstart-blobs-javascript-browser>
- Azure Storage CORS: <https://learn.microsoft.com/en-us/rest/api/storageservices/Cross-Origin-Resource-Sharing--CORS--Support-for-the-Azure-Storage-Services>

## Recommended Azure Architecture

```text
Participant browser
  |
  | Azure Static Web Apps hosts React frontend
  v
Azure Functions HTTP API
  |
  | /api/ai
  | /api/logs
  | /api/admin/login
  | /api/admin/sessions
  v
Azure Blob Storage container
  |
  | one session file per participant submission
  v
Researcher dashboard and analysis scripts
```

## What Must Be Added for Azure

The frontend already calls generic API paths:

```text
POST   /api/ai
POST   /api/logs
POST   /api/admin/login
GET    /api/admin/sessions
DELETE /api/admin/sessions
```

That means the React frontend can work with Azure if `REACT_APP_API_BASE` points to an Azure Functions API that implements those same routes.

You need an Azure backend adapter that:

1. receives the same request bodies as the current AWS backend
2. calls the same LLM providers
3. stores logs in Azure Blob Storage instead of S3
4. lists, reads, and deletes session files for the dashboard
5. returns CORS headers for success and error responses
6. uses Azure application settings for secrets

## 1. Create an Azure Resource Group

In the Azure Portal:

1. Open **Resource groups**.
2. Click **Create**.
3. Choose your subscription.
4. Name the group, for example `llm-experiment-platform`.
5. Choose a region.
6. Create the group.

Use this resource group for the Static Web App, Function App, and Storage Account.

## 2. Create Azure Blob Storage

1. Open **Storage accounts**.
2. Click **Create**.
3. Choose your resource group.
4. Choose a globally unique storage account name.
5. Choose the same region.
6. Create the account.

Create a container:

1. Open the storage account.
2. Go to **Data storage** -> **Containers**.
3. Click **+ Container**.
4. Name it, for example `experiment-logs`.
5. Keep public access disabled.

Recommended environment variables:

```env
AZURE_STORAGE_CONNECTION_STRING=your_storage_connection_string
AZURE_STORAGE_CONTAINER=experiment-logs
```

> [!CAUTION]
> Keep the storage connection string in Azure application settings. Do not put it in frontend `.env.local` or commit it to GitHub.

## 3. Add an Azure Functions Backend

Create a new backend folder such as:

```text
azure-functions/
```

It should implement the same logical behavior as:

- [`backend/server.js`](../../backend/server.js) for local Express behavior
- [`lambda/index.mjs`](../../lambda/index.mjs) for deployed AWS behavior

Suggested dependencies:

```bash
npm install @azure/functions @azure/storage-blob
```

Core storage operations should map like this:

| Current S3 operation | Azure Blob equivalent |
| --- | --- |
| `putObject` | `blockBlobClient.upload(...)` |
| `getObject` | `blobClient.download()` |
| `listObjectsV2` | `containerClient.listBlobsFlat()` |
| `deleteObject` | `blobClient.deleteIfExists()` |

The Azure Functions backend must expose:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/ai` | Calls OpenAI, Claude, Gemini, or Groq. |
| `POST` | `/api/logs` | Saves `{ logs }` as `<logs.id>.txt`. |
| `POST` | `/api/admin/login` | Returns dashboard token when password is valid. |
| `GET` | `/api/admin/sessions` | Lists and summarizes log files. |
| `DELETE` | `/api/admin/sessions` | Deletes selected log file. |

> [!TIP]
> Keep the response shape identical to the current backend. Then the dashboard does not need to know whether the data came from AWS S3 or Azure Blob Storage.

## 4. Configure Azure Function App Settings

In the Azure Portal:

1. Open your Function App.
2. Go to **Settings** -> **Environment variables** or **Configuration**.
3. Add the required values.

Recommended settings:

```env
OPENAI_KEY=Bearer your_openai_key
GEMINI_KEY=your_gemini_key
CLAUDE_KEY=your_claude_key
GROQ_KEY=Bearer your_groq_key

ADMIN_PASSWORD=your_private_dashboard_password
ALLOWED_ORIGINS=https://your-static-web-app-url.azurestaticapps.net,http://localhost:3000

AZURE_STORAGE_CONNECTION_STRING=your_storage_connection_string
AZURE_STORAGE_CONTAINER=experiment-logs
```

> [!NOTE]
> Azure Functions app settings are exposed to backend code as environment variables.

## 5. Configure CORS

The Function App should allow your Static Web App origin.

Allow:

```text
https://your-static-web-app-url.azurestaticapps.net
http://localhost:3000
```

Allowed methods:

```text
GET, POST, DELETE, OPTIONS
```

Allowed headers:

```text
Content-Type, Authorization, X-Admin-Token
```

Also make sure the function code returns CORS headers on errors, not only successful responses.

## 6. Deploy the React Frontend to Azure Static Web Apps

1. Open the Azure Portal.
2. Search for **Static Web Apps**.
3. Click **Create**.
4. Choose your subscription and resource group.
5. Choose a name.
6. Choose a region.
7. Under deployment details, choose **GitHub**.
8. Authorize Azure to access your repository.
9. Select your repository and branch.
10. Set app location to:

```text
/
```

11. Set output location to:

```text
build
```

12. Create the Static Web App.

Azure will add a GitHub Actions workflow to build and deploy the React app.

## 7. Set the Frontend API Base URL

For Create React App, environment variables used by the frontend must exist at build time.

Set:

```env
REACT_APP_API_BASE=https://YOUR_FUNCTION_APP_URL
```

Then redeploy the Static Web App.

> [!IMPORTANT]
> If `REACT_APP_API_BASE` is missing at build time, the deployed frontend may call the wrong URL or fail with `Failed to fetch`.

## 8. Test the Azure Deployment

Test in this order:

1. Open the Static Web App URL.
2. Open `/c`, submit a control test session.
3. Confirm a blob appears in the `experiment-logs` container.
4. Open `/u`, `/o`, `/b`, and `/a`, and submit one test session per condition.
5. Open `/admin/login`.
6. Log in with `ADMIN_PASSWORD`.
7. Confirm sessions appear in the dashboard.
8. Export table-only CSV/JSON.
9. Export full-session CSV/JSON.
10. Delete one disposable test session.

## Beginner Troubleshooting

| Problem | What it usually means | Where to look |
| --- | --- | --- |
| Frontend builds but API fails | `REACT_APP_API_BASE` is wrong or missing. | Static Web Apps build settings and browser Network tab. |
| Login fails with CORS | Function App CORS or response headers are incomplete. | Function App CORS settings and function code. |
| Logs do not save | Blob Storage env vars or permissions are missing. | Function App application settings and Azure logs. |
| Dashboard is empty | Admin sessions endpoint cannot list blobs. | `/api/admin/sessions` function and storage container. |
| LLM call fails | Provider API key is missing or invalid. | Function logs and provider dashboard. |

## Production Recommendations

- Use a storage container dedicated to one study or study family.
- Use a strong `ADMIN_PASSWORD`.
- Restrict CORS to your real Static Web App domain.
- Keep LLM and storage secrets in Azure Function App settings.
- Run a pilot session in every condition before collecting real data.
- Download and back up logs regularly during active data collection.
