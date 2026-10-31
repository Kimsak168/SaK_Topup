export interface KhmerSmmProduct {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  price: number;
  basePrice: number | null;
  customerPrice: number;
  currency: "USD";
}

export interface KhmerSmmCatalog {
  currency: "USD";
  products: KhmerSmmProduct[];
}
