require("dotenv").config();

const axios = require("axios");

const DEFAULT_API_BASE_URL = "https://vv-vp-api.azurewebsites.net/api/v1/employee";

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
    return authContext.user || decodeJwt(getToken(authContext));
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

function createEmployeeApi(authContext = {}) {
    const instance = axios.create({
        baseURL: getApiBaseUrl(),
        headers: createHeaders(authContext),
        validateStatus: () => true // Don't throw on any status
    });

    instance.interceptors.response.use(response => {
        if (response.status === 401) {
            console.error(`[HRMS] 401 Response from ${response.config.url}`);
            console.error(`[HRMS] Headers sent:`, response.config.headers);
        }
        return response;
    });

    return instance;
}

function createRootApi(authContext = {}) {
    const instance = axios.create({
        baseURL: getApiRoot(),
        headers: createHeaders(authContext),
        validateStatus: () => true // Don't throw on any status
    });

    instance.interceptors.response.use(response => {
        if (response.status === 401) {
            console.error(`[HRMS] 401 Response from ${response.config.url}`);
            console.error(`[HRMS] Headers sent:`, response.config.headers);
        }
        return response;
    });

    return instance;
}

async function getAttendance({ year = new Date().getFullYear(), authContext } = {}) {
    const api = createEmployeeApi(authContext);
    console.log(`[HRMS] getAttendance: year=${year}, hasToken=${Boolean(getToken(authContext))}`);
    const response = await api.get(`/attendance-record?year=${year}`);

    return response.data;
}

async function getLeaveTypes({ authContext } = {}) {
    const api = createRootApi(authContext);
    const response = await api.get("/api/v1/globalType/leave-type");

    return response.data;
}

async function getLeaveRequests({ skip = 0, limit = 10, authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const response = await api.get(`/leaveRequest?skip=${skip}&limit=${limit}`);

    return response.data;
}

async function getAllEmployeeLeaves({ authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const response = await api.get("/allEmployee-leave");

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
        contactNum: process.env.CONTACT_NUM || "9090909090",
        dateTime1: now,
        dateTime2: now,
        empId: user.empId,
        leaveDate: [fromDate, toDate],
        leaveDuration,
        leaveReason,
        leaveType,
        poId: [Number(process.env.PO_ID || 245)],
        userId: Number(user.userId)
    };

    const response = await api.post(
        process.env.HRMS_MARK_LEAVE_PATH || "/markLeave",
        payload
    );

    return response.data;
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
    getPunchReports,
    getProjects,
    applyLeave
};
