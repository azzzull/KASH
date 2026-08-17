import { useEffect, useRef } from "react";
import type { AppEventName } from "../lib/appEvents";

export function useAppEvent(eventName: AppEventName, handler: () => void) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = () => handlerRef.current();
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [eventName]);
}
