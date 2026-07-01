require("dotenv").config();

const axios = require("axios");

const DEFAULT_API_ROOT = "https://vv-vp-api.azurewebsites.net";

function getApiRoot() {
    const baseUrl = process.env.HRMS_API_BASE_URL;

    if (!baseUrl) {
        return DEFAULT_API_ROOT;
    }

    try {
        return new URL(baseUrl).origin;
    } catch (error) {
        return DEFAULT_API_ROOT;
    }
}

function findToken(data) {
    if (!data || typeof data !== "object") {
        return null;
    }

    return (
        data.token ||
        data.accessToken ||
        data.jwt ||
        data.data?.token ||
        data.data?.accessToken ||
        data.data?.jwt ||
        data.result?.token ||
        data.result?.accessToken ||
        data.result?.jwt ||
        null
    );
}

function decodeJwt(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) {
        return {};
    }

    try {
        const payload = token.split(".")[1];
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = Buffer.from(normalized, "base64").toString("utf8");

        return JSON.parse(decoded);
    } catch (error) {
        return {};
    }
}

function normalizeSsoUser(user = {}) {
    if (!user || typeof user !== "object") {
        return {};
    }

    return {
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
}

function hasUserIdentity(user = {}) {
    return Boolean(
        user &&
        typeof user === "object" &&
        (user.userId ?? user.empId ?? user.email ?? user.name ?? user.userName ?? user.employeeId ?? user.employee_id ?? user.emp_id)
    );
}

function getSsoUser(token, rawUser = {}) {
    const normalizedFromResponse = normalizeSsoUser(rawUser);

    if (hasUserIdentity(normalizedFromResponse)) {
        return normalizedFromResponse;
    }

    const normalizedFromToken = normalizeSsoUser(decodeJwt(token));

    if (hasUserIdentity(normalizedFromToken)) {
        return normalizedFromToken;
    }

    return normalizedFromResponse;
}

function findMessage(data) {
    if (!data || typeof data !== "object") {
        return null;
    }

    return (
        data.message ||
        data.error ||
        data.data?.message ||
        data.data?.error ||
        data.result?.message ||
        data.result?.error ||
        null
    );
}

function createSsoError(message, statusCode = 401) {
    const error = new Error(message || "Microsoft SSO authentication failed");
    error.statusCode = statusCode;
    return error;
}

async function verifyMsToken(msAccessToken) {
    try {
        const response = await axios.post(
            `${getApiRoot()}/api/v1/auth/verifyToken`,
            { token: msAccessToken },
            { validateStatus: () => true }
        );

        const responseMessage = findMessage(response.data);

        if (response.status >= 400) {
            throw createSsoError(responseMessage || "Token verification failed", response.status);
        }

        if (response.data?.status === false || response.data?.success === false) {
            throw createSsoError(responseMessage || "Invalid Microsoft token");
        }

        const token = findToken(response.data);

        if (!token) {
            throw createSsoError(responseMessage || "No token received from server");
        }

        const rawUser =
            response.data.user ||
            response.data.data?.user ||
            response.data.result?.user ||
            response.data.data ||
            response.data.result ||
            {};

        return {
            token,
            user: getSsoUser(token, rawUser),
            permissions: response.data.permissions,
            loginDate: response.data.loginDate,
            raw: response.data
        };
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }
        throw createSsoError(
            error.response?.data?.message || error.message || "Microsoft authentication error",
            error.response?.status || 401
        );
    }
}

module.exports = {
    verifyMsToken
};
