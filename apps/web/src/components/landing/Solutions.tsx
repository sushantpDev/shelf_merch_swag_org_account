import { useState, type KeyboardEvent } from "react";
import { ArrowIcon } from "./icons";
import { SOLUTIONS } from "./solutions-data";

export function Solutions() {
  const [activeIndex, setActiveIndex] = useState(0);
  const item = SOLUTIONS[activeIndex];

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next =
      (index + (event.key === "ArrowRight" ? 1 : -1) + SOLUTIONS.length) % SOLUTIONS.length;
    setActiveIndex(next);
    const buttons = event.currentTarget.parentElement?.querySelectorAll("button");
    (buttons?.[next] as HTMLButtonElement | undefined)?.focus();
  };

  return (
    <section className="section solutions" id="solutions">
      <div className="section-heading centered">
        <span className="kicker">ONE SOLUTION FOR EVERY TEAM</span>
        <h2>
          Everyone gets what they need.
          <br />
          <em>Finance gets one invoice.</em>
        </h2>
      </div>
      <div className="tabs" role="tablist" aria-label="Solutions by team">
        {SOLUTIONS.map((solution, index) => (
          <button
            key={solution.tab}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => handleKeyDown(index, event)}
          >
            {solution.tab}
          </button>
        ))}
      </div>
      <div className={`solution-panel panel-${item.color}`}>
        <div className="solution-copy">
          <span className="solution-icon">
            <svg
              aria-hidden="true"
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21c0-5 3-8 7-8s7 3 7 8" />
              <circle cx="18" cy="9" r="3" />
              <path d="M16 14c4 0 6 2 6 6" />
            </svg>
          </span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <ul>
            {item.points.map((point) => (
              <li key={point}>
                ✓ <span>{point}</span>
              </li>
            ))}
          </ul>
          <a href="#contact" className="text-link">
            Learn more
            <span>
              <ArrowIcon />
            </span>
          </a>
        </div>
        <div className="solution-visual">
          <img 
            src={item.image} 
            alt={item.title} 
            className="solution-image" 
            style={{ width: '100%', maxWidth: '600px', height: 'auto', objectFit: 'contain' }}
          />
        </div>
      </div>
    </section>
  );
}
