"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Droplets, MessageSquare, LogIn } from "lucide-react";

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