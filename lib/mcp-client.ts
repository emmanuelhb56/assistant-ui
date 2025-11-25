import { tool } from "ai";
import { z } from "zod";

// Configuración del servidor MCP
// Puedes cambiar la URL mediante la variable de entorno MCP_SERVER_URL
const MCP_SERVERS = {
  "authorizations": {
    url:  "https://xv1czzf6-10000.usw3.devtunnels.ms/authorizations/mcp",
    type: "http" as const,
    requiresSessionId: true, 
  },
};

// Servidor MCP activo por defecto
const DEFAULT_MCP_SERVER = "authorizations";

// Cache para las herramientas MCP (por servidor)
const toolsCacheMap: Record<string, Record<string, any> | null> = {};
// Session IDs por servidor MCP
const sessionIdMap: Record<string, string | null> = {};

/**
 * Parsea una respuesta SSE (Server-Sent Events)
 */
async function parseSSEResponse(response: Response): Promise<any> {
  const text = await response.text();
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        return JSON.parse(line.substring(6));
      } catch (e) {
        // Continuar buscando
      }
    }
  }
  
  // Si no encontramos formato SSE, intentar parsear como JSON directo
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('No se pudo parsear la respuesta del servidor MCP');
  }
}

/**
 * Inicializa una sesión con el servidor MCP
 */
async function initializeMCPSession(serverName: string = DEFAULT_MCP_SERVER): Promise<string> {
  if (sessionIdMap[serverName]) {
    return sessionIdMap[serverName]!;
  }

  const serverConfig = MCP_SERVERS[serverName as keyof typeof MCP_SERVERS];
  if (!serverConfig) {
    throw new Error(`Servidor MCP no encontrado: ${serverName}`);
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // Inicializar sesión usando el método initialize del protocolo MCP
    const response = await fetch(serverConfig.url, {
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`❌ Error al inicializar sesión MCP [${serverName}]:`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText.substring(0, 500),
      });
      throw new Error(`Error al inicializar sesión MCP: ${response.status} ${response.statusText}`);
    }

    // El servidor devuelve el session ID en el header mcp-session-id
    const mcpSessionId = response.headers.get('mcp-session-id');
    if (mcpSessionId) {
      sessionIdMap[serverName] = mcpSessionId;
    }

    // El servidor responde con SSE, necesitamos parsearlo
    const data = await parseSSEResponse(response);
    
    if (data.error) {
      throw new Error(`Error MCP: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Si no obtuvimos el session ID del header, intentar de la respuesta
    if (!sessionIdMap[serverName]) {
      if (data.result?.sessionId) {
        sessionIdMap[serverName] = data.result.sessionId;
      } else if (data.sessionId) {
        sessionIdMap[serverName] = data.sessionId;
      } else {
        // Generar un session ID único como último recurso
        sessionIdMap[serverName] = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      }
    }

    return sessionIdMap[serverName]!;
  } catch (error: any) {
    clearTimeout(timeoutId);
    // Si no podemos inicializar, generamos un session ID temporal
    sessionIdMap[serverName] = `temp-${Date.now()}`;
    return sessionIdMap[serverName]!;
  }
}

/**
 * Realiza una solicitud JSON-RPC al servidor MCP con timeout
 */
async function mcpRequest(
  method: string, 
  params?: any, 
  timeout: number = 5000,
  serverName: string = DEFAULT_MCP_SERVER
): Promise<any> {
  const serverConfig = MCP_SERVERS[serverName as keyof typeof MCP_SERVERS];
  if (!serverConfig) {
    throw new Error(`Servidor MCP no encontrado: ${serverName}`);
  }
  
  // Asegurarnos de tener un session ID solo si el servidor lo requiere
  // NOTA: Algunos servidores (como n8n) requieren initialize pero no session ID en el body
  if (serverConfig.requiresSessionId !== false && !sessionIdMap[serverName]) {
    await initializeMCPSession(serverName);
  }
  
  // Crear un AbortController para timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const requestBody: any = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params: params || {},
    };

    // NOTA: El sessionId se envía solo en los headers, no en el body
    // El servidor MCP rechaza sessionId en el body con error "unrecognized_keys"

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Solicitud MCP [${serverName}] ${method}:`, {
        url: serverConfig.url,
        hasSessionId: !!sessionIdMap[serverName],
        body: JSON.stringify(requestBody).substring(0, 200),
      });
    }

    const response = await fetch(serverConfig.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        ...(sessionIdMap[serverName] ? { 
          "mcp-session-id": sessionIdMap[serverName],
          "X-Session-ID": sessionIdMap[serverName] 
        } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Actualizar session ID si viene en el header de la respuesta
    const responseSessionId = response.headers.get('mcp-session-id');
    if (responseSessionId) {
      sessionIdMap[serverName] = responseSessionId;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`❌ Error en solicitud MCP [${serverName}]:`, {
        method,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText.substring(0, 500),
      });
      
      // Si recibimos un error de sesión, intentar reinicializar
      if (response.status === 401 || response.status === 403) {
        sessionIdMap[serverName] = null;
        await initializeMCPSession(serverName);
        // Reintentar una vez
        return mcpRequest(method, params, timeout, serverName);
      }
      throw new Error(`Error en solicitud MCP: ${response.status} ${response.statusText}`);
    }

    // El servidor responde con SSE, necesitamos parsearlo
    const data = await parseSSEResponse(response);
    
    if (data.error) {
      // Si el error es por sesión, reinicializar
      if (data.error.code === -32600 && data.error.message?.includes("session")) {
        sessionIdMap[serverName] = null;
        await initializeMCPSession(serverName);
        // Reintentar una vez
        return mcpRequest(method, params, timeout, serverName);
      }
      throw new Error(`Error MCP: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Actualizar session ID si viene en la respuesta (backup)
    if (data.sessionId && !sessionIdMap[serverName]) {
      sessionIdMap[serverName] = data.sessionId;
    }

    return data.result;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Timeout al conectar con el servidor MCP');
    }
    throw error;
  }
}

/**
 * Convierte un tipo JSON Schema a Zod
 */
function jsonSchemaTypeToZod(propSchema: any): z.ZodTypeAny {
  if (!propSchema || typeof propSchema !== 'object') {
    return z.string();
  }

  // Si tiene anyOf, puede ser nullable (tipo | null)
  if (propSchema.anyOf && Array.isArray(propSchema.anyOf)) {
    const hasNull = propSchema.anyOf.some((t: any) => t.type === "null");
    const nonNullType = propSchema.anyOf.find((t: any) => t.type !== "null");
    
    if (nonNullType) {
      let zodType = jsonSchemaTypeToZod(nonNullType);
      // Si tiene null en anyOf, hacer nullable
      // IMPORTANTE: No combinar nullable() con optional() - causa problemas
      if (hasNull) {
        zodType = zodType.nullable();
      }
      // Aplicar default si existe
      if (nonNullType.default !== undefined) {
        zodType = zodType.default(nonNullType.default);
      }
      return zodType;
    }
    return z.string().nullable(); // Default si todos son null
  }

  const type = propSchema.type;
  
  // Convertir según el tipo
  let zodType: z.ZodTypeAny;
  switch (type) {
    case "integer":
      zodType = z.number().int();
      break;
    case "number":
      zodType = z.number();
      break;
    case "boolean":
      zodType = z.boolean();
      break;
    case "array":
      zodType = z.array(z.any());
      break;
    case "object":
      zodType = z.record(z.string(), z.any());
      break;
    case "string":
    default:
      zodType = z.string();
      break;
  }

  // Aplicar default si existe
  if (propSchema.default !== undefined) {
    zodType = zodType.default(propSchema.default);
  }

  return zodType;
}

/**
 * Limpia un JSON Schema para que sea compatible con Zod
 * Elimina anyOf con null y los convierte a propiedades opcionales
 */
function cleanJsonSchemaForZod(inputSchema: any): any {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return { type: "object", properties: {} };
  }

  const cleaned: any = {
    type: "object",
    properties: {},
  };

  if (inputSchema.properties && typeof inputSchema.properties === 'object') {
    for (const [key, value] of Object.entries(inputSchema.properties)) {
      const prop = value as any;
      const cleanedProp: any = {};

      // Manejar anyOf (nullable)
      if (prop.anyOf && Array.isArray(prop.anyOf)) {
        const nonNullType = prop.anyOf.find((t: any) => t.type !== "null");
        if (nonNullType) {
          cleanedProp.type = nonNullType.type;
          if (nonNullType.default !== undefined) {
            cleanedProp.default = nonNullType.default;
          }
        } else {
          cleanedProp.type = "string"; // Default
        }
      } else if (prop.type) {
        cleanedProp.type = prop.type;
        if (prop.default !== undefined) {
          cleanedProp.default = prop.default;
        }
      } else {
        cleanedProp.type = "string"; // Default
      }

      cleaned.properties[key] = cleanedProp;
    }
  }

  // Agregar required solo para campos que NO tienen anyOf con null
  if (Array.isArray(inputSchema.required)) {
    cleaned.required = inputSchema.required.filter((key: string) => {
      const prop = inputSchema.properties?.[key];
      // Solo requerir si NO tiene anyOf con null
      return !(prop?.anyOf && prop.anyOf.some((t: any) => t.type === "null"));
    });
  }

  return cleaned;
}

/**
 * Convierte un JSON Schema de MCP a un Zod schema
 */
function jsonSchemaToZod(inputSchema: any): z.ZodObject<any> {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  
  if (inputSchema.properties && typeof inputSchema.properties === 'object') {
    const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];
    
    for (const [key, value] of Object.entries(inputSchema.properties)) {
      const propSchema = value as any;
      let zodType = jsonSchemaTypeToZod(propSchema);
      
      // Hacer opcional si no está en required
      // IMPORTANTE: No combinar nullable() y optional() - causa problemas con zodToJsonSchema
      if (!required.includes(key)) {
        // Si ya es nullable (tiene anyOf con null), NO hacer optional también
        // Si no es nullable, hacerlo optional
        const isNullable = propSchema.anyOf && propSchema.anyOf.some((t: any) => t.type === "null");
        if (!isNullable) {
          zodType = zodType.optional();
        }
        // Si es nullable, ya está manejado en jsonSchemaTypeToZod
      }
      
      shape[key] = zodType;
    }
  }

  // Asegurarse de que siempre retornamos un ZodObject válido
  try {
    const zodObject = z.object(shape);
    // No validamos con parse({}) porque si hay required fields, fallará
    // Solo verificamos que sea un ZodObject válido
    if (!zodObject || typeof zodObject.parse !== 'function') {
      throw new Error('ZodObject inválido');
    }
    return zodObject;
  } catch (error) {
    console.error('❌ Error al crear Zod schema:', error);
    return z.object({});
  }
}

/**
 * Obtiene las herramientas de un servidor MCP específico
 */
async function getToolsFromServer(serverName: string): Promise<Record<string, any>> {
  // Verificar cache para este servidor
  if (toolsCacheMap[serverName] !== null && toolsCacheMap[serverName] !== undefined) {
    return toolsCacheMap[serverName]!;
  }

  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Intentando obtener herramientas de ${serverName}...`);
    }
    
    // Siempre inicializar primero (algunos servidores como n8n requieren initialize antes de tools/list)
    // Incluso si requiresSessionId es false, algunos servidores necesitan initialize para funcionar
    try {
      await initializeMCPSession(serverName);
    } catch (error: any) {
      // Si falla la inicialización, verificar si el servidor realmente la requiere
      const serverConfig = MCP_SERVERS[serverName as keyof typeof MCP_SERVERS];
      if (serverConfig?.requiresSessionId === false) {
        // Para servidores que no requieren session ID, intentar continuar sin inicialización
        if (process.env.NODE_ENV === 'development') {
          console.log(`ℹ️  Inicialización falló para [${serverName}], intentando continuar...`);
        }
      } else {
        // Para otros servidores, la inicialización es requerida
        throw error;
      }
    }
    
    // Obtener la lista de herramientas usando el método tools/list del protocolo MCP
    const result = await mcpRequest("tools/list", {}, 3000, serverName);
    
    const tools: Record<string, any> = {};

    // Convertir las herramientas MCP al formato de Vercel AI SDK usando tool() con Zod
    if (result.tools && Array.isArray(result.tools)) {
      for (const mcpTool of result.tools) {
        try {
          // Log del inputSchema original del servidor MCP
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔍 InputSchema original de ${mcpTool.name}:`, JSON.stringify(mcpTool.inputSchema, null, 2));
          }
          
          // Convertir JSON Schema a Zod de manera simple y directa
          // Evitar combinar nullable() y optional() que causa problemas
          const shape: Record<string, z.ZodTypeAny> = {};
          const required = Array.isArray(mcpTool.inputSchema?.required) ? mcpTool.inputSchema.required : [];
          
          if (mcpTool.inputSchema?.properties) {
            for (const [key, value] of Object.entries(mcpTool.inputSchema.properties)) {
              const prop = value as any;
              let zodType: z.ZodTypeAny;
              
              // Manejar anyOf (nullable) - tomar el tipo no-null
              if (prop.anyOf && Array.isArray(prop.anyOf)) {
                const nonNullType = prop.anyOf.find((t: any) => t.type !== "null");
                if (nonNullType) {
                  // Convertir el tipo no-null a Zod
                  switch (nonNullType.type) {
                    case "integer":
                      zodType = z.number().int();
                      break;
                    case "number":
                      zodType = z.number();
                      break;
                    case "boolean":
                      zodType = z.boolean();
                      break;
                    case "string":
                    default:
                      zodType = z.string();
                      break;
                  }
                  // Aplicar default si existe
                  if (nonNullType.default !== undefined) {
                    zodType = zodType.default(nonNullType.default);
                  }
                  // Hacer nullable (pero NO optional)
                  zodType = zodType.nullable();
                } else {
                  zodType = z.string().nullable();
                }
              } else if (prop.type) {
                // Tipo simple sin nullable
                switch (prop.type) {
                  case "integer":
                    zodType = z.number().int();
                    break;
                  case "number":
                    zodType = z.number();
                    break;
                  case "boolean":
                    zodType = z.boolean();
                    break;
                  case "string":
                  default:
                    zodType = z.string();
                    break;
                }
                // Aplicar default si existe
                if (prop.default !== undefined) {
                  zodType = zodType.default(prop.default);
                }
                // Hacer opcional solo si NO está en required
                if (!required.includes(key)) {
                  zodType = zodType.optional();
                }
              } else {
                zodType = z.string().optional();
              }
              
              shape[key] = zodType;
            }
          }
          
          // Crear el Zod schema
          const zodSchema = Object.keys(shape).length > 0 
            ? z.object(shape)
            : z.object({}).passthrough(); // Schema vacío con passthrough
          
          // Log del schema
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔍 Schema para ${mcpTool.name}:`, {
              shapeKeys: Object.keys(shape),
              shapeCount: Object.keys(shape).length,
              required: required,
            });
          }
          
          // Crear la herramienta usando tool() de 'ai' con parameters (Zod)
          const createdTool = tool({
            description: mcpTool.description || "",
            parameters: zodSchema,
            execute: async (params: any) => {
              // Ejecutar la herramienta usando tools/call del protocolo MCP
              const callResult = await mcpRequest("tools/call", {
                name: mcpTool.name,
                arguments: params || {}, // Asegurar que siempre sea un objeto
              }, 10000); // Timeout más largo para ejecución

              // El resultado de MCP puede venir en diferentes formatos
              if (callResult.content) {
                // Si tiene contenido, extraer el texto
                if (Array.isArray(callResult.content)) {
                  return callResult.content
                    .map((item: any) => item.text || item)
                    .join("\n");
                }
                return callResult.content;
              }

              return callResult;
            },
          } as any); // Forzar tipo para evitar problemas de inferencia de TypeScript
          
          // Verificar que el tool se creó correctamente
          if (!createdTool || typeof createdTool !== 'object') {
            console.error(`❌ Tool ${mcpTool.name} no se creó correctamente`);
            continue;
          }
          
          tools[mcpTool.name] = createdTool;
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Tool ${mcpTool.name} creado con parameters (Zod schema)`);
            const toolParams = (createdTool as any).parameters;
            if (toolParams) {
              console.log(`  - Parameters type:`, typeof toolParams);
              console.log(`  - Parameters constructor:`, toolParams?.constructor?.name);
              if (toolParams.shape) {
                console.log(`  - Shape keys:`, Object.keys(toolParams.shape || {}).length);
              }
            }
          }
        } catch (error: any) {
          console.error(`❌ Error al crear tool ${mcpTool.name}:`, error);
          // Continuar con las demás herramientas
        }
      }
    }

    // Guardar en cache solo si obtuvimos herramientas
    if (Object.keys(tools).length > 0) {
      toolsCacheMap[serverName] = tools;
      console.log(`✅ MCP [${serverName}]: ${Object.keys(tools).length} herramienta(s) cargada(s)`);
    } else {
      // Marcar como intentado (null = no disponible, {} = disponible pero sin herramientas)
      toolsCacheMap[serverName] = {};
    }
    
    return tools;
  } catch (error: any) {
    // El servidor MCP no está disponible - esto es normal si no lo has iniciado
    if (process.env.NODE_ENV === 'development') {
      console.log(`ℹ️  MCP [${serverName}] no disponible:`, error.message);
    }
    
    // Marcar como no disponible para evitar intentos repetidos
    toolsCacheMap[serverName] = {};
    return {};
  }
}

/**
 * Obtiene las herramientas disponibles de todos los servidores MCP configurados
 * Retorna un objeto vacío si ningún servidor está disponible (no bloquea la aplicación)
 */
export async function getMCPTools(): Promise<Record<string, any>> {
  const allTools: Record<string, any> = {};
  
  // Obtener herramientas de todos los servidores configurados
  for (const serverName of Object.keys(MCP_SERVERS)) {
    try {
      const serverTools = await getToolsFromServer(serverName);
      // Combinar herramientas (si hay nombres duplicados, el último servidor gana)
      Object.assign(allTools, serverTools);
    } catch (error: any) {
      console.error(`❌ Error al obtener herramientas de ${serverName}:`, error.message);
    }
  }
  
  if (Object.keys(allTools).length > 0) {
    console.log(`✅ Total MCP: ${Object.keys(allTools).length} herramienta(s) de ${Object.keys(MCP_SERVERS).length} servidor(es)`);
  }
  
  return allTools;
}

/**
 * Limpia el cache de las herramientas MCP
 * Útil si el servidor MCP se reinicia
 */
export function clearMCPCache(serverName?: string) {
  if (serverName) {
    toolsCacheMap[serverName] = null;
    sessionIdMap[serverName] = null;
  } else {
    // Limpiar todos los caches
    for (const name of Object.keys(toolsCacheMap)) {
      toolsCacheMap[name] = null;
      sessionIdMap[name] = null;
    }
  }
}

/**
 * Verifica si un servidor MCP está disponible
 */
export async function isMCPAvailable(serverName: string = DEFAULT_MCP_SERVER): Promise<boolean> {
  try {
    await mcpRequest("tools/list", {}, 2000, serverName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtiene la lista de servidores MCP configurados
 */
export function getMCPServers(): string[] {
  return Object.keys(MCP_SERVERS);
}
