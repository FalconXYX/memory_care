import { NextRequest, NextResponse } from "next/server";
import { getS3PresignedUrl } from "@/lib/supabase/s3";
import { getAuthenticatedUser } from "@/lib/auth";
import { uploadFileToS3 } from "@/lib/supabase/s3";
import prisma from "@/lib/prisma"; // Replaces direct PrismaClient usage

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const persons = await prisma.person.findMany({
      where: { userId: authenticatedUser.id },
      orderBy: { createdAt: "desc" },
    });

    const personsWithPresignedUrls = await Promise.all(
      persons.map(async (person) => {
        const presignedImageUrl = person.imageUrl
          ? await getS3PresignedUrl(person.imageUrl)
          : null;

        return {
          ...person,
          presignedImageUrl,
        };
      })
    );

    return NextResponse.json(personsWithPresignedUrls);
  } catch (error) {
    console.error("Error fetching persons:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch persons",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}


export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const relationship = formData.get("relationship") as string;
    const imageFile = formData.get("image") as File | null;

    if (!name || !description || !relationship || !imageFile) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Upload image to S3
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const { key } = await uploadFileToS3(
      buffer,
      imageFile.name,
      imageFile.type
    );

    // Ensure user record exists to satisfy foreign key
    await prisma.user.upsert({
      where: { id: authenticatedUser.id },
      update: {},
      create: {
        id: authenticatedUser.id,
        description: "New user profile",
      },
    });

    const person = await prisma.person.create({
      data: {
        name,
        description,
        relationship,
        imageUrl: key,
        userId: authenticatedUser.id,
      },
    });

    const presignedImageUrl = await getS3PresignedUrl(person.imageUrl);

    return NextResponse.json(
      {
        ...person,
        presignedImageUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating person:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}