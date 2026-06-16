export type CommandStatus = 'Active' | 'Completed' | 'Queued' | 'Crashed';

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

export type SidebarTab = 'dashboard' | 'campaigns' | 'templates' | 'editor' | 'bookings' | 'messages' | 'settings' | 'plans';

export interface DeployedSite {
  slug: string;
  title: string;
  niche: string;
  url: string;
  updatedAt: number | null;
}
