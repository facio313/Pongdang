/** Every browser read uses the collection API; failures remain failures. */
export async function requestData<T>(
  baseUrl: string,
  path: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  signal.throwIfAborted();
  const response = await fetcher(`${baseUrl}api/data/${path}`, {
    signal,
    cache: "no-store",
  });
  const payload = await response.json();
  signal.throwIfAborted();
  if (!response.ok) {
    throw new Error(
      typeof payload.detail === "string" ? payload.detail : "요청 조건을 확인해 주세요.",
    );
  }
  return payload as T;
}
