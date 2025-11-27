"use client";

import { useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export const Assistant = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="relative flex h-dvh">
        {/*
        <div
          className={`relative border-r border-border/40 bg-muted/30 transition-all duration-300 ease-in-out ${
            isSidebarCollapsed ? "w-0 overflow-hidden" : "w-[200px]"
          }`}
        >
          <div className="h-full px-2 py-4">
            <ThreadList />
          </div>

          {!isSidebarCollapsed && (
            <button
              onClick={() => setIsSidebarCollapsed(true)}
              className="group absolute right-0 top-1/2 z-20 flex h-10 w-5 -translate-y-1/2 translate-x-full cursor-pointer items-center justify-center rounded-r-lg border border-l-0 border-border/60 bg-background shadow-sm transition-all duration-200 hover:bg-muted hover:shadow-md active:scale-95"
              aria-label="Colapsar sidebar"
            >
              <ChevronLeftIcon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </button>
          )}
        </div>

        {isSidebarCollapsed && (
          <button
            onClick={() => setIsSidebarCollapsed(false)}
            className="group absolute left-0 top-1/2 z-20 flex h-10 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-lg border border-l-0 border-border/60 bg-background shadow-sm transition-all duration-200 hover:bg-muted hover:shadow-md active:scale-95"
            aria-label="Expandir sidebar"
          >
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          </button>
        )} 
        */}
        <div className="flex-1 overflow-hidden px-4 py-4">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
};
