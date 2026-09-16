/**
 * Who may administer the app.
 *
 * Kept in an env var rather than a database flag: there are one or two admins,
 * it changes almost never, and a column would be one more thing to keep in sync
 * across environments. Set ADMIN_EMAILS to a comma-separated list to change it.
 */
const DEFAULT_ADMINS = ["sctcarmelo@gmail.com"];

function adminEmails(): string[] {
  const raw = (process.env.ADMIN_EMAILS ?? "").trim();
  const list = raw
    ? raw.split(",").map(e => e.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ADMINS;
  return list.map(e => e.toLowerCase());
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
