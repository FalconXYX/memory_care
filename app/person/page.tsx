"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Person {
  id: string;
  name: string;
  description: string;
  relationship: string;
  presignedImageUrl?: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface PersonsResponse {
  data: Person[];
  pagination: PaginationInfo;
}

export default function PersonListPage() {
  const { user, signOut } = useAuth();
  const [persons, setPersons] = useState<Person[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchPersons = async (page: number = 1) => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null); // Clear previous errors
      const response = await fetch(
        `/api/persons?userId=${user.id}&page=${page}&limit=${itemsPerPage}`
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }
      const data: PersonsResponse = await response.json();
      setPersons(data.data);
      setPagination(data.pagination);
      setCurrentPage(data.pagination.currentPage);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPersons(currentPage);
  }, [user, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (pagination?.totalPages || 1)) {
      setCurrentPage(newPage);
    }
  };

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

      // Refresh the current page
      await fetchPersons(currentPage);
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

  const renderPaginationControls = () => {
    if (!pagination || pagination.totalPages <= 1) return null;

    const { currentPage, totalPages, hasNextPage, hasPrevPage } = pagination;
    const pageNumbers = [];

    // Calculate which page numbers to show
    const maxVisiblePages = 3;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust start page if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return (
      <div className="flex flex-col items-center justify-center mt-6 px-4 py-3 bg-white/50 rounded-xl">
        <div className="text-sm text-slate-600 mb-4">
          <span>
            Showing{" "}
            <span className="font-medium">
              {Math.min(
                (currentPage - 1) * itemsPerPage + 1,
                pagination.totalItems
              )}
              -{Math.min(currentPage * itemsPerPage, pagination.totalItems)}
            </span>{" "}
            of <span className="font-medium">{pagination.totalItems}</span>{" "}
            results
          </span>
        </div>

        <nav className="flex items-center space-x-2">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!hasPrevPage}
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              hasPrevPage
                ? "text-slate-700 bg-white hover:bg-slate-50 border border-slate-300"
                : "text-slate-400 bg-slate-100 cursor-not-allowed"
            }`}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </button>

          <div className="flex items-center space-x-1">
            {startPage > 1 && (
              <>
                <button
                  onClick={() => handlePageChange(1)}
                  className="px-3 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors"
                >
                  1
                </button>
                {startPage > 2 && (
                  <span className="px-2 text-slate-400">...</span>
                )}
              </>
            )}

            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                onClick={() => handlePageChange(pageNumber)}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pageNumber === currentPage
                    ? "text-white bg-gradient-to-r from-blue-500 to-green-500"
                    : "text-slate-700 bg-white hover:bg-slate-50 border border-slate-300"
                }`}
              >
                {pageNumber}
              </button>
            ))}

            {endPage < totalPages && (
              <>
                {endPage < totalPages - 1 && (
                  <span className="px-2 text-slate-400">...</span>
                )}
                <button
                  onClick={() => handlePageChange(totalPages)}
                  className="px-3 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors"
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!hasNextPage}
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              hasNextPage
                ? "text-slate-700 bg-white hover:bg-slate-50 border border-slate-300"
                : "text-slate-400 bg-slate-100 cursor-not-allowed"
            }`}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </nav>
      </div>
    );
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
                      Registered Persons
                    </h2>
                    <p className="text-slate-600 text-sm mt-1">
                      Manage your registered individuals for face recognition
                      {pagination && (
                        <span className="ml-2 font-medium">
                          ({pagination.totalItems} total)
                        </span>
                      )}
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
                  {pagination?.totalItems === 0
                    ? "No persons registered yet"
                    : "No persons found on this page"}
                </h3>
                <p className="text-slate-500 mb-6">
                  {pagination?.totalItems === 0
                    ? "Start by adding your first person to enable face recognition."
                    : "Try going to a different page or adding a new person."}
                </p>
                <Link
                  href="/person/new"
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  {pagination?.totalItems === 0
                    ? "Add Your First Person"
                    : "Add New Person"}
                </Link>
              </div>
            ) : (
              <>
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
                {renderPaginationControls()}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
