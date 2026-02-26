import { NextRequest } from "next/server";
import { getGroqClient } from "@/lib/groq";
import { buildQuestionSystemPrompt, buildExplanationPrompt, COMPARISON_PROMPT, PRODUCT_CONTRAST_PROMPT } from "@/lib/prompts";
import { getServiceClient } from "@/lib/supabase";
import { extractIntent, getNextAction, detectEvalDomain, buildComparisonResult, detectUserExpertise, type EngineResult, type RecommendedPump, type ConversationState, type UserExpertise } from "@/lib/recommendation-engine";
import { parseMessageMetadata } from "@/lib/parse-message-metadata";
import { extractIntentWithLLM, type LLMExtractedIntent } from "@/lib/extract-intent-llm";
import { getLiveCarbonIntensity } from "@/lib/carbon-intensity";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequest {
  message: string;
  conversationId?: string;
  sessionId: string;
  history?: Array<{ role: string; content: string }>;
  lastEngineAction?: string;
  hadRecommendation?: boolean;
}

// ─── Retry helper ─────────────────────────────────────────────────────
// Wraps any async call with a single retry and an optional timeout.
// Handles transient Groq rate limits, network blips, and timeouts gracefully.
async function callWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  timeoutMs = 12000
): Promise<T> {
  const attempt = async (): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fn();
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (firstErr) {
    console.error(`[${label}] first attempt failed, retrying:`, firstErr);
    try {
      // Brief pause before retry — helps with rate-limit 429s
      await new Promise((r) => setTimeout(r, 800));
      return await attempt();
    } catch (secondErr) {
      console.error(`[${label}] second attempt also failed:`, secondErr);
      throw secondErr;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const {
      message,
      conversationId,
      sessionId,
      history: clientHistory,
      lastEngineAction: clientLastEngineAction,
      hadRecommendation: clientHadRecommendation,
    } = body;

    if (!message || !sessionId) {
      return new Response(
        JSON.stringify({ error: "message and sessionId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const groq = getGroqClient();

    // ─── Resolve user_id from auth token ─────────────────────────
    const supabase = getServiceClient();
    let userId: string | null = null;
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ") && supabase) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
    }

    // ─── Load conversation history ────────────────────────────────
    let currentConversationId = conversationId;
    const historyMessages: Array<{ role: string; content: string; metadata?: Record<string, unknown> }> = [];

    // Only persist conversations/messages for signed-in users
    if (supabase && userId) {
      try {
        if (currentConversationId) {
          const { data: history, error: histErr } = await supabase
            .from("messages")
            .select("role, content, metadata")
            .eq("conversation_id", currentConversationId)
            .order("created_at", { ascending: true })
            .limit(50);

          if (histErr) {
            console.error("[route] Supabase history load error:", histErr);
          } else if (history) {
            for (const msg of history) {
              historyMessages.push(msg);
            }
          }
        } else {
          const { data: conv, error: convErr } = await supabase
            .from("conversations")
            .insert({ session_id: sessionId, user_id: userId, title: "New Chat" })
            .select("id")
            .single();
          if (convErr) {
            console.error("[route] Supabase conversation create error:", convErr);
          } else if (conv) {
            currentConversationId = conv.id;
          }
        }

        if (currentConversationId) {
          const { error: insertErr } = await supabase.from("messages").insert({
            conversation_id: currentConversationId,
            role: "user",
            content: message,
          });
          if (insertErr) {
            console.error("[route] Supabase user message insert error:", insertErr);
          }
        }
      } catch (supabaseErr) {
        console.error("[route] Supabase operation failed, continuing without persistence:", supabaseErr);
      }
    }

    // ─── Build effective history ──────────────────────────────────
    // Use Supabase history if available, otherwise use client-provided history.
    // This covers both signed-in users (Supabase) and guests (Zustand clientHistory).
    const effectiveHistory = historyMessages.length > 0 ? historyMessages : (clientHistory || []);
    const allMessages = [
      ...effectiveHistory,
      { role: "user", content: message },
    ];

    // Conversation length — used for context-awareness in prompts and quality threshold
    const conversationTurns = Math.floor(allMessages.length / 2);

    // ─── Detect user expertise level (dynamic, inferred from all user messages) ─
    // 'technical' = user used m³/h, duty point, IEC, etc. → can see raw engineering numbers
    // 'layperson' = user describes situation in everyday terms → plain language only
    const userExpertise: UserExpertise = detectUserExpertise(allMessages);

    // Detect last engine action + whether any recommendation was ever shown.
    // For signed-in users: read from Supabase message metadata (full history scan).
    // For guests: read from client-provided values (sent from Zustand store).
    let lastEngineAction: "recommend" | "ask" | "greet" | "compare" | undefined;
    let hadRecommendation = false;
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const m = historyMessages[i];
      if (m.role === "assistant" && m.metadata?.engineAction) {
        if (!lastEngineAction) {
          lastEngineAction = m.metadata.engineAction as "recommend" | "ask" | "greet" | "compare";
        }
        if (m.metadata.engineAction === "recommend" || m.metadata.engineAction === "compare") {
          hadRecommendation = true;
          break;
        }
      }
    }
    // Guest fallback: use client-provided values if Supabase didn't have them
    if (!lastEngineAction && clientLastEngineAction) {
      lastEngineAction = clientLastEngineAction as "recommend" | "ask" | "greet" | "compare";
    }
    if (!hadRecommendation && clientHadRecommendation) {
      hadRecommendation = clientHadRecommendation;
    }

    // ─── Extract intent: regex first (synchronous, reliable for exact specs) ─
    // We compute regexState BEFORE the parallel calls so it can be injected into
    // the LLM extraction as "already confirmed context" — preventing context drift
    // in long conversations where early facts fall outside the LLM message window.
    const regexState: ConversationState = extractIntent(allMessages);

    // Apply domain detection to regexState before injection.
    // Latest message is checked FIRST — if the user says "actually for hotwater instead",
    // that overrides "dbs-heating" from earlier in the conversation. Only fall back to
    // the full conversation text when the latest message has no domain signal.
    const allText = allMessages.map((m) => m.content).join(" ");
    const latestDomain = detectEvalDomain(message);
    const allTextDomain = detectEvalDomain(allText);
    const detectedDomain = latestDomain || allTextDomain;
    if (detectedDomain) regexState.evalDomain = detectedDomain;

    // Run LLM intent extraction and live CO2 fetch in parallel.
    // The regexState is passed to extractIntentWithLLM so the LLM knows what's
    // already confirmed — it only needs to find new/corrected information.
    const [llmIntent, gridData] = await Promise.all([
      callWithRetry(
        () => extractIntentWithLLM(groq, allMessages, regexState),
        "extractIntentWithLLM"
      ).catch((err: unknown) => {
        console.error("[route] LLM intent extraction failed after retries:", err);
        return {} as LLMExtractedIntent;
      }),
      getLiveCarbonIntensity(),
    ]);

    // ─── Merge: regex wins where it found something (reliable for exact specs) ──
    // LLM fills gaps where regex found nothing (handles natural language)
    // Exception: qualitative fields (buildingSize, waterSource) — LLM also wins when latest
    // message explicitly contains correction keywords (catches paraphrases the regex misses).
    const latestHasBuildingSize = /\b(small|medium|large)\b/i.test(message);
    const latestHasWaterSource = /\b(mains|tap|city\s+water|well|borehole|tank|cistern|reservoir)\b/i.test(message);
    // Detect if the latest message contains explicit flow/head specs (encoding-robust)
    const latestHasFlow = /\b\d+(?:\.\d+)?\s*m.{0,2}[\/]h\b/i.test(message) || /\b\d+(?:\.\d+)?\s*(?:m3\/h|gpm|lpm|l\/s)\b/i.test(message);
    const latestHasHead = /\b\d+(?:\.\d+)?\s*m\b(?!\s*[³3\/Â])/i.test(message);
    const latestHasMotor = /\b\d+(?:\.\d+)?\s*(?:kW|hp)\b/i.test(message);

    const state: ConversationState = {
      ...regexState,
      ...(llmIntent.application && !regexState.application && { application: llmIntent.application }),
      ...(llmIntent.buildingSize && (!regexState.buildingSize || latestHasBuildingSize) && { buildingSize: llmIntent.buildingSize }),
      ...(llmIntent.floors != null && !regexState.floors && { floors: llmIntent.floors }),
      ...(llmIntent.bathrooms != null && !regexState.bathrooms && { bathrooms: llmIntent.bathrooms }),
      ...(llmIntent.waterSource && (!regexState.waterSource || latestHasWaterSource) && { waterSource: llmIntent.waterSource }),
      // Specs: LLM wins if regex missed it OR if the latest message has updated specs
      ...(llmIntent.flow_m3h != null && (!regexState.flow_m3h || latestHasFlow) && { flow_m3h: llmIntent.flow_m3h }),
      ...(llmIntent.head_m != null && (!regexState.head_m || latestHasHead) && { head_m: llmIntent.head_m }),
      ...(llmIntent.motor_kw != null && (!regexState.motor_kw || latestHasMotor) && { motor_kw: llmIntent.motor_kw }),
      // existingPumpBrand: only accept from LLM when regex also found none AND we don't
      // already have an exact duty point. If the user gave both flow+head, they're describing
      // what they WANT — e.g. "residential heating circulator, 2.5 m³/h 4m" — not asking for
      // competitor replacement. The LLM misreads "circulator" as an existing pump brand.
      ...(llmIntent.existingPumpBrand && !regexState.existingPumpBrand
          && !(regexState.flow_m3h != null && regexState.head_m != null)
          && { existingPumpBrand: llmIntent.existingPumpBrand }),
      ...(llmIntent.existingPump && !regexState.existingPump && { existingPump: llmIntent.existingPump }),
      ...(llmIntent.problem && !regexState.problem && { problem: llmIntent.problem }),
    };

    // If an explicit floor count was extracted, update buildingSize to match —
    // this corrects "large office building" (→ Large) being overridden by "3-4 floors" (→ Small)
    // when the user gives a precise floor count that contradicts their earlier size descriptor.
    if (state.floors != null && !latestHasBuildingSize) {
      const f = state.floors;
      state.buildingSize = f <= 3 ? "small" : f <= 8 ? "medium" : "large";
    }

    let engineResult: EngineResult = getNextAction(
      state,
      message,
      lastEngineAction,
      { co2Override: gridData.co2 },
      hadRecommendation,
      conversationTurns
    );

    // Handle 0 pump matches — fall back to asking for more info
    if (
      engineResult.action === "recommend" &&
      (!engineResult.pumps || engineResult.pumps.length === 0)
    ) {
      engineResult = {
        action: "ask",
        questionContext:
          "No exact pump matches found for their specs. Ask if they can adjust their requirements — different flow, head, or application — or suggest they consult a Grundfos engineer for a custom solution.",
        suggestions: ["Adjust my specs", "Different application", "Talk to an engineer"],
        state,
      };
    }

    // ─── Resolve comparison pumps ─────────────────────────────────
    // When the engine returns action:"compare", we need to identify the two pump models
    // and build their RecommendedPump data (specs + ROI). If the user named both pumps
    // explicitly those names come back in comparePumps. If they said "compare those two"
    // or similar, we look at the last recommendation in history.
    if (engineResult.action === "compare") {
      let pumpNames: [string, string] | null = engineResult.comparePumps ?? null;

      if (!pumpNames) {
        // Try to find the last turn where pumps were shown (Supabase history)
        const lastRecMsg = [...historyMessages]
          .reverse()
          .find(
            (m) =>
              m.role === "assistant" &&
              Array.isArray((m.metadata as Record<string, unknown>)?.pumps) &&
              ((m.metadata as Record<string, unknown>).pumps as unknown[]).length >= 2
          );
        if (lastRecMsg) {
          const hp = (lastRecMsg.metadata as Record<string, unknown>).pumps as Array<{ model: string }>;
          pumpNames = [hp[0].model, hp[1].model];
        } else {
          // Guest fallback: try clientHistory
          const lastClientRec = [...(clientHistory || [])]
            .reverse()
            .find((m) => m.role === "assistant" && (m as Record<string, unknown>).pumps);
          if (lastClientRec && Array.isArray((lastClientRec as Record<string, unknown>).pumps)) {
            const cp = (lastClientRec as Record<string, unknown>).pumps as Array<{ model: string }>;
            if (cp.length >= 2) pumpNames = [cp[0].model, cp[1].model];
          }
        }
      }

      if (pumpNames) {
        const compResult = buildComparisonResult(pumpNames[0], pumpNames[1], state, { co2Override: gridData.co2 });
        if (compResult) {
          engineResult = { ...engineResult, pumps: compResult };
        } else {
          // Pump model not found — fall back to ask
          engineResult = {
            action: "ask",
            questionContext: `The user wants to compare specific pumps but the models weren't recognised. Ask them to confirm which two Grundfos pumps they'd like to compare — or offer to show the top recommendation first.`,
            suggestions: ["Show me the top recommendation", "Compare MAGNA3 vs MAGNA1", "Compare ALPHA2 vs ALPHA1"],
            state,
          };
        }
      } else {
        // No pumps found in history either — ask
        engineResult = {
          action: "ask",
          questionContext: "The user wants to compare pumps but no models have been shown yet. Offer to find the best match first, then compare the top options.",
          suggestions: ["Find the best pump for me", "I have specific models in mind"],
          state,
        };
      }
    }

    // ─── Build LLM messages based on engine decision ──────────────
    const chatMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    // Build known-context string for both question and recommend paths
    const knownContext: string[] = [];
    if (state.application) knownContext.push(`application: ${state.application.replace(/_/g, " ")}`);
    if (state.buildingSize) knownContext.push(`building: ${state.buildingSize}`);
    if (state.existingPumpBrand) knownContext.push(`current pump: ${state.existingPumpBrand}${state.existingPump ? " " + state.existingPump : ""}`);
    if (state.flow_m3h) knownContext.push(`flow: ${state.flow_m3h} m³/h`);
    if (state.head_m) knownContext.push(`head: ${state.head_m} m`);
    if (state.waterSource) knownContext.push(`water source: ${state.waterSource}`);
    if (state.bathrooms) knownContext.push(`bathrooms: ${state.bathrooms}`);
    if (state.floors) knownContext.push(`floors: ${state.floors}`);
    if (state.problem) knownContext.push(`problem: ${state.problem.replace(/_/g, " ")}`);
    const knownContextStr = knownContext.length > 0 ? knownContext.join(", ") : "nothing yet";

    // Build a do-not-ask list from confirmed state fields — prevents redundant questions
    const doNotAskFields: string[] = [];
    if (state.application) doNotAskFields.push("application");
    if (state.floors != null) doNotAskFields.push("floors");
    if (state.bathrooms != null) doNotAskFields.push("bathrooms");
    if (state.waterSource) doNotAskFields.push("water source");
    if (state.buildingSize) doNotAskFields.push("building size");
    if (state.flow_m3h != null) doNotAskFields.push("flow rate");
    if (state.head_m != null) doNotAskFields.push("head pressure");
    if (state.problem) doNotAskFields.push("problem type");

    // AI-generated question + suggestions (ask / greet)
    let aiQuestion = "";
    let aiSuggestions: string[] = [];

    if (engineResult.action === "ask" || engineResult.action === "greet") {
      const questionContext = engineResult.questionContext ||
        (engineResult.action === "greet"
          ? "Greet the user and ask what pump problem they need help with."
          : "Ask the user for more information about their pump needs.");

      try {
        const qSystemPrompt = buildQuestionSystemPrompt(
          questionContext,
          knownContextStr,
          doNotAskFields,
          conversationTurns,
          userExpertise,
          engineResult.suggestions?.length ? engineResult.suggestions : undefined
        );

        const qResponse = await callWithRetry(
          () => groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
              { role: "system", content: qSystemPrompt },
              // Include last 6 messages for conversational continuity (up from 4)
              ...effectiveHistory.slice(-6).map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
              { role: "user", content: message },
            ],
            temperature: 0.7,
            max_tokens: 180,
            response_format: { type: "json_object" },
          }),
          "questionGeneration"
        );

        const qRaw = qResponse.choices[0]?.message?.content || "{}";
        let qParsed: { question?: string; suggestions?: unknown };
        try {
          qParsed = JSON.parse(qRaw) as { question?: string; suggestions?: unknown };
        } catch {
          const stripped = qRaw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
          qParsed = JSON.parse(stripped) as { question?: string; suggestions?: unknown };
        }

        if (typeof qParsed.question === "string" && qParsed.question.trim()) {
          aiQuestion = qParsed.question.trim();
        }
        if (Array.isArray(qParsed.suggestions)) {
          aiSuggestions = (qParsed.suggestions as unknown[])
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .slice(0, 4);
        }
      } catch (qErr) {
        console.error("[route] Question generation failed:", qErr);
        // Fallback handled below
      }

      // Fallback question if LLM failed
      if (!aiQuestion) aiQuestion = "Could you tell me a bit more about what you need?";
      // Engine suggestions always take priority — LLM-generated chips are only used
      // when the engine didn't specify any (prevents LLM from dropping brand names etc.)
      if (engineResult.suggestions?.length) {
        aiSuggestions = engineResult.suggestions;
      } else if (aiSuggestions.length === 0) {
        aiSuggestions = [];
      }
    } else {
      // Recommendation / comparison mode: choose prompt based on mode
      const isCompetitor = engineResult.isCompetitorReplacement;
      const isProductComparison = engineResult.action === "compare";
      const isPumpInfo = engineResult.isPumpInfoRequest === true;
      // Use expertise-aware explanation prompt for standard recommendations.
      // Comparisons and competitor-replacement prompts get the expertise addendum inline below.
      const basePrompt = isProductComparison
        ? PRODUCT_CONTRAST_PROMPT
        : isCompetitor
          ? COMPARISON_PROMPT
          : buildExplanationPrompt(userExpertise);

      const topPump = engineResult.pumps?.[0];
      const savings = topPump
        ? `₱${Math.round(topPump.roi.annual_savings).toLocaleString()}/year`
        : "significant";
      const monthlySavings = topPump
        ? `₱${Math.round(topPump.roi.annual_savings / 12).toLocaleString()}/month`
        : "";
      const topPumpName = topPump?.model || "matched pump";
      const alternatePumps = engineResult.pumps?.slice(1).map((p) => p.model) || [];
      const app = state.application?.replace(/_/g, " ") || "their system";
      const confidence = topPump?.matchConfidence ? `${topPump.matchConfidence}% match` : "";

      const competitorContext = isCompetitor && topPump?.comparedTo
        ? `\nTheir current pump: ${topPump.comparedTo}. This is a direct Grundfos equivalent.`
        : "";

      const isReRecommend = lastEngineAction === "recommend" && engineResult.action === "recommend";

      // Enrich context so the LLM can cite real specs (IE3, AUTOADAPT, IP55, etc.)
      const topFeatures = (topPump?.features ?? []).slice(0, 3);
      const featuresHint = topFeatures.length > 0
        ? `\nKey features of ${topPumpName}: ${topFeatures.join("; ")}.`
        : "";
      const evalDomainHint = state.evalDomain ? `\nEval domain: ${state.evalDomain}.` : "";

      const dp = engineResult.dutyPoint;
      const specsAreUserProvided = state.flow_m3h != null && state.head_m != null;
      // For laypersons: include duty point as internal sizing context for the LLM but
      // explicitly forbid it from surfacing raw numbers in the response text.
      // For technical users: expose the duty point naturally so the LLM can cite it.
      const dutyLine = dp
        ? userExpertise === 'layperson'
          ? `Internal sizing context only (NEVER mention these numbers in your text — use plain language like "right-sized for your building"): ${dp.estimated_flow_m3h} m³/h at ${dp.estimated_head_m} m head (${specsAreUserProvided ? "user-provided" : "estimated from building parameters"})`
          : `Duty point: ${dp.estimated_flow_m3h} m³/h at ${dp.estimated_head_m} m head (${specsAreUserProvided ? "user-provided exact specs" : "estimated from building parameters — mention this is an estimate"})`
        : "";
      const buildingLine = [
        state.buildingSize && `${state.buildingSize} building`,
        state.floors && `${state.floors} floors`,
        state.problem && `problem: ${state.problem.replace(/_/g, " ")}`,
      ].filter(Boolean).join(", ");

      // Long conversation hint — helps LLM stay contextual in extended chats
      const longConvoHint = conversationTurns > 10
        ? "\nNote: this has been a long conversation — be concise and reference the established facts above, not generic pump theory."
        : "";

      const pump2 = engineResult.pumps?.[1];
      const pump2Name = pump2?.model || "";
      const pump2Savings = pump2 ? `₱${Math.round(pump2.roi.annual_savings).toLocaleString()}/year` : "";

      // Expertise addendum for prompts that don't go through buildExplanationPrompt
      // (comparison & competitor paths). Mirrors the plain-language rule for laypersons.
      const comparisonExpertiseNote = userExpertise === 'layperson'
        ? `\n\nCRITICAL — NON-TECHNICAL USER: NEVER mention m³/h, m head, kPa, kW values, or raw engineering numbers in your text. Use plain language: "handles bigger buildings", "right-sized for home use", "more powerful option". Savings (₱xxx/yr) are always fine.`
        : `\n\nNOTE — TECHNICAL USER: Feel free to mention specific values (m³/h, m head, kW) naturally.`;

      chatMessages.push({
        role: "system",
        content: isPumpInfo
          ? `You are a Grundfos product expert. The user asked what the ${topPumpName} is.
Give a factual 2-3 sentence overview: what category it belongs to (${topPump?.category || "pump"}), its typical application, and its standout feature or spec.
Specs are shown in the card below — do NOT repeat them verbatim. Do NOT frame this as a recommendation or mention their system/building — they haven't told you anything about that yet.
Start with "The ${topPumpName} is..." — use the model name exactly as written.`
          : isProductComparison
          ? `${basePrompt}${comparisonExpertiseNote}
${specsAreUserProvided
  ? userExpertise === 'layperson'
    ? `The user has specific requirements — use this to determine which pump fits better, but express it as "better suited for your setup" without quoting raw numbers.`
    : `User's actual duty point: ${state.flow_m3h} m³/h at ${state.head_m} m head — use this to determine which pump is the better fit.`
  : `IMPORTANT: The user asked for a direct model comparison. Do NOT assume or reference any building type, application, or use case — you don't know it. Focus only on the objective spec differences between the two models.`}

PUMP NAMES — copy EXACTLY:
  • Pump A: ${topPumpName}${topPump?.specs?.max_flow_m3h ? ` (max flow: ${topPump.specs.max_flow_m3h} m³/h, max head: ${topPump.specs.max_head_m} m, power: ${topPump.specs.power_kw} kW)` : ""}${topPump?.roi ? `, saves ${savings}/year` : ""}
  • Pump B: ${pump2Name}${pump2?.specs?.max_flow_m3h ? ` (max flow: ${pump2.specs.max_flow_m3h} m³/h, max head: ${pump2.specs.max_head_m} m, power: ${pump2.specs.power_kw} kW)` : ""}${pump2?.roi ? `, saves ${pump2Savings}/year` : ""}
Specs cards are shown below. Write 2-3 sentences on the KEY spec difference.${specsAreUserProvided ? " Give a verdict on which pump fits the requirements better." : " State the difference objectively and let the user decide which matters for their needs."}${longConvoHint}`
          : `${basePrompt}

User's system: ${app}${buildingLine ? ` — ${buildingLine}` : ""}.
${dutyLine}
PUMP NAMES — copy these EXACTLY, character for character:
  • Best Match (primary recommendation): ${topPumpName}${confidence ? ` — ${confidence}` : ""}
${alternatePumps.length > 0 ? `  • Also visible as alternatives: ${alternatePumps.join(", ")}` : ""}
Best Match saves approximately ${savings} (${monthlySavings}) vs a typical oversized installation.${competitorContext}
${topPump?.oversizingNote || ""}${featuresHint}${evalDomainHint}
Specs and ROI are in cards below — write a warm, specific 2-3 sentence explanation that references their actual situation (building type, problem, or specs). If key features are listed above, weave the most relevant one in naturally.
CRITICAL: Your response MUST name ${topPumpName} as the primary recommendation. Do NOT name any alternative as the top pick. These model names are the ONLY valid ones — never invent, abbreviate, or substitute.
FIRST-SENTENCE RULE: Your opening words must introduce ${topPumpName} directly — e.g. "The ${topPumpName} is..." or "${topPumpName} is your best bet here". Even if a different pump was mentioned in an earlier message, THIS response is only about ${topPumpName}.${isReRecommend ? `\nSPECS UPDATED: Requirements may have changed since last turn. ${topPumpName} is the current best match. Do NOT continue naming any pump from previous messages as the top choice — start fresh with ${topPumpName}.` : ""}${longConvoHint}`,
      });
      // Build history for recommendation LLM call.
      // Sanitize previous assistant messages by replacing catalog pump model names with a
      // neutral placeholder — prevents the LLM from being anchored to a stale pump name
      // when the engine's top pick changes (e.g. MAGNA3→MAGNA1 after a spec update).
      // This is the root cause of "LLM text says MAGNA3 but card shows MAGNA1" mismatches.
      const allCatalogNames = [
        "MAGNA3 100-120 F", "MAGNA1 100-120 F", "UPS 40-50 FN 250", "TP 40-230/2",
        "UPM3 AUTO 15-50 130", "UPS 15-40 130", "UP 15-29 SU", "UPM2 K 15-40 130",
        "ALPHA2 32-80 180", "ALPHA1 32-80 180", "COMFORT 15-14 M",
        "MG71C", "CR 5-5", "CM 25-4", "MTH 2-4/2",
        "SP 2A-13", "SP 3A-3", "SP 5A-5", "SQ 2-130 N", "SQ 3-120 N", "SQE 2-130 N",
      ];
      const catalogNameRe = new RegExp(
        allCatalogNames.map(n => n.replace(/[-\/().]/g, "\\$&")).join("|"),
        "g"
      );
      for (const msg of effectiveHistory.slice(-6)) {
        const content = msg.role === "assistant"
          ? msg.content.replace(catalogNameRe, "Grundfos pump")
          : msg.content;
        chatMessages.push({
          role: msg.role as "user" | "assistant",
          content,
        });
      }
      chatMessages.push({ role: "user", content: message });
    }

    // ─── For recommend / compare: build streamed LLM call ────────
    let chatStream: AsyncIterable<{ choices: Array<{ delta?: { content?: string | null } }> }> | null = null;
    if ((engineResult.action === "recommend" || engineResult.action === "compare") && chatMessages.length > 0) {
      try {
        chatStream = await callWithRetry(
          () => groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: chatMessages,
            stream: true,
            temperature: 0.6,
            max_tokens: 220,
          }),
          "recommendationStream"
        );
      } catch (streamErr) {
        console.error("[route] Recommendation stream init failed:", streamErr);
        // chatStream stays null — we'll send a fallback message in the stream controller
      }
    }

    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (currentConversationId) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "conversation_id", id: currentConversationId })}\n\n`
              )
            );
          }

          if (chatStream) {
            // Recommend: stream tokens from LLM
            for await (const chunk of chatStream) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "token", content })}\n\n`
                  )
                );
              }
            }
          } else if (engineResult.action === "recommend" || engineResult.action === "compare") {
            // Stream failed — use a clear fallback
            const topName = engineResult.pumps?.[0]?.model || "a matching pump";
            const pump2Name = engineResult.pumps?.[1]?.model;
            const fallbackText = engineResult.action === "compare" && pump2Name
              ? `Here's a side-by-side comparison of ${topName} and ${pump2Name}. Check the cards below for full specs and savings.`
              : `Great news! Based on your requirements, ${topName} is the best fit. Check the details in the card below for full specs and savings.`;
            fullResponse = fallbackText;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "token", content: fallbackText })}\n\n`
              )
            );
          } else {
            // Ask / greet: send AI-generated question as a single token
            fullResponse = aiQuestion;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "token", content: aiQuestion })}\n\n`
              )
            );
          }

          // Strip any accidental markers the LLM might output
          const parsed = parseMessageMetadata(fullResponse);
          if (parsed.content !== fullResponse) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "replace_content",
                  content: parsed.content,
                })}\n\n`
              )
            );
          }

          // Save assistant response to Supabase (signed-in users only)
          if (supabase && userId && currentConversationId) {
            try {
              const { error: assistantInsertErr } = await supabase.from("messages").insert({
                conversation_id: currentConversationId,
                role: "assistant",
                content: parsed.content,
                metadata: {
                  engineAction: engineResult.action,
                  suggestions: aiSuggestions.length > 0 ? aiSuggestions : engineResult.suggestions,
                  requirements: engineResult.requirements,
                  // Persist pump cards so signed-in users see them after page reload
                  pumps: engineResult.pumps ?? [],
                  // Flag for comparison view rendering
                  ...(engineResult.action === "compare" && { isComparison: true }),
                },
              });
              if (assistantInsertErr) {
                console.error("[route] Supabase assistant message insert error:", assistantInsertErr);
              }

              // Generate conversation title on first response
              if (!conversationId && fullResponse.length > 0) {
                try {
                  const titleResponse = await groq.chat.completions.create({
                    model: "llama-3.1-8b-instant",
                    messages: [
                      {
                        role: "system",
                        content:
                          "Generate a very short title (max 5 words) for this conversation. Just the title, nothing else.",
                      },
                      { role: "user", content: message },
                      {
                        role: "assistant",
                        content: fullResponse.slice(0, 200),
                      },
                    ],
                    temperature: 0.3,
                    max_tokens: 20,
                  });
                  const title =
                    titleResponse.choices[0]?.message?.content?.trim() ||
                    "New Chat";
                  await supabase
                    .from("conversations")
                    .update({ title, updated_at: new Date().toISOString() })
                    .eq("id", currentConversationId);
                } catch (titleErr) {
                  console.error("[route] Title generation failed (non-critical):", titleErr);
                }
              }
            } catch (saveErr) {
              console.error("[route] Supabase response save failed (non-critical):", saveErr);
            }
          }

          // ─── Send metadata ───────────────────────────────────────
          const metadata: Record<string, unknown> = {};

          // Always send engineAction so client can track post-recommendation state (for guests)
          metadata.engineAction = engineResult.action;

          // Send detected expertise level so the client can adapt UI if needed
          metadata.userExpertise = userExpertise;

          // Comparison flag — tells the frontend to render side-by-side comparison view
          if (engineResult.action === "compare") {
            metadata.isComparison = true;
          }

          // Live grid data — always included so the frontend can show the CO2/rate badge
          metadata.gridData = {
            co2: gridData.co2,
            isLive: gridData.isLive,
            gCO2perKwh: gridData.gCO2perKwh,
            updatedAt: gridData.updatedAt,
            ratePhp: gridData.ratePhp,
            rateLabel: gridData.rateLabel,
          };

          // Use AI-generated suggestions for ask/greet; engine suggestions for recommend
          const finalSuggestions = aiSuggestions.length > 0
            ? aiSuggestions
            : engineResult.suggestions;
          if (finalSuggestions && finalSuggestions.length > 0) {
            metadata.suggestions = finalSuggestions;
          }

          if (engineResult.requirements) {
            metadata.requirements = engineResult.requirements;
          }

          if (engineResult.pumps && engineResult.pumps.length > 0) {
            metadata.pumps = engineResult.pumps.map((pump: RecommendedPump) => ({
              id: pump.id,
              model: pump.model,
              family: pump.family,
              category: pump.category,
              type: pump.type,
              image_url: pump.image_url,
              pdf_url: pump.pdf_url,
              applications: pump.applications,
              features: pump.features,
              specs: pump.specs,
              price_range_usd: pump.price_range_usd,
              price_range_php: pump.price_range_php,
              roi: pump.roi,
              oversizingNote: pump.oversizingNote,
              matchConfidence: pump.matchConfidence,
              matchLabel: pump.matchLabel,
              comparedTo: pump.comparedTo,
            }));
          }

          if (Object.keys(metadata).length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "metadata", ...metadata })}\n\n`
              )
            );
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done" })}\n\n`
            )
          );
          controller.close();
        } catch (streamErr) {
          console.error("[route] Stream controller error:", streamErr);
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: "Something went wrong. Please try again.",
                })}\n\n`
              )
            );
          } catch {
            // Controller may already be closed
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[route] Unhandled POST error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: "Something went wrong processing your request. Please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
