import { useMemo, useState } from "react";
import { MapPin, Plus, Palette, Layers, Handshake } from "lucide-react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { useDocsMeta } from "@/features/docs/useDocsMeta";
import careersHtml from "./pages/careers.html?raw";
import "@/components/landing-page.css";
import "./careers-page.css";

function readCareers() {
  const doc = new DOMParser().parseFromString(careersHtml, "text/html");
  return {
    jobs: Array.from(doc.querySelectorAll(".job"), (job) => ({
      number: job.querySelector(".job-no")?.textContent ?? "",
      team: job.getAttribute("data-team") ?? "",
      title: job.querySelector("h3")?.textContent ?? "",
      description: job.querySelector(".job-title span")?.textContent ?? "",
      meta: Array.from(job.querySelectorAll(".job-meta span"), (el) => el.textContent),
      body: job.querySelector(".job-body")?.innerHTML ?? "",
    })),
    values: Array.from(doc.querySelectorAll(".why-grid article"), (el) => ({
      title: el.querySelector("h3")?.textContent,
      copy: el.querySelector("p")?.textContent,
    })),
    steps: Array.from(doc.querySelectorAll(".step"), (el) => ({
      title: el.querySelector("h3")?.textContent,
      copy: el.querySelector("p")?.textContent,
    })),
  };
}

const teams = [
  { id: "all", label: "All roles" },
  { id: "creative", label: "Creative" },
  { id: "sales", label: "Sales" },
  { id: "operations", label: "Operations" },
];
const disciplines = [
  {
    icon: Palette,
    title: "Ideas into identity.",
    copy: "Design products, campaigns and experiences that bring a company’s brand to life.",
    team: "creative",
    label: "Explore creative roles",
  },
  {
    icon: Handshake,
    title: "Conversations into connections.",
    copy: "Help teams discover a more thoughtful way to welcome, recognise and connect.",
    team: "sales",
    label: "Explore sales roles",
  },
  {
    icon: Layers,
    title: "Details into delivery.",
    copy: "Bring care and precision to the work that takes every order from brief to doorstep.",
    team: "operations",
    label: "Explore operations roles",
  },
];

export function CareersPage() {
  const content = useMemo(readCareers, []);
  const [filter, setFilter] = useState("all");
  const jobs = content.jobs.filter((job) => filter === "all" || job.team === filter);
  useDocsMeta({
    title: "Careers at Shelf Merch",
    description: "Explore creative, sales and operations careers at Shelf Merch in Hyderabad.",
    canonicalPath: "/careers",
  });
  function explore(team: string) {
    setFilter(team);
    document.getElementById("openings")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div className="shelf-landing careers-site">
      <Header />
      <main className="careers-page">
        <section className="careers-hero" aria-labelledby="careers-title">
          <img
            className="careers-hero-photo"
            src="/images/careers/corporate-office-hero-v2.jpg"
            alt="Illustrative corporate team collaborating on a merchandise presentation in a modern office"
            fetchPriority="high"
          />
          <div className="careers-hero-shade" />
          <div className="careers-container careers-hero-layout">
            <div className="careers-hero-copy">
              <p className="careers-eyebrow">CAREERS AT SHELF MERCH</p>
              <h1 id="careers-title">
                Make work
                <br />
                <em>people remember.</em>
              </h1>
              <p>
                Bring your ideas, your craft and your curiosity. Help us make every branded moment
                real.
              </p>
              <a className="careers-button careers-button-white" href="#openings">
                Find your next role
              </a>
            </div>
          </div>
          <span className="careers-hero-caption">CREATIVE MINDS. HANDS-ON PEOPLE. ONE TEAM.</span>
        </section>

        <nav className="careers-jump" aria-label="Explore careers">
          <a href="#life">Life at Shelf Merch</a>
          <a href="#our-work">Find your team</a>
          <a href="#openings">
            Current openings <span>{content.jobs.length}</span>
          </a>
        </nav>

        <section className="careers-container careers-story" id="life">
          <div>
            <p className="careers-eyebrow">A SHARED PURPOSE</p>
            <h2>
              Different skills.
              <br />
              <em>One shared shelf.</em>
            </h2>
            <p>
              We bring software, design, production and fulfilment together to make every branded
              moment real.
            </p>
            <p>
              A campaign only works when the idea, design, sale, production and delivery work
              together. That is how our team is built too.
            </p>
            <a className="careers-text-link" href="#our-work">
              Discover where you fit
            </a>
          </div>
          <figure>
            <img
              src="/images/landing/resource-careful-packing.webp"
              alt="Hands carefully preparing a corporate merchandise welcome kit"
              loading="lazy"
            />
            <figcaption>
              <span>FROM IDEA TO DOORSTEP</span>There’s a little of our team in everything we make.
            </figcaption>
          </figure>
        </section>

        <section className="careers-values">
          <div className="careers-container">
            <div className="careers-section-head">
              <p className="careers-eyebrow">THE WAY WE WORK</p>
              <h2>
                Good work starts
                <br />
                <em>with good people.</em>
              </h2>
            </div>
            <div className="careers-value-grid">
              {content.values.map((value, i) => (
                <article key={value.title}>
                  <span className="careers-index">0{i + 1}</span>
                  <h3>{value.title}</h3>
                  <p>{value.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="careers-container careers-teams" id="our-work">
          <div className="careers-section-head">
            <p className="careers-eyebrow">FIND YOUR TEAM</p>
            <h2>
              Many ways to make
              <br />
              <em>something meaningful.</em>
            </h2>
          </div>
          <div className="careers-team-grid">
            {disciplines.map(({ icon: Icon, ...team }) => (
              <article key={team.team}>
                <Icon size={30} strokeWidth={1.5} aria-hidden="true" />
                <h3>{team.title}</h3>
                <p>{team.copy}</p>
                <button className="careers-text-link" onClick={() => explore(team.team)}>
                  {team.label}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="careers-openings" id="openings">
          <div className="careers-container">
            <div className="careers-open-head">
              <div>
                <p className="careers-eyebrow">CURRENT OPENINGS</p>
                <h2>
                  Your next chapter.
                  <br />
                  <em>Right here.</em>
                </h2>
              </div>
              <p>
                <MapPin size={20} aria-hidden="true" /> Hyderabad, India
                <br />
                <span>Open a role to explore the responsibilities and what we’re looking for.</span>
              </p>
            </div>
            <div className="careers-filters" role="group" aria-label="Filter jobs by team">
              {teams.map((team) => (
                <button
                  key={team.id}
                  aria-pressed={filter === team.id}
                  onClick={() => setFilter(team.id)}
                >
                  {team.label}
                  <span>
                    {team.id === "all"
                      ? content.jobs.length
                      : content.jobs.filter((job) => job.team === team.id).length}
                  </span>
                </button>
              ))}
            </div>
            <p className="careers-results" aria-live="polite">
              {jobs.length} open roles
              {filter !== "all"
                ? ` in ${teams.find((team) => team.id === filter)?.label}`
                : " across our team"}
            </p>
            <div className="careers-jobs">
              {jobs.map((job) => (
                <details className="careers-job" key={job.number}>
                  <summary>
                    <span className="careers-job-number">{job.number}</span>
                    <div>
                      <h3>{job.title}</h3>
                      <p>{job.description}</p>
                      <div className="careers-job-meta">
                        {job.meta.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    </div>
                    <Plus className="careers-expand" size={24} aria-hidden="true" />
                  </summary>
                  <div
                    className="careers-job-body"
                    dangerouslySetInnerHTML={{ __html: job.body }}
                  />
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="careers-container careers-process">
          <div>
            <p className="careers-eyebrow">WHAT HAPPENS NEXT</p>
            <h2>
              A simple hiring
              <br />
              <em>conversation.</em>
            </h2>
          </div>
          <ol>
            {content.steps.map((step, i) => (
              <li key={step.title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="careers-contact">
          <div className="careers-container">
            <div>
              <p className="careers-eyebrow">DON’T SEE YOUR ROLE?</p>
              <h2>
                Good people rarely
                <br />
                <em>fit inside one box.</em>
              </h2>
              <p>Tell us what you’re great at and the kind of work you want to do.</p>
            </div>
            <a
              className="careers-button"
              href="mailto:koneti@shelfmerch.com?subject=Careers%20at%20Shelf%20Merch"
            >
              Introduce yourself
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
