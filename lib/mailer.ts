import "server-only";
import nodemailer from "nodemailer";
import type { Store } from "@/lib/types";

export type StoreSmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string | null;
};

/**
 * Resolves a store's own SMTP override, if it has one fully configured --
 * host, port, user, and pass must ALL be set, otherwise this returns
 * undefined and the caller falls back to the platform's shared mailbox. A
 * store part-way through setting this up (e.g. host saved but not the
 * password yet) is treated exactly like a store with no override at all,
 * rather than attempting a connection with missing credentials.
 */
export function resolveStoreSmtp(
  store: Pick<Store, "smtp_host" | "smtp_port" | "smtp_user" | "smtp_pass" | "smtp_from">
): StoreSmtpConfig | undefined {
  if (!store.smtp_host || !store.smtp_port || !store.smtp_user || !store.smtp_pass) return undefined;
  return {
    host: store.smtp_host,
    port: store.smtp_port,
    user: store.smtp_user,
    pass: store.smtp_pass,
    from: store.smtp_from,
  };
}

// Keyed by "host:user" so the shared platform mailbox and any number of
// per-store overrides each get their own cached connection rather than
// fighting over one shared transporter.
const transporters = new Map<string, nodemailer.Transporter>();

function getTransporter(override?: StoreSmtpConfig) {
  const host = override?.host ?? process.env.SMTP_HOST;
  const portRaw = override?.port ?? Number(process.env.SMTP_PORT);
  const user = override?.user ?? process.env.SMTP_USER;
  const pass = override?.pass ?? process.env.SMTP_PASS;
  if (!host || !portRaw || !user || !pass) {
    throw new Error("SMTP is not configured (neither a store override nor the shared env vars are set)");
  }

  const key = `${host}:${user}`;
  const cached = transporters.get(key);
  if (cached) return cached;

  const port = Number(portRaw);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  transporters.set(key, transporter);
  return transporter;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  /** A store's own resolved SMTP override (see resolveStoreSmtp) -- omit to
   * use the platform's shared mailbox, same as before this existed. */
  smtp?: StoreSmtpConfig;
}) {
  // fromName brands the visible sender per-store (e.g. "Kariv Glamour" instead
  // of the generic platform name). The underlying mailbox address is the
  // store's own (opts.smtp.from, falling back to opts.smtp.user) when a
  // per-store override is set, otherwise the shared SMTP_USER -- either way,
  // it's always the address actually authenticated, never a spoofed one.
  const fromAddress = opts.smtp?.from || opts.smtp?.user || process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = opts.fromName ? `"${opts.fromName.replace(/"/g, "")}" <${fromAddress}>` : fromAddress;

  await getTransporter(opts.smtp).sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
