import { Router } from "express";
import {
  listCharacters,
  getCharacter,
  getRelationship,
  listThreads,
  upsertCharacter,
  deleteCharacter,
  resetCharacterHistory,
} from "../db/repo.js";
import { asyncRoute } from "../lib/asyncRoute.js";

export const charactersRouter = Router();

charactersRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const characters = listCharacters().map((c) => ({
      id: c.id,
      name: c.name,
      nameReading: c.name_reading,
      avatarEmoji: c.avatar_emoji,
      medium: c.medium,
      register: c.register,
      persona: JSON.parse(c.persona_json),
      lifeState: c.life_state,
    }));
    res.json({ characters });
  })
);

charactersRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const character = getCharacter(req.params.id);
    if (!character) {
      res.status(404).json({ error: { message: "Character not found" } });
      return;
    }
    const relationship = getRelationship(character.id);
    const threads = listThreads(character.id, true);
    res.json({
      character: {
        id: character.id,
        name: character.name,
        nameReading: character.name_reading,
        avatarEmoji: character.avatar_emoji,
        medium: character.medium,
        register: character.register,
        persona: JSON.parse(character.persona_json),
        lifeState: character.life_state,
        boundaries: character.boundaries_json ? JSON.parse(character.boundaries_json) : [],
        initiationCadenceMinutes: character.initiation_cadence_minutes,
      },
      relationship,
      threads,
    });
  })
);

charactersRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const character = getCharacter(req.params.id);
    if (!character) {
      res.status(404).json({ error: { message: "Character not found" } });
      return;
    }
    const body = req.body as Partial<{
      name: string;
      nameReading: string;
      avatarEmoji: string;
      medium: string;
      register: string;
      persona: Record<string, unknown>;
      lifeState: string;
      boundaries: string[];
      initiationCadenceMinutes: number;
    }>;
    upsertCharacter({
      id: character.id,
      name: body.name ?? character.name,
      name_reading: body.nameReading ?? character.name_reading,
      avatar_emoji: body.avatarEmoji ?? character.avatar_emoji,
      medium: body.medium ?? character.medium,
      register: body.register ?? character.register,
      persona_json: body.persona ? JSON.stringify(body.persona) : character.persona_json,
      life_state: body.lifeState ?? character.life_state,
      boundaries_json: body.boundaries ? JSON.stringify(body.boundaries) : character.boundaries_json,
      initiation_cadence_minutes: body.initiationCadenceMinutes ?? character.initiation_cadence_minutes,
    });
    res.json({ ok: true });
  })
);

charactersRouter.post(
  "/:id/reset",
  asyncRoute(async (req, res) => {
    resetCharacterHistory(req.params.id);
    res.json({ ok: true });
  })
);

charactersRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    deleteCharacter(req.params.id);
    res.json({ ok: true });
  })
);
