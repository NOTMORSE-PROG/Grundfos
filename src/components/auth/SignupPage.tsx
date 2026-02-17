"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Droplets, Chrome, Eye, EyeOff } from "lucide-react";

export default function SignUpPage() {
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        setTimeout(() => {
            setLoading(false);
            alert("Account created!");
        }, 1500);
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f9fafb] px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6">

                <div className="flex flex-col items-center text-center space-y-2">
                    <Droplets className="w-10 h-10 text-grundfos-blue" />
                    <h1 className="text-xl font-semibold text-gray-900">
                        GrundMatch: Your Pump Companion
                    </h1>
                    <p className="text-l font-semibold text-gray-500 brightness-50">
                        Create an account to get started with GrundMatch.
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex-1 border-t border-gray-300"></div>
                    <span className="text-sm text-gray-500">Sign up with</span>
                    <div className="flex-1 border-t border-gray-300"></div>
                </div>

                <div className="space-y-3">
                    <Button
                        variant="outline"
                        className="w-full flex items-center justify-center gap-2 py-6 border-gray-300 hover:bg-gray-50 transition-colors"
                        onClick={() => console.log("Google login logic here")}
                    >
                        <Chrome className="w-5 h-5 text-[#4285F4]" />
                        <span className="text-gray-700 font-medium">Google Account</span>
                    </Button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex-1 border-t border-gray-300"></div>
                    <span className="text-sm text-gray-500">Or continue with</span>
                    <div className="flex-1 border-t border-gray-300"></div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            Email
                        </label>
                        <input
                            type="email"
                            required
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-grundfos-blue focus:border-transparent"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                className="w-full px-4 py-2 pr-12 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-grundfos-blue focus:border-transparent"
                                placeholder="••••••••"
                            />

                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-grundfos-blue hover:bg-grundfos-dark text-white"
                    >
                        {loading ? "Creating account..." : "Sign Up"}
                    </Button>
                </form>

                <p className="text-xs text-center text-gray-500 opacity-70">
                    By signing up, you agree to our{" "}
                    <Link href="/terms" className="text-grundfos-blue font-medium hover:underline">
                        Terms & Conditions
                    </Link> and <br />
                    <Link href="/privacy" className="text-grundfos-blue font-medium hover:underline">
                        Privacy Policy
                    </Link>
                </p>

                <div className="flex items-center gap-4">
                    <div className="flex-1 border-t border-gray-300"></div>
                    <span className="text-sm text-gray-500">Already have an account? <Link
                        href="/login"
                        className="text-grundfos-blue font-medium hover:underline"
                    >
                        Sign in
                    </Link></span>
                    <div className="flex-1 border-t border-gray-300"></div>
                </div>
            </div>
        </div >
    )
}