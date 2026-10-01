const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "irrigation_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) throw new Error("JWT_SECRET must be set in production.");
const secret = process.env.JWT_SECRET || "local-development-only-change-this-secret";

function encode(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function sign(payload) {
    const header = encode({ alg: "HS256", typ: "JWT" });
    const body = encode(payload);
    const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    return `${header}.${body}.${signature}`;
}
function verify(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
    let received;
    try { received = Buffer.from(parts[2], "base64url"); } catch { return null; }
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch { return null; }
}
function cookieValue(req, name) {
    const raw = req.headers.cookie || "";
    const item = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}
function cookieOptions() {
    const configuredSameSite = String(process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === "production" ? "none" : "lax")).toLowerCase();
    const sameSite = ["strict", "lax", "none"].includes(configuredSameSite) ? configuredSameSite : "lax";
    return { httpOnly: true, secure: process.env.NODE_ENV === "production" || sameSite === "none", sameSite, path: "/", maxAge: SESSION_SECONDS * 1000 };
}
function requireAuth(req, res, next) {
    const payload = verify(cookieValue(req, SESSION_COOKIE));
    if (!payload || !Number.isInteger(payload.farmer_id)) return res.status(401).json({ error: "Please sign in to continue." });
    req.user = { farmer_id: payload.farmer_id, name: payload.name, email: payload.email };
    next();
}
async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${derived.toString("hex")}`;
}
async function verifyPassword(password, stored) {
    const [scheme, salt, expectedHex] = String(stored || "").split("$");
    if (scheme !== "scrypt" || !salt || !expectedHex) return false;
    const actual = await scrypt(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function issueCookie(res, farmer) {
    const now = Math.floor(Date.now() / 1000);
    const token = sign({ farmer_id: farmer.farmer_id, name: farmer.name, email: farmer.email, iat: now, exp: now + SESSION_SECONDS });
    res.cookie(SESSION_COOKIE, token, cookieOptions());
}

function registerAuthRoutes(app, pool) {
    app.post("/api/auth/signup", async (req, res) => {
        const name = String(req.body?.name || "").trim();
        const email = String(req.body?.email || "").trim().toLowerCase();
        const phone = String(req.body?.phone || "").trim() || null;
        const password = String(req.body?.password || "");
        if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
            return res.status(400).json({ error: "Enter your name, a valid email, and a password with at least 8 characters." });
        }
        try {
            const passwordHash = await hashPassword(password);
            const result = await pool.query("INSERT INTO farmers (name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING farmer_id, name, email, phone", [name, email, phone, passwordHash]);
            issueCookie(res, result.rows[0]);
            return res.status(201).json({ farmer: result.rows[0] });
        } catch (error) {
            if (error.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
            console.error("Signup failed:", error.message);
            return res.status(500).json({ error: "Could not create your account. Check the database migration." });
        }
    });

    app.post("/api/auth/login", async (req, res) => {
        const identity = String(req.body?.identity || req.body?.email || req.body?.phone || "").trim();
        const email = identity.toLowerCase();
        const phoneDigits = identity.replace(/\D/g, "");
        const password = String(req.body?.password || "");
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if ((!isEmail && phoneDigits.length < 8) || !password) return res.status(400).json({ error: "Enter a valid email address or phone number and password." });
        try {
            const result = isEmail
                ? await pool.query("SELECT farmer_id, name, email, phone, password_hash FROM farmers WHERE lower(email) = $1 LIMIT 1", [email])
                : await pool.query("SELECT farmer_id, name, email, phone, password_hash FROM farmers WHERE regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = $1 LIMIT 1", [phoneDigits]);
            const farmer = result.rows[0];
            if (!farmer || !(await verifyPassword(password, farmer.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
            issueCookie(res, farmer);
            return res.json({ farmer: { farmer_id: farmer.farmer_id, name: farmer.name, email: farmer.email, phone: farmer.phone } });
        } catch (error) {
            console.error("Login failed:", error.message);
            return res.status(500).json({ error: "Could not sign in. Check the database migration." });
        }
    });

    app.get("/api/auth/me", requireAuth, async (req, res) => {
        try {
            const result = await pool.query("SELECT farmer_id, name, email, phone FROM farmers WHERE farmer_id = $1", [req.user.farmer_id]);
            if (!result.rows[0]) return res.status(401).json({ error: "Account no longer exists." });
            return res.json({ farmer: result.rows[0] });
        } catch (error) { return res.status(500).json({ error: "Could not load profile." }); }
    });

    app.post("/api/auth/logout", (_req, res) => res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined }).json({ success: true }));
}

async function requireFieldOwner(req, res, next, fieldId) {
    const id = Number(fieldId);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid field_id" });
    try {
        const result = await req.db.query("SELECT 1 FROM fields WHERE field_id = $1 AND farmer_id = $2", [id, req.user.farmer_id]);
        if (!result.rowCount) return res.status(404).json({ error: "Field not found." });
        req.fieldId = id;
        next();
    } catch (error) { console.error("Field ownership check failed:", error.message); res.status(500).json({ error: "Could not verify field access." }); }
}

module.exports = { requireAuth, requireFieldOwner, registerAuthRoutes, SESSION_COOKIE, SESSION_SECONDS };
