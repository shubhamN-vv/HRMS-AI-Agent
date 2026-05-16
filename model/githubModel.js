const OpenAI = require("openai");
const { webcrypto } = require("crypto");

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

function createOpenAIClient() {
    return new OpenAI({
        baseURL: process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference",
        apiKey: process.env.GITHUB_TOKEN
    });
}

function getModelName() {
    return process.env.GITHUB_MODEL || "gpt-4o-mini";
}

module.exports = {
    createOpenAIClient,
    getModelName
};
