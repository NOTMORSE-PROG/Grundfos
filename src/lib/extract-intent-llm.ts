import Groq from "groq-sdk";

export interface LLMExtractedIntent {
  application?: "heating" | "cooling" | "domestic_water" | "water_supply" | "wastewater" | "dosing";
  buildingSize?: "small" | "medium" | "large";
  floors?: number;
  bathrooms?: number;
  waterSource?: "mains" | "well" | "tank";
  flow_m3h?: number;
  head_m?: number;
  existingPumpBrand?: string;
  existingPump?: string;
  problem?: "low_pressure" | "no_water" | "replacement" | "new_install" | "energy_saving";
}

const EXTRACTION_SYSTEM_PROMPT = `Extract pump requirements from this conversation. Output ONLY valid JSON.
All fields are optional — use null if not mentioned. Never guess or infer beyond what is stated.

Fields:
- application: "heating" | "cooling" | "domestic_water" | "water_supply" | "wastewater" | "dosing"
- buildingSize: "small" (house/shop/small office) | "medium" (apartment block/mid office/hotel) | "large" (factory/hospital/campus)
- floors: number (floor count of the building)
- bathrooms: number (bathroom/CR/toilet/comfort room count)
- waterSource: "mains" (tap/city water/water district) | "well" (deep well/borehole/ground water) | "tank" (cistern/tank/reservoir)
- flow_m3h: number (flow rate in m³/h — convert if given in LPS or GPM)
- head_m: number (head pressure in meters)
- existingPumpBrand: string (brand of the pump they want to replace, e.g. "Wilo", "KSB", "DAB")
- existingPump: string (full pump model name, e.g. "Stratos 25/14", "Multivert MVI 3-6/16")
- problem: "low_pressure" | "no_water" | "replacement" | "new_install" | "energy_saving"

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
{"application":"domestic_water","buildingSize":"small","floors":2,"bathrooms":2,"problem":"low_pressure"}`;

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
    if (typeof parsed.existingPumpBrand === "string" && parsed.existingPumpBrand) result.existingPumpBrand = parsed.existingPumpBrand;
    if (typeof parsed.existingPump === "string" && parsed.existingPump) result.existingPump = parsed.existingPump;
    if (typeof parsed.problem === "string") result.problem = parsed.problem as LLMExtractedIntent["problem"];

    return result;
  } catch {
    // Silent fail — regex engine in extractIntent() handles it as fallback
    return {};
  }
}
