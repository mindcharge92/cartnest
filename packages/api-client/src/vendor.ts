import type {
  AcceptedResponseDto,
  CreateStoreBodyDto,
  CreateVendorBodyDto,
  InviteVendorMemberBodyDto,
  PaymentProviderAccountDto,
  PaymentProviderAccountListResponseDto,
  PaymentProviderDto,
  RecordPaymentProviderAccountBodyDto,
  ReviewVendorBodyDto,
  ReviewVendorVerificationBodyDto,
  StoreDto,
  StoreListResponseDto,
  SubmitVendorVerificationBodyDto,
  UpdateProviderAccountStatusBodyDto,
  UpdateStoreBodyDto,
  UpdateVendorMemberBodyDto,
  VendorAccessDto,
  VendorAccessListResponseDto,
  VendorMemberDto,
  VendorMemberListResponseDto,
  VendorMembershipDto,
  VendorDto,
  VendorListResponseDto,
  VendorStatusDto,
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

    adminList(status?: VendorStatusDto): Promise<VendorListResponseDto> {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      return client.request(`/api/v1/admin/vendors${query}`);
    },

    adminListVerifications(vendorId: string): Promise<VendorVerificationListResponseDto> {
      return client.request(`/api/v1/admin/vendors/${segment(vendorId)}/verifications`);
    },

    adminListProviderAccounts(vendorId: string): Promise<PaymentProviderAccountListResponseDto> {
      return client.request(`/api/v1/admin/vendors/${segment(vendorId)}/provider-accounts`);
    },

    adminRecordProviderAccount(
      vendorId: string,
      body: RecordPaymentProviderAccountBodyDto,
    ): Promise<PaymentProviderAccountDto> {
      return client.request(`/api/v1/admin/vendors/${segment(vendorId)}/provider-accounts`, {
        method: "PUT",
        body,
      });
    },

    adminUpdateProviderAccountStatus(
      vendorId: string,
      provider: PaymentProviderDto,
      body: UpdateProviderAccountStatusBodyDto,
    ): Promise<PaymentProviderAccountDto> {
      return client.request(
        `/api/v1/admin/vendors/${segment(vendorId)}/provider-accounts/${segment(provider)}/status`,
        { method: "POST", body },
      );
    },

    adminApprove(vendorId: string): Promise<VendorDto> {
      return client.request(`/api/v1/admin/vendors/${segment(vendorId)}/approve`, {
        method: "POST",
      });
    },

    adminReject(vendorId: string, body: ReviewVendorBodyDto): Promise<VendorDto> {
      return client.request(`/api/v1/admin/vendors/${segment(vendorId)}/reject`, {
        method: "POST",
        body,
      });
    },

    adminSuspend(vendorId: string, body: ReviewVendorBodyDto): Promise<VendorDto> {
      return client.request(`/api/v1/admin/vendors/${segment(vendorId)}/suspend`, {
        method: "POST",
        body,
      });
    },

    adminReviewVerification(
      verificationId: string,
      body: ReviewVendorVerificationBodyDto,
    ): Promise<VendorVerificationDto> {
      return client.request(
        `/api/v1/admin/vendor-verifications/${segment(verificationId)}/review`,
        {
          method: "POST",
          body,
        },
      );
    },
  };
}

export type VendorApi = ReturnType<typeof createVendorApi>;
