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

async function handleHrmsChat({ sessions, sessionId, message }) {
    const session = getSession(sessions, sessionId);
    const hrmsTools = createHrmsTools(getAuthContext(session));
    const toolMap = new Map(hrmsTools.map((hrmsTool) => [hrmsTool.name, hrmsTool]));
    const messages = buildMessages(session, message);

    for (let iteration = 0; iteration < 6; iteration++) {
        const response = await client.chat.completions.create({
            model: getModelName(),
            temperature: 0,
            messages,
            tools: openAiTools,
            tool_choice: "auto"
        });

        const assistantMessage = response.choices[0].message;
        const toolCalls = assistantMessage.tool_calls || [];

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
