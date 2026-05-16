const { tool } = require("@langchain/core/tools");
const { z } = require("zod");

const {
    getAttendance,
    getLeaveContext,
    getAllEmployeeLeaves,
    getHolidays,
    getPunchReports,
    getProjects,
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
        return toolError(error);
    }
}

function getMissingLeaveFields(input) {
    return ["fromDate", "toDate", "leaveReason", "leaveType", "leaveDuration"]
        .filter((field) => !input?.[field]);
}

module.exports = {
    createHrmsTools
};
