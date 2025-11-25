import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL es requerida" },
        { status: 400 }
      );
    }

    // Validar que sea una URL válida
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "URL inválida" },
        { status: 400 }
      );
    }

    // Intentar conectar con el servidor MCP
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      // Inicializar sesión
      const initResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            clientInfo: {
              name: "assistant-ui",
              version: "1.0.0",
            },
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!initResponse.ok) {
        throw new Error(`Error al inicializar: ${initResponse.statusText}`);
      }

      // Obtener session ID
      let sessionId = initResponse.headers.get("mcp-session-id");
      if (!sessionId) {
        const initData = await initResponse.text();
        const lines = initData.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));
              sessionId = data.result?.sessionId || data.sessionId;
              break;
            } catch {
              // Continuar
            }
          }
        }
      }

      // Obtener lista de herramientas
      const toolsResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          ...(sessionId ? { 
            "mcp-session-id": sessionId,
            "X-Session-ID": sessionId 
          } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/list",
          params: {},
        }),
        signal: controller.signal,
      });

      if (!toolsResponse.ok) {
        const errorText = await toolsResponse.text().catch(() => '');
        console.error('❌ Error en tools/list:', {
          status: toolsResponse.status,
          statusText: toolsResponse.statusText,
          headers: Object.fromEntries(toolsResponse.headers.entries()),
          body: errorText.substring(0, 500),
          url,
          sessionId,
        });
        throw new Error(`Error al obtener herramientas: ${toolsResponse.status} ${toolsResponse.statusText}. ${errorText.substring(0, 200)}`);
      }

      // Parsear respuesta SSE
      const toolsData = await toolsResponse.text();
      const lines = toolsData.split("\n");
      let toolsResult: any = null;

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.result) {
              toolsResult = data.result;
              break;
            }
          } catch {
            // Continuar
          }
        }
      }

      if (!toolsResult || !toolsResult.tools) {
        throw new Error("No se pudieron obtener las herramientas");
      }

      return NextResponse.json({
        success: true,
        tools: toolsResult.tools,
        count: toolsResult.tools.length,
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error("Timeout al conectar con el servidor MCP");
      }
      throw error;
    }
  } catch (error: any) {
    console.error("Error en /api/mcp/test:", error);
    return NextResponse.json(
      {
        error: error.message || "Error al conectar con el servidor MCP",
      },
      { status: 500 }
    );
  }
}

