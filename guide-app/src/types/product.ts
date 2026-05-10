export interface ProductData {
  name: string;
  model_number: string;
  maker: string;
  price: string;
  spec_data: Record<string, string>;
  unique_selling_point: string;
  script: string;
  glossary: Record<string, string>[];
}

export interface Category {
  id: string;
  name: string;
  spec_keys: string[];
  script_hint: string;
}
