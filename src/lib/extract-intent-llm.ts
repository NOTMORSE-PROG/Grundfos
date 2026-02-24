import Groq from "groq-sdk";
import type { ConversationState } from "@/lib/recommendation-engine";

export interface LLMExtractedIntent {
  application?: "heating" | "cooling" | "domestic_water" | "water_supply" | "wastewater" | "dosing";
  buildingSize?: "small" | "medium" | "large";
  floors?: number;
  bathrooms?: number;
  waterSource?: "mains" | "well" | "tank";
  flow_m3h?: number;
  head_m?: number;
  motor_kw?: number;
  existingPumpBrand?: string;
  existingPump?: string;
  problem?: "low_pressure" | "no_water" | "replacement" | "new_install" | "energy_saving";
}

const EXTRACTION_SYSTEM_PROMPT = `Extract pump requirements from this conversation. Output ONLY valid JSON.
All fields are optional — omit any field that is not clearly stated (do NOT set it to null, just leave it out).
CRITICAL: If the latest user message contains no pump-related information (e.g. greetings, vague questions, filler words), output exactly: {}
Never infer or guess an application type from a vague or generic message. An empty {} is always better than a wrong guess.
CRITICAL for 'application': Only include it if the user EXPLICITLY states the use case (e.g., "for heating", "HVAC", "water supply", "my well", "cooling system"). Phrases like "right-size my pump", "save energy on pumping", "help me choose a pump", "replace my pump" do NOT imply a specific application — omit the field in those cases.
CRITICAL for 'floors': Only include a floor count when the user EXPLICITLY states it as a number (e.g., "10-story building", "our 5-floor office", "tatlong palapag", "3 floors"). Building size descriptors like "large office building", "big factory", "tall building", "high-rise" do NOT imply a specific floor count — omit 'floors' in those cases and only set 'buildingSize'.
IMPORTANT: If the latest user message CORRECTS or UPDATES a previous value (e.g., "i need it for small office" overrides an earlier "large office building"), extract the UPDATED value — the latest message takes priority over earlier messages.

Fields:
- application: "heating" | "cooling" | "domestic_water" | "water_supply" | "wastewater" | "dosing"
- buildingSize: "small" (house/shop/small office) | "medium" (apartment block/mid office/hotel) | "large" (factory/hospital/campus)
- floors: number (floor count of the building)
- bathrooms: number (bathroom/CR/toilet/comfort room count)
- waterSource: "mains" (tap/city water/water district) | "well" (deep well/borehole/ground water) | "tank" (cistern/tank/reservoir)
- flow_m3h: number (flow rate in m³/h — ALWAYS convert to m³/h, see unit conversions below)
- head_m: number (head pressure in meters — ALWAYS convert to meters)
- motor_kw: number (motor/shaft power in kW — extract when only power is specified with no flow/head)
- existingPumpBrand: string (brand of the pump they want to replace, e.g. "Wilo", "KSB", "DAB")
- existingPump: string (full pump model name, e.g. "Stratos 25/14", "Multivert MVI 3-6/16")
- problem: "low_pressure" | "no_water" | "replacement" | "new_install" | "energy_saving"

Pump duty point format — CRITICAL: in pump specifications, "X m³/h, Y m" ALWAYS means flow=X and head=Y:
- "35 m³/h, 10 m" → flow_m3h: 35, head_m: 10
- "30 m³/h, 12 m" → flow_m3h: 30, head_m: 12
- "4.2 m³/h, 3.2 m" → flow_m3h: 4.2, head_m: 3.2
- The second number (Y m) is ALWAYS head pressure — extract it even if the word "head" is absent.

Unit conversions (ALWAYS output in m³/h and m):
- 1 gpm = 0.2271 m³/h (e.g. "150 gpm" → flow_m3h: 34.065)
- 1 L/min = 0.06 m³/h (e.g. "70 L/min" → flow_m3h: 4.2)
- 1 L/s = 3.6 m³/h (e.g. "9 L/s" → flow_m3h: 32.4)
- 1 ft = 0.3048 m (e.g. "33 ft" → head_m: 10.058)
- Motor power: 1 hp = 0.7457 kW (e.g. "10 hp motor" → motor_kw: 7.457; "0.55 kW motor" → motor_kw: 0.55)

Application guide:
- domestic_water: single house/home/unit/condo, family/household water supply, home fixtures (shower, faucet, kitchen, garden)
- water_supply: multi-unit or commercial building water distribution, pressure boosting for buildings, irrigation for farms/fields
- heating: radiators, boilers, hot water circulation loops, underfloor heating, HVAC heating
- cooling: chillers, cooling towers, AC chilled water loops, cold water circulation
- wastewater: sewage, drainage, effluent, sump pits, basement flooding
- dosing: chemical dosing, pH control, chlorination, precise metered flow

Natural language and Filipino/Tagalog hints:
- "barely any water", "water is weak", "mababa ang tubig/pressure", "halos wala", "kulang tubig" → low_pressure
- "no water", "wala tubig", "patay tubig" → no_water
- "replacing/palitan old pump", "lumang pump", "broken/sira pump", "failing" → replacement
- "new install", "bago", "bagong sistema", "setting up" → new_install
- "high bill", "mahal kuryente", "save energy" → energy_saving
- "CR" = comfort room = bathroom (Filipino)
- "palapag" = floor/storey (Filipino)
- "bahay" = house, "gusali" = building, "opisina" = office
- "tubig" = water, "init/mainit" = hot, "malamig" = cold
- "dalawa" = 2, "tatlo" = 3, "apat" = 4, "lima" = 5
- "dalawang palapag" = 2 floors, "tatlong CR" = 3 bathrooms

Output example for "2 CR lang kami, 2 palapag na bahay, mababa ang tubig":
{"application":"domestic_water","buildingSize":"small","floors":2,"bathrooms":2,"problem":"low_pressure"}

Messages that must produce {} — no pump info present:
- "i have a question" → {}
- "ok", "okay", "hmm", "sure", "thanks" → {}
- "can you help me?" → {}
- "tell me more" → {}
- "what do you think?" → {}
- "hello", "hi", "hey" → {}
- "interesting", "go on", "and then?" → {}`;

/**
 * Build a state-context block to inject into the extraction prompt.
 * This tells the LLM what is ALREADY CONFIRMED so it focuses only on
 * new/corrected info in the recent messages — preventing context drift
 * in long conversations where early facts fall outside the message window.
 */
function buildStateContext(currentState: Partial<ConversationState>): string {
  const known: Record<string, unknown> = {};

  if (currentState.application) known.application = currentState.application;
  if (currentState.buildingSize) known.buildingSize = currentState.buildingSize;
  if (currentState.floors != null) known.floors = currentState.floors;
  if (currentState.bathrooms != null) known.bathrooms = currentState.bathrooms;
  if (currentState.waterSource) known.waterSource = currentState.waterSource;
  if (currentState.flow_m3h != null) known.flow_m3h = currentState.flow_m3h;
  if (currentState.head_m != null) known.head_m = currentState.head_m;
  if (currentState.motor_kw != null) known.motor_kw = currentState.motor_kw;
  if (currentState.existingPumpBrand) known.existingPumpBrand = currentState.existingPumpBrand;
  if (currentState.existingPump) known.existingPump = currentState.existingPump;
  if (currentState.problem) known.problem = currentState.problem;

  if (Object.keys(known).length === 0) return "";

  return `\n\nALREADY CONFIRMED from earlier in this conversation — do NOT re-extract these unless the latest message EXPLICITLY changes them:\n${JSON.stringify(known, null, 2)}\n\nOnly return fields that are genuinely NEW in the recent messages, or that CORRECT a confirmed value above. If the confirmed values still apply unchanged, omit them from your output — they are already stored.`;
}

export async function extractIntentWithLLM(
  groq: Groq,
  messages: Array<{ role: string; content: string }>,
  currentState?: Partial<ConversationState>
): Promise<LLMExtractedIntent> {
  try {
    const stateContext = currentState ? buildStateContext(currentState) : "";
    const systemPrompt = EXTRACTION_SYSTEM_PROMPT + stateContext;

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        // Last 8 messages = up to 4 exchanges — better coverage without prompt bloat.
        // The state injection above keeps the LLM anchored to confirmed facts
        // even when early messages fall outside this window.
        ...messages
          .slice(-8)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      ],
      temperature: 0,
      max_tokens: 250,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content || "{}";

    // Robust JSON parse — LLM occasionally wraps output in markdown code fences
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Strip markdown fences if present and retry
      const stripped = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
      try {
        parsed = JSON.parse(stripped) as Record<string, unknown>;
      } catch {
        console.error("[extractIntentWithLLM] JSON parse failed, raw text:", text);
        return {};
      }
    }

    // Clean: only return fields that are non-null and match expected types
    const result: LLMExtractedIntent = {};
    if (typeof parsed.application === "string") result.application = parsed.application as LLMExtractedIntent["application"];
    if (typeof parsed.buildingSize === "string") result.buildingSize = parsed.buildingSize as LLMExtractedIntent["buildingSize"];
    if (typeof parsed.floors === "number" && parsed.floors > 0) result.floors = parsed.floors;
    if (typeof parsed.bathrooms === "number" && parsed.bathrooms > 0) result.bathrooms = parsed.bathrooms;
    if (typeof parsed.waterSource === "string") result.waterSource = parsed.waterSource as LLMExtractedIntent["waterSource"];
    if (typeof parsed.flow_m3h === "number" && parsed.flow_m3h > 0) result.flow_m3h = parsed.flow_m3h;
    if (typeof parsed.head_m === "number" && parsed.head_m > 0) result.head_m = parsed.head_m;
    if (typeof parsed.motor_kw === "number" && parsed.motor_kw > 0) result.motor_kw = parsed.motor_kw;
    if (typeof parsed.existingPumpBrand === "string" && parsed.existingPumpBrand) result.existingPumpBrand = parsed.existingPumpBrand;
    if (typeof parsed.existingPump === "string" && parsed.existingPump) result.existingPump = parsed.existingPump;
    if (typeof parsed.problem === "string") result.problem = parsed.problem as LLMExtractedIntent["problem"];

    return result;
  } catch (err) {
    // Log the error for debugging — silent fail still applies so regex engine handles it as fallback
    console.error("[extractIntentWithLLM] LLM extraction failed:", err);
    return {};
  }
}
