"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSessionToken,
  loginLocked,
  recordLogin,
} from "@/studio/auth";

export type LoginState = { error?: string };

/** 접속자 식별: Vercel은 x-forwarded-for 첫 값(플랫폼이 설정), 로컬은 "local" */
async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const client = await clientKey();
  if (loginLocked(client)) return { error: "여러 번 틀려서 잠겼습니다. 1분 뒤 다시 시도해 주세요." };

  const ok = checkPassword(String(formData.get("password") ?? ""));
  recordLogin(client, ok);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // 대입 공격 지연
    return { error: "비밀번호가 맞지 않습니다." };
  }

  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/studio");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/studio");
}
