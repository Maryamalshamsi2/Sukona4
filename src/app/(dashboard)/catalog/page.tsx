import CatalogView from "./catalog-view";
import { getCategories, getServices, getBundles } from "./actions";
import type { Service, ServiceCategory, ServiceBundle } from "@/types";

export default async function CatalogPage() {
  const [categories, services, bundles] = await Promise.all([
    getCategories(),
    getServices(),
    getBundles(),
  ]);
  return (
    <CatalogView
      initialCategories={(categories || []) as ServiceCategory[]}
      initialServices={(services || []) as Service[]}
      initialBundles={(bundles || []) as ServiceBundle[]}
    />
  );
}
