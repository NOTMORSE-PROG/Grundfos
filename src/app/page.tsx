"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthModal } from "@/components/auth/AuthModal";
import { Button } from "@/components/ui/button";
import {
  Droplets,
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
  Settings,
  MessageSquare,
  ArrowRight,
  LogIn,
} from "lucide-react";

export default function LandingPage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Droplets className="w-6 h-6 text-grundfos-blue" />
          <span className="font-bold text-xl text-grundfos-dark">
            GrundMatch
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="border-grundfos-blue/30 text-grundfos-blue hover:bg-grundfos-light"
            onClick={() => setAuthModalOpen(true)}
          >
            <LogIn className="h-4 w-4 mr-1.5" />
            Sign In
          </Button>
          <Link href="/chat">
            <Button
              size="sm"
              className="bg-grundfos-blue hover:bg-grundfos-dark text-white"
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Try Now
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-grundfos-dark via-grundfos-blue to-grundfos-mid text-white py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6 text-center">
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
              className="border-white/40 text-white hover:bg-white/10 font-semibold px-8"
              onClick={() => setAuthModalOpen(true)}
            >
              <LogIn className="h-5 w-5 mr-2" />
              Sign Up / Log In
            </Button>
          </div>
        </div>
      </section>

      {/* Features Row */}
      <section className="py-16 bg-gray-50">
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
              className="bg-white rounded-xl p-6 text-center shadow-sm border border-gray-100"
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-grundfos-light flex items-center justify-center">
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

      {/* Product Categories */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="inline-block bg-grundfos-light text-grundfos-blue text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-4">
            Our Products
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-grundfos-dark mb-2">
            Comprehensive Pump Solutions
          </h2>
          <p className="text-muted-foreground text-sm mb-10">
            We have the right pump for every need.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Waves, label: "Water Supply" },
              { icon: Flame, label: "Heating Systems" },
              { icon: Trash2, label: "Waste Water" },
              { icon: Factory, label: "Industrial" },
              { icon: Trees, label: "Irrigation" },
              { icon: Bath, label: "Pool & Spa" },
              { icon: Pipette, label: "Dosing Pumps" },
              { icon: Settings, label: "Custom Solutions" },
            ].map((p) => (
              <div
                key={p.label}
                className="bg-grundfos-dark rounded-xl p-5 flex flex-col items-center gap-3 hover:bg-grundfos-blue transition-colors cursor-pointer"
              >
                <p.icon className="w-8 h-8 text-white" />
                <span className="text-white text-sm font-medium">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Excellence Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="inline-block bg-grundfos-light text-grundfos-blue text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-4">
            Why Choose GrundMatch
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-grundfos-dark mb-2">
            Excellence in Every Detail
          </h2>
          <p className="text-muted-foreground text-sm mb-10">
            We don&apos;t just sell pumps — we provide complete solutions backed
            by expertise and support.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {[
              {
                num: 1,
                title: "Expert Consultation",
                desc: "Our AI assistant and certified experts help you select the right pump for your specific needs, ensuring optimal performance and efficiency.",
              },
              {
                num: 2,
                title: "24/7 Support",
                desc: "Access our AI pump advisor anytime. Get instant answers to your questions and expert guidance when you need it.",
              },
              {
                num: 3,
                title: "Quality Assurance",
                desc: "Every Grundfos pump undergoes rigorous testing and quality control, guaranteeing reliability and long service life.",
              },
              {
                num: 4,
                title: "Sustainable Solutions",
                desc: "We help you find energy-efficient pumps that reduce costs and your environmental footprint.",
              },
            ].map((item) => (
              <div
                key={item.num}
                className="flex gap-4 bg-white rounded-xl p-5 shadow-sm border border-gray-100"
              >
                <div className="w-10 h-10 shrink-0 rounded-full bg-grundfos-blue text-white flex items-center justify-center font-bold text-sm">
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

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-grundfos-dark to-grundfos-blue text-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Ready to Find Your Perfect Pump?
          </h2>
          <p className="text-white/75 mb-8 text-sm md:text-base">
            Start a conversation with our AI advisor. No sign-up required — just
            describe your needs and get instant recommendations.
          </p>
          <Link href="/chat">
            <Button
              size="lg"
              className="bg-white text-grundfos-dark hover:bg-grundfos-light font-semibold px-8"
            >
              Get Started
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-grundfos-dark text-white py-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Droplets className="w-5 h-5" />
                <span className="font-bold">GRUNDFOS</span>
              </div>
              <p className="text-white/60 text-xs leading-relaxed">
                Pioneering pump solutions for a sustainable future. Trusted by
                millions worldwide.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Products</h4>
              <ul className="space-y-2 text-white/60 text-xs">
                <li>Heating</li>
                <li>Water Supply</li>
                <li>Waste Water</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-white/60 text-xs">
                <li>About</li>
                <li>Careers</li>
                <li>Sustainability</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Support</h4>
              <ul className="space-y-2 text-white/60 text-xs">
                <li>Contact</li>
                <li>FAQ</li>
                <li>Documentation</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 text-center text-white/40 text-xs">
            &copy; 2026 GrundMatch. All rights reserved. | Privacy Policy |
            Terms of Service
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
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
