import type { Metadata } from "next";

import { SessionWorkbench } from "@/app/ui/workbench/session-workbench";

export const metadata: Metadata = {
  title: "任务会话 — SEcode",
};

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionWorkbench sessionId={id} />;
}
