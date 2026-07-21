import { Router } from "express";
import { z } from "zod";
import {
  getProfile,
  upsertProfile,
  setDefaultMode,
  getUsageSummary,
  requestsToday,
  exportAll,
  resetAll,
  setSetting,
} from "../db/repo.js";
import { runMigrations } from "../db/index.js";
import { seed } from "../db/seed.js";
import { checkInitiations, getReplySpeed } from "../engine/delivery.js";
import { MAX_REQUESTS_PER_DAY, OPENAI_API_KEY, isAuthEnabled } from "../config.js";
import { asyncRoute } from "../lib/asyncRoute.js";

export const systemRouter = Router();

systemRouter.get(
  "/health",
  asyncRoute(async (_req, res) => {
    res.json({
      ok: true,
      apiKeyConfigured: Boolean(OPENAI_API_KEY),
      authEnabled: isAuthEnabled(),
    });
  })
);

systemRouter.get(
  "/profile",
  asyncRoute(async (_req, res) => {
    const profile = getProfile();
    res.json({
      profile: profile
        ? {
            displayName: profile.display_name,
            selfReference: profile.self_reference,
            jlptBaseline: profile.jlpt_baseline,
            goals: JSON.parse(profile.goals_json ?? "[]"),
            interests: JSON.parse(profile.interests_json ?? "[]"),
            boundaries: JSON.parse(profile.boundaries_json ?? "[]"),
            furiganaPref: profile.furigana_pref,
            defaultMode: profile.default_mode,
            onboardedAt: profile.onboarded_at,
          }
        : null,
    });
  })
);

systemRouter.post(
  "/profile",
  asyncRoute(async (req, res) => {
    const schema = z.object({
      displayName: z.string().min(1),
      selfReference: z.string().default(""),
      jlptBaseline: z.string().default("N3"),
      goals: z.array(z.string()).default([]),
      interests: z.array(z.string()).default([]),
      boundaries: z.array(z.string()).default([]),
      furiganaPref: z.enum(["off", "on_unknown", "always"]).default("off"),
      defaultMode: z.enum(["comprehensible", "natural"]).default("comprehensible"),
    });
    const input = schema.parse(req.body);
    upsertProfile(input);
    res.json({ ok: true });
  })
);

systemRouter.patch(
  "/settings/default-mode",
  asyncRoute(async (req, res) => {
    const schema = z.object({ mode: z.enum(["comprehensible", "natural"]) });
    const { mode } = schema.parse(req.body);
    setDefaultMode(mode);
    res.json({ ok: true });
  })
);

systemRouter.get(
  "/settings/reply-speed",
  asyncRoute(async (_req, res) => {
    res.json({ replySpeed: getReplySpeed() });
  })
);

systemRouter.patch(
  "/settings/reply-speed",
  asyncRoute(async (req, res) => {
    const schema = z.object({ replySpeed: z.enum(["realistic", "instant"]) });
    const { replySpeed } = schema.parse(req.body);
    setSetting("reply_speed", replySpeed);
    res.json({ ok: true });
  })
);

systemRouter.get(
  "/usage",
  asyncRoute(async (_req, res) => {
    const summary = getUsageSummary();
    res.json({ ...summary, maxRequestsPerDay: MAX_REQUESTS_PER_DAY });
  })
);

systemRouter.post(
  "/init",
  asyncRoute(async (_req, res) => {
    if (requestsToday() >= MAX_REQUESTS_PER_DAY) {
      res.json({ generated: 0, skipped: 0, limited: true });
      return;
    }
    const result = await checkInitiations();
    res.json({ ...result, limited: false });
  })
);

systemRouter.get(
  "/export",
  asyncRoute(async (_req, res) => {
    res.setHeader("Content-Disposition", "attachment; filename=japatext-export.json");
    res.json(exportAll());
  })
);

systemRouter.post(
  "/reset",
  asyncRoute(async (_req, res) => {
    resetAll();
    runMigrations();
    seed();
    res.json({ ok: true });
  })
);
