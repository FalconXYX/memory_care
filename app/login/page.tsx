"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import ConsentModal from "@/components/consentModal";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Logged in successfully!");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-green-50">
      <div className="max-w-lg mx-auto">
        {/* Unified header, spaced and clean */}
        <div className="flex items-center justify-between gap-4 mb-10 px-4 sm:px-8 pt-8 sm:pt-14">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Memory Care Logo" className="w-16 h-16 object-contain" />
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent drop-shadow-lg">
              Memory Care
            </h1>
          </div>
          <Link
            href="/signup"
            className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white px-4 sm:px-6 py-2 rounded-xl text-base font-medium transition-all duration-200 shadow-md hover:shadow-lg"
          >
            Sign Up
          </Link>
        </div>
        <div className="px-6 sm:px-8">
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800
                      font-medium text-lg mb-6"
          >
            <span className="mr-2 text-xl">←</span>
            Back
          </Link>
          <h2 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-4 text-center drop-shadow-lg">
            Login
          </h2>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-3 border border-blue-100 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gradient-to-r from-blue-50 to-green-50 text-base"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1 block w-full px-4 py-3 border border-blue-100 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gradient-to-r from-blue-50 to-green-50 text-base"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-base font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
          {message && (
            <div
              className={`mt-4 p-3 rounded-xl text-base font-medium ${
                message.includes("error")
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
