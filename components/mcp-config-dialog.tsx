"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export function MCPConfigDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadTools = async () => {
    if (!url.trim()) {
      setError("Por favor ingresa una URL");
      return;
    }

    setLoading(true);
    setError(null);
    setTools([]);

    try {
      const response = await fetch("/api/mcp/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al conectar con el servidor MCP");
      }

      if (data.tools && Array.isArray(data.tools)) {
        setTools(data.tools);
      } else {
        setError("No se encontraron herramientas");
      }
    } catch (err: any) {
      setError(err.message || "Error al conectar con el servidor MCP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-full h-[34px]"
        >
          <svg viewBox="0 0 195 195" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-3.5">
            <path d="M25 97.8528L92.8823 29.9706C102.255 20.598 117.451 20.598 126.823 29.9706V29.9706C136.196 39.3431 136.196 54.5391 126.823 63.9117L75.5581 115.177" stroke="currentColor" strokeWidth="12" strokeLinecap="round"></path>
            <path d="M76.2653 114.47L126.823 63.9117C136.196 54.5391 151.392 54.5391 160.765 63.9117L161.118 64.2652C170.491 73.6378 170.491 88.8338 161.118 98.2063L99.7248 159.6C96.6006 162.724 96.6006 167.789 99.7248 170.913L112.331 183.52" stroke="currentColor" strokeWidth="12" strokeLinecap="round"></path>
            <path d="M109.853 46.9411L59.6482 97.1457C50.2757 106.518 50.2757 121.714 59.6482 131.087V131.087C69.0208 140.459 84.2168 140.459 93.5894 131.087L143.794 80.8822" stroke="currentColor" strokeWidth="12" strokeLinecap="round"></path>
          </svg>
          <span>MCP</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import MCP Tool</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter MCP server URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) {
                  loadTools();
                }
              }}
              className="flex-1"
            />
            <select className="rounded-md border border-input bg-background px-3 text-sm">
              <option>HTTP</option>
            </select>
            <Button onClick={loadTools} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Load"
              )}
            </Button>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="min-h-[200px] rounded-md border bg-muted/30 p-4">
            {tools.length === 0 && !loading && !error && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No tools loaded
              </div>
            )}
            {tools.length > 0 && (
              <div className="space-y-2">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="rounded-md border bg-background p-3 text-sm"
                  >
                    <div className="font-medium">{tool.name}</div>
                    {tool.description && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {tool.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
