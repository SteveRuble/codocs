"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type DocumentSummary } from "@/lib/api";
import ErrorAlert from "./ErrorAlert";
import Avatar from "./Avatar";

export default function DocumentsClient() {
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setDocs(await api.listDocuments());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadDocument(file, title.trim() || undefined);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />
      <form onSubmit={onSubmit} className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title">Upload a document</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input ref={fileRef} type="file" required className="file-input file-input-bordered w-full" />
            <input
              type="text"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input input-bordered w-full"
            />
            <button className="btn btn-primary" disabled={uploading}>
              {uploading ? <span className="loading loading-spinner" /> : "Upload"}
            </button>
          </div>
          <p className="text-xs opacity-60">Plain text files up to 1MB.</p>
        </div>
      </form>

      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title">Documents</h2>
          {docs === null && !error && <span className="loading loading-spinner" />}
          {docs?.length === 0 && <p className="opacity-60">No documents yet.</p>}
          {docs && docs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Owner</th>
                    <th>Lines</th>
                    <th>Comments</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="hover">
                      <td>
                        <Link href={`/documents/${d.id}`} className="link link-primary font-medium">
                          {d.title}
                        </Link>
                        <div className="text-xs opacity-60">{d.filename}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar user={d.owner} size={6} />
                          {d.owner.name ?? d.owner.login}
                        </div>
                      </td>
                      <td>{d.lineCount}</td>
                      <td>{d.commentCount}</td>
                      <td>{new Date(d.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
