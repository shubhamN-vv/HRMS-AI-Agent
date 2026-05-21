const { createOpenAIClient, getModelName } = require("../model/githubModel");
const { createHrmsTools } = require("../tools/hrmsTools");
const { HRMS_AGENT_SYSTEM_PROMPT } = require("../prompts/systemPrompt");

const openAiTools = [
    createToolSchema("get_employee_leave_context", "Get live HRMS leave context, including supported leave types and recent leave or WFH requests."),
    createToolSchema("get_employee_attendance", "Get employee attendance records for a year.", {
        year: {
            type: "integer",
            description: "Attendance year, for example 2026"
        }
    }),
    createToolSchema("get_all_employee_leaves", "Get all employee leave records."),
    createToolSchema("get_upcoming_holidays", "Get holiday details from HRMS.", {
        skip: {
            type: "integer"
        },
        limit: {
            type: "integer"
        }
    }),
    createToolSchema("get_punch_reports", "Get punch-in and punch-out reports. Use monthCount for the last N months.", {
        monthCount: {
            type: "integer",
            minimum: 1,
            maximum: 12
        }
    }),
    createToolSchema("get_assigned_projects", "Get projects assigned to the current employee.", {
        skip: {
            type: "integer"
        },
        limit: {
            type: "integer"
        },
        status: {
            type: "integer"
        }
    }),
    createToolSchema("get_current_year_holidays", "Get holidays for the current year from HRMS."),
    createToolSchema("get_leave_type_leave_count", "Get leave count details for a specific employee user ID.", {
        userId: {
            type: "integer"
        }
    }, ["userId"]),
    createToolSchema("get_active_tickets", "Get active tickets for a specific employee user ID.", {
        userId: {
            type: "integer"
        }
    }, ["userId"]),
    createToolSchema("get_punch_logs", "Get detailed punch log entries from HRMS."),
    createToolSchema("get_project_team_report", "Get project team member report for a specific employee user ID.", {
        userId: {
            type: "integer"
        }
    }, ["userId"]),
    createToolSchema("submit_daily_status_report", "Submit an employee daily status report (DSR) with one or more work tasks. Requires project ID, task description, minutes spent, task status, and working date.", {
        tasks: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    projectId: { type: "string", description: "Project identifier (e.g., VVPL002)" },
                    taskDetails: { type: "string", description: "Task description or details" },
                    taskMinutes: { type: "integer", description: "Minutes spent on the task" },
                    taskStatus: { type: "string", description: "Task status (e.g., Inprogress, Completed, OnHold)" },
                    workingDate: { type: "string", description: "Working date in YYYY-MM-DD format" }
                },
                required: ["projectId", "taskDetails", "taskMinutes", "taskStatus", "workingDate"],
                additionalProperties: false
            }
        }
    }, ["tasks"]),
    createToolSchema("mark_down_time", "Record downtime or absence for an employee (e.g., system down, internet issue). Requires date, department, description, start/end times, subject, employee name, and project owner IDs. Call get_department_dropdown first.", {
        date: {
            type: "string",
            description: "Downtime date in YYYY/MM/DD or YYYY-MM-DD format"
        },
        departmentId: {
            type: "integer",
            description: "Department identifier (get from get_department_dropdown)"
        },
        description: {
            type: "string",
            description: "Detailed downtime description"
        },
        endTime: {
            type: "string",
            description: "Downtime end time in ISO 8601 format (e.g., 2026-05-18T11:54:02.010Z)"
        },
        name: {
            type: "string",
            description: "Employee name"
        },
        poId: {
            type: "array",
            items: { type: "integer" },
            description: "Project owner IDs (e.g., [249])"
        },
        startTime: {
            type: "string",
            description: "Downtime start time in ISO 8601 format (e.g., 2026-05-18T10:54:02.010Z)"
        },
        subject: {
            type: "string",
            description: "Downtime subject/title"
        }
    }, ["date", "departmentId", "description", "endTime", "name", "poId", "startTime", "subject"]),
    createToolSchema("create_support_ticket", "Create a support ticket for issues or requests. Requires title, description, priority level, and the user ID to assign it to.", {
        assigned_to: {
            type: "integer",
            description: "User ID to assign the ticket to"
        },
        description: {
            type: "string",
            description: "Detailed ticket description"
        },
        priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Ticket priority level"
        },
        title: {
            type: "string",
            description: "Ticket title or issue summary"
        }
    }, ["assigned_to", "description", "priority", "title"]),
    createToolSchema("get_department_dropdown", "Get the list of available departments for downtime submission (hr, it, training, sales & marketting, technology, qa)."),
    createToolSchema("apply_employee_leave", "Apply employee leave or WFH using HRMS. Only use this after the user explicitly confirms the preview.", {
        fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format"
        },
        toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format"
        },
        leaveReason: {
            type: "string",
            description: "Reason for leave or WFH"
        },
        leaveType: {
            type: "string",
            enum: [
                "earned_leave",
                "paternity_leave",
                "maternity_leave",
                "compensatory_off",
                "sick_and_casual_leave",
                "work_from_home"
            ]
        },
        leaveDuration: {
            type: "string",
            enum: ["short", "halfDay", "fullDay"]
        }
    }, ["fromDate", "toDate", "leaveReason", "leaveType", "leaveDuration"])
];

const client = createOpenAIClient();
// Increase default OpenAI timeout and attempts to handle longer-running completions
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 120000; // 120s
const OPENAI_ATTEMPTS = Number(process.env.OPENAI_ATTEMPTS) || 3;

function createToolSchema(name, description, properties = {}, required = []) {
    return {
        type: "function",
        function: {
            name,
            description,
            parameters: {
                type: "object",
                properties,
                required,
                additionalProperties: false
            }
        }
    };
}

function getSession(sessions, sessionId) {
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            history: []
        };
    }

    return sessions[sessionId];
}

function getAuthContext(session) {
    return {
        token: session.token,
        user: session.user
    };
}

function parseToolArgs(rawArgs) {
    if (!rawArgs) {
        return {};
    }

    try {
        return JSON.parse(rawArgs);
    } catch (error) {
        return {};
    }
}

async function runToolCall(toolCall, toolMap) {
    const toolName = toolCall.function.name;
    const hrmsTool = toolMap.get(toolName);

    if (!hrmsTool) {
        return JSON.stringify({
            ok: false,
            error: `Unknown tool: ${toolName}`
        });
    }

    return hrmsTool.invoke(parseToolArgs(toolCall.function.arguments));
}

function promiseWithTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`OpenAI request timed out after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptOpenAIRequest(payload, attempts = OPENAI_ATTEMPTS, timeoutMs = OPENAI_TIMEOUT_MS) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const start = Date.now();
        try {
            const resp = await promiseWithTimeout(
                client.chat.completions.create(payload),
                timeoutMs
            );

            const duration = Date.now() - start;
            console.log("[HRMS CHAT] OpenAI request succeeded", {
                model: payload.model,
                attempt,
                duration
            });

            return resp;
        } catch (err) {
            const duration = Date.now() - start;
            console.error("[HRMS CHAT] OpenAI attempt failed", {
                attempt,
                duration,
                message: err.message,
                status: err.response?.status
            });

            lastError = err;

            if (attempt < attempts) {
                const backoff = 500 * Math.pow(2, attempt - 1);
                console.log(`[HRMS CHAT] retrying OpenAI request after ${backoff}ms`);
                // small sleep before retry
                // eslint-disable-next-line no-await-in-loop
                await sleep(backoff);
            }
        }
    }

    throw lastError;
}

function normalizeToolCalls(message) {
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        return message.tool_calls;
    }

    if (message.function_call && message.function_call.name) {
        return [
            {
                type: "function",
                id: message.function_call.name,
                function: {
                    name: message.function_call.name,
                    arguments: message.function_call.arguments || "{}"
                }
            }
        ];
    }

    return [];
}

async function handleHrmsChat({ sessions, sessionId, message }) {
    console.log("[HRMS CHAT] handleHrmsChat start", { sessionId, message: String(message).slice(0,200) });
    const session = getSession(sessions, sessionId);
    const hrmsTools = createHrmsTools(getAuthContext(session));
    const toolMap = new Map(hrmsTools.map((hrmsTool) => [hrmsTool.name, hrmsTool]));
    const messages = buildMessages(session, message);

    for (let iteration = 0; iteration < 6; iteration++) {
        console.log("[HRMS CHAT] requesting OpenAI completion", {
            sessionId,
            model: getModelName(),
            iteration,
            messages: messages.map((msg) => ({ role: msg.role, content: msg.content?.slice(0, 200) }))
        });

        let response;
        try {
            response = await attemptOpenAIRequest(
                {
                    model: getModelName(),
                    temperature: 0,
                    messages,
                    tools: openAiTools,
                    tool_choice: "auto"
                },
                OPENAI_ATTEMPTS,
                OPENAI_TIMEOUT_MS
            );
        } catch (error) {
            console.error("[HRMS CHAT] OpenAI request failed", {
                sessionId,
                message: error.message,
                code: error.code,
                status: error.response?.status,
                responseData: error.response?.data,
                stack: error.stack
            });

            const responseDetails = error.response
                ? `${error.response.status}: ${JSON.stringify(error.response.data)}`
                : error.message;

            return saveAssistantResponse(
                session,
                message,
                `HRMS AI request failed (${responseDetails}). Please try again or check your model credentials.`
            );
        }

        const assistantMessage = response.choices[0]?.message;
        const toolCalls = normalizeToolCalls(assistantMessage);

        console.log("[HRMS CHAT] OpenAI response", {
            sessionId,
            finishReason: response.choices[0]?.finish_reason,
            toolCalls: toolCalls.length,
            functionCallName: assistantMessage?.function_call?.name
        });

        messages.push({
            role: "assistant",
            content: assistantMessage.content || "",
            tool_calls: toolCalls
        });

        if (toolCalls.length === 0) {
            return saveAssistantResponse(session, message, assistantMessage.content);
        }

        for (const toolCall of toolCalls) {
            const toolOutput = await runToolCall(toolCall, toolMap);

            if (isToolAuthError(toolOutput)) {
                return saveAssistantResponse(
                    session,
                    message,
                    "HRMS rejected your login token. Please logout, login again, and retry."
                );
            }

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: toolOutput
            });
        }
    }

    return {
        message: "I need a bit more information before I can continue."
    };
}

function isToolAuthError(toolOutput) {
    try {
        const parsed = JSON.parse(toolOutput);

        return parsed?.authError === true;
    } catch (error) {
        return false;
    }
}

function buildMessages(session, message) {
    const userContext = session.user
        ? `Logged-in user: ${JSON.stringify(session.user)}`
        : "No login session is available.";

    return [
        {
            role: "system",
            content: `${HRMS_AGENT_SYSTEM_PROMPT}\n\n${userContext}`
        },
        ...session.history,
        {
            role: "user",
            content: message
        }
    ];
}

function saveAssistantResponse(session, userMessage, assistantContent) {
    const output = assistantContent || "I could not generate a response.";

    session.history.push({
        role: "user",
        content: userMessage
    });
    session.history.push({
        role: "assistant",
        content: output
    });

    if (session.history.length > 20) {
        session.history = session.history.slice(-20);
    }

    return {
        message: output
    };
}

function resetHrmsChat({ sessions, sessionId }) {
    if (sessions[sessionId]) {
        sessions[sessionId].history = [];
    }
}

module.exports = {
    handleHrmsChat,
    resetHrmsChat
};
