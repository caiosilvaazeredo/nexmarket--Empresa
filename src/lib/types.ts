/**
 * Shared data model for the Nexmarket ADMIN (Empresa) backoffice.
 *
 * The platform's three operational apps (loja / entregador / cliente) all
 * read/write ONE Firestore database (same Firebase project + named database —
 * see firebase-applet-config.json). This panel reads ALL of it and owns a few
 * new, admin-only collections.
 *
 * Existing collections (owned by the other apps — we mostly READ, and write a
 * few moderation fields):
 *   /users/{uid}                                  -> StoreUser (lojista)
 *   /supermarkets/{smId}                          -> Supermarket
 *   /supermarkets/{smId}/products/{productId}     -> Product
 *   /supermarkets/{smId}/gondolas|categories/{id} -> Category
 *   /supermarkets/{smId}/orders/{orderId}         -> Order
 *   /supermarkets/{smId}/orders/{id}/messages/{m} -> ChatMessage
 *   /supermarkets/{smId}/coupons/{CODE}           -> Coupon
 *   /drivers/{uid}                                -> DriverProfile
 *   /drivers/{uid}/payouts/{payoutId}             -> Payout
 *   /customers/{uid}                              -> CustomerProfile
 *
 * New admin-only collections (this app):
 *   /admins/{uid}                                 ★ AdminProfile  (RBAC, RNF01)
 *   /adminInvites/{email}                         ★ AdminInvite
 *   /tickets/{ticketId}                           ★ Ticket        (helpdesk)
 *   /tickets/{ticketId}/messages/{msgId}          ★ TicketMessage
 *   /auditLogs/{logId}                            ★ AuditLog      (RNF02)
 *   /blacklist/{cpf}                              ★ BlacklistEntry
 *   /platformConfig/{docId}                       ★ PlatformConfig
 *   /campaigns/{campaignId}                       ★ Campaign (cupom patrocinado)
 *   /settlements/{settlementId}                   ★ Settlement (repasse loja/entregador)
 *   /fiscalReports/{reportId}                     ★ FiscalReport (DIRF / Informe)
 */

/* ============================== Geo ============================== */
export interface GeoPoint {
  lat: number;
  lng: number;
  updatedAt?: any;
}

/* ============================== Stores ============================== */
export interface Branding {
  primaryColor?: string;
  primaryDark?: string;
  accentColor?: string;
  appName?: string;
  logoUrl?: string;
  bannerUrl?: string;
  fontFamily?: string;
}

/** Platform-set commercial terms for a partner store (RF03). */
export interface StoreFees {
  /** Commission % the platform takes from each order subtotal (e.g. 12). */
  commissionPct?: number;
  /** Fixed per-order app usage fee in BRL. */
  fixedFee?: number;
  /** Monthly SaaS fee in BRL. */
  monthlyFee?: number;
}

export type StoreApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface Supermarket {
  id: string;
  name: string;
  ownerId?: string;
  themeColor?: string;
  logoUrl?: string;
  bannerUrl?: string;
  description?: string;
  branding?: Branding;
  cnpj?: string;
  location?: GeoPoint | null;
  address?: string;
  isOpen?: boolean;
  active?: boolean;
  rating?: number;
  whatsapp?: string;
  /** Admin-owned moderation fields (written by this panel). */
  approvalStatus?: StoreApprovalStatus;
  fees?: StoreFees;
  reviewedBy?: string;
  reviewedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

/** /users/{uid} — the lojista account behind a store. */
export interface StoreUser {
  id: string;
  name?: string;
  email?: string;
  contact?: string;
  networkName?: string;
  cnpj?: string;
  role?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface DeliveryConfig {
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
  baseFee?: number;
  perKm?: number;
  freeShippingMinimum?: number;
  maxRadiusKm?: number;
  estimatedMinutes?: number;
}

export interface Category {
  id: string;
  name: string;
  imageUrl?: string;
  icon?: string;
  order?: number;
  featured?: boolean;
}

export interface Product {
  id: string;
  supermarketId?: string;
  name: string;
  price: number;
  imageUrl?: string;
  active?: boolean;
  categoryName?: string;
  stock?: number;
}

/* ============================== Drivers ============================== */
export type VehicleType = 'moto' | 'carro' | 'bike' | 'van';

export interface Vehicle {
  type?: VehicleType | string;
  plate?: string;
  model?: string;
  color?: string;
  year?: string;
}

export type DocStatus = 'pending' | 'approved' | 'rejected';

/** A single uploaded document and its independent review state (RF02). */
export interface ReviewableDoc {
  url?: string;
  status?: DocStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: any;
}

export interface DriverDocuments {
  /** Legacy flat URLs (entregador app today writes these). */
  cnhUrl?: string;
  vehicleDocUrl?: string;
  profilePhotoUrl?: string;
  proofOfResidenceUrl?: string;
  /** Overall onboarding status. */
  status?: DocStatus;
  /** Per-document review (written by this panel). */
  review?: {
    cnh?: ReviewableDoc;
    vehicleDoc?: ReviewableDoc;
    profilePhoto?: ReviewableDoc;
    proofOfResidence?: ReviewableDoc;
  };
  /** Background-check (Detran/antecedentes) automated return (RNF05). */
  backgroundCheck?: {
    status?: 'pending' | 'clear' | 'flagged' | 'error';
    provider?: string;
    score?: number;
    checkedAt?: any;
    note?: string;
  };
}

export interface BankInfo {
  holderName?: string;
  cpf?: string;
  bankName?: string;
  agency?: string;
  account?: string;
  pixKey?: string;
}

export type DriverStatus = 'online' | 'offline' | 'on_delivery';

/** Admin moderation lifecycle for a driver account (RF01). */
export type DriverApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'blocked';

export interface DriverProfile {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  photoUrl?: string;
  status?: DriverStatus;
  vehicle?: Vehicle;
  documents?: DriverDocuments;
  bank?: BankInfo;
  location?: GeoPoint | null;
  rating?: number;
  totalDeliveries?: number;
  balance?: number;
  /** Admin-owned fields (written by this panel). */
  approvalStatus?: DriverApprovalStatus;
  blockedReason?: string;
  reviewedBy?: string;
  reviewedAt?: any;
  /** SOS / panic flag raised from the driver app. */
  sos?: { active?: boolean; type?: string; note?: string; at?: any } | null;
  createdAt?: any;
  updatedAt?: any;
}

export type PayoutStatus = 'requested' | 'processing' | 'paid' | 'rejected' | 'on_hold';

export interface Payout {
  id: string;
  /** driver uid (filled in when read via collection group). */
  driverId?: string;
  driverName?: string;
  amount: number;
  status: PayoutStatus;
  method?: string;
  destination?: string;
  note?: string;
  processedBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

/* ============================== Customers ============================== */
export interface CustomerProfile {
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  cpf?: string;
  favorites?: string[];
  lastSupermarketId?: string;
  /** Admin moderation. */
  blocked?: boolean;
  blockedReason?: string;
  createdAt?: any;
  updatedAt?: any;
}

/* ============================== Orders ============================== */
export type OrderStatus =
  | 'pending'
  | 'picking'
  | 'waiting_substitution'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type DeliveryStatus =
  | 'awaiting_driver'
  | 'assigned'
  | 'going_to_store'
  | 'arrived_store'
  | 'picked_up'
  | 'going_to_customer'
  | 'delivered'
  | 'problem';

export type PaymentMethod =
  | 'pix'
  | 'card_online'
  | 'card_delivery'
  | 'cash_delivery'
  | string;

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'chargeback';

export interface PaymentInfo {
  method?: PaymentMethod;
  status?: PaymentStatus;
  provider?: 'stripe' | 'mercadopago' | 'pagarme' | string;
  tokenId?: string;
  /** Stripe: PaymentIntent/Checkout associados — permitem estorno real. */
  paymentIntentId?: string;
  checkoutSessionId?: string;
  refundId?: string;
  failureReason?: string;
  paidAt?: any;
  /** Admin refund bookkeeping. */
  refundedAmount?: number;
  refundedBy?: string;
  refundedAt?: any;
  refundReason?: string;
}

export interface OrderItem {
  productId?: string;
  name?: string;
  quantity?: number;
  price?: number;
  separated?: boolean;
  missing?: boolean;
}

export interface DeliveryAddress {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  reference?: string;
  lat?: number;
  lng?: number;
}

export interface Order {
  id: string;
  supermarketId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  status?: OrderStatus;
  deliveryStatus?: DeliveryStatus;
  items?: OrderItem[];
  subtotal?: number;
  deliveryFee?: number;
  discount?: number;
  couponCode?: string;
  total?: number;
  payment?: PaymentInfo;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  deliveryMethod?: 'delivery' | 'pickup';
  deliveryAddress?: DeliveryAddress;
  driverId?: string;
  driverName?: string;
  driverEarnings?: number;
  driverLocation?: GeoPoint | null;
  acceptedAt?: any;
  pickedUpAt?: any;
  deliveredAt?: any;
  rating?: number;
  ratingComment?: string;
  /** Admin flags. */
  flagged?: boolean;
  createdAt?: any;
  updatedAt?: any;
  /** Joined client-side. */
  storeName?: string;
}

export type ChatRole = 'driver' | 'customer' | 'store' | 'support';

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderRole: ChatRole;
  createdAt?: any;
}

export interface Coupon {
  code: string;
  type?: 'percent' | 'fixed' | 'free_shipping';
  value?: number;
  active?: boolean;
  description?: string;
}

/* ============================== ADMIN: RBAC ============================== */
export type AdminRole = 'master' | 'support' | 'finance' | 'compliance' | 'viewer';

export interface AdminProfile {
  uid: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  photoUrl?: string;
  lastLoginAt?: any;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface AdminInvite {
  email: string;
  role: AdminRole;
  invitedBy?: string;
  createdAt?: any;
}

/* ============================== ADMIN: Helpdesk ============================== */
export type TicketChannel = 'customer' | 'store' | 'driver';
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TicketCategory =
  | 'order_issue'
  | 'delivery_problem'
  | 'payment'
  | 'billing'
  | 'document'
  | 'account'
  | 'fraud'
  | 'sos'
  | 'other';

export interface Ticket {
  id: string;
  channel: TicketChannel;
  status: TicketStatus;
  priority: TicketPriority;
  category?: TicketCategory;
  subject: string;
  /** Last message preview for the inbox list. */
  preview?: string;
  /** The end-user who opened it. */
  requesterId?: string;
  requesterName?: string;
  requesterEmail?: string;
  /** Optional linked records ("Mesa de Resolução"). */
  orderId?: string;
  supermarketId?: string;
  driverId?: string;
  customerId?: string;
  assignedTo?: string;
  assignedToName?: string;
  unread?: boolean;
  slaDueAt?: any;
  createdAt?: any;
  updatedAt?: any;
  resolvedAt?: any;
  resolvedBy?: string;
}

export interface TicketMessage {
  id: string;
  text: string;
  /** 'agent' = an operator on this panel; otherwise the requester side. */
  authorRole: 'agent' | TicketChannel | 'system';
  authorId: string;
  authorName?: string;
  internal?: boolean; // private note, not shown to requester
  attachmentUrl?: string;
  createdAt?: any;
}

/** Saved canned responses (RF07). */
export interface Macro {
  id: string;
  title: string;
  body: string;
  category?: string;
}

/* ============================== ADMIN: Audit (RNF02) ============================== */
export type AuditAction =
  | 'driver.approve'
  | 'driver.reject'
  | 'driver.block'
  | 'driver.doc.approve'
  | 'driver.doc.reject'
  | 'store.approve'
  | 'store.reject'
  | 'store.suspend'
  | 'store.fees.update'
  | 'order.refund'
  | 'order.flag'
  | 'payout.approve'
  | 'payout.reject'
  | 'payout.hold'
  | 'settlement.create'
  | 'settlement.pay'
  | 'ticket.resolve'
  | 'ticket.assign'
  | 'campaign.create'
  | 'campaign.update'
  | 'blacklist.add'
  | 'blacklist.remove'
  | 'admin.invite'
  | 'admin.update'
  | 'admin.deactivate'
  | 'fiscal.generate'
  | 'config.update'
  | string;

export interface AuditLog {
  id: string;
  action: AuditAction;
  actorId: string;
  actorName?: string;
  actorRole?: AdminRole;
  /** Human-readable target (e.g. "Entregador João · uid abc"). */
  target?: string;
  targetType?: 'driver' | 'store' | 'customer' | 'order' | 'payout' | 'ticket' | 'campaign' | 'admin' | 'config' | string;
  targetId?: string;
  before?: any;
  after?: any;
  note?: string;
  createdAt?: any;
}

/* ============================== ADMIN: Blacklist ============================== */
export interface BlacklistEntry {
  /** doc id = normalized CPF (digits only). */
  cpf: string;
  name?: string;
  reason?: string;
  scope?: 'driver' | 'customer' | 'all';
  addedBy?: string;
  createdAt?: any;
}

/* ============================== ADMIN: Finance ============================== */
export type SettlementType = 'store' | 'driver';
export type SettlementStatus = 'pending' | 'scheduled' | 'paid' | 'failed' | 'on_hold';

/** A repasse (split payout) to a store or driver for a period (RF08). */
export interface Settlement {
  id: string;
  type: SettlementType;
  /** supermarketId or driver uid. */
  partyId: string;
  partyName?: string;
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string;
  gross: number; // gross sales / earnings in the period
  fees: number; // platform commission + fees withheld
  net: number; // amount to transfer
  status: SettlementStatus;
  method?: string; // PIX, TED...
  destination?: string;
  ordersCount?: number;
  note?: string;
  processedBy?: string;
  createdAt?: any;
  updatedAt?: any;
  paidAt?: any;
}

/* ============================== ADMIN: Campaigns (RF10) ============================== */
export type CampaignPayer = 'platform' | 'store';

export interface Campaign {
  id: string;
  code: string;
  title?: string;
  type: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  payer: CampaignPayer;
  /** When payer = 'store', which store funds it (optional, else all). */
  supermarketId?: string;
  minSubtotal?: number;
  maxDiscount?: number;
  budget?: number;
  usedCount?: number;
  active?: boolean;
  startsAt?: any;
  expiresAt?: any;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

/* ============================== ADMIN: Fiscal (RF09) ============================== */
export interface FiscalReport {
  id: string;
  year: number;
  type: 'driver' | 'store';
  partyId: string;
  partyName?: string;
  document?: string; // CPF/CNPJ
  totalGross: number;
  totalFees: number;
  totalNet: number;
  ordersCount?: number;
  generatedBy?: string;
  createdAt?: any;
}

/* ============================== ADMIN: Platform config ============================== */
export interface PlatformConfig {
  /** Default commission % applied to new stores. */
  defaultCommissionPct?: number;
  defaultFixedFee?: number;
  /** Integration seams (RNF05). */
  paymentsProvider?: string;
  paymentsApiUrl?: string;
  backgroundCheckApiUrl?: string;
  companyName?: string;
  companyCnpj?: string;
  updatedBy?: string;
  updatedAt?: any;
}
