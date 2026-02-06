import { useMemo, useRef, useState } from "react";
import { OllamaClient } from "../ollama/client";

export function useOllama(baseUrl: string) {
  const controllerRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const client = useMemo(() => new OllamaClient(baseUrl), [baseUrl]);

  function beginStream(): AbortSignal {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setIsStreaming(true);
    return controllerRef.current.signal;
  }

  function endStream() {
    setIsStreaming(false);
    controllerRef.current = null;
  }

  function abort() {
    controllerRef.current?.abort();
    setIsStreaming(false);
  }

  return {
    client,
    beginStream,
    endStream,
    abort,
    isStreaming,
  };
}
