export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/data/${path}`, {
    ...options,
    headers: options?.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options?.headers },
  });
  if (response.status === 401) {
    window.location.reload();
    throw new Error("Sua sessão terminou. Entre novamente.");
  }
  const body = await response.json().catch(() => { throw new Error("O servidor não respondeu como esperado. Tente novamente."); });
  if (!response.ok) throw new Error(body.error ?? "Não foi possível concluir a operação.");
  return body as T;
}
