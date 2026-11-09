export interface OperationWarnings {
  warnings?: string[];
}

export async function withSecondaryWarning<T extends OperationWarnings>(
  result: T,
  secondary: () => Promise<unknown>,
  warning: string,
): Promise<T> {
  try {
    await secondary();
    return result;
  } catch (error) {
    console.warn(warning, error);
    return { ...result, warnings: [...(result.warnings ?? []), warning] };
  }
}
