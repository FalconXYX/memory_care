"use client";
import React from "react";

interface ConsentModalProps {
  onAccept: () => void;
}

export default function ConsentModal({ onAccept }: ConsentModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl">
        {/* Title */}
        <h2 className="text-3xl font-extrabold text-black mb-6 text-center">
          Consent to Use Memory Care
        </h2>

        {/* Guardian Notice */}
        <p className="mb-6 text-gray-700 font-medium text-center">
          If you’re consenting on behalf of someone with dementia or other cognitive impairments, please ensure a guardian or caregiver has reviewed and agreed to these terms.
        </p>

        {/* Description */}
        <p className="mb-4 text-gray-600">
          Memory Care helps you recognize familiar faces and recall shared memories. To provide this service, the app will:
        </p>

        {/* Benefits List */}
        <ul className="list-disc list-inside mb-6 space-y-2 text-gray-600">
          <li><strong>Access your device’s camera</strong> for real-time face detection.</li>
          <li><strong>Store encrypted face templates</strong> and personalized memory notes securely.</li>
          <li><strong>Play brief audio prompts</strong> to gently remind you who you’re seeing.</li>
        </ul>

        {/* Privacy Note */}
        <p className="mb-6 text-gray-600">
          All collected data is encrypted at rest and used solely within this app—never shared with third parties. You may withdraw consent at any time; doing so will delete all stored face data and memories.
        </p>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4">
          <button
            onClick={() => window.location.href = "/"}
            className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-green-600 text-white font-semibold hover:from-blue-700 hover:to-green-700 transition"
          >
            I Understand and Accept
          </button>
        </div>
      </div>
    </div>
  );
}
