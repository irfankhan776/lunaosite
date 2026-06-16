import { Campaign, Template, Business, SmsLog } from './types';

// No mock campaigns — real campaigns are created by running the live pipeline
// and persisted via localStorage (see App.tsx).
export const initialCampaigns: Campaign[] = [];

export const initialTemplates: Template[] = [
  {
    id: 't1',
    name: 'Barber Dark Luxury',
    niche: 'Barber',
    usedCount: 412,
    rating: 4.9,
    tag: 'Premium Luxury',
    isMostUsed: true,
  },
  {
    id: 't2',
    name: 'The Editorial',
    niche: 'Barber',
    usedCount: 221,
    rating: 4.8,
    tag: 'Editorial Brutalism',
    isMostUsed: false,
  },
  {
    id: 't3',
    name: 'Maison',
    niche: 'Salon',
    usedCount: 189,
    rating: 4.9,
    tag: 'Parisian Editorial',
    isMostUsed: false,
  },
  {
    id: 't4',
    name: 'Clarity',
    niche: 'Dentist',
    usedCount: 154,
    rating: 4.9,
    tag: 'Clinical Luxury',
    isMostUsed: true,
  },
  {
    id: 't5',
    name: 'Ironclad',
    niche: 'Roofing',
    usedCount: 78,
    rating: 4.9,
    tag: 'Industrial Authority',
    isMostUsed: false,
  },
  {
    id: 't6',
    name: 'Everest Climate',
    niche: 'HVAC',
    usedCount: 142,
    rating: 5.0,
    tag: 'Emergency Conversion Engine',
    isMostUsed: true,
  },
  {
    id: 't7',
    name: 'Iron & Grit',
    niche: 'Gym',
    usedCount: 198,
    rating: 4.9,
    tag: 'Athletic Conversion Machine',
    isMostUsed: true,
  },
  {
    id: 't8',
    name: 'Glass & Concrete',
    niche: 'Real Estate',
    usedCount: 315,
    rating: 4.9,
    tag: 'Premium Brokerage',
    isMostUsed: true,
  }
];

// No mock businesses — populated for real from live campaign deployments.
export const initialBusinesses: Business[] = [];

// No mock SMS logs — populated for real once SMS is live (Coming Soon).
export const initialSmsLogs: SmsLog[] = [];

// No mock activity feed.
export const activitiesLog: { text: string; time: string; type: string }[] = [];

export const nicheList = [
  { id: 'Barber', emoji: '💈', label: 'Barber' },
  { id: 'Salon', emoji: '💅', label: 'Salon' },
  { id: 'Dentist', emoji: '🦷', label: 'Dentist' },
  { id: 'HVAC', emoji: '❄️', label: 'HVAC' },
  { id: 'Gym', emoji: '💪', label: 'Gym' },
  { id: 'Roofing', emoji: '🏠', label: 'Roofing' },
  { id: 'Real Estate', emoji: '🏡', label: 'Real Estate' },
];
