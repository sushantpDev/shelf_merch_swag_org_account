const TESTIMONIALS = [
  {
    quote:
      "Shelf Merch replaced three vendors for our onboarding kits alone. Dispatch is faster, and the quality is better than what we had before.",
    name: "Aditi S.",
    role: "INNOVATEHR | HR DIRECTOR",
  },
  {
    quote:
      "We needed festival gifting across five cities. One order, five delivery locations, zero follow-up calls with Shelf Merch.",
    name: "Rohit V.",
    role: "GLOBAL REACH | HEAD OF OPERATIONS",
  },
  {
    quote:
      "I shared our new Shelf Merch store with our CEO this week. His exact words were: 'Yes! This is exactly what I've been asking for!' Thank YOU for helping us hit this out of the park.",
    name: "Sneha K.",
    role: "APEX SOLUTIONS | VP OF MARKETING",
  },
] as const;

export function Testimonials() {
  return (
    <section className="testimonial-section-v2" id="testimonials">
      <style dangerouslySetInnerHTML={{__html: `
        .testimonial-section-v2 {
          background-color: #121212;
          padding: 60px 5vw;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-family:var(--font-family-primary);
        }
        .testimonial-section-v2 .heading-wrapper {
          text-align: center;
          margin-bottom: 40px;
        }
        .testimonial-section-v2 .kicker-v2 {
          color: #72e2b8;
          font-size: 13px;
          letter-spacing: 0.15em;
          font-weight:var(--font-weight-bold);
          text-transform: uppercase;
        }
        .testimonial-section-v2 h2 {
          font-size: clamp(32px, 4vw, 46px);
          color: #ffffff;
          margin: 15px 0 0;
          font-weight:var(--font-weight-semibold);
          letter-spacing: -0.02em;
        }
        .testimonial-section-v2 .grid-v2 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 25px;
          max-width: 1100px;
          width: 100%;
        }
        .testimonial-section-v2 article {
          background-color: #fff;
          border-radius: 12px;
          padding: 40px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0,0,0,0.03);
        }
        .testimonial-section-v2 .quote-mark {
          color: #b7d5ff;
          font-size: 80px;
          line-height: 0.7;
          font-weight:var(--font-weight-bold);
          font-family:var(--font-family-primary);
          margin-bottom: 15px;
        }
        .testimonial-section-v2 p {
          font-size: 14.5px;
          line-height: 1.65;
          color: #333;
          flex: 1;
          margin: 0 0 35px;
        }
        .testimonial-section-v2 hr {
          border: none;
          border-top: 1px solid #eee;
          margin: 0 0 25px;
        }
        .testimonial-section-v2 b {
          display: block;
          font-size: 14.5px;
          color: #1a1a1a;
          margin-bottom: 6px;
        }
        .testimonial-section-v2 small {
          font-size: 10.5px;
          color: #777;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight:var(--font-weight-bold);
        }
        @media (max-width: 900px) {
          .testimonial-section-v2 .grid-v2 {
            grid-template-columns: 1fr;
          }
          .testimonial-section-v2 article {
            min-height: auto;
          }
        }
      `}} />
      <div className="heading-wrapper">
        <span className="kicker-v2">HEAR IT FROM OUR CUSTOMERS</span>
        <h2>What keeps &apos;em coming</h2>
      </div>
      <div className="grid-v2">
        {TESTIMONIALS.map((testimonial) => (
          <article key={testimonial.name}>
            <div className="quote-mark">&ldquo;</div>
            <p>{testimonial.quote}</p>
            <hr />
            <footer>
              <b>{testimonial.name}</b>
              <small>{testimonial.role}</small>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
