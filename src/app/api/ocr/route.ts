import { NextRequest, NextResponse } from "next/server";
import Tesseract from "tesseract.js";

interface OCRResult {
  extracted_text: string;
  parsed_info: {
    brand: string | null;
    model: string | null;
    power: string | null;
    voltage: string | null;
    flow: string | null;
    head: string | null;
  };
  confidence: number;
}

function parseNameplateText(text: string): OCRResult["parsed_info"] {
  const lines = text.toUpperCase();

  // Brand detection
  const brands = [
    "GRUNDFOS",
    "WILO",
    "KSB",
    "XYLEM",
    "LOWARA",
    "DAB",
    "PENTAIR",
    "FLYGT",
    "ITT",
    "EBARA",
  ];
  const brand =
    brands.find((b) => lines.includes(b)) || null;

  // Model number extraction - alphanumeric patterns common in pumps
  const modelPatterns = [
    /(?:MODEL|TYPE|MOD)[:\s]*([A-Z0-9][A-Z0-9\s\-\/\.]+)/i,
    /(MAGNA3?\s*\d[\d\-\/\s]*)/i,
    /(CR[EN]?\s*\d[\d\-\/\s]*)/i,
    /(SP\s*\d[\d\-\/A-Z\s]*)/i,
    /(ALPHA\d?\s*\d[\d\-\/\s]*)/i,
    /(SCALA\d?\s*[\d\-\/\s]*)/i,
    /(STRATOS\s*[\d\-\/\s]*)/i,
    /(HELIX\s*[A-Z]*\s*[\d\-\/\s]*)/i,
    /([A-Z]{2,}\s*\d{1,3}[\-\/]\d{1,3}[\-\/]?\d{0,3})/,
  ];
  let model: string | null = null;
  for (const pattern of modelPatterns) {
    const match = text.match(pattern);
    if (match) {
      model = match[1].trim();
      break;
    }
  }

  // Power extraction
  const powerMatch = text.match(
    /(\d+[\.,]?\d*)\s*(kW|KW|W|HP|hp)/i
  );
  const power = powerMatch
    ? `${powerMatch[1]} ${powerMatch[2]}`
    : null;

  // Voltage extraction
  const voltageMatch = text.match(
    /(\d{1,3}\s*[xX×]\s*\d{2,3}\s*V|\d{2,3}\s*V)/i
  );
  const voltage = voltageMatch ? voltageMatch[1] : null;

  // Flow extraction
  const flowMatch = text.match(
    /(\d+[\.,]?\d*)\s*(m[³3]\/h|l\/s|gpm|m3\/h)/i
  );
  const flow = flowMatch
    ? `${flowMatch[1]} ${flowMatch[2]}`
    : null;

  // Head extraction
  const headMatch = text.match(
    /(\d+[\.,]?\d*)\s*(m|ft)\s*(?:head|H|TDH)?/i
  );
  const head = headMatch
    ? `${headMatch[1]} ${headMatch[2]}`
    : null;

  return { brand, model, power, voltage, flow, head };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    // Run OCR on the image URL
    const result = await Tesseract.recognize(imageUrl, "eng", {
      logger: () => {},
    });

    const extractedText = result.data.text;
    const confidence = result.data.confidence;
    const parsedInfo = parseNameplateText(extractedText);

    const ocrResult: OCRResult = {
      extracted_text: extractedText,
      parsed_info: parsedInfo,
      confidence,
    };

    return NextResponse.json(ocrResult);
  } catch (error) {
    return NextResponse.json(
      { error: "OCR processing failed", details: String(error) },
      { status: 500 }
    );
  }
}
