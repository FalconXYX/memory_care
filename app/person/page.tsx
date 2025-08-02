"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { ArrowLeft, Plus, Edit, Trash2, User } from "lucide-react";

interface Person {
  id: string;
  name: string;
  description: string;
  relationship: string;
  presignedImageUrl?: string;
}

export default function PersonListPage() {
  const { user, signOut } = useAuth();
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPersons = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/persons?userId=${user.id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch persons");
        }
        const data = await response.json();
        setPersons(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPersons();
  }, [user]);

  const handleDelete = async (personId: string, personName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${personName}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingIds((prev) => new Set([...prev, personId]));

    try {
      const response = await fetch(`/api/persons/${personId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete person");
      }

      setPersons((prev) => prev.filter((person) => person.id !== personId));
    } catch (err: any) {
      console.error("Error deleting person:", err);
      setError(`Failed to delete ${personName}: ${err.message}`);
    } finally {
      setDeletingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(personId);
        return newSet;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 text-lg">Loading persons...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 sm:h-20">
            <div className="flex items-center">
              <div className="flex items-center space-x-3">
                <img
                  src="/logo.png"
                  alt="Memory Care Logo"
                  className="w-16 h-16 object-contain"
                />
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                  Memory Care
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              {user && (
                <>
                  <span className="hidden sm:block text-slate-600 text-sm">
                    Welcome, {user.email}
                  </span>
                  <button
                    onClick={signOut}
                    className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
          {/* Header Section */}
          <div className="bg-white/70 backdrop-blur-sm overflow-hidden shadow-xl rounded-2xl border border-blue-100">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <Link
                    href="/"
                    className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-sm font-medium"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Home
                  </Link>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center">
                      <User className="w-6 h-6 mr-3 text-blue-600" />
                      Memories{" "}
                    </h2>
                    <p className="text-slate-600 text-sm mt-1">
                      Manage your memories for face recognition
                    </p>
                  </div>
                </div>
                <Link
                  href="/person/new"
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-sm font-medium"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Person
                </Link>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded-lg text-sm">
              <div className="flex items-center">
                <span className="text-red-500 mr-2">⚠️</span>
                {error}
              </div>
            </div>
          )}

          {/* Content Section */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 border border-blue-100">
            {persons.length === 0 ? (
              <div className="text-center py-12">
                <User className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">
                  No Memories registered yet
                </h3>
                <p className="text-slate-500 mb-6">
                  Start by adding your first person to enable face recognition.
                </p>
                <Link
                  href="/person/new"
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add Your First Person
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-6 text-center">
                  <p className="text-slate-600">
                    <span className="font-semibold text-blue-600">
                      {persons.length}
                    </span>{" "}
                    {persons.length === 1 ? "person" : "persons"} registered
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {persons.map((person) => (
                    <div
                      key={person.id}
                      className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden border border-blue-100 hover:shadow-xl transition-all duration-200 hover:scale-105"
                    >
                      {person.presignedImageUrl ? (
                        <div className="relative">
                          <img
                            src={person.presignedImageUrl}
                            alt={`Image of ${person.name}`}
                            className="w-full h-48 object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-gradient-to-br from-blue-100 to-green-100 flex items-center justify-center">
                          <User className="w-16 h-16 text-slate-400" />
                        </div>
                      )}

                      <div className="p-4">
                        <h3 className="text-lg font-semibold text-slate-800 mb-1">
                          {person.name}
                        </h3>
                        <p className="text-blue-600 font-medium text-sm mb-2">
                          {person.relationship}
                        </p>
                        <p className="text-slate-600 text-sm line-clamp-2 mb-4">
                          {person.description}
                        </p>

                        <div className="flex gap-2">
                          <Link
                            href={`/person/${person.id}/edit`}
                            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-sm font-medium"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(person.id, person.name)}
                            disabled={deletingIds.has(person.id)}
                            className={`flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                              deletingIds.has(person.id)
                                ? "bg-gray-400 text-gray-700 cursor-not-allowed"
                                : "bg-red-500 hover:bg-red-600 text-white"
                            }`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            {deletingIds.has(person.id)
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
