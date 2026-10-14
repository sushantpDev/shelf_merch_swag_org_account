export function Flexibility() {
  return (
    <section className="section flexibility">
      <div className="section-heading centered">
        <span className="kicker">TOTAL FLEXIBILITY</span>
        <h2>
          You decide how <em>the gifting works.</em>
        </h2>
        <p>Choosing the exact item doesn&apos;t have to be on you, unless you want it to be.</p>
      </div>
      <div className="choice-grid">
        <article className="choice-one">
          <span>01</span>
          <div className="choice-art choice-art-one">
            <img src="/images/landing/flexibility/recipient-choice.png" alt="" />
          </div>
          <h3>Recipient&apos;s choice</h3>
          <p>Give a wallet balance or points and let people pick what they actually want.</p>
        </article>
        <article className="choice-two">
          <span>02</span>
          <div className="choice-art choice-art-two">
            <img src="/images/landing/flexibility/sender-choice.png" alt="" />
          </div>
          <h3>Sender&apos;s choice</h3>
          <p>Handpick specific items and send exactly what you intend.</p>
        </article>
        <article className="choice-three">
          <span>03</span>
          <div className="choice-art choice-art-three">
            <img src="/images/landing/flexibility/team-to-team.png" alt="" />
          </div>
          <h3>Team-to-team</h3>
          <p>Let employees recognize each other with points redeemable for merch.</p>
        </article>
      </div>
    </section>
  );
}
