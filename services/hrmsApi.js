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

function extractPoIdsFromProjects(projects) {
    const rows = Array.isArray(projects?.data) ? projects.data :
        Array.isArray(projects?.data?.rows) ? projects.data.rows :
        Array.isArray(projects?.rows) ? projects.rows :
        Array.isArray(projects) ? projects : [];

    return rows.flatMap((project) => toNumberArray(
        project.poId ??
        project.poIds ??
        project.projectOwnerId ??
        project.projectOwnerIds ??
        project.project_owner_id ??
        project.projectOwner?.id ??
        project.projectOwner?.userId
    ));
}

function toLeaveDateTime(date, fallbackTime = "00:00:00") {
    if (!date) {
        return date;
    }

    const value = String(date).trim();
    if (value.includes("T")) {
        return value.replace("T", " ").slice(0, 19);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${value} ${fallbackTime}`;
    }

    return value;
}

function getCurrentDateInTimeZone(timeZone = "Asia/Kolkata") {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function normalizeDateOnly(value) {
    if (!value) {
        return "";
    }

    const raw = String(value).trim().replace(/\//g, "-");
    const numericDate = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
    if (numericDate) {
        const [, day, month, year] = numericDate;
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    if (raw.includes("T")) {
        const date = new Date(raw);
        if (!Number.isNaN(date.getTime())) {
            const parts = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).formatToParts(date);
            const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
            return `${values.year}-${values.month}-${values.day}`;
        }
    }

    return raw.slice(0, 10);
}

function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function hasLeaveShape(value = {}) {
    return isPlainObject(value) && (
        value.id !== undefined ||
        value._id !== undefined ||
        value.leaveId !== undefined ||
        value.leaveRequestId !== undefined ||
        value.leaveFrom !== undefined ||
        value.leaveTo !== undefined ||
        value.fromDate !== undefined ||
        value.toDate !== undefined ||
        value.leaveDate !== undefined ||
        value.leaveType !== undefined ||
        value.universalLeaveStatus !== undefined ||
        value.leaveStatus !== undefined
    );
}

function collectLeaveRows(value, rows = [], depth = 0) {
    if (depth > 8 || value === null || value === undefined) {
        return rows;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => {
            if (hasLeaveShape(item)) {
                rows.push(item);
            }
            collectLeaveRows(item, rows, depth + 1);
        });
        return rows;
    }

    if (isPlainObject(value)) {
        Object.values(value).forEach((item) => collectLeaveRows(item, rows, depth + 1));
    }

    return rows;
}

function unwrapArray(result) {
    if (Array.isArray(result?.data?.leaveRequest)) {
        return result.data.leaveRequest;
    }

    if (Array.isArray(result?.data?.data?.leaveRequest)) {
        return result.data.data.leaveRequest;
    }

    if (Array.isArray(result?.leaveRequest)) {
        return result.leaveRequest;
    }

    return collectLeaveRows(result);
}

function getLeaveStatus(leave = {}) {
    const status = leave.universalLeaveStatus ?? leave.leaveStatus ?? leave.statusId ?? leave.status;

    if (isPlainObject(status)) {
        return status.name ?? status.label ?? status.value ?? status.code ?? status.id;
    }

    return status;
}

function isPendingLeave(leave = {}) {
    const status = getLeaveStatus(leave);
    const text = String(status).toLowerCase();
    return Number(status) === 0 || text === "pending" || text.includes("pending");
}

function isApprovedLeave(leave = {}) {
    const status = getLeaveStatus(leave);
    const text = String(status).toLowerCase();
    return Number(status) === 1 || text === "approved" || text.includes("approved");
}

function getLeaveStatusLabel(leave = {}) {
    if (isPendingLeave(leave)) {
        return "pending";
    }

    if (isApprovedLeave(leave)) {
        return "approved";
    }

    return String(getLeaveStatus(leave) ?? "unknown");
}

function getLeaveFromDate(leave = {}) {
    return normalizeDateOnly(
        leave.leaveFrom ?? leave.fromDate ?? leave.from ?? leave.dateTime1 ?? leave.leaveDate?.fromDate ?? leave.leaveDate?.[0]
    );
}

function getLeaveToDate(leave = {}) {
    return normalizeDateOnly(
        leave.leaveTo ?? leave.toDate ?? leave.to ?? leave.dateTime2 ?? leave.leaveDate?.toDate ?? leave.leaveDate?.[1]
    );
}

function leaveMatchesDate(leave, date) {
    const normalizedDate = normalizeDateOnly(date);
    const fromDate = getLeaveFromDate(leave);
    const toDate = getLeaveToDate(leave) || fromDate;

    return fromDate <= normalizedDate && normalizedDate <= toDate;
}

function getLeaveId(leave = {}) {
    return leave.id ?? leave._id ?? leave.leaveId ?? leave.leaveRequestId;
}

function hasDowntimeShape(value = {}) {
    return isPlainObject(value) && (
        value.id !== undefined ||
        value._id !== undefined ||
        value.downTimeId !== undefined ||
        value.downtimeId !== undefined ||
        value.date !== undefined ||
        value.startTime !== undefined ||
        value.endTime !== undefined ||
        value.departmentId !== undefined ||
        value.subject !== undefined ||
        value.description !== undefined
    );
}

function collectDowntimeRows(value, rows = [], depth = 0) {
    if (depth > 8 || value === null || value === undefined) {
        return rows;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => {
            if (hasDowntimeShape(item)) {
                rows.push(item);
            }
            collectDowntimeRows(item, rows, depth + 1);
        });
        return rows;
    }

    if (isPlainObject(value)) {
        Object.values(value).forEach((item) => collectDowntimeRows(item, rows, depth + 1));
    }

    return rows;
}

function unwrapDowntimeArray(result) {
    return result?.data?.downTime || result?.data?.downtime || result?.data?.downTimeRequest ||
        result?.data?.rows || result?.downTime || result?.downtime || collectDowntimeRows(result);
}

function getDowntimeId(item = {}) {
    return item.id ?? item._id ?? item.downTimeId ?? item.downtimeId;
}

function getDowntimeStatus(item = {}) {
    const status = item.universalDownTimeStatus ?? item.downTimeStatus ?? item.downtimeStatus ?? item.statusId ?? item.status;

    if (isPlainObject(status)) {
        return status.name ?? status.label ?? status.value ?? status.code ?? status.id;
    }

    return status;
}

function isPendingDowntime(item = {}) {
    const status = getDowntimeStatus(item);
    const text = String(status).toLowerCase();
    return status === undefined || Number(status) === 0 || text === "pending" || text.includes("pending");
}

function downtimeMatchesDate(item, date) {
    const normalizedDate = normalizeDateOnly(date);
    const itemDate = normalizeDateOnly(item.date ?? item.downTimeDate ?? item.downtimeDate ?? item.startTime ?? item.createdAt);
    return itemDate === normalizedDate;
}

function assertNoPastLeaveDate(fromDate, toDate) {
    fromDate = normalizeDateOnly(fromDate);
    toDate = normalizeDateOnly(toDate);

    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
        throw new Error("Leave/WFH dates must use YYYY-MM-DD format.");
    }

    const today = getCurrentDateInTimeZone();
    if (fromDate < today || toDate < today) {
        throw new Error(`Cannot apply leave/WFH for past dates. Today is ${today}.`);
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

async function deletePendingLeaveRequest({ date, id, leaveId, authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const normalizedDate = normalizeDateOnly(date);
    const requestedId = id || leaveId;

    if (!isIsoDate(normalizedDate)) {
        throw new Error("Leave date must use YYYY-MM-DD format.");
    }

    const leaves = unwrapArray(await getLeaveRequests({ skip: 0, limit: 100, authContext }));
    console.log("[HRMS] deletePendingLeaveRequest checked leaves", leaves.map((item) => ({
        id: getLeaveId(item),
        from: getLeaveFromDate(item),
        to: getLeaveToDate(item) || getLeaveFromDate(item),
        status: getLeaveStatus(item),
        pending: isPendingLeave(item)
    })));

    const leave = requestedId
        ? leaves.find((item) => String(getLeaveId(item)) === String(requestedId))
        : leaves.find((item) =>
        getLeaveId(item) &&
        isPendingLeave(item) &&
        leaveMatchesDate(item, normalizedDate)
    );

    if (leave && !isPendingLeave(leave)) {
        throw new Error(`Leave request for ${normalizedDate} is ${getLeaveStatusLabel(leave)}. Only pending leave can be deleted.`);
    }

    if (leave && !leaveMatchesDate(leave, normalizedDate)) {
        throw new Error(`Leave id ${getLeaveId(leave)} does not match ${normalizedDate}.`);
    }

    if (!leave) {
        const candidates = leaves
            .filter(isPendingLeave)
            .map((item) => `${getLeaveFromDate(item)} to ${getLeaveToDate(item) || getLeaveFromDate(item)} (${item.leaveType || "unknown"})`)
            .slice(0, 5)
            .join(", ");
        throw new Error(`No pending leave request found for ${normalizedDate}. Pending candidates checked: ${candidates || "none"}.`);
    }

    return request(api, "patch", `/employee/deleteLeaveRequest/${getLeaveId(leave)}`, {});
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
    const userPoIds = toNumberArray(poId).length ? toNumberArray(poId) : getUserPoIds(user);
    let resolvedPoId = userPoIds.length ? userPoIds : toNumberArray(process.env.PO_ID);
    const resolvedName = name || user.name || user.userName || user.email;

    if (!resolvedPoId.length) {
        try {
            resolvedPoId = extractPoIdsFromProjects(await getProjects({ skip: 0, limit: 100, authContext }));
        } catch (error) {
            console.warn("[HRMS] Could not derive poId from projects:", error.message);
        }
    }

    if (!resolvedPoId.length) {
        throw new Error("Cannot mark downtime: missing poId in request, session token, assigned projects, or PO_ID env.");
    }
    
    const payload = {
        date,
        departmentId,
        description,
        endTime,
        name: resolvedName,
        poId: resolvedPoId,
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

async function getDownTimeRequests({ skip = 0, limit = 100, authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const paths = [
        `/employee/markDownTime?skip=${skip}&limit=${limit}`,
        `/employee/downTime?skip=${skip}&limit=${limit}`,
        `/employee/downtime?skip=${skip}&limit=${limit}`,
        `/employee/downTimeRequest?skip=${skip}&limit=${limit}`,
        `/employee/getDownTime?skip=${skip}&limit=${limit}`
    ];

    let lastError = null;
    for (const path of paths) {
        try {
            return await request(api, "get", path);
        } catch (error) {
            lastError = error;
            const status = error.statusCode || error.response?.status;
            if (status === 401 || status === 403) {
                throw error;
            }
        }
    }

    throw lastError || new Error("No downtime lookup endpoint found.");
}

async function deletePendingDownTime({ date, id, downTimeId, downtimeId, authContext } = {}) {
    const api = createEmployeeApi(authContext);
    const normalizedDate = normalizeDateOnly(date);
    const requestedId = id || downTimeId || downtimeId;

    if (!isIsoDate(normalizedDate)) {
        throw new Error("Downtime date must use YYYY-MM-DD format.");
    }

    const rows = unwrapDowntimeArray(await getDownTimeRequests({ skip: 0, limit: 100, authContext }));
    console.log("[HRMS] deletePendingDownTime checked rows", rows.map((item) => ({
        id: getDowntimeId(item),
        date: normalizeDateOnly(item.date ?? item.downTimeDate ?? item.downtimeDate ?? item.startTime ?? item.createdAt),
        status: getDowntimeStatus(item),
        pending: isPendingDowntime(item)
    })));

    const item = requestedId
        ? rows.find((row) => String(getDowntimeId(row)) === String(requestedId))
        : rows.find((row) => getDowntimeId(row) && isPendingDowntime(row) && downtimeMatchesDate(row, normalizedDate));

    if (item && !isPendingDowntime(item)) {
        throw new Error(`Downtime request for ${normalizedDate} is not pending. Only pending downtime can be deleted.`);
    }

    if (item && !downtimeMatchesDate(item, normalizedDate)) {
        throw new Error(`Downtime id ${getDowntimeId(item)} does not match ${normalizedDate}.`);
    }

    if (!item) {
        const candidates = rows
            .filter(isPendingDowntime)
            .map((row) => `${getDowntimeId(row)}:${normalizeDateOnly(row.date ?? row.downTimeDate ?? row.downtimeDate ?? row.startTime ?? row.createdAt)}`)
            .slice(0, 5)
            .join(", ");
        throw new Error(`No pending downtime found for ${normalizedDate}. Pending candidates checked: ${candidates || "none"}.`);
    }

    return request(api, "patch", `/employee/deleteDownTime/${getDowntimeId(item)}`, {});
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
    fromDate = normalizeDateOnly(fromDate);
    toDate = normalizeDateOnly(toDate);
    assertNoPastLeaveDate(fromDate, toDate);
    const fromDateTime = toLeaveDateTime(fromDate, "00:00:00");
    const toDateTime = toLeaveDateTime(toDate, "23:59:59");

    if (!user.empId || !user.userId) {
        throw new Error("Login session is missing empId or userId.");
    }

    const leaves = unwrapArray(await getLeaveRequests({ skip: 0, limit: 100, authContext }));
    const existingLeave = leaves.find((item) =>
        leaveMatchesDate(item, fromDate) &&
        (isPendingLeave(item) || isApprovedLeave(item))
    );

    if (existingLeave) {
        throw new Error(
            `Cannot apply leave/WFH for ${fromDate}. Existing request status is ${getLeaveStatusLabel(existingLeave)}.`
        );
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
            dateTime1: fromDateTime,
            dateTime2: toDateTime,
            leaveDate: [fromDate, toDate]
        },
        {
            ...basePayload,
            dateTime1: fromDateTime,
            dateTime2: toDateTime,
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
    deletePendingLeaveRequest,
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
    getDownTimeRequests,
    deletePendingDownTime,
    createTicket,
    applyLeave
};
