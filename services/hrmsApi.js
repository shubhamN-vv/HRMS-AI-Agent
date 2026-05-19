require("dotenv").config();

const axios = require("axios");

const DEFAULT_API_BASE_URL = "https://vv-vp-api.azurewebsites.net/api/v1";

function getApiBaseUrl() {
    return process.env.HRMS_API_BASE_URL || DEFAULT_API_BASE_URL;
}

function getApiRoot() {
    try {
        return new URL(getApiBaseUrl()).origin;
    } catch (error) {
        return getApiBaseUrl();
    }
}

function decodeJwt(token) {
    if (!token || !token.includes(".")) {
        return {};
    }

    try {
        const payload = token.split(".")[1];
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");

        return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    } catch (error) {
        return {};
    }
}

function normalizeUserClaims(user = {}) {
    if (!user || typeof user !== "object") {
        return {};
    }

    const normalized = {
        ...user,
        userId:
            user.userId ??
            user.user_id ??
            user.id ??
            user.sub ??
            user.employeeId ??
            user.empId ??
            user.emp_id ??
            user.employee_id,
        empId:
            user.empId ??
            user.emp_id ??
            user.employeeId ??
            user.employee_id ??
            user.userId ??
            user.id,
        email:
            user.email ??
            user.upn ??
            user.preferred_username ??
            user.userPrincipalName ??
            user.username,
        name:
            user.name ??
            user.displayName ??
            user.preferred_username ??
            user.givenName ??
            user.fullName
    };

    return normalized;
}

function isJwtExpired(token) {
    const claims = decodeJwt(token);

    if (!claims.exp) {
        return false;
    }

    return claims.exp * 1000 <= Date.now();
}

function getToken(authContext = {}) {
    return authContext.token;
}

function getUserClaims(authContext = {}) {
    const rawClaims = authContext.user || decodeJwt(getToken(authContext));
    return normalizeUserClaims(rawClaims);
}

function createHeaders(authContext = {}) {
    const token = getToken(authContext);
    const headers = {};

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (process.env.TENANT_ID) {
        headers["X-Tenant-Id"] = process.env.TENANT_ID;
    }

    return headers;
}

function createApiLogger(instance) {
    instance.interceptors.request.use(config => {
        console.log("[HRMS API REQUEST]", {
            method: config.method?.toUpperCase(),
            url: `${config.baseURL}${config.url}`,
            headers: config.headers,
            data: config.data
        });
        return config;
    });

    instance.interceptors.response.use(
        response => {
            console.log("[HRMS API RESPONSE]", {
                method: response.config.method?.toUpperCase(),
                url: `${response.config.baseURL}${response.config.url}`,
                status: response.status,
                data: response.data
            });

            if (response.status === 401) {
                console.error(`[HRMS] 401 Response from ${response.config.url}`);
                console.error(`[HRMS] Headers sent:`, response.config.headers);
            }

            return response;
        },
        error => {
            console.error("[HRMS API ERROR]", {
                method: error.config?.method?.toUpperCase(),
                url: error.config?.baseURL + error.config?.url,
                message: error.message,
                response: error.response?.data
            });
            return Promise.reject(error);
        }
    );
}

function createEmployeeApi(authContext = {}) {
    const instance = axios.create({
        baseURL: getApiBaseUrl(),
        headers: createHeaders(authContext),
        validateStatus: () => true // Don't throw on any status
    });

    createApiLogger(instance);

    return instance;
}

function createRootApi(authContext = {}) {
    const instance = axios.create({
        baseURL: getApiRoot(),
        headers: createHeaders(authContext),
        validateStatus: () => true // Don't throw on any status
    });

    createApiLogger(instance);

    return instance;
}

async function getAttendance({ year = new Date().getFullYear(), authContext } = {}) {
    const api = createEmployeeApi(authContext);
    console.log(`[HRMS] getAttendance: year=${year}, hasToken=${Boolean(getToken(authContext))}`);
    const response = await api.get(`/employee/attendance-record?year=${year}`);

    return response.data;
}

async function getLeaveTypes({ authContext } = {}) {
    const api = createRootApi(authContext);

    try {
        const response = await api.get("/api/v1/globalType/leave-type");

        if (response.status >= 200 && response.status < 300) {
            return response.data;
        }
    } catch (error) {
        console.warn("[HRMS] primary leave type endpoint failed, falling back:", error?.message || error);
    }

    const fallbackResponse = await api.get("/api/v1/globalType/masterglobaltype/leave_type");
    return fallbackResponse.data;
}

async function getLeaveRequests({ skip = 0, limit = 10, authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const response = await api.get(`/employee/leaveRequest?skip=${skip}&limit=${limit}`);

    return response.data;
}

async function getAllEmployeeLeaves({ authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const response = await api.get("/employee/allEmployee-leave");

    return response.data;
}

async function getHolidays({ skip = 0, limit = 10, authContext } = {}) {
    const api = createRootApi(authContext);
    const response = await api.get(`/api/v1/holidays/getAllHolidays?skip=${skip}&limit=${limit}`);

    return response.data;
}

async function getPunchReports({ monthCount = 1, authContext } = {}) {
    const api = createRootApi(authContext);
    const response = await api.get(
        `/api/v1/punchLogs/biometric/cal/punches?monthCount=${monthCount}`
    );

    return response.data;
}

async function getProjects({ skip = 0, limit = 10, status = 1, authContext } = {}) {
    const api = createRootApi(authContext);
    const response = await api.get(
        `/api/v1/projectInfo?skip=${skip}&limit=${limit}&status=${status}`
    );

    return response.data;
}

async function getCurrentYearHolidays({ authContext } = {}) {
    const api = createRootApi(authContext);
    const response = await api.get("/api/v1/holidays/getAllCurrentYearHolidays");

    return response.data;
}

async function getLeaveTypeLeaveCount({ userId, authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const claims = getUserClaims(authContext);
    const id = userId || claims.userId;

    if (!id) {
        throw new Error(
            `Cannot retrieve leave count: missing employee user ID. Logged user claims: ${JSON.stringify(claims)}`
        );
    }

    const response = await api.get(`/employee/leaveTypeLeaveCount/${id}`);

    return response.data;
}

async function getActiveTickets({ userId, authContext } = {}) {
    const api = createRootApi(authContext);
    const claims = getUserClaims(authContext);
    const id = userId || claims.userId;

    if (!id) {
        throw new Error(
            `Cannot retrieve active tickets: missing employee user ID. Logged user claims: ${JSON.stringify(claims)}`
        );
    }

    const response = await api.get(`/api/v1/ticket/active-ticket/${id}`);

    return response.data;
}

async function getPunchLogs({ authContext } = {}) {
    const api = createRootApi(authContext);
    const response = await api.get("/api/v1/punchLogs/biometric/punchlogs");

    return response.data;
}

async function getProjectTeamReport({ userId, authContext } = {}) {
    const api = createRootApi(authContext);
    const claims = getUserClaims(authContext);
    const id = userId || claims.userId;

    if (!id) {
        throw new Error(
            `Cannot retrieve project team report: missing employee user ID. Logged user claims: ${JSON.stringify(claims)}`
        );
    }

    const response = await api.get(`/api/v1/projectInfo/team/${id}`);

    return response.data;
}

async function submitDailyStatusReport({ tasks = [], authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const user = getUserClaims(authContext);
    
    console.log(`[HRMS] submitDailyStatusReport:`, {
        tasksCount: tasks.length,
        hasToken: Boolean(getToken(authContext)),
        userId: user.userId,
        empId: user.empId,
        tasks
    });
    
    const response = await api.post("/employee/employeeDsr", tasks);

    console.log(`[HRMS] submitDailyStatusReport response:`, {
        status: response.status,
        data: response.data
    });

    return response.data;
}

async function markDownTime({ date, departmentId, description, endTime, name, poId, startTime, subject, authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const user = getUserClaims(authContext);
    
    const payload = {
        date,
        departmentId,
        description,
        endTime,
        name,
        poId,
        startTime,
        subject
    };

    console.log(`[HRMS] markDownTime:`, {
        hasToken: Boolean(getToken(authContext)),
        userId: user.userId,
        empId: user.empId,
        payload
    });

    const response = await api.post("/employee/markDownTime", payload);

    console.log(`[HRMS] markDownTime response:`, {
        status: response.status,
        data: response.data
    });

    return response.data;
}

async function createTicket({ assigned_to, description, priority, title, authContext } = {}) {
    const api = createRootApi(authContext);
    const user = getUserClaims(authContext);
    
    const payload = {
        assigned_to,
        description,
        priority,
        title
    };

    console.log(`[HRMS] createTicket:`, {
        hasToken: Boolean(getToken(authContext)),
        userId: user.userId,
        empId: user.empId,
        payload
    });

    const response = await api.post("/api/v1/ticket/create-ticket", payload);

    console.log(`[HRMS] createTicket response:`, {
        status: response.status,
        data: response.data
    });

    return response.data;
}

async function getLeaveContext({ authContext } = {}) {
    const [leaveTypes, recentLeaveRequests] = await Promise.all([
        getLeaveTypes({ authContext }),
        getLeaveRequests({ authContext })
    ]);

    return {
        leaveTypes,
        recentLeaveRequests
    };
}

async function applyLeave({
    fromDate,
    toDate,
    leaveReason,
    leaveType = "sick_and_casual_leave",
    leaveDuration = "fullDay",
    authContext
}) {
    const api = createEmployeeApi(authContext);
    const user = getUserClaims(authContext);
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    if (!user.empId || !user.userId) {
        throw new Error("Login session is missing empId or userId.");
    }

    const payload = {
        empId: user.empId,
        userId: user.userId,
        leaveDate: {
            fromDate,
            toDate
        },
        leaveDuration,
        leaveReason,
        leaveType
    };

    if (process.env.CONTACT_NUM) {
        payload.contactNum = process.env.CONTACT_NUM;
    }

    if (process.env.PO_ID) {
        payload.poId = [Number(process.env.PO_ID)];
    }

    const leavePaths = [
        "/employee/leaveRequest",
        "/employee/leave-request",
        "/employee/markLeave"
    ];

    let lastAttempt = null;

    for (const path of leavePaths) {
        try {
            console.log(`[HRMS] applyLeave trying ${path} with base ${api.defaults.baseURL}`);
            const response = await api.post(path, payload);

            if (response.status >= 200 && response.status < 300) {
                return response.data;
            }

            lastAttempt = { path, response };

            if (
                response.status === 404 ||
                response.status === 405 ||
                (typeof response.data === "string" && response.data.includes("Cannot POST"))
            ) {
                continue;
            }

            throw new Error(
                `HRMS applyLeave failed for ${path}: status ${response.status}, response=${JSON.stringify(response.data)}`
            );
        } catch (error) {
            lastAttempt = { path, error };
        }
    }

    const responseDetails = lastAttempt?.response
        ? `status ${lastAttempt.response.status}, body=${JSON.stringify(lastAttempt.response.data)}`
        : lastAttempt?.error?.message || "no response";

    throw new Error(
        `Leave application failed after trying paths ${leavePaths.join(", ")}. ${responseDetails}`
    );
}

module.exports = {
    decodeJwt,
    isJwtExpired,
    getUserClaims,
    getAttendance,
    getLeaveContext,
    getLeaveTypes,
    getLeaveRequests,
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
};
