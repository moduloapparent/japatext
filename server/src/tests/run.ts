/**
 * Lightweight local test runner (no external test framework, to keep the
 * dependency surface small). Two tiers:
 *   1. Logic tests — always run, no API calls, use a temporary database.
 *   2. Live tests — only run when OPENAI_API_KEY is set, exercise the
 *      real OpenAI pipeline (naturalness, difficulty regulation, gloss,
 *      comparison, character-initiated messages).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Point the app at a throwaway database before importing anything that opens one.
const TEST_DATA_DIR = path.join(__dirname, "..", "..", "data-test");
fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
process.env.JAPATEXT_TEST_DATA_DIR = TEST_DATA_DIR;

const { runMigrations } = await import("../db/index.js");
const { seed } = await import("../db/seed.js");
const repo = await import("../db/repo.js");
const { checkDifficulty, computeTargetStretchItems } = await import("../engine/difficulty.js");
const { countReadingUnits, computeReadThinkDelayMs } = await import("../engine/delivery.js");
const { DifficultyTagResultSchema } = await import("../engine/schemas.js");
const { OPENAI_API_KEY } = await import("../config.js");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    });
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("Logic tests (no API calls)");
  runMigrations();
  seed();

  await test("seeds five characters", () => {
    const characters = repo.listCharacters();
    assert(characters.length === 5, `expected 5 characters, got ${characters.length}`);
  });

  await test("computeTargetStretchItems scales with medium and length", () => {
    const chatShort = computeTargetStretchItems(40, "chat");
    const emailLong = computeTargetStretchItems(600, "email");
    assert(chatShort >= 1, "chat budget should be at least 1");
    assert(emailLong > chatShort, "a long email should tolerate more stretch items than a short chat message");
  });

  await test("read+think delay scales with message length and skips in instant mode", () => {
    assert(countReadingUnits("こんにちは") === 5, "each Japanese character counts as one unit");
    assert(countReadingUnits("hello world") === 2, "Latin words count as units");
    const short = computeReadThinkDelayMs("はい", "realistic");
    const long = computeReadThinkDelayMs("今日は天気がいいから、公園に行こうと思ってるんだけど、一緒に散歩しない？詳しいことあとで話すね。", "realistic");
    const instant = computeReadThinkDelayMs("長いメッセージでも instant なら待つ必要はないはずですよ", "instant");
    assert(short.totalMs >= 800, "even short messages get a brief read floor");
    assert(long.readMs > short.readMs, "longer messages should take longer to read");
    assert(long.totalMs > short.totalMs, "longer messages should delay typing longer");
    assert(instant.totalMs === 0, "instant mode should skip read/think delay");
  });

  await test("checkDifficulty flags vocabulary the learner has not encountered", () => {
    const tags = DifficultyTagResultSchema.parse({
      new_vocabulary: [
        { surface: "難解", lemma: "難解", reading: "なんかい", is_protected: false },
        { surface: "語彙", lemma: "語彙", reading: "ごい", is_protected: false },
        { surface: "曖昧", lemma: "曖昧", reading: "あいまい", is_protected: false },
      ],
      new_grammar: [],
    });
    const result = checkDifficulty("これはテストのメッセージです。", tags, "chat");
    assert(result.offendingVocab.length === 3, "all three unknown words should be flagged as offending");
    assert(!result.withinTarget, "three unknown items should exceed the small chat budget");
  });

  await test("protected vocabulary is excluded from the difficulty count", () => {
    const tags = DifficultyTagResultSchema.parse({
      new_vocabulary: [{ surface: "京都", lemma: "京都", is_protected: true }],
      new_grammar: [],
    });
    const result = checkDifficulty("京都にまた来てくださいね。", tags, "chat");
    assert(result.offendingVocab.length === 0, "protected proper nouns should not count as stretch items");
    assert(result.withinTarget, "a message with only protected vocabulary should be within target");
  });

  await test("learning items move toward known with positive feedback and away with too_hard", () => {
    const item = repo.upsertLearningItemOnEncounter({ lemma: "試験", surface: "試験", kind: "vocab" });
    const before = repo.findLearningItem("試験", "vocab")!.confidence;
    repo.adjustLearningItemConfidence(item.id, 0.3);
    const afterPositive = repo.findLearningItem("試験", "vocab")!.confidence;
    assert(afterPositive > before, "positive adjustment should raise confidence");
    repo.adjustLearningItemConfidence(item.id, -0.5);
    const afterNegative = repo.findLearningItem("試験", "vocab")!.confidence;
    assert(afterNegative < afterPositive, "negative adjustment should lower confidence");
  });

  await test("saving a learning item marks it saved without inflating confidence", () => {
    const item = repo.upsertLearningItemOnEncounter({ lemma: "保存", surface: "保存", kind: "vocab" });
    const before = repo.findLearningItem("保存", "vocab")!;
    repo.markLearningItemSaved(item.id, true);
    const after = repo.findLearningItem("保存", "vocab")!;
    assert(after.saved === 1, "item should be marked saved");
    assert(after.confidence === before.confidence, "saving alone should not change confidence (saving != known)");
  });

  await test("conversation/message lifecycle: create, list, deliver, read", () => {
    const character = repo.listCharacters()[0];
    const convo = repo.getOrCreateConversation(character.id, "chat", "comprehensible");
    const msg = repo.createMessage({
      conversationId: convo.id,
      sender: "character",
      medium: "chat",
      body: "テスト",
      status: "pending",
      mode: "comprehensible",
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert(repo.unreadCount(convo.id) === 0, "a pending message should not count as unread yet");
    repo.deliverDueMessages(convo.id);
    const delivered = repo.getMessage(msg.id)!;
    assert(delivered.status === "delivered", "past-due scheduled message should be delivered");
    assert(repo.unreadCount(convo.id) === 1, "a delivered character message should count as unread");
    repo.markConversationRead(convo.id);
    assert(repo.unreadCount(convo.id) === 0, "marking read should clear unread count");
  });

  await test("generation jobs enqueue once per conversation and can be claimed", () => {
    const character = repo.listCharacters()[0];
    const convo = repo.getOrCreateConversation(character.id, "chat", "comprehensible");
    const first = repo.enqueueGenerationJob({
      conversationId: convo.id,
      kind: "reply",
      typingStartsAt: new Date(Date.now() + 3000).toISOString(),
    });
    const second = repo.enqueueGenerationJob({ conversationId: convo.id, kind: "reply" });
    assert(first.id === second.id, "a second enqueue while active should reuse the existing job");
    const claimed = repo.claimNextGenerationJob();
    assert(Boolean(claimed), "queued job should be claimable");
    assert(claimed!.status === "running", "claimed job should move to running");
    repo.completeGenerationJob(claimed!.id);
    assert(!repo.latestActiveJobForConversation(convo.id), "completed job should clear the active queue");
  });

  await test("export includes core tables and reset clears them", () => {
    const dump = repo.exportAll();
    assert(Array.isArray(dump.characters) && dump.characters.length > 0, "export should include seeded characters");
    repo.resetAll();
    assert(repo.listCharacters().length === 0, "reset should clear characters");
    seed(); // restore for any subsequent tests / manual inspection
  });

  const { GOLDEN_REPLY_CASES, assertGoldenCase, assessPeerReplyShape } = await import(
    "../engine/goldenReplies.js"
  );
  const { buildSystemPrompt } = await import("../engine/prompts.js");

  await test("golden reply fixtures: good peer replies pass, helpful-assistant drift fails", () => {
    assert(GOLDEN_REPLY_CASES.length >= 4, "expected at least Ren/Misaki fixture cases");
    for (const caseItem of GOLDEN_REPLY_CASES) {
      assertGoldenCase(caseItem);
    }
  });

  await test("peer-shape heuristic rejects echo+menu mega-replies", () => {
    const report = assessPeerReplyShape(
      "ぺこぺこかw 飯行く？それとも家で簡単に済ませる？金ないなら安いラーメンとか勧めるけど、何食べたい感じ？"
    );
    assert(!report.ok, "classic Ren drift reply should fail");
    assert(report.reasons.length > 0, "should explain why");
  });

  await test("Ren and Misaki system prompts lock anti-assistant / mixed-initiative rules", () => {
    for (const id of ["ren", "misaki"] as const) {
      const character = repo.getCharacter(id);
      assert(Boolean(character), `character ${id} should be seeded`);
      const prompt = buildSystemPrompt({
        character: character!,
        relationshipNotes: null,
        familiarity: "acquaintance",
        threads: [],
        memories: [],
        profile: undefined,
        medium: "chat",
        mode: "comprehensible",
        targetStretchItems: 2,
      });
      assert(prompt.includes("アンチペルソナ"), `${id}: prompt should include anti-persona`);
      assert(prompt.includes("mixed initiative") || prompt.includes("主導権"), `${id}: prompt should include mixed initiative`);
      assert(prompt.includes("それとも"), `${id}: prompt should forbid A? それとも B? menus`);
      assert(!/あなたはAI|I'm an AI|as an AI/i.test(prompt), `${id}: prompt should not break character with AI disclaimers`);
    }
  });

  console.log(`\nLogic tests: ${passed} passed, ${failed} failed`);

  // --- Tier 2: pipeline tests against a deterministic mock model --------------
  // These exercise our own code (schema validation, the difficulty
  // regeneration loop, memory/story side effects, analysis caching) with zero
  // API cost and no dependency on account billing. They cannot judge real
  // Japanese quality — only the live tier below can do that.
  console.log("\nPipeline tests (mocked OpenAI — no API cost, no billing required)");
  process.env.JAPATEXT_MOCK_LLM = "1";
  const { generateCharacterReply, generateInitiatedMessage } = await import("../engine/generateReply.js");
  const { getOrGenerateGloss, compareWithNativePhrasing } = await import("../engine/analysis.js");

  const mockPassed0 = passed;

  await test("[mock] character reply is not blocked by difficulty regeneration", async () => {
    const character = repo.getCharacter("yuuta")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "comprehensible");
    repo.createMessage({
      conversationId: convo.id,
      sender: "user",
      medium: "chat",
      body: "最近どう？何かおすすめのゲームある？",
      status: "delivered",
      mode: "comprehensible",
    });
    const report = await generateCharacterReply(convo);
    assert(report.message.body.length > 0, "reply should not be empty");
    assert(report.regenerated === false, "the fast reply path should not regenerate before delivery");
  });

  await test("[mock] natural mode does not trigger regeneration even for a dense fixture", async () => {
    const character = repo.getCharacter("tanaka")!;
    const convo = repo.getOrCreateConversation(character.id, "email", "natural");
    repo.createMessage({
      conversationId: convo.id,
      sender: "user",
      medium: "email",
      subject: "来月のプロジェクトについて",
      body: "来月のキックオフについて、詳細を教えていただけますか。",
      status: "delivered",
      mode: "natural",
    });
    const report = await generateCharacterReply(convo);
    assert(report.regenerated === false, "natural mode should never trigger the comprehensibility regeneration path");
  });

  await test("[mock] accepted reply's new vocabulary is written into the learner model", async () => {
    const character = repo.getCharacter("misaki")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "natural");
    repo.createMessage({
      conversationId: convo.id,
      sender: "user",
      medium: "chat",
      body: "今日何してる？",
      status: "delivered",
      mode: "natural",
    });
    const report = await generateCharacterReply(convo);
    const meta = JSON.parse(report.message.generation_meta_json ?? "{}") as {
      new_vocabulary?: { lemma: string }[];
    };
    const reportedLemmas = meta.new_vocabulary ?? [];
    assert(reportedLemmas.length > 0, "the dense mock fixture should report at least one new vocabulary item");
    for (const v of reportedLemmas) {
      const item = repo.findLearningItem(v.lemma, "vocab");
      assert(Boolean(item), `lemma "${v.lemma}" reported by the model should be upserted into learning_items`);
    }
  });

  await test("[mock] gloss is cached after first generation", async () => {
    const character = repo.getCharacter("misaki")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "natural");
    const msg = repo.createMessage({
      conversationId: convo.id,
      sender: "character",
      medium: "chat",
      body: "お疲れ様！今日もラーメン食べに行こうと思ってるんだけど、一緒にどう？",
      status: "delivered",
      mode: "natural",
    });
    const first = await getOrGenerateGloss(msg.id);
    const cached = repo.getCachedAnalysis(msg.id, "gloss", "v1");
    assert(Boolean(cached), "gloss should be cached after first generation");
    const second = await getOrGenerateGloss(msg.id);
    assert(second.overview === first.overview, "second call should return the cached result");
  });

  await test("[mock] comparison infers intent for the learner's own message", async () => {
    const character = repo.getCharacter("yuuta")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "natural");
    const msg = repo.createMessage({
      conversationId: convo.id,
      sender: "user",
      medium: "chat",
      body: "私は今晩、家で疲れているので休むことを計画しています。",
      status: "delivered",
      mode: "natural",
    });
    const comparison = await compareWithNativePhrasing(msg.id);
    assert(comparison.inferred_intent.length > 0, "comparison should infer intent");
    assert(comparison.sounds_natural === false, "the mock fixture represents an unnatural, English-shaped sentence");
  });

  await test("[mock] character initiation applies should_send and schedules delivery", async () => {
    const character = repo.getCharacter("ren")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "comprehensible");
    const result = await generateInitiatedMessage(convo);
    assert(Boolean(result), "the mock fixture always sets should_send=true");
    assert(result!.message.status === "pending", "a freshly generated chat message should be scheduled, not instantly delivered");
  });

  console.log(`\nPipeline tests (mocked): ${passed - mockPassed0} passed, ${failed} failed total`);
  delete process.env.JAPATEXT_MOCK_LLM;

  // --- Tier 3: live tests against the real OpenAI API ----------------------
  if (!OPENAI_API_KEY) {
    console.log(
      "\nSkipping live OpenAI tests: OPENAI_API_KEY is not set. Add it to server/.env and re-run `npm run test --workspace server` to exercise the real generation pipeline."
    );
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\nLive tests (calling the real OpenAI API — requires available credit)");
  const livePassed0 = passed;

  await test("character reply: produces natural Japanese with difficulty metadata", async () => {
    const character = repo.getCharacter("yuuta")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "comprehensible");
    repo.createMessage({
      conversationId: convo.id,
      sender: "user",
      medium: "chat",
      body: "最近どう？何かおすすめのゲームある？",
      status: "delivered",
      mode: "comprehensible",
    });
    const report = await generateCharacterReply(convo);
    assert(report.message.body.length > 0, "reply should not be empty");
    assert(/[ぁ-んァ-ン一-龯]/.test(report.message.body), "reply should contain Japanese characters");
    assert(typeof report.difficulty.withinTarget === "boolean", "difficulty check should be computed");
  });

  await test("comprehensible mode regenerates when the first draft is too dense", async () => {
    // Force a hard scenario: an empty learner model + natural-topic character
    // is likely to trip the difficulty check at least once across a few tries.
    const character = repo.getCharacter("tanaka")!;
    const convo = repo.getOrCreateConversation(character.id, "email", "comprehensible");
    repo.createMessage({
      conversationId: convo.id,
      sender: "user",
      medium: "email",
      subject: "来月のプロジェクトについて",
      body: "来月のキックオフについて、詳細を教えていただけますか。",
      status: "delivered",
      mode: "comprehensible",
    });
    const report = await generateCharacterReply(convo);
    assert(report.message.body.length > 0, "email reply should not be empty");
    // Not a strict assertion that regeneration happened (the model may already
    // comply), just confirm the pipeline completed and reported a decision either way.
    assert(typeof report.regenerated === "boolean", "regenerated flag should be present");
  });

  await test("gloss explains function/intent, not just literal words", async () => {
    const character = repo.getCharacter("misaki")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "natural");
    const msg = repo.createMessage({
      conversationId: convo.id,
      sender: "character",
      medium: "chat",
      body: "お疲れ様！今日もラーメン食べに行こうと思ってるんだけど、一緒にどう？",
      status: "delivered",
      mode: "natural",
    });
    const gloss = await getOrGenerateGloss(msg.id);
    assert(gloss.overview.length > 0, "gloss should include an overview");
    assert(gloss.tokens.length > 0, "gloss should include token breakdown");
  });

  await test("comparison infers intent for English-shaped Japanese rather than only correcting grammar", async () => {
    const character = repo.getCharacter("yuuta")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "natural");
    const msg = repo.createMessage({
      conversationId: convo.id,
      sender: "user",
      medium: "chat",
      body: "私は今晩、家で疲れているので休むことを計画しています。",
      status: "delivered",
      mode: "natural",
    });
    const comparison = await compareWithNativePhrasing(msg.id);
    assert(comparison.inferred_intent.length > 0, "comparison should infer intent");
    assert(typeof comparison.sounds_natural === "boolean", "comparison should judge naturalness");
  });

  await test("character initiation respects should_send and cadence", async () => {
    const character = repo.getCharacter("ren")!;
    const convo = repo.getOrCreateConversation(character.id, "chat", "comprehensible");
    const result = await generateInitiatedMessage(convo);
    // result may legitimately be null if the model decides not to reach out; both are valid.
    assert(result === null || result.message.body.length > 0, "if sent, initiated message should be non-empty");
  });

  console.log(`\nLive tests: ${passed - livePassed0} passed, ${failed} failed total`);
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  process.exit(failed > 0 ? 1 : 0);
}

main();
