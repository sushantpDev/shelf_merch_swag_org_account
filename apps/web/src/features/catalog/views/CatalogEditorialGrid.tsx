import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { catalogCategorySlug } from "../types";
import kitsImage from "../../../../assets/catalog/apparel-editorial/kits.png";
import teamImage from "../../../../assets/catalog/apparel-editorial/team.png";
import stationeryKitsImage from "../../../../assets/catalog/stationery-editorial/kits.png";
import stationeryTeamImage from "../../../../assets/catalog/stationery-editorial/team.png";
import bagsUseCaseImage from "../../../../assets/catalog/bags-editorial/use-case.png";
import "./catalog-editorial.css";

const COLLECTIONS = {
  apparel: {
    priority: ["T-Shirts", "T-Shirt", "Crew Neck", "Hoodies & Sweatshirts"],
    kitsImage, kitsAlt: "Branded hoodie, tote, bottle and accessories gift collection",
    kitsCopy: "Curated apparel, drinkware and more for teams, events and customer gifts.",
    teamImage, teamAlt: "A team in matching green branded polo shirts",
    teamTitle: <>Swag for<br />every team</>, teamCopy: "Outfit your people with custom apparel that builds culture.",
    storeTitle: <>Your brand.<br />Your own swag store.</>, storeCopy: "Launch a custom company store for your team, with the apparel and gear you love.",
    storeCta: "Explore company stores",
  },
  stationery: {
    priority: ["Diaries", "Pens & Pencils"],
    kitsImage: stationeryKitsImage, kitsAlt: "Journal, pen and desk essentials in a curated stationery gift box",
    kitsCopy: "Thoughtful stationery kits for new starters, team milestones and client gifts.",
    teamImage: stationeryTeamImage, teamAlt: "Coworkers sharing ideas with notebooks and stationery around an office table",
    teamTitle: <>Supplies for<br />everyone</>, teamCopy: "Make every workday your own with branded desk essentials.",
    storeTitle: <>Curate custom swag<br />for your team.</>, storeCopy: "Put your team's favourite notebooks, pens and desk essentials in one branded store.",
    storeCta: "Explore company stores",
  },
  bags: {
    priority: ["Tote Bags", "Totes", "Backpacks"],
    kitsImage, kitsAlt: "Branded tote, apparel and accessories in a curated merchandise collection",
    kitsCopy: "Pair a thoughtful carry with everyday favourites for onboarding, events and team gifts.",
    teamImage: bagsUseCaseImage, teamAlt: "A person carrying a black laptop briefcase",
    teamTitle: <>Shop by<br />use case</>, teamCopy: "From daily commutes to team adventures, find the right carry for your people.",
    storeTitle: <>Automate<br />swag gifting</>, storeCopy: "Bring branded bags, gifting and company stores together in one place.",
    storeCta: "Explore swag management",
  },
};

type Props = {
  names: string[];
  home: string;
  imageForType: (name: string) => string;
  collection: keyof typeof COLLECTIONS;
};

export function CatalogEditorialGrid({ names, home, imageForType, collection }: Props) {
  const stationery = collection === "stationery";
  const content = COLLECTIONS[collection];
  // Keep the live taxonomy; only change the presentation order of existing types.
  const priority = content.priority;
  const ordered = [...names].sort((a, b) => {
    const rank = (name: string) => priority.includes(name) ? priority.indexOf(name) : priority.length;
    return rank(a) - rank(b);
  });
  const tile = (name: string) => (
    <Link key={name} className="sm-cat-type-card" to={`${home}/category/${catalogCategorySlug(name)}`}>
      <span className="sm-cat-type-card__media">
        <img src={imageForType(name)} alt={`${name} category`} loading="lazy" width="600" height="750" />
      </span>
      <span className="sm-cat-type-card__label">{name}</span>
    </Link>
  );

  return (
    <div className={`sm-editorial-grid sm-editorial-grid--${collection}`}>
      {ordered.slice(0, 2).map(tile)}
      <Link to={`${home}/category/kits`} className="sm-editorial-promo sm-editorial-promo--kits">
        <img src={content.kitsImage} alt={content.kitsAlt} loading="lazy" width="900" height="600" />
        <div className="sm-editorial-promo__copy">
          <h2>Give swag<br />worth keeping</h2>
          <p>{content.kitsCopy}</p>
          <span className="sm-editorial-promo__cta">Explore custom kits <ArrowRight size={18} aria-hidden="true" /></span>
        </div>
      </Link>
      {stationery ? ordered.slice(2, 3).map(tile) : null}
      <Link to="/request-demo" className="sm-editorial-promo sm-editorial-promo--team">
        <img src={content.teamImage} alt={content.teamAlt} loading="lazy" width="900" height="600" />
        <div className="sm-editorial-promo__copy">
          <h2>{content.teamTitle}</h2>
          <p>{content.teamCopy}</p>
          <span className="sm-editorial-promo__cta">Let’s talk <ArrowRight size={18} aria-hidden="true" /></span>
        </div>
      </Link>
      {ordered.slice(stationery ? 3 : 2, stationery ? 6 : 5).map(tile)}
      <Link to="/platform" className="sm-editorial-promo sm-editorial-promo--store">
        <div className="sm-editorial-promo__copy">
          <h2>{content.storeTitle}</h2>
          <p>{content.storeCopy}</p>
          <span className="sm-editorial-promo__cta">{content.storeCta} <ArrowRight size={18} aria-hidden="true" /></span>
        </div>
        <img src="/images/company-shop-storefront.png" alt="Shelf Merch company store preview" loading="lazy" width="600" height="500" />
      </Link>
      {ordered.slice(stationery ? 6 : 5).map(tile)}
    </div>
  );
}
