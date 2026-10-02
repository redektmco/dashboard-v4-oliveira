"use client";

import { useTransition } from "react";
import { testDispatchNow } from "@/actions/billing";
import { toast } from "../toast";
import { Icon } from "../icon";

/** Roda o disparo do dia na hora — o mesmo job do cron da meia-noite. */
export function TestDispatchButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const r = await testDispatchNow();
          if (r?.error) toast(r.error, { tone: "error" });
          else if (r?.ok) toast(r.ok);
        })
      }
    >
      {pending ? <span className="spinner" aria-hidden /> : <Icon name="send" size={16} />}
      Testar disparo
    </button>
  );
}
