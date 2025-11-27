"use client";

import { useState, useEffect } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useUrlParams } from "@/lib/use-url-params";

export const Assistant = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const urlParams = useUrlParams();
  
  // Crear transport con contexto personalizado
  const transport = new AssistantChatTransport({
    api: "/api/chat",
    // Pasar contexto en el body de cada request
    fetch: async (url, options) => {
      const body = options?.body ? JSON.parse(options.body as string) : {};
      
      // Agregar contexto del usuario al body (solo nombre y userId)
      if (urlParams.nombre || urlParams.userId) {
        body.context = {
          nombre: urlParams.nombre || null,
          userId: urlParams.userId || null,
        };
        
        // Log para debug (siempre visible para verificar)
        console.log('📤 [CLIENTE] Enviando contexto al servidor:', body.context);
      } else {
        console.warn('⚠️ [CLIENTE] No se encontraron parámetros de URL (nombre o userId)');
      }
      
      return fetch(url, {
        ...options,
        body: JSON.stringify(body),
      });
    },
  });
  
  const runtime = useChatRuntime({
    transport,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="relative flex h-dvh flex-col">
        {/* Banner superior con Clia */}
        <div 
          className="w-full flex items-center justify-center border-b border-border/40"
          style={{ 
            backgroundColor: '#f4f6ff',
            height: '50px',
            paddingLeft: '16px',
            paddingRight: '16px'
          }}
        >
          {/* Logo Clia */}
          <img 
            src="/images/clia-logo-oscuro.png" 
            alt="Clia" 
            className="object-contain"
            style={{ 
              width: '70px',
              height: 'auto',
              maxHeight: '50px'
            }}
          />
        </div>
        
        <div className="relative flex flex-1 overflow-hidden">
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
      </div>
    </AssistantRuntimeProvider>
  );
};
