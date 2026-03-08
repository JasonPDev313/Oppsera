'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  X,
  Clock,
  Check,
  Loader2,
  Search,
  User,
  UserCheck,
  Users,
  Calendar,
} from 'lucide-react';
import {
  useSpaServices,
  useSpaProviders,
  useSpaAvailableSlots,
  useCreateAppointment,
} from '@/hooks/use-spa';
import type { SpaService, AvailableSlot } from '@/hooks/use-spa';
import { useQueryClient } from '@tanstack/react-query';

// ── Helpers ──────────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatSlotTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatDisplayDate(dateStr: string): string {
  const [year = 0, month = 0, day = 0] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Props ────────────────────────────────────────────────────────────

interface SpaQuickBookDialogProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  prefillDate: string;       // YYYY-MM-DD
  prefillCategoryId: string; // category to pre-filter services
}

type Step = 'service' | 'time' | 'customer';

export default function SpaQuickBookDialog({
  open,
  onClose,
  locationId,
  prefillDate,
  prefillCategoryId,
}: SpaQuickBookDialogProps) {
  const queryClient = useQueryClient();
  const createAppointment = useCreateAppointment();

  // ── State ──────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('service');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('service');
      setSelectedServiceId('');
      setSelectedSlot(null);
      setServiceSearch('');
      setIsGuest(false);
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setGuestName('');
      setNotes('');
      setErrorMessage(null);
    }
  }, [open]);

  // ── Data hooks ─────────────────────────────────────────────────
  const { items: services, isLoading: isLoadingServices } = useSpaServices({
    locationId: locationId || undefined,
    status: 'active',
    categoryId: prefillCategoryId !== '__all__' ? prefillCategoryId : undefined,
  });

  const { items: providers } = useSpaProviders({
    locationId: locationId || undefined,
  });

  const slotsParams = useMemo(() => {
    if (!selectedServiceId || !prefillDate) return null;
    return {
      serviceId: selectedServiceId,
      locationId: locationId || undefined,
      date: prefillDate,
    };
  }, [selectedServiceId, prefillDate, locationId]);

  const { data: slots, isLoading: isLoadingSlots } = useSpaAvailableSlots(slotsParams);

  // ── Derived ────────────────────────────────────────────────────
  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    const q = serviceSearch.toLowerCase();
    return services.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q)),
    );
  }, [services, serviceSearch]);

  const canSubmit = !!selectedSlot && (isGuest ? !!guestName.trim() : !!customerName.trim());

  // ── Handlers ───────────────────────────────────────────────────
  const handleSelectService = useCallback((id: string) => {
    setSelectedServiceId(id);
    setSelectedSlot(null);
    setErrorMessage(null);
    setStep('time');
  }, []);

  const handleSelectSlot = useCallback((slot: AvailableSlot) => {
    setSelectedSlot(slot);
    setErrorMessage(null);
    setStep('customer');
  }, []);

  const handleBack = useCallback(() => {
    if (step === 'customer') { setStep('time'); setErrorMessage(null); }
    else if (step === 'time') { setStep('service'); setSelectedServiceId(''); setSelectedSlot(null); setErrorMessage(null); }
  }, [step]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !selectedSlot || !selectedService) return;
    setErrorMessage(null);

    const startAt = selectedSlot.startTime;
    const endAt = selectedSlot.endTime;
    const resolvedProviderId = selectedSlot.providerId || undefined;

    createAppointment.mutate(
      {
        locationId,
        startAt,
        endAt,
        bookingSource: 'front_desk',
        notes: notes.trim() || undefined,
        providerId: resolvedProviderId,
        items: [{
          serviceId: selectedServiceId,
          providerId: resolvedProviderId,
          startAt,
          endAt,
          priceCents: selectedService.priceCents,
          finalPriceCents: selectedService.priceCents,
          discountAmountCents: 0,
        }],
        ...(isGuest
          ? { guestName: guestName.trim(), guestPhone: customerPhone.trim() || undefined }
          : {
              guestName: customerName.trim(),
              guestEmail: customerEmail.trim() || undefined,
              guestPhone: customerPhone.trim() || undefined,
            }),
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['spa-availability-summary'] });
          onClose();
        },
        onError: (err) => {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to book appointment.');
        },
      },
    );
  }, [
    canSubmit, locationId, selectedServiceId, selectedService, selectedSlot,
    notes, isGuest, guestName, customerName, customerEmail, customerPhone,
    createAppointment, queryClient, onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Quick Book</h2>
            <p className="text-sm text-muted-foreground">{formatDisplayDate(prefillDate)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
          {(['service', 'time', 'customer'] as Step[]).map((s, i) => {
            const labels = ['Service', 'Time', 'Customer'];
            const isActive = s === step;
            const isComplete = (s === 'service' && step !== 'service') ||
              (s === 'time' && step === 'customer');
            return (
              <div key={s} className="flex items-center gap-1.5">
                {i > 0 && <div className="h-px w-4 bg-border" />}
                <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  isComplete ? 'bg-green-500/20 text-green-500'
                    : isActive ? 'bg-indigo-600 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {isComplete ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                <span className={`text-xs ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {labels[i]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Step 1: Service */}
          {step === 'service' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Search services..."
                  className="w-full rounded-lg border border-input bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {isLoadingServices ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-muted/30" />
                  ))}
                </div>
              ) : filteredServices.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No services found.</p>
              ) : (
                <div className="space-y-2">
                  {filteredServices.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      isSelected={selectedServiceId === service.id}
                      onSelect={handleSelectService}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Time slot */}
          {step === 'time' && (
            <div className="space-y-3">
              {selectedService && (
                <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                  <p className="text-sm font-medium text-indigo-400">{selectedService.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(selectedService.durationMinutes)} &middot; {formatMoney(selectedService.priceCents)}
                  </p>
                </div>
              )}

              <p className="text-sm font-medium text-foreground">Available Times</p>

              {isLoadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading slots...</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <Calendar className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">No available slots on this date.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.startTime === slot.startTime && selectedSlot?.providerId === slot.providerId;
                    return (
                      <button
                        key={`${slot.providerId}-${slot.startTime}`}
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : 'border-border bg-surface text-foreground hover:bg-accent'
                        }`}
                      >
                        <div className="text-sm font-medium">{formatSlotTime(slot.startTime)}</div>
                        {slot.providerName && (
                          <div className={`mt-0.5 truncate text-[10px] ${isSelected ? 'text-white/70' : 'text-muted-foreground'}`}>
                            {slot.providerName}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Customer */}
          {step === 'customer' && (
            <div className="space-y-4">
              {/* Summary bar */}
              {selectedService && selectedSlot && (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedService.name}</span>
                  {' \u00B7 '}
                  {formatSlotTime(selectedSlot.startTime)} &ndash; {formatSlotTime(selectedSlot.endTime)}
                  {selectedSlot.providerName && ` \u00B7 ${selectedSlot.providerName}`}
                </div>
              )}

              {/* Guest / Customer toggle */}
              <div className="flex items-center rounded-lg border border-border bg-surface p-1">
                <button
                  type="button"
                  onClick={() => setIsGuest(false)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    !isGuest ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <UserCheck className="mr-1 inline h-3.5 w-3.5" /> Customer
                </button>
                <button
                  type="button"
                  onClick={() => setIsGuest(true)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isGuest ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="mr-1 inline h-3.5 w-3.5" /> Guest
                </button>
              </div>

              {!isGuest ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="qb-cust-name" className="mb-1 block text-sm font-medium text-foreground">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="qb-cust-name"
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="qb-cust-email" className="mb-1 block text-sm font-medium text-foreground">Email</label>
                    <input
                      id="qb-cust-email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="qb-cust-phone" className="mb-1 block text-sm font-medium text-foreground">Phone</label>
                    <input
                      id="qb-cust-phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="qb-guest-name" className="mb-1 block text-sm font-medium text-foreground">
                      Guest Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="qb-guest-name"
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Guest name"
                      className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="qb-guest-phone" className="mb-1 block text-sm font-medium text-foreground">Phone (optional)</label>
                    <input
                      id="qb-guest-phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="qb-notes" className="mb-1 block text-sm font-medium text-foreground">Notes (optional)</label>
                <textarea
                  id="qb-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special requests..."
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {errorMessage && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="text-xs text-red-500">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={step === 'service' ? onClose : handleBack}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            {step === 'service' ? 'Cancel' : 'Back'}
          </button>

          {step === 'customer' && (
            <button
              type="button"
              disabled={!canSubmit || createAppointment.isPending}
              onClick={handleSubmit}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createAppointment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Book Appointment
                </>
              )}
            </button>
          )}

          {/* Price display for non-customer steps */}
          {step !== 'customer' && selectedService && (
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {formatMoney(selectedService.priceCents)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Service Card ─────────────────────────────────────────────────────

function ServiceCard({
  service,
  isSelected,
  onSelect,
}: {
  service: SpaService;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(service.id)}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10'
          : 'border-border bg-surface hover:bg-accent'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${isSelected ? 'text-indigo-400' : 'text-foreground'}`}>
            {service.name}
          </p>
          {service.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{service.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(service.durationMinutes)}
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {formatMoney(service.priceCents)}
          </span>
        </div>
      </div>
    </button>
  );
}
