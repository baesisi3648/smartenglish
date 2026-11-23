"use client";

import { useActionState } from "react";
import Image from "next/image";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form
      action={action}
      className="w-full max-w-sm rounded-3xl border-2 border-hb-navy bg-white p-8 shadow-[6px_6px_0_var(--hb-blue)]"
    >
      <div className="flex items-end justify-center gap-3">
        <Image src="/brand/boy.png" width={48} height={97} alt="" aria-hidden />
        <Image src="/brand/girl.png" width={45} height={96} alt="" aria-hidden />
      </div>
      <h1 className="mt-4 text-center font-display text-2xl text-hb-navy">스튜디오</h1>
      <p className="mt-1 text-center text-sm text-ink-soft">관리자 비밀번호를 입력해 주세요</p>
      <label className="mt-6 block text-sm font-bold">
        비밀번호
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
        />
      </label>
      {state.error && <p className="mt-3 text-sm font-bold text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="mt-5 w-full rounded-full bg-hb-navy py-3 font-extrabold text-white disabled:opacity-60"
      >
        {pending ? "확인 중…" : "들어가기"}
      </button>
    </form>
  );
}
