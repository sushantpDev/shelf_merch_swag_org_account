import { Children, isValidElement, type ReactNode } from "react";

/** Builds the contents from the document's actual headings so anchors stay in sync. */
export function LegalArticle({ children, collapsedContents = false }: { children: ReactNode; collapsedContents?: boolean }) {
  const headings = Children.toArray(children).filter(
    (child) => isValidElement<{ id?: string; children?: ReactNode }>(child) && child.type === "h2" && child.props.id,
  );
  return (
    <div className="legal-reading-layout">
      <aside className="legal-contents">
        <details open={!collapsedContents}>
          <summary>IN THIS DOCUMENT</summary>
          <nav aria-label="Document sections">
            {headings.map((heading) => {
              if (!isValidElement<{ id: string; children: ReactNode }>(heading)) return null;
              return <a href={`#${heading.props.id}`} key={heading.props.id}>{heading.props.children}</a>;
            })}
          </nav>
        </details>
      </aside>
      <article className="legal-article">{children}</article>
    </div>
  );
}
