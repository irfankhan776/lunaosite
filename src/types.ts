export type CommandStatus = 'Active' | 'Completed' | 'Queued' | 'Crashed';
export type CampaignType = 'sms' | 'site-deploy';

export interface Campaign {
  id: string;
  name: string;
  niche: string;
  leadsFound?: number;
  sites: number;
  smsSent: number;
  claimed: number;
  status: CommandStatus;
  createdAt: string;
  templateId: string;
  errorReason?: string;
  type?: CampaignType;
}

export interface Template {
  id: string;
  name: string;
  niche: string;
  usedCount: number;
  rating: number;
  tag?: string;
  isMostUsed?: boolean;
}

export type WebStatus = 'No website' | 'Has website';
export type SiteStatus = 'Site generated' | 'SMS sent' | 'Converted' | 'Not started';

export interface SmsHistoryEntry {
  text: string;
  timestamp: string;
  type: 'outgoing' | 'incoming';
  // Real delivery state of an outgoing message. Drives the tick icon in the
  // Messages tab: 'pending' = no tick, 'sent' = single tick (sent to Telnyx),
  // 'delivered' = double tick (confirmed by Telnyx delivery report/webhook),
  // 'simulated' = no real SMS, 'failed' = red error icon.
  deliveryStatus?: 'pending' | 'sent' | 'delivered' | 'simulated' | 'failed';
  // The Telnyx message id, present for real sends so we can poll the delivery
  // status. Null for simulated.
  telnyxId?: string | null;
}

export interface Business {
  id: string;
  name: string;
  owner: string;
  phone: string;
  city: string;
  niche: string;
  webStatus: WebStatus;
  siteStatus: SiteStatus;
  slug: string;
  smsHistory: SmsHistoryEntry[];
  siteUrl: string;
}

export type SmsStatus = 'Delivered' | 'Clicked' | 'Replied' | 'Undelivered' | 'Opted Out' | 'Coming Soon';

export interface SmsLog {
  id: string;
  businessName: string;
  phone: string;
  sentAt: string;
  status: SmsStatus;
  previewLink: string;
}

export type SidebarTab = 'dashboard' | 'campaigns' | 'templates' | 'editor' | 'messages' | 'settings' | 'plans';

export interface DeployedSite {
  slug: string;
  title: string;
  niche: string;
  url: string;
  updatedAt: number | null;
}
