import "server-only";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";

export type PostHogLogAttributes = Record<string, string | number | boolean>;

let loggerProvider: LoggerProvider | null | undefined;

function getLoggerProvider(): LoggerProvider | null {
  if (loggerProvider !== undefined) return loggerProvider;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
      );
    }
    loggerProvider = null;
    return loggerProvider;
  }

  if (!host) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
      );
    }
    loggerProvider = null;
    return loggerProvider;
  }

  const exporter = new OTLPLogExporter({
    url: `${host.replace(/\/$/, "")}/i/v1/logs`,
    headers: { Authorization: `Bearer ${token}` },
  });

  loggerProvider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor({ exporter })],
  });
  return loggerProvider;
}

/** Exports only purpose-written operational logs added by this integration. */
export async function logPostHog(
  body: string,
  attributes: PostHogLogAttributes,
): Promise<void> {
  const provider = getLoggerProvider();
  if (!provider) return;

  provider.getLogger("sachet-market.posthog").emit({
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
    body,
    attributes,
  });

  // Route handlers can be short-lived, so wait for this dedicated log export.
  await provider.forceFlush();
}
