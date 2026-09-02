import { CategoryAdminSection } from "./category-admin-section";
import { CategoryDialog } from "./category-dialog";
import type { AdminCategory, AdminProduct } from "@/types/staff";

export function MenuAdminBoard({
  restaurantId,
  slug,
  categories,
  products,
}: {
  restaurantId: string;
  slug: string;
  categories: AdminCategory[];
  products: AdminProduct[];
}) {
  const uncategorized = products.filter((p) => !p.category_id);

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <div className="flex justify-end">
        <CategoryDialog restaurantId={restaurantId} slug={slug} />
      </div>

      {categories.map((category) => (
        <CategoryAdminSection
          key={category.id}
          category={category}
          products={products.filter((p) => p.category_id === category.id)}
          allCategories={categories}
          restaurantId={restaurantId}
          slug={slug}
        />
      ))}

      {uncategorized.length > 0 && (
        <CategoryAdminSection
          category={null}
          products={uncategorized}
          allCategories={categories}
          restaurantId={restaurantId}
          slug={slug}
        />
      )}
    </div>
  );
}
