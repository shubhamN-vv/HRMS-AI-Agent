const OpenAI = require("openai");
const { webcrypto } = require("crypto");

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

function createOpenAIClient() {
    const apiKey = process.env.OPENAI_API_KEY || process.env.GITHUB_TOKEN;

    if (!apiKey) {
        throw new Error(
            "Missing OpenAI or GitHub model API key. Set OPENAI_API_KEY or GITHUB_TOKEN in .env"
        );
    }

    const baseURL = process.env.OPENAI_API_KEY
        ? process.env.OPENAI_API_BASE_URL
        : process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference";

    return new OpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {})
    });
}

function getModelName() {
    if (process.env.OPENAI_MODEL) {
        return process.env.OPENAI_MODEL;
    }

    if (process.env.GITHUB_MODEL) {
        return process.env.GITHUB_MODEL;
    }

    if (process.env.GITHUB_TOKEN) {
        return "openai/o4-mini";
    }

    return "gpt-4o-mini";
}

module.exports = {
    createOpenAIClient,
    getModelName
};
