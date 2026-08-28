"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/actions/auth";
import { Icon } from "./icon";

export function LoginForm({ de }: { de?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      {de ? <input type="hidden" name="de" value={de} /> : null}

      <label className="block">
        <span className="label">Usuário</span>
        <input
          name="login"
          autoComplete="username"
          autoFocus
          required
          placeholder="felipe"
          className="field mt-1"
        />
      </label>

      <label className="block">
        <span className="label">Senha</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="field mt-1"
        />
      </label>

      {state.erro ? (
        <p className="flex items-center gap-2 rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">
          <Icon name="alert" size={14} />
          {state.erro}
        </p>
      ) : null}

      <button className="btn btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
