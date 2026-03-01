'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  CalendarDays,
  Check,
  Star,
  Loader2,
  Download,
  RefreshCw,
  Search,
  Mail,
  Phone,
  FileText,
  AlertCircle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface WidgetConfig {
  tenantName: string;
  logoUrl?: string;
  themeColor?: string;
  welcomeMessage?: string;
  cancellationPolicy?: string;
  depositPolicy?: string;
  onlineBookingEnabled: boolean;
}

interface ServiceCategory {
  id: string;
  name: string;
  sortOrder: number;
  services: ServiceItem[];
}

interface ServiceItem {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceCents: number;
  imageUrl?: string;
  addons: AddonItem[];
}

interface AddonItem {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
}

interface ProviderInfo {
  id: string;
  displayName: string;
  bio?: string;
  photoUrl?: string;
  specialties?: string[];
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  providerId: string;
  providerName: string;
}

interface BookingResult {
  appointmentId: string;
  confirmationNumber: string;
  startTime: string;
  endTime: string;
  providerName: string;
  serviceName: string;
  depositAmountCents: number;
  managementToken: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDate(dateStr: string): string {
  const [year = 0, month = 0, day = 0] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function generateIcs(appointment: BookingResult): string {
  const start = new Date(appointment.startTime).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const end = new Date(appointment.endTime).toISOString().replace(/[-:]/g, '').replace('.000', '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OppsEra//Spa Booking//EN',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${appointment.serviceName}`,
    `DESCRIPTION:Provider: ${appointment.providerName}\\nConfirmation: ${appointment.confirmationNumber}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs(appointment: BookingResult) {
  const ics = generateIcs(appointment);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `appointment-${appointment.confirmationNumber}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getNext30Days(): string[] {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

function getDayLabel(dateStr: string): string {
  const [year = 0, month = 0, day = 0] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupSlots(slots: TimeSlot[]): { morning: TimeSlot[]; afternoon: TimeSlot[]; evening: TimeSlot[] } {
  const morning: TimeSlot[] = [];
  const afternoon: TimeSlot[] = [];
  const evening: TimeSlot[] = [];
  for (const slot of slots) {
    const hour = new Date(slot.startTime).getHours();
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return { morning, afternoon, evening };
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Step Progress Indicator ────────────────────────────────────────

const STEP_LABELS = ['Service', 'Provider', 'Date & Time', 'Details', 'Review', 'Confirmed'];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-1 px-4 py-3">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-0.5 w-4 sm:w-6 ${
                  isComplete ? 'bg-indigo-500' : 'bg-gray-200'
                }`}
              />
            )}
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                isComplete
                  ? 'bg-indigo-500 text-white'
                  : isActive
                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-200'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {isComplete ? <Check className="h-3 w-3" /> : stepNum}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Skeleton Loaders ───────────────────────────────────────────────

function ServiceSkeleton() {
  return (
    <div className="space-y-3 px-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-gray-100 p-4">
          <div className="h-4 w-2/3 rounded bg-gray-100 mb-2" />
          <div className="h-3 w-1/2 rounded bg-gray-50" />
        </div>
      ))}
    </div>
  );
}

function SlotSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 px-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="animate-pulse h-10 w-24 rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function BookingContent() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;

  // ── Wizard State ──────────────────────────────────────
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null); // null = "any"
  const [selectedDate, setSelectedDate] = useState(''); // YYYY-MM-DD
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [customerInfo, setCustomerInfo] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    notes: '',
  });
  const [booking, setBooking] = useState<BookingResult | null>(null);

  // ── Data State ────────────────────────────────────────
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');

  // ── UI State ──────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  const baseUrl = `/api/v1/spa/public/${tenantSlug}`;

  // ── Fetch Config on Mount ─────────────────────────────
  useEffect(() => {
    if (!tenantSlug) return;
    setIsLoading(true);
    fetch(`${baseUrl}/config`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((json) => {
        setConfig(json.data as WidgetConfig);
      })
      .catch(() => {
        setError('Unable to load booking information. Please check the link and try again.');
      })
      .finally(() => setIsLoading(false));
  }, [tenantSlug, baseUrl]);

  // ── Fetch Services when step 1 ────────────────────────
  useEffect(() => {
    if (step !== 1 || !config) return;
    setIsLoading(true);
    fetch(`${baseUrl}/menu`)
      .then((res) => res.json())
      .then((json) => {
        const cats = (json.data as ServiceCategory[]) ?? [];
        setCategories(cats);
        if (cats.length > 0 && !activeCategoryId) {
          setActiveCategoryId(cats[0]!.id);
        }
      })
      .catch(() => setError('Unable to load services.'))
      .finally(() => setIsLoading(false));
  }, [step, config, baseUrl, activeCategoryId]);

  // ── Fetch Providers when step 2 ───────────────────────
  useEffect(() => {
    if (step !== 2 || !selectedService) return;
    setIsLoading(true);
    setError(null);
    fetch(`${baseUrl}/providers?serviceId=${selectedService.id}`)
      .then((res) => res.json())
      .then((json) => {
        setProviders((json.data as ProviderInfo[]) ?? []);
      })
      .catch(() => setError('Unable to load providers.'))
      .finally(() => setIsLoading(false));
  }, [step, selectedService, baseUrl]);

  // ── Fetch Slots when step 3 + date selected ──────────
  useEffect(() => {
    if (step !== 3 || !selectedService || !selectedDate) return;
    setIsLoading(true);
    setError(null);
    const providerParam = selectedProvider ? `&providerId=${selectedProvider}` : '';
    fetch(`${baseUrl}/availability?serviceId=${selectedService.id}&date=${selectedDate}${providerParam}`)
      .then((res) => res.json())
      .then((json) => {
        setSlots((json.data as TimeSlot[]) ?? []);
      })
      .catch(() => setError('Unable to load available times.'))
      .finally(() => setIsLoading(false));
  }, [step, selectedService, selectedDate, selectedProvider, baseUrl]);

  // ── Available dates ───────────────────────────────────
  const dates = useMemo(() => getNext30Days(), []);

  // ── Grouped slots ─────────────────────────────────────
  const grouped = useMemo(() => groupSlots(slots), [slots]);

  // ── Computed totals ───────────────────────────────────
  const totalPriceCents = useMemo(() => {
    if (!selectedService) return 0;
    let total = selectedService.priceCents;
    for (const addonId of selectedAddons) {
      const addon = selectedService.addons.find((a) => a.id === addonId);
      if (addon) total += addon.priceCents;
    }
    return total;
  }, [selectedService, selectedAddons]);

  const totalDuration = useMemo(() => {
    if (!selectedService) return 0;
    let dur = selectedService.durationMinutes;
    for (const addonId of selectedAddons) {
      const addon = selectedService.addons.find((a) => a.id === addonId);
      if (addon) dur += addon.durationMinutes;
    }
    return dur;
  }, [selectedService, selectedAddons]);

  // ── Filtered services ─────────────────────────────────
  const filteredCategories = useMemo(() => {
    if (!serviceSearch.trim()) return categories;
    const q = serviceSearch.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        services: cat.services.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.description && s.description.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.services.length > 0);
  }, [categories, serviceSearch]);

  // ── Email Lookup ──────────────────────────────────────
  const handleEmailLookup = useCallback(async () => {
    const email = customerInfo.email.trim();
    if (!email || lookupDone) return;
    try {
      const res = await fetch(`${baseUrl}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setCustomerInfo((prev) => ({
            ...prev,
            firstName: json.data.firstName ?? prev.firstName,
            lastName: json.data.lastName ?? prev.lastName,
            phone: json.data.phone ?? prev.phone,
          }));
        }
      }
    } catch {
      // Lookup is best-effort
    } finally {
      setLookupDone(true);
    }
  }, [customerInfo.email, lookupDone, baseUrl]);

  // ── Submit Booking ────────────────────────────────────
  const handleBook = useCallback(async () => {
    if (!selectedService || !selectedSlot) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: selectedService.id,
          addonIds: selectedAddons,
          providerId: selectedProvider,
          startTime: selectedSlot.startTime,
          email: customerInfo.email.trim(),
          firstName: customerInfo.firstName.trim(),
          lastName: customerInfo.lastName.trim(),
          phone: customerInfo.phone.trim() || undefined,
          notes: customerInfo.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? 'Booking failed. Please try again.');
        return;
      }
      const json = await res.json();
      setBooking(json.data as BookingResult);
      setStep(6);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedService, selectedSlot, selectedAddons, selectedProvider, customerInfo, baseUrl]);

  // ── Reset Wizard ──────────────────────────────────────
  const handleReset = useCallback(() => {
    setStep(1);
    setSelectedService(null);
    setSelectedAddons([]);
    setSelectedProvider(null);
    setSelectedDate('');
    setSelectedSlot(null);
    setCustomerInfo({ email: '', firstName: '', lastName: '', phone: '', notes: '' });
    setBooking(null);
    setError(null);
    setTermsAccepted(false);
    setLookupDone(false);
    setSlots([]);
    setProviders([]);
  }, []);

  // ── Navigation ────────────────────────────────────────
  const goBack = useCallback(() => {
    setError(null);
    if (step === 3) {
      setSelectedSlot(null);
      setSelectedDate('');
      setSlots([]);
    }
    setStep((s) => Math.max(1, s - 1));
  }, [step]);

  // ── Initial Loading / Error ───────────────────────────
  if (isLoading && !config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-3 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading booking...</p>
        </div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Booking Unavailable</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (config && !config.onlineBookingEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <CalendarDays className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Online Booking Unavailable</h1>
          <p className="text-sm text-gray-500">
            Online booking is not currently available. Please call us to schedule your appointment.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="text-center pt-6 px-6 pb-2">
        {config?.logoUrl ? (
          <img
            src={config.logoUrl}
            alt={config.tenantName}
            className="h-10 mx-auto mb-2 object-contain"
          />
        ) : (
          <h1 className="text-lg font-bold text-gray-900">{config?.tenantName}</h1>
        )}
        {step === 1 && config?.welcomeMessage && (
          <p className="text-sm text-gray-500 mt-1">{config.welcomeMessage}</p>
        )}
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Error Banner */}
      {error && step < 6 && (
        <div className="mx-4 mb-3 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Step 1: Service Selection ────────────────────── */}
        {step === 1 && (
          <div className="pb-6">
            {/* Search */}
            <div className="px-4 mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Search services..."
                  className="w-full rounded-lg border border-gray-200 pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                />
              </div>
            </div>

            {/* Category Tabs */}
            {categories.length > 1 && (
              <div className="flex gap-1 overflow-x-auto px-4 mb-4 scrollbar-hide">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategoryId(cat.id);
                      setServiceSearch('');
                    }}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      activeCategoryId === cat.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Service Cards */}
            {isLoading ? (
              <ServiceSkeleton />
            ) : (
              <div className="px-4 space-y-3">
                {(serviceSearch
                  ? filteredCategories.flatMap((c) => c.services)
                  : (categories.find((c) => c.id === activeCategoryId)?.services ?? [])
                ).map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => {
                      setSelectedService(service);
                      setSelectedAddons([]);
                      setError(null);
                      setStep(2);
                    }}
                    className="w-full text-left rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">{service.name}</h3>
                        {service.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{service.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            {service.durationMinutes} min
                          </span>
                        </div>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        <span className="text-sm font-bold text-gray-900">
                          {formatMoney(service.priceCents)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-400 ml-auto mt-1" />
                      </div>
                    </div>

                    {/* Addons Preview */}
                    {service.addons.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                          Add-ons available
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {service.addons.slice(0, 3).map((addon) => (
                            <span
                              key={addon.id}
                              className="text-[10px] bg-gray-50 text-gray-500 rounded px-1.5 py-0.5"
                            >
                              {addon.name}
                            </span>
                          ))}
                          {service.addons.length > 3 && (
                            <span className="text-[10px] text-gray-400">
                              +{service.addons.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                ))}

                {!isLoading && filteredCategories.flatMap((c) => c.services).length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-400">No services found.</p>
                  </div>
                )}
              </div>
            )}

            {/* Addon Selection (if service selected and has addons, show below) */}
            {selectedService && selectedService.addons.length > 0 && step === 1 && (
              <div className="px-4 mt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Enhance Your Experience
                </h3>
                <div className="space-y-2">
                  {selectedService.addons.map((addon) => {
                    const isSelected = selectedAddons.includes(addon.id);
                    return (
                      <label
                        key={addon.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-indigo-300 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedAddons((prev) =>
                              isSelected ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                            );
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900">{addon.name}</span>
                          <span className="text-xs text-gray-500 ml-1">+{addon.durationMinutes} min</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">
                          +{formatMoney(addon.priceCents)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Provider Selection ───────────────────── */}
        {step === 2 && (
          <div className="px-4 pb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Choose Your Provider
            </h2>

            {isLoading ? (
              <ServiceSkeleton />
            ) : (
              <div className="space-y-3">
                {/* Any Available */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProvider(null);
                    setError(null);
                    setStep(3);
                  }}
                  className={`w-full text-left rounded-lg border-2 p-4 transition-all active:scale-[0.99] ${
                    selectedProvider === null
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                      <Star className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Any Available Provider</h3>
                      <p className="text-xs text-gray-500">Recommended - first available</p>
                    </div>
                  </div>
                </button>

                {/* Individual Providers */}
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      setError(null);
                      setStep(3);
                    }}
                    className="w-full text-left rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      {provider.photoUrl ? (
                        <img
                          src={provider.photoUrl}
                          alt={provider.displayName}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                          {getInitials(provider.displayName)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">{provider.displayName}</h3>
                        {provider.bio && (
                          <p className="text-xs text-gray-500 line-clamp-1">{provider.bio}</p>
                        )}
                        {provider.specialties && provider.specialties.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {provider.specialties.slice(0, 3).map((spec) => (
                              <span
                                key={spec}
                                className="text-[10px] bg-gray-50 text-gray-500 rounded px-1.5 py-0.5"
                              >
                                {spec}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </div>
                  </button>
                ))}

                {!isLoading && providers.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-400">
                      No providers available for this service. Please select "Any Available."
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Date & Time Selection ────────────────── */}
        {step === 3 && (
          <div className="pb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 px-4">
              Select a Date
            </h2>

            {/* Date Scroller */}
            <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
              {dates.map((d) => {
                const isSelected = selectedDate === d;
                const [, m = '', dd = ''] = d.split('-');
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSelectedDate(d);
                      setSelectedSlot(null);
                      setError(null);
                    }}
                    className={`shrink-0 flex flex-col items-center rounded-lg px-3 py-2 text-center transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-semibold">
                      {getDayLabel(d).split(' ')[0]}
                    </span>
                    <span className="text-lg font-bold leading-tight">{dd}</span>
                    <span className="text-[10px]">
                      {new Date(Number(d.split('-')[0]), Number(m) - 1).toLocaleDateString('en-US', {
                        month: 'short',
                      })}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Time Slots */}
            {selectedDate && (
              <div className="px-4 mt-2">
                {isLoading ? (
                  <SlotSkeleton />
                ) : slots.length === 0 ? (
                  <div className="text-center py-8">
                    <CalendarDays className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No available times on this date.</p>
                    <p className="text-xs text-gray-400 mt-1">Please try another date.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {grouped.morning.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Morning
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {grouped.morning.map((slot) => (
                            <SlotButton
                              key={slot.startTime}
                              slot={slot}
                              isSelected={selectedSlot?.startTime === slot.startTime}
                              onSelect={() => {
                                setSelectedSlot(slot);
                                setError(null);
                                setStep(4);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {grouped.afternoon.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Afternoon
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {grouped.afternoon.map((slot) => (
                            <SlotButton
                              key={slot.startTime}
                              slot={slot}
                              isSelected={selectedSlot?.startTime === slot.startTime}
                              onSelect={() => {
                                setSelectedSlot(slot);
                                setError(null);
                                setStep(4);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {grouped.evening.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Evening
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {grouped.evening.map((slot) => (
                            <SlotButton
                              key={slot.startTime}
                              slot={slot}
                              isSelected={selectedSlot?.startTime === slot.startTime}
                              onSelect={() => {
                                setSelectedSlot(slot);
                                setError(null);
                                setStep(4);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Your Details ─────────────────────────── */}
        {step === 4 && (
          <div className="px-4 pb-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Your Details
            </h2>

            {/* Email */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email
              </label>
              <input
                type="email"
                value={customerInfo.email}
                onChange={(e) => {
                  setCustomerInfo((prev) => ({ ...prev, email: e.target.value }));
                  setLookupDone(false);
                }}
                onBlur={handleEmailLookup}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>

            {/* First Name */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                <User className="h-3.5 w-3.5" />
                First Name
              </label>
              <input
                type="text"
                value={customerInfo.firstName}
                onChange={(e) => setCustomerInfo((prev) => ({ ...prev, firstName: e.target.value }))}
                placeholder="First name"
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>

            {/* Last Name */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                Last Name
              </label>
              <input
                type="text"
                value={customerInfo.lastName}
                onChange={(e) => setCustomerInfo((prev) => ({ ...prev, lastName: e.target.value }))}
                placeholder="Last name"
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                <Phone className="h-3.5 w-3.5" />
                Phone <span className="normal-case text-gray-400">(optional)</span>
              </label>
              <input
                type="tel"
                value={customerInfo.phone}
                onChange={(e) => setCustomerInfo((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="(555) 123-4567"
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                <FileText className="h-3.5 w-3.5" />
                Notes <span className="normal-case text-gray-400">(optional)</span>
              </label>
              <textarea
                value={customerInfo.notes}
                onChange={(e) => setCustomerInfo((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Any special requests or notes..."
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none"
              />
            </div>

            {/* Continue Button */}
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (!customerInfo.email.trim()) {
                  setError('Please enter your email address.');
                  return;
                }
                if (!customerInfo.firstName.trim()) {
                  setError('Please enter your first name.');
                  return;
                }
                if (!customerInfo.lastName.trim()) {
                  setError('Please enter your last name.');
                  return;
                }
                setStep(5);
              }}
              className="w-full rounded-lg py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors active:scale-[0.98]"
            >
              Continue to Review
            </button>
          </div>
        )}

        {/* ── Step 5: Review & Confirm ─────────────────────── */}
        {step === 5 && selectedService && selectedSlot && (
          <div className="px-4 pb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Review Your Booking
            </h2>

            {/* Summary Card */}
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              <div className="p-4">
                <h3 className="text-base font-bold text-gray-900">{selectedService.name}</h3>
                {selectedAddons.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {selectedAddons.map((addonId) => {
                      const addon = selectedService.addons.find((a) => a.id === addonId);
                      return addon ? (
                        <p key={addonId} className="text-xs text-gray-500">
                          + {addon.name} ({formatMoney(addon.priceCents)})
                        </p>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 flex items-center gap-3">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {selectedProvider
                    ? providers.find((p) => p.id === selectedProvider)?.displayName ?? 'Selected Provider'
                    : 'Any Available Provider'}
                </span>
              </div>

              <div className="px-4 py-3 flex items-center gap-3">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {formatDate(selectedDate)}
                </span>
              </div>

              <div className="px-4 py-3 flex items-center gap-3">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
                  <span className="text-gray-400 ml-1">({totalDuration} min)</span>
                </span>
              </div>

              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-lg font-bold text-gray-900">{formatMoney(totalPriceCents)}</span>
              </div>
            </div>

            {/* Deposit Notice */}
            {config?.depositPolicy && (
              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs text-amber-700">{config.depositPolicy}</p>
              </div>
            )}

            {/* Cancellation Policy */}
            {config?.cancellationPolicy && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">{config.cancellationPolicy}</p>
              </div>
            )}

            {/* Terms */}
            <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-gray-500 leading-relaxed">
                I agree to the cancellation policy and authorize any required deposit charge.
              </span>
            </label>

            {/* Book Button */}
            <button
              type="button"
              onClick={handleBook}
              disabled={!termsAccepted || isSubmitting}
              className="w-full mt-4 rounded-lg py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: termsAccepted ? 'linear-gradient(135deg, #4f46e5, #6366f1)' : undefined, backgroundColor: termsAccepted ? undefined : '#9ca3af' }}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Booking...
                </span>
              ) : (
                'Book Now'
              )}
            </button>
          </div>
        )}

        {/* ── Step 6: Confirmation ─────────────────────────── */}
        {step === 6 && booking && (
          <div className="px-4 pb-8">
            {/* Success Icon */}
            <div className="text-center mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto mb-3">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Booking Confirmed!</h2>
              <p className="text-sm text-gray-500 mt-1">
                Confirmation #{booking.confirmationNumber}
              </p>
            </div>

            {/* Details Card */}
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              <div className="p-4">
                <h3 className="text-base font-bold text-gray-900">{booking.serviceName}</h3>
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">{booking.providerName}</span>
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {new Date(booking.startTime).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                </span>
              </div>
              {booking.depositAmountCents > 0 && (
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Deposit Charged</span>
                  <span className="text-sm font-semibold text-gray-700">
                    {formatMoney(booking.depositAmountCents)}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => downloadIcs(booking)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Add to Calendar
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Book Another Appointment
              </button>
            </div>

            {/* Manage Link */}
            {booking.managementToken && (
              <p className="text-center text-xs text-gray-400 mt-4">
                A confirmation email has been sent. You can manage your appointment from that email.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Back Button (fixed at bottom for steps 2-5) */}
      {step >= 2 && step <= 5 && (
        <div className="shrink-0 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="shrink-0 text-center pb-4 pt-2">
        <p className="text-[10px] text-gray-400">Powered by OppsEra</p>
      </div>
    </div>
  );
}

// ── Slot Button Sub-Component ──────────────────────────────────────

function SlotButton({
  slot,
  isSelected,
  onSelect,
}: {
  slot: TimeSlot;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.97] ${
        isSelected
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
      }`}
    >
      {formatTime(slot.startTime)}
    </button>
  );
}
