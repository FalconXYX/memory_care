"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext"; // Assuming you have this context
import Link from "next/link";

interface Person {
  id: string;
  name: string;
  description: string;
  relationship: string;
  presignedImageUrl?: string; // The temporary URL for the image
}

export default function PersonListPage() {
  const { user } = useAuth();
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Registered Persons</h1>
        <Link href="/person/new" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
          Add New Person
        </Link>
      </div>

      {persons.length === 0 ? (
        <p>No persons registered yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {persons.map((person) => (
            <div
              key={person.id}
              className="bg-white rounded-lg shadow-md overflow-hidden"
            >
              {person.presignedImageUrl && (
                <img
                  src={person.presignedImageUrl}
                  alt={`Image of ${person.name}`}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-4">
                <h2 className="text-xl font-semibold">{person.name}</h2>
                <p className="text-gray-600">{person.relationship}</p>
                <p className="text-gray-800 mt-2">{person.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
