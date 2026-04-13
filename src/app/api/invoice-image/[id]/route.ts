import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { auth } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  try {
    const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
    const fatura = (page.properties as Record<string, unknown>)["Fatura"] as {
      files?: Array<{ type: string; file?: { url: string }; external?: { url: string } }>;
    };

    const file = fatura?.files?.[0];
    const url = file?.file?.url ?? file?.external?.url;

    if (!url) return new NextResponse("No file", { status: 404 });

    // Redirect to the fresh signed URL
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
