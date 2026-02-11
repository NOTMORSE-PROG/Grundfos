import { NextRequest } from "next/server";
import { getGroqClient } from "@/lib/groq";
import { SYSTEM_PROMPT, buildContextPrompt } from "@/lib/prompts";
import { getServiceClient } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import pumpCatalog from "@/data/pump-catalog.json";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequest {
  message: string;
  conversationId?: string;
  sessionId: string;
}

// Fallback: search pumps from local JSON when Supabase isn't configured
function searchPumpsLocal(query: string): string {
  const q = query.toLowerCase();
  const pumps = pumpCatalog.pumps || [];

  const matched = pumps.filter((pump) => {
    const searchText = [
      pump.model,
      pump.family,
      pump.category,
      pump.type,
      ...(pump.applications || []),
      ...(pump.features || []),
    ]
      .join(" ")
      .toLowerCase();
    return q
      .split(" ")
      .some((word) => word.length > 2 && searchText.includes(word));
  });

  const results = matched.slice(0, 5);
  if (results.length === 0) {
    return pumps
      .slice(0, 5)
      .map(
        (p) =>
          `${p.model}: ${p.type}, flow ${p.specs?.max_flow_m3h ?? "N/A"}m³/h, head ${p.specs?.max_head_m ?? "N/A"}m, power ${p.specs?.power_kw ?? "N/A"}kW, applications: ${(p.applications || []).join(", ")}, features: ${(p.features || []).slice(0, 3).join(", ")}`
      )
      .join("\n");
  }

  return results
    .map(
      (p) =>
        `${p.model}: ${p.type}, flow ${p.specs?.max_flow_m3h ?? "N/A"}m³/h, head ${p.specs?.max_head_m ?? "N/A"}m, power ${p.specs?.power_kw ?? "N/A"}kW, applications: ${(p.applications || []).join(", ")}, features: ${(p.features || []).slice(0, 3).join(", ")}, price: ${p.price_range_usd ?? "N/A"} USD, annual kWh: ${p.estimated_annual_kwh ?? "N/A"}`
    )
    .join("\n");
}

// Try RAG search via Supabase, fallback to local
async function getPumpContext(userMessage: string): Promise<string> {
  try {
    const supabase = getServiceClient();
    if (!supabase) return searchPumpsLocal(userMessage);

    const embedding = await generateEmbedding(userMessage);

    const { data, error } = await supabase.rpc("match_pumps", {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: 5,
    });

    if (error || !data || data.length === 0) {
      return searchPumpsLocal(userMessage);
    }

    const pumpIds = [
      ...new Set(data.map((d: { pump_id: string }) => d.pump_id)),
    ];
    const { data: pumps } = await supabase
      .from("pumps")
      .select("*")
      .in("id", pumpIds);

    if (!pumps || pumps.length === 0) {
      return searchPumpsLocal(userMessage);
    }

    return pumps
      .map(
        (p: Record<string, unknown>) =>
          `${p.model}: ${p.type}, flow ${p.max_flow_m3h}m³/h, head ${p.max_head_m}m, power ${p.power_kw}kW, applications: ${(p.application as string[] || []).join(", ")}, features: ${(p.features as string[] || []).slice(0, 3).join(", ")}, price: $${p.price_range_min}-${p.price_range_max}, annual kWh: ${p.typical_annual_kwh}`
      )
      .join("\n");
  } catch {
    return searchPumpsLocal(userMessage);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, conversationId, sessionId } = body;

    if (!message || !sessionId) {
      return new Response(
        JSON.stringify({ error: "message and sessionId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const groq = getGroqClient();

    // Get pump context via RAG or local search
    const pumpContext = await getPumpContext(message);
    const contextPrompt = buildContextPrompt(pumpContext);

    // Build messages array
    const chatMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: SYSTEM_PROMPT + contextPrompt }];

    // Load conversation history if exists
    let currentConversationId = conversationId;
    const supabase = getServiceClient();

    if (supabase) {
      try {
        if (currentConversationId) {
          const { data: history } = await supabase
            .from("messages")
            .select("role, content")
            .eq("conversation_id", currentConversationId)
            .order("created_at", { ascending: true })
            .limit(20);

          if (history) {
            for (const msg of history) {
              chatMessages.push({
                role: msg.role as "user" | "assistant",
                content: msg.content,
              });
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

    chatMessages.push({ role: "user", content: message });

    // Stream response from Groq
    const chatStream = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: chatMessages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2048,
    });

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

          // Save assistant response
          if (supabase && currentConversationId) {
            try {
              await supabase.from("messages").insert({
                conversation_id: currentConversationId,
                role: "assistant",
                content: fullResponse,
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
