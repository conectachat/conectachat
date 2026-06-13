import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useConversations, type ConversationListItem } from "@/hooks/use-conversations";

// Título base da aba. Quando houver não lidas, vira "(3) ConectaChat".
const BASE_TITLE = "ConectaChat";

function formatPhone(id?: string | null) {
  if (!id) return null;
  return "+" + String(id).replace(/\D/g, "");
}

function nameOf(contact: ConversationListItem["contact"]) {
  if (contact?.name && contact.name.trim()) return contact.name;
  return formatPhone(contact?.external_id) ?? "Contato";
}

type InboundRow = {
  direction?: string;
  conversation_id?: string;
  content?: string | null;
  content_type?: string | null;
};

// Texto curto da notificação a partir do tipo da mensagem.
function previewOf(row: InboundRow) {
  if (row.content && row.content.trim()) return row.content;
  const map: Record<string, string> = {
    audio: "🎵 Áudio",
    image: "📷 Imagem",
    video: "🎥 Vídeo",
    document: "📄 Documento",
    location: "📍 Localização",
    sticker: "Figurinha",
  };
  return map[row.content_type ?? ""] ?? "Nova mensagem";
}

/**
 * useNotifications — som + notificação do navegador + contador no título da aba.
 *
 * Onde mora: é montado uma vez no layout autenticado (route.tsx), então vale
 * para todas as telas do app, mesmo quando a Caixa de entrada não está aberta.
 *
 * Regras (Bloco H.1):
 *  - O contador "(N) ConectaChat" sempre reflete o total de não lidas.
 *  - O som ("ding") só toca, e a notificação só aparece, quando a aba do
 *    ConectaChat NÃO está em foco (você está em outra aba/janela). Assim não
 *    incomoda enquanto você está usando o app.
 *  - O som e o pedido de permissão de notificação são "destravados" no seu
 *    primeiro clique/tecla dentro do app (exigência dos navegadores).
 */
export function useNotifications() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: conversations } = useConversations();

  const audioCtxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);

  // 1) Contador de não lidas no título da aba.
  useEffect(() => {
    const total = (conversations ?? []).reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
    if (typeof document !== "undefined") {
      document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${BASE_TITLE}` : BASE_TITLE;
    }
    return () => {
      if (typeof document !== "undefined") document.title = BASE_TITLE;
    };
  }, [conversations]);

  // 2) Destrava o som e pede a permissão de notificação no 1º clique/tecla do usuário.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      try {
        const AC: typeof AudioContext | undefined =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC && !audioCtxRef.current) audioCtxRef.current = new AC();
        audioCtxRef.current?.resume().catch(() => {});
      } catch {
        /* ignore */
      }
      try {
        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // 3) Som + notificação ao chegar mensagem nova (quando a aba não está em foco).
  //    Também mantém a lista de conversas (e o contador) atualizada em qualquer tela.
  useEffect(() => {
    const playDing = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const tone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.linearRampToValueAtTime(0.15, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      };
      // "ding" de duas notas (agradável e curto).
      tone(880, 0, 0.18);
      tone(1320, 0.12, 0.22);
    };

    const channel = supabase
      .channel("global-notify")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        // Mantém a lista/contador frescos mesmo fora da Caixa de entrada.
        queryClient.invalidateQueries({ queryKey: ["conversations"] });

        // Só alerta em mensagem NOVA recebida (INSERT inbound) — não em updates.
        const evt = (payload as unknown as { eventType?: string }).eventType;
        if (evt !== "INSERT") return;
        const row = payload.new as InboundRow;
        if (!row || row.direction !== "inbound") return;

        const inBackground =
          typeof document !== "undefined" && (document.hidden || !document.hasFocus());
        if (!inBackground) return;

        playDing();

        try {
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const convId = row.conversation_id;
            const list = queryClient.getQueryData<ConversationListItem[]>(["conversations"]);
            const conv = list?.find((c) => c.id === convId);
            const title = conv ? nameOf(conv.contact) : "Nova mensagem";
            const n = new Notification(title, {
              body: previewOf(row),
              tag: convId ?? "conectachat",
              icon: "/conectachat-192.png",
            });
            n.onclick = () => {
              window.focus();
              if (convId) {
                try {
                  sessionStorage.setItem("openConvId", convId);
                } catch {
                  /* ignore */
                }
                navigate({ to: "/inbox" });
              }
              n.close();
            };
          }
        } catch {
          /* ignore */
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, navigate]);
}
