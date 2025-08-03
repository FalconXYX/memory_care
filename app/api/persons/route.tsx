import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { uploadFileToS3, getS3PresignedUrl } from "@/lib/supabase/s3";
import prisma from "@/lib/prisma";

// GET /api/persons
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

    const enrichedPersons = await Promise.all(
      persons.map(async (person: { imageUrl: string }) => ({
        ...person,
        presignedImageUrl: person.imageUrl
          ? await getS3PresignedUrl(person.imageUrl)
          : null,
      }))
    );

    return NextResponse.json(enrichedPersons);
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

// POST /api/persons
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

    // Upload the image to S3
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const { key } = await uploadFileToS3(
      buffer,
      imageFile.name,
      imageFile.type
    );

    // Ensure the User record exists (for foreign key constraint)
    await prisma.user.upsert({
      where: { id: authenticatedUser.id },
      update: {},
      create: {
        id: authenticatedUser.id,
        description: "New user profile",
      },
    });

    const newPerson = await prisma.person.create({
      data: {
        name,
        description,
        relationship,
        imageUrl: key,
        userId: authenticatedUser.id,
      },
    });

    const presignedImageUrl = await getS3PresignedUrl(newPerson.imageUrl);

    return NextResponse.json(
      {
        ...newPerson,
        presignedImageUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating person:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
