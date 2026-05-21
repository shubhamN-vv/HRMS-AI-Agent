require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");

const sessions = require("./session/sessionStore");
const { verifyMsToken } = require("./services/ssoAuthApi");
const { isJwtExpired } = require("./services/hrmsApi");
const {
    handleHrmsChat,
    resetHrmsChat
} = require("./workflows/hrmsWorkflow");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getSessionId(req) {
    // Enforce header-only session ID for robustness. Use the `x-session-id` header.
    return (req.headers["x-session-id"] || "").toString();
}

function getSession(sessionId) {
    return sessions[sessionId] || null;
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

function requireSession(req, res, next) {
    const sessionId = getSessionId(req);
    const session = getSession(sessionId);

    if (!sessionId || !session) {
        console.warn("[SESSION] No active session", {
            sessionId,
            header: req.headers["x-session-id"]
        });

        return res.status(401).json({
            error: "No active session. Please login first."
        });
    }

    if (clearExpiredSession(sessionId, session)) {
        return res.status(401).json({
            error: "Session expired. Please login again."
        });
    }

    if (!isSessionActive(session)) {
        delete sessions[sessionId];
        return res.status(401).json({
            error: "Session expired. Please login again."
        });
    }

    req.sessionId = sessionId;
    req.session = session;

    next();
}

app.post("/login/sso", async (req, res) => {
    try {
        const { token: msAccessToken } = req.body;

        if (!msAccessToken) {
            return res.status(400).json({
                error: "Microsoft access token is required"
            });
        }

        const auth = await verifyMsToken(msAccessToken);
        const sessionId = crypto.randomUUID();

        sessions[sessionId] = {
            token: auth.token,
            user: auth.user,
            permissions: auth.permissions,
            loginDate: auth.loginDate,
            history: []
        };

        // Unified login audit log: session id, user id, emp id, name, email and request IP
        console.log("[LOGIN SSO] session created", {
            sessionId,
            userId: auth.user?.userId,
            empId: auth.user?.empId,
            name: auth.user?.name || auth.user?.userName,
            email: auth.user?.email,
            ip: req.ip
        });

        return res.json({
            sessionId,
            user: auth.user,
            permissions: auth.permissions,
            loginDate: auth.loginDate
        });
    } catch (error) {
        const errorMessage = error.message || "Microsoft SSO authentication failed";

        return res.status(error.statusCode || 401).json({
            error: errorMessage
        });
    }
});

app.get("/me", requireSession, (req, res) => {
    const { sessionId, session } = req;

    return res.json({
        sessionId,
        user: session.user
    });
});

app.get("/session", (req, res) => {
    const sessionId = getSessionId(req);
    const session = getSession(sessionId);

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

app.post("/chat", requireSession, async (req, res) => {
    try {
        const sessionId = req.sessionId;
        const session = req.session;
        const userMessage = String(req.body.message || "").trim();

        if (!userMessage) {
            return res.status(400).json({
                error: "message is required"
            });
        }

        console.log(`[CHAT] SessionId: ${sessionId}, hasToken: ${Boolean(session?.token)}, isExpired: ${session?.token ? isJwtExpired(session.token) : 'N/A'}, user: ${session?.user?.email}`);

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
