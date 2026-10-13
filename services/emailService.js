"use strict";

async function sendVerificationEmail({ email, name, verificationUrl }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (!apiKey || !from) {
        throw new Error("Email service is not configured.");
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from,
            to: [email],
            subject: "Verify your EnergyFlow account",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                    <h2>Welcome to EnergyFlow, ${escapeHtml(name)}!</h2>
                    <p>Please verify your email address to activate your account.</p>
                    <p>
                        <a href="${escapeHtml(verificationUrl)}"
                           style="display:inline-block;padding:12px 20px;
                           background:#2563eb;color:white;text-decoration:none;
                           border-radius:6px;">
                           Verify My Email
                        </a>
                    </p>
                    <p>This link expires in 30 minutes.</p>
                    <p>If you didn't create this account, you can ignore this email.</p>
                </div>
            `
        })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        console.error("[EMAIL] Resend request failed:", response.status);
        throw new Error("Unable to send the verification email.");
    }

    return result;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

module.exports = { sendVerificationEmail };