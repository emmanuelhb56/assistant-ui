"use client";

import { useEffect, useState } from "react";

/**
 * Sanitiza un string para prevenir XSS
 * Solo permite letras, números, espacios y algunos caracteres seguros
 */
function sanitizeInput(input: string | null): string | null {
  if (!input) return null;
  
  // Remover caracteres peligrosos y limitar longitud
  const sanitized = input
    .replace(/[<>\"'&]/g, '') // Remover caracteres HTML peligrosos
    .trim()
    .slice(0, 100); // Limitar longitud máxima
  
  // Solo permitir letras, números, espacios, guiones y acentos
  if (!/^[a-zA-Z0-9\s\-áéíóúÁÉÍÓÚñÑüÜ]+$/.test(sanitized)) {
    return null;
  }
  
  return sanitized || null;
}

/**
 * Hook para leer parámetros de URL de forma segura
 * Solo extrae nombre y userId
 */
export function useUrlParams() {
  const [params, setParams] = useState<{ nombre: string | null; userId: string | null }>({
    nombre: null,
    userId: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    
    // Solo extraer nombre y userId
    const nombre = sanitizeInput(searchParams.get("nombre"));
    const userId = sanitizeInput(searchParams.get("userId"));
    
    const extractedParams = {
      nombre,
      userId,
    };
    
    // Log para debug
    if ((nombre || userId) && process.env.NODE_ENV === 'development') {
      console.log('🔍 Parámetros de URL detectados:', extractedParams);
    }
    
    setParams(extractedParams);
  }, []);

  return params;
}

