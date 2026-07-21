import { Router } from "express";
import { z } from "zod";
import {
  listLearningItems,
  markLearningItemSaved,
  adjustLearningItemConfidence,
  listEncountersForItem,
  upsertLearningItemOnEncounter,
  recordEncounter,
} from "../db/repo.js";
import { asyncRoute } from "../lib/asyncRoute.js";

export const learningRouter = Router();

learningRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const savedOnly = req.query.saved === "true";
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const items = listLearningItems({ savedOnly, state });
    res.json({ items });
  })
);

learningRouter.get(
  "/:id/encounters",
  asyncRoute(async (req, res) => {
    res.json({ encounters: listEncountersForItem(req.params.id) });
  })
);

learningRouter.post(
  "/save",
  asyncRoute(async (req, res) => {
    const schema = z.object({
      lemma: z.string().min(1),
      kind: z.enum(["vocab", "grammar"]).default("vocab"),
      surface: z.string().optional(),
      reading: z.string().optional(),
      meaningNote: z.string().optional(),
      messageId: z.string().optional(),
    });
    const input = schema.parse(req.body);
    const item = upsertLearningItemOnEncounter(input);
    markLearningItemSaved(item.id, true);
    recordEncounter(item.id, input.messageId ?? null, "saved");
    res.json({ item });
  })
);

learningRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const schema = z.object({
      saved: z.boolean().optional(),
      confidenceDelta: z.number().min(-1).max(1).optional(),
    });
    const { saved, confidenceDelta } = schema.parse(req.body);
    if (saved !== undefined) markLearningItemSaved(req.params.id, saved);
    if (confidenceDelta !== undefined) adjustLearningItemConfidence(req.params.id, confidenceDelta);
    res.json({ ok: true });
  })
);
