/** Brief structured log line: `event key=value ...` (DESIGN.md §11). */
export function log(event: string, fields: Record<string, string | number | boolean> = {}) {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`);
  console.log([new Date().toISOString(), event, ...parts].join(" "));
}
