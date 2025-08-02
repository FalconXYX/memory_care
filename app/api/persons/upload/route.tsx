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
    await prisma.$executeRaw`
      INSERT INTO "User" (id, description) 
      VALUES (${authenticatedUser.id}::uuid, 'New user profile')
      ON CONFLICT (id) DO NOTHING
    `;

        // Create person record with UUID casting
    const result = await prisma.$executeRaw`
      INSERT INTO "Person" (name, "imageKey", "userId")
      VALUES (${name}, ${key}, ${authenticatedUser.id}::uuid)
    `;

    return NextResponse.json({ name, imageKey: key, userId: authenticatedUser.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating person:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
