import "server-only";
import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP env vars are not configured");
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendMail(opts: { to: string; subject: string; html: string; fromName?: string }) {
  // fromName brands the visible sender per-store (e.g. "Kariv Glamour" instead
  // of the generic platform name) — the underlying mailbox address is always
  // the same shared one (SMTP_USER), since that's what's actually
  // authenticated; only the display name changes.
  const from = opts.fromName
    ? `"${opts.fromName.replace(/"/g, "")}" <${process.env.SMTP_USER}>`
    : process.env.SMTP_FROM || process.env.SMTP_USER;

  await getTransporter().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
