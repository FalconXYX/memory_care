import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getS3PresignedUrl,
  uploadFileToS3,
  deleteFileFromS3,
} from "@/lib/supabase/s3";
import prisma from "@/lib/prisma";

// GET /api/persons/[personId]
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ personId: string }> }
) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { personId } = await context.params;

    const person = await prisma.person.findUnique({
      where: { id: personId, userId: authenticatedUser.id },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const presignedImageUrl = person.imageUrl
      ? await getS3PresignedUrl(person.imageUrl)
      : null;

    return NextResponse.json({
      ...person,
      imageUrl: presignedImageUrl,
    });
  } catch (error) {
    console.error("Error fetching person:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/persons/[personId]
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ personId: string }> }
) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { personId } = await context.params;

    // Ensure the user record exists to avoid FK issues
    await prisma.user.upsert({
      where: { id: authenticatedUser.id },
      update: {},
      create: {
        id: authenticatedUser.id,
        description: "New user profile",
      },
    });

    const existingPerson = await prisma.person.findUnique({
      where: { id: personId, userId: authenticatedUser.id },
    });

    if (!existingPerson) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const relationship = formData.get("relationship") as string;
    const imageFile = formData.get("image") as File | null;

    const updateData: Record<string, any> = {};

    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (relationship) updateData.relationship = relationship;

    if (imageFile) {
      if (existingPerson.imageUrl) {
        await deleteFileFromS3(existingPerson.imageUrl);
      }

      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const { key } = await uploadFileToS3(
        buffer,
        imageFile.name,
        imageFile.type
      );
      updateData.imageUrl = key;
    }

    const updatedPerson = await prisma.person.update({
      where: { id: personId },
      data: updateData,
    });

    const presignedImageUrl = updatedPerson.imageUrl
      ? await getS3PresignedUrl(updatedPerson.imageUrl)
      : null;

    return NextResponse.json({
      ...updatedPerson,
      imageUrl: presignedImageUrl,
    });
  } catch (error) {
    console.error("Error updating person:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/persons/[personId]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ personId: string }> }
) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { personId } = await context.params;

    const existingPerson = await prisma.person.findUnique({
      where: { id: personId, userId: authenticatedUser.id },
    });

    if (!existingPerson) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    if (existingPerson.imageUrl) {
      await deleteFileFromS3(existingPerson.imageUrl);
    }

    await prisma.person.delete({
      where: { id: personId },
    });

    return NextResponse.json({ message: "Person deleted successfully" });
  } catch (error) {
    console.error("Error deleting person:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}