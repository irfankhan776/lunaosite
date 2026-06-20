import React, { useState, useRef, useEffect } from 'react';
import { Campaign, Template, Business, SmsLog } from '../types';
import {
  Plus, Play, Pause, Trash2, Eye, ChevronRight, Upload,
  MapPin, Sliders, CheckCircle, Smartphone, SlidersHorizontal, Loader2, Sparkles, Check, Minus, Info, Users, Star, X, ShieldAlert, Send, Globe, Key, Compass, ShieldCheck, Layout
} from 'lucide-react';
import { nicheList } from '../data';
import { getTemplateContent, getNicheBgImage } from './Templates';
import { playGentleChime, playLaunchSwell, playVictoryCelebration, playSoftTap, playSoftBubble, playElegantBell, playSlideTick, playElegantError, playTiktokLike } from '../utils/audio';
import { CelebrationEffect } from './CelebrationEffect';
import { validateCsvFile, runCampaign, PipelineLead, PipelineResultRow, CsvValidation, listCustomTemplates, CustomTemplate } from '../lib/pipelineClient';

interface CampaignsProps {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  templates: Template[];
  businesses: Business[];
  setBusinesses: React.Dispatch<React.SetStateAction<Business[]>>;
  addSmsLog: (newLogs: any[]) => void;
  setActiveTab?: (tab: any) => void;
  selectedNiche?: string;
  setSelectedNiche?: (niche: string) => void;
  userPlan?: string;
  userCredits: number;
  setUserCredits: React.Dispatch<React.SetStateAction<number>>;
  telnyxKey?: string;
  telnyxPhone?: string;
}

const getCityCoords = (city: string) => {
  const c = city.toLowerCase();
  if (c.includes('toronto')) return { lat: '43.6532° N', lng: '79.3832° W' };
  if (c.includes('vancouver')) return { lat: '49.2827° N', lng: '123.1207° W' };
  if (c.includes('calgary')) return { lat: '51.0447° N', lng: '114.0719° W' };
  if (c.includes('austin')) return { lat: '30.2672° N', lng: '97.7431° W' };
  return { lat: '43.7000° N', lng: '79.4200° W' };
};

const getTemplateMetaForNiche = (niche: string, id: string) => {
  const isClassic = id === 't1' || id === 't3' || id === 't5' || id === 't7' || id === 't9' || id === 't11' || id === 't13';
  switch (niche) {
    case 'Barber':
      return {
        color: 'from-[#1a1916] to-black',
        desc: 'Dark luxury Italian-meets-modern editorial style. Playfair serif headings paired with clean Nunito Sans, with warm premium gold accent separators.',
        logoEmoji: '💈',
        brandName: 'BARBER DARK LUXURY'
      };
    case 'Salon':
      return {
        color: isClassic ? 'from-rose-500 to-pink-900' : 'from-purple-900 to-pink-950',
        desc: isClassic 
          ? 'Elegant pastel accents, high-fashion containers, soft serif typography.' 
          : 'Sleek luxury alignment, full-screen product grids, fluid animations.',
        logoEmoji: '💅',
        brandName: 'SALON PRO'
      };
    case 'Dentist':
      return {
        color: isClassic ? 'from-sky-500 to-blue-800' : 'from-teal-800 to-cyan-950',
        desc: isClassic 
          ? 'Clinical sky-blue layouts, safety badges, automated scheduling anchors.' 
          : 'Ultramodern organic medical blocks, simple digital intake flow.',
        logoEmoji: '🦷',
        brandName: 'CLEAN DENTAL'
      };
    case 'HVAC':
      return {
        color: isClassic ? 'from-teal-600 to-blue-900' : 'from-orange-600 to-amber-950',
        desc: isClassic 
          ? 'Hot-and-cold contrasting sliders, instant dispatch confirmation maps.' 
          : 'Eco-efficient green badge system, dynamic smart air filtering logs.',
        logoEmoji: '❄️',
        brandName: 'CLIMATE ECO'
      };
    case 'Gym':
      return {
        color: isClassic ? 'from-slate-850 to-red-950' : 'from-yellow-600 to-zinc-950',
        desc: isClassic 
          ? 'Gritty steel aesthetics, clean membership pricing grids, highlight frames.' 
          : 'Sleek dark tracker tables, energetic contrast lists, training calendar.',
        logoEmoji: '💪',
        brandName: 'MODERN GYM'
      };
    case 'Roofing':
      return {
        color: isClassic ? 'from-orange-850 to-amber-950' : 'from-slate-800 to-neutral-900',
        desc: isClassic 
          ? 'Storm-warning accent banners, direct free roof inspection forms.' 
          : 'Premium residential asphalt shingle displays, direct estimator sliders.',
        logoEmoji: '🏠',
        brandName: 'SHINGLE SHIELD'
      };
    case 'Real Estate':
      return {
        color: isClassic ? 'from-emerald-800 to-teal-950' : 'from-zinc-900 to-zinc-950',
        desc: isClassic 
          ? 'Elegant property showcases, broker contact forms, and market stats.' 
          : 'Sleek luxury architectural galleries, virtual tour embeds.',
        logoEmoji: '🏡',
        brandName: 'APEX ESTATES'
      };
    default:
      return {
        color: 'from-neutral-800 to-stone-950',
        desc: 'Clean conversion layout designed to turn views into immediate bookings.',
        logoEmoji: '🎯',
        brandName: 'LUNAO PREVIEW'
      };
  }
};

const generateMockGoogleLeads = (niche: string, cities: string[]): any[] => {
  const selectedCity = cities[0] || 'Toronto, ON';
  const [cityName] = selectedCity.split(',');
  const cityClean = cityName.trim();

  // Pick realistic phone prefix
  let displayCode = '416';
  if (selectedCity.toLowerCase().includes('toronto')) displayCode = '416';
  else if (selectedCity.toLowerCase().includes('vancouver')) displayCode = '604';
  else if (selectedCity.toLowerCase().includes('calgary')) displayCode = '403';
  else if (selectedCity.toLowerCase().includes('montreal')) displayCode = '514';
  else if (selectedCity.toLowerCase().includes('ottawa')) displayCode = '613';
  else if (selectedCity.toLowerCase().includes('mississauga')) displayCode = '905';
  else if (selectedCity.toLowerCase().includes('london')) displayCode = '519';
  else if (selectedCity.toLowerCase().includes('austin')) displayCode = '512';
  else displayCode = '800';

  let companySuffixes: string[] = [];
  let owners: string[] = [];

  switch (niche) {
    case 'Barber':
      companySuffixes = ["Royal Fades Lounge", "The Gent's Crown", "Classic Clipper Parlor", "Sovereign Scissors", "True Grit Barbers", "The Shear Shop", "The Vintage Shave", "Summit Clips"];
      owners = ["Dominic S.", "Erick Hanson", "Maxime L.", "Marcus Vance", "Simon K.", "Jordan Rivers"];
      break;
    case 'Salon':
      companySuffixes = ["Lumière Hair Loft", "Bella Rose Boutique", "Maison de Beauté", "Silk & Shear Studio", "Gilded Lily Salon", "The Velvet Chair", "Aurélie Editorial Salon", "Nova Hair Care"];
      owners = ["Clarabelle M.", "Sophia Rossi", "Aurélie G.", "Jessica Chen", "Nadia P.", "Zoe Fontaine"];
      break;
    case 'Dentist':
      companySuffixes = ["Wellness Dental Clinic", "Clear Sky Dentistry", "Beacon Dental Studio", "Smile Lab Orthodontics", "Intake Dental Care", "Clarity Dental Group"];
      owners = ["Dr. Arthur Vance", "Dr. Mona Patel", "Dr. Julian Wu", "Dr. Clara Rose", "Dr. Ben Rivers"];
      break;
    case 'HVAC':
      companySuffixes = ["Vortex Climate Control", "Apex Heating and Air", "Everest Climate Tech", "Pinnacle Eco-Cooling", "Pro-Tech Systems", "Northstar HVAC"];
      owners = ["Steve Miller", "Dave G.", "Rick Gable", "Arthur Vance", "Kyle Frost"];
      break;
    case 'Gym':
      companySuffixes = ["Forge Athletic Club", "Iron Core Fitness", "Vigor Performance", "The Daily Grind", "True North Gym", "Summit Training Center"];
      owners = ["Alex Mercer", "Tina Sterling", "Coach Vance", "Sarah Connor", "Chris Power"];
      break;
    case 'Roofing':
      companySuffixes = ["Top Shield Roofing", "Crown Asphalt & Slate", "Everlast Shingles", "Apex Exterior Pros", "Ironclad Roofing Group", "Summit Roofs"];
      owners = ["Garrison Vance", "Mark Ross", "Luke Dunlap", "Sean Peak"];
      break;
    case 'Real Estate':
      companySuffixes = ["Nouveau Horizon Realty", "Aura Luxury Properties", "Apex Brokers", "Prime City Real Estate", "Metro Dwelling Group"];
      owners = ["Victoria Croft", "Julian Sterling", "Jessica Chen", "Sarah Stone"];
      break;
    default:
      companySuffixes = ["Local Conversion Pro", "Dynamic Commerce Hub", "Standard Enterprise"];
      owners = ["Adrian Mercer", "Fiona Gray"];
  }

  return companySuffixes.map((suffix, index) => {
    const isNoWebsite = index % 3 !== 0; // 66% have no website - prime targets for Lunao!
    const ratingFloat = parseFloat((4.0 + (index * 0.13) % 0.9).toFixed(1));
    const reviewCount = Math.floor(12 + (index * 37) % 390);
    const numSuffix = 1000 + Math.floor(index * 1157);
    const phoneNo = `(${displayCode}) 555-${numSuffix}`;
    const slug = suffix.toLowerCase().replace(/[^a-z0-9]/g, '');

    return {
      id: `lead_${niche.toLowerCase()}_${index}_${Date.now()}`,
      name: `${suffix} ${cityClean === 'Local' ? '' : cityClean}`,
      owner: owners[index % owners.length],
      phone: phoneNo,
      city: selectedCity,
      rating: ratingFloat,
      reviews: reviewCount,
      address: `${100 + index * 12} ${cityClean === 'Local' ? 'Main' : cityClean} St`,
      currentWebsite: isNoWebsite ? "" : `https://www.${slug}.com`,
      slug: slug,
      niche: niche
    };
  });
};

interface CanadianCity {
  name: string;
  provinceCode: string;
  populationGroup: 'Major' | 'Regional';
  estimatedLeads: number;
  nicheSpecificCoverage: string;
}

const CANADIAN_REGIONS: { [key: string]: { name: string; cities: CanadianCity[] } } = {
  ON: {
    name: 'Ontario',
    cities: [
      { name: 'Toronto, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 153, nicheSpecificCoverage: '98% Coverage' },
      { name: 'Ottawa, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 92, nicheSpecificCoverage: '95% Coverage' },
      { name: 'Mississauga, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 68, nicheSpecificCoverage: '94% Coverage' },
      { name: 'Hamilton, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 54, nicheSpecificCoverage: '93% Coverage' },
      { name: 'London, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 48, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Brampton, ON', provinceCode: 'ON', populationGroup: 'Major', estimatedLeads: 62, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Markham, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 41, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Vaughan, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 39, nicheSpecificCoverage: '92% Coverage' },
      { name: 'Kitchener, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 35, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Windsor, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 31, nicheSpecificCoverage: '88% Coverage' },
      { name: 'Richmond Hill, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 29, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Oakville, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 28, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Burlington, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 27, nicheSpecificCoverage: '92% Coverage' },
      { name: 'Sudbury, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 25, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Oshawa, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 24, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Barrie, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 22, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Kingston, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 20, nicheSpecificCoverage: '88% Coverage' },
      { name: 'Guelph, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 18, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Waterloo, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 17, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Peterborough, ON', provinceCode: 'ON', populationGroup: 'Regional', estimatedLeads: 15, nicheSpecificCoverage: '85% Coverage' }
    ]
  },
  QC: {
    name: 'Quebec',
    cities: [
      { name: 'Montreal, QC', provinceCode: 'QC', populationGroup: 'Major', estimatedLeads: 159, nicheSpecificCoverage: '97% Coverage' },
      { name: 'Quebec City, QC', provinceCode: 'QC', populationGroup: 'Major', estimatedLeads: 74, nicheSpecificCoverage: '94% Coverage' },
      { name: 'Laval, QC', provinceCode: 'QC', populationGroup: 'Major', estimatedLeads: 58, nicheSpecificCoverage: '93% Coverage' },
      { name: 'Gatineau, QC', provinceCode: 'QC', populationGroup: 'Major', estimatedLeads: 46, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Longueuil, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 42, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Sherbrooke, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 36, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Trois-Rivières, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 32, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Saguenay, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 30, nicheSpecificCoverage: '86% Coverage' },
      { name: 'Lévis, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 28, nicheSpecificCoverage: '88% Coverage' },
      { name: 'Terrebonne, QC', provinceCode: 'QC', populationGroup: 'Regional', estimatedLeads: 25, nicheSpecificCoverage: '85% Coverage' }
    ]
  },
  BC: {
    name: 'British Columbia',
    cities: [
      { name: 'Vancouver, BC', provinceCode: 'BC', populationGroup: 'Major', estimatedLeads: 142, nicheSpecificCoverage: '98% Coverage' },
      { name: 'Surrey, BC', provinceCode: 'BC', populationGroup: 'Major', estimatedLeads: 88, nicheSpecificCoverage: '95% Coverage' },
      { name: 'Burnaby, BC', provinceCode: 'BC', populationGroup: 'Major', estimatedLeads: 64, nicheSpecificCoverage: '94% Coverage' },
      { name: 'Richmond, BC', provinceCode: 'BC', populationGroup: 'Major', estimatedLeads: 58, nicheSpecificCoverage: '93% Coverage' },
      { name: 'Kelowna, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 44, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Victoria, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 52, nicheSpecificCoverage: '92% Coverage' },
      { name: 'Abbotsford, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 38, nicheSpecificCoverage: '89% Coverage' },
      { name: 'Coquitlam, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 36, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Kamloops, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 30, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Nanaimo, BC', provinceCode: 'BC', populationGroup: 'Regional', estimatedLeads: 28, nicheSpecificCoverage: '88% Coverage' }
    ]
  },
  AB: {
    name: 'Alberta',
    cities: [
      { name: 'Calgary, AB', provinceCode: 'AB', populationGroup: 'Major', estimatedLeads: 115, nicheSpecificCoverage: '97% Coverage' },
      { name: 'Edmonton, AB', provinceCode: 'AB', populationGroup: 'Major', estimatedLeads: 88, nicheSpecificCoverage: '96% Coverage' },
      { name: 'Red Deer, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 38, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Lethbridge, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 32, nicheSpecificCoverage: '89% Coverage' },
      { name: 'St. Albert, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 25, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Medicine Hat, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 24, nicheSpecificCoverage: '86% Coverage' },
      { name: 'Grande Prairie, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 22, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Airdrie, AB', provinceCode: 'AB', populationGroup: 'Regional', estimatedLeads: 20, nicheSpecificCoverage: '88% Coverage' }
    ]
  },
  SK: {
    name: 'Saskatchewan',
    cities: [
      { name: 'Saskatoon, SK', provinceCode: 'SK', populationGroup: 'Major', estimatedLeads: 48, nicheSpecificCoverage: '92% Coverage' },
      { name: 'Regina, SK', provinceCode: 'SK', populationGroup: 'Major', estimatedLeads: 42, nicheSpecificCoverage: '91% Coverage' },
      { name: 'Prince Albert, SK', provinceCode: 'SK', populationGroup: 'Regional', estimatedLeads: 18, nicheSpecificCoverage: '84% Coverage' },
      { name: 'Moose Jaw, SK', provinceCode: 'SK', populationGroup: 'Regional', estimatedLeads: 15, nicheSpecificCoverage: '85% Coverage' },
      { name: 'Swift Current, SK', provinceCode: 'SK', populationGroup: 'Regional', estimatedLeads: 12, nicheSpecificCoverage: '82% Coverage' },
      { name: 'Yorkton, SK', provinceCode: 'SK', populationGroup: 'Regional', estimatedLeads: 10, nicheSpecificCoverage: '81% Coverage' }
    ]
  },
  MB: {
    name: 'Manitoba',
    cities: [
      { name: 'Winnipeg, MB', provinceCode: 'MB', populationGroup: 'Major', estimatedLeads: 46, nicheSpecificCoverage: '94% Coverage' },
      { name: 'Brandon, MB', provinceCode: 'MB', populationGroup: 'Regional', estimatedLeads: 18, nicheSpecificCoverage: '86% Coverage' },
      { name: 'Steinbach, MB', provinceCode: 'MB', populationGroup: 'Regional', estimatedLeads: 12, nicheSpecificCoverage: '84% Coverage' },
      { name: 'Portage la Prairie, MB', provinceCode: 'MB', populationGroup: 'Regional', estimatedLeads: 10, nicheSpecificCoverage: '82% Coverage' }
    ]
  },
  ATLANTIC: {
    name: 'Atlantic Provinces',
    cities: [
      { name: 'Halifax, NS', provinceCode: 'NS', populationGroup: 'Major', estimatedLeads: 39, nicheSpecificCoverage: '93% Coverage' },
      { name: 'St. John\'s, NL', provinceCode: 'NL', populationGroup: 'Major', estimatedLeads: 32, nicheSpecificCoverage: '90% Coverage' },
      { name: 'Moncton, NB', provinceCode: 'NB', populationGroup: 'Regional', estimatedLeads: 28, nicheSpecificCoverage: '88% Coverage' },
      { name: 'Saint John, NB', provinceCode: 'NB', populationGroup: 'Regional', estimatedLeads: 22, nicheSpecificCoverage: '86% Coverage' },
      { name: 'Fredericton, NB', provinceCode: 'NB', populationGroup: 'Regional', estimatedLeads: 20, nicheSpecificCoverage: '87% Coverage' },
      { name: 'Charlottetown, PE', provinceCode: 'PE', populationGroup: 'Regional', estimatedLeads: 15, nicheSpecificCoverage: '85% Coverage' }
    ]
  }
};

export const Campaigns: React.FC<CampaignsProps> = ({
  campaigns,
  setCampaigns,
  templates,
  businesses,
  setBusinesses,
  addSmsLog,
  setActiveTab,
  selectedNiche: propSelectedNiche,
  setSelectedNiche: propSetSelectedNiche,
  userPlan,
  userCredits,
  setUserCredits,
  telnyxKey = '',
  telnyxPhone = ''
}) => {
  const isUpgraded = userPlan === 'Pro Plan' || userPlan === 'Agency Plan';
  
  const planNameStr = typeof userPlan === 'string' ? userPlan.replace(' Plan', '') : 'Growth';
  const userQuotaLeft = userCredits;
  const COST_PER_LEAD = 4;
  const maxLeadsAllowed = Math.floor(userQuotaLeft / COST_PER_LEAD);

  // Intelligent ETA based on real lead volume (deploys run in parallel batches).
  const estimateSendingTime = (n: number): string => {
    if (n <= 0) return '~1 minute';
    if (n <= 10) return '~2 minutes';
    if (n <= 20) return '~3 minutes';
    if (n <= 50) return '~7 minutes';
    if (n <= 100) return '~12 minutes';
    return `~${Math.ceil(n / 10)} minutes`;
  };
  
  const [activeStep, setActiveStep] = useState<number>(1);
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<Template | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [localSelectedNiche, setLocalSelectedNiche] = useState<string>('Barber');
  const selectedNiche = propSelectedNiche !== undefined ? propSelectedNiche : localSelectedNiche;
  const setSelectedNiche = propSetSelectedNiche !== undefined ? propSetSelectedNiche : setLocalSelectedNiche;
  const [inputMethod, setInputMethod] = useState<'csv' | 'find'>('csv');
  // CSV is the only live lead source. Google Maps "Leads Finder" is Coming Soon.
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvValidation, setCsvValidation] = useState<CsvValidation | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [cityInput, setCityInput] = useState<string[]>(['Toronto, ON']);
  const [selectedProvinceTab, setSelectedProvinceTab] = useState<string>('All');
  const [citySearchQuery, setCitySearchQuery] = useState<string>('');
  const [regionScrollProgress, setRegionScrollProgress] = useState<number>(0);
  const [customCity, setCustomCity] = useState<string>('');
  const [cityLimitError, setCityLimitError] = useState<string | null>(null);
  const [leadSelectionError, setLeadSelectionError] = useState<string | null>(null);
  const regionScrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollLeftRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(0);
  const [radius, setRadius] = useState<number>(15);
  const [findingsLoaded, setFindingsLoaded] = useState<boolean>(true);
  const [isFinding, setIsFinding] = useState<boolean>(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('t1');
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);

  // Load custom templates on mount so they're available in the wizard picker.
  useEffect(() => {
    listCustomTemplates()
      .then(setCustomTemplates)
      .catch(() => setCustomTemplates([]));
  }, []);
  const [campaignName, setCampaignName] = useState<string>('Toronto Barbers May Campaign');
  const [targetSmsCount, setTargetSmsCount] = useState<number>(10);

  // Google Maps Leads Discovery System State
  const [googleMapsLeads, setGoogleMapsLeads] = useState<any[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [isSearchingGoogleMaps, setIsSearchingGoogleMaps] = useState<boolean>(false);
  const [shouldShakeSearch, setShouldShakeSearch] = useState<boolean>(false);
  const [hasSearchedGoogleMaps, setHasSearchedGoogleMaps] = useState<boolean>(false);
  const [mapsScanLogs, setMapsScanLogs] = useState<string[]>([]);

  // New CSV Import states
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [isCsvParsing, setIsCsvParsing] = useState<boolean>(false);
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  // Real parsed leads from the uploaded CSV (drives the live backend pipeline).
  const [csvLeads, setCsvLeads] = useState<PipelineLead[]>([]);

  // Draft Message
  const [smsText, setSmsText] = useState<string>(
    `Hi, we noticed {{business_name}} doesn't have a website yet to showcase your services in {{city}}.\n\nWe built a beautiful custom preview for you — take a look: {{site_url}}\n\nReply YES to publish it instantly!\n\n— The Lunao Team`
  );

  // Generation status
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [launchProgress, setLaunchProgress] = useState<number>(0);
  const [launchMessage, setLaunchMessage] = useState<string>('');
  const [campaignCreated, setCampaignCreated] = useState<boolean>(false);

  const stepRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Synchronize campaign outreach targets with selected lead count automatically
  React.useEffect(() => {
    setTargetSmsCount(selectedLeadIds.length);
  }, [selectedLeadIds]);

  // Keep the selected template valid for the current niche. If the active
  // template doesn't belong to the chosen niche (e.g. niche came from shared
  // state), auto-pick the first template of that niche so the recap is correct.
  React.useEffect(() => {
    const current = templates.find((t) => t.id === selectedTemplateId);
    if (!current || current.niche !== selectedNiche) {
      const firstForNiche = templates.find((t) => t.niche === selectedNiche);
      if (firstForNiche) setSelectedTemplateId(firstForNiche.id);
    }
  }, [selectedNiche, templates]);

  // Dynamic pre-population of Google Maps search listings focusing on persistence (locking in previous selections)
  React.useEffect(() => {
    const fresh = generateMockGoogleLeads(selectedNiche, cityInput);
    
    setGoogleMapsLeads(prevLeads => {
      // Keep any previously generated leads that the user has selected/locked-in
      const selected = prevLeads ? prevLeads.filter(lead => selectedLeadIds.includes(lead.id)) : [];
      const combined = [...selected];
      fresh.forEach(newLead => {
        if (!combined.some(c => c.id === newLead.id)) {
          combined.push(newLead);
        }
      });
      return combined;
    });

    // Maintain previously selected leads and do NOT auto-select fresh/new results by default!
    setSelectedLeadIds(prevSelected => {
      return prevSelected;
    });

    setHasSearchedGoogleMaps(false);
  }, [selectedNiche, cityInput]);

  const handleToggleLead = (leadId: string) => {
    if (selectedLeadIds.includes(leadId)) {
      playTiktokLike();
      setSelectedLeadIds(prev => prev.filter(id => id !== leadId));
      setUserCredits(prev => {
        const next = prev + COST_PER_LEAD;
        localStorage.setItem('lunao_user_credits', next.toString());
        return next;
      });
    } else {
      // Dynamic budget guard: Each profile requires COST_PER_LEAD (4) credits
      if (userCredits < COST_PER_LEAD) {
        playElegantError();
        setLeadSelectionError(null);
        setTimeout(() => {
          setLeadSelectionError(`Action Blocked: Each outreached lead requires ${COST_PER_LEAD} credits (3 for SMS + 1 for website creation). Your current balance is ${userCredits} credits. Please top up your balance.`);
        }, 10);
        setTimeout(() => setLeadSelectionError(null), 4000);
        return;
      }
      
      playTiktokLike();
      setSelectedLeadIds(prev => [...prev, leadId]);
      setMissingSelectionError(false);
      setLeadSelectionError(null);
      setUserCredits(prev => {
        const next = Math.max(0, prev - COST_PER_LEAD);
        localStorage.setItem('lunao_user_credits', next.toString());
        return next;
      });
    }
  };

  // Google Maps LIVE simulated API Search Scan
  const handleTriggerGoogleMapsSearch = () => {
    const fresh = generateMockGoogleLeads(selectedNiche, cityInput);
    const apiScanCost = Math.ceil(fresh.length / 3);

    // Guard: Ensure user has enough credits to trigger maps search (Rate: 3 leads = 1 credit rate)
    if (userCredits < apiScanCost) {
      playElegantError();
      setShouldShakeSearch(true);
      setTimeout(() => setShouldShakeSearch(false), 500);
      setCityLimitError(`Insufficient Balance: Running an active Google Maps Places crawl costs 1 credit per 3 found listings. This scan requires ${apiScanCost} credits.`);
      setTimeout(() => setCityLimitError(null), 6000);
      return;
    }

    setIsSearchingGoogleMaps(true);
    setHasSearchedGoogleMaps(false);
    setMapsScanLogs([]);
    
    playLaunchSwell();

    // Deduct standard API query cost in real time (3 leads = 1 credit rate)
    setUserCredits(prev => {
      const next = Math.max(0, prev - apiScanCost);
      localStorage.setItem('lunao_user_credits', next.toString());
      return next;
    });

    const currentCityName = cityInput[0] || 'Local';

    const scanStages = [
      { delay: 0, text: `📡 Client handshaking: Establishing peer connection to Google Maps Platform (Places v3 / New API standard Hub)...` },
      { delay: 400, text: `💳 API Query Charge: -${apiScanCost} credits deducted in real-time (Rate: 3 leads found = 1 credit rate)` },
      { delay: 800, text: `🗺️ Geo Geofence locked: Transmitting bounding coordinates frame queries for "${currentCityName}"...` },
      { delay: 1400, text: `🔍 Crawling indexes: Searching matches for Niche: "${selectedNiche}" containing missing or non-responsive mobile responsive frameworks...` },
      { delay: 2000, text: `📊 Parsing metadata: Extracting verified ratings, telephone registries, review volume parameters, and business owners...` },
      { delay: 2800, text: `🎯 Verification complete: Found ${fresh.length} valid lead candidates matching Lunao criteria! Synchronizing checkout payload.` }
    ];

    scanStages.forEach((stage) => {
      setTimeout(() => {
        setMapsScanLogs(prev => [...prev, stage.text]);
        playSoftTap();
        
        if (stage.delay === 2800) {
          // Merge fresh search results with previously selected locked-in leads
          setGoogleMapsLeads(prevLeads => {
            const selected = prevLeads ? prevLeads.filter(lead => selectedLeadIds.includes(lead.id)) : [];
            const combined = [...selected];
            fresh.forEach(newLead => {
              if (!combined.some(c => c.id === newLead.id)) {
                combined.push(newLead);
              }
            });
            return combined;
          });

          // Maintain the currently selected leads and do NOT select newly searched results by default
          setSelectedLeadIds(prevSelected => {
            return prevSelected;
          });

          setIsSearchingGoogleMaps(false);
          setHasSearchedGoogleMaps(true);
          playVictoryCelebration();
        }
      }, stage.delay);
    });
  };

  // Auto scroll horizontally to the current active step in the wizard progress bar
  React.useEffect(() => {
    const activeElem = stepRefs.current[activeStep];
    const trackElem = document.getElementById('wizard-steps-horizontal-track');
    if (activeElem && trackElem) {
      const trackRect = trackElem.getBoundingClientRect();
      const elemRect = activeElem.getBoundingClientRect();
      const offset = (elemRect.left - trackRect.left) + trackElem.scrollLeft - (trackRect.width / 2) + (elemRect.width / 2);
      trackElem.scrollTo({ left: offset, behavior: 'smooth' });
    }

    // Scroll the campaign card block into view precisely on step changes,
    // ensuring the user keeps the wizard container aligned rather than resetting back to the very top.
    const wizardCard = document.getElementById('campaigns-generator-wizard-card');
    if (wizardCard) {
      wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const container = document.getElementById('main-content-flow');
      if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [activeStep, isLaunching, campaignCreated]);

  // Textarea reference for inserting tokens
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Campaign Filtering Tabs
  const [filterTab, setFilterTab] = useState<'All' | 'Active' | 'Completed' | 'Queued' | 'Crashed'>('All');

  const [quotaError, setQuotaError] = useState<boolean>(false);
  const [missingSelectionError, setMissingSelectionError] = useState<boolean>(false);
  const [errorShakes, setErrorShakes] = useState<number>(0);
  const [latestCampId, setLatestCampId] = useState<string | null>(null);

  const filteredCampaigns = campaigns.filter(c => {
    if (filterTab === 'All') return true;
    
    // Status visual overrides
    const isQueued = isWaitingForLast(c.id);
    
    if (filterTab === 'Queued') return isQueued;
    if (filterTab === 'Active') return c.status === 'Active' && !isQueued;
    
    return c.status === filterTab;
  });

  const isWaitingForLast = (campId: string) => {
    const idx = campaigns.findIndex(c => c.id === campId);
    if (idx === -1) return false;
    return campaigns.slice(idx + 1).some(c => c.status === 'Active');
  };

  // Handle Finding simulation
  const handleFindBusinesses = () => {
    setIsFinding(true);
    setFindingsLoaded(false);
    setTimeout(() => {
      setIsFinding(false);
      setFindingsLoaded(true);
    }, 1800);
  };

  // Real CSV ingestion: parse the uploaded file via the backend so the live
  // pipeline operates on the actual rows. Falls back gracefully if the backend
  // is offline (keeps the dashboard usable as a standalone demo).
  const handleCsvFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      playElegantError();
      alert('Invalid format. Please upload a spreadsheet ending in .csv');
      return;
    }
    playLaunchSwell();
    setCsvFileName(file.name);
    setCsvError(null);
    setCsvValidation(null);
    setIsCsvParsing(true);
    try {
      const report = await validateCsvFile(file);
      setCsvValidation(report);
      setIsCsvParsing(false);

      if (!report.ok || report.validCount === 0) {
        // Invalid sheet — block forward progress, keep precise report for the UI.
        playElegantError();
        setCsvLeads([]);
        setCsvParsedCount(0);
        setTargetSmsCount(0);
        setCsvError(report.message || 'This CSV is not valid for a campaign.');
        return;
      }

      // Valid (possibly with some skipped rows).
      playVictoryCelebration();
      setCsvLeads(report.leads);
      setCsvParsedCount(report.validCount);
      setTargetSmsCount(report.validCount);
      setMissingSelectionError(false);
      setCampaignName(`${file.name.replace(/\.csv$/i, '')} Leads Campaign`);
    } catch (err) {
      // Backend offline or unreadable file — no fake counts.
      playElegantError();
      setCsvLeads([]);
      setIsCsvParsing(false);
      setCsvParsedCount(0);
      setTargetSmsCount(0);
      setCsvValidation(null);
      setCsvError(
        'Could not reach the pipeline server to validate this CSV. Start it with "npm run server" (or "npm run dev:all") and re-upload.',
      );
    }
  };

  // Launch a CSV campaign. UX: ~2.5s loading → success page, while the real
  // compile → Cloudflare deploy → SMS pipeline runs in the BACKGROUND and
  // updates the campaign row (Active → Completed) in Recent Campaigns. Once
  // launched it runs to completion and cannot be cancelled mid-flight.
  const runRealCsvPipeline = () => {
    setLaunchError(null);

    const totalLeads = csvLeads.length;
    if (totalLeads === 0) {
      setLaunchError('Upload a CSV with business name, city and phone before launching.');
      return;
    }
    if (!csvValidation?.ok) {
      setLaunchError('Your CSV is not valid yet. Fix the highlighted issues and re-upload.');
      return;
    }

    // Real credit guard: 4 credits per lead (1 site + 3 SMS reserved).
    // The dashboard still gates launches locally for instant UX, but the
    // server is the ultimate source of truth — /api/campaign/run will 402
    // if the user is actually broke after a plan downgrade.
    const requiredCredits = totalLeads * COST_PER_LEAD;
    if (userCredits < requiredCredits) {
      playElegantError();
      setLaunchError(
        `Insufficient credits: this campaign needs ${requiredCredits} credits (${totalLeads} leads × ${COST_PER_LEAD}). You have ${userCredits}. Top up to launch.`,
      );
      return;
    }

    // Optimistic local debit so the UI updates instantly. The server is
    // already the source of truth, so any mismatch will be corrected by
    // the post-run `refreshServerCredits()` pull.
    setUserCredits((prev) => {
      const next = Math.max(0, prev - requiredCredits);
      localStorage.setItem('lunao_user_credits', next.toString());
      return next;
    });

    // Register the campaign immediately as Active (shows in Recent Campaigns).
    const newCampId = 'c' + Date.now();
    setLatestCampId(newCampId);
    setCampaigns((prev) => [
      {
        id: newCampId,
        name: campaignName || `${selectedNiche} CSV Outreach`,
        niche: selectedNiche,
        leadsFound: totalLeads,
        sites: 0,
        smsSent: 0,
        claimed: 0,
        status: 'Active' as const,
        createdAt: new Date().toISOString().split('T')[0],
        templateId: selectedTemplateId,
      },
      ...prev,
    ]);

    // Short, fixed loading animation (~2.5s) then success — the actual work
    // continues in the background regardless of this screen.
    setIsLaunching(true);
    setLaunchProgress(0);
    setLaunchMessage('Provisioning outreach pipeline...');
    playLaunchSwell();
    setTimeout(() => { setLaunchProgress(45); setLaunchMessage('Compiling personalized websites...'); }, 600);
    setTimeout(() => { setLaunchProgress(80); setLaunchMessage('Publishing to the Cloudflare edge...'); playSoftTap(); }, 1400);
    setTimeout(() => { setLaunchProgress(100); setLaunchMessage('Campaign is live!'); }, 2200);
    setTimeout(() => {
      setIsLaunching(false);
      setCampaignCreated(true);
      playVictoryCelebration();
    }, 2500);

    // Fire-and-forget the real pipeline.
    startBackgroundPipeline(newCampId, totalLeads);
  };

  // Runs the real backend pipeline in the background and reconciles the
  // campaign row + businesses + SMS logs + credit refunds when it finishes.
  const startBackgroundPipeline = async (campId: string, totalLeads: number) => {
    const leads = csvLeads;
    let compiled = 0;
    const ownerKey = localStorage.getItem('lunao_owner_key') || `dash-${userPlan.replace(/\s+/g, '-')}`;
    if (!localStorage.getItem('lunao_owner_key')) localStorage.setItem('lunao_owner_key', ownerKey);
    try {
      const { summary, results, campaignId } = await runCampaign(
        {
          businesses: leads,
          niche: selectedNiche,
          templateId: selectedTemplateId,
          smsTemplate: smsText,
          name: campaignName || `${selectedNiche} CSV Outreach`,
          ownerKey,
          plan: userPlan,
        },
        (e) => {
          if (e.type === 'site:generated') {
            compiled += 1;
            setCampaigns((prev) =>
              prev.map((c) => (c.id === campId ? { ...c, sites: compiled } : c)),
            );
          }
        },
      );
      finalizeRealResults(campId, results, summary, totalLeads);
      // After the server finishes it knows the real balance (charges + refunds).
      // Pull it back so the dashboard never drifts from the ledger.
      refreshServerCredits(ownerKey, userPlan);
      void campaignId; // (kept for future "View campaign details" link)
    } catch (err: any) {
      // 402 means the server (truth) says the user is broke. Roll back the
      // optimistic local debit and surface a precise message.
      if (err?.status === 402) {
        setUserCredits((prev) => {
          const next = err.available ?? (prev + totalLeads * COST_PER_LEAD);
          localStorage.setItem('lunao_user_credits', String(next));
          return next;
        });
        playElegantError();
        setLaunchError(
          `Server says you have ${err.available ?? 0} credits but this campaign needs ${err.needed ?? totalLeads * COST_PER_LEAD}. Top up to launch.`,
        );
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === campId
              ? { ...c, status: 'Crashed' as const, errorReason: 'Insufficient server credits' }
              : c,
          ),
        );
        return;
      }
      // Mark the campaign crashed and refund all reserved credits.
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campId
            ? { ...c, status: 'Crashed' as const, errorReason: 'Pipeline server unreachable — credits refunded' }
            : c,
        ),
      );
      setUserCredits((prev) => {
        const next = prev + totalLeads * COST_PER_LEAD;
        localStorage.setItem('lunao_user_credits', next.toString());
        return next;
      });
    }
  };

  // Pull the authoritative credit balance from the server and reconcile
  // local state. Called after every campaign run + on dashboard mount so
  // the localStorage copy can never drift from the ledger.
  const refreshServerCredits = async (ownerKey: string, plan: string) => {
    try {
      const { getCredits } = await import('../lib/pipelineClient');
      const status = await getCredits(ownerKey, plan);
      if (status.account) {
        setUserCredits(status.account.balance);
        localStorage.setItem('lunao_user_credits', String(status.account.balance));
      }
    } catch {
      /* silent — dashboard still works on local cache */
    }
  };

  // Reconcile final results into dashboard state once the background run ends.
  const finalizeRealResults = (
    campId: string,
    results: PipelineResultRow[],
    summary: any,
    totalLeads: number,
  ) => {
    const ok = results.filter((r) => r.siteStatus === 'generated');
    const smsComingSoon = summary?.telnyx === 'coming_soon';

    // Refund any leads that failed to deploy (we charged upfront).
    const failedCount = Math.max(0, totalLeads - ok.length);
    if (failedCount > 0) {
      setUserCredits((prev) => {
        const next = prev + failedCount * COST_PER_LEAD;
        localStorage.setItem('lunao_user_credits', next.toString());
        return next;
      });
    }

    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campId
          ? {
              ...c,
              sites: ok.length,
              smsSent: smsComingSoon ? 0 : (summary?.smsSent ?? ok.length),
              status: 'Completed' as const,
            }
          : c,
      ),
    );

    const newBusinesses: Business[] = ok.map((r) => {
      // Map the pipeline's smsStatus into the tick-driven deliveryStatus the
      // UI uses. Critical: simulated and sent both show a single tick, only
      // 'delivered' (confirmed by Telnyx) shows the double tick.
      let deliveryStatus: 'pending' | 'sent' | 'delivered' | 'simulated' | 'failed' = 'pending';
      if (smsComingSoon) {
        deliveryStatus = 'simulated';
      } else if (r.smsStatus === 'delivered') {
        deliveryStatus = 'delivered';
      } else if (r.smsStatus === 'sent') {
        deliveryStatus = 'sent';
      } else if (r.smsStatus === 'failed') {
        deliveryStatus = 'failed';
      } else if (r.smsSimulated) {
        deliveryStatus = 'simulated';
      }
      return {
        id: 'csv-' + r.slug + '-' + Math.random().toString(36).slice(2, 5),
        name: r.name,
        owner: '',
        phone: r.phone || '',
        city: r.city || '',
        niche: selectedNiche,
        webStatus: 'No website' as const,
        siteStatus: smsComingSoon ? ('Site generated' as const) : ('SMS sent' as const),
        slug: r.slug,
        siteUrl: r.siteUrl || '',
        smsHistory: r.smsText
          ? [{
              text: r.smsText,
              timestamp: smsComingSoon ? 'Queued (Coming Soon)' : 'Just now',
              type: 'outgoing' as const,
              deliveryStatus,
            }]
          : [],
      };
    });
    setBusinesses((prev) => [...newBusinesses, ...prev]);

    addSmsLog(
      ok.map((r) => ({
        id: 'log-' + r.slug + '-' + Math.random().toString(36).slice(2, 6),
        businessName: r.name,
        phone: r.phone || '',
        sentAt: smsComingSoon ? 'Queued' : 'Just now',
        status: (smsComingSoon ? 'Coming Soon' : r.smsStatus === 'failed' ? 'Undelivered' : 'Delivered') as SmsLog['status'],
        previewLink: r.siteUrl || '',
      })),
    );
  };

  // Insert token helper
  const insertToken = (token: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const text = textareaRef.current.value;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      setSmsText(before + token + after);
      
      // Reset focus and cursor position
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      setSmsText(prev => prev + ' ' + token);
    }
  };

  // The old client-side simulation has been removed. All campaigns now run
  // through the real backend pipeline via runRealCsvPipeline().

  const handleResetWizard = () => {
    setActiveStep(1);
    setCampaignCreated(false);
    setCampaignName('Austin Barbers May Campaign');
  };

  // Status badge style helper
  const getStatusStyle = (status: Campaign['status']) => {
    switch (status) {
      case 'Active':
        return 'bg-success-soft text-success border border-success/20';
      case 'Completed':
        return 'bg-border-light text-ink-secondary border border-border-main/50';
      case 'Queued':
        return 'bg-amber-500/10 text-amber-800 border border-amber-500/15';
      case 'Crashed':
        return 'bg-danger-soft text-danger border border-danger/20';
      default:
        return 'bg-surface text-ink-secondary';
    }
  };

  return (
    <div id="campaigns-tab-container-root" className="space-y-8 animate-fade-in font-sans relative">
      
      {/* Global Fixed Position Toasts for Mobile */}
      {leadSelectionError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] md:w-auto md:min-w-[320px] max-w-md animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-danger-soft text-danger border border-danger/30 shadow-2xl shadow-danger/20 rounded-xl p-4 flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-danger text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 animate-bounce" />
            </div>
            <div className="space-y-1 mt-0.5 relative pr-6">
              <p className="font-bold text-xs uppercase tracking-wider text-danger leading-tight block text-left">Action Blocked</p>
              <p className="text-[12px] font-medium leading-snug text-left">{leadSelectionError}</p>
              <button 
                type="button"
                onClick={() => setLeadSelectionError(null)}
                className="absolute -top-1 -right-4 p-1 rounded hover:bg-danger/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-danger-soft/80" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Title Bar */}
      <header id="campaigns-view-header" className="flex items-center justify-between pb-6 border-b border-border-main">
        <div id="campaigns-titles-area" className="space-y-1">
          <h1 id="campaigns-top-heading" className="text-4xl font-serif text-ink tracking-tight font-normal">Campaigns</h1>
          <p id="campaigns-sub-heading" className="text-sm text-ink-secondary">Generate stunning websites and send automated SMS proposals.</p>
        </div>
      </header>

      {/* STEP-BY-STEP WORKFLOW CONTAINER (WIZARD) */}
      <section id="campaigns-generator-wizard-card" className="bg-white border border-border-main rounded-xl shadow-sm overflow-hidden">
        
        {/* Step-by-Step active header with beautiful sliding transition */}
        <div id="campaigns-wizard-header-collapse-container" className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
          campaignCreated || isLaunching 
            ? 'max-h-0 opacity-0 pointer-events-none border-b-transparent' 
            : 'max-h-[300px] opacity-100 border-b border-border-main'
        }`}>
          {/* Header Ribbon / Description */}
          <div className="p-5 bg-off-white border-b border-border-main flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-1 px-2 text-xs font-semibold bg-accent-soft text-accent rounded-md border border-accent/10">Active Wizard</span>
              <span className="text-sm font-semibold text-ink">Website & SMS Outreach Builder</span>
            </div>
            <span className="text-xs text-ink-secondary leading-none">Complete steps to launch instantly</span>
          </div>

          {/* Step Indicator Panel */}
          <div id="wizard-steps-horizontal-track" className="px-6 py-5 bg-white flex flex-nowrap items-center overflow-x-auto scrollbar-none gap-4 md:justify-between">
            {[
              { step: 1, name: 'Select Niche' },
              { step: 2, name: 'Input Businesses' },
              { step: 3, name: 'Choose Template' },
              { step: 4, name: 'SMS Messaging' },
              { step: 5, name: 'Launch Outreach' },
            ].map((item) => (
              <React.Fragment key={item.step}>
                <div 
                  ref={el => { stepRefs.current[item.step] = el; }}
                  className="flex items-center gap-3 shrink-0"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                    activeStep === item.step 
                      ? 'bg-accent text-white ring-4 ring-accent-soft' 
                      : activeStep > item.step 
                        ? 'bg-success text-white' 
                        : 'bg-surface text-ink-secondary border border-border-main'
                  }`}>
                    {activeStep > item.step ? <Check className="w-4 h-4" /> : item.step}
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-[11px] uppercase tracking-wider font-semibold ${
                      activeStep === item.step ? 'text-accent' : 'text-ink-secondary'
                    }`}>Step 0{item.step}</span>
                    <span className={`text-xs font-medium leading-tight ${activeStep === item.step ? 'font-semibold text-ink' : 'text-ink-secondary'}`}>
                      {item.name}
                    </span>
                  </div>
                </div>
                {item.step < 5 && (
                  <div className="hidden md:block h-[1px] bg-border-light flex-1 mx-4 min-w-[20px]"></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* STEP WORK AREA */}
        <div id="wizard-step-contents-wrapper" className="p-6 md:p-8 min-h-[300px] relative">
          {campaignCreated && <CelebrationEffect />}
          {!campaignCreated && !isLaunching && campaigns.some(c => c.status === 'Active') && (
            <div className="bg-amber-500/10 border border-amber-500/15 text-amber-800 rounded-lg p-4 flex items-center gap-3.5 text-left mb-6 animate-fade-in">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <p className="text-[11.5px] text-ink-secondary leading-normal">
                An outreach campaign is currently running. New campaigns created now will be added to the queue in **Queued** status, and will start automatically as soon as the previous campaign completes.
              </p>
            </div>
          )}

          {campaignCreated ? (
            /* SUCCESS OVERVIEW VIEW */
            <div className="text-center py-8 space-y-6 max-w-lg mx-auto animate-fade-in">
              <div className="w-16 h-16 bg-success-soft text-success rounded-full flex items-center justify-center mx-auto border border-success/30">
                <Check className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-2xl text-ink">Outreach Campaign Live!</h3>
                {latestCampId && isWaitingForLast(latestCampId) ? (
                  <p className="text-sm text-ink-secondary">
                    Campaign has been securely built and registered in queue. Broadcaster will begin transmit once active tasks conclude.
                  </p>
                ) : (
                  <p className="text-sm text-ink-secondary">
                    Your sites are deploying live to Cloudflare in the background — watch the progress in <strong>Recent Campaigns</strong>. Personalized SMS is queued and will send automatically once real SMS is enabled.
                  </p>
                )}
              </div>

              {latestCampId && isWaitingForLast(latestCampId) && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-900 rounded-xl p-4 flex items-start gap-3.5 text-left animate-fade-in shadow-2xs">
                  <div className="p-2 bg-amber-500/15 rounded-md text-amber-700 mt-0.5 shrink-0">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-semibold block text-[13px] text-amber-950 leading-tight">
                      Waiting for last campaign to finish to start this campaign
                    </span>
                    <p className="text-[11px] text-ink-secondary leading-normal">
                      This campaign is fully prepared with assets and copies. It is added as <strong>Queued (Waiting)</strong> because another outreach task is presently executing. Execution will transition automatically.
                    </p>
                  </div>
                </div>
              )}



              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleResetWizard}
                  className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-md shadow-sm"
                >
                  Create Another Campaign
                </button>
              </div>
            </div>
          ) : isLaunching ? (
            /* LAUNCHING LOADER SCREEN WITH PROGRESSIVE LEDGER */
            <div className="text-center py-10 space-y-6 max-w-sm mx-auto animate-fade-in">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-accent-soft"></div>
                <div className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
              </div>
              <div className="space-y-2">
                <h4 className="font-serif text-xl text-ink font-medium">Provisioning Outreach Pipeline</h4>
                <p className="text-xs text-ink-secondary animate-pulse">{launchMessage}</p>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-border-light rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-accent h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${launchProgress}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono font-medium text-ink-tertiary">
                <span>SYSTEM DISPATCH SEQUENCE</span>
                <span>{launchProgress}% Complete</span>
              </div>
            </div>
          ) : (
            <>
              {/* STEP 1: Select Niche */}
              {activeStep === 1 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="space-y-1">
                    <h3 className="text-lg font-serif text-ink tracking-tight">Select Target Niche</h3>
                    <p className="text-sm text-ink-secondary">Choose the business sector you want to query or upload for this campaign.</p>
                  </div>
                  
                  {/* Grid of Niches */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pt-2">
                    {nicheList.map((niche) => {
                      const isSelected = selectedNiche === niche.id;
                      return (
                        <button
                          key={niche.id}
                          onClick={() => {
                            playSoftBubble();
                            setSelectedNiche(niche.id);
                            // Auto prefix name
                            setCampaignName(`${cityInput[0].split(',')[0]}${cityInput.length > 1 ? ` +${cityInput.length-1}` : ''} ${niche.label}s Campaign`);
                            
                            // Auto pre-select the first template of this niche
                            const firstTemp = templates.find(t => t.niche === niche.id);
                            if (firstTemp) {
                              setSelectedTemplateId(firstTemp.id);
                            }
                          }}
                          className={`p-4 rounded-lg flex flex-col items-center justify-center gap-2 border text-center transition-all ${
                            isSelected 
                              ? 'bg-accent-soft border-accent text-accent font-semibold shadow-sm' 
                              : 'bg-white border-border-light text-ink hover:border-border-main hover:shadow-xs'
                          }`}
                        >
                          <span className="text-2xl leading-none">{niche.emoji}</span>
                          <span className="text-xs tracking-tight font-sans text-ink leading-tight">{niche.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 2: Input Businesses */}
              {activeStep === 2 && (
                <div className="space-y-6 animate-fade-in text-sm text-ink text-left">
                  <div className="space-y-1">
                    <h3 className="text-lg font-serif text-ink tracking-tight font-normal">Business Data Inputs & Coverage Geofence</h3>
                    <p className="text-xs text-ink-secondary">Select your campaign data-source and define outreach scaling boundaries.</p>
                  </div>

                  {/* ACCREDITATION SHIELD / UPGRADE UNLOCK */}
                  {!isUpgraded ? (
                    <div className="bg-[#FEF2F2] border border-[#FCA5A5]/40 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 animate-fade-in shadow-2xs">
                      <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center font-bold text-xl shrink-0 select-none">
                        🇨🇦
                      </div>
                      <div className="space-y-1 flex-grow">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest leading-none bg-red-100 border border-red-200 px-2 py-1 rounded">Active Geofence Active</span>
                          <span className="text-[10px] text-ink-secondary font-semibold font-mono">• Direct Class-1 Bulk Transmissions</span>
                        </div>
                        <p className="text-xs text-ink-secondary leading-relaxed flex-col sm:flex-row">
                          Our carrier routes are legally approved and hardware-locked strictly to <strong>Canada-registered phone numbers (Under CRTC A2P Framework)</strong>. For high conversions and direct deliverability, only Canadian hubs are enabled in this version.
                          <span className="text-accent font-semibold block sm:inline sm:ml-1 text-[11px] hover:underline cursor-pointer">
                            *European markets (UK, Germany, and France SMS pipelines) release officially in Q3 soon!
                          </span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-purple-50/50 border border-purple-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 animate-fade-in shadow-2xs">
                      <div className="w-12 h-12 rounded-xl bg-purple-100/50 border border-purple-200 flex items-center justify-center text-purple-600 shrink-0 select-none">
                        <Globe className="w-6 h-6" />
                      </div>
                      <div className="space-y-1.5 flex-grow">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-widest leading-none bg-purple-100 border border-purple-200 px-2 py-1 rounded">Global Scale Unlocked</span>
                          <span className="text-[10px] text-purple-600/70 font-semibold font-mono border border-purple-200/50 px-1.5 py-0.5 rounded bg-white/50">Custom Telnyx Bridge</span>
                        </div>
                        <p className="text-xs text-ink-secondary leading-relaxed max-w-2xl">
                          As an elite user, your geofence is deactivated. You can target <strong>any valid city on Earth</strong>. Please ensure you enter a pipeline city located in the same country as the custom Telnyx phone number you provide below to ensure deliverability, maintain the lowest messaging costs, and never experience carrier blocking.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* HIGH-FIDELITY MODE SWITCHER */}
                  <div className="flex bg-surface p-1 rounded-lg max-w-sm border border-border-main">
                    <button
                      type="button"
                      disabled
                      title="Google Maps lead discovery is coming soon"
                      onClick={() => {
                        playElegantError();
                      }}
                      className="flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-not-allowed text-ink-tertiary opacity-70 relative"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      🎯 Leads Finder
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 text-[8px] font-bold uppercase tracking-wider">Soon</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playSoftBubble();
                        setInputMethod('csv');
                      }}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        inputMethod === 'csv'
                          ? 'bg-white shadow-xs text-accent'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      📤 Import CSV File
                    </button>
                  </div>

                  {inputMethod === 'find' ? (
                    <div className="space-y-6">
                      <div className="bg-off-white/50 border border-border-main rounded-xl p-3 sm:p-5 space-y-5">
                        {!isUpgraded ? (
                          <>
                            <div className="space-y-2.5">
                              <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-widest block text-left">
                                Select Canada Metropolitan Hub:
                              </label>
                          
                          {/* Beautiful interactive grid of certified Canadian cities to select with smart province tags & search query filter */}
                          <div className="bg-white border border-border-light rounded-xl p-3 sm:p-5 space-y-4 sm:space-y-5 shadow-3xs animate-fade-in text-left w-full overflow-hidden">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border-light pb-4">
                              <div className="space-y-0.5">
                                <span className="text-xs font-bold text-ink uppercase tracking-wider block">Canadian Sourcing Pipelines</span>
                                <p className="text-[11px] text-ink-secondary">Select any certified carrier station to source target prospects.</p>
                              </div>
                              
                              {/* Beautiful Instant Search input */}
                              <div className="relative w-full md:w-64">
                                <input
                                  type="text"
                                  placeholder="Search 60+ Canadian cities..."
                                  value={citySearchQuery}
                                  onChange={(e) => {
                                    setCitySearchQuery(e.target.value);
                                  }}
                                  className="w-full bg-surface border border-border-main rounded-lg pl-8 pr-8 py-2 text-xs focus:ring-2 focus:ring-accent-soft focus:outline-none transition-all placeholder:text-ink-tertiary text-ink"
                                />
                                <span className="absolute left-2.5 top-2.5 text-xs text-ink-secondary">🔍</span>
                                {citySearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setCitySearchQuery('')}
                                    className="absolute right-2.5 top-2.5 text-ink-secondary hover:text-ink text-[10px] font-bold"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
 
                            {/* Province Tabs Selector (Mobile horizontal scrollable, highly tactile) */}
                            <div className="space-y-2 relative w-full overflow-hidden">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest flex items-center gap-1.5">
                                  Filter by Region
                                  <span className="text-[9px] font-bold text-accent normal-case bg-accent/5 px-2 py-1 rounded-full border border-accent/15 whitespace-nowrap flex items-center gap-1 shrink-0 animate-shine-breathe">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                                    Swipe right ➔
                                  </span>
                                </span>
                              </div>
                              
                              <div className="relative w-full">
                                {/* The scroll container */}
                                <div 
                                  ref={regionScrollContainerRef}
                                  onScroll={(e) => {
                                    const target = e.currentTarget;
                                    const scrollLeft = target.scrollLeft;
                                    const maxScroll = target.scrollWidth - target.clientWidth;
                                    if (maxScroll > 0) {
                                      setRegionScrollProgress((scrollLeft / maxScroll) * 100);
                                    } else {
                                      setRegionScrollProgress(0);
                                    }

                                    // Dynamic scroll gear tick feedback ticks as you scroll through regions
                                    const now = Date.now();
                                    const distance = Math.abs(scrollLeft - lastScrollLeftRef.current);
                                    if (distance > 24 && now - lastScrollTimeRef.current > 120) {
                                      playSlideTick();
                                      lastScrollLeftRef.current = scrollLeft;
                                      lastScrollTimeRef.current = now;
                                    }
                                  }}
                                  className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none w-full focus:outline-none overscroll-contain touch-pan-x"
                                >
                                  {[
                                    { key: 'All', label: 'All Provinces' },
                                    { key: 'ON', label: 'Ontario (ON)' },
                                    { key: 'QC', label: 'Quebec (QC)' },
                                    { key: 'BC', label: 'British Columbia (BC)' },
                                    { key: 'AB', label: 'Alberta (AB)' },
                                    { key: 'SK', label: 'Saskatchewan (SK)' },
                                    { key: 'MB', label: 'Manitoba (MB)' },
                                    { key: 'ATLANTIC', label: 'Atlantic Canada' }
                                  ].map((tab) => {
                                    const isSelected = selectedProvinceTab === tab.key;
                                    return (
                                      <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => {
                                          playSoftBubble();
                                          setSelectedProvinceTab(tab.key);
                                        }}
                                        className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer select-none shrink-0 ${
                                          isSelected
                                            ? 'bg-accent text-white shadow-xs'
                                            : 'bg-surface text-ink-secondary border border-border-light hover:bg-border-light/20 hover:text-ink'
                                        }`}
                                      >
                                        {tab.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                {/* Elegant subtle fade mask indicating scroll capability on horizontal touch device views */}
                                <div className="absolute right-0 top-0 bottom-2.5 w-10 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none" />
                              </div>

                              {/* Beautiful visual scroll indicator line */}
                              <div className="flex flex-col items-center justify-center w-full pt-1.5 pb-1 select-none">
                                <div className="h-2 w-20 bg-accent/5 border border-accent/10 rounded-full relative overflow-visible flex items-center">
                                  <div 
                                    className="absolute top-[-2px] bottom-[-2px] bg-gradient-to-r from-accent to-accent-hover rounded-full shadow-[0_2px_8px_rgba(37,99,235,0.45)] transition-all duration-150 ease-out flex items-center justify-center animate-indicator-glow"
                                    style={{ 
                                      width: '38%', 
                                      left: `${(regionScrollProgress / 100) * 62}%` 
                                    }}
                                  >
                                    {/* Glint highlights inside the capsule toggle */}
                                    <span className="w-2.5 h-1 bg-white/40 rounded-full block animate-pulse" />
                                  </div>
                                </div>
                              </div>
                            </div>
 
                            {/* Filtered cities dynamic grid presentation with precise sizing and styling */}
                            <div className="space-y-2 w-full overflow-hidden">
                              <div className="flex justify-between items-center text-[10px] uppercase font-bold text-ink-tertiary tracking-wider py-1 border-b border-border-light/40">
                                <span>Available Sourcing Hub</span>
                                <span>Geofence Status</span>
                              </div>
                              {cityLimitError && (
                                <div className="text-xs text-danger font-semibold bg-danger-soft px-3 py-2 rounded-lg border border-danger/20 mb-2">
                                  {cityLimitError}
                                </div>
                              )}
 
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[280px] overflow-y-auto overflow-x-hidden p-1 overscroll-y-contain scrollbar-none w-full">
                                {(() => {
                                  let filteredCities: CanadianCity[] = [];
                                  if (selectedProvinceTab === 'All') {
                                    Object.values(CANADIAN_REGIONS).forEach((provinceData) => {
                                      filteredCities = filteredCities.concat(provinceData.cities);
                                    });
                                  } else {
                                    filteredCities = CANADIAN_REGIONS[selectedProvinceTab]?.cities || [];
                                  }

                                  if (citySearchQuery.trim()) {
                                    const query = citySearchQuery.toLowerCase();
                                    filteredCities = filteredCities.filter(c => c.name.toLowerCase().includes(query));
                                  }

                                  if (filteredCities.length === 0) {
                                    return (
                                      <div className="col-span-full py-8 text-center text-xs text-ink-secondary space-y-1 bg-surface rounded-xl border border-dashed border-border-main">
                                        <span>🔍 No pipeline found matching "{citySearchQuery}"</span>
                                        <p className="text-[10px]">Try resetting the tab selection or typing another Canadian hub.</p>
                                      </div>
                                    );
                                  }

                                  return filteredCities.map((cityObj) => {
                                    const isSelected = cityInput.includes(cityObj.name);
                                    const [cityNameOnly] = cityObj.name.split(',');
                                    return (
                                      <button
                                        key={cityObj.name}
                                        type="button"
                                        onClick={() => {
                                          playTiktokLike();
                                          
                                          let next = cityInput;
                                          const maxCities = planNameStr === 'Free' ? 1 : (planNameStr.trim() === 'Starter' || planNameStr.trim() === 'Growth' ? 3 : Infinity);
                                          
                                          if (cityInput.includes(cityObj.name)) {
                                            if (cityInput.length === 1) return; // Must have at least 1
                                            next = cityInput.filter(c => c !== cityObj.name);
                                            setCityInput(next);
                                          } else {
                                            if (cityInput.length >= maxCities) {
                                                if (maxCities === 1) {
                                                    // Seamlessly swap out if strictly 1 limit
                                                    next = [cityObj.name];
                                                } else {
                                                    setCityLimitError(`Your ${planNameStr} Plan allows up to ${maxCities} cities per campaign.`);
                                                    setTimeout(() => setCityLimitError(null), 3500);
                                                    return;
                                                }
                                            } else {
                                                next = [...cityInput, cityObj.name];
                                            }
                                            setCityInput(next);
                                          }
                                          
                                          const firstCity = next.length > 0 ? next[0].split(',')[0] : 'Local';
                                          const title = next.length > 1 ? `${firstCity} +${next.length - 1} ${selectedNiche}s Campaign` : `${firstCity} ${selectedNiche}s Campaign`;
                                          setCampaignName(title);
                                          
                                          setIsFinding(true);
                                          setTimeout(() => {
                                            setIsFinding(false);
                                          }, 450);
                                        }}
                                        className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-center cursor-pointer group hover:scale-[1.01] w-full min-w-0 ${
                                          isSelected
                                            ? 'bg-accent/5 border-accent text-accent ring-2 ring-accent/15'
                                            : 'bg-white border-border-light text-ink hover:border-border-main'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between w-full gap-1.5 min-w-0">
                                          <div className="space-y-1 flex-1 min-w-0">
                                            <span className="font-bold text-[11px] sm:text-xs flex items-center gap-1 text-ink leading-tight min-w-0">
                                              <span className="shrink-0 select-none">🇨🇦</span>
                                              <span className="truncate block font-bold text-ink shrink-1 flex-1 min-w-0">{cityNameOnly}</span>
                                            </span>
                                            <span className={`text-[10px] uppercase font-bold font-mono px-1.5 py-0.5 rounded block w-fit leading-none ${
                                              isSelected ? 'bg-accent/15 text-accent' : 'bg-surface text-ink-secondary'
                                            }`}>
                                              {cityObj.provinceCode}
                                            </span>
                                          </div>
                                          {isSelected ? (
                                            <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-2xs">
                                              ✓
                                            </span>
                                          ) : (
                                            <span className="w-5 h-5 rounded-full border border-border-main group-hover:border-accent group-hover:bg-accent/10 transition-all shrink-0" />
                                          )}
                                        </div>
                                      </button>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Search or Fine-Tuner Input Field locked Mirror */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-ink-secondary uppercase tracking-widest block text-left">Selected Carrier Pipeline Locations</label>
                          <div className="flex flex-wrap gap-2 items-center bg-surface border border-border-main rounded-md p-2 min-h-[44px]">
                            <MapPin className="w-4 h-4 text-ink-secondary shrink-0 ml-1" />
                            {Array.isArray(cityInput) && cityInput.length > 0 ? (
                              cityInput.map((city, idx) => (
                                <span key={idx} className="inline-flex items-center px-2.5 py-1 bg-white border border-border-main rounded text-xs font-semibold text-ink shadow-3xs cursor-default">
                                  {city}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm font-semibold text-ink-tertiary">Please choose a metropolitan hub above...</span>
                            )}
                            <div className="ml-auto shrink-0 flex items-center pr-1">
                              <span className="inline-flex bg-success-soft text-success text-[10px] font-bold px-1.5 py-0.5 rounded border border-success/15 leading-none">
                                Geofenced 🇨🇦
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-5 animate-fade-in text-left">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-widest block text-left">
                            Global Target City / Location:
                          </label>
                          <div className="relative">
                            <Globe className="absolute left-3 top-2.5 w-4 h-4 text-ink-secondary" />
                            <input 
                              type="text" 
                              value={customCity}
                              onChange={(e) => {
                                setCustomCity(e.target.value);
                                setCityInput([e.target.value]);
                                const selectedNicheName = nicheList.find(n => n.id === selectedNiche)?.label || selectedNiche;
                                setCampaignName(`${e.target.value} ${selectedNicheName}s Campaign`);
                              }}
                              placeholder="e.g. London, UK or Austin, Texas"
                              className="w-full bg-white border border-border-main rounded-md pl-9 pr-4 py-2.5 text-sm font-semibold text-ink focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:font-normal placeholder:text-ink-tertiary"
                            />
                          </div>
                        </div>

                        {(!telnyxKey || !telnyxPhone) ? (
                          <div className="bg-danger-soft border border-danger/20 rounded-xl p-4 flex flex-col items-start gap-3">
                            <div className="flex items-center gap-2">
                              <ShieldAlert className="w-5 h-5 text-danger" />
                              <span className="text-[12px] font-bold text-danger uppercase tracking-widest">Setup Required</span>
                            </div>
                            <p className="text-xs text-danger/80 leading-relaxed max-w-sm">
                              You must configure your Telnyx API Key and Sender Phone Number to send campaigns globally.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                if (setActiveTab) setActiveTab('settings');
                              }}
                              className="px-4 py-2 bg-danger text-white text-xs font-bold uppercase tracking-wider rounded shadow-sm hover:bg-red-600 active:scale-95 transition-all text-center"
                            >
                              Configure in Settings
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-purple-50/50 border border-purple-200 rounded-lg p-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                                <Key className="w-4 h-4" />
                              </div>
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <span className="text-[11px] font-bold text-purple-700 uppercase tracking-widest block">API Configured</span>
                                <p className="text-[10px] text-ink-secondary truncate">Using Key: ******** & Phone: {telnyxPhone}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (setActiveTab) setActiveTab('settings');
                              }}
                              className="sm:ml-auto w-full sm:w-auto px-3 py-1.5 bg-white border border-border-main text-ink text-[10px] font-bold uppercase tracking-wider rounded shadow-3xs hover:bg-off-white active:scale-95 transition-all shrink-0 text-center"
                            >
                              Edit Settings
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                      {/* Google Maps Discovery & Sourcing console */}
                      <div className="bg-white border border-border-light rounded-xl p-5 md:p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-light">
                          <div className="space-y-1 text-left">
                            <span className="font-semibold text-ink text-base block flex items-center gap-2">
                              <Compass className="w-5 h-5 text-accent" />
                              Interactive Google Maps Places Discovery
                            </span>
                            <p className="text-ink-secondary text-xs">
                              Deploy direct crawls to identify geo-targeted prospects without websites in <span className="font-bold text-accent">{cityInput[0] || 'Local'}</span>.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="bg-accent-soft border border-accent/20 px-4 py-2 rounded-full flex items-center gap-2 shrink-0">
                              <Users className="w-4 h-4 text-accent" />
                              <span className="font-serif text-[16px] font-bold text-accent leading-none">
                                {selectedLeadIds.length} Selected
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Search Control Console */}
                        <div className={`bg-off-white/40 border border-border-main rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-200 ${
                          shouldShakeSearch ? 'animate-shake border-danger bg-danger-soft/10 shadow-sm shadow-danger/15' : ''
                        }`}>
                          <div className="space-y-1 text-left">
                            <span className="text-xs font-bold text-ink uppercase tracking-wider block">Target City: {cityInput[0] || 'Local Province'}</span>
                            <p className="text-[11px] text-ink-secondary">Search query bounds: "Best {selectedNiche} providers within city center limits"</p>
                          </div>

                          <button
                            type="button"
                            disabled={isSearchingGoogleMaps}
                            onClick={handleTriggerGoogleMapsSearch}
                            className={`relative px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 shrink-0 overflow-hidden ${
                              isSearchingGoogleMaps
                                ? 'bg-accent/10 text-accent/80 border border-accent/20 cursor-not-allowed shadow-inner select-none'
                                : shouldShakeSearch
                                  ? 'bg-danger hover:bg-danger text-white shadow-md active:scale-95 border border-danger/25'
                                  : 'bg-accent hover:bg-accent-hover text-white shadow-md active:scale-95 border border-accent/15 hover:shadow-accent/20'
                            }`}
                          >
                            {isSearchingGoogleMaps && (
                              <span className="absolute inset-0 bg-accent/5 animate-pulse" />
                            )}
                            <Loader2 className={`w-3.5 h-3.5 ${isSearchingGoogleMaps ? 'text-accent animate-spin' : 'hidden'}`} />
                            <MapPin className={`w-3.5 h-3.5 text-white ${isSearchingGoogleMaps ? 'hidden' : ''}`} />
                            <span className="relative z-10 transition-all duration-300">
                              {isSearchingGoogleMaps ? 'Searching...' : 'Search for Businesses'}
                            </span>
                          </button>
                        </div>

                        {/* Beautiful Scan Animations & Pulsing Satellite GIS Plate */}
                        {isSearchingGoogleMaps && (
                          <div className="bg-gradient-to-br from-white to-off-white border border-accent/20 rounded-2xl p-5 md:p-6 text-left shadow-xs flex flex-col md:flex-row gap-6 items-stretch animate-fade-in">
                            {/* Left column: Satellite Radar Pulse Scanner */}
                            <div className="flex flex-col items-center justify-center bg-accent-soft/30 border border-accent/10 rounded-xl p-5 text-center shrink-0 w-full md:w-56 space-y-4">
                              <div className="relative w-24 h-24 rounded-full border border-accent/20 bg-accent/5 flex items-center justify-center shrink-0 overflow-hidden mx-auto">
                                <div className="absolute inset-0 rounded-full border border-dashed border-accent/30 animate-spin" style={{ animationDuration: '8s' }} />
                                <div className="absolute w-16 h-16 rounded-full border border-accent/25 bg-accent/5 animate-pulse" />
                                <div className="absolute w-8 h-8 rounded-full border border-accent/40 bg-accent/10" />
                                
                                {/* Rotating Radar Sweeping Line */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-accent/0 via-accent/0 to-accent/20 rounded-full animate-spin" style={{ animationDuration: '3.5s', transformOrigin: 'center' }} />
                                <Compass className="w-6 h-6 text-accent animate-bounce" />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-accent uppercase tracking-widest block">GIS Target Bounds</span>
                                <div className="font-mono text-xs text-ink bg-white px-2.5 py-1 rounded border border-border-light shadow-3xs flex justify-center gap-1.5">
                                  {(() => {
                                    const coords = getCityCoords(cityInput[0] || 'Toronto, ON');
                                    return (
                                      <>
                                        <span className="text-[10px] font-semibold text-accent/80 font-mono">{coords.lat}</span>
                                        <span className="text-border-main">|</span>
                                        <span className="text-[10px] font-semibold text-accent/80 font-mono">{coords.lng}</span>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>

                            {/* Right column: Progress logs and Real-time Counter */}
                            <div className="flex-1 flex flex-col justify-between space-y-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex w-2 h-2 rounded-full bg-accent animate-ping" />
                                    <span className="text-xs font-bold text-ink uppercase tracking-wider">Active Places API Discovery Mode</span>
                                  </div>
                                  <span className="text-[10px] font-semibold text-accent uppercase bg-accent-soft px-2 py-0.5 rounded-full">
                                    Scan Rate: 3 leads = 1 Credit
                                  </span>
                                </div>

                                {/* Smooth glowing progress filler */}
                                <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden border border-border-light relative shadow-inner">
                                  <div 
                                    className="h-full bg-gradient-to-r from-accent to-accent-hover rounded-full transition-all duration-300" 
                                    style={{ width: `${Math.min(100, (mapsScanLogs.length / 6) * 100)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Sequential Crawl Log streams */}
                              <div className="bg-white/75 border border-border-main p-4 rounded-xl space-y-2.5 max-h-[175px] overflow-y-auto shadow-3xs">
                                {mapsScanLogs.map((log, idx) => (
                                  <div key={idx} className="flex items-start gap-2.5 animate-fade-in text-[11.5px] text-ink-secondary leading-normal">
                                    {idx === mapsScanLogs.length - 1 ? (
                                      <span className="text-accent text-[11.5px] select-none animate-bounce pt-0.5">⚡</span>
                                    ) : (
                                      <span className="text-success text-[11.5px] select-none">✓</span>
                                    )}
                                    <span className={idx === mapsScanLogs.length - 1 ? "text-accent font-semibold" : ""}>{log}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Lead grid & Selection boxes */}
                        {!isSearchingGoogleMaps && googleMapsLeads.length > 0 && (
                          <div className="space-y-4">
                            {/* Option header controls */}
                            <div className="flex items-center justify-between border-b border-border-light pb-2.5">
                              <span className="text-xs font-bold text-ink-secondary uppercase tracking-widest text-[10px]">Discovered GBP Leads ({googleMapsLeads.length} listings)</span>
                            </div>

                            {/* Responsive Interactive Listing Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {googleMapsLeads.map((lead) => {
                                const isChecked = selectedLeadIds.includes(lead.id);
                                return (
                                  <div
                                    key={lead.id}
                                    onClick={() => handleToggleLead(lead.id)}
                                    className={`p-4 rounded-xl border text-left transition-all duration-200 relative cursor-pointer flex items-start gap-3.5 select-none hover:scale-[1.01] ${
                                      isChecked
                                        ? 'bg-accent/5 border-accent ring-2 ring-accent/15'
                                        : 'bg-white border-border-light hover:border-border-main'
                                    }`}
                                  >
                                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleLead(lead.id)}
                                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                                          isChecked
                                            ? 'bg-accent text-white border-accent shadow-sm'
                                            : 'bg-white border-border-main text-transparent hover:border-accent'
                                        }`}
                                      >
                                        <Check className="w-3.5 h-3.5 stroke-[3px]" />
                                      </button>
                                    </div>

                                    <div className="space-y-1.5 flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="font-bold text-xs text-ink leading-tight truncate">{lead.name}</span>
                                        <div className="flex items-center gap-0.5 shrink-0 bg-yellow-450/10 border border-yellow-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold text-yellow-800">
                                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                                          <span>{lead.rating}</span>
                                          <span className="text-ink-tertiary">({lead.reviews})</span>
                                        </div>
                                      </div>

                                      <p className="text-[10px] text-ink-secondary truncate">📍 {lead.address}</p>
                                      <p className="text-[10px] text-ink-secondary font-mono">📞 {lead.phone}</p>

                                      {/* Website Audit Badge */}
                                      <div className="flex items-center gap-1.5 pt-0.5">
                                        {lead.currentWebsite ? (
                                          <span className="inline-flex items-center bg-zinc-100 text-zinc-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-200/50">
                                            🌍 Has Website
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center bg-danger-soft text-danger text-[9px] font-bold px-1.5 py-0.5 rounded border border-danger/15 animate-pulse">
                                            ⚠️ No Website Found (Hot lead!)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Dynamic Selection Center & Refund Guarantee Console */}
                        {!isSearchingGoogleMaps && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1.5 text-left">
                            {/* Left: Explanatory Guarantee & Breakdown Card */}
                            <div className="bg-accent/5 border border-accent/15 rounded-xl p-4 md:p-5 flex gap-4 text-left shadow-3xs hover:bg-accent/8 transition-all duration-200">
                              <div className="w-9 h-9 rounded-full bg-accent/10 border border-accent/15 text-accent flex items-center justify-center shrink-0 mt-0.5">
                                <ShieldCheck className="w-4 h-4 text-accent" />
                              </div>
                              <div className="space-y-2 flex-grow">
                                <span className="text-[11px] font-bold text-accent uppercase tracking-wider block">Credit Formula & Protection Safeguard</span>
                                <p className="text-xs text-ink-secondary leading-normal">
                                  Each profile you select and deploy requires exactly <strong className="text-accent font-bold">4 credits</strong> from your overall balance budget:
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-ink bg-white/60 p-2.5 rounded-lg border border-border-light/80">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs">💬</span>
                                    <span>3 Credits (SMS transmit)</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs">🌐</span>
                                    <span>1 Credit (Site build & CDN deploy)</span>
                                  </div>
                                </div>
                                <p className="text-[10px] text-zinc-500 italic leading-relaxed pt-0.5">
                                  🛡️ <strong className="text-zinc-600 font-semibold font-sans">Automatic Failure Refund Guarantee:</strong> If any outbound SMS message fails delivery transmission or web asset hosting encounters deployment issues, every credit deployed for that specific profile is returned live straight to your dashboard balance instantly.
                                </p>
                              </div>
                            </div>

                            {/* Right: Selected Profiles Board */}
                            <div className="bg-surface border border-border-main rounded-xl p-4 md:p-5 flex flex-col justify-between text-left space-y-3 shadow-3xs animate-fade-in">
                              <div className="flex items-center justify-between border-b border-border-light pb-2.5">
                                <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                                  <Users className="w-4 h-4 text-accent shrink-0" />
                                  Selected Campaign Profiles ({selectedLeadIds.length})
                                </span>
                                {selectedLeadIds.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      playSlideTick();
                                      const refundCredits = selectedLeadIds.length * COST_PER_LEAD;
                                      setUserCredits(prev => {
                                        const next = prev + refundCredits;
                                        localStorage.setItem('lunao_user_credits', next.toString());
                                        return next;
                                      });
                                      setSelectedLeadIds([]);
                                    }}
                                    className="text-[10px] text-danger font-bold uppercase tracking-wider hover:underline transition-colors"
                                  >
                                    Clear All
                                  </button>
                                )}
                              </div>

                              {selectedLeadIds.length > 0 ? (
                                <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto pr-1">
                                  {googleMapsLeads.filter(lead => selectedLeadIds.includes(lead.id)).map(lead => (
                                    <div 
                                      key={lead.id} 
                                      className="inline-flex items-center gap-2 bg-white border border-border-light pl-2.5 pr-2 py-1.5 rounded-lg hover:border-accent/35 hover:scale-[1.01] transition-all text-xs font-semibold text-ink shadow-3xs group shrink-0"
                                    >
                                      <span className="truncate max-w-[130px] font-medium">{lead.name}</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleLead(lead.id);
                                        }}
                                        className="w-4 h-4 rounded-full flex items-center justify-center text-ink-tertiary hover:text-danger hover:bg-danger/10 group-hover:bg-zinc-150 transition-colors cursor-pointer"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-border-main rounded-lg bg-white/40">
                                  <Users className="w-6 h-6 text-ink-tertiary mb-1.5" />
                                  <p className="text-[11px] font-semibold text-ink-tertiary">No prospects selected. Scroll above to select profiles manually to include in this campaign blast.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Summary & Error feedback block */}
                        {selectedLeadIds.length > maxLeadsAllowed ? (
                          <div 
                            id="quota-limits-error-card" 
                            key={`error-card-${errorShakes}`}
                            className={`bg-danger-soft border border-danger/25 rounded-xl p-4 md:p-5 shadow-xs flex items-start gap-4 text-left animate-fade-in ${errorShakes > 0 ? 'animate-tremor-shake' : ''}`}
                          >
                            <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center shrink-0">
                              <ShieldAlert className="w-5 h-5 animate-pulse" />
                            </div>
                            <div className="space-y-3 flex-grow">
                              <div className="space-y-1">
                                <strong className="text-xs font-bold text-danger uppercase tracking-wider block">Insufficient Balance</strong>
                                <p className="text-[11.5px] text-ink-secondary leading-relaxed">
                                  Your current balance is <strong className="text-ink">{userQuotaLeft.toLocaleString()} Credits</strong>. Custom Google Maps targeting of <strong className="text-ink">{selectedLeadIds.length}</strong> outreach targets requires <strong className="text-danger font-semibold">{(selectedLeadIds.length * COST_PER_LEAD).toLocaleString()} Credits</strong>.
                                </p>
                              </div>
                              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (setActiveTab) { setActiveTab('plans'); }
                                    setQuotaError(false);
                                  }}
                                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-[11px] font-bold rounded shadow-2xs transition-all cursor-pointer font-sans uppercase tracking-wider w-full sm:w-auto text-center"
                                >
                                  Purchase Credits
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const clampedIds = googleMapsLeads.slice(0, Math.max(1, maxLeadsAllowed)).map(l => l.id);
                                    setSelectedLeadIds(clampedIds);
                                    setTargetSmsCount(clampedIds.length);
                                    setQuotaError(false);
                                  }}
                                  className="px-3.5 py-2 border border-border-main text-ink text-[11px] font-semibold rounded hover:bg-off-white bg-white transition-all cursor-pointer w-full sm:w-auto text-center"
                                >
                                  Clamp to Plan Limit ({maxLeadsAllowed})
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : selectedLeadIds.length === 0 ? (
                          <div 
                            id="missing-selection-error-card"
                            key={`missing-error-${errorShakes}`}
                            className={`${missingSelectionError ? 'bg-danger-soft text-danger border-danger/30 shadow-danger/10 animate-shake' : 'bg-amber-550/5 text-amber-800 border-amber-500/20 animate-fade-in'} border rounded-md p-3.5 flex items-center gap-2.5 text-left shadow-2xs transition-all duration-300`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${missingSelectionError ? 'bg-danger' : 'bg-amber-500'} animate-ping`}></span>
                            <p className={`text-[11px] font-semibold ${missingSelectionError ? 'text-danger' : 'text-amber-900'}`}>
                              {missingSelectionError ? 'Action Blocked: You must select at least 1 local business profile to deploy campaigns to.' : 'Please select at least one discovered business listing above.'}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-success-soft text-success border border-success/15 rounded-md p-3.5 flex items-center gap-2.5 text-left animate-fade-in shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                            <p className="text-[11px] text-ink-secondary">
                              Campaign size of <strong className="text-ink">{selectedLeadIds.length} leads</strong> selected will utilize <strong className="text-success font-semibold">{selectedLeadIds.length * COST_PER_LEAD} credits</strong>. Real-time Maps API synchronization active.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* CSV IMPORTER INTERFACE - BEAUTIFUL, DETAILED TARGET SCHEMAS */
                    <div className="bg-white border border-border-main rounded-xl p-6 space-y-6 shadow-sm animate-fade-in text-left">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-accent uppercase tracking-widest block">Batch Ingestion</span>
                        <h4 className="text-lg font-serif text-ink tracking-tight">Bulk Canadian Lead Sheet importer</h4>
                        <p className="text-xs text-ink-secondary leading-relaxed">
                          Directly import custom business records from any spreadsheet list. This interface matches your leads to stunning websites and organizes immediate SMS dial codes.
                        </p>
                      </div>

                      {/* STRICT CSV SCHEMA REQUIREMENT CARD */}
                      <div className="bg-off-white border border-border-main rounded-xl p-5 space-y-3.5">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-accent" />
                          <span className="text-xs font-bold text-ink uppercase tracking-wider">Mandatory CSV Format Schema</span>
                        </div>
                        <p className="text-xs text-ink-secondary leading-relaxed">
                          To successfully parse your target prospects, your spreadsheet file <strong>must contain these exact columns</strong> as headers:
                        </p>

                        {/* Interactive schema cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-white border border-border-light p-3.5 rounded-lg flex items-start gap-3.5 shadow-3xs hover:border-accent-hover transition-colors">
                            <span className="text-xl">🏢</span>
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold text-ink uppercase tracking-wider block">Business Name</span>
                              <span className="text-[9px] text-ink-secondary leading-tight block">The master name key of the prospect company.</span>
                              <span className="text-[8.5px] text-accent font-mono font-medium block pt-1">Header: "Business Name"</span>
                            </div>
                          </div>

                          <div className="bg-white border border-border-light p-3.5 rounded-lg flex items-start gap-3.5 shadow-3xs hover:border-accent-hover transition-colors">
                            <span className="text-xl">📞</span>
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold text-[#e15c00] uppercase tracking-wider block">Phone Number</span>
                              <span className="text-[9px] text-ink-secondary leading-tight block">Pure numbers or standard phone formatted strings.</span>
                              <span className="text-[8.5px] text-[#e15c00] font-mono font-medium block pt-1">Header: "Phone Number"</span>
                            </div>
                          </div>

                          <div className="bg-white border border-border-light p-3.5 rounded-lg flex items-start gap-3.5 shadow-3xs hover:border-accent-hover transition-colors">
                            <span className="text-xl">📍</span>
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold text-ink uppercase tracking-wider block">City Name</span>
                              <span className="text-[9px] text-ink-secondary leading-tight block">Canadian municipality of target business location.</span>
                              <span className="text-[8.5px] text-accent font-mono font-medium block pt-1">Header: "City Name"</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white border border-border-light rounded-lg p-3 flex items-start gap-3 text-[11px] leading-relaxed text-ink-secondary">
                          <span className="text-amber-500 shrink-0">⚠️</span>
                          <div>
                            <strong className="text-ink">Important Note:</strong> Numbers will undergo strict geofencing validation. If the Canadian country code <code className="bg-surface px-1 py-0.5 rounded text-[10px] font-mono">+1</code> is missing, our system will auto-apply Canadian direct routing variables to bypass SPAM locks.
                          </div>
                        </div>
                      </div>

                      {missingSelectionError && !csvFileName && (
                        <div 
                          id="missing-selection-error-card"
                          key={`missing-error-csv-${errorShakes}`}
                          className="bg-danger-soft text-danger border border-danger/30 shadow-danger/10 shadow-sm rounded-md p-3.5 flex items-center gap-2.5 text-left animate-shake"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-danger animate-ping"></span>
                          <p className="text-[11px] font-semibold text-danger">
                            Action Blocked: You must upload a valid CSV list to deploy campaigns to.
                          </p>
                        </div>
                      )}

                      {/* EXQUISITE DRAG AND DROP ZONE */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const files = e.dataTransfer.files;
                          if (files.length > 0) {
                            handleCsvFile(files[0]);
                          }
                        }}
                        className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-3.5 transition-all cursor-pointer ${
                          csvFileName
                            ? (csvValidation?.ok && csvParsedCount > 0
                                ? 'bg-success-soft border-success/35'
                                : 'bg-danger-soft border-danger/35')
                            : 'bg-off-white/40 border-border-main hover:bg-off-white/70 hover:border-accent/40'
                        }`}
                      >
                        {isCsvParsing ? (
                          <div className="space-y-3 py-3">
                            <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto" />
                            <p className="text-xs font-semibold text-ink-secondary animate-pulse">Validating columns &amp; checking every row for name, city &amp; phone...</p>
                          </div>
                        ) : csvFileName ? (
                          <div className="space-y-3">
                            {csvValidation?.ok && csvParsedCount > 0 ? (
                              <>
                                <div className="w-12 h-12 rounded-full bg-success-soft text-success border border-success/20 flex items-center justify-center mx-auto">
                                  <Check className="w-6 h-6" />
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-xs font-bold font-mono text-ink block break-all">{csvFileName}</span>
                                  <span className="text-xs font-bold text-success flex items-center justify-center gap-1">
                                    ✓ Validated — {csvParsedCount} ready lead{csvParsedCount === 1 ? '' : 's'}{csvValidation.invalidCount > 0 ? `, ${csvValidation.invalidCount} skipped` : ''}.
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="w-12 h-12 rounded-full bg-danger-soft text-danger border border-danger/20 flex items-center justify-center mx-auto">
                                  <X className="w-6 h-6" />
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-xs font-bold font-mono text-ink block break-all">{csvFileName}</span>
                                  <span className="text-xs font-bold text-danger flex items-center justify-center gap-1">
                                    File rejected — fix the issues below and re-upload.
                                  </span>
                                </div>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCsvFileName(null);
                                setCsvParsedCount(0);
                                setCsvLeads([]);
                                setTargetSmsCount(10);
                                setCsvError(null);
                                setCsvValidation(null);
                              }}
                              className="px-3 py-1 text-[10px] uppercase font-bold text-danger hover:bg-danger-soft rounded border border-danger/10 transition-colors cursor-pointer"
                            >
                              Discard Sheet File
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer space-y-3 w-full h-full flex flex-col items-center justify-center py-4">
                            <input
                              type="file"
                              accept=".csv"
                              onChange={(e) => {
                                const files = e.target.files;
                                if (files && files.length > 0) {
                                  handleCsvFile(files[0]);
                                }
                              }}
                              className="hidden"
                            />
                            <div className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center mx-auto shadow-3xs">
                              <Upload className="w-5.5 h-5.5" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-ink">Drag &amp; Drop your CSV sheet here, or <span className="text-accent underline font-extrabold hover:text-accent-hover">browse local files</span></p>
                              <p className="text-[10px] text-ink-secondary">Required columns: <strong>Business Name</strong>, <strong>City Name</strong>, <strong>Phone Number</strong></p>
                            </div>
                          </label>
                        )}
                      </div>

                      {/* GOD-LEVEL VALIDATION REPORT — brand + mobile consistent */}
                      {csvError && (!csvValidation?.ok || csvParsedCount === 0) && (
                        <div id="csv-validation-report" className="bg-danger-soft border border-danger/30 rounded-xl p-4 sm:p-5 space-y-3.5 text-left animate-fade-in">
                          <div className="flex items-start gap-2.5">
                            <span className="w-6 h-6 rounded-full bg-danger/15 text-danger flex items-center justify-center shrink-0">
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </span>
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-danger uppercase tracking-wider">CSV not ready to launch</p>
                              <p className="text-[11px] font-medium text-danger/90 leading-relaxed">{csvError}</p>
                            </div>
                          </div>

                          {/* Missing required columns */}
                          {csvValidation && csvValidation.missingColumns.length > 0 && (
                            <div className="bg-white/70 border border-danger/15 rounded-lg p-3 space-y-2">
                              <p className="text-[10px] font-bold text-ink-secondary uppercase tracking-wider">Missing required columns</p>
                              <div className="flex flex-wrap gap-1.5">
                                {csvValidation.missingColumns.map((c) => (
                                  <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/10 text-danger text-[10px] font-bold border border-danger/20">
                                    <X className="w-2.5 h-2.5" /> {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Per-row problems */}
                          {csvValidation && csvValidation.invalidRows.length > 0 && (
                            <div className="bg-white/70 border border-danger/15 rounded-lg p-3 space-y-2">
                              <p className="text-[10px] font-bold text-ink-secondary uppercase tracking-wider">
                                Rows that need fixing ({csvValidation.invalidCount})
                              </p>
                              <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
                                {csvValidation.invalidRows.slice(0, 12).map((r) => (
                                  <div key={r.line} className="flex items-start gap-2 text-[11px] leading-tight">
                                    <span className="font-mono font-bold text-ink-secondary shrink-0">Row {r.line}</span>
                                    <span className="text-ink truncate max-w-[110px] shrink-0">{r.name}</span>
                                    <span className="text-danger font-medium">{r.issues.join(', ')}</span>
                                  </div>
                                ))}
                                {csvValidation.invalidRows.length > 12 && (
                                  <p className="text-[10px] text-ink-secondary italic">+ {csvValidation.invalidRows.length - 12} more…</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Required format reminder */}
                          <div className="bg-white/70 border border-border-light rounded-lg p-3 space-y-1.5">
                            <p className="text-[10px] font-bold text-ink-secondary uppercase tracking-wider">Required format</p>
                            <code className="block text-[10px] font-mono text-ink bg-surface rounded px-2 py-1.5 overflow-x-auto whitespace-nowrap">
                              Business Name,City Name,Phone Number
                            </code>
                            <code className="block text-[10px] font-mono text-ink-secondary bg-surface rounded px-2 py-1.5 overflow-x-auto whitespace-nowrap">
                              Vintage Cuts,New York,(212) 555-0188
                            </code>
                          </div>
                        </div>
                      )}

                      {/* Soft warning when valid but some rows skipped */}
                      {csvValidation?.ok && csvParsedCount > 0 && csvValidation.invalidCount > 0 && (
                        <div className="bg-warning-soft border border-warning/20 rounded-lg p-3 flex items-start gap-2.5 text-left animate-fade-in">
                          <span className="text-sm shrink-0">⚠️</span>
                          <p className="text-[11px] font-medium text-ink leading-relaxed">
                            {csvValidation.invalidCount} row(s) were skipped (missing name, city or phone). {csvParsedCount} valid lead(s) will be deployed. You can launch now or fix the file to include everyone.
                          </p>
                        </div>
                      )}

                      {/* Download Template sample */}
                      <div className="text-xs text-ink-secondary flex flex-col sm:flex-row sm:items-center justify-between border-t border-border-light pt-4.5 bg-off-white/40 p-3 rounded-lg gap-2">
                        <span className="flex items-center gap-1.5 text-left">
                          <span className="p-1 bg-accent-soft text-accent rounded-full text-[10px] w-5 h-5 flex items-center justify-center font-bold">ℹ</span>
                          <span>Need a boiler template? Download our pristine sample to secure schema headers.</span>
                        </span>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            playSoftTap();
                            const sample = [
                              'Business Name,City Name,Phone Number',
                              'Vintage Cuts Barber Lounge,New York,(212) 555-0188',
                              'Maple Leaf Salon,Toronto,(416) 555-0142',
                              'Everest Climate Systems,Austin,(512) 555-0988',
                            ].join('\n');
                            const blob = new Blob([sample], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'lunao-sample-leads.csv';
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="text-accent hover:underline font-extrabold shrink-0"
                        >
                          Download Sample CSV
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Choose Template */}
              {activeStep === 3 && (
                <div className="space-y-4 animate-fade-in text-sm text-ink">
                  <div className="space-y-1">
                    <h3 className="text-lg font-serif text-ink tracking-tight font-normal">Choose Visual Template</h3>
                    <p className="text-xs text-ink-secondary">Selected template will format the generated websites dynamically using the local data discovered.</p>
                  </div>

                  {/* Built-in vs My Templates tab */}
                  <div className="flex items-center gap-1 p-1 bg-off-white border border-border-main rounded-xl w-fit">
                    <button
                      onClick={() => { playSlideTick(); }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold font-sans transition-all ${
                        true ? 'bg-white text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Built-in Templates
                    </button>
                    {customTemplates.length > 0 && (
                      <button
                        onClick={() => { playSlideTick(); }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold font-sans transition-all text-ink-secondary hover:text-ink relative"
                      >
                        <Layout className="w-3.5 h-3.5" />
                        My Templates
                        <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold">
                          {customTemplates.length}
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                    {/* Custom templates first */}
                    {customTemplates.map((temp) => {
                      const isSel = selectedTemplateId === temp.id;
                      return (
                        <div
                          key={temp.id}
                          className={`rounded-lg border overflow-hidden cursor-pointer transition-all shadow-xs relative flex flex-col bg-white ${
                            isSel ? 'border-violet-500 ring-1 ring-violet-500' : 'border-border-light hover:border-violet-400 hover:shadow-md'
                          }`}
                          onClick={() => { playElegantBell(); setSelectedTemplateId(temp.id); }}
                        >
                          {/* Custom template badge */}
                          <div className="absolute top-2.5 left-2.5 z-10">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500 text-white">
                              <Sparkles className="w-2.5 h-2.5" /> AI
                            </span>
                          </div>
                          {/* Colored placeholder preview */}
                          <div className="h-44 bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 opacity-20">
                              <div className="absolute top-6 left-6 right-6 h-6 bg-violet-300/60 rounded" />
                              <div className="absolute top-16 left-6 w-24 h-3 bg-violet-200/60 rounded" />
                              <div className="absolute top-22 left-6 right-6 h-2 bg-violet-200/40 rounded" />
                              <div className="absolute bottom-6 left-6 right-6 grid grid-cols-3 gap-2">
                                {[0,1,2].map(j => <div key={j} className="h-8 bg-violet-200/40 rounded" />)}
                              </div>
                            </div>
                            <div className="relative text-center px-4">
                              <p className="text-sm font-bold font-sans text-violet-700">{temp.name}</p>
                              <p className="text-[10px] text-violet-500 font-sans mt-0.5">{temp.niche}</p>
                            </div>
                          </div>
                          <div className="p-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold font-sans text-ink">{temp.name}</p>
                              <p className="text-[10px] text-ink-secondary font-sans">{temp.niche}</p>
                            </div>
                            {isSel && (
                              <div className="w-5 h-5 rounded-full bg-violet-500 text-white flex items-center justify-center">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Built-in templates */}
                    {templates.filter(t => t.niche === selectedNiche).map((temp) => {
                      const isSel = selectedTemplateId === temp.id;
                      const content = getTemplateContent(temp.id, temp.name, temp.niche);
                      const meta = getTemplateMetaForNiche(selectedNiche, temp.id);
                      return (
                        <div
                          key={temp.id}
                          className={`rounded-lg border overflow-hidden cursor-pointer transition-all shadow-xs relative flex flex-col bg-white ${
                            isSel ? 'border-accent ring-1 ring-accent' : 'border-border-light hover:border-border-main hover:shadow-md'
                          }`}
                        >
                          {/* Template simulation banner with premium realistic dual-device mockups */}
                          <div 
                            onClick={() => {
                              playElegantBell();
                              setSelectedTemplateId(temp.id);
                            }}
                            className="h-44 relative overflow-hidden flex flex-col justify-between shrink-0 select-none border-b border-border-light bg-cover bg-center"
                            style={{ backgroundImage: `url(${temp.id === 't3' ? '/salon_template_cover.png' : temp.id === 't5' ? '/roofing_cover.png' : temp.id === 't6' ? '/hvac_cover.png' : temp.id === 't7' ? '/gym_cover.png' : temp.id === 't8' ? '/realestate_cover.png' : getNicheBgImage(temp.niche)})` }}
                          >
                            {/* Visual dark backdrop gradient */}
                            <div className="absolute inset-0 bg-ink/50 backdrop-blur-[0.5px] z-[1]" />

                            {/* Simulated Desktop Browser Frame */}
                            <div 
                              className="absolute left-3 right-10 top-3 h-32 bg-ink/90 border border-white/10 rounded-md shadow-lg flex flex-col overflow-hidden z-[2]"
                            >
                              {/* Browser Window Bar */}
                              <div className="bg-black/40 px-1.5 py-0.5 flex items-center gap-1 border-b border-white/5 shrink-0 z-10 relative">
                                <span className="w-1 h-1 rounded-full bg-red-400"></span>
                                <span className="w-1 h-1 rounded-full bg-yellow-400"></span>
                                <span className="w-1 h-1 rounded-full bg-green-400"></span>
                                <span className="text-[4px] text-white/30 font-mono ml-1.5 truncate">lunao.io/live/{temp.id}</span>
                              </div>
                              {/* Mock content */}
                              <div className="flex-1 overflow-hidden bg-[#161512] relative">
                                {temp.id === 't2' ? (
                                  <div className="h-full p-2.5 flex flex-col gap-1 bg-[#FAF6ED] text-[#121F1A] text-[4.5px]">
                                    <div className="border-b border-[#D9CDBC] pb-0.5 flex justify-between items-center bg-[#F2EAD8]/50">
                                      <span className="font-bold font-serif italic text-[4.5px]">💈 FRANKLIN &amp; SONS</span>
                                      <span className="bg-[#121F1A] text-white px-1 py-0.2 rounded font-bold uppercase scale-[0.8] leading-none">BOOK CHAIR</span>
                                    </div>
                                    <div className="py-0.2 border border-[#D9CDBC] bg-white/40 p-1 rounded-xs">
                                      <h4 className="font-bold font-serif leading-none italic text-[5px]">Franklin &amp; Sons 💈✂️</h4>
                                      <p className="text-[3px] text-[#556960] font-mono mt-0.5 uppercase tracking-wide">EST. — Premium Haircuts &amp; Fades</p>
                                    </div>
                                    <div className="flex justify-between items-center border-y border-[#D9CDBC] py-0.5 mt-0.5 text-[3.5px]">
                                      <span>⭐ 200+ Reviews</span>
                                      <span>📅 7 Days A Week</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-0.5">
                                      <div className="bg-white/50 rounded flex flex-col items-center justify-center py-0.5 border border-[#121F1A] shadow-[0_1px_2px_rgba(18,31,26,0.05)]">
                                        <div className="w-2 h-2 rounded-full bg-[#E5D7C3] mb-0.5" />
                                        <span className="text-[#9E3C30] font-bold font-mono text-[3px]">$25</span>
                                      </div>
                                      <div className="bg-[#121F1A] rounded flex flex-col items-center justify-center py-0.5">
                                        <div className="w-2 h-2 rounded-full bg-white/10 mb-0.5" />
                                        <span className="text-white font-bold font-mono text-[3px]">$35</span>
                                      </div>
                                    </div>
                                  </div>
                                ) : temp.id === 't3' ? (
                                  <div className="h-full p-2.5 flex flex-col gap-1.5 bg-[#FAF8F4] text-[#1C1A17] text-[4.5px]">
                                    <div className="border-b border-[#D6CFC5] pb-1 flex justify-between items-center bg-[#F3EFE7]/50 px-1">
                                      <span className="text-[5.5px] font-bold tracking-tight font-serif italic text-[#C4856A]">MAISON AURÉLIE</span>
                                      <span className="text-[4px] bg-[#C4856A] text-white px-2 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">BOOK NOW</span>
                                    </div>
                                    <div className="py-1 border border-[#D6CFC5] bg-[#FFFFFF] p-2 rounded shadow-sm text-center">
                                      <h4 className="text-[8px] font-extrabold font-serif text-[#1C1A17] tracking-tight leading-none italic">Maison Aurélie Hair Studio</h4>
                                      <p className="text-[4px] text-[#C4856A] font-mono mt-0.5 uppercase tracking-wide">Parisian Editorial Warmth · Cuts</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-0.5">
                                      <div className="border border-[#E8E3DB] bg-white p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-[#4A4540] font-bold truncate">BALAYAGE</span>
                                        <span className="text-[#C4856A] font-bold font-mono">$160</span>
                                      </div>
                                      <div className="border border-[#E8E3DB] bg-white p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-[#4A4540] font-bold truncate">SIGNATURE CUT</span>
                                        <span className="text-[#C4856A] font-bold font-mono">$65</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto pt-1 border-t border-[#D6CFC5] flex justify-between items-center text-[3.5px] text-[#8C8680]">
                                      <span>📍 Los Angeles, CA</span>
                                      <span>📞 (310) 555-0193</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't4' ? (
                                  <div className="h-full p-2.5 flex flex-col gap-1 bg-[#FFFFFF] text-[#0A1628] text-[4.5px]">
                                    <div className="border-b border-[#DDE2EC] pb-1 flex justify-between items-center bg-white">
                                      <span className="text-[5px] font-bold tracking-tight text-[#0A1628] flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded bg-[#0EA5A0] inline-block" /> CLARITY DENTAL
                                      </span>
                                      <span className="text-[3.5px] bg-[#0EA5A0] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider scale-[0.85] leading-none">BOOK APPT</span>
                                    </div>
                                    <div className="py-1 border border-[#DDE2EC] bg-[#F7F8FA] p-1.5 rounded text-center">
                                      <h4 className="text-[7.5px] font-bold text-[#0A1628] tracking-tight leading-none">Clarity Dental Studio</h4>
                                      <p className="text-[4px] text-[#0EA5A0] font-mono mt-0.5 uppercase tracking-wide">CLINICAL LUXURY • NEW YORK, NY</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-0.5">
                                      <div className="border border-[#E8ECF3] bg-white p-1 flex items-center justify-between text-[4.5px] rounded-sm shadow-xs">
                                        <span className="text-[#344D6E] font-medium truncate">TEETH CLEANING</span>
                                        <span className="text-[#0EA5A0] font-medium font-mono">$99</span>
                                      </div>
                                      <div className="border border-[#E8ECF3] bg-white p-1 flex items-center justify-between text-[4.5px] rounded-sm shadow-xs">
                                        <span className="text-[#344D6E] font-medium truncate">COS. VENEERS</span>
                                        <span className="text-[#0EA5A0] font-medium font-mono">CONSULT</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto pt-1 border-t border-[#DDE2EC] flex justify-between items-center text-[3.5px] text-[#6B82A0]">
                                      <span>📍 New York, NY</span>
                                      <span>📞 (646) 555-0182</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't5' ? (
                                  <div className="h-full p-2.5 flex flex-col gap-1 bg-[#161614] text-[#F5F4F0] text-[4.5px]">
                                    <div className="border-b border-[#2A2A26] pb-1 flex justify-between items-center bg-[#0C0C0B] px-1">
                                      <span className="text-[5.5px] font-extrabold tracking-wider text-white">🏠 {meta.brandName || "Ironclad"}</span>
                                      <span className="text-[4px] bg-[#E8760A] text-black px-1.5 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">FREE EST</span>
                                    </div>
                                    <div className="py-1 border border-[#2A2A26] bg-[#1E1E1B] p-2 rounded shadow-sm text-center">
                                      <h4 className="text-[8px] font-extrabold text-white tracking-tight leading-none">{meta.brandName || "Ironclad Roofing"}</h4>
                                      <p className="text-[4px] text-[#E8760A] font-mono mt-0.5 uppercase tracking-wide">GAF Master Elite • 50-Yr Warranty</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-0.5">
                                      <div className="border border-[#222220] bg-[#1E1E1B] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-[#B8B5AC] font-bold truncate">REPLACEMENT</span>
                                        <span className="text-[#E8760A] font-bold">1-2 DAYS</span>
                                      </div>
                                      <div className="border border-[#222220] bg-[#1E1E1B] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-[#B8B5AC] font-bold truncate">LEAK REPAIR</span>
                                        <span className="text-[#E8760A] font-bold">SAME DAY</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto pt-1 border-t border-[#2A2A26] flex justify-between items-center text-[3.5px] text-[#706D65]">
                                      <span>📍 Austin, TX</span>
                                      <span>📞 (512) 555-0199</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't6' ? (
                                  <div className="h-full p-2.5 flex flex-col gap-1 bg-[#0F172A] text-[#F1F5F9] text-[4.5px]">
                                    <div className="bg-[#F97316] text-[#0F172A] px-1 py-0.5 text-center font-bold text-[3.5px] rounded-xs uppercase tracking-wide leading-none select-none">
                                      🚨 24/7 HVAC EMERGENCY SERVICE AVAILABLE
                                    </div>
                                    <div className="border-b border-[#334155] pb-0.5 flex justify-between items-center bg-[#0F172A] px-1">
                                      <span className="text-[5.5px] font-extrabold tracking-wider text-white">❄️🔥 {meta.brandName || "CLIMATE ECO"}</span>
                                      <span className="text-[3.8px] bg-[#22C55E] text-white px-1.5 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">FREE EST</span>
                                    </div>
                                    <div className="py-1 border border-[#334155] bg-[#1E293B] p-2 rounded shadow-sm text-center">
                                      <h4 className="text-[8px] font-extrabold text-white tracking-tight leading-none">{meta.brandName || "Climate Pro"}</h4>
                                      <p className="text-[4px] text-[#F97316] font-mono mt-0.5 uppercase tracking-wide">Same-Day Repair • Certified Pros</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-0.5">
                                      <div className="border border-[#334155] bg-[#1E293B] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-[#94A3B8] font-bold truncate">HEATING</span>
                                        <span className="text-[#22C55E] font-bold">24/7 REPAIR</span>
                                      </div>
                                      <div className="border border-[#334155] bg-[#1E293B] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-[#94A3B8] font-bold truncate">COOLING</span>
                                        <span className="text-[#F97316] font-bold">UPFRONT</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto pt-1 border-t border-[#334155] flex justify-between items-center text-[3.5px] text-[#94A3B8]">
                                      <span>📍 Atlanta, GA</span>
                                      <span>📞 (404) 555-0118</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't7' ? (
                                  <div className="h-full p-2.5 flex flex-col gap-1 bg-[#111827] text-[#F3F4F6] text-[4.5px]">
                                    <div className="bg-[#EF4444] text-white px-1 py-0.5 text-center font-bold text-[3.5px] rounded-xs uppercase tracking-wide leading-none select-none">
                                      ⚡ GET 1-DAY FREE PASS WITH PERSONAL TRAINER
                                    </div>
                                    <div className="border-b border-[#374151] pb-0.5 flex justify-between items-center bg-[#111827] px-1">
                                      <span className="text-[5.5px] font-extrabold tracking-wider text-white">💪 {meta.brandName || "IRON PULSE"}</span>
                                      <span className="text-[3.8px] bg-[#F59E0B] text-black px-1.5 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">JOIN NOW</span>
                                    </div>
                                    <div className="py-1 border border-[#374151] bg-[#1F2937] p-2 rounded shadow-sm text-center">
                                      <h4 className="text-[8px] font-extrabold text-white tracking-tight leading-none">{meta.brandName || "Iron Pulse Fitness"}</h4>
                                      <p className="text-[4px] text-[#EF4444] font-mono mt-0.5 uppercase tracking-wide">Elite Training • Open 24/7</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-0.5">
                                      <div className="border border-[#374151] bg-[#1F2937] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-[#9CA3AF] font-bold truncate">WORKOUTS</span>
                                        <span className="text-[#F59E0B] font-bold">HIIT & YOGA</span>
                                      </div>
                                      <div className="border border-[#374151] bg-[#1F2937] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-[#9CA3AF] font-bold truncate">COACHING</span>
                                        <span className="text-[#EF4444] font-bold">INCLUDED</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto pt-1 border-t border-[#374151] flex justify-between items-center text-[3.5px] text-[#9CA3AF]">
                                      <span>📍 Miami, FL</span>
                                      <span>📞 (305) 555-0145</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't8' ? (
                                  <div className="h-full p-2.5 flex flex-col gap-1 bg-[#111111] text-[#FAFAF8] text-[4.5px]">
                                    <div className="bg-[#C9A86A] text-[#111111] px-1 py-0.5 text-center font-bold text-[3.5px] rounded-xs uppercase tracking-wide leading-none select-none">
                                      🔑 PREMIUM REAL ESTATE EXPERTISE
                                    </div>
                                    <div className="border-b border-white/5 pb-0.5 flex justify-between items-center bg-[#111111] px-1">
                                      <span className="text-[5.5px] font-extrabold tracking-wider text-white">🏡 {meta.brandName || "AURA PROPERTIES"}</span>
                                      <span className="text-[3.8px] bg-[#C9A86A] text-[#111111] px-1.5 py-0.5 rounded font-bold uppercase scale-[0.85] leading-none">ESTIMATE</span>
                                    </div>
                                    <div className="py-1 border border-white/5 bg-[#1E1E1E] p-2 rounded shadow-sm text-center">
                                      <h4 className="text-[8px] font-extrabold text-[#C9A86A] tracking-tight leading-none font-serif">{meta.brandName || "Aura Luxury Homes"}</h4>
                                      <p className="text-[4px] text-white/70 font-mono mt-0.5 uppercase tracking-wide">Elite Brokerage • Exclusive Listings</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-0.5">
                                      <div className="border border-white/5 bg-[#1E1E1E] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-white/60 font-bold truncate">ESTATE SALES</span>
                                        <span className="text-[#C9A86A] font-bold">TOP RET</span>
                                      </div>
                                      <div className="border border-white/5 bg-[#1E1E1E] p-1 flex items-center justify-between text-[4.5px] font-mono rounded-sm shadow-xs">
                                        <span className="text-white/60 font-bold truncate">CONSULTING</span>
                                        <span className="text-white font-bold">1-ON-1</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto pt-1 border-t border-white/5 flex justify-between items-center text-[3.5px] text-white/50">
                                      <span>📍 Beverly Hills, CA</span>
                                      <span>📞 (310) 555-0189</span>
                                    </div>
                                  </div>
                                ) : temp.niche === 'Barber' ? (
                                  <img src="/barber_desktop_preview.png" alt="Desktop UI Preview" className="w-full h-auto object-cover object-top opacity-90" />
                                ) : (
                                  <div className="h-full p-1.5 flex flex-col gap-1 bg-gradient-to-b from-[#161512] to-black text-white text-[4.5px]">
                                    <div className="border-b border-white/5 pb-0.5 flex justify-between items-center">
                                      <span className="font-bold truncate max-w-[65%] leading-none">{meta.logoEmoji} {meta.brandName}</span>
                                      <span className="bg-accent text-white px-1 rounded-3xs font-semibold uppercase scale-[0.8] leading-none">BOOK</span>
                                    </div>
                                    <div className="py-0.2">
                                      <h4 className="font-serif leading-none truncate">{content.heroTitle}</h4>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Simulated Smartphone mockup */}
                            <div 
                              className="absolute right-2 top-6 w-16 h-32 bg-zinc-950 border border-zinc-805 rounded-lg shadow-2xl flex flex-col overflow-hidden z-[3]"
                            >
                              <div className="flex-1 w-full bg-[#111110] relative">
                                {temp.id === 't2' ? (
                                  <div className="h-full p-1 pt-2 flex flex-col gap-0.5 bg-[#FAF6ED] text-[#121F1A] text-[3.5px] font-mono leading-none">
                                    <div className="flex justify-between items-center border-b border-[#D9CDBC] pb-0.2 bg-[#F2EAD8]/50">
                                      <span className="font-bold font-serif italic scale-90">FRANKLIN</span>
                                      <span className="bg-[#121F1A] text-white px-0.5 rounded-sm font-bold uppercase scale-75 leading-none">BOOK</span>
                                    </div>
                                    <div className="text-center bg-white/40 border border-[#D9CDBC] rounded-3xs scale-95 p-0.2 my-0.2">
                                      <h5 className="font-serif scale-95 italic">Franklin &amp; Sons</h5>
                                    </div>
                                    <div className="border-y border-[#D9CDBC] py-0.5 text-center">
                                       <span className="text-[2.5px] font-bold">⭐ 200+ Reviews · 📅 7 Days</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <div className="bg-white/50 rounded-sm border border-[#121F1A] px-1 flex items-center justify-between scale-[0.9] shadow-[0_1px_2px_rgba(18,31,26,0.05)] py-0.5">
                                        <span className="truncate text-[#26332E] max-w-[50%] font-bold text-[2.5px]">CLASSIC CUT</span>
                                        <span className="text-[#9E3C30] font-bold font-mono text-[2.5px]">$25</span>
                                      </div>
                                      <div className="bg-[#121F1A] rounded-sm px-1 py-0.5 flex items-center justify-between scale-[0.9] shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
                                         <span className="truncate max-w-[50%] font-bold text-white/90 text-[2.5px]">BEARD TRIM</span>
                                         <span className="font-bold font-mono text-[2.5px] text-white">$35</span>
                                      </div>
                                    </div>
                                  </div>
                                ) : temp.id === 't3' ? (
                                  <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#FAF8F4] text-[#1C1A17] text-[5px] select-none font-mono">
                                    <div className="flex justify-between items-center border-b border-[#D6CFC5] pb-0.5 bg-[#F3EFE7]/50">
                                      <span className="font-bold text-[4.5px] tracking-tight font-serif italic text-[#C4856A]">MAISON</span>
                                      <span className="text-[3.5px] bg-[#C4856A] text-white px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">BOOK</span>
                                    </div>
                                    <div className="text-center py-1 bg-white border border-[#E8E3DB] rounded-sm shadow-xs my-0.5">
                                      <h5 className="text-[5.5px] font-bold font-serif text-[#1C1A17] tracking-tight leading-tight italic">Maison</h5>
                                      <span className="text-[3px] text-[#A06850]">Organic Hair Care</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <div className="bg-white rounded-sm border border-[#F0EBE4] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-[0_1px_2px_rgba(28,26,23,0.03)] border-b pb-0.5">
                                        <span className="truncate text-[#4A4540] max-w-[50%] font-bold text-[4px]">BALAYAGE</span>
                                        <span className="text-[#C4856A] font-bold font-mono">$160</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto bg-[#1C1A17] text-white text-center py-0.5 rounded-sm">
                                       <span className="text-[3px] tracking-widest uppercase">CALL (310) 555-0193</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't4' ? (
                                  <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#FFFFFF] text-[#0A1628] text-[5px] select-none font-mono">
                                    <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-0.5 bg-white">
                                      <span className="font-bold text-[4.5px] tracking-tight text-[#0A1628]">CLARITY</span>
                                      <span className="text-[3.5px] bg-[#0EA5A0] text-white px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">BOOK</span>
                                    </div>
                                    <div className="text-center py-1 bg-[#F7F8FA] border border-[#DDE2EC] rounded-sm shadow-xs my-0.5">
                                      <h5 className="text-[5.5px] font-bold text-[#0A1628] tracking-tight leading-tight">Clarity Dental</h5>
                                      <span className="text-[3px] text-[#0EA5A0]">Clinical Luxury</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <div className="bg-white rounded-sm border border-[#E8ECF3] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                                        <span className="truncate text-[#344D6E] max-w-[50%] font-bold text-[4px]">TEETH CLEANING</span>
                                        <span className="text-[#0EA5A0] font-bold font-mono">$99</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto bg-[#0A1628] text-white text-center py-0.5 rounded-sm">
                                       <span className="text-[3px] tracking-widest uppercase">CALL (646) 555-0182</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't5' ? (
                                  <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#161614] text-[#F5F4F0] text-[5px] select-none font-sans">
                                    <div className="flex justify-between items-center border-b border-[#2A2A26] pb-0.5 bg-[#0C0C0B]">
                                      <span className="font-extrabold text-[4.5px] tracking-wider text-white">🏠 {meta.brandName || "Ironclad"}</span>
                                      <span className="text-[3.5px] bg-[#E8760A] text-black px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">CALL</span>
                                    </div>
                                    <div className="text-center py-1 bg-[#1E1E1B] border border-[#2A2A26] rounded-sm shadow-xs my-0.5">
                                      <h5 className="text-[5.5px] font-bold text-white tracking-tight leading-tight">{meta.brandName || "Ironclad"}</h5>
                                      <span className="text-[3px] text-[#E8760A]">GAF Master Elite</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <div className="bg-[#1E1E1B] rounded-sm border border-[#222220] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                                        <span className="truncate text-[#B8B5AC] max-w-[50%] font-bold text-[4px]">LEAK REPAIR</span>
                                        <span className="text-[#E8760A] font-bold font-mono">100% SECURE</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto bg-[#E8760A] text-black text-center py-0.5 rounded-sm">
                                       <span className="text-[3px] font-bold tracking-widest uppercase">CALL (512) 555-0199</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't6' ? (
                                  <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#0F172A] text-[#F1F5F9] text-[5px] select-none font-sans">
                                    <div className="flex justify-between items-center border-b border-[#334155] pb-0.5 bg-[#0F172A]">
                                      <span className="font-extrabold text-[4.5px] tracking-wider text-white">❄️🔥 {meta.brandName || "CLIMATE ECO"}</span>
                                      <span className="text-[3.5px] bg-[#22C55E] text-white px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">EST</span>
                                    </div>
                                    <div className="text-center py-1 bg-[#1E293B] border border-[#334155] rounded-sm shadow-xs my-0.5">
                                      <h5 className="text-[5.5px] font-bold text-white tracking-tight leading-tight">{meta.brandName || "Ventus"}</h5>
                                      <span className="text-[3px] text-[#F97316]">Certified Comfort 24/7</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <div className="bg-[#1E293B] rounded-sm border border-[#334155] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                                        <span className="truncate text-[#94A3B8] max-w-[50%] font-bold text-[4px]">HVAC SERVICE</span>
                                        <span className="text-[#22C55E] font-bold font-mono">100% OK</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto bg-[#F97316] text-[#0F172A] text-center py-0.5 rounded-sm">
                                       <span className="text-[3px] font-bold tracking-widest uppercase">CALL (404) 555-0118</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't7' ? (
                                  <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#111827] text-[#F3F4F6] text-[5px] select-none font-sans">
                                    <div className="flex justify-between items-center border-b border-[#374151] pb-0.5 bg-[#111827]">
                                      <span className="font-extrabold text-[4.5px] tracking-wider text-white">💪 {meta.brandName || "IRON PULSE"}</span>
                                      <span className="text-[3.5px] bg-[#EF4444] text-white px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">JOIN</span>
                                    </div>
                                    <div className="text-center py-1 bg-[#1F2937] border border-[#374151] rounded-sm shadow-xs my-0.5">
                                      <h5 className="text-[5.5px] font-bold text-white tracking-tight leading-tight">{meta.brandName || "PULSE"}</h5>
                                      <span className="text-[3px] text-[#F59E0B]">No Limits. Open 24/7.</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <div className="bg-[#1F2937] rounded-sm border border-[#374151] px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                                        <span className="truncate text-[#9CA3AF] max-w-[50%] font-bold text-[4px]">ELITE WORKOUT</span>
                                        <span className="text-[#EF4444] font-bold font-mono">100% RAW</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto bg-[#EF4444] text-white text-center py-0.5 rounded-sm">
                                       <span className="text-[3px] font-bold tracking-widest uppercase">CALL (305) 555-0145</span>
                                    </div>
                                  </div>
                                ) : temp.id === 't8' ? (
                                  <div className="h-full p-1.5 pt-3.5 flex flex-col gap-1 bg-[#111111] text-[#FAFAF8] text-[5px] select-none font-sans">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-0.5 bg-[#111111]">
                                      <span className="font-extrabold text-[4.5px] tracking-wider text-white">🏡 {meta.brandName || "AURA PROPS"}</span>
                                      <span className="text-[3.5px] bg-[#C9A86A] text-[#111111] px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider scale-90 leading-none">VAL</span>
                                    </div>
                                    <div className="text-center py-1 bg-[#1E1E1E] border border-white/5 rounded-sm shadow-xs my-0.5">
                                      <h5 className="text-[5.5px] font-bold text-[#C9A86A] tracking-tight leading-tight">{meta.brandName || "AURA"}</h5>
                                      <span className="text-[3px] text-white/60">Elite Luxury Brokerage</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <div className="bg-[#1E1E1E] rounded-sm border border-white/5 px-1 py-0.5 flex items-center justify-between scale-[0.95] shadow-2xs">
                                        <span className="truncate text-white/80 max-w-[50%] font-bold text-[4px]">VALUATION</span>
                                        <span className="text-[#C9A86A] font-bold font-mono">100% FREE</span>
                                      </div>
                                    </div>
                                    <div className="mt-auto bg-[#C9A86A] text-[#111111] text-center py-0.5 rounded-sm">
                                       <span className="text-[3px] font-bold tracking-widest uppercase">CALL (310) 555-0189</span>
                                    </div>
                                  </div>
                                ) : temp.niche === 'Barber' ? (
                                  <img src="/barber_mobile_preview.png" alt="Mobile UI Preview" className="w-full h-full object-cover object-top opacity-95" />
                                ) : (
                                  <div className="h-full p-1 flex flex-col gap-0.5 bg-gradient-to-b from-[#111110] to-[#050505] text-white text-[3.5px] leading-none">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-0.2">
                                      <span className="font-bold scale-90">{meta.logoEmoji}</span>
                                    </div>
                                    <div className="text-center bg-white/[0.02] rounded-3xs p-0.2 mt-0.5">
                                      <h5 className="font-serif truncate">{content.heroTitle}</h5>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Star rating badge instead of MOST POPULAR */}
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-ink/75 backdrop-blur-xs text-white text-[8px] uppercase font-bold tracking-wider rounded z-[4] shadow-md scale-90 border border-white/10 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-warning text-warning shrink-0" />
                              <span>{temp.rating}</span>
                            </div>

                            {/* Checkmark badge */}
                            {isSel && (
                              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center border-2 border-white shadow-md z-[4]">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </div>

                          {/* Info panel */}
                          <div className="p-4 flex-1 flex flex-col justify-between">
                            <div className="space-y-1 text-left">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-sm text-ink">{temp.name}</span>
                                <span className="px-1.5 py-0.5 bg-surface text-ink text-[9px] font-bold rounded uppercase">
                                  {temp.niche}
                                </span>
                              </div>
                              <p className="text-xs text-ink-secondary leading-relaxed line-clamp-2">{meta.desc}</p>
                            </div>

                            {/* Preview trigger */}
                            <div className="border-t border-border-light pt-3 mt-3 flex items-center gap-2">
                              {/* Selection overlay indicator */}
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playElegantBell();
                                  setSelectedTemplateId(temp.id);
                                }}
                                className={`flex-1 py-1.5 rounded text-xs font-semibold leading-none border transition-all cursor-pointer text-center ${
                                  isSel ? 'bg-accent-soft text-accent border-accent/20 font-bold' : 'bg-white border-border-main text-ink hover:bg-off-white'
                                }`}
                              >
                                {isSel ? '✓ Selected' : 'Choose Layout'}
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTemplateForPreview(temp);
                                }}
                                className="px-3 py-1.5 bg-surface hover:bg-border-light text-ink rounded text-xs font-semibold leading-none flex items-center gap-1 cursor-pointer border border-border-light"
                                title="Preview this layout live"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Preview</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 4: SMS Message */}
              {activeStep === 4 && (
                <div className="space-y-6 animate-fade-in text-sm text-ink">
                  <div className="space-y-1">
                    <h3 className="text-lg font-serif text-ink tracking-tight font-normal">SMS outreach message customization</h3>
                    <p className="text-xs text-ink-secondary">Define the message payload which will be dispatched with active preview hyperlinks.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Input message form */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <label className="font-semibold text-ink-secondary uppercase tracking-widest text-[10px]">SMS Text Composer</label>
                          <span className="text-ink-secondary font-mono">{smsText.length} characters</span>
                        </div>
                        <textarea
                          ref={textareaRef}
                          rows={7}
                          value={smsText}
                          onChange={(e) => setSmsText(e.target.value)}
                          className="w-full bg-white border border-border-main rounded-md p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent-soft leading-relaxed"
                        ></textarea>
                      </div>

                      {/* Clickable token chips */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-ink-secondary uppercase tracking-widest text-[9px] block">Personalization Variables (Click to Insert)</label>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {[
                            { name: '{{business_name}}', desc: "Full legal business name" },
                            { name: '{{city}}', desc: "Located city" },
                            { name: '{{site_url}}', desc: "Generated custom website URL" }
                          ].map((token) => (
                            <button
                              key={token.name}
                              onClick={() => insertToken(token.name)}
                              title={token.desc}
                              className="px-2.5 py-1 text-xs bg-off-white border border-border-main hover:bg-accent-soft hover:text-accent hover:border-accent/40 rounded transition-colors text-ink uppercase tracking-tight font-mono inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 shrink-0" />
                              <span>{token.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* CSS iPhone Preview Mockup */}
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-[230px] border-[6px] border-ink bg-[#f5f5f3] rounded-[36px] overflow-hidden shadow-md flex flex-col justify-between shrink-0 h-[340px]">
                        {/* Speaker notch */}
                        <div className="h-4 bg-ink w-24 mx-auto rounded-b-md flex items-center justify-center shrink-0">
                          <div className="w-6 h-1 bg-neutral-600 rounded-full"></div>
                        </div>
                        {/* Messages Thread container */}
                        <div className="flex-1 p-3 overflow-y-auto space-y-2 flex flex-col justify-end">
                          <span className="text-[9px] uppercase font-mono text-ink-secondary text-center tracking-widest block mb-2">Today 10:50 AM</span>
                          
                          {/* Outgoing Blue iMessage bubble */}
                          <div className="self-end max-w-[85%] bg-accent text-white px-2.5 py-2.5 rounded-t-xl rounded-bl-xl rounded-br-sm text-[10px] shadow-xs leading-relaxed space-y-1">
                            <p className="whitespace-pre-line">
                              {smsText
                                .replace(/\{\{business_name\}\}/g, 'The Fade Room')
                                .replace(/\{\{city\}\}/g, 'Austin, TX')}
                            </p>
                          </div>
                          
                          <span className="text-[8px] text-ink-secondary self-end mr-1">Delivered</span>
                        </div>
                        {/* Bottom bar */}
                        <div className="p-2 border-t border-border-light bg-white h-8 flex items-center justify-center shrink-0">
                          <div className="w-16 h-1.5 bg-neutral-300 rounded-full"></div>
                        </div>
                      </div>
                      <span className="text-[10px] text-ink-secondary mt-2">Live Simulated Handset Preview</span>
                    </div>

                  </div>
                </div>
              )}

              {/* STEP 5: Launch */}
              {activeStep === 5 && (
                <div className="space-y-6 animate-fade-in text-sm text-ink max-w-xl mx-auto text-center py-6">
                  <div className="w-12 h-12 bg-accent-soft text-accent rounded-full flex items-center justify-center mx-auto border border-accent/20">
                    <Send className="w-5 h-5 ml-0.5" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-2xl font-serif text-ink tracking-tight font-normal">Ready to launch</h3>
                    <p className="text-xs text-ink-secondary leading-relaxed">
                      This action will automatically write search optimized HTML frameworks, bind public Lunao preview URLs, and send the personalized texts instantly immediately.
                    </p>
                  </div>

                  {/* Configured details recap — all real, no mock data */}
                  {(() => {
                    const selectedTpl = templates.find((t) => t.id === selectedTemplateId);
                    const cities = Array.from(
                      new Set(csvLeads.map((l) => (l.city || '').trim()).filter(Boolean)),
                    );
                    const cityLabel =
                      cities.length === 0
                        ? '—'
                        : cities.length === 1
                          ? cities[0]
                          : `${cities[0]} +${cities.length - 1} more`;
                    return (
                      <div className="border border-border-main rounded-lg text-left divide-y divide-border-light overflow-hidden bg-off-white/50">
                        <div className="p-4 flex justify-between items-center gap-3">
                          <span className="text-xs text-ink-secondary font-medium shrink-0">Outreach Target Niche:</span>
                          <span className="text-xs font-semibold uppercase text-right">{selectedNiche}</span>
                        </div>
                        <div className="p-4 flex justify-between items-center gap-3">
                          <span className="text-xs text-ink-secondary font-medium shrink-0">Business Targets:</span>
                          <span className="text-xs font-semibold text-right">
                            {csvParsedCount} validated lead{csvParsedCount === 1 ? '' : 's'} · {cityLabel}
                          </span>
                        </div>
                        <div className="p-4 flex justify-between items-center gap-3">
                          <span className="text-xs text-ink-secondary font-medium shrink-0">Aesthetic Core Selected:</span>
                          <span className="text-xs text-accent font-semibold flex items-center gap-1 text-right">
                            🎨 {selectedTpl ? selectedTpl.name : 'Default Template'}
                          </span>
                        </div>
                        <div className="p-4 flex justify-between items-center gap-3">
                          <span className="text-xs text-ink-secondary font-medium shrink-0">Estimated Completion:</span>
                          <span className="text-xs font-semibold text-success font-mono text-right">
                            {estimateSendingTime(csvParsedCount)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Name field */}
                  <div className="text-left space-y-1.5 max-w-sm mx-auto">
                    <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest">Outreach Campaign Label</label>
                    <input 
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      className="w-full bg-white border border-border-main rounded px-3 py-2 text-xs focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="pt-2 flex flex-col items-center gap-3">
                    <button
                      onClick={() => runRealCsvPipeline()}
                      className="w-full md:w-auto px-8 py-3 bg-accent hover:bg-accent-hover active:scale-95 text-white text-xs font-bold rounded-lg tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2.5 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5 text-white" />
                      <span>Launch Campaign & Deploy Sites</span>
                    </button>
                    {launchError && (
                      <p className="text-[11px] text-danger font-medium max-w-md text-center">{launchError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* NAV BUTTONS */}
              <div id="wizard-navigation-bar" className="mt-8 pt-6 border-t border-border-light flex items-center justify-between">
                <button
                  disabled={activeStep === 1}
                  onClick={() => {
                    playGentleChime(activeStep - 1);
                    setActiveStep(prev => prev - 1);
                  }}
                  className={`text-xs font-semibold px-4 py-2 border border-border-main rounded shadow-xs bg-white text-ink leading-none ${
                    activeStep === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-off-white'
                  }`}
                >
                  Back Step
                </button>
                
                {activeStep < 5 ? (
                  <button
                    onClick={() => {
                      if (activeStep === 2 && inputMethod === 'find' && isUpgraded && (!telnyxKey || !telnyxPhone)) {
                        playElegantError();
                        alert('Required: Please configure your Telnyx API Key and Sender Phone Number via the Settings tab to proceed globally on this tier.');
                        return;
                      }
                      if (activeStep === 2 && inputMethod === 'find' && selectedLeadIds.length === 0) {
                        setMissingSelectionError(true);
                        setErrorShakes(prev => prev + 1);
                        playElegantError();
                        setTimeout(() => {
                          const errCard = document.getElementById('missing-selection-error-card');
                          if (errCard) {
                            errCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }, 50);
                        return;
                      }
                      if (activeStep === 2 && inputMethod === 'csv' && (!csvValidation?.ok || csvParsedCount === 0)) {
                        // Block: no valid CSV uploaded yet.
                        if (!csvFileName) {
                          setMissingSelectionError(true);
                        }
                        setErrorShakes(prev => prev + 1);
                        playElegantError();
                        setTimeout(() => {
                          const errCard =
                            document.getElementById('csv-validation-report') ||
                            document.getElementById('missing-selection-error-card');
                          if (errCard) {
                            errCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }, 50);
                        return;
                      }
                      if (activeStep === 2 && targetSmsCount > userQuotaLeft) {
                        setQuotaError(true);
                        setErrorShakes(prev => prev + 1);
                        playElegantError();
                        setTimeout(() => {
                          const errCard = document.getElementById('quota-limits-error-card');
                          if (errCard) {
                            errCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }, 50);
                        return;
                      }
                      setQuotaError(false);
                      playGentleChime(activeStep + 1);
                      setActiveStep(prev => prev + 1);
                    }}
                    className="text-xs font-semibold px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Next Step</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

        {/* RECENT CAMPAIGNS FULL LOG TABLE - Always visible at bottom of page */}
        <section id="campaigns-full-repository-card" className="bg-white border border-border-main rounded-xl shadow-sm p-6 space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-xl font-serif text-ink tracking-tight font-normal">Campaign Repositories</h2>
              <p className="text-xs text-ink-secondary">Audit and monitor all historical SMS campaigns deployed previously.</p>
            </div>
            
            {/* Filtering tabs */}
            <div className="flex bg-off-white border border-border-light p-1 rounded-md shrink-0 hide-scrollbar overflow-x-auto max-w-full">
              {['All', 'Active', 'Completed', 'Queued', 'Crashed'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab as any)}
                  className={`px-3 py-1 text-xs font-semibold rounded ${
                    filterTab === tab
                      ? 'bg-white shadow-xs text-ink'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign History Log Table */}
          <div className="border border-border-light rounded-lg overflow-x-auto text-sm" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="bg-off-white border-b border-border-light text-[10px] font-semibold text-ink-secondary uppercase tracking-wider">
                  <th className="py-3 px-4">Campaign Title</th>
                  <th className="py-3 px-4">Niche Focus</th>
                  <th className="py-3 px-3 text-center">🔍 Leads Found</th>
                  <th className="py-3 px-3 text-center">🌐 Sites Deployed</th>
                  <th className="py-3 px-3 text-center">✉️ SMS Sent</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light text-ink">
                {filteredCampaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-off-white/30">
                    <td className="py-3 px-4 font-semibold">{camp.name}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-1.5 py-0.5 rounded bg-surface text-ink text-xs font-medium">{camp.niche}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-xs">{camp.leadsFound || Math.floor(camp.sites * 1.2)}</td>
                    <td className="py-3 px-3 text-center font-mono text-xs">{camp.sites}</td>
                    <td className="py-3 px-3 text-center font-mono text-xs">{camp.smsSent}</td>
                    <td className="py-3 px-4 text-center">
                      {isWaitingForLast(camp.id) ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/15" title="Waiting for prior campaign to finish outreach">
                          Queued
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span 
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(camp.status)}`}
                          >
                            {camp.status}
                          </span>
                          {camp.status === 'Crashed' && camp.errorReason && (
                            <span className="text-[9px] text-danger font-medium leading-tight max-w-[150px] truncate" title={camp.errorReason}>
                              {camp.errorReason}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-ink-secondary font-mono">{camp.createdAt}</td>
                  </tr>
                ))}
                {filteredCampaigns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-ink-secondary">
                      No campaigns classified under this tab status.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      {/* TEMPLATE DETAIL PREVIEW MODAL */}
      {selectedTemplateForPreview && (() => {
        return (
          <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4 backdrop-blur-xs animate-fade-in text-left">
            <div className="bg-white border border-border-main rounded-xl max-w-4xl w-full flex flex-col overflow-hidden max-h-[90vh] shadow-xl">
              
              {/* Modal header */}
              <div className="p-5 border-b border-border-light bg-off-white flex items-center justify-between shrink-0">
                <div className="space-y-0.5 max-w-[60%]">
                  <h3 className="text-xl font-serif text-ink tracking-tight font-normal truncate">{selectedTemplateForPreview.name} Live Framework</h3>
                  <p className="text-xs text-ink-secondary uppercase tracking-wider font-semibold font-sans truncate">Industry Target: {selectedTemplateForPreview.niche} • Real-Time Native</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* DEVICE SWITCHER BUTTONS */}
                  <div className="hidden sm:flex bg-surface rounded-md p-1 border border-border-light text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`px-3 py-1.5 rounded transition-all cursor-pointer ${previewDevice === 'desktop' ? 'bg-white shadow-2xs text-accent font-bold' : 'text-ink-secondary hover:text-ink'}`}
                    >
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`px-3 py-1.5 rounded transition-all cursor-pointer ${previewDevice === 'mobile' ? 'bg-white shadow-2xs text-accent font-bold' : 'text-ink-secondary hover:text-ink'}`}
                    >
                      Mobile
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTemplateForPreview(null)}
                    className="p-1 rounded-md hover:bg-border-light text-ink-secondary hover:text-ink transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal content */}
              <div className="flex-1 bg-surface/30 p-3 md:p-6 flex justify-center items-center overflow-hidden min-h-[300px] h-[440px] md:h-[500px] max-h-[55vh]">
                <div
                  className="transition-all duration-300 border border-border-main rounded-lg overflow-hidden bg-white shadow-lg relative flex flex-col w-full h-full"
                  style={{
                    width: previewDevice === 'mobile' ? '375px' : '100%',
                    maxWidth: '100%',
                  }}
                >
                  <iframe
                    src={selectedTemplateForPreview.id === 't2' ? "/barber-template-02.html" : selectedTemplateForPreview.id === 't3' ? "/salon-template-01.html" : selectedTemplateForPreview.id === 't4' ? "/dentist-template-01.html" : selectedTemplateForPreview.id === 't5' ? "/roofing-template-01.html" : selectedTemplateForPreview.id === 't6' ? "/hvac-template-01.html" : selectedTemplateForPreview.id === 't7' ? "/gym-template-01.html" : selectedTemplateForPreview.id === 't8' ? "/realestate-template-01.html" : "/barber-template.html"}
                    className="w-full h-full border-0 flex-1"
                    title="Live Template Preview"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Modal footer CTAs */}
              <div className="p-5 border-t border-border-light bg-off-white flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(selectedTemplateForPreview.id);
                      setSelectedTemplateForPreview(null);
                    }}
                    className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white font-semibold text-xs uppercase tracking-wider rounded shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Choose This Layout</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.open(selectedTemplateForPreview.id === 't2' ? '/barber-template-02.html' : selectedTemplateForPreview.id === 't3' ? '/salon-template-01.html' : selectedTemplateForPreview.id === 't4' ? '/dentist-template-01.html' : selectedTemplateForPreview.id === 't5' ? '/roofing-template-01.html' : selectedTemplateForPreview.id === 't6' ? '/hvac-template-01.html' : selectedTemplateForPreview.id === 't7' ? '/gym-template-01.html' : selectedTemplateForPreview.id === 't8' ? '/realestate-template-01.html' : '/barber-template.html', '_blank');
                    }}
                    className="flex px-4 py-2.5 border border-border-main text-ink text-xs font-semibold bg-white uppercase tracking-wider rounded hover:bg-off-white transition-all shadow-2xs cursor-pointer items-center gap-1.5"
                  >
                    <span className="hidden sm:inline">Preview Full Page</span>
                    <span className="sm:hidden">Full Page</span>
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedTemplateForPreview(null)}
                  className="px-4 py-2 border border-border-main font-semibold text-xs text-ink bg-white uppercase tracking-wider rounded hover:bg-off-white transition-all shadow-2xs cursor-pointer"
                >
                  Close Preview
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
