"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { Droplets, Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      router.replace("/login");
      return;
    }

    // Exchange the code in the URL for a session, then go to chat
    supabase.auth.exchangeCodeForSession(window.location.href).then(() => {
      router.replace("/chat");
    }).catch(() => {
      router.replace("/login?error=auth_failed");
    });
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f9fafb]">
      <div className="w-12 h-12 rounded-xl bg-grundfos-blue flex items-center justify-center">
        <Droplets className="w-7 h-7 text-white" />
      </div>
      <div className="flex items-center gap-2 text-gray-600">
        <Loader2 className="w-4 h-4 animate-spin text-grundfos-blue" />
        <span className="text-sm">Signing you in…</span>
      </div>
    </div>
  );
}
