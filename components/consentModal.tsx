"use client";
import React from "react";

interface ConsentModalProps {
  onAccept: () => void;
}

export default function ConsentModal({ onAccept }: ConsentModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="max-w-md bg-white rounded-2xl p-6 text-left shadow-lg">
        <h2 className="text-2xl font-bold mb-4">Consent to Use Memory-Care</h2>
        
        <p className="mb-4 text-gray-700">
          Memory-Care is designed to help you or your loved one recognize familiar faces and recall shared memories. To provide this service, the app needs to:
        </p>
        
        <ul className="list-disc list-inside mb-4 text-gray-700 space-y-2">
          <li><strong>Access your device’s camera</strong> for real-time face detection and recognition.</li>
          <li><strong>Store encrypted face templates</strong> and personalized memory notes (names, relationships, moments) in a secure database.</li>
          <li><strong>Play brief audio prompts</strong> when a known face is detected, to gently remind the user who they’re seeing.</li>
        </ul>
        
        <p className="mb-4 text-gray-700">
          All collected data (face embeddings, names, context) is encrypted at rest and used solely within this app—never shared with third parties. You may withdraw consent at any time in the app settings; doing so will delete all stored face data and memories.
        </p>
        
        <div className="mb-6 text-gray-700">
          <a href="/privacy" className="underline">Privacy Policy</a> •{" "}
          <a href="/terms" className="underline">Terms of Service</a>
        </div>
        
        <div className="flex justify-end gap-4">
          <button
            onClick={() => window.location.href = "/"}
            className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
          >
            Cancel and Exit
          </button>
          <button
            onClick={onAccept}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold hover:from-indigo-700 hover:to-blue-700 transition"
          >
            I Understand and Accept
          </button>
        </div>
      </div>
    </div>
  );
}
