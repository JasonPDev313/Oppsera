import type {
  PaymentProvider,
  AuthorizeRequest,
  AuthorizeResponse,
  CaptureRequest,
  CaptureResponse,
  SaleRequest,
  SaleResponse,
  VoidRequest,
  VoidResponse,
  RefundRequest,
  RefundResponse,
  InquireResponse,
  TokenizeRequest,
  TokenizeResponse,
  CreateProfileRequest,
  CreateProfileResponse,
  ProfileResponse,
  SettlementStatusResponse,
  FundingStatusResponse,
  VoidByOrderIdRequest,
  ProviderCredentials,
} from '../interface';
import { CardPointeClient, CardPointeTimeoutError } from './client';
import { extractCardLast4, detectCardBrand } from '../../helpers/amount';

/**
 * Map CardPointe respstat to our generic status.
 */
function mapResponseStatus(respstat: string): 'approved' | 'declined' | 'retry' {
  switch (respstat) {
    case 'A':
      return 'approved';
    case 'B':
      return 'retry';
    case 'C':
    default:
      return 'declined';
  }
}

/**
 * CardPointe implementation of the PaymentProvider interface.
 * Handles mapping between our generic types and CardPointe's API format.
 */
export class CardPointeProvider implements PaymentProvider {
  readonly code = 'cardpointe';
  private client: CardPointeClient;

  constructor(credentials: ProviderCredentials, merchantId: string) {
    this.client = new CardPointeClient({
      site: credentials.site,
      merchantId,
      username: credentials.username,
      password: credentials.password,
      sandbox: credentials.sandbox === 'true',
      authorizationKey: credentials.authorizationKey,
      achUsername: credentials.achUsername,
      achPassword: credentials.achPassword,
      fundingUsername: credentials.fundingUsername,
      fundingPassword: credentials.fundingPassword,
    });
  }

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResponse> {
    const cpRequest: Record<string, unknown> = {
      merchid: request.merchantId,
      account: request.token,
      amount: request.amount,
      expiry: request.expiry,
      cvv2: request.cvv,
      currency: request.currency,
      orderid: request.orderId,
      capture: request.capture,
      ecomind: request.ecomind,
      name: request.name,
      address: request.address,
      postal: request.postal,
      receipt: request.receipt ?? 'Y',
      userfields: request.userfields,
      // ACH-specific fields — CardPointe uses these on the same /auth endpoint
      accttype: request.achAccountType,
      achEntryCode: request.achSecCode,
      achDescription: request.achDescription,
      bankaba: request.bankaba,
    };

    // Clean undefined values
    const cleaned = Object.fromEntries(
      Object.entries(cpRequest).filter(([, v]) => v !== undefined),
    );

    try {
      const resp = await this.client.authorize(cleaned as any);
      return {
        providerRef: resp.retref,
        authCode: resp.authcode || null,
        amount: resp.amount,
        status: mapResponseStatus(resp.respstat),
        responseCode: resp.respcode,
        responseText: resp.resptext,
        token: resp.token || null,
        cardLast4: resp.token ? extractCardLast4(resp.token) : null,
        cardBrand: resp.token ? detectCardBrand(resp.token.slice(1)) : null, // skip leading '9'
        avsResponse: resp.avsresp || null,
        cvvResponse: resp.cvvresp || null,
        rawResponse: resp as unknown as Record<string, unknown>,
      };
    } catch (err) {
      if (err instanceof CardPointeTimeoutError) {
        // Timeout recovery: try inquireByOrderId
        return this.handleAuthTimeout(request);
      }
      throw err;
    }
  }

  async capture(request: CaptureRequest): Promise<CaptureResponse> {
    const cpRequest: Record<string, string> = {
      merchid: request.merchantId,
      retref: request.providerRef,
    };
    if (request.amount) cpRequest.amount = request.amount;

    const resp = await this.client.capture(cpRequest as any);
    return {
      providerRef: resp.retref,
      amount: resp.amount,
      status: mapResponseStatus(resp.respstat),
      responseCode: resp.respcode,
      responseText: resp.resptext,
      rawResponse: resp as unknown as Record<string, unknown>,
    };
  }

  async sale(request: SaleRequest): Promise<SaleResponse> {
    // Sale = authorize with capture='Y'
    return this.authorize({ ...request, capture: 'Y' });
  }

  async void(request: VoidRequest): Promise<VoidResponse> {
    const resp = await this.client.voidTransaction({
      merchid: request.merchantId,
      retref: request.providerRef,
    });
    return {
      providerRef: resp.retref,
      status: mapResponseStatus(resp.respstat),
      responseCode: resp.respcode,
      responseText: resp.resptext,
      rawResponse: resp as unknown as Record<string, unknown>,
    };
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const cpRequest: Record<string, string> = {
      merchid: request.merchantId,
      retref: request.providerRef,
    };
    if (request.amount) cpRequest.amount = request.amount;

    const resp = await this.client.refund(cpRequest as any);
    return {
      providerRef: resp.retref,
      amount: resp.amount,
      status: mapResponseStatus(resp.respstat),
      responseCode: resp.respcode,
      responseText: resp.resptext,
      rawResponse: resp as unknown as Record<string, unknown>,
    };
  }

  async inquire(providerRef: string, merchantId: string): Promise<InquireResponse> {
    const resp = await this.client.inquire(providerRef, merchantId);
    return {
      providerRef: resp.retref,
      amount: resp.amount,
      status: mapResponseStatus(resp.respstat),
      responseCode: resp.respcode,
      responseText: resp.resptext,
      authCode: resp.authcode || null,
      settled: resp.setlstat === 'Accepted' || resp.setlstat === 'Y',
      rawResponse: resp as unknown as Record<string, unknown>,
    };
  }

  async inquireByOrderId(orderId: string, merchantId: string): Promise<InquireResponse | null> {
    const resp = await this.client.inquireByOrderId(orderId, merchantId);
    if (!resp) return null;
    return {
      providerRef: resp.retref,
      amount: resp.amount,
      status: mapResponseStatus(resp.respstat),
      responseCode: resp.respcode,
      responseText: resp.resptext,
      authCode: resp.authcode || null,
      settled: resp.setlstat === 'Accepted' || resp.setlstat === 'Y',
      rawResponse: resp as unknown as Record<string, unknown>,
    };
  }

  async tokenize(request: TokenizeRequest): Promise<TokenizeResponse> {
    // CardSecure tokenization: POST to /cardsecure/api/v1/ccn/tokenize
    // For server-side tokenization, we use the auth endpoint with $0 amount
    // In practice, the Hosted iFrame handles client-side tokenization
    const resp = await this.client.authorize({
      merchid: 'tokenize', // placeholder — actual tokenization uses CardSecure API
      account: request.account,
      amount: '0',
      expiry: request.expiry,
      capture: 'N',
    });
    return {
      token: resp.token ?? '',
      cardLast4: resp.token ? extractCardLast4(resp.token) : null,
      cardBrand: resp.token ? detectCardBrand(resp.token.slice(1)) : null,
      expiry: request.expiry ?? null,
    };
  }

  async createProfile(request: CreateProfileRequest): Promise<CreateProfileResponse> {
    const cpRequest: Record<string, string> = {
      merchid: request.merchantId,
      account: request.token,
    };
    if (request.expiry) cpRequest.expiry = request.expiry;
    if (request.name) cpRequest.name = request.name;
    if (request.address) cpRequest.address = request.address;
    if (request.postal) cpRequest.postal = request.postal;
    if (request.profileUpdate === 'Y') {
      cpRequest.profileupdate = 'Y';
      if (request.existingProfileId) cpRequest.profile = request.existingProfileId;
    }

    const resp = await this.client.createProfile(cpRequest as any);
    return {
      profileId: resp.profileid,
      accountId: resp.acctid,
      token: resp.token,
      cardLast4: resp.token ? extractCardLast4(resp.token) : null,
      cardBrand: resp.token ? detectCardBrand(resp.token.slice(1)) : null,
    };
  }

  async getProfile(profileId: string, merchantId: string, acctId?: string): Promise<ProfileResponse> {
    const resp = await this.client.getProfile(profileId, merchantId, acctId);
    return {
      profileId: resp.profileid,
      accountId: resp.acctid,
      token: resp.token,
      cardLast4: resp.token ? extractCardLast4(resp.token) : null,
      cardBrand: resp.accttype ? resp.accttype.toLowerCase() : null,
      expiry: resp.expiry || null,
      name: resp.name || null,
    };
  }

  async deleteProfile(profileId: string, merchantId: string, acctId?: string): Promise<void> {
    await this.client.deleteProfile(profileId, merchantId, acctId);
  }

  async getSettlementStatus(date: string, merchantId: string): Promise<SettlementStatusResponse> {
    const resp = await this.client.getSettlementStatus(merchantId, date);
    return {
      merchantId: resp.merchid,
      date,
      transactions: (resp.txns || []).map((txn) => ({
        providerRef: txn.retref,
        amount: txn.amount,
        status: txn.setlstat,
        batchId: txn.batchid,
      })),
      rawResponse: resp as unknown as Record<string, unknown>,
    };
  }

  async captureSignature(providerRef: string, merchantId: string, signature: string): Promise<void> {
    await this.client.captureSignature({
      merchid: merchantId,
      retref: providerRef,
      signature,
    });
  }

  async getFundingStatus(date: string, merchantId: string): Promise<FundingStatusResponse> {
    const resp = await this.client.getFundingStatus(merchantId, date);
    return {
      merchantId: resp.merchid,
      date,
      fundingTransactions: (resp.fundings || []).map((entry) => {
        let fundingStatus: 'originated' | 'settled' | 'returned' | 'rejected';
        if (entry.achreturncode) {
          fundingStatus = 'returned';
        } else if (entry.fundingstatus === 'Settled' || entry.fundingstatus === 'Funded') {
          fundingStatus = 'settled';
        } else if (entry.fundingstatus === 'Rejected') {
          fundingStatus = 'rejected';
        } else {
          fundingStatus = 'originated';
        }

        return {
          providerRef: entry.retref,
          amount: entry.amount,
          fundingStatus,
          achReturnCode: entry.achreturncode ?? null,
          achReturnDescription: entry.achreturndescription ?? null,
          fundingDate: date,
          batchId: entry.batchid ?? null,
        };
      }),
      rawResponse: resp as unknown as Record<string, unknown>,
    };
  }

  async voidByOrderId(request: VoidByOrderIdRequest): Promise<VoidResponse> {
    const resp = await this.client.voidByOrderId({
      merchid: request.merchantId,
      orderid: request.orderId,
    });
    return {
      providerRef: resp.retref,
      status: mapResponseStatus(resp.respstat),
      responseCode: resp.respcode,
      responseText: resp.resptext,
      rawResponse: resp as unknown as Record<string, unknown>,
    };
  }

  // ── Timeout Recovery ─────────────────────────────────────────

  private async handleAuthTimeout(originalRequest: AuthorizeRequest): Promise<AuthorizeResponse> {
    console.log(`[CardPointe] Auth timeout — attempting recovery for orderId: ${originalRequest.orderId}`);

    // Step 1: Try inquireByOrderId
    const inquireResult = await this.inquireByOrderId(originalRequest.orderId, originalRequest.merchantId);
    if (inquireResult) {
      console.log(`[CardPointe] Found transaction via inquireByOrderId: ${inquireResult.providerRef}`);
      return {
        providerRef: inquireResult.providerRef,
        authCode: inquireResult.authCode,
        amount: inquireResult.amount,
        status: inquireResult.status,
        responseCode: inquireResult.responseCode,
        responseText: inquireResult.responseText,
        token: null,
        cardLast4: null,
        cardBrand: null,
        avsResponse: null,
        cvvResponse: null,
        rawResponse: inquireResult.rawResponse,
      };
    }

    // Step 2: If not found, attempt voidByOrderId 3x to prevent orphaned auth
    console.log(`[CardPointe] Transaction not found — voiding by orderId 3x`);
    for (let i = 0; i < 3; i++) {
      try {
        await this.voidByOrderId({
          merchantId: originalRequest.merchantId,
          orderId: originalRequest.orderId,
        });
        console.log(`[CardPointe] voidByOrderId succeeded on attempt ${i + 1}`);
        break;
      } catch {
        console.log(`[CardPointe] voidByOrderId attempt ${i + 1} failed`);
      }
    }

    // Return error status — the auth is in an unknown state
    return {
      providerRef: '',
      authCode: null,
      amount: originalRequest.amount,
      status: 'retry',
      responseCode: 'TIMEOUT',
      responseText: 'Authorization timed out and could not be recovered',
      token: null,
      cardLast4: null,
      cardBrand: null,
      avsResponse: null,
      cvvResponse: null,
      rawResponse: {},
    };
  }
}
