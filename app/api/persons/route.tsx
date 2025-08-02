import { NextRequest, NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { getS3PresignedUrl } from "@/lib/supabase/s3";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
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
    console.error("Error fetching persons:", error);
    return NextResponse.json(
      { error: "Failed to fetch persons" },
      { status: 500 }
    );
  }
}