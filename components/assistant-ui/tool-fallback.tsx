import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { SearchIcon, AlertCircleIcon, Loader2Icon } from "lucide-react";

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  // Verificar si hay un error en el status
  const hasError = status?.type === "incomplete" && status?.reason === "error";

  // Si hay un error, mostrar mensaje de error
  if (hasError) {
    return (
      <div 
        className="aui-tool-fallback-error mb-3 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm"
        style={{ 
          backgroundColor: '#fef2f2',
          borderColor: '#fecaca',
        }}
      >
        <div 
          className="flex size-6 items-center justify-center rounded-full flex-shrink-0"
          style={{ backgroundColor: '#fee2e2' }}
        >
          <AlertCircleIcon className="size-4" style={{ color: '#dc2626' }} />
        </div>
        <span style={{ color: '#991b1b' }}>
          Error al consultar la información. Por favor, intenta de nuevo.
        </span>
      </div>
    );
  }

  // Si result es undefined o status es "running", la herramienta aún se está ejecutando
  if (result === undefined || status?.type === "running") {
    return (
      <div className="aui-tool-fallback-loading mb-1 flex items-center gap-2 px-2 py-1 text-sm">
        <Loader2Icon className="size-3.5 animate-spin flex-shrink-0" style={{ color: '#4672f1' }} />
        <span className="flex items-center gap-1" style={{ color: '#001b48' }}>
          <span>Consultando información</span>
          <span className="flex gap-0.5">
            <span className="animate-bounce-dot inline-block" style={{ animationDelay: '0ms' }}>.</span>
            <span className="animate-bounce-dot inline-block" style={{ animationDelay: '200ms' }}>.</span>
            <span className="animate-bounce-dot inline-block" style={{ animationDelay: '400ms' }}>.</span>
          </span>
        </span>
      </div>
    );
  }

  // Si la herramienta completó exitosamente, no mostrar nada (oculto para el usuario)
  return null;
};
