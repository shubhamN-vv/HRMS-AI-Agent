// MSAL Configuration
const msalConfig = {
    auth: {
        clientId: "f876110d-32fd-4f66-b5d7-1f7860f09445",
        authority: "https://login.microsoftonline.com/814e9d1d-9941-4486-84f3-d0dd72dca76b",
        redirectUri: window.location.origin,
        postLogoutRedirectUri: "/"
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false
    }
};

const loginRequest = {
    scopes: ["User.Read", "Mail.Read"]
};

// Initialize MSAL
const msalInstance = new msal.PublicClientApplication(msalConfig);

// DOM Elements
const loadingSection = document.getElementById("loadingSection");
const loginSection = document.getElementById("loginSection");
const chatSection = document.getElementById("chatSection");
const loginStatus = document.getElementById("loginStatus");
const userInfo = document.getElementById("userInfo");
const messages = document.getElementById("messages");
const messageInput = document.getElementById("message");
const microsoftLoginButton = document.getElementById("microsoftLoginButton");
const logoutButton = document.getElementById("logoutButton");
const busyIndicator = document.getElementById("busyIndicator");
const stopButton = document.getElementById("stopButton");
const slashMenu = document.getElementById("slashMenu");
const shortcutChips = document.getElementById("shortcutChips");
const defaultPlaceholder = messageInput.dataset.placeholder;

// Hide the login section and show only the loading screen.
if (loadingSection) {
    loadingSection.classList.remove("hidden");
}
if (loginSection) {
    loginSection.classList.add("hidden");
}
loginStatus.textContent = "Loading...";

const slashModules = [
    "leave",
    "wfh",
    "projects",
    "holidays",
    "attendance",
    "punching-report",
    "daily-status-report",
    "down-time",
    "tickets"
];

const moduleShortcuts = [
    { id: "leave-tomorrow", module: "leave", before: "apply", after: "tomorrow" },
    { id: "leave-balance", module: "leave", after: "balance" },
    { id: "wfh-today", module: "wfh", after: "today" },
    { id: "projects-active", module: "projects", before: "active" },
    { id: "holidays-count", module: "holidays", after: "count" },
    { id: "attendance-year", module: "attendance", after: "year" },
    { id: "punching-report", module: "punching-report" },
    { id: "daily-status-report", module: "daily-status-report", before: "submit" },
    { id: "down-time", module: "down-time", before: "mark" },
    { id: "tickets-active", module: "tickets", before: "active" }
];

let busyTimer = null;
let fetchTimeoutId = null;
let currentFetchController = null;
let currentRequestTimedOut = false;
let selectedSlashIndex = -1;
let selectedShortcutIds = new Set();
let sessionId = localStorage.getItem("hrmsSessionId");

function extractNameFromEmail(email) {
    if (!email || typeof email !== 'string') return "User";

    // Extract: firstname.lastname
    const match = email.match(/vv_([^@]+)/);
    if (!match) return email.split('@')[0];

    const parts = match[1].split('.');
    const name = parts.map(part =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join(' ');

    return name;
}

function getUserDisplay(user) {
    if (!user) return "Logged in";
    if (typeof user === 'string') return user;
    const id = user.empId || user.userId || user.employeeId || user.employee_id || "";
    const name = user.userName || user.name || user.email || "User";
    const role = user.userRole || user.role || "";
    return [name, id, role].filter(Boolean).join(" | ");
}

function getUserName(user) {
    if (!user) return "there";
    if (typeof user === 'string') return extractNameFromEmail(user);
    return extractNameFromEmail(user.email || user.userName || user.name || "");
}

function showChat(user) {
    if (loadingSection) {
        loadingSection.classList.add("hidden");
    }
    loginSection.classList.add("hidden");
    chatSection.classList.remove("hidden");

    const displayUser = getUserDisplay(user);
    const userName = getUserName(user);

    userInfo.textContent = displayUser;

    messageInput.dataset.placeholder = user
        ? `Hi ${userName || "there"}, how can I help you today?`
        : defaultPlaceholder;
    inputSetEmpty(true);
    closeSlashMenu();
    renderShortcutChips();
    busyIndicator.style.display = "none";
    inputSetDisabled(false);
    logoutButton.disabled = false;
    stopButton.classList.add("hidden");
    stopButton.disabled = true;
    currentFetchController = null;
    messageInput.focus();
}

function showToast(message, type = "success") {
    const toastDiv = document.createElement("div");
    toastDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === "success" ? "#4caf50" : "#f44336"};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        font-size: 14px;
        animation: slideIn 0.3s ease-in-out;
        max-width: 400px;
    `;
    toastDiv.textContent = message;
    document.body.appendChild(toastDiv);

    setTimeout(() => {
        toastDiv.style.animation = "slideOut 0.3s ease-in-out";
        setTimeout(() => toastDiv.remove(), 300);
    }, 3000);
}

function addMessage(text, type) {
    const node = document.createElement("div");
    node.className = `message ${type}`;
    if (type === "user") {
        node.innerHTML = formatModules(text);
    } else {
        node.textContent = text;
    }
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
}

function formatModules(text) {
    let formatted = text;

    slashModules.forEach(mod => {
        // Match /mod or bare mod — always render as /mod in blue
        const regex = new RegExp(`\\/?\\b(${mod})\\b`, "gi");
        formatted = formatted.replace(regex, (_, name) =>
            `<span class="module-highlight">${name}</span>`
        );
    });

    return formatted;
}

function showLogin() {
    chatSection.classList.add("hidden");
    Array.from(messages.querySelectorAll(".message")).forEach((node) =>
        node.remove(),
    );
    userInfo.textContent = "";
    loginStatus.textContent = "";
    messageInput.dataset.placeholder = defaultPlaceholder;
    inputClear();
    selectedShortcutIds = new Set();
    renderShortcutChips();
    busyIndicator.style.display = "none";
    setBusy(false);
    stopButton.classList.add("hidden");
    stopButton.disabled = true;
}

function clearLocalSession(message) {
    sessionId = null;
    localStorage.removeItem("hrmsSessionId");
    setBusy(false);
    stopButton.classList.add("hidden");
    stopButton.disabled = true;
    loginStatus.textContent = message || "Please login again.";

    // Redirect to Microsoft SSO instead of showing the sign-in UI.
    msalInstance.loginRedirect(loginRequest);
}

async function handleMicrosoftLogin() {
    loginStatus.textContent = "Signing in with Microsoft...";
    setLoginBusy(true);

    try {
        const activeAccount = msalInstance.getActiveAccount();
        let authResult;

        if (activeAccount) {
            try {
                authResult = await msalInstance.acquireTokenSilent({
                    scopes: loginRequest.scopes,
                    account: activeAccount,
                });
            } catch (err) {
                console.warn("Silent token acquisition failed:", err.message);
                await msalInstance.loginRedirect(loginRequest);
                return;
            }
        } else {
            await msalInstance.loginRedirect(loginRequest);
            return;
        }

        if (!authResult || !authResult.accessToken) {
            loginStatus.textContent = "Failed to obtain access token";
            return;
        }

        await handleAuthenticationSuccess(authResult.accessToken);
    } catch (error) {
        loginStatus.textContent = error.message || "Microsoft login failed";
        console.error("Login error:", error);
    } finally {
        setLoginBusy(false);
    }
}

async function handleAuthenticationSuccess(msAccessToken) {
    loginStatus.textContent = "Verifying with HRMS...";

    try {
        const response = await fetch("/login/sso", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                token: msAccessToken,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            loginStatus.textContent = data.error || "Authentication failed";
            showToast(data.error || "Authentication failed", "error");
            return;
        }

        sessionId = data.sessionId;
        localStorage.setItem("hrmsSessionId", sessionId);
        showChat(data.user);
        loginStatus.textContent = "";

        const message = data.message || "Welcome back!";
        showToast(message, "success");
        console.log('Login message:', message);
    } catch (error) {
        loginStatus.textContent = "Unable to authenticate. Please try again.";
        showToast("Unable to authenticate. Please try again.", "error");
        console.error("Authentication error:", error)
    }
}

async function sendMessage(text) {
    if (!text || messageInput.getAttribute("aria-disabled") === "true") {
        return;
    }

    addMessage(text, "user");
    inputClear();
    setBusy(true);
    stopButton.classList.remove("hidden");
    stopButton.disabled = false;
    currentRequestTimedOut = false;

    currentFetchController = new AbortController();
    fetchTimeoutId = setTimeout(() => {
        currentRequestTimedOut = true;
        currentFetchController?.abort();
    }, 120000);

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": sessionId || "",
            },
            body: JSON.stringify({
                sessionId,
                message: text,
            }),
            signal: currentFetchController.signal,
        });

        const data = await response.json();

        if (response.status === 401) {
            clearLocalSession(data.error);
            return;
        }

        addMessage(data.message || data.error || "No response", "agent");
    } catch (error) {
        if (error.name === "AbortError") {
            if (currentRequestTimedOut) {
                addMessage("Request timed out after 120 seconds. Please try again with a simpler query or check your connection.", "agent");
            } else {
                addMessage("Request cancelled.", "agent");
            }
        } else {
            addMessage("Unable to reach HRMS AI. Please try again.", "agent");
        }
    } finally {
        if (fetchTimeoutId) {
            clearTimeout(fetchTimeoutId);
            fetchTimeoutId = null;
        }
        setBusy(false);
        stopButton.classList.add("hidden");
        currentFetchController = null;
        messageInput.focus();
    }
}

function setLoginBusy(isBusy) {
    microsoftLoginButton.disabled = isBusy;
}

// ── contenteditable helpers ───────────────────────────────────────────

// Get plain text of the div, collapsing .tok spans to their text
function inputGetText() {
    const clone = messageInput.cloneNode(true);
    clone.querySelectorAll(".tok-remove").forEach((node) => node.remove());
    return clone.innerText.replace(/\n$/, "").trim();
}

// Clear all content and reset empty state
function inputClear() {
    messageInput.innerHTML = "";
    selectedShortcutIds = new Set();
    renderShortcutChips();
    inputSetEmpty(true);
}

function inputSetEmpty(isEmpty) {
    messageInput.dataset.empty = isEmpty ? "true" : "false";
    if (isEmpty && messageInput.innerHTML !== "") {
        messageInput.innerHTML = "";
    }
}

function inputSetDisabled(disabled) {
    messageInput.contentEditable = disabled ? "false" : "true";
    messageInput.setAttribute("aria-disabled", disabled ? "true" : "false");
}

// Get text before the caret inside messageInput
function getTextBeforeCaret() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(messageInput);
    range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return range.toString();
}

function shortcutText(shortcut) {
    return [shortcut.before, shortcut.module, shortcut.after]
        .filter(Boolean)
        .join(" ");
}

function createModuleText(shortcut) {
    const fragment = document.createDocumentFragment();
    if (shortcut.before) {
        fragment.append(shortcut.before + " ");
    }

    const module = document.createElement("span");
    module.className = "tok-module";
    module.textContent = shortcut.module;
    fragment.appendChild(module);

    if (shortcut.after) {
        fragment.append(" " + shortcut.after);
    }

    return fragment;
}

function createToken(moduleName) {
    const span = document.createElement("span");
    span.className = "tok";
    span.dataset.module = moduleName;
    span.contentEditable = "false";

    const label = document.createElement("span");
    label.textContent = moduleName;
    span.appendChild(label);

    return span;
}

function createShortcutToken(shortcut) {
    const span = document.createElement("span");
    span.className = "tok shortcut-token";
    span.dataset.shortcutId = shortcut.id;
    span.contentEditable = "false";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tok-remove";
    remove.setAttribute("aria-label", `Remove ${shortcutText(shortcut)}`);
    remove.textContent = "x";
    remove.addEventListener("click", () => removeShortcutToken(span));

    span.append(remove, createModuleText(shortcut));
    return span;
}

function placeCaretAfter(node) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

function placeCaretAtStart() {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(messageInput, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

function normalizeEmptyInput() {
    if (inputGetText()) return false;
    messageInput.innerHTML = "";
    inputSetEmpty(true);
    placeCaretAtStart();
    return true;
}

// Replace the last N characters before the caret with a .tok span + trailing space text node
function insertToken(moduleName, deleteLen) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // Delete the typed chars
    const range = sel.getRangeAt(0).cloneRange();
    range.setStart(range.startContainer, range.startOffset - deleteLen);
    range.deleteContents();

    const span = createToken(moduleName);

    // Insert a plain space after it so cursor lands in normal text
    const space = document.createTextNode(" ");

    const insertRange = sel.getRangeAt(0);
    insertRange.insertNode(space);
    insertRange.insertNode(span);

    placeCaretAfter(space);

    inputSetEmpty(inputGetText() === "");
}

function appendShortcut(shortcut) {
    if (messageInput.getAttribute("aria-disabled") === "true") return;

    messageInput.focus();
    normalizeEmptyInput();
    if (inputGetText()) {
        messageInput.appendChild(document.createTextNode(" "));
    }

    const token = createShortcutToken(shortcut);
    const space = document.createTextNode(" ");
    messageInput.append(token, space);
    selectedShortcutIds.add(shortcut.id);
    renderShortcutChips();
    inputSetEmpty(false);
    closeSlashMenu();
    placeCaretAfter(space);
}

function removeShortcutToken(token) {
    const shortcutId = token.dataset.shortcutId;
    if (shortcutId) {
        selectedShortcutIds.delete(shortcutId);
        renderShortcutChips();
    }
    const next = token.nextSibling;
    token.remove();
    if (next?.nodeType === Node.TEXT_NODE && next.textContent.startsWith(" ")) {
        next.textContent = next.textContent.slice(1);
    }
    inputSetEmpty(inputGetText() === "");
    messageInput.focus();
}

function renderShortcutChips() {
    if (!shortcutChips) return;
    shortcutChips.innerHTML = "";
    moduleShortcuts
        .filter((shortcut) => !selectedShortcutIds.has(shortcut.id))
        .forEach((shortcut) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "shortcut-chip";
            chip.disabled = messageInput.getAttribute("aria-disabled") === "true";
            chip.appendChild(createModuleText(shortcut));
            chip.addEventListener("click", () => appendShortcut(shortcut));
            shortcutChips.appendChild(chip);
        });
}

function syncShortcutChips() {
    const activeIds = new Set(
        Array.from(messageInput.querySelectorAll(".shortcut-token"))
            .map((token) => token.dataset.shortcutId)
            .filter(Boolean),
    );

    if (activeIds.size === selectedShortcutIds.size &&
        Array.from(activeIds).every((id) => selectedShortcutIds.has(id))) {
        return;
    }

    selectedShortcutIds = activeIds;
    renderShortcutChips();
}

// ── slash menu ────────────────────────────────────────────────────────

function getSlashQuery() {
    const textBefore = getTextBeforeCaret();
    const match = /(?:^|\s)(\/[^\s]*)$/.exec(textBefore);
    return match ? match[1] : null;
}

function renderSlashMenu() {
    const query = getSlashQuery();
    if (!query) {
        closeSlashMenu();
        return;
    }

    const filter = query.slice(1).toLowerCase();
    const candidates = slashModules.filter((module) =>
        module.startsWith(filter),
    );
    if (!candidates.length) {
        closeSlashMenu();
        return;
    }

    selectedSlashIndex = Math.min(
        selectedSlashIndex,
        candidates.length - 1,
    );
    if (selectedSlashIndex < 0) {
        selectedSlashIndex = 0;
    }

    slashMenu.innerHTML = "";
    candidates.forEach((module, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = module;
        item.className = index === selectedSlashIndex ? "active" : "";
        item.addEventListener("click", () => {
            selectSlashModule(module);
        });
        slashMenu.appendChild(item);
    });

    slashMenu.classList.remove("hidden");
}

function selectSlashModule(module) {
    const textBefore = getTextBeforeCaret();
    const match = /(?:^|\s)(\/[^\s]*)$/.exec(textBefore);
    if (!match) return;
    // deleteLen = typed chars e.g. "/wf" = 3
    insertToken(module, match[1].length);
    closeSlashMenu();
}

function closeSlashMenu() {
    selectedSlashIndex = -1;
    slashMenu.innerHTML = "";
    slashMenu.classList.add("hidden");
}

function handleMessageInput() {
    syncShortcutChips();
    if (normalizeEmptyInput()) {
        closeSlashMenu();
        return;
    }
    inputSetEmpty(inputGetText() === "");
    checkBareModuleWord();
    renderSlashMenu();
}

// Auto-convert bare module word typed + space → /module token
function checkBareModuleWord() {
    const textBefore = getTextBeforeCaret();
    const match = /(?:^|\s)([a-z][a-z0-9-]*)\s$/i.exec(textBefore);
    if (!match) return;
    const word = match[1].toLowerCase();
    if (!slashModules.includes(word)) return;
    // deleteLen = word + the space = match[1].length + 1
    insertToken(word, match[1].length + 1);
}

function setBusy(isBusy) {
    logoutButton.disabled = isBusy;
    inputSetDisabled(isBusy);
    renderShortcutChips();

    if (busyTimer) {
        clearTimeout(busyTimer);
        busyTimer = null;
    }

    if (isBusy) {
        busyTimer = setTimeout(() => {
            busyIndicator.style.display = "flex";
        }, 100);
    } else {
        busyIndicator.style.display = "none";
    }
}

stopButton.addEventListener("click", () => {
    if (currentFetchController) {
        currentFetchController.abort();
        if (fetchTimeoutId) {
            clearTimeout(fetchTimeoutId);
            fetchTimeoutId = null;
        }
        stopButton.disabled = true;
        stopButton.classList.add("hidden");
        currentFetchController = null;
        setBusy(false);
        messageInput.focus();
    }
});

async function logout() {
    const activeSessionId = sessionId;

    sessionId = null;
    localStorage.removeItem("hrmsSessionId");
    setBusy(false);
    stopButton.classList.add("hidden");
    stopButton.disabled = true;

    if (activeSessionId) {
        await fetch("/logout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": activeSessionId,
            },
            body: JSON.stringify({
                sessionId: activeSessionId,
            }),
        });
    }

    // Redirect the user immediately back to Microsoft SSO after logout.
    await msalInstance.loginRedirect(loginRequest);
}

function restoreSession() {
    if (!sessionId) {
        return;
    }

    fetch("/me", {
        headers: {
            "X-Session-Id": sessionId,
        },
    }).then(async (response) => {
        const data = await response.json().catch(() => null);

        if (!response.ok) {
            clearLocalSession(data?.error);
            return;
        }

        if (data?.user) {
            showChat(data.user);
        }
    });
}

async function initializeAuth() {
    try {
        const redirectResponse = await msalInstance.handleRedirectPromise();
        if (redirectResponse?.accessToken) {
            await handleAuthenticationSuccess(redirectResponse.accessToken);
            return;
        }
    } catch (error) {
        console.error("MSAL redirect handling error:", error);
    }

    restoreSession();

    if (!sessionId) {
        await handleMicrosoftLogin();
    }
}

// Event Listeners
microsoftLoginButton.addEventListener("click", handleMicrosoftLogin);
messageInput.addEventListener("input", handleMessageInput);
messageInput.addEventListener("keydown", (event) => {
    if (slashMenu.classList.contains("hidden")) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const text = inputGetText();
            if (text) {
                sendMessage(text);
            }
        }
        return;
    }

    const buttons = Array.from(slashMenu.querySelectorAll("button"));
    if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedSlashIndex = (selectedSlashIndex + 1) % buttons.length;
        buttons.forEach((button, index) =>
            button.classList.toggle("active", index === selectedSlashIndex),
        );
        buttons[selectedSlashIndex]?.scrollIntoView({ block: "nearest" });
        return;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedSlashIndex =
            (selectedSlashIndex - 1 + buttons.length) % buttons.length;
        buttons.forEach((button, index) =>
            button.classList.toggle("active", index === selectedSlashIndex),
        );
        buttons[selectedSlashIndex]?.scrollIntoView({ block: "nearest" });
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        if (selectedSlashIndex >= 0 && buttons.length) {
            buttons[selectedSlashIndex].click();
        } else {
            const text = inputGetText();
            if (text) {
                sendMessage(text);
            }
        }
        return;
    }
    if (event.key === "Escape") {
        closeSlashMenu();
        return;
    }
});
logoutButton.addEventListener("click", logout);

// Initialize
initializeAuth();
