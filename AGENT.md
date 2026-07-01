HRMS AI Agent
=============
Agent Response Style
--------------------
- Use very less and optimized tokens.
- Keep answers concise.
- Avoid long explanations unless explicitly asked.

Overview
--------
This repository implements an AI assistant that integrates with HRMS APIs to answer user questions and perform actions (apply leave, request WFH, submit DSR, fetch attendance, etc.) via an agentic OpenAI chat flow with tool support.

Key Components
--------------
- `app.js` - Express server and `/chat` endpoint (session handling).
- `workflows/hrmsWorkflow.js` - Main agent loop: builds messages, calls OpenAI, runs tools.
- `model/githubModel.js` - Creates OpenAI/GitHub model client and picks model.
- `tools/hrmsTools.js` - Tool adapters that call into `services/hrmsApi.js`.
- `services/hrmsApi.js` - HRMS API wrapper and endpoint fallbacks.
- `prompts/systemPrompt.js` - Agent system prompt that instructs the model on required behavior.
- `session/sessionStore.js` - In-memory session store used by the server.

Available Tools (names and required params)
-------------------------------------------
- `get_employee_leave_context` : no params
- `get_employee_attendance` : `{ year }`
- `get_all_employee_leaves` : no params
- `get_upcoming_holidays` : `{ skip, limit }`
- `get_punch_reports` : `{ monthCount }`
- `get_assigned_projects` : `{ skip, limit, status }`
- `get_current_year_holidays` : no params
- `get_leave_type_leave_count` : `{ userId }` (optional)
- `get_active_tickets` : `{ userId }` (optional)
- `get_punch_logs` : no params
- `get_project_team_report` : `{ userId }` (optional)
- `submit_daily_status_report` : `{ tasks: [...] }`
- `mark_down_time` : downtime payload (see schema in `tools/hrmsTools.js`)
- `create_support_ticket` : `{ assigned_to, description, priority, title }`
- `get_department_dropdown` : no params
- `apply_employee_leave` : `{ fromDate, toDate, leaveReason, leaveType, leaveDuration }` (only after explicit preview confirmation)

Primary User-Facing Modules
---------------------------
The agent supports the following high-level HRMS workflows (these map to tools + backend APIs):
- Leave: preview and apply employee leave requests (including back-dated and multi-day requests)
- WFH (work from home): apply WFH using the same leave flow with `leaveType: work_from_home`
- Projects: list assigned projects and fetch project team reports
- Holidays: fetch upcoming and current-year holiday lists
- Attendance: retrieve yearly attendance summaries
- Punching-report: fetch biometric punch-in/out reports and logs
- Daily-status-report: submit daily status reports (DSR) with task breakdowns
- Down-time: mark system/internet downtime or absence
- Tickets: create and fetch support tickets

Agent / Session Architecture
---------------------------
How the app handles authentication and session data:
- `sessionId` (string): the primary session identifier generated at login and stored server-side in `session/sessionStore.js`.
- `token` (string): the HRMS JWT (or API token) returned by the SSO verification endpoint and stored in the server-side session as `sessions[sessionId].token`.
- `user` (object): decoded user claims from the token or SSO response stored in `sessions[sessionId].user`. The agent uses `sessions[sessionId].user.userId` as the canonical `userId` passed to HRMS API calls.
- Cookie fallback: on successful `/login/sso` the server sets a `sessionId` cookie so browser clients can persist authentication without re-sending headers. API clients can continue to send `x-session-id` header, `sessionId` body field, or `sessionId` query param.

Where `userId` is saved and used
-------------------------------
- After successful SSO verification, the server saves the user object in `sessions[sessionId].user`.
- The HRMS API helper (`services/hrmsApi.js`) derives the ID by calling `getUserClaims(authContext)` which uses the session `user` or decodes the token. Most API methods use `user.userId` or `user.empId` when constructing payloads (see `applyLeave`, `getLeaveTypeLeaveCount`, `getActiveTickets`, etc.).

Logging and Auditing
--------------------
- On successful login via `/login/sso`, the server logs: `sessionId`, `userId`, `empId`, `name`, `email`, and client `ip` (see the `[LOGIN SSO] session created` log).
- Tool and API calls produce logs that show the HRMS endpoint path and payload attempted, and any non-404/405 failures are logged for debugging.

Environments and Configuration
------------------------------
Make sure these variables are set for production:
- `OPENAI_API_KEY` (required for OpenAI access) or `GITHUB_TOKEN` if using GitHub models
- `OPENAI_MODEL` (optional model override)
- `OPENAI_API_BASE_URL` (optional alternate OpenAI API base URL)
- `OPENAI_TIMEOUT_MS` (optional OpenAI request timeout in ms)
- `OPENAI_ATTEMPTS` (optional retry count for OpenAI requests)
- `HRMS_API_BASE_URL` (point to the HRMS API)
- `HRMS_API_TIMEOUT_MS` (optional HRMS request timeout in ms)
- `HRMS_MARK_LEAVE_PATH` (optional custom endpoint path)
- `CONTACT_NUM` / `PO_ID` (optional leave payload values; prefer session/user data)
- `TENANT_ID` (optional header for HRMS requests)

Testing and Local Development
-----------------------------
- The repository contains a local dev helper route (accessible from localhost) used during development to create mock sessions quickly. This is not required in production; you can remove it if desired.
- For end-to-end tests, ensure you have a valid SSO token or mock the SSO verification response.

Cleanups performed
------------------
- Removed unused `services/authApi.js` (username/password login path) since the application exclusively uses MS SSO.
- Removed temporary dev test files that were only used for debugging.

Troubleshooting (detailed)
--------------------------
- OpenAI timeouts: the agent retries OpenAI requests (3 attempts) with exponential backoff and a per-attempt 120s timeout. Check network, key validity, and payload size if timeouts persist.
- Leave/WFH failures: inspect `services/hrmsApi.js` logs for the `applyLeave trying` messages. The service tries multiple payload formats and endpoints; the logs show which combination succeeded or failed.
- Session issues: verify the client sends the `sessionId` via header/body/query or accepts the `sessionId` cookie set on login.

If you want, I can produce a short checklist to validate the most critical flows (`/login/sso`, `/chat`, `apply_employee_leave`) before you push the commit.

Important Environment Variables
-------------------------------
- `OPENAI_API_KEY` - OpenAI API key (preferred)
- `OPENAI_MODEL` - Model name override (default `gpt-4o-mini`)
- `OPENAI_API_BASE_URL` - Alternate OpenAI base URL
- `OPENAI_TIMEOUT_MS` - OpenAI request timeout in ms
- `OPENAI_ATTEMPTS` - OpenAI retry count
- `GITHUB_TOKEN` / `GITHUB_MODEL` - Optional GitHub models fallback
- `HRMS_API_BASE_URL` - HRMS API base (defaults to https://vv-vp-api.azurewebsites.net/api/v1/employee)
- `HRMS_API_TIMEOUT_MS` - HRMS request timeout in ms
- `HRMS_MARK_LEAVE_PATH` - Optional custom leave endpoint override
- `CONTACT_NUM` / `PO_ID` - Optional leave payload values; prefer session/user data
- `TENANT_ID` - Optional tenant header for HRMS requests

Recent Fixes & Notes
--------------------
- The OpenAI request now uses a retry + exponential backoff helper with a per-attempt timeout of 120s (3 attempts). This reduces the impact of transient network glitches and short service hiccups. See `workflows/hrmsWorkflow.js` (`attemptOpenAIRequest`).
- `services/hrmsApi.js` logs the exact payload and path tried for leave applications; the apply leave flow tries multiple payload variants and endpoint paths as a fallback strategy.

Troubleshooting
---------------
- If you see `OpenAI request timed out after ...` in logs, confirm network connectivity and that `OPENAI_API_KEY` is valid. The agent will retry automatically up to 3 times.
- If `/me` returns `No active session. Please login first.`, ensure the client passes `x-session-id` or the `sessionId` cookie returned by `/login/sso`.
- If leave/WFH fails: check server logs for the `[HRMS] applyLeave trying ...` entries to see which path and payload were attempted and what error was returned by HRMS.
- If you get `authError` tool responses: the HRMS token in the session is likely expired or rejected. Log out and re-authenticate, then retry.

Session handling
----------------
- The server now enforces header-only sessions for robustness. Provide the `x-session-id` request header on every protected request.
- Login responses return the `sessionId` in the JSON payload (do not set cookies). Clients should store the `sessionId` and include it in the `x-session-id` header for subsequent requests.

Development & Local Testing
---------------------------
Start the server (from repository root):

```bash
npm install
node app.js
```

Then POST to `/chat` with a valid `sessionId` header or query param, e.g. using `curl`:

```bash
curl -X POST 'http://localhost:3000/chat' \
  -H 'Content-Type: application/json' \
  -H 'x-session-id: <your-session-id>' \
  -d '{"message":"Hi, I want to apply WFH tomorrow"}'
```

What I will do next
--------------------
- Run end-to-end tests for the chat flow locally (simulate requests) and reproduce the timeout issue if present.
- Add targeted debug logs if additional failures appear.

If you want me to proceed, I will implement the runtime tests and follow up with fixes for any remaining bugs in the `apply_employee_leave` flow.
