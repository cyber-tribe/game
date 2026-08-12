export function normalizeMessage(message: string): string;
export function topStackFrame(stack: string | undefined): string;
export function fingerprint(input: { screen?: string; message?: string; topFrame?: string }): Promise<string>;
