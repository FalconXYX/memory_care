"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, User, Upload, Save, X, Trash2 } from "lucide-react";
import Link from "next/link";

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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const router = useRouter();
  const params = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
      const file = e.target.files[0];
      setImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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

      // Redirect to person list page after successful submission
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 text-lg">Loading person data...</p>
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
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0">
          {/* Header Section */}
          <div className="bg-white/70 backdrop-blur-sm overflow-hidden shadow-xl rounded-2xl border border-blue-100 mb-6">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center space-x-4 mb-4">
                <Link
                  href="/person"
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-sm font-medium"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Persons
                </Link>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center">
                <User className="w-6 h-6 mr-3 text-blue-600" />
                {isEditMode ? "Edit Person" : "Add New Person"}
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                {isEditMode 
                  ? "Update the person's information below" 
                  : "Fill in the details to register a new person for face recognition"
                }
              </p>
            </div>
          </div>

          {/* Form Section */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-blue-100">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
                <div className="flex items-center">
                  <span className="text-red-500 mr-2">⚠️</span>
                  {error}
                </div>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Full Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-blue-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200"
                  placeholder="Enter the person's full name"
                  required
                />
              </div>
              
              <div>
                <label
                  htmlFor="relationship"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Relationship *
                </label>
                <input
                  id="relationship"
                  type="text"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full px-4 py-3 border border-blue-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200"
                  placeholder="e.g., Father, Mother, Friend, Caregiver"
                  required
                />
              </div>
              
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Description *
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 border border-blue-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200 resize-none"
                  rows={4}
                  placeholder="Describe this person, their role, or any important details to remember"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Photo {isEditMode ? "(Optional)" : "*"}
                </label>
                
                {/* Show current image if in edit mode and no new image selected */}
                {isEditMode && currentImageUrl && !imagePreview && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-sm text-slate-600 mb-3 font-medium">Current photo:</p>
                    <img
                      src={currentImageUrl}
                      alt="Current person image"
                      className="w-24 h-24 object-cover rounded-xl border-2 border-white shadow-md"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Upload a new photo to replace the current one
                    </p>
                  </div>
                )}

                {/* Show new image preview */}
                {imagePreview && (
                  <div className="mb-4 p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-slate-600 font-medium">New photo:</p>
                      <button
                        type="button"
                        onClick={removeAttachment}
                        className="inline-flex items-center px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs transition-colors duration-200"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </button>
                    </div>
                    <img
                      src={imagePreview}
                      alt="New person image"
                      className="w-24 h-24 object-cover rounded-xl border-2 border-white shadow-md"
                    />
                  </div>
                )}
                
                {/* Upload option */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full inline-flex items-center justify-center px-4 py-3 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-sm font-medium"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {imagePreview ? "Change Photo" : "Add a Photo"}
                  </button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageChange}
                    className="hidden"
                    required={!isEditMode && !image}
                  />
                </div>
                
                <p className="text-xs text-slate-500 mt-2">
                  Choose a clear photo showing the person's face for best recognition results. On mobile devices, you can take a photo directly or choose from your gallery.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => router.push("/person")}
                  className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-slate-300 rounded-xl shadow-sm text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-xl shadow-md text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSubmitting 
                    ? (isEditMode ? "Updating..." : "Adding...") 
                    : (isEditMode ? "Update Person" : "Add Person")
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}