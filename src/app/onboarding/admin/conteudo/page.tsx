import { listAllCategories } from "@/lib/onboarding/db";
import { CategoryManager } from "@/components/onboarding/admin/category-manager";

export const metadata = { title: "Conteúdo — Onboarding CMS" };

export default async function AdminContent() {
  const categories = await listAllCategories();
  return <CategoryManager categories={categories} />;
}
