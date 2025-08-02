"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

interface Person {
  id: string;
  name: string;
  description: string;
  relationship: string;
  imageUrl?: string;
}

export default function PersonFormPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [relationship, setRelationship] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const params = useParams();
  
  // Determine if we're in edit mode
  const personId = params?.personId as string | undefined;
  const isEditMode = Boolean(personId);

  // Fetch person data if in edit mode
  useEffect(() => {
    if (isEditMode && personId) {
      const fetchPerson = async () => {
        setIsLoading(true);
        try {
          const response = await fetch(`/api/persons/${personId}`);
          if (!response.ok) {
            throw new Error("Failed to fetch person data");
          }
          const person: Person = await response.json();
          
          // Pre-populate form fields
          setName(person.name);
          setDescription(person.description);
          setRelationship(person.relationship);
          setCurrentImageUrl(person.imageUrl || null);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      };

      fetchPerson();
    }
  }, [isEditMode, personId]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Validation
    if (!name || !description || !relationship) {
      setError("Name, description, and relationship are required.");
      setIsSubmitting(false);
      return;
    }

    // For new person, image is required. For edit, it's optional
    if (!isEditMode && !image) {
      setError("Image is required when creating a new person.");
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("relationship", relationship);
    
    // Only append image if one was selected
    if (image) {
      formData.append("image", image);
    }

    try {
      const url = isEditMode ? `/api/persons/${personId}` : "/api/persons";
      const method = isEditMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${isEditMode ? 'update' : 'create'} person`);
      }

      // Redirect to home page after successful submission
      router.push("/person");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state when fetching person data in edit mode
  if (isEditMode && isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
        <p>Loading person data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center mb-6">
          {isEditMode ? "Edit Person" : "Add a New Person"}
        </h1>
        
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700"
            >
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
              required
            />
          </div>
          
          <div>
            <label
              htmlFor="relationship"
              className="block text-sm font-medium text-gray-700"
            >
              Relationship
            </label>
            <input
              id="relationship"
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          
          <div>
            <label
              htmlFor="image"
              className="block text-sm font-medium text-gray-700"
            >
              Image {isEditMode ? "(Optional - leave empty to keep current image)" : ""}
            </label>
            
            {/* Show current image if in edit mode */}
            {isEditMode && currentImageUrl && (
              <div className="mt-2 mb-2">
                <p className="text-sm text-gray-600 mb-2">Current image:</p>
                <img
                  src={currentImageUrl}
                  alt="Current person image"
                  className="w-24 h-24 object-cover rounded-md border"
                />
              </div>
            )}
            
            <input
              id="image"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
              required={!isEditMode} // Only required for new persons
            />
          </div>
          
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
            >
              {isSubmitting 
                ? (isEditMode ? "Updating..." : "Adding...") 
                : (isEditMode ? "Update Person" : "Add Person")
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}