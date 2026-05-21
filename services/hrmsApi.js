require("dotenv").config();

const axios = require("axios");

function getApiBaseUrl() {
    return (process.env.HRMS_API_BASE_URL || "").trim();
}

function normalizeBaseUrl(url) {
    if (!url) {
        return url;
    }

    try {
        const parsed = new URL(url);
        parsed.pathname = parsed.pathname.replace(/\/employee\/?$/, "");
        return parsed.toString().replace(/\/$/, "");
    } catch (error) {
        return url.replace(/\/employee\/?$/, "").replace(/\/$/, "");
    }
}

function getApiRootUrl() {
    const baseUrl = getApiBaseUrl();
    return normalizeBaseUrl(baseUrl);
}

function getEmployeeBaseUrl() {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
        return baseUrl;
    }

    try {
        const parsed = new URL(baseUrl);
        parsed.pathname = parsed.pathname.replace(/\/?$/, "");
        return parsed.toString().replace(/\/$/, "");
    } catch (error) {
        return baseUrl.replace(/\/$/, "");
    }
}

function normalizeApiPath(path, baseUrl) {
    const normalizedPath = path?.startsWith("/") ? path : `/${path}`;

    if (!baseUrl) {
        return normalizedPath;
    }

    const cleanBase = baseUrl.replace(/\/$/, "");
    if (cleanBase.endsWith("/employee") && normalizedPath.startsWith("/employee/")) {
        return normalizedPath.replace(/^\/employee/, "");
    }

    return normalizedPath;
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

function toNumberArray(value) {
    if (Array.isArray(value)) {
        return value.map(Number).filter(n => !Number.isNaN(n));
    }

    if (typeof value === "number" && !Number.isNaN(value)) {
        return [value];
    }

    if (typeof value === "string") {
        return value
            .split(/[\s,;|]+/)
            .map(part => Number(part.trim()))
            .filter(n => !Number.isNaN(n));
    }

    return [];
}

function getUserContactNumber(user = {}) {
    const candidate =
        user.contactNum ??
        user.contactNumber ??
        user.phone ??
        user.mobile ??
        user.phoneNumber ??
        user.phone_number ??
        user.mobileNumber;

    if (candidate === undefined || candidate === null) {
        return undefined;
    }

    return String(candidate).trim() || undefined;
}

function getUserPoIds(user = {}) {
    const candidate =
        user.poId ??
        user.poIds ??
        user.projectOwnerId ??
        user.projectOwnerIds ??
        user.po_id ??
        user.project_owner_id;

    return toNumberArray(candidate);
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

function ensureSuccess(response, requestLabel = "HRMS API request") {
    const isSuccessfulStatus = response.status >= 200 && response.status < 300;
    const statusFlag = response.data?.status;
    const successFlag = response.data?.success;

    if (
        isSuccessfulStatus &&
        statusFlag !== false &&
        successFlag !== false
    ) {
        return response.data;
    }

    const message =
        response.data?.message ||
        response.data?.error ||
        response.data?.result?.message ||
        response.data?.result?.error ||
        response.statusText ||
        "Unknown HRMS API error";

    const error = new Error(`${requestLabel} failed: ${message}`);
    error.statusCode = response.status;
    error.response = response;
    throw error;
}

async function request(api, method, path, body = undefined) {
    const normalizedPath = normalizeApiPath(path, api.defaults.baseURL);
    const response = await api[method](normalizedPath, body);
    return ensureSuccess(response, `${method.toUpperCase()} ${normalizedPath}`);
}

const HRMS_API_TIMEOUT_MS = Number(process.env.HRMS_API_TIMEOUT_MS) || 10000;

function createEmployeeApi(authContext = {}) {
    const instance = axios.create({
        baseURL: getEmployeeBaseUrl(),
        headers: createHeaders(authContext),
        timeout: HRMS_API_TIMEOUT_MS,
        validateStatus: () => true // Don't throw on any status
    });

    createApiLogger(instance);

    return instance;
}

function createRootApi(authContext = {}) {
    const instance = axios.create({
        baseURL: getApiRootUrl(),
        headers: createHeaders(authContext),
        timeout: HRMS_API_TIMEOUT_MS,
        validateStatus: () => true // Don't throw on any status
    });

    createApiLogger(instance);

    return instance;
}

async function getAttendance({ year = new Date().getFullYear(), authContext } = {}) {
    const api = createEmployeeApi(authContext);
    console.log(`[HRMS] getAttendance: year=${year}, hasToken=${Boolean(getToken(authContext))}`);
    return request(api, "get", `/employee/attendance-record?year=${year}`);
}

async function getLeaveTypes({ authContext } = {}) {
    const api = createRootApi(authContext);

    try {
        return await request(api, "get", "/globalType/leave-type");
    } catch (error) {
        console.warn("[HRMS] primary leave type endpoint failed, falling back:", error?.message || error);
    }

    return request(api, "get", "/globalType/masterglobaltype/leave_type");
}

async function getLeaveRequests({ skip = 0, limit = 10, authContext } = {}) {
    const api = createEmployeeApi(authContext);
    return request(api, "get", `/employee/leaveRequest?skip=${skip}&limit=${limit}`);
}

async function getAllEmployeeLeaves({ authContext } = {}) {
    const api = createEmployeeApi(authContext);
    return request(api, "get", "/employee/allEmployee-leave");
}

async function getHolidays({ skip = 0, limit = 10, authContext } = {}) {
    const api = createRootApi(authContext);
    return request(api, "get", `/holidays/getAllHolidays?skip=${skip}&limit=${limit}`);
}

async function getPunchReports({ monthCount = 1, authContext } = {}) {
    const api = createRootApi(authContext);
    return request(api, "get", `/punchLogs/biometric/cal/punches?monthCount=${monthCount}`);
}

async function getProjects({ skip = 0, limit = 10, status = 1, authContext } = {}) {
    const api = createRootApi(authContext);
    return request(api, "get", `/projectInfo?skip=${skip}&limit=${limit}&status=${status}`);
}

async function getCurrentYearHolidays({ authContext } = {}) {
    const api = createRootApi(authContext);
    return request(api, "get", "/holidays/getAllCurrentYearHolidays");
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

    return request(api, "get", `/employee/leaveTypeLeaveCount/${id}`);
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

    return request(api, "get", `/ticket/active-ticket/${id}`);
}

async function getPunchLogs({ authContext } = {}) {
    const api = createRootApi(authContext);
    return request(api, "get", "/punchLogs/biometric/punchlogs");
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

    return request(api, "get", `/projectInfo/team/${id}`);
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
    
    const result = await request(api, "post", "/employee/employeeDsr", tasks);

    console.log(`[HRMS] submitDailyStatusReport response:`, {
        result
    });

    return result;
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

    return request(api, "post", "/employee/markDownTime", payload);
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

    return request(api, "post", "/ticket/create-ticket", payload);
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

    const contactNum = getUserContactNumber(user) || process.env.CONTACT_NUM;
    let poId = getUserPoIds(user);
    if (!poId.length && process.env.PO_ID) {
        poId = toNumberArray(process.env.PO_ID);
    }

    const basePayload = {
        empId: user.empId,
        userId: Number(user.userId),
        leaveDuration,
        leaveReason,
        leaveType
    };

    if (contactNum) {
        basePayload.contactNum = contactNum;
    }

    if (poId.length) {
        basePayload.poId = poId;
    }

    const payloadVariants = [
        {
            ...basePayload,
            dateTime1: now,
            dateTime2: now,
            leaveDate: [fromDate, toDate]
        },
        {
            ...basePayload,
            dateTime1: now,
            dateTime2: now,
            leaveDate: {
                fromDate,
                toDate
            }
        },
        {
            ...basePayload,
            leaveDate: {
                fromDate,
                toDate
            }
        }
    ];

    const normalizePath = (path) =>
        path && path.startsWith("/") ? path : path ? `/${path}` : path;

    const leavePaths = [
        normalizePath(process.env.HRMS_MARK_LEAVE_PATH),
        "/employee/markLeave",
        "/employee/leaveRequest",
        "/employee/leave-request",
        "/markLeave",
        "/leaveRequest",
        "/leave-request"
    ].filter(Boolean);

    let lastError = null;

    for (const path of leavePaths) {
        for (const payload of payloadVariants) {
            try {
                console.log(`[HRMS] applyLeave trying ${path} with payload:`, payload);
                return await request(api, "post", path, payload);
            } catch (error) {
                lastError = error;
                const status = error.statusCode || error.response?.status;
                if (status !== 404 && status !== 405) {
                    console.warn(`[HRMS] applyLeave failed for ${path}:`, error.message);
                }
            }
        }
    }

    throw lastError || new Error("HRMS leave application failed for all known endpoints.");
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
