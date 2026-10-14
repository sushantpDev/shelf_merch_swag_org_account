export type CatalogItem = {
  count: string;
  className: string;
  title: string;
  shortTitle: string;
  iconSize: number;
  image?: string;
  imageAlt?: string;
  to: string;
  pastel: string;
};

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    count: "01",
    className: "catalog-card catalog-blue",
    image: "/images/landing/catalog/apparel.png?v=2",
    imageAlt: "Customizable white polo shirt",
    title: "Apparel",
    shortTitle: "Apparel",
    iconSize: 32,
    to: "/app/catalog/category/apparel",
    pastel: "#c9b8ff",
  },
  {
    count: "02",
    className: "catalog-card catalog-coral",
    image: "/images/landing/catalog/drinkware.png?v=2",
    imageAlt: "Insulated water bottle",
    title: "Drinkware",
    shortTitle: "Drinkware",
    iconSize: 32,
    to: "/app/catalog/category/drinkware",
    pastel: "#72e2b8",
  },
  {
    count: "03",
    className: "catalog-card catalog-mint",
    image: "/images/landing/catalog/tech.png?v=2",
    imageAlt: "Wireless charging station",
    title: "Tech Accessories",
    shortTitle: "Gadgets",
    iconSize: 32,
    to: "/app/catalog/category/technology",
    pastel: "#ffd84a",
  },
  {
    count: "04",
    className: "catalog-card catalog-lilac",
    image: "/images/landing/catalog/bags-travel.png?v=3",
    imageAlt: "Laptop bag for travel",
    title: "Bags & Travel",
    shortTitle: "Bags",
    iconSize: 32,
    to: "/app/catalog/category/bags",
    pastel: "#ff6d55",
  },
  {
    count: "05",
    className: "catalog-card catalog-black",
    image: "/images/landing/catalog/accessories.png?v=4",
    imageAlt: "Personalized metal keychain",
    title: "Accessories",
    shortTitle: "Accessories",
    iconSize: 32,
    to: "/app/catalog/category/accessories",
    pastel: "#3155ff",
  },
  {
    count: "06",
    className: "catalog-card catalog-yellow",
    image: "/images/landing/catalog/stationery.png",
    imageAlt: "Notebook and pen stationery set",
    title: "Office Supplies",
    shortTitle: "Stationery",
    iconSize: 32,
    to: "/app/catalog/category/office-supplies",
    pastel: "#f7f3ea",
  },
  {
    count: "07",
    className: "catalog-card catalog-festive",
    image: "/images/landing/catalog/festival-hampers.png?v=4",
    imageAlt: "Festival puja hamper gift set",
    title: "Festival Hampers",
    shortTitle: "Kits",
    iconSize: 32,
    to: "/app/catalog/category/kits",
    pastel: "#c9b8ff",
  },
  {
    count: "08",
    className: "catalog-card catalog-outline",
    image: "/images/landing/catalog/ready-to-order.png?v=3",
    imageAlt: "Ready-to-order notebook and pen gift set",
    title: "Made-to-Order",
    shortTitle: "Lifestyle",
    iconSize: 32,
    to: "/app/catalog/category/kits",
    pastel: "#72e2b8",
  },
];

/** Primary mobile category strip order (matches homepage priority). */
export const MOBILE_CATEGORY_ORDER = [
  "Apparel",
  "Drinkware",
  "Office Supplies",
  "Tech Accessories",
  "Bags & Travel",
  "Accessories",
  "Festival Hampers",
  "Made-to-Order",
] as const;

export function getOrderedCatalogItems() {
  return MOBILE_CATEGORY_ORDER.map((title) =>
    CATALOG_ITEMS.find((item) => item.title === title)!,
  ).filter(Boolean);
}
