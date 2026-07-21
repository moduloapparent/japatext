import {
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  getConversation,
  requeueStuckRunningJobs,
  type GenerationJobRow,
} from "../db/repo.js";
import { generateCharacterReply, generateInitiatedMessage } from "./generateReply.js";
import {
  markGenerating,
  markGenerationDone,
  markGenerationFailed,
} from "./generationStatus.js";

let timer: NodeJS.Timeout | null = null;
let ticking = false;

async function processJob(job: GenerationJobRow): Promise<void> {
  const conversation = getConversation(job.conversation_id);
  if (!conversation) {
    failGenerationJob(job.id, "Conversation not found");
    return;
  }

  if (job.typing_starts_at) {
    markGenerating(job.conversation_id, job.typing_starts_at);
  } else {
    markGenerating(job.conversation_id);
  }

  try {
    if (job.kind === "initiation") {
      await generateInitiatedMessage(conversation);
    } else {
      await generateCharacterReply(conversation);
    }
    completeGenerationJob(job.id);
    markGenerationDone(job.conversation_id);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to generate a reply. Your message was saved; you can retry.";
    failGenerationJob(job.id, message);
    markGenerationFailed(job.conversation_id, message);
  }
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    requeueStuckRunningJobs();
    const job = claimNextGenerationJob();
    if (job) await processJob(job);
  } catch (err) {
    console.error("[jobs] worker tick failed", err);
  } finally {
    ticking = false;
  }
}

/** Start the local durable-job poller. Safe to call once at boot. */
export function startJobWorker(intervalMs = 750): void {
  if (timer) return;
  requeueStuckRunningJobs(0); // recover anything left mid-flight from a prior process
  void tick();
  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  // Don't keep the process alive solely for the worker in tests if needed.
  timer.unref?.();
}

export function stopJobWorker(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
