require("dotenv").config();

const axios = require("axios");
const { decodeJwt } = require("./hrmsApi");

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

const GENERIC_LOGIN_FAILED_MESSAGE = "Username or password is incorrect.";

function createLoginError(message, statusCode = 401) {
    const error = new Error(message || GENERIC_LOGIN_FAILED_MESSAGE);
    error.statusCode = statusCode;

    return error;
}

async function login({ email, password }) {
    const response = await axios.post(
        `${getApiRoot()}/api/v1/auth/login`,
        {
            email,
            password
        },
        {
            validateStatus: () => true
        }
    );

    const responseMessage = findMessage(response.data);

    if (response.status >= 400) {
        throw createLoginError(responseMessage || GENERIC_LOGIN_FAILED_MESSAGE, response.status);
    }

    if (response.data?.status === false || response.data?.success === false) {
        throw createLoginError(responseMessage || GENERIC_LOGIN_FAILED_MESSAGE);
    }

    const token = findToken(response.data);

    if (!token) {
        throw createLoginError(responseMessage || GENERIC_LOGIN_FAILED_MESSAGE);
    }

    return {
        token,
        user: decodeJwt(token),
        raw: response.data
    };
}

module.exports = {
    login
};
