import type { PublicCatalogCategory } from "@/services/api-bridge";
import type { UiProduct } from "./model";

export const flatCategories: PublicCatalogCategory[] = ["Apparel", "Bags", "Drinkware", "Office", "Technology"].map((name, index) => ({
  _id: `production-${index}`, name, slug: name.toLowerCase(), sortOrder: index, children: [],
}));
export const flatProducts: UiProduct[] = [
  { id: "tee", nm: "Team Tee", category: "Apparel", subcategory: "Apparel", childCategory: "Crew Neck" },
  { id: "bag", nm: "Laptop Backpack", category: "Accessories", subcategory: "Bags", childCategory: "Backpacks" },
  { id: "mug", nm: "Ceramic Mug", category: "Accessories", subcategory: "Drinkware", childCategory: "Mugs" },
  { id: "diary", nm: "Linen Diary", category: "Accessories", subcategory: "Stationery", childCategory: "Diaries" },
  { id: "charger", nm: "Wireless Dock", category: "Accessories", subcategory: "Electronics & Gadgets", categoryLabels: ["Accessories", "Electronics & Gadgets", "Gadgets", "Wireless Chargers"] },
].map((row) => ({ ...row, brand: "Shelf Merch", price: "₹ 500", sw: 0, g: "", photoUrl: "/product.png" }));
