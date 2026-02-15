"use client";

import { useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeatureSection } from "@/components/landing/FeatureSection";
import { ProductSection } from "@/components/landing/ProductSection";
import { ExcellenceSection } from "@/components/landing/ExcellenceSection";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSignInClick={() => setAuthModalOpen(true)} />
      <HeroSection onSignUpClick={() => setAuthModalOpen(true)} />
      <FeatureSection />
      <ProductSection />
      <ExcellenceSection />
      <Footer />

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onAuthSuccess={() => {
          setAuthModalOpen(false);
          window.location.href = "/chat";
        }}
      />
    </div>
  );
}