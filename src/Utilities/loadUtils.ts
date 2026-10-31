// The former load-analysis AI module was removed from the configured Tengesa
// Firebase project. Keep callers explicit about the unavailable service.
export function createAIPrompt(): string {
  throw new Error("AI load analysis is not configured for Tengesa.");
}

export function mapAIResponse(_value: unknown): any {
  throw new Error("AI load analysis is not configured for Tengesa.");
}
