import { db } from "../../../../services";
import { createQaConversationStore } from "../../../../modules/ai/qa-conversation-store";
import { createQaCleanupHandler } from "../../../../modules/ai/qa-cleanup";
import { createQaAbuseGuard } from "../../../../modules/ai/qa-abuse";
import { isQaCleanupEnabled } from "../../../../modules/ai/qa-cleanup-gate";

export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = createQaCleanupHandler({
  enabled: () => isQaCleanupEnabled({
    enabled: process.env.QA_CLEANUP_ENABLED,
    databaseUrl: process.env.DATABASE_URL,
    allowedDatabaseHost: process.env.QA_CLEANUP_ALLOWED_DATABASE_HOST,
    allowedDatabaseName: process.env.QA_CLEANUP_ALLOWED_DATABASE_NAME,
  }),
  secret: () => process.env.CRON_SECRET,
  cleanup: async () => {
    const progress = await createQaConversationStore(db, { cleanupBatchSize: 25, cleanupMaxDurationMs: 20_000 }).cleanup();
    await createQaAbuseGuard(db).cleanup();
    return progress;
  },
});
