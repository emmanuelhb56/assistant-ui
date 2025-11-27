import { openai } from "@ai-sdk/openai";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { convertToModelMessages, stepCountIs, streamText } from "ai";

export const maxDuration = 30;

// URL del servidor MCP
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.clickbalance.net/authorizations/mcp';

/**
 * Sanitiza un string para prevenir XSS
 */
function sanitizeInput(input: string | null): string | null {
  if (!input) return null;
  
  const sanitized = input
    .replace(/[<>\"'&]/g, '')
    .trim()
    .slice(0, 100);
  
  if (!/^[a-zA-Z0-9\s\-áéíóúÁÉÍÓÚñÑüÜ]+$/.test(sanitized)) {
    return null;
  }
  
  return sanitized || null;
}

/**
 * Extrae parámetros de URL de forma segura
 */
function extractUrlParams(req: Request): Record<string, string | null> {
  const params: Record<string, string | null> = {};
  
  try {
    // Intentar obtener desde el referer header (si viene de iframe o navegación)
    const referer = req.headers.get('referer');
    if (referer) {
      const url = new URL(referer);
      url.searchParams.forEach((value, key) => {
        const sanitized = sanitizeInput(value);
        if (sanitized) {
          params[key] = sanitized;
        }
      });
    }
    
    // También intentar desde el origin si está disponible
    const origin = req.headers.get('origin');
    if (origin && !referer) {
      try {
        const url = new URL(origin);
        // Los query params normalmente no están en origin, pero por si acaso
        if (url.search) {
          url.searchParams.forEach((value, key) => {
            const sanitized = sanitizeInput(value);
            if (sanitized) {
              params[key] = sanitized;
            }
          });
        }
      } catch (e) {
        // Ignorar errores de origin
      }
    }
  } catch (error) {
    // Si hay error parseando, continuar sin parámetros
    if (process.env.NODE_ENV === 'development') {
      console.warn('Error extrayendo parámetros de URL:', error);
    }
  }
  
  return params;
}

export async function POST(req: Request) {
  let transport: StreamableHTTPClientTransport | null = null;
  
  try {
    const bodyData = await req.json();
    const { messages, system, tools, context } = bodyData;
    
    // Extraer parámetros de URL (solo nombre y userId)
    const urlParams = extractUrlParams(req);
    
    // Si se envía context desde el cliente, usarlo (tiene prioridad)
    const userContext = context || urlParams;
    
    // Solo extraer nombre y userId (los únicos parámetros que se usan)
    const nombre = userContext?.nombre || null;
    const userId = userContext?.userId || null;
    
    // Log detallado para debug
    if (process.env.NODE_ENV === 'development') {
      console.log('📥 Body recibido:', { 
        hasMessages: !!messages, 
        hasSystem: !!system, 
        hasTools: !!tools, 
        hasContext: !!context,
        contextValue: context 
      });
      console.log('🌐 URL params extraídos:', urlParams);
      console.log('👤 Datos del usuario:', { nombre, userId });
    }
    
    // Construir el system prompt base
    let systemPrompt = system || "You are Clia, a helpful assistant that helps users manage their authorizations. Respond in Spanish when the user writes in Spanish.";
    
    // Agregar información del usuario solo si está disponible
    if (nombre || userId) {
      const userInfo: string[] = [];
      
      if (nombre) {
        userInfo.push(`nombre: ${nombre}`);
      }
      
      if (userId) {
        userInfo.push(`ID de usuario: ${userId}`);
      }
      
      // Construir el system prompt con información del usuario
      systemPrompt += `\n\nINFORMACIÓN DEL USUARIO:\n${userInfo.join('\n')}\n\nIMPORTANTE: Cuando el usuario pregunte sobre su identidad (por ejemplo: "¿quién soy?", "quien soy", "dime quién soy", etc.), debes responder usando SOLO la información que conoces del usuario:\n`;
      
      if (nombre && userId) {
        systemPrompt += `- Responde: "Eres ${nombre} y tu ID de usuario es ${userId}."\n`;
      } else if (nombre) {
        systemPrompt += `- Responde: "Eres ${nombre}."\n`;
      } else if (userId) {
        systemPrompt += `- Responde: "Tu ID de usuario es ${userId}."\n`;
      }
      
      systemPrompt += `\nSolo menciona la información que conoces. No inventes datos que no se te hayan proporcionado.`;
    } else {
      // Si no hay información del usuario
      systemPrompt += `\n\nNo tienes información específica del usuario en este momento.`;
    }
    
    // Log para debug en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log('📋 Información del usuario:', { nombre, userId });
      console.log('📝 System prompt generado (primeras 600 chars):', systemPrompt.substring(0, 600));
    }

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
      if (nombre || userId) {
        console.log('👤 Contexto del usuario:', { nombre, userId });
      }
    }
    
    const result = streamText({
      model: openai("gpt-4o"),
      messages: convertToModelMessages(messages),
      system: systemPrompt,
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