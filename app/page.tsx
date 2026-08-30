import type { Metadata } from "next";

import { NewTaskPage } from "./ui/home/new-task-page";

export const metadata: Metadata = {
  title: "新任务 — SEcode",
};

export default function Home() {
  return <NewTaskPage />;
}
