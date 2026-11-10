import { Header } from "@/components/landing/Header";
import "@/components/landing-page.css";
import content from "../../../../api/src/static/slack-terms-content.html?raw";
import "../../../../api/src/static/slack-terms.css";

/** Trusted, repository-authored content shared with the server HTML response. */
export function SlackTermsOfServicePage() {
  return (
    <div className="slack-terms-page">
      <div className="shelf-landing slack-terms-header">
        <Header />
      </div>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}
