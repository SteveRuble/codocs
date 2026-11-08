"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage, type Comment, type DocumentDetail } from "@/lib/api";
import ErrorAlert from "./ErrorAlert";
import Avatar from "./Avatar";

type Range = { start: number; end: number };

function rangeLabel(s: number, e: number) {
  return s === e ? `Line ${s}` : `Lines ${s}-${e}`;
}

const inRange = (r: Range | null, n: number) => r !== null && n >= r.start && n <= r.end;

export default function DocumentView({ id }: { id: string }) {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Range | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<Range | null>(null);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      setComments(await api.listComments(id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    api.getDocument(id).then(setDoc).catch((e) => setError(errorMessage(e)));
    loadComments();
    const t = setInterval(loadComments, 15000);
    return () => clearInterval(t);
  }, [id, loadComments]);

  const lines = useMemo(() => (doc ? doc.content.split(/\r?\n/) : []), [doc]);

  const countByLine = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of comments) {
      for (let l = c.startLine; l <= c.endLine; l++) m.set(l, (m.get(l) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  function clickLine(n: number, shift: boolean) {
    setHighlight(null);
    if (shift && anchor !== null) {
      setSelection({ start: Math.min(anchor, n), end: Math.max(anchor, n) });
    } else {
      setAnchor(n);
      setSelection({ start: n, end: n });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selection || !body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      await api.createComment(id, { startLine: selection.start, endLine: selection.end, body: body.trim() });
      setBody("");
      setSelection(null);
      setAnchor(null);
      await loadComments();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorAlert message={error} />
      {!doc && !error && <span className="loading loading-spinner" />}
      {doc && (
        <>
          <div>
            <Link href="/" className="link text-sm">&larr; All documents</Link>
            <h1 className="text-2xl font-bold">{doc.title}</h1>
            <p className="text-sm opacity-60">
              {doc.filename} &middot; {doc.lineCount} lines &middot; by {doc.owner.name ?? doc.owner.login}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="card overflow-x-auto bg-base-100 shadow">
              <div className="py-2 font-mono text-sm">
                {lines.map((text, i) => {
                  const n = i + 1;
                  const selected = inRange(selection, n);
                  const hl = inRange(highlight, n);
                  const count = countByLine.get(n);
                  return (
                    <div key={n} className={`flex ${selected ? "bg-primary/20" : hl ? "bg-warning/30" : ""}`}>
                      <button
                        type="button"
                        onClick={(e) => clickLine(n, e.shiftKey)}
                        className="flex w-20 shrink-0 select-none items-center justify-end gap-1 px-2 text-right opacity-70 hover:bg-base-300 hover:opacity-100"
                        title="Click to select, shift-click to extend"
                      >
                        {count ? <span className="badge badge-secondary badge-xs">{count}</span> : null}
                        {n}
                      </button>
                      <code className="whitespace-pre pl-3 pr-4">{text || " "}</code>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="space-y-4">
              <form onSubmit={submit} className="card bg-base-100 shadow">
                <div className="card-body p-4">
                  {selection ? (
                    <>
                      <h3 className="font-semibold">Comment on {rangeLabel(selection.start, selection.end)}</h3>
                      <textarea
                        className="textarea textarea-bordered w-full"
                        rows={4}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Write a comment..."
                        required
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelection(null)}>
                          Cancel
                        </button>
                        <button className="btn btn-primary btn-sm" disabled={posting}>
                          {posting ? <span className="loading loading-spinner loading-xs" /> : "Comment"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm opacity-60">
                      Click a line number to select it; shift-click another to select a range.
                    </p>
                  )}
                </div>
              </form>

              <div className="space-y-2">
                <h3 className="font-semibold">Comments ({comments.length})</h3>
                {comments.length === 0 && <p className="text-sm opacity-60">No comments yet.</p>}
                {comments.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelection(null);
                      setHighlight({ start: c.startLine, end: c.endLine });
                    }}
                    className={`card cursor-pointer bg-base-100 shadow ${
                      highlight?.start === c.startLine && highlight.end === c.endLine ? "ring-2 ring-warning" : ""
                    }`}
                  >
                    <div className="card-body gap-1 p-3">
                      <div className="flex items-center gap-2">
                        <Avatar user={c.author} size={6} />
                        <span className="text-sm font-medium">{c.author.name ?? c.author.login}</span>
                      </div>
                      <div className="text-xs opacity-60">
                        {rangeLabel(c.startLine, c.endLine)} &middot; {new Date(c.createdAt).toLocaleString()}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
