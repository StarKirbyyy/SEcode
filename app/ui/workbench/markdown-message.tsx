import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { describeMarkdownImage, safeMarkdownUrl } from "@/lib/client/markdown";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeMarkdownUrl(url) ?? ""}
        components={{
          a: ({ href, children }) => {
            const safe = safeMarkdownUrl(href);
            if (safe === undefined) return <span>{children}</span>;
            const external = safe.startsWith("http://") || safe.startsWith("https://");
            return <a href={safe} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
          },
          img: ({ src, alt }) => {
            const description = describeMarkdownImage(typeof src === "string" ? src : undefined, alt ?? undefined);
            return <span className="markdown-image">[{description.label}{description.href === undefined ? "" : " · "}{description.href === undefined ? null : <a href={description.href} target="_blank" rel="noopener noreferrer">查看安全链接</a>}]</span>;
          },
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}
