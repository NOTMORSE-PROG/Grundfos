import { NextRequest } from "next/server";
import { getGroqClient } from "@/lib/groq";
import { buildQuestionSystemPrompt, EXPLANATION_PROMPT, COMPARISON_PROMPT } from "@/lib/prompts";
import { getServiceClient } from "@/lib/supabase";
import { extractIntent, getNextAction, detectEvalDomain, type EngineResult, type RecommendedPump, type ConversationState } from "@/lib/recommendation-engine";
import { parseMessageMetadata } from "@/lib/parse-message-metadata";
import { extractIntentWithLLM } from "@/lib/extract-intent-llm";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequest {
  message: string;
  conversationId?: string;
  sessionId: string;
  history?: Array<{ role: string; content: string }>;
  lastEngineAction?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, conversationId, sessionId, history: clientHistory, lastEngineAction: clientLastEngineAction } = body;

    if (!message || !sessionId) {
      return new Response(
        JSON.stringify({ error: "message and sessionId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const groq = getGroqClient();

    // ─── Load conversation history ────────────────────────────────
    let currentConversationId = conversationId;
    const supabase = getServiceClient();
    const historyMessages: Array<{ role: string; content: string; metadata?: Record<string, unknown> }> = [];

    if (supabase) {
      try {
        if (currentConversationId) {
          const { data: history } = await supabase
            .from("messages")
            .select("role, content, metadata")
            .eq("conversation_id", currentConversationId)
            .order("created_at", { ascending: true })
            .limit(50);

          if (history) {
            for (const msg of history) {
              historyMessages.push(msg);
            }
          }
        } else {
          const { data: conv } = await supabase
            .from("conversations")
            .insert({ session_id: sessionId, title: "New Chat" })
            .select("id")
            .single();
          if (conv) {
            currentConversationId = conv.id;
          }
        }

        if (currentConversationId) {
          await supabase.from("messages").insert({
            conversation_id: currentConversationId,
            role: "user",
            content: message,
          });
        }
      } catch {
        // Supabase operation failed, continue without persistence
      }
    }

    // ─── Engine: Extract intent from ALL messages ─────────────────
    // Use Supabase history if available, otherwise use client-provided history
    const effectiveHistory = historyMessages.length > 0 ? historyMessages : (clientHistory || []);
    const allMessages = [
      ...effectiveHistory,
      { role: "user", content: message },
    ];

    // Detect last engine action — for post-recommendation feedback handling
    // For signed-in users: read from Supabase message metadata
    // For guests: read from client-provided lastEngineAction (sent from Zustand store)
    let lastEngineAction: "recommend" | "ask" | "greet" | undefined;
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const m = historyMessages[i];
      if (m.role === "assistant" && m.metadata?.engineAction) {
        lastEngineAction = m.metadata.engineAction as typeof lastEngineAction;
        break;
      }
    }
    // Guest fallback: use client-provided value if Supabase didn't have it
    if (!lastEngineAction && clientLastEngineAction) {
      lastEngineAction = clientLastEngineAction as "recommend" | "ask" | "greet";
    }

    // Run LLM-based intent extraction and regex extraction in parallel
    // LLM understands natural language, paraphrases, and Filipino/Tagalog
    // Regex is fast and precise for exact numbers (flow, head, power)
    const [llmIntent, regexState] = await Promise.all([
      extractIntentWithLLM(groq, allMessages),
      Promise.resolve(extractIntent(allMessages)),
    ]);

    // Merge: regex wins where it found something (reliable for exact specs)
    // LLM fills gaps where regex found nothing (handles natural language)
    const state: ConversationState = {
      ...regexState,
      ...(llmIntent.application && !regexState.application && { application: llmIntent.application }),
      ...(llmIntent.buildingSize && !regexState.buildingSize && { buildingSize: llmIntent.buildingSize }),
      ...(llmIntent.floors != null && !regexState.floors && { floors: llmIntent.floors }),
      ...(llmIntent.bathrooms != null && !regexState.bathrooms && { bathrooms: llmIntent.bathrooms }),
      ...(llmIntent.waterSource && !regexState.waterSource && { waterSource: llmIntent.waterSource }),
      ...(llmIntent.flow_m3h != null && !regexState.flow_m3h && { flow_m3h: llmIntent.flow_m3h }),
      ...(llmIntent.head_m != null && !regexState.head_m && { head_m: llmIntent.head_m }),
      ...(llmIntent.motor_kw != null && !regexState.motor_kw && { motor_kw: llmIntent.motor_kw }),
      ...(llmIntent.existingPumpBrand && !regexState.existingPumpBrand && { existingPumpBrand: llmIntent.existingPumpBrand }),
      ...(llmIntent.existingPump && !regexState.existingPump && { existingPump: llmIntent.existingPump }),
      ...(llmIntent.problem && !regexState.problem && { problem: llmIntent.problem }),
    };

    // Apply domain detection so CBS/DBS/IN/WU preference bonuses fire in chat (same as eval path)
    const allText = allMessages.map((m) => m.content).join(" ");
    const detectedDomain = detectEvalDomain(allText);
    if (detectedDomain) state.evalDomain = detectedDomain;

    let engineResult: EngineResult = getNextAction(state, message, lastEngineAction);

    // Handle 0 pump matches — fall back to asking for more info
    if (
      engineResult.action === "recommend" &&
      (!engineResult.pumps || engineResult.pumps.length === 0)
    ) {
      engineResult = {
        action: "ask",
        questionContext:
          "No exact pump matches found for their specs. Ask if they can adjust their requirements, or suggest they consult a Grundfos engineer for a custom solution.",
        suggestions: ["Adjust my specs", "Talk to an engineer"],
        state,
      };
    }

    // ─── Build LLM messages based on engine decision ──────────────
    const chatMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    // Shared: build known-context string for both question and recommend paths
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

    // AI-generated question + suggestions (ask / greet)
    let aiQuestion = "";
    let aiSuggestions: string[] = [];

    if (engineResult.action === "ask" || engineResult.action === "greet") {
      // Single non-streamed JSON call — question and chips generated together so they always match
      const questionContext = engineResult.questionContext ||
        (engineResult.action === "greet"
          ? "Greet the user and ask what pump problem they need help with."
          : "Ask the user for more information about their pump needs.");

      try {
        const qResponse = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: buildQuestionSystemPrompt(questionContext, knownContextStr),
            },
            // Include last few messages for conversational continuity
            ...effectiveHistory.slice(-4).map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
            { role: "user", content: message },
          ],
          temperature: 0.7,
          max_tokens: 150,
          response_format: { type: "json_object" },
        });

        const qRaw = qResponse.choices[0]?.message?.content || "{}";
        const qParsed = JSON.parse(qRaw) as { question?: string; suggestions?: unknown };
        if (typeof qParsed.question === "string" && qParsed.question.trim()) {
          aiQuestion = qParsed.question.trim();
        }
        if (Array.isArray(qParsed.suggestions)) {
          aiSuggestions = (qParsed.suggestions as unknown[])
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .slice(0, 4);
        }
      } catch {
        // Silent fail — fallback to engine suggestions below
      }

      // Fallback if LLM failed
      if (!aiQuestion) aiQuestion = "Could you tell me a bit more about what you need?";
      if (aiSuggestions.length === 0 && engineResult.suggestions) {
        aiSuggestions = engineResult.suggestions;
      }
    } else {
      // Recommendation mode: choose prompt based on whether it's competitor replacement
      const isCompetitor = engineResult.isCompetitorReplacement;
      const basePrompt = isCompetitor ? COMPARISON_PROMPT : EXPLANATION_PROMPT;

      const topPump = engineResult.pumps?.[0];
      const savings = topPump
        ? `₱${Math.round(topPump.roi.annual_savings).toLocaleString()}/year`
        : "significant";
      const monthlySavings = topPump
        ? `₱${Math.round(topPump.roi.annual_savings / 12).toLocaleString()}/month`
        : "";
      const pumpNames = engineResult.pumps?.map((p) => p.model).join(" and ") || "matched pumps";
      const app = state.application?.replace(/_/g, " ") || "their system";
      const confidence = topPump?.matchConfidence ? `${topPump.matchConfidence}% match` : "";

      const competitorContext = isCompetitor && topPump?.comparedTo
        ? `\nTheir current pump: ${topPump.comparedTo}. This is a direct Grundfos equivalent.`
        : "";

      chatMessages.push({
        role: "system",
        content: `${basePrompt}

Context: The user needs a pump for their ${app} system.
You are recommending: ${pumpNames}. ${confidence ? `(${confidence})` : ""}
The top pick saves approximately ${savings} (${monthlySavings}) in energy costs.${competitorContext}
${topPump?.oversizingNote || ""}
The detailed specs and ROI are shown in cards below — just write a warm, natural explanation.`,
      });
      // Include history so LLM has conversational context
      for (const msg of effectiveHistory) {
        chatMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
      chatMessages.push({ role: "user", content: message });
    }

    // ─── For recommend: build streamed LLM call ───────────────────
    let chatStream: AsyncIterable<{ choices: Array<{ delta?: { content?: string | null } }> }> | null = null;
    if (engineResult.action === "recommend" && chatMessages.length > 0) {
      chatStream = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: chatMessages,
        stream: true,
        temperature: 0.6,
        max_tokens: 200,
      });
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
          } else {
            // Ask / greet: send AI-generated question as a single token (already ready)
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

          // Save assistant response
          if (supabase && currentConversationId) {
            try {
              await supabase.from("messages").insert({
                conversation_id: currentConversationId,
                role: "assistant",
                content: parsed.content,
                metadata: {
                  engineAction: engineResult.action,
                  suggestions: aiSuggestions.length > 0 ? aiSuggestions : engineResult.suggestions,
                  requirements: engineResult.requirements,
                },
              });

              if (!conversationId && fullResponse.length > 0) {
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
              }
            } catch {
              // Not critical
            }
          }

          // ─── Send metadata ───────────────────────────────────────
          const metadata: Record<string, unknown> = {};

          // Always send engineAction so client can track post-recommendation state (for guests)
          metadata.engineAction = engineResult.action;

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
              estimated_annual_kwh: pump.estimated_annual_kwh,
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
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: String(error) })}\n\n`
            )
          );
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
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
