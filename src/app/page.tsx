"use client";

import { useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {  } from "lucide-react";
import { Droplets, 
  MessageSquare, 
  LogIn, 
  Globe, 
  Zap, 
  Lightbulb,
  Waves,
  Flame,
  Trash2,
  Factory,
  Trees,
  Bath,
  Pipette,
  Settings, } from "lucide-react";

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

interface NavbarProps {
  onSignInClick: () => void;
}

export function Navbar({ onSignInClick }: NavbarProps) {
  return (
    <nav className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-6 bg-background border-b border-border">
      <div className="flex items-center gap-2">
        <Droplets className="w-6 h-6 text-grundfos-blue" />
        <span className="font-bold text-xl text-grundfos-dark">
          GrundMatch
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="sm"
          className="border-grundfos-blue/30 text-grundfos-blue hover:bg-grundfos-light"
          onClick={onSignInClick}
        >
          <LogIn className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Sign In</span>
        </Button>
        <Link href="/chat">
          <Button
            size="sm"
            className="bg-grundfos-blue hover:bg-grundfos-dark text-white"
          >
            <MessageSquare className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Try Now</span>
          </Button>
        </Link>
      </div>
    </nav>
  );
}

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

export function FeatureSection() {
  return (
    <section className="py-16 bg-muted">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            icon: Globe,
            title: "Global Presence",
            desc: "Operating in more than 56 countries with production facilities worldwide, ensuring local support and global expertise.",
          },
          {
            icon: Zap,
            title: "Energy Efficient",
            desc: "Our pumps are designed with sustainability in mind, reducing energy consumption and environmental impact.",
          },
          {
            icon: Lightbulb,
            title: "Innovation Leader",
            desc: "Continuous research and development brings cutting-edge technology and superior performance to our products.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="bg-card rounded-xl p-6 text-left shadow-sm border border-3 border-grundfos-blue"
          >
            <div className="w-14 h-14 ml-0 mb-4 rounded-full bg-grundfos-light flex items-center justify-center">
              <f.icon className="w-7 h-7 text-grundfos-blue" />
            </div>
            <h3 className="font-semibold text-grundfos-dark mb-2">
              {f.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductSection() {
  return (
    <section className="py-16 bg-grundfos-blue">
      <div className="max-w-5xl mx-auto px-6 md:px-12 text-center">
        <span className="inline-block bg-white/20 text-white text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-4">
          Our Products
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Comprehensive Pump Solutions
        </h2>
        <p className="text-white/75 text-sm mb-10">
          We have the right pump for every need.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Waves, label: "Water Supply", description: "Reliable pumps for domestic and commercial water distribution" },
            { icon: Flame, label: "Heating Systems", description: "Efficient circulation pumps for heating applications" },
            { icon: Trash2, label: "Waste Water", description: "Robust solutions for wastewater management" },
            { icon: Factory, label: "Industrial", description: "Heavy-duty pumps for industrial processes" },
            { icon: Trees, label: "Irrigation", description: "Specialized pumps for agricultural needs" },
            { icon: Bath, label: "Pool & Spa", description: "Efficient pumps for recreational water systems" },
            { icon: Pipette, label: "Dosing Pumps", description: "Precise chemical dosing solutions" },
            { icon: Settings, label: "Custom Solutions", description: "Tailored pump systems for unique requirements" },
          ].map((p) => (
            <div
              key={p.label}
              className="bg-card rounded-xl p-6 min-h-[200px] flex flex-col items-center justify-center gap-4 hover:bg-muted transition-colors cursor-pointer"
            >
              <p.icon className="w-8 h-8 text-foreground" />
              <span className="text-foreground text-sm font-medium">
                {p.label}
              </span>
              <p className="text-foreground text-xs">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ExcellenceSection() {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-5xl mx-auto px-6 text-center">
        <span className="inline-block bg-grundfos-light text-grundfos-blue text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-4">
          Why Choose GrundMatch
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-grundfos-dark mb-2">
          Excellence in Every Detail
        </h2>
        <p className="text-muted-foreground text-sm mb-10">
          We don&apos;t just sell pumps – we provide complete solutions backed by expertise and support.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {[
            {
              num: 1,
              title: "Expert Consultation",
              desc: "Our AI assistant and technical team help you select the perfect pump for your specific needs, ensuring optimal performance and efficiency.",
            },
            {
              num: 3,
              title: "Quality Assurance",
              desc: "Access our AI assistant anytime, anywhere. Get instant answers to your questions and expert guidance when you need it.",
            },
            {
              num: 2,
              title: "24/7 Support",
              desc: "Every Grundfos pump undergoes rigorous testing and quality control, guaranteeing reliability and long service life.",
            },
            {
              num: 4,
              title: "Sustainable Solutions",
              desc: "Our commitment to sustainability means energy-efficient pumps that reduce costs and environmental impact.",
            },
          ].map((item) => (
            <div
              key={item.num}
              className="flex items-center gap-4 bg-card rounded-xl p-5 shadow-sm border border-border"
            >
              <div className="w-16 h-16 shrink-0 rounded-full bg-grundfos-blue text-white flex items-center justify-center font-bold text-base">
                {item.num}
              </div>
              <div>
                <h3 className="font-semibold text-grundfos-dark mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-grundfos-dark text-white py-12 items-center">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-5 h-5" />
              <span className="font-bold">GRUNDFOS</span>
            </div>
            <p className="text-white/60 text-xs leading-relaxed">
              Pioneering pump solutions for
              a sustainable future. Trusted by
              millions worldwide for
              quality, innovation, and reliability.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Products</h4>
            <ul className="space-y-2 text-white/60 text-xs">
              <li>Water Supply</li>
              <li>Heating</li>
              <li>Industrial</li>
              <li>Water Waste</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Company</h4>
            <ul className="space-y-2 text-white/60 text-xs">
              <li>About Us</li>
              <li>Careers</li>
              <li>Sustainability</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Support</h4>
            <ul className="space-y-2 text-white/60 text-xs">
              <li>Contact</li>
              <li>FAQ</li>
              <li>Service</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 text-center text-white/40 text-xs">
          2026 GrundMatch. All rights reserved. | Privacy Policy |
          Terms of Service
        </div>
      </div>
    </footer>
  );
}