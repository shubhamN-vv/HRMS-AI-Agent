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

        return {
            token,
            user: response.data.user,
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
