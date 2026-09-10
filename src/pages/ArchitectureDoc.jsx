import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function ArchitectureDoc() {
  const [content, setContent] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/";
    fetch(`${base}BoriSend_2.0_Master_Architecture.md`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md safe-area-top">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            to="/admin"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Back to admin"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-base font-semibold text-foreground">
              BoriSend 2.0 — Master Architecture
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Locked blueprint · reference only
            </p>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-4 py-6 pb-24">
        {error ? (
          <p className="text-sm text-muted-foreground">
            Could not load the architecture document.
          </p>
        ) : !content ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : (
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="mt-2 mb-4 font-heading text-2xl font-bold text-foreground">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="mt-8 mb-3 font-heading text-xl font-semibold text-foreground">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-5 mb-2 font-heading text-lg font-semibold text-foreground">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="mb-4 text-sm leading-relaxed text-foreground/90">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="mb-4 ml-5 list-disc space-y-1 text-sm leading-relaxed text-foreground/90">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-4 ml-5 list-decimal space-y-1 text-sm leading-relaxed text-foreground/90">
                  {children}
                </ol>
              ),
              li: ({ children }) => <li className="pl-1">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
              blockquote: ({ children }) => (
                <blockquote className="my-4 border-l-2 border-primary pl-4 text-sm italic text-foreground/80">
                  {children}
                </blockquote>
              ),
              code: ({ children }) => (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs leading-relaxed">
                  {children}
                </pre>
              ),
              hr: () => <hr className="my-6 border-border" />,
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                >
                  {children}
                </a>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </article>
    </div>
  );
}