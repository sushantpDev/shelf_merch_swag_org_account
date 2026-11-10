import { useEffect } from "react";
import {
  Box,
  Check,
  ChevronDown,
  Headphones,
  Mail,
  MapPin,
  MessageSquare,
  Puzzle,
  UserRound,
} from "lucide-react";
import { Link } from "react-router";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { useDocsMeta } from "@/features/docs/useDocsMeta";
import "@/components/landing-page.css";
import "./public-support.css";

const SUPPORT_EMAIL = "support@shelfmerch.com";
const MAILTO = `mailto:${SUPPORT_EMAIL}`;
const supportTopics = [
  {
    icon: UserRound,
    title: "Accounts & access",
    copy: "Signing in, setting up your account, or finding your way around Shelf Merch.",
    subject: "Account and access support",
    tone: "blue",
  },
  {
    icon: Box,
    title: "Orders & delivery",
    copy: "Questions about a merch order, a delivery update, or your next kit shipment.",
    subject: "Order and delivery support",
    tone: "peach",
  },
  {
    icon: Puzzle,
    title: "Slack & integrations",
    copy: "Connecting your workspace, managing notifications, or troubleshooting a connection.",
    subject: "Slack and integration support",
    tone: "lavender",
  },
  {
    icon: MessageSquare,
    title: "Stores & programs",
    copy: "Help with company stores, product collections, budgets and platform features.",
    subject: "Store and program support",
    tone: "cream",
  },
];
const questions = [
  {
    title: "How do I contact the support team?",
    answer: (
      <>
        Email <a href={MAILTO}>{SUPPORT_EMAIL}</a> with a short description of your question.
        Include the email associated with your account and any relevant order or workspace details.
      </>
    ),
  },
  {
    title: "I can’t sign in. Where should I start?",
    answer: (
      <>
        Use the <Link to="/login">login page</Link> and select “Forgot password?” if you need to
        reset your password. If you still need help, email our support team with the account email
        and the error you see. Never share your password.
      </>
    ),
  },
  {
    title: "What should I include in an order enquiry?",
    answer: (
      <>
        Include your order reference, company name and the item or delivery you’re asking about. A
        screenshot of the issue can help us understand the request.
      </>
    ),
  },
  {
    title: "Can you help with a Slack connection?",
    answer: (
      <>
        Yes. Include your workspace name, what you were trying to do and any error message. You can
        also visit our <Link to="/integrations/slack">Slack integration page</Link> for an overview.
        Please leave passwords and access tokens out of your message.
      </>
    ),
  },
];

export function PublicSupportPage() {
  useDocsMeta({
    title: "Support | Shelf Merch",
    description:
      "Get help with your Shelf Merch account, orders, company stores and integrations. Contact our support team.",
    canonicalPath: "/support",
  });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="public-support shelf-landing">
      <Header />
      <main>
        <section className="public-support__hero" aria-labelledby="support-title">
          <div className="public-support__inner public-support__hero-grid">
            <div>
              <p className="public-support__kicker">
                <Headphones size={20} aria-hidden="true" /> HERE TO HELP
              </p>
              <h1 id="support-title">
                A little help.
                <br />
                <em>A clear way forward.</em>
              </h1>
              <p className="public-support__lead">
                From your first login to your next delivery, let’s keep your merch program moving.
              </p>
              <a className="public-support__text-link" href="#support-topics">
                Find help by topic <ChevronDown size={18} aria-hidden="true" />
              </a>
            </div>
            <aside className="public-support__email-card" aria-labelledby="support-email-heading">
              <div className="public-support__card-top">
                <span className="public-support__icon">
                  <Mail size={26} aria-hidden="true" />
                </span>
                <span>SHELF MERCH SUPPORT</span>
              </div>
              <h2 id="support-email-heading">
                Let’s sort
                <br />
                <em>it out together.</em>
              </h2>
              <p>Tell us what you need a hand with. Our team can help you find the next step.</p>
              <a className="public-support__email" href={MAILTO}>
                {SUPPORT_EMAIL}
              </a>
              <a className="public-support__btn" href={MAILTO}>
                Email our support team
              </a>
            </aside>
          </div>
        </section>

        <section
          className="public-support__section"
          id="support-topics"
          aria-labelledby="support-options-heading"
        >
          <div className="public-support__inner">
            <div className="public-support__section-heading">
              <p className="public-support__kicker">HOW CAN WE HELP?</p>
              <h2 id="support-options-heading">
                The right help.
                <br />
                <em>Right where you need it.</em>
              </h2>
            </div>
            <div className="public-support__options">
              {supportTopics.map(({ icon: Icon, title, copy, subject, tone }, index) => (
                <a
                  className={`public-support__topic public-support__topic--${tone}`}
                  href={`${MAILTO}?subject=${encodeURIComponent(subject)}`}
                  key={title}
                >
                  <div className="public-support__topic-top">
                    <span className="public-support__icon">
                      <Icon size={24} aria-hidden="true" />
                    </span>
                    <span className="public-support__number">0{index + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <span className="public-support__topic-link">Get help</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="public-support__request" aria-labelledby="support-request-heading">
          <div className="public-support__inner public-support__request-grid">
            <div>
              <p className="public-support__kicker">A GOOD PLACE TO START</p>
              <h2 id="support-request-heading">
                A few details.
                <br />
                <em>A clearer conversation.</em>
              </h2>
              <p>Help us understand your request by including these details in your email.</p>
            </div>
            <ol className="public-support__checklist">
              <li>
                <span>01</span>
                <div>
                  <h3>Your account & company</h3>
                  <p>The email you use for Shelf Merch and your company name.</p>
                </div>
                <Check size={20} aria-hidden="true" />
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>What you need help with</h3>
                  <p>Your order reference, workspace name or the feature you’re using.</p>
                </div>
                <Check size={20} aria-hidden="true" />
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>A little context</h3>
                  <p>What happened, what you expected and any relevant screenshots.</p>
                </div>
                <Check size={20} aria-hidden="true" />
              </li>
            </ol>
          </div>
        </section>

        <section className="public-support__section" aria-labelledby="support-faq-heading">
          <div className="public-support__inner public-support__faq-grid">
            <div>
              <p className="public-support__kicker">QUICK ANSWERS</p>
              <h2 id="support-faq-heading">
                Before you
                <br />
                <em>reach out.</em>
              </h2>
              <p className="public-support__faq-intro">A few answers to help you get started.</p>
            </div>
            <div className="public-support__faqs">
              {questions.map((question) => (
                <details key={question.title}>
                  <summary>
                    {question.title}
                    <ChevronDown size={20} aria-hidden="true" />
                  </summary>
                  <p>{question.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="public-support__contact-section" aria-labelledby="contact-heading">
          <div className="public-support__inner public-support__contact">
            <div>
              <p className="public-support__kicker">PEOPLE BEHIND THE PLATFORM</p>
              <h2 id="contact-heading">
                Your merch.
                <br />
                <em>Our team beside you.</em>
              </h2>
              <a className="public-support__btn" href={MAILTO}>
                Contact support
              </a>
            </div>
            <div className="public-support__company">
              <h3>Shelf Merch</h3>
              <p>A platform by Chitlu Innovations Private Limited</p>
              <div>
                <MapPin size={20} aria-hidden="true" />
                <address>
                  Win Win Towers, HiTech City Road,
                  <br />
                  Madhapur, Hyderabad, Telangana,
                  <br />
                  India 500089
                </address>
              </div>
              <a href={MAILTO}>{SUPPORT_EMAIL}</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
