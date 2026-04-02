export type Category = 'paint' | 'wiring' | 'electrical' | 'oils' | 'pipeline' | 'construction';
export type Unit = 'qty' | 'kg' | 'lb' | 'ft' | 'm' | 'yd' | 'pc';

export interface Variation {
  id: string;
  name: string;
  price: number;
  stock: number;
  barcode?: string;
  unit?: Unit;
  discountPrice?: number;
  costPrice?: number;
  offerLabel?: string;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  price: number;
  stock: number;
  image?: string;
  images?: string[];
  barcode?: string;
  description?: string;
  discountPrice?: number;
  costPrice?: number;
  offerLabel?: string;
  published?: boolean;
  variations?: Variation[];
  unit?: Unit;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'seller';
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  vpBlocked?: boolean;
  vpBalance: number;
  totalPurchases: number;
  purchaseCount: number;
  active?: boolean;
  lastPurchaseAt?: any;
}

export interface LoyaltySettings {
  pointsPerRupee: number;
  pointsToRupee: number;
  redeemEnabled: boolean;
}

export interface SaleItem {
  productId: string;
  variationId?: string;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  maxStock?: number;
  unit?: Unit;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  profit?: number;
  sellerId: string;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  vp?: {
    earned: number;
    redeemed: number;
    redeemedAmount: number;
    balance: number;
  };
  timestamp: any; // Firestore Timestamp
}
