import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Not signed in" } }, { status: 401 });
  }
  const secret = process.env.API_JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: { code: "misconfigured", message: "API_JWT_SECRET is not set" } }, { status: 500 });
  }
  const u = session.user;
  const expSeconds = Math.floor(Date.now() / 1000) + 3600;
  const token = await new SignJWT({
    login: u.login,
    name: u.name ?? null,
    email: u.email ?? null,
    picture: u.image ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.githubId)
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .sign(new TextEncoder().encode(secret));
  return NextResponse.json({ token, expiresAt: expSeconds * 1000 });
}
