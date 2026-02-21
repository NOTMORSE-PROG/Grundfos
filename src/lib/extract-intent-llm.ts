import Groq from "groq-sdk";

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

export async function extractIntentWithLLM(
  groq: Groq,
  messages: Array<{ role: string; content: string }>
): Promise<LLMExtractedIntent> {
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        // Last 6 messages = up to 3 exchanges — enough context, avoids prompt bloat
        ...messages
          .slice(-6)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text) as Record<string, unknown>;

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
  } catch {
    // Silent fail — regex engine in extractIntent() handles it as fallback
    return {};
  }
}
