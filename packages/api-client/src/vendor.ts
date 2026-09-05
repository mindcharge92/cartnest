import type {
  AcceptedResponseDto,
  CreateStoreBodyDto,
  CreateVendorBodyDto,
  InviteVendorMemberBodyDto,
  PaymentProviderAccountListResponseDto,
  StoreDto,
  StoreListResponseDto,
  SubmitVendorVerificationBodyDto,
  UpdateStoreBodyDto,
  UpdateVendorMemberBodyDto,
  VendorAccessDto,
  VendorAccessListResponseDto,
  VendorMemberDto,
  VendorMemberListResponseDto,
  VendorMembershipDto,
  VendorVerificationDto,
  VendorVerificationListResponseDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

const segment = (value: string) => encodeURIComponent(value);

export function createVendorApi(client: ContractRequestClient) {
  return {
    createVendor(body: CreateVendorBodyDto): Promise<VendorAccessDto> {
      return client.request("/api/v1/vendors", { method: "POST", body });
    },

    listMine(): Promise<VendorAccessListResponseDto> {
      return client.request("/api/v1/vendors/me");
    },

    get(vendorId: string): Promise<VendorAccessDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}`);
    },

    listVerifications(vendorId: string): Promise<VendorVerificationListResponseDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/verifications`);
    },

    submitVerification(
      vendorId: string,
      body: SubmitVendorVerificationBodyDto,
    ): Promise<VendorVerificationDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/verifications`, {
        method: "POST",
        body,
      });
    },

    listStores(vendorId: string): Promise<StoreListResponseDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/stores`);
    },

    createStore(vendorId: string, body: CreateStoreBodyDto): Promise<StoreDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/stores`, {
        method: "POST",
        body,
      });
    },

    updateStore(storeId: string, body: UpdateStoreBodyDto): Promise<StoreDto> {
      return client.request(`/api/v1/stores/${segment(storeId)}`, {
        method: "PATCH",
        body,
      });
    },

    activateStore(storeId: string): Promise<StoreDto> {
      return client.request(`/api/v1/stores/${segment(storeId)}/activate`, { method: "POST" });
    },

    closeStore(storeId: string): Promise<StoreDto> {
      return client.request(`/api/v1/stores/${segment(storeId)}/close`, { method: "POST" });
    },

    listMembers(vendorId: string): Promise<VendorMemberListResponseDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/members`);
    },

    inviteMember(vendorId: string, body: InviteVendorMemberBodyDto): Promise<VendorMemberDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/members/invite`, {
        method: "POST",
        body,
      });
    },

    acceptMembership(vendorId: string): Promise<VendorMembershipDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/memberships/accept`, {
        method: "POST",
      });
    },

    updateMember(
      vendorId: string,
      memberId: string,
      body: UpdateVendorMemberBodyDto,
    ): Promise<VendorMemberDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/members/${segment(memberId)}`, {
        method: "PATCH",
        body,
      });
    },

    removeMember(vendorId: string, memberId: string): Promise<AcceptedResponseDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/members/${segment(memberId)}`, {
        method: "DELETE",
      });
    },

    listProviderAccounts(vendorId: string): Promise<PaymentProviderAccountListResponseDto> {
      return client.request(`/api/v1/vendors/${segment(vendorId)}/provider-accounts`);
    },
  };
}

export type VendorApi = ReturnType<typeof createVendorApi>;
