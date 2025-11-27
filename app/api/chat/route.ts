import { openai } from "@ai-sdk/openai";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { convertToModelMessages, stepCountIs, streamText } from "ai";

export const maxDuration = 30;

// URL del servidor MCP
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.clickbalance.net/authorizations/mcp';

export async function POST(req: Request) {
  let transport: StreamableHTTPClientTransport | null = null;
  
  try {
    const { messages, system, tools } = await req.json();

    // Crear transporte y cliente MCP
    transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
    const client = await createMCPClient({ transport });

    // Obtener herramientas MCP
    const mcpTools = await client.tools();
    
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
      system: system || "You are a helpful assistant that helps users manage their authorizations. Respond in Spanish when the user writes in Spanish. My UserId is 65945",
      tools: allTools,
      stopWhen: stepCountIs(5),
      onFinish: async () => {
        if (transport) {
          await transport.close();
        }
      },
      onError: async (error) => {
        console.error('Stream error:', error);
        if (transport) {
          await transport.close();
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error en /api/chat:", error);
    
    // Cerrar transporte en caso de error
    if (transport) {
      await transport.close();
    }
    
    // Retornar un error apropiado al cliente
    return new Response(
      JSON.stringify({
        error: "Error al procesar la solicitud",
        message: error instanceof Error ? error.message : "Error desconocido",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}