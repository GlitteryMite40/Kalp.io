import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      message: "pong",
      timestamp: new Date().toISOString(),
      service: "kalp-io-backend",
    },
    { status: 200 },
  );
}
