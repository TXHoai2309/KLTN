import { db } from "../../../../services";
import { createQaConversationStore } from "../../../../modules/ai/qa-conversation-store";
import { createQaCleanupHandler } from "../../../../modules/ai/qa-cleanup";
import { createQaAbuseGuard } from "../../../../modules/ai/qa-abuse";
import { isQaCleanupEnabled } from "../../../../modules/ai/qa-cleanup-gate";
import { qaSettings } from "../../../../modules/runtime-config/runtime-config-service";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const settings = await qaSettings().catch(() => null);
  return createQaCleanupHandler({
    enabled: () => settings !== null && isQaCleanupEnabled({
      enabled: String(settings.cleanupEnabled),
      databaseUrl: process.env.DATABASE_URL,
      allowedDatabaseHost: settings.cleanupDatabaseHost,
      allowedDatabaseName: settings.cleanupDatabaseName,
    }),
    secret: () => process.env.CRON_SECRET,
    cleanup: async () => {
      const progress = await createQaConversationStore(db, { cleanupBatchSize: 25, cleanupMaxDurationMs: 20_000 }).cleanup();
      await createQaAbuseGuard(db).cleanup();
      return progress;
    },
  })(request);
}
