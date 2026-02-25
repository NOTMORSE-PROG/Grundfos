import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// Disable Next.js caching — always fetch fresh data from Supabase
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ conversations: [] });
    }

    // Resolve user_id from auth token if provided
    let userId: string | null = null;
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
    }

    const offset = (page - 1) * limit;

    let query = supabase
      .from("conversations")
      .select("id, title, summary, pump_recommended, updated_at")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Signed-in users: load all their conversations across devices
    // Guests: load only conversations from this browser session
    if (userId) {
      query = query.eq("user_id", userId);
    } else {
      query = query.eq("session_id", sessionId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      // Table may not exist yet (migration not applied) — return empty gracefully
      console.error("[conversations] Query error:", error.message);
      return NextResponse.json({ conversations: [] });
    }

    return NextResponse.json({ conversations: conversations || [] });
  } catch (err) {
    console.error("[conversations] Unexpected error:", err);
    return NextResponse.json({ conversations: [] });
  }
}
