const { tool } = require("@langchain/core/tools");
const { z } = require("zod");

const {
    getAttendance,
    getLeaveContext,
    getAllEmployeeLeaves,
    getHolidays,
    getCurrentYearHolidays,
    getPunchReports,
    getPunchLogs,
    getProjects,
    getProjectTeamReport,
    getLeaveTypeLeaveCount,
    getActiveTickets,
    submitDailyStatusReport,
    markDownTime,
    createTicket,
    applyLeave
} = require("../services/hrmsApi");

const leaveTypeSchema = z.enum([
    "earned_leave",
    "paternity_leave",
    "maternity_leave",
    "compensatory_off",
    "sick_and_casual_leave",
    "work_from_home"
]);

const leaveDurationSchema = z.enum(["short", "halfDay", "fullDay"]);

function toolResult(result) {
    return JSON.stringify({
        ok: true,
        data: result
    });
}

function toolError(error) {
    const status = error.response?.status || error.statusCode || null;
    const responseError = error.response?.data || error.message;

    console.error(`[TOOL_ERROR] Status: ${status}, Error:`, responseError);

    if (status === 401) {
        console.error(`[AUTH_ERROR] Token rejected by HRMS API`);
        return JSON.stringify({
            ok: false,
            status,
            authError: true,
            error: "HRMS rejected the login token. Please logout, login again, and retry."
        });
    }

    return JSON.stringify({
        ok: false,
        status,
        error: responseError
    });
}

function createHrmsTools(authContext = {}) {
    return [
        createLeaveContextTool(authContext),
        createAttendanceTool(authContext),
        createAllEmployeeLeavesTool(authContext),
        createHolidaysTool(authContext),
        createPunchReportsTool(authContext),
        createProjectsTool(authContext),
        createCurrentYearHolidaysTool(authContext),
        createLeaveTypeLeaveCountTool(authContext),
        createActiveTicketsTool(authContext),
        createPunchLogsTool(authContext),
        createProjectTeamReportTool(authContext),
        createDailyStatusReportTool(authContext),
        createMarkDownTimeTool(authContext),
        createTicketTool(authContext),
        createDepartmentDropdownTool(authContext),
        createApplyLeaveTool(authContext)
    ];
}

function createLeaveContextTool(authContext) {
    return tool(
        async () => runTool(() => getLeaveContext({ authContext })),
        {
            name: "get_employee_leave_context",
            description:
                "Get live HRMS leave context, including supported leave types and the employee's recent leave or WFH requests."
        }
    );
}

function createAttendanceTool(authContext) {
    return tool(
        async ({ year }) => runTool(() => getAttendance({ year, authContext })),
        {
            name: "get_employee_attendance",
            description:
                "Get employee attendance records for a year.",
            schema: z.object({
                year: z.number().int().optional().describe("Attendance year, for example 2026")
            })
        }
    );
}

function createAllEmployeeLeavesTool(authContext) {
    return tool(
        async () => runTool(() => getAllEmployeeLeaves({ authContext })),
        {
            name: "get_all_employee_leaves",
            description:
                "Get all employee leave records for broad team leave visibility."
        }
    );
}

function createHolidaysTool(authContext) {
    return tool(
        async ({ skip = 0, limit = 10 }) => runTool(() => getHolidays({
            skip,
            limit,
            authContext
        })),
        {
            name: "get_upcoming_holidays",
            description:
                "Get holiday details from HRMS.",
            schema: z.object({
                skip: z.number().int().optional(),
                limit: z.number().int().optional()
            })
        }
    );
}

function createPunchReportsTool(authContext) {
    return tool(
        async ({ monthCount = 1 }) => runTool(() => getPunchReports({
            monthCount,
            authContext
        })),
        {
            name: "get_punch_reports",
            description:
                "Get punch-in and punch-out reports. Use monthCount for the last N months of punch data.",
            schema: z.object({
                monthCount: z.number().int().min(1).max(12).optional()
            })
        }
    );
}

function createProjectsTool(authContext) {
    return tool(
        async ({ skip = 0, limit = 10, status = 1 }) => runTool(() => getProjects({
            skip,
            limit,
            status,
            authContext
        })),
        {
            name: "get_assigned_projects",
            description:
                "Get projects assigned to the current employee.",
            schema: z.object({
                skip: z.number().int().optional(),
                limit: z.number().int().optional(),
                status: z.number().int().optional()
            })
        }
    );
}

function createCurrentYearHolidaysTool(authContext) {
    return tool(
        async () => runTool(() => getCurrentYearHolidays({ authContext })),
        {
            name: "get_current_year_holidays",
            description:
                "Get holidays for the current year from HRMS."
        }
    );
}

function createLeaveTypeLeaveCountTool(authContext) {
    return tool(
        async ({ userId } = {}) => runTool(() => getLeaveTypeLeaveCount({ userId, authContext })),
        {
            name: "get_leave_type_leave_count",
            description:
                "Get leave balance and leave count details for the current logged-in employee. You may optionally provide a userId, but it is not required if the session is authenticated.",
            schema: z.object({
                userId: z.number().int().optional().describe("Optional employee user ID to retrieve leave count details for")
            })
        }
    );
}

function createActiveTicketsTool(authContext) {
    return tool(
        async ({ userId } = {}) => runTool(() => getActiveTickets({ userId, authContext })),
        {
            name: "get_active_tickets",
            description:
                "Get active tickets for the current logged-in employee. Optionally provide a userId, otherwise the session user is used.",
            schema: z.object({
                userId: z.number().int().optional().describe("Optional employee user ID to retrieve active tickets for")
            })
        }
    );
}

function createPunchLogsTool(authContext) {
    return tool(
        async () => runTool(() => getPunchLogs({ authContext })),
        {
            name: "get_punch_logs",
            description:
                "Get detailed punch log entries from HRMS."
        }
    );
}

function createProjectTeamReportTool(authContext) {
    return tool(
        async ({ userId } = {}) => runTool(() => getProjectTeamReport({ userId, authContext })),
        {
            name: "get_project_team_report",
            description:
                "Get project team member report for the current logged-in employee. Optionally provide a userId if you want another employee's report.",
            schema: z.object({
                userId: z.number().int().optional().describe("Optional employee user ID to retrieve project team report for")
            })
        }
    );
}

function createDailyStatusReportTool(authContext) {
    return tool(
        async ({ tasks = [] }) => runTool(() => submitDailyStatusReport({ tasks, authContext })),
        {
            name: "submit_daily_status_report",
            description:
                "Submit an employee daily status report (DSR) with one or more work tasks. Requires project ID, task description, minutes spent, task status (e.g., Inprogress, Completed), and working date.",
            schema: z.object({
                tasks: z.array(z.object({
                    projectId: z.string().describe("Project identifier (e.g., VVPL002)"),
                    taskDetails: z.string().describe("Task description or details"),
                    taskMinutes: z.number().int().describe("Minutes spent on the task"),
                    taskStatus: z.string().describe("Task status (e.g., Inprogress, Completed, OnHold)"),
                    workingDate: z.string().describe("Working date in YYYY-MM-DD format")
                })).min(1)
            })
        }
    );
}

function createMarkDownTimeTool(authContext) {
    return tool(
        async (input) => runTool(() => markDownTime({ ...input, authContext })),
        {
            name: "mark_down_time",
            description:
                "Record downtime or absence for an employee (e.g., system down, internet issue, etc.). Requires date, department, description, start/end times, subject, employee name, and project owner IDs. Call get_department_dropdown first to see available departments.",
            schema: z.object({
                date: z.string().describe("Downtime date in YYYY/MM/DD or YYYY-MM-DD format"),
                departmentId: z.number().int().describe("Department identifier (get from get_department_dropdown)"),
                description: z.string().describe("Detailed downtime description"),
                endTime: z.string().describe("Downtime end time in ISO 8601 format (e.g., 2026-05-18T11:54:02.010Z)"),
                name: z.string().describe("Employee name"),
                poId: z.array(z.number().int()).describe("Project owner IDs (e.g., [249])"),
                startTime: z.string().describe("Downtime start time in ISO 8601 format (e.g., 2026-05-18T10:54:02.010Z)"),
                subject: z.string().describe("Downtime subject/title")
            })
        }
    );
}

function createTicketTool(authContext) {
    return tool(
        async (input) => runTool(() => createTicket({ ...input, authContext })),
        {
            name: "create_support_ticket",
            description:
                "Create a support ticket for issues or requests. Requires title, description, priority level (low/medium/high), and the user ID to assign it to.",
            schema: z.object({
                assigned_to: z.number().int().describe("User ID to assign the ticket to"),
                description: z.string().describe("Detailed ticket description"),
                priority: z.enum(["low", "medium", "high"]).describe("Ticket priority level"),
                title: z.string().describe("Ticket title or issue summary")
            })
        }
    );
}

const departmentDropdown = [
    { id: 131, name: "hr" },
    { id: 132, name: "it" },
    { id: 133, name: "training" },
    { id: 134, name: "sales & marketting" },
    { id: 135, name: "technology" },
    { id: 136, name: "qa" }
];

function createDepartmentDropdownTool() {
    return tool(
        async () => toolResult({ departments: departmentDropdown }),
        {
            name: "get_department_dropdown",
            description:
                "Get the HRMS department dropdown options for downtime submission.",
            schema: z.object({})
        }
    );
}

function createApplyLeaveTool(authContext) {
    return tool(
        async (input) => {
            const missingFields = getMissingLeaveFields(input);

            if (missingFields.length > 0) {
                return toolError({
                    message: `Cannot apply leave/WFH. Missing required fields: ${missingFields.join(", ")}`
                });
            }

            return runTool(() => applyLeave({
                ...input,
                authContext
            }));
        },
        {
            name: "apply_employee_leave",
            description:
                "Apply employee leave or WFH using HRMS. Only use this after the user has explicitly confirmed the preview.",
            schema: z.object({
                fromDate: z.string().describe("Start date in YYYY-MM-DD format"),
                toDate: z.string().describe("End date in YYYY-MM-DD format"),
                leaveReason: z.string().describe("Reason for leave or WFH"),
                leaveType: leaveTypeSchema,
                leaveDuration: leaveDurationSchema
            })
        }
    );
}

async function runTool(fn) {
    try {
        return toolResult(await fn());
    } catch (error) {
        if (error.code === "ECONNABORTED" || String(error.message).toLowerCase().includes("timeout")) {
            return toolError(Object.assign(new Error("HRMS API request timed out. Please try again with a simpler query or check your connection."), {
                statusCode: 504,
                response: { data: { message: "HRMS API request timed out." } }
            }));
        }
        return toolError(error);
    }
}

function getMissingLeaveFields(input) {
    return ["fromDate", "toDate", "leaveReason", "leaveType", "leaveDuration"]
        .filter((field) => !input?.[field]);
}

const userRoleEnums = {
    SUPER_ADMIN: 'super_admin',
    HR: 'hr',
    DEVELOPER: 'developer',
    TRAINEE: 'trainee',
    TL: 'tl',
    QUALITY: 'quality',
    TRAINER: 'trainer',
    PROJECT_OWNER: 'project_owner',
    EMPLOYEE: 'employee',
    ADMIN: 'admin',
    Trainer: 'trainer',
    Tech_Support: 'tech_support'
};

const raisedRequest = {
    BACK_DATE_LEAVE: 'back_date_leave',
    ROSTER_CHANGE: 'roster_change',
    SHIFT_CHANGE: 'shift_change',
    BIOMETRIC_ISSUE: 'biometric_issue',
    WORKING_ON_WEEKOFF: 'working_on_weekoff',
    WORKING_ON_LEAVE: 'working_on_leave'
};

const statusEnums = {
    APPROVED: 1,
    REJECTED: 2,
    PENDING: 0
};

const TicketStatusEnums = Object.freeze({
    OPEN: 'open',
    IN_PROGRESS: 'in_progress',
    RESOLVED: 'resolved',
    CLOSED: 'closed',
    RE_OPEN: 're_open'
});

const PriorityEnums = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
};

module.exports = {
    createHrmsTools,
    userRoleEnums,
    raisedRequest,
    statusEnums,
    TicketStatusEnums,
    PriorityEnums,
    departmentDropdown
};
