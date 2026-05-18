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

Set `GITHUB_TOKEN` in `.env`.

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
