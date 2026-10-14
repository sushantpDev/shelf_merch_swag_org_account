import "./landing-page.css";
import { Catalog } from "./landing/Catalog";
import { Events } from "./landing/Events";
import { Features } from "./landing/Features";
import { FestiveBanner } from "./landing/FestiveBanner";
import { FinalCTA } from "./landing/FinalCTA";
import { Flexibility } from "./landing/Flexibility";
import { Footer } from "./landing/Footer";
import { Header } from "./landing/Header";
import { Hero } from "./landing/Hero";
import { MerchPlan } from "./landing/MerchPlan";
import { MobileCategoryNav } from "./landing/MobileCategoryNav";
import { Occasions } from "./landing/Occasions";
import { Offerings } from "./landing/Offerings";
import { Production } from "./landing/Production";
import { Quote } from "./landing/Quote";
import { Recognition } from "./landing/Recognition";
import { Solutions } from "./landing/Solutions";
import { Testimonials } from "./landing/Testimonials";
import { TrustBar } from "./landing/TrustBar";

export default function LandingPage() {
  return (
    <div className="shelf-landing">
      <main className="landing-main">
        <Header />
        <Hero />
        <MobileCategoryNav />
        <TrustBar />
        <Offerings />
        <Production />
        <Features />
        <Recognition />
        <Catalog />
        <Quote />
        <Solutions />
        <FestiveBanner />
        <Events />
        <Occasions />
        <Flexibility />
        <MerchPlan />
        <Testimonials />
        <FinalCTA />
        <Footer />
      </main>
    </div>
  );
}
