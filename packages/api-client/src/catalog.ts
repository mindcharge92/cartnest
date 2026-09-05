import type {
  CatalogProductDetailResponseDto,
  CatalogProductListResponseDto,
  CatalogQueryDto,
  CategoryListResponseDto,
  CompleteMediaUploadBodyDto,
  CreateProductBodyDto,
  CreateProductVariantFromIdsBodyDto,
  MediaUploadIntentBodyDto,
  MediaUploadIntentResponseDto,
  ProductVariantDto,
  UpdateMediaBodyDto,
  UpdateProductBodyDto,
  UpdateProductVariantBodyDto,
  VendorMediaDto,
  VendorProductDto,
  VendorProductListResponseDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

const segment = (value: string) => encodeURIComponent(value);

function catalogQuery(query: CatalogQueryDto = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function createCatalogApi(client: ContractRequestClient) {
  return {
    listCategories(): Promise<CategoryListResponseDto> {
      return client.request("/api/v1/categories");
    },

    listCatalog(query: CatalogQueryDto = {}): Promise<CatalogProductListResponseDto> {
      return client.request(`/api/v1/catalog/products${catalogQuery(query)}`);
    },

    getCatalogProduct(productId: string): Promise<CatalogProductDetailResponseDto> {
      return client.request(`/api/v1/catalog/products/${segment(productId)}`);
    },

    listStoreProducts(storeId: string): Promise<VendorProductListResponseDto> {
      return client.request(`/api/v1/stores/${segment(storeId)}/products`);
    },

    createProduct(storeId: string, body: CreateProductBodyDto): Promise<VendorProductDto> {
      return client.request(`/api/v1/stores/${segment(storeId)}/products`, {
        method: "POST",
        body,
      });
    },

    getVendorProduct(productId: string): Promise<VendorProductDto> {
      return client.request(`/api/v1/products/${segment(productId)}`);
    },

    updateProduct(productId: string, body: UpdateProductBodyDto): Promise<VendorProductDto> {
      return client.request(`/api/v1/products/${segment(productId)}`, {
        method: "PATCH",
        body,
      });
    },

    addVariant(
      productId: string,
      body: CreateProductVariantFromIdsBodyDto,
    ): Promise<ProductVariantDto> {
      return client.request(`/api/v1/products/${segment(productId)}/variants`, {
        method: "POST",
        body,
      });
    },

    updateVariant(variantId: string, body: UpdateProductVariantBodyDto): Promise<ProductVariantDto> {
      return client.request(`/api/v1/variants/${segment(variantId)}`, {
        method: "PATCH",
        body,
      });
    },

    publishProduct(productId: string): Promise<VendorProductDto> {
      return client.request(`/api/v1/products/${segment(productId)}/publish`, { method: "POST" });
    },

    archiveProduct(productId: string): Promise<VendorProductDto> {
      return client.request(`/api/v1/products/${segment(productId)}/archive`, { method: "POST" });
    },

    createMediaUploadIntent(body: MediaUploadIntentBodyDto): Promise<MediaUploadIntentResponseDto> {
      return client.request("/api/v1/media/upload-intents", { method: "POST", body });
    },

    completeMediaUpload(
      mediaId: string,
      body: CompleteMediaUploadBodyDto = {},
    ): Promise<VendorMediaDto> {
      return client.request(`/api/v1/media/${segment(mediaId)}/complete`, {
        method: "POST",
        body,
      });
    },

    updateMedia(mediaId: string, body: UpdateMediaBodyDto): Promise<VendorMediaDto> {
      return client.request(`/api/v1/media/${segment(mediaId)}`, {
        method: "PATCH",
        body,
      });
    },

    deleteMedia(mediaId: string): Promise<VendorMediaDto> {
      return client.request(`/api/v1/media/${segment(mediaId)}`, { method: "DELETE" });
    },
  };
}

export type CatalogApi = ReturnType<typeof createCatalogApi>;
