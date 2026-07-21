/**
 * In-process tracker for reply generations that are still running after the
 * HTTP response has already returned the learner's message. Local single-
 * user only — replaced by a durable job table when we move to multi-tenant.
 */

const generating = new Set<string>();
const lastError = new Map<string, string>();
/** When the typing indicator should first appear (ISO), keyed by conversation. */
const typingStartsAt = new Map<string, string>();

export function markGenerating(conversationId: string, typingAtIso?: string | null): void {
  generating.add(conversationId);
  lastError.delete(conversationId);
  if (typingAtIso) typingStartsAt.set(conversationId, typingAtIso);
  else typingStartsAt.delete(conversationId);
}

export function markGenerationDone(conversationId: string): void {
  generating.delete(conversationId);
  // Keep the timestamp while the generated message is still scheduled. This
  // preserves the read/think gate if the user refreshes before delivery. The
  // next send overwrites it.
}

export function markGenerationFailed(conversationId: string, message: string): void {
  generating.delete(conversationId);
  typingStartsAt.delete(conversationId);
  lastError.set(conversationId, message);
}

export function isGenerating(conversationId: string): boolean {
  return generating.has(conversationId);
}

export function getTypingStartsAt(conversationId: string): string | null {
  return typingStartsAt.get(conversationId) ?? null;
}

export function consumeGenerationError(conversationId: string): string | null {
  const err = lastError.get(conversationId) ?? null;
  if (err) lastError.delete(conversationId);
  return err;
}

export function peekGenerationError(conversationId: string): string | null {
  return lastError.get(conversationId) ?? null;
}
