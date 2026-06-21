import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";

// Chave PÚBLICA VAPID (não é segredo — pode ficar no código do app).
const VAPID_PUBLIC_KEY =
  "BIc18si8J2DVPsWOOfvNwvnbW62Ni3woj-QCncUZtlfyLKy0Xz2KzlmKWEZv5DlemIsVI5dItSsGb9Q74jnn9XU";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Support = { ok: true } | { ok: false; reason: string };

function checkSupport(): Support {
  if (typeof window === "undefined") return { ok: false, reason: "" };
  const hasSW = "serviceWorker" in navigator;
  const hasPush = "PushManager" in window;
  const hasNotif = "Notification" in window;
  if (!hasSW || !hasPush || !hasNotif) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isIOS && !isStandalone) {
      return {
        ok: false,
        reason:
          "No iPhone/iPad, primeiro instale o app na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por ali.",
      };
    }
    return { ok: false, reason: "Este navegador não suporta notificações push." };
  }
  return { ok: true };
}

export function NotificationsCard() {
  const { activeMembership } = useCurrentUser();
  const orgId = (activeMembership as { org_id?: string } | null | undefined)?.org_id ?? null;

  const [support] = useState<Support>(() => checkSupport());
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!support.ok) {
        setChecking(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (active) setSubscribed(!!sub);
      } catch {
        /* ignora */
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [support]);

  async function enable() {
    if (!support.ok) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        if (perm === "denied") {
          toast.error("Permissão negada", {
            description: "Libere as notificações para este site nas configurações do navegador.",
          });
        }
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
      });
      const asJson = sub.toJSON();
      const { data, error } = await supabase.functions.invoke("push-subscribe", {
        body: {
          action: "save",
          subscription: { endpoint: sub.endpoint, keys: asJson.keys },
          orgId,
          userAgent: navigator.userAgent,
        },
      });
      if (error || !data?.ok) {
        toast.error("Não foi possível ativar", { description: data?.error ?? error?.message });
        setBusy(false);
        return;
      }
      setSubscribed(true);
      toast.success("Notificações ativadas neste aparelho");
    } catch (e) {
      toast.error("Não foi possível ativar", { description: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        await supabase.functions.invoke("push-subscribe", { body: { action: "remove", endpoint } });
      }
      setSubscribed(false);
      toast.success("Notificações desativadas neste aparelho");
    } catch (e) {
      toast.error("Não foi possível desativar", { description: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-blue/10 text-brand-blue">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Notificações push</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Receba um aviso quando chegar mensagem nova, mesmo com o ConectaChat fechado. A ativação é por aparelho.
          </p>

          {!support.ok ? (
            <p className="mt-3 text-sm text-muted-foreground">{support.reason}</p>
          ) : checking ? (
            <p className="mt-3 text-sm text-muted-foreground">Verificando…</p>
          ) : subscribed ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                <Bell className="h-4 w-4" /> Ativadas neste aparelho
              </span>
              <Button variant="outline" size="sm" onClick={disable} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BellOff className="mr-1 h-4 w-4" />}
                Desativar
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <Button onClick={enable} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Bell className="mr-1 h-4 w-4" />}
                Ativar notificações neste aparelho
              </Button>
              {permission === "denied" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  As notificações estão bloqueadas para este site no navegador. Libere nas configurações do site para ativar.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}