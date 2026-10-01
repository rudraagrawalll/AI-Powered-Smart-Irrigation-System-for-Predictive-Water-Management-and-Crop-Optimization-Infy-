const EXPRESS_API = process.env.EXPRESS_API_PROXY_TARGET || "http://127.0.0.1:3000";

function failure(message: string, status: number): Response {
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in failed</title><body style="font:16px Arial,sans-serif;max-width:32rem;margin:4rem auto;padding:1rem;color:#23352a"><h1>Sign-in failed</h1><p>${message}</p><a href="/login">Return to sign in</a></body></html>`;
  return new Response(page, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const registering = form.get("mode") === "register";
    const identity = String(form.get("identity") || "").trim();
    const password = String(form.get("password") || "");
    const payload = registering
      ? { name: String(form.get("name") || "").trim(), email: identity.toLowerCase(), phone: String(form.get("phone") || "").trim(), password }
      : { identity, password };

    const upstream = await fetch(`${EXPRESS_API}/api/auth/${registering ? "signup" : "login"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) {
      const message = upstream.status === 401
        ? "Email or password is incorrect."
        : upstream.status === 409
          ? "An account with this email already exists."
          : upstream.status >= 500
            ? "The sign-in service is unavailable. Please try again."
            : "Check the entered details and try again.";
      return failure(message, upstream.status);
    }

    const cookie = upstream.headers.get("set-cookie");
    if (!cookie) return failure("The server did not create a sign-in session. Please try again.", 502);
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": cookie,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return failure("Could not reach the sign-in service. Check the connection and try again.", 502);
  }
}
