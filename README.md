# HRMS AI Agent

Node.js HRMS assistant that uses GitHub Models/OpenAI tool calling to automate HRMS workflows from natural language.

## Features

- HRMS login with Microsoft SSO
- User-specific JWT session handling
- Leave and WFH request preview + confirmation
- Assigned project lookup
- Punch report lookup
- Leave context and all-employee leave lookup
- Holiday lookup tool, pending HRMS endpoint requirements

## Setup

```bash
npm install
cp .env.example .env
```

Set either `OPENAI_API_KEY` or `GITHUB_TOKEN` in `.env`.
If using GitHub marketplace models, set `GITHUB_MODEL=openai/o4-mini`.
Add any required HRMS values such as `HRMS_API_BASE_URL`, `TENANT_ID`, `HRMS_MARK_LEAVE_PATH`, `CONTACT_NUM`, or `PO_ID` as needed.

## Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Check

```bash
npm run check
```
