import type { DeliveryAddressSnapshotDto, ShipmentProviderDto, ShipmentStatusDto } from "@repo/contracts";

export interface LogisticsQuoteItem {
  readonly variantId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly weightGrams: number;
  readonly lengthMm?: number;
  readonly widthMm?: number;
  readonly heightMm?: number;
}

export interface LogisticsQuoteInput {
  readonly senderStationId?: number;
  readonly receiverStationId?: number;
  readonly origin: DeliveryAddressSnapshotDto;
  readonly destination: DeliveryAddressSnapshotDto;
  readonly items: readonly LogisticsQuoteItem[];
  readonly declaredValueMinor: bigint;
  readonly currency: string;
}

export interface LogisticsQuoteResult {
  readonly provider: ShipmentProviderDto;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly serviceCode?: string;
  readonly providerQuoteReference?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface LogisticsCreateShipmentInput {
  readonly businessReference: string;
  readonly senderStationId?: number;
  readonly receiverStationId?: number;
  readonly origin: DeliveryAddressSnapshotDto;
  readonly destination: DeliveryAddressSnapshotDto;
  readonly items: readonly LogisticsQuoteItem[];
}

export interface LogisticsCreateShipmentResult {
  readonly providerShipmentReference: string;
  readonly trackingNumber?: string;
  readonly status: ShipmentStatusDto;
  readonly metadata?: Record<string, unknown>;
}

export interface LogisticsTrackingResult {
  readonly status: ShipmentStatusDto;
  readonly message?: string;
  readonly location?: string;
  readonly eventTime: Date;
  readonly providerStatusCode?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface LogisticsProviderAdapter {
  readonly provider: ShipmentProviderDto;
  quote(input: LogisticsQuoteInput): Promise<LogisticsQuoteResult>;
  createShipment(input: LogisticsCreateShipmentInput): Promise<LogisticsCreateShipmentResult>;
  trackShipment(reference: string): Promise<LogisticsTrackingResult>;
}

function addressText(address: DeliveryAddressSnapshotDto): string {
  return [address.line1, address.line2, address.city, address.state, address.countryCode].filter(Boolean).join(", ");
}

function firstNumber(value: unknown, keys: readonly string[]): number | null {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    const raw = (value as Record<string, unknown>)[key];
    const number = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function firstString(value: unknown, keys: readonly string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return undefined;
}

function giglStatus(code: string | undefined): ShipmentStatusDto {
  const value = (code ?? "").toUpperCase();
  if (["SHD", "OKC"].includes(value)) return "DELIVERED";
  if (["OFDU", "WC"].includes(value)) return "OUT_FOR_DELIVERY";
  if (["MRTE"].includes(value)) return "RETURNING";
  if (["RSR"].includes(value)) return "RETURNED";
  if (["MSCP", "SSC"].includes(value)) return "CANCELLED";
  if (["DFA"].includes(value)) return "FAILED";
  if (["DTR", "DST", "MDSE", "MSHC", "APT", "ARP", "TRO", "GOP", "DIWN"].includes(value)) return "IN_TRANSIT";
  if (["SRFS"].includes(value)) return "PICKED_UP";
  if (["CRT", "CRH", "CRTGH", "CRTGF"].includes(value)) return "BOOKED";
  return "IN_TRANSIT";
}

export class GiglAdapter implements LogisticsProviderAdapter {
  readonly provider = "GIGL" as const;

  constructor(
    private readonly accessToken: string,
    private readonly baseUrl: string,
  ) {}

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        "access-token": this.accessToken,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GIGL_HTTP_${response.status}`);
    return body;
  }

  async quote(input: LogisticsQuoteInput): Promise<LogisticsQuoteResult> {
    if (!input.senderStationId || !input.receiverStationId) throw new Error("GIGL_STATION_REQUIRED");
    const body = {
      SenderStationId: input.senderStationId,
      ReceiverStationId: input.receiverStationId,
      VehicleType: 1,
      ReceiverLocation: { Address: addressText(input.destination), City: input.destination.city, State: input.destination.state },
      SenderLocation: { Address: addressText(input.origin), City: input.origin.city, State: input.origin.state },
      IsFromAgility: false,
      CustomerCode: "CARTNEST",
      CustomerType: 0,
      DeliveryOptionIds: [],
      PickUpOptions: 0,
      ShipmentItems: input.items.map((item) => ({
        ItemName: item.productName,
        Quantity: item.quantity,
        Weight: item.weightGrams / 1000,
        Length: item.lengthMm ? item.lengthMm / 10 : undefined,
        Width: item.widthMm ? item.widthMm / 10 : undefined,
        Height: item.heightMm ? item.heightMm / 10 : undefined,
      })),
    };
    const response = await this.request("price", { method: "POST", body: JSON.stringify(body) });
    const data = response && typeof response === "object" && "Object" in response ? (response as { Object?: unknown }).Object : response;
    const amountNaira = firstNumber(data, ["GrandTotal", "Total", "Price", "Amount", "ShippingCost"]);
    if (amountNaira === null || amountNaira < 0) throw new Error("GIGL_QUOTE_UNMAPPABLE");
    return {
      provider: "GIGL",
      amountMinor: BigInt(Math.round(amountNaira * 100)),
      currency: input.currency,
      serviceCode: firstString(data, ["ServiceCode", "DeliveryOption", "VehicleType"]),
      providerQuoteReference: firstString(data, ["QuoteReference", "Reference", "RequestId"]),
      metadata: { raw: data },
    };
  }

  async createShipment(_input: LogisticsCreateShipmentInput): Promise<LogisticsCreateShipmentResult> {
    throw new Error("GIGL_CREATE_CONTRACT_REQUIRES_SANDBOX_CONFIRMATION");
  }

  async trackShipment(reference: string): Promise<LogisticsTrackingResult> {
    const response = await this.request(`track/mobileShipment?Waybill=${encodeURIComponent(reference)}&fetchOption=1`);
    const data = response && typeof response === "object" && "Object" in response ? (response as { Object?: unknown }).Object : response;
    const latest = Array.isArray(data) ? data.at(-1) : data;
    const code = firstString(latest, ["ScanCode", "Code", "StatusCode"]);
    return {
      status: giglStatus(code),
      message: firstString(latest, ["Reason", "Comment", "Status", "Description"]),
      location: firstString(latest, ["Location", "ServiceCentre", "StationName"]),
      eventTime: new Date(firstString(latest, ["ScanDate", "DateCreated", "DateTime"]) ?? Date.now()),
      providerStatusCode: code,
      metadata: { raw: latest },
    };
  }
}
