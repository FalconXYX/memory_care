import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getS3PresignedUrl,
  uploadFileToS3,
  deleteFileFromS3,
} from "@/lib/supabase/s3";

// GET handler to fetch a person's details
export async function GET(
  req: Request,
  context: { params: { personId: string } } 
) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const personId = context.params.personId;
    const person = await prisma.person.findUnique({
      where: { id: personId, userId: authenticatedUser.id },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Generate presigned URL for the image if it exists
    let presignedImageUrl = null;
    if (person.imageUrl) {
      presignedImageUrl = await getS3PresignedUrl(person.imageUrl);
    }

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

// PUT handler for multipart/form-data
export async function PUT(
  request: Request,
  context: { params: { personId: string } }
) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const personId = context.params.personId;
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

    const updateData: {
      name: string;
      description: string;
      relationship: string;
      imageUrl?: string;
    } = { name, description, relationship };

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

    return NextResponse.json(updatedPerson);
  } catch (error) {
    console.error("Error updating person:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE handler to remove person and image
export async function DELETE(
  request: Request,
  context: { params: { personId: string } }
) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const personId = context.params.personId;
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
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
