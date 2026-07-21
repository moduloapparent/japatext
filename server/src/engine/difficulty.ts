import type { DifficultyTagResult } from "./schemas.js";
import { getKnownConfidenceMap } from "../db/repo.js";

const KNOWN_THRESHOLD = 0.4; // learning_items at/above this confidence count as "known enough" for coverage purposes

export interface DifficultyCheck {
  targetStretchItems: number;
  offendingVocab: { surface: string; lemma: string }[];
  offendingGrammar: { pattern: string }[];
  withinTarget: boolean;
}

/** Adaptive stretch-item budget: short chat turns get a smaller absolute budget than longer emails. */
export function computeTargetStretchItems(messageLengthChars: number, medium: "chat" | "email"): number {
  const base = medium === "email" ? 4 : 2;
  const lengthBonus = Math.floor(messageLengthChars / 120);
  return Math.max(1, base + lengthBonus);
}

export function checkDifficulty(
  messageText: string,
  tags: DifficultyTagResult,
  medium: "chat" | "email"
): DifficultyCheck {
  const known = getKnownConfidenceMap();
  const target = computeTargetStretchItems(messageText.length, medium);

  const offendingVocab = tags.new_vocabulary.filter((v) => {
    if (v.is_protected) return false;
    const confidence = known.get(v.lemma) ?? 0;
    return confidence < KNOWN_THRESHOLD;
  });
  const offendingGrammar = tags.new_grammar.map((g) => ({ pattern: g.pattern }));

  const stretchCount = offendingVocab.length + offendingGrammar.length;

  return {
    targetStretchItems: target,
    offendingVocab: offendingVocab.map((v) => ({ surface: v.surface, lemma: v.lemma })),
    offendingGrammar,
    withinTarget: stretchCount <= target,
  };
}
