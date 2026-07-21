export interface CharacterSummary {
  id: string;
  name: string;
  nameReading: string | null;
  avatarEmoji: string | null;
  medium: "chat" | "email" | "both";
  register: string;
  persona: Record<string, unknown>;
  lifeState: string | null;
}

export interface CharacterDetail {
  id: string;
  name: string;
  nameReading: string | null;
  avatarEmoji: string | null;
  medium: string;
  register: string;
  persona: Record<string, unknown>;
  lifeState: string | null;
  boundaries: string[];
  initiationCadenceMinutes: number;
}

export interface StoryThread {
  id: string;
  character_id: string;
  title: string;
  description: string | null;
  status: "open" | "paused" | "resolved";
}

export interface ConversationSummary {
  conversationId: string;
  characterId: string;
  characterName: string;
  avatarEmoji: string | null;
  medium: "chat" | "email";
  mode: "comprehensible" | "natural";
  unread: number;
  lastMessage: {
    body: string;
    sender: "user" | "character";
    status: "pending" | "delivered";
    createdAt: string;
    subject: string | null;
  } | null;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: "user" | "character";
  medium: "chat" | "email";
  subject: string | null;
  body: string;
  status: "pending" | "delivered";
  mode: "comprehensible" | "natural";
  scheduledAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  character_id: string;
  medium: "chat" | "email";
  mode: "comprehensible" | "natural";
  created_at: string;
}

export interface DifficultyCheck {
  targetStretchItems: number;
  offendingVocab: { surface: string; lemma: string }[];
  offendingGrammar: { pattern: string }[];
  withinTarget: boolean;
}

export interface SendMessageResponse {
  userMessage: Message;
  characterMessage?: Message;
  generatingReply?: boolean;
  typingStartsAt?: string | null;
  regenerated?: boolean;
  difficulty?: DifficultyCheck;
  error?: { message: string };
}

export interface ConversationThreadResponse {
  conversation: Conversation;
  messages: Message[];
  draft: string;
  generatingReply?: boolean;
  typingStartsAt?: string | null;
  generationError?: string | null;
}

export interface GlossToken {
  surface: string;
  reading: string;
  lemma: string;
  meaning: string;
  note: string;
}

export interface GlossResult {
  overview: string;
  tokens: GlossToken[];
  grammar_points: { pattern: string; explanation: string }[];
  functional_note: string;
  english_gloss: string;
}

export interface ComparisonResult {
  inferred_intent: string;
  sounds_natural: boolean;
  minimal_revision: string;
  idiomatic_alternative: string;
  differences: string;
}

export interface LearningItem {
  id: string;
  lemma: string;
  surface: string | null;
  reading: string | null;
  kind: "vocab" | "grammar";
  meaning_note: string | null;
  state: "unseen" | "encountered" | "learning" | "known";
  confidence: number;
  encounters: number;
  saved: number;
  updated_at: string;
}

export interface LearnerProfile {
  displayName: string;
  selfReference: string;
  jlptBaseline: string;
  goals: string[];
  interests: string[];
  boundaries: string[];
  furiganaPref: "off" | "on_unknown" | "always";
  defaultMode: "comprehensible" | "natural";
  onboardedAt: string | null;
}

export interface UsageSummary {
  totalRequests: number;
  totalErrors: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  requestsToday: number;
  maxRequestsPerDay: number;
}
