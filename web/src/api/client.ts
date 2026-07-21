import type {
  CharacterDetail,
  CharacterSummary,
  ComparisonResult,
  Conversation,
  ConversationSummary,
  ConversationThreadResponse,
  GlossResult,
  LearnerProfile,
  LearningItem,
  Message,
  SendMessageResponse,
  StoryThread,
  UsageSummary,
} from "./types";

const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export class ApiError extends Error {}

let accessToken: string | null = null;

/** Called by AppContext when the Supabase session changes. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message);
  }
  return body as T;
}

export const api = {
  health: () => request<{ ok: boolean; apiKeyConfigured: boolean }>("/health"),

  listCharacters: () => request<{ characters: CharacterSummary[] }>("/characters"),
  getCharacter: (id: string) =>
    request<{ character: CharacterDetail; relationship: { familiarity: string; notes: string | null } | null; threads: StoryThread[] }>(
      `/characters/${id}`
    ),
  resetCharacter: (id: string) => request<{ ok: boolean }>(`/characters/${id}/reset`, { method: "POST" }),

  listConversations: () => request<{ conversations: ConversationSummary[] }>("/conversations"),
  getConversationByCharacter: (characterId: string, medium: "chat" | "email") =>
    request<ConversationThreadResponse>(
      `/conversations/by-character/${characterId}?medium=${medium}`
    ),
  markRead: (conversationId: string) =>
    request<{ ok: boolean }>(`/conversations/${conversationId}/read`, { method: "POST" }),
  setMode: (conversationId: string, mode: "comprehensible" | "natural") =>
    request<{ ok: boolean }>(`/conversations/${conversationId}/mode`, {
      method: "PATCH",
      body: JSON.stringify({ mode }),
    }),
  getDraft: (conversationId: string) => request<{ draft: string }>(`/conversations/${conversationId}/draft`),
  saveDraft: (conversationId: string, body: string) =>
    request<{ ok: boolean }>(`/conversations/${conversationId}/draft`, {
      method: "PUT",
      body: JSON.stringify({ body }),
    }),
  deliverNow: (conversationId: string) =>
    request<{ ok: boolean; delivered: boolean }>(`/conversations/${conversationId}/deliver-now`, { method: "POST" }),
  sendMessage: (conversationId: string, text: string, subject?: string) =>
    request<SendMessageResponse>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, subject }),
    }),
  retryReply: (conversationId: string) =>
    request<SendMessageResponse>(`/conversations/${conversationId}/retry-reply`, { method: "POST" }),
  sendFeedback: (conversationId: string, messageId: string, rating: "too_easy" | "good" | "too_hard") =>
    request<{ ok: boolean }>(`/conversations/${conversationId}/messages/${messageId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    }),

  getGloss: (messageId: string) => request<{ gloss: GlossResult }>(`/messages/${messageId}/gloss`, { method: "POST" }),
  getComparison: (messageId: string) =>
    request<{ comparison: ComparisonResult }>(`/messages/${messageId}/compare`, { method: "POST" }),

  listLearningItems: (params?: { saved?: boolean; state?: string }) => {
    const qs = new URLSearchParams();
    if (params?.saved) qs.set("saved", "true");
    if (params?.state) qs.set("state", params.state);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{ items: LearningItem[] }>(`/learning-items${suffix}`);
  },
  updateLearningItem: (id: string, patch: { saved?: boolean; confidenceDelta?: number }) =>
    request<{ ok: boolean }>(`/learning-items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  saveLearningItem: (input: {
    lemma: string;
    kind?: "vocab" | "grammar";
    surface?: string;
    reading?: string;
    meaningNote?: string;
    messageId?: string;
  }) => request<{ item: LearningItem }>("/learning-items/save", { method: "POST", body: JSON.stringify(input) }),

  getProfile: () => request<{ profile: LearnerProfile | null }>("/profile"),
  saveProfile: (profile: Omit<LearnerProfile, "onboardedAt">) =>
    request<{ ok: boolean }>("/profile", { method: "POST", body: JSON.stringify(profile) }),
  setDefaultMode: (mode: "comprehensible" | "natural") =>
    request<{ ok: boolean }>("/settings/default-mode", { method: "PATCH", body: JSON.stringify({ mode }) }),
  getReplySpeed: () => request<{ replySpeed: "realistic" | "instant" }>("/settings/reply-speed"),
  setReplySpeed: (replySpeed: "realistic" | "instant") =>
    request<{ ok: boolean }>("/settings/reply-speed", { method: "PATCH", body: JSON.stringify({ replySpeed }) }),

  getUsage: () => request<UsageSummary>("/usage"),
  checkInit: () => request<{ generated: number; skipped: number; limited: boolean }>("/init", { method: "POST" }),
  resetAll: () => request<{ ok: boolean }>("/reset", { method: "POST" }),
  exportUrl: () => `${BASE}/export`,
};
