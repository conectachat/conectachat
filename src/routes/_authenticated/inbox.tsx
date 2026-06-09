import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Inbox, MessageSquare } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { useConversations, type ConversationListItem } from "@/hooks/use-conversations";
import { useMessages } from "@/hooks/use-messages";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Caixa de entrada — ConectaChat" },
      { name: "description", content: "Suas conversas de atendimento ao cliente." },
    ],
  }),
  component: InboxPage,
});

const STATUS_LABEL: Record<ConversationListItem["status"], string> = {
  open: "Aberto",
  pending: "Aguardando",
  closed: "Fechado",
};

const STATUS_VARIANT: Record<
  ConversationListItem["status"],
  "default" | "secondary" | "outline"
> = {
  open: "secondary",
  pending: "default",
  closed: "outline",
};

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function InboxPage() {
  const { data: conversations, isLoading } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[320px_1fr] overflow-hidden">
      {/* Lista de conversas */}
      <aside className="flex flex-col border-r border-border bg-background">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Conversas</h2>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <ul className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 rounded-md p-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))}
            </ul>
          ) : !conversations || conversations.length === 0 ? (
            <EmptyConversations />
          ) : (
            <ul className="p-2">
              {conversations.map((c) => {
                const name = c.contact?.name?.trim() || "Sem nome";
                const isSelected = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors",
                        isSelected ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <Avatar className="h-10 w-10">
                        {c.contact?.avatar_url ? (
                          <AvatarImage src={c.contact.avatar_url} alt={name} />
                        ) : null}
                        <AvatarFallback>{initials(c.contact?.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {name}
                          </span>
                          {c.last_message_at && (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {formatDistanceToNow(new Date(c.last_message_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant={STATUS_VARIANT[c.status]} className="h-5 px-1.5 text-[10px]">
                            {STATUS_LABEL[c.status]}
                          </Badge>
                          {c.channel?.name && (
                            <span className="truncate text-[11px] text-muted-foreground">
                              {c.channel.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </aside>

      {/* Painel da conversa */}
      <section className="flex min-w-0 flex-col bg-muted/20">
        {selected ? <ConversationPanel conversation={selected} /> : <EmptyPanel />}
      </section>
    </div>
  );
}

function EmptyConversations() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Nenhuma conversa ainda</p>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MessageSquare className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Selecione uma conversa</p>
      </div>
    </div>
  );
}

function ConversationPanel({ conversation }: { conversation: ConversationListItem }) {
  const { data: messages, isLoading } = useMessages(conversation.id);
  const name = conversation.contact?.name?.trim() || "Sem nome";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-9 w-9">
            {conversation.contact?.avatar_url ? (
              <AvatarImage src={conversation.contact.avatar_url} alt={name} />
            ) : null}
            <AvatarFallback>{initials(conversation.contact?.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            {conversation.channel?.name && (
              <p className="truncate text-xs text-muted-foreground">
                {conversation.channel.name}
              </p>
            )}
          </div>
        </div>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
          Atender
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-10 w-1/3" />
            </div>
          ) : !messages || messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma mensagem nesta conversa.
            </p>
          ) : (
            messages.map((m) => {
              const outbound = m.direction === "outbound";
              return (
                <div
                  key={m.id}
                  className={cn("flex", outbound ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      outbound
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-foreground border border-border",
                    )}
                  >
                    {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        outbound ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {format(new Date(m.created_at), "HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
