import { Router } from "express";
import { getOrGenerateGloss, compareWithNativePhrasing } from "../engine/analysis.js";
import { asyncRoute } from "../lib/asyncRoute.js";

export const analysisRouter = Router();

analysisRouter.post(
  "/:messageId/gloss",
  asyncRoute(async (req, res) => {
    const gloss = await getOrGenerateGloss(req.params.messageId);
    res.json({ gloss });
  })
);

analysisRouter.post(
  "/:messageId/compare",
  asyncRoute(async (req, res) => {
    const comparison = await compareWithNativePhrasing(req.params.messageId);
    res.json({ comparison });
  })
);
