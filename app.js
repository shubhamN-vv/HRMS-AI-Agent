require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");

const sessions = require("./session/sessionStore");
const { login } = require("./services/authApi");
const { isJwtExpired } = require("./services/hrmsApi");
const {
    handleHrmsChat,
    resetHrmsChat
} = require("./workflows/hrmsWorkflow");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getSessionId(req) {
    return (
        req.headers["x-session-id"] ||
        req.body.sessionId ||
        req.body.userId ||
        ""
    ).toString();
}

function getOrCreateSession(sessionId) {
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            history: []
        };
    }

    return sessions[sessionId];
}

function isSessionActive(session) {
    return Boolean(session?.token) && !isJwtExpired(session.token);
}

function clearExpiredSession(sessionId, session) {
    if (session?.token && isJwtExpired(session.token)) {
        delete sessions[sessionId];

        return true;
    }

    return false;
}

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "email and password are required"
            });
        }

        const auth = await login({ email, password });
        const sessionId = crypto.randomUUID();

        sessions[sessionId] = {
            token: auth.token,
            user: auth.user,
            history: []
        };

        return res.json({
            sessionId,
            user: auth.user
        });
    } catch (error) {
        return res.status(error.statusCode || 401).json({
            error: error.response?.data?.message || error.message
        });
    }
});

app.get("/me", (req, res) => {
    const sessionId = getSessionId(req);
    const session = sessions[sessionId];

    if (clearExpiredSession(sessionId, session)) {
        return res.status(401).json({
            error: "Session expired. Please login again."
        });
    }

    if (isSessionActive(session) && session.user) {
        return res.json({
            sessionId,
            user: session.user
        });
    }

    return res.status(401).json({
        error: "No active session. Please login first."
    });
});

app.get("/session", (req, res) => {
    const sessionId = getSessionId(req);
    const session = sessions[sessionId];

    return res.json({
        hasSessionId: Boolean(sessionId),
        hasServerSession: Boolean(session),
        hasToken: Boolean(session?.token),
        isExpired: session?.token ? isJwtExpired(session.token) : null,
        user: session?.user || null
    });
});

app.post("/logout", (req, res) => {
    const sessionId = getSessionId(req);

    if (sessionId) {
        delete sessions[sessionId];
    }

    return res.json({
        message: "Logged out"
    });
});

app.post("/chat", async (req, res) => {
    try {
        const sessionId = getSessionId(req);
        const userMessage = String(req.body.message || "").trim();

        if (!userMessage) {
            return res.status(400).json({
                error: "message is required"
            });
        }

        if (!sessionId) {
            return res.status(401).json({
                error: "Please login first."
            });
        }

        const session = getOrCreateSession(sessionId);

        console.log(`[CHAT] SessionId: ${sessionId}, hasToken: ${Boolean(session?.token)}, isExpired: ${session?.token ? isJwtExpired(session.token) : 'N/A'}, user: ${session?.user?.email}`);

        if (clearExpiredSession(sessionId, session)) {
            return res.status(401).json({
                error: "Session expired. Please login again."
            });
        }

        if (!isSessionActive(session)) {
            console.log(`[CHAT] Session not active - token: ${Boolean(session?.token)}, expired: ${session?.token ? isJwtExpired(session.token) : 'N/A'}`);
            return res.status(401).json({
                error: "Please login first."
            });
        }

        if (["reset", "/reset", "start over"].includes(userMessage.toLowerCase())) {
            resetHrmsChat({ sessions, sessionId });

            return res.json({
                message: "Session reset. Tell me what you want to do in HRMS."
            });
        }

        const response = await handleHrmsChat({
            sessions,
            sessionId,
            message: userMessage
        });

        return res.json(response);
    } catch (error) {
        console.error("Chat Error:", error);

        return res.status(500).json({
            error: error.message
        });
    }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`HRMS AI agent running on ${port}`);
});
