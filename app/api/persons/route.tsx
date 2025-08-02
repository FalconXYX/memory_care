import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getS3PresignedUrl } from "../../../lib/supabase/s3";
import { getAuthenticatedUser } from "../../../lib/auth"; // Import authentication helper

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    // Authenticate the user first
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // Ensure the authenticated user is requesting their own data
    if (!userId || userId !== authenticatedUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const persons = await prisma.person.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Generate signed URLs without overwriting the original imageUrl key
    const personsWithPresignedUrls = await Promise.all(
      persons.map(async (person: { imageUrl: string; }) => {
        let presignedImageUrl = null;
        // Check if an image key exists before generating a URL
        if (person.imageUrl) {
          presignedImageUrl = await getS3PresignedUrl(person.imageUrl);
        }

        // Return all original person data, plus the new presigned URL
        return {
          ...person,
          presignedImageUrl: presignedImageUrl,
        };
      })
    );

    return NextResponse.json(personsWithPresignedUrls);
  } catch (error) {
    console.error("Error fetching persons:", error); // Detailed logging
    return NextResponse.json(
      { error: "Failed to fetch persons", details: (error as Error).message },
      { status: 500 }
    );
  }
}