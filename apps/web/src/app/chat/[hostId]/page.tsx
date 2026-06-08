import { notFound, redirect } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { AppHeader } from "@/components/layout/app-header";
import { createClient } from "@/lib/supabase/server";
import type { Host } from "@ownmyownai/supabase-types";

interface ChatPageProps {
  params: Promise<{ hostId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { hostId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hostData } = await supabase
    .from("hosts")
    .select("id, default_model, installed_models")
    .eq("id", hostId)
    .single();

  if (!hostData) notFound();

  const host = hostData as Pick<Host, "id" | "default_model" | "installed_models">;
  const installedModels = Array.isArray(host.installed_models) ? host.installed_models : [];

  return (
    <>
      <AppHeader />
      <ChatView
        hostId={host.id}
        defaultModel={host.default_model}
        installedModels={installedModels}
      />
    </>
  );
}
