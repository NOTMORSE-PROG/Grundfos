"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageSquare, LogIn } from "lucide-react";

interface HeroSectionProps {
  onSignUpClick: () => void;
}

export function HeroSection({ onSignUpClick }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden text-white py-20 md:py-28">
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/sample-background-video.mp4" type="video/mp4" />
      </video>

      {/* Blue Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-grundfos-dark via-grundfos-blue to-grundfos-mid opacity-[0.70]" />

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <span className="inline-block bg-white/15 text-white text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-6">
          About GrundMatch
        </span>
        <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
          Leading the Way in
          <br />
          Pump Solutions
        </h1>
        <p className="text-white/75 max-w-2xl mx-auto mb-10 text-sm md:text-base leading-relaxed">
          For over 75 years, Grundfos has been at the forefront of pump
          technology, innovation, and sustainable solutions worldwide.
          GrundMatch uses AI to help you find the perfect pump instantly.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/chat">
            <Button
              size="lg"
              className="bg-white text-grundfos-dark hover:bg-grundfos-light font-semibold px-8"
            >
              <MessageSquare className="h-5 w-5 mr-2" />
              Chat Without Signing In
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className="bg-white/50 border-transparent text-white hover:bg-white/70 font-semibold px-8"
            onClick={onSignUpClick}
          >
            <LogIn className="h-5 w-5 mr-2" />
            Sign Up / Log In
          </Button>
        </div>
      </div>
    </section>
  );
}