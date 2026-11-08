export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface UserRef {
  id: string;
  login: string;
  name: string | null;
  image: string | null;
}
export interface Me extends UserRef {
  githubId: string;
}
export interface DocumentSummary {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  lineCount: number;
  commentCount: number;
  owner: UserRef;
}
export interface DocumentDetail {
  id: string;
  title: string;
  filename: string;
  content: string;
  lineCount: number;
  createdAt: string;
  owner: UserRef;
}
export interface Comment {
  id: string;
  documentId: string;
  startLine: number;
  endLine: number;
  body: string;
  createdAt: string;
  author: UserRef;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let cached: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  const res = await fetch("/api/token", { cache: "no-store" });
  if (!res.ok) throw await toError(res);
  const data = (await res.json()) as { token: string; expiresAt: number };
  cached = data;
  return data.token;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    if (body?.error?.message) return new ApiError(body.error.code ?? "error", body.error.message, res.status);
  } catch {
    /* not JSON */
  }
  return new ApiError("http_error", `Request failed (${res.status})`, res.status);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("network_error", `Could not reach the API at ${API_URL}`, 0);
  }
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

export const api = {
  me: () => request<Me>("/api/me"),
  listDocuments: () => request<DocumentSummary[]>("/api/documents"),
  uploadDocument: (file: File, title?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (title) form.set("title", title);
    return request<DocumentSummary>("/api/documents", { method: "POST", body: form });
  },
  getDocument: (id: string) => request<DocumentDetail>(`/api/documents/${id}`),
  listComments: (id: string) => request<Comment[]>(`/api/documents/${id}/comments`),
  createComment: (id: string, input: { startLine: number; endLine: number; body: string }) =>
    request<Comment>(`/api/documents/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
