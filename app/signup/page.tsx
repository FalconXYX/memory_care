"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email for the confirmation link!");
    }
    setLoading(false);
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-green-50">
      <div className="max-w-lg mx-auto">
        {/* Header, matching login page */}
        <div className="flex items-center justify-between gap-4 mb-10 px-4 sm:px-8 pt-8 sm:pt-14">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Memory Care Logo" className="w-16 h-16 object-contain" />
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent drop-shadow-lg">
              Memory Care
            </h1>
          </div>
          <Link
            href="/login"
            className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white px-4 sm:px-6 py-2 rounded-xl text-base font-medium transition-all duration-200 shadow-md hover:shadow-lg"
          >
            Login
          </Link>
        </div>
        <div className="px-6 py-8 sm:px-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-4 text-center drop-shadow-lg">
            Sign Up
          </h2>
          <button
            onClick={handleGoogleSignUp}
            disabled={loading}
            className="w-full flex justify-center items-center py-3 px-4 border border-blue-100 rounded-xl shadow-md bg-gradient-to-r from-white to-blue-50 text-base font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 mb-4 transition-all"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? "Signing up..." : "Sign up with Google"}
          </button>
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-blue-200" />
            </div>
            <div className="relative flex justify-center text-base">
              <span className="px-2 bg-gradient-to-r from-blue-50 to-green-50 text-blue-500">
                Or continue with email
              </span>
            </div>
          </div>
          <form onSubmit={handleSignUp} className="space-y-5">
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
              {loading ? "Creating account..." : "Create account with Email"}
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
