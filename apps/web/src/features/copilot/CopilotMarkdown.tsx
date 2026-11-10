import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { sanitizeCopilotAssistantText } from "./sanitizeCopilotText";
import type { CopilotArtifact } from "./api";

const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), "href", "title", "target", "rel"],
    code: [...(defaultSchema.attributes?.code || []), "className"],
  },
};

/**
 * Safe Markdown for assistant bubbles (GFM tables included).
 * Product/kit card dumps are stripped only when matching card artifacts exist.
 * Markdown images are never rendered — product/kit imagery comes from cards.
 */
export function CopilotMarkdown({
  content,
  artifacts,
}: {
  content: string;
  artifacts?: CopilotArtifact[] | null;
}) {
  const cleaned = sanitizeCopilotAssistantText(content, artifacts);
  if (!cleaned) return null;

  return (
    <div className="sm-copilot-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          img: () => null,
          table: ({ children }) => (
            <div className="sm-copilot-md__table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
