import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getAuthenticatedUser } from "../../../../lib/auth";
import { uploadFileToS3 } from "../../../../lib/supabase/s3";

const prisma = new PrismaClient();

export async function POST(request: Request) {
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

    // Ensure a user record exists before creating a person.
    // This prevents foreign key constraint errors.
    await prisma.user.upsert({
      where: { id: authenticatedUser.id },
      update: {},
      create: {
        id: authenticatedUser.id,
        description: "New user profile", // Provide a default description
      },
    });

    // Create a new person in the database
    const newPerson = await prisma.person.create({
      data: {
        name,
        description,
        relationship,
        imageUrl: key, // Save the S3 key
        userId: authenticatedUser.id,
      },
    });

    return NextResponse.json(newPerson, { status: 201 });
  } catch (error) {
    console.error("Error creating person:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
