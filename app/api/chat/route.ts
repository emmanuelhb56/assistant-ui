import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { convertToModelMessages, streamText } from "ai";
import { getMCPTools } from "@/lib/mcp-client";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages, system, tools } = await req.json();

    // Obtener las herramientas MCP
    const mcpTools = await getMCPTools();
    
    // Obtener frontend tools
    const frontendToolsResult = frontendTools(tools);
    
    // Combinar tools
    const allTools = {
      ...mcpTools,
      ...frontendToolsResult,
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Herramientas MCP cargadas:', Object.keys(mcpTools));
      console.log('🔧 Frontend tools:', Object.keys(frontendToolsResult));
      console.log('🔧 Total de tools combinados:', Object.keys(allTools).length);
    }
    
    const result = streamText({
      model: openai("gpt-4o"),
      messages: convertToModelMessages(messages),
      system,
      tools: allTools,
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error("Error en /api/chat:", error);
    
    // Retornar un error apropiado al cliente
    return new Response(
      JSON.stringify({
        error: "Error al procesar la solicitud",
        message: error.message || "Error desconocido",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
