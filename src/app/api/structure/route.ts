import { NextResponse } from "next/server";
import { getStructure } from "@/lib/vocab";

export async function GET() {
  const structure = await getStructure();
  return NextResponse.json(structure);
}
