export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function uid(prefix = "id"): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}
