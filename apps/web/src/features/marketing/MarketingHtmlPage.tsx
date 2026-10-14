import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import "@/components/landing-page.css";
import aboutHtml from "./pages/about.html?raw";
import careersHtml from "./pages/careers.html?raw";
import platformHtml from "./pages/platform.html?raw";
import privacyHtml from "./pages/privacy.html?raw";
import termsHtml from "./pages/terms.html?raw";

type MarketingPageKey = "about" | "careers" | "platform" | "privacy" | "terms";

const PAGE_HTML: Record<MarketingPageKey, string> = {
  about: aboutHtml,
  careers: careersHtml,
  platform: platformHtml,
  privacy: privacyHtml,
  terms: termsHtml,
};

const MARKETING_PAGE_NORMALIZE_CSS = `
  :host {
    --marketing-header-offset: 70px;
    font-family: Arial, Helvetica, sans-serif;
    letter-spacing: 0;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body, main, section, article, div, p, a, button, input, textarea, select {
    font-family: Arial, Helvetica, sans-serif;
  }

  h1, h2, h3, h4, p, ul, ol, blockquote {
    margin-top: 0;
  }

  h1, h2, h3, h4 {
    font-family: Arial, Helvetica, sans-serif;
    font-weight: 780;
    letter-spacing: -0.02em;
  }

  h1 em, h2 em, h3 em, h4 em {
    font-family: Georgia, "Times New Roman", Times, serif;
    font-style: italic;
    font-weight: 400;
    letter-spacing: 0;
  }

  .hero h1,
  .cta h2,
  .final h2,
  .help h2 {
    font-size: clamp(48px, 5.6vw, 86px) !important;
    line-height: 1.05 !important;
    letter-spacing: -0.02em !important;
    margin: 22px 0 20px !important;
  }

  .hero:has(.hero-collage) h1 {
    font-size: clamp(56px, 6.2vw, 96px) !important;
    line-height: 0.88 !important;
    margin: 20px 0 16px !important;
  }

  h2,
  .headline h2,
  .section-head h2,
  .control h2,
  .control-head h2,
  .manifesto h2,
  .story h2,
  .made h2,
  .principles h2,
  .stores h2,
  .open-head h2 {
    font-size: clamp(32px, 3.6vw, 54px) !important;
    line-height: 0.95 !important;
    letter-spacing: -0.065em !important;
    margin: 12px 0 16px !important;
  }

  h3,
  .feature h3,
  .swag-card h3,
  .gift-card h3,
  .model-grid h3,
  .brief-grid h3,
  .job-title h3,
  .timeline h3,
  .control-grid h3,
  .why-grid h3 {
    font-size: clamp(20px, 1.9vw, 30px) !important;
    line-height: 1.05 !important;
    letter-spacing: -0.04em !important;
    margin: 12px 0 8px !important;
  }

  p,
  li,
  .copy p,
  .copy li,
  .hero-copy > p,
  .intro > p,
  .intro p,
  .section-head > p,
  .control-head p,
  .section-heading p,
  .stores-copy > p,
  .made-copy > p,
  .story-head > p,
  .open-head p,
  .feature > p,
  .swag-card > p,
  .gift-card > p,
  .model-grid p,
  .brief-grid p,
  .why-grid p,
  .job-body p,
  .job-body li {
    font-size: 15.5px !important;
    line-height: 1.7 !important;
    letter-spacing: 0 !important;
  }

  small,
  .copy em,
  .title em,
  .toc a,
  .clean-list li,
  .process b,
  .process p,
  .step p,
  .summary-grid p,
  .data-card p,
  .job-meta span,
  .job-title span,
  .job-apply p {
    font-size: 12.5px !important;
    line-height: 1.55 !important;
    letter-spacing: 0 !important;
  }

  .kicker,
  .eyebrow,
  .number,
  .mini-label,
  .toc > span,
  .date,
  .card-top,
  .job-no,
  .filters button {
    font-size: 10px !important;
    line-height: 1.2 !important;
    letter-spacing: 0.16em !important;
  }

  .hero {
    min-height: min(620px, calc(100vh - var(--marketing-header-offset))) !important;
    padding-top: 0 !important;
  }

  /* Terms / Privacy: compact legal heroes + body that actually breathe */
  .hero:has(> .intro) {
    min-height: 0 !important;
    align-items: end !important;
    padding: clamp(56px, 7vw, 88px) 7vw clamp(64px, 7vw, 92px) !important;
    grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.75fr) !important;
    gap: clamp(28px, 4vw, 56px) !important;
    overflow: hidden !important;
  }

  .hero:has(> .intro) h1 {
    font-size: clamp(52px, 6.2vw, 92px) !important;
    line-height: 0.88 !important;
    letter-spacing: -0.06em !important;
    margin: 22px 0 0 !important;
  }

  .hero:has(> .intro) .intro p {
    max-width: 380px !important;
    margin: 0 0 16px !important;
    font-size: 17px !important;
    line-height: 1.55 !important;
  }

  .hero:has(> .intro) .two,
  .hero:has(> .intro) .shape.two {
    bottom: -48px !important;
    width: 120px !important;
    height: 120px !important;
  }

  .layout:has(> .toc) {
    display: grid !important;
    max-width: none !important;
    width: 100% !important;
    padding: clamp(56px, 7vw, 96px) 7vw clamp(72px, 9vw, 120px) !important;
    grid-template-columns: 240px minmax(0, 1fr) !important;
    column-gap: clamp(40px, 5vw, 72px) !important;
    row-gap: 0 !important;
    justify-content: start !important;
    align-items: start !important;
    margin: 0 !important;
  }

  .layout:has(> .toc) > .toc {
    grid-column: 1 !important;
    grid-row: 1 !important;
    position: sticky !important;
    top: 24px !important;
    align-self: start !important;
    width: 100% !important;
    max-width: 240px !important;
    z-index: 1 !important;
  }

  .layout:has(> .toc) > :not(.toc) {
    grid-column: 2 !important;
    grid-row: 1 !important;
    min-width: 0 !important;
    max-width: 820px !important;
    position: relative !important;
    z-index: 0 !important;
  }

  .layout:has(> .toc) .note,
  .layout:has(> .toc) .notice {
    margin-bottom: 40px !important;
  }

  .hero:has(.hero-collage) {
    height: calc(100svh - var(--marketing-header-offset)) !important;
    min-height: calc(100svh - var(--marketing-header-offset)) !important;
    max-height: calc(100svh - var(--marketing-header-offset)) !important;
    align-items: center !important;
    overflow: hidden !important;
  }

  .hero-copy,
  .final,
  .cta,
  .help {
    padding-top: clamp(44px, 5vw, 68px) !important;
    padding-bottom: clamp(44px, 5vw, 68px) !important;
  }

  .hero:has(.hero-collage) .hero-copy {
    padding-top: clamp(24px, 4vh, 48px) !important;
    padding-bottom: clamp(24px, 4vh, 48px) !important;
    padding-left: 4.5vw !important;
    padding-right: 1.5vw !important;
    justify-content: center !important;
  }

  .hero:has(.hero-collage) .hero-copy > p {
    font-size: 17.5px !important;
    line-height: 1.6 !important;
    max-width: 580px !important;
  }

  .hero:has(.hero-collage) .team-note {
    margin-top: clamp(20px, 3.5vh, 36px) !important;
  }

  .hero:has(.hero-collage) .actions {
    margin-top: 24px !important;
  }

  .hero-collage {
    width: min(100%, 680px) !important;
    max-height: min(82vh, calc(100svh - var(--marketing-header-offset) - 36px)) !important;
    object-fit: contain !important;
  }

  .section,
  .manifesto,
  .model,
  .story,
  .briefs,
  .principles,
  .why,
  .openings,
  .process,
  .control,
  .gifting,
  .swag,
  .stores,
  .recognition,
  .layout {
    padding-top: 36px !important;
    padding-bottom: 36px !important;
  }

  .section-head,
  .control-head,
  .open-head,
  .split-heading {
    gap: 24px !important;
    margin-bottom: 22px !important;
  }

  .copy {
    margin-top: 16px !important;
  }

  .copy p {
    margin-bottom: 10px !important;
  }

  .toc a {
    padding: 7px 0 !important;
  }

  .clean-list li {
    padding: 8px 0 !important;
  }

  .feature,
  .swag-card,
  .gift-card,
  .model-grid article,
  .brief-grid article,
  .why-grid article {
    padding: 22px !important;
  }

  .control-grid article.control-card,
  .control-grid .control-card {
    padding: 0 !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  .control-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 18px !important;
    overflow-x: visible !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .collage,
  .hero-art {
    min-height: 560px !important;
  }

  .hero-ui {
    min-height: 0 !important;
    height: 100% !important;
    padding-top: clamp(56px, 7vh, 76px) !important;
    padding-bottom: clamp(16px, 2.5vh, 28px) !important;
    padding-right: 3vw !important;
    place-items: center end !important;
  }

  @media (min-width: 1051px) and (max-height: 760px) {
    .hero:has(.hero-collage) h1 {
      font-size: clamp(48px, 5.4vw, 78px) !important;
      margin: 14px 0 12px !important;
    }

    .hero:has(.hero-collage) .hero-copy > p {
      font-size: 16px !important;
      line-height: 1.5 !important;
    }

    .hero-collage {
      max-height: min(74vh, calc(100svh - var(--marketing-header-offset) - 28px)) !important;
      width: min(100%, 600px) !important;
    }
  }

  .dashboard {
    height: 500px !important;
    top: 11% !important;
  }

  .main-photo {
    height: 54% !important;
    top: 16% !important;
  }

  .small-photo {
    height: 28% !important;
  }

  .model-grid article,
  .brief-grid article,
  .feature,
  .swag-card,
  .gift-card {
    min-height: 430px !important;
  }

  .control-grid article,
  .why-grid article,
  .principle-grid article,
  .step {
    min-height: 210px !important;
  }

  .made,
  .made-image {
    min-height: 560px !important;
  }

  .mock,
  .gift-link,
  .gift-box {
    transform: scale(0.86) !important;
    transform-origin: bottom left !important;
  }
  .recognition .feature,
  .gifting .gift-card,
  .swag .swag-card {
    overflow: hidden !important;
  }

  .recognition .feature {
    min-height: 455px !important;
    padding-bottom: 190px !important;
  }

  .recognition .feature .mock {
    left: 28px !important;
    right: 28px !important;
    bottom: -8px !important;
    transform: scale(0.78) !important;
    transform-origin: bottom center !important;
  }

  .swag .swag-card {
    min-height: 440px !important;
    padding-bottom: 190px !important;
  }

  .swag .shirt {
    width: 150px !important;
    height: 155px !important;
    left: 12% !important;
    bottom: 30px !important;
    font-size: 46px !important;
  }

  .swag .ticket,
  .swag .bulk-stat {
    width: 170px !important;
    right: 7% !important;
    bottom: 56px !important;
    transform: rotate(4deg) scale(0.82) !important;
    transform-origin: center !important;
  }

  .swag .bulk-stat {
    transform: rotate(-3deg) scale(0.82) !important;
  }

  .swag .box-stack {
    left: 8% !important;
    bottom: 40px !important;
    transform: scale(0.72) !important;
    transform-origin: left bottom !important;
  }

  .gifting .gift-card {
    min-height: 440px !important;
    padding-bottom: 180px !important;
  }

  .gifting .gift-box {
    left: 36px !important;
    right: 36px !important;
    bottom: -18px !important;
    transform: scale(0.78) !important;
    transform-origin: bottom center !important;
  }

  .gifting .gift-link {
    bottom: 34px !important;
    transform: rotate(-2deg) scale(0.82) !important;
    transform-origin: bottom center !important;
  }

  .intro#connects {
    background: #f7f3ea !important;
    padding: 56px 5vw 64px !important;
    grid-template-columns: 1fr 0.92fr !important;
    gap: 28px 56px !important;
    overflow: visible !important;
  }

  .intro#connects .headline .kicker {
    color: #ff6d55 !important;
    letter-spacing: 0.18em !important;
    font-size: 11px !important;
  }

  .intro#connects .headline h2 {
    font-size: clamp(42px, 4.8vw, 68px) !important;
    line-height: 0.92 !important;
    letter-spacing: -0.055em !important;
    margin: 16px 0 0 !important;
    color: #121212 !important;
  }

  .intro#connects .headline h2::after {
    display: none !important;
  }

  .intro#connects > p {
    align-self: center !important;
    max-width: 560px !important;
    margin-top: 28px !important;
    color: #5f5b55 !important;
    font-size: 17px !important;
    line-height: 1.65 !important;
  }

  .intro#connects .flow-art {
    grid-column: 1 / -1 !important;
    margin-top: 4px !important;
    width: 100% !important;
    display: block !important;
  }

  .intro#connects .flow-art img {
    width: 100% !important;
    height: auto !important;
    display: block !important;
  }

  .stores.section,
  .section.stores {
    background: #fff !important;
    padding-top: 90px !important;
    padding-bottom: 90px !important;
  }

  @media (max-width: 730px) {
    .stores.section,
    .section.stores {
      padding-top: 56px !important;
      padding-bottom: 56px !important;
    }
  }

  .store-showcase {
    max-width: 1120px !important;
    height: 520px !important;
    min-height: 520px !important;
    margin: 0 auto !important;
    position: relative !important;
  }

  .store-stage {
    display: block !important;
    position: absolute !important;
    inset: 0 170px 0 0 !important;
    background: #8e68cf !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  .store-panel {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    background: transparent !important;
    border-radius: 0 !important;
    overflow: hidden !important;
    box-shadow: none !important;
  }

  .store-mock-img {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    object-position: center left !important;
    filter: none !important;
    background: transparent !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  .store-hero-img,
  .store-cta-hit,
  .store-sr-only,
  .store-proof,
  .store-float {
    display: none !important;
  }

  .stores-copy {
    display: flex !important;
    position: absolute !important;
    z-index: 3 !important;
    right: 0 !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    width: 360px !important;
    max-width: 360px !important;
    background: #fff !important;
    padding: 54px 44px !important;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.12) !important;
    flex-direction: column !important;
    align-items: center !important;
    text-align: center !important;
  }

  .stores h2 {
    font-size: 42px !important;
    line-height: 1.08 !important;
    text-align: center !important;
    margin: 0 0 20px !important;
    font-weight: 800 !important;
    color: #222 !important;
  }

  .stores h2 em {
    color: #e9599d !important;
    font-family: Arial, Helvetica, sans-serif !important;
    font-style: normal !important;
    font-weight: 800 !important;
  }

  .stores-copy > p {
    font-size: 15px !important;
    line-height: 1.65 !important;
    color: #777 !important;
    max-width: 270px !important;
    margin: 0 0 30px !important;
    text-align: center !important;
  }

  .stores .button.light {
    background: #e9599d !important;
    color: #fff !important;
    width: 150px !important;
    max-width: 150px !important;
    height: 46px !important;
    border-radius: 0 !important;
  }

  @media (max-width: 1050px) {
    .store-showcase {
      height: auto !important;
      min-height: 0 !important;
    }

    .store-stage {
      position: relative !important;
      inset: auto !important;
      min-height: 380px !important;
    }

    .store-mock-img {
      height: 380px !important;
    }

    .stores-copy {
      position: relative !important;
      right: auto !important;
      top: auto !important;
      transform: none !important;
      width: min(88%, 400px) !important;
      max-width: 400px !important;
      margin: -70px auto 0 !important;
    }
  }

  .dashboard p,
  .dashboard small,
  .dashboard b,
  .float-card b,
  .float-card small,
  .store-browser small,
  .store-browser b,
  .store-browser span,
  .store-browser i,
  .mock small,
  .mock b,
  .mock span,
  .mock p,
  .career-board small,
  .career-board b,
  .career-board span,
  .career-board em {
    font-size: revert !important;
    line-height: revert !important;
  }

  @media (max-width: 760px) {
    .hero h1,
    .cta h2,
    .final h2,
    .help h2 {
      font-size: 44px !important;
    }

    h2,
    .headline h2,
    .section-head h2,
    .control h2,
    .control-head h2,
    .manifesto h2,
    .story h2,
    .made h2,
    .principles h2,
    .stores h2,
    .open-head h2 {
      font-size: 32px !important;
    }

    p,
    li,
    .copy p,
    .copy li,
    .hero-copy > p,
    .intro > p,
    .intro p,
    .section-head > p,
    .control-head p,
    .section-heading p {
      font-size: 13px !important;
    }

    .intro#connects {
      grid-template-columns: 1fr !important;
      gap: 22px !important;
      padding: 48px 5vw 56px !important;
      overflow: visible !important;
    }

    .intro#connects > p {
      margin-top: 0 !important;
      font-size: 16px !important;
    }

    .intro#connects .flow-art {
      grid-column: 1 !important;
    }
    .section,
    .manifesto,
    .model,
    .story,
    .briefs,
    .principles,
    .why,
    .openings,
    .process,
    .control,
    .gifting,
    .swag,
    .stores,
    .recognition,
    .layout {
      padding-top: 36px !important;
      padding-bottom: 36px !important;
    }
  }

  @media (max-width: 960px) {
    main,
    section,
    .hero,
    .story,
    .made,
    .principles,
    .control,
    .gifting,
    .swag,
    .stores,
    .recognition,
    .layout,
    .intro,
    .events-section,
    .production {
      max-width: 100% !important;
      overflow-x: hidden !important;
    }

    .intro#connects {
      overflow: visible !important;
    }

    .hero,
    .story,
    .made,
    .principles,
    .control,
    .stores,
    .recognition,
    .layout,
    .intro,
    .events-section,
    .production {
      grid-template-columns: 1fr !important;
    }

    .hero:has(> .intro) {
      align-items: start !important;
      gap: 28px !important;
      padding: 48px 6vw 56px !important;
    }

    .layout:has(> .toc) {
      grid-template-columns: 1fr !important;
      gap: 28px !important;
      padding-top: 40px !important;
    }

    .layout:has(> .toc) > .toc,
    .layout:has(> .toc) > :not(.toc) {
      grid-column: 1 !important;
      grid-row: auto !important;
      max-width: 100% !important;
    }

    .layout:has(> .toc) > .toc {
      position: static !important;
    }

    .section-head,
    .control-head,
    .split-heading {
      grid-template-columns: 1fr !important;
    }

    .section-head > .kicker,
    .intro#connects .flow-art {
      grid-column: 1 / -1 !important;
    }

    .model-grid,
    .brief-grid,
    .feature-grid,
    .control-grid,
    .why-grid,
    .principle-grid,
    .choice-grid,
    .testimonial-grid,
    .event-grid,
    .catalog-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    .hero-copy,
    .made-copy,
    .production-copy,
    .events-copy,
    .stores-copy {
      padding-left: 6vw !important;
      padding-right: 6vw !important;
    }

    .collage,
    .hero-art,
    .made,
    .made-image,
    .production-image {
      min-height: 460px !important;
    }

    .hero:has(.hero-collage) {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
    }

    .hero-ui {
      height: auto !important;
      min-height: 0 !important;
      padding-top: 12px !important;
      padding-bottom: 40px !important;
    }

    .hero-collage {
      max-height: min(48vh, 400px) !important;
      width: min(100%, 460px) !important;
    }
  }

  @media (max-width: 760px) {
    :host {
      --marketing-header-offset: 60px;
    }

    h1,
    .hero h1 {
      font-size: 40px !important;
      line-height: 1.05 !important;
      letter-spacing: 0 !important;
      overflow-wrap: anywhere !important;
    }

    h2,
    .headline h2,
    .section-head h2,
    .control h2,
    .control-head h2,
    .manifesto h2,
    .story h2,
    .made h2,
    .principles h2,
    .stores h2,
    .open-head h2 {
      font-size: 31px !important;
      line-height: 1.05 !important;
      letter-spacing: 0 !important;
    }

    .hero {
      min-height: 0 !important;
    }

    .hero:has(> .intro) {
      min-height: 0 !important;
      align-items: start !important;
      padding: 40px 6vw 48px !important;
      grid-template-columns: 1fr !important;
      gap: 28px !important;
    }

    .hero:has(> .intro) h1 {
      font-size: 48px !important;
    }

    .layout:has(> .toc) {
      padding-top: 40px !important;
      padding-bottom: 64px !important;
      grid-template-columns: 1fr !important;
      gap: 28px !important;
    }

    .layout:has(> .toc) > .toc,
    .layout:has(> .toc) > :not(.toc) {
      grid-column: 1 !important;
      grid-row: auto !important;
      max-width: 100% !important;
    }

    .layout:has(> .toc) > .toc {
      position: static !important;
    }

    .hero-copy,
    .final,
    .cta,
    .help {
      padding: 44px 5vw !important;
    }

    .actions,
    .hero-actions,
    .team-actions,
    .final > div,
    .cta > div,
    .final-cta > div:last-child {
      align-items: stretch !important;
      flex-direction: column !important;
      gap: 14px !important;
      width: 100% !important;
    }

    .button,
    .header-cta,
    .actions > a,
    .hero-actions > a {
      width: 100% !important;
      max-width: 100% !important;
      text-align: center !important;
    }

    .model-grid,
    .brief-grid,
    .feature-grid,
    .control-grid,
    .why-grid,
    .principle-grid,
    .choice-grid,
    .testimonial-grid,
    .event-grid,
    .catalog-grid,
    .summary-grid,
    .data-grid,
    .open-grid,
    .job-grid {
      grid-template-columns: 1fr !important;
    }

    .model-grid article,
    .brief-grid article,
    .feature,
    .swag-card,
    .gift-card,
    .control-grid article,
    .why-grid article,
    .principle-grid article,
    .step,
    .job,
    .data-card {
      min-height: 0 !important;
      border-radius: 18px !important;
    }

    .collage,
    .hero-art,
    .made,
    .made-image,
    .production-image {
      min-height: 380px !important;
    }

    .hero-ui {
      min-height: 0 !important;
    }

    .hero-collage {
      max-height: min(42vh, 320px) !important;
    }

    .main-photo {
      width: 86% !important;
      height: 62% !important;
      top: 12% !important;
      right: -5% !important;
    }

    .small-photo {
      width: 48% !important;
      height: 31% !important;
      left: 4% !important;
      bottom: 6% !important;
      border-width: 7px !important;
    }

    .dashboard,
    .store-browser,
    .mock {
      max-width: calc(100vw - 10vw) !important;
    }

    .dashboard {
      height: auto !important;
      min-height: 320px !important;
      left: 5vw !important;
      right: 5vw !important;
      top: 46px !important;
      transform: none !important;
    }

    .model-card-foot {
      min-height: 90px !important;
      margin-top: 18px !important;
    }

    .model-visual {
      width: 38% !important;
      max-width: 130px !important;
    }

    .toc,
    .tabs {
      max-width: 100% !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
    }

    .toc a,
    .tabs button {
      white-space: nowrap !important;
    }
  }

  @media (max-width: 430px) {
    h1,
    .hero h1,
    .cta h2,
    .final h2,
    .help h2 {
      font-size: 35px !important;
    }

    h2,
    .headline h2,
    .section-head h2,
    .control h2,
    .control-head h2,
    .manifesto h2,
    .story h2,
    .made h2,
    .principles h2,
    .stores h2,
    .open-head h2 {
      font-size: 28px !important;
    }

    .feature,
    .swag-card,
    .gift-card,
    .model-grid article,
    .brief-grid article,
    .why-grid article {
      padding: 18px !important;
    }

    .control-grid article.control-card,
    .control-grid .control-card {
      padding: 0 !important;
    }
  }
`;
const PAGE_TITLE: Record<MarketingPageKey, string> = {
  about: "About Shelf Merch | Built to Make Brand Moments Real",
  careers: "Careers at Shelf Merch | Current Openings",
  platform: "Shelf Merch Platform | Every Branded Moment",
  privacy: "Privacy Policy | Shelf Merch",
  terms: "Terms & Conditions | Shelf Merch",
};

function localizeMarkup(markup: string) {
  return markup
    .replaceAll("https://shelf-merch-homepage.konetibaba.chatgpt.site/", "/")
    .replaceAll("https://shelf-merch-homepage.konetibaba.chatgpt.site", "")
    .replaceAll('href="/platform"', 'href="/platform"')
    .replaceAll('href="/about"', 'href="/about"')
    .replaceAll('href="/terms"', 'href="/terms"')
    .replaceAll('href="/privacy"', 'href="/privacy"')
    .replaceAll('href="/careers"', 'href="/careers"')
    .replaceAll('href=""', 'href="/"');
}

function parsePage(html: string) {
  const doc = new DOMParser().parseFromString(localizeMarkup(html), "text/html");
  const style = Array.from(doc.querySelectorAll("style"))
    .map((node) => node.textContent ?? "")
    .join("\n");

  doc.querySelector("header")?.remove();
  doc.querySelector("footer")?.remove();
  doc.querySelectorAll("script").forEach((node) => node.remove());

  const bodyMarkup = doc.body.innerHTML;
  return { style, bodyMarkup };
}

function useShadowHashLinks(hostRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const host = hostRef.current;
    const root = host?.shadowRoot;
    if (!root) return;

    const onClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href^='#']");
      if (!link) return;

      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;
      const targetId = decodeURIComponent(hash.slice(1));
      const section = root.getElementById(targetId);
      if (!section) return;

      event.preventDefault();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [hostRef]);
}

function useCareerFilters(hostRef: RefObject<HTMLDivElement | null>, page: MarketingPageKey) {
  useEffect(() => {
    if (page !== "careers") return;
    const host = hostRef.current;
    const root = host?.shadowRoot;
    if (!root) return;

    const onClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(".filters button");
      if (!button) return;

      const filter = button.dataset.filter ?? "all";
      root.querySelectorAll(".filters button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      root.querySelectorAll<HTMLElement>(".job").forEach((job) => {
        job.classList.toggle("hidden", filter !== "all" && job.dataset.team !== filter);
      });
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [hostRef, page]);
}

function ShadowPageBody({ page }: { page: MarketingPageKey }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const parsed = useMemo(() => parsePage(PAGE_HTML[page]), [page]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;background:#f7f3ea;color:#121212;font-family:Arial,Helvetica,sans-serif}${parsed.style}${MARKETING_PAGE_NORMALIZE_CSS}</style>${parsed.bodyMarkup}`;
  }, [parsed]);

  useShadowHashLinks(hostRef);
  useCareerFilters(hostRef, page);

  return <div ref={hostRef} />;
}

export function MarketingHtmlPage({ page }: { page: MarketingPageKey }) {
  useEffect(() => {
    document.title = PAGE_TITLE[page];
  }, [page]);

  return (
    <div className="shelf-landing">
      <Header />
      <main style={{ paddingTop: 70 }}>
        <ShadowPageBody page={page} />
      </main>
      <Footer />
    </div>
  );
}

export function AboutPage() {
  return <MarketingHtmlPage page="about" />;
}

export function CareersPage() {
  return <MarketingHtmlPage page="careers" />;
}

export function PlatformMarketingPage() {
  return <MarketingHtmlPage page="platform" />;
}

export function PrivacyPage() {
  return <MarketingHtmlPage page="privacy" />;
}

export function TermsPage() {
  return <MarketingHtmlPage page="terms" />;
}



