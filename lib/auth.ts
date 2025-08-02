import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase/server"; 
/**
 * A helper function to authenticate a request on the server.
 * It uses the standard server client to get the user from the session.
 *
 * @returns {Promise<User | null>} 
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = createSupabaseServerClient();

  try {
    // Get the user from the session
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // If we have a user, return it. Otherwise, this will be null.
    return user;
  } catch (e) {
    // An unexpected error occurred
    console.error("Error getting authenticated user:", e);
    return null;
  }
}