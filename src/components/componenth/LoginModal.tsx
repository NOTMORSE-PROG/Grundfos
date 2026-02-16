"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Droplets, Chrome, X } from "lucide-react";

export default function ModalPage() {
    const [showModal, setShowModal] = useState(true);
    const [loading, setLoading] = useState(false);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        setTimeout(() => {
            setLoading(false);
            alert("Successfully logged in!");
            setShowModal(false);
        }, 1500);
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f9fafb] px-4">
            {showModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 transition-all"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6 relative animate-in fade-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setShowModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex flex-col items-center text-center space-y-2">
                            <Droplets className="w-10 h-10 text-grundfos-blue" />
                            <h1 className="text-3xl font-semibold text-gray-900">
                                Login to GrundMatch
                            </h1>
                            <p className="text-l font-semibold text-gray-500 brightness-50">
                                Get better and faster response
                            </p>
                        </div>

                        <div className="space-y-3">
                            <Button
                                variant="outline"
                                className="w-full flex items-center justify-center gap-2 py-6 border-gray-300 hover:bg-gray-50 transition-colors"
                                onClick={() => console.log("Google login logic here")}
                            >
                                <Chrome className="w-5 h-5 text-[#4285F4]" />
                                <span className="text-gray-700 font-medium">Continue with Google Account</span>
                            </Button>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex-1 border-t border-gray-300"></div>
                            <span className="text-sm text-gray-500">OR</span>
                            <div className="flex-1 border-t border-gray-300"></div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <input
                                    type="email"
                                    required
                                    className="w-full px-4 py-3 rounded-2xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-grundfos-blue focus:border-transparent"
                                    placeholder="Email Address"
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full px-4 py-6 rounded-2xl bg-grundfos-blue hover:bg-grundfos-dark text-white"
                            >
                                {loading ? "Logging in..." : "Continue"}
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}