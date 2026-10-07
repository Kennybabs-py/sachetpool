// No-op `server-only` shim for standalone scripts run via tsx. Next.js aliases
// the real guard inside its server bundle; outside Next the package is absent.
export {};
