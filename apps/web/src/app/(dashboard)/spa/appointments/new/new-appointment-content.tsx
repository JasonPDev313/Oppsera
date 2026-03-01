'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  User,
  Calendar,
  Check,
  Loader2,
  Search,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  useSpaServices,
  useSpaProviders,
  useSpaAvailableSlots,
  useSpaServiceCategories,
  useCreateAppointment,
} from '@/hooks/use-spa';
import type { SpaService, SpaProvider, AvailableSlot } from '@/hooks/use-spa';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatSlotTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
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
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ═══════════════════════════════════════════════════════════════════
// Step Header
// ═══════════════════════════════════════════════════════════════════

function StepHeader({
  stepNumber,
  title,
  subtitle,
  isComplete,
  isActive,
}: {
  stepNumber: number;
  title: string;
  subtitle?: string;
  isComplete: boolean;
  isActive: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          isComplete
            ? 'bg-green-500/20 text-green-500'
            : isActive
              ? 'bg-indigo-600 text-white'
              : 'bg-surface border border-border text-muted-foreground'
        }`}
      >
        {isComplete ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          stepNumber
        )}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 1 — Service Selection
// ═══════════════════════════════════════════════════════════════════

function ServiceStep({
  services,
  isLoading,
  selectedServiceId,
  onSelect,
  serviceSearch,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
}: {
  services: SpaService[];
  isLoading: boolean;
  selectedServiceId: string;
  onSelect: (id: string) => void;
  serviceSearch: string;
  onSearchChange: (v: string) => void;
  categories: Array<{ id: string; name: string }>;
  selectedCategory: string;
  onCategoryChange: (v: string) => void;
}) {
  const filteredServices = useMemo(() => {
    let list = services;
    if (selectedCategory) {
      list = list.filter((s) => s.categoryId === selectedCategory);
    }
    if (serviceSearch.trim()) {
      const q = serviceSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [services, selectedCategory, serviceSearch]);

  // Group by category
  const grouped = useMemo(() => {
    if (selectedCategory) return null; // no grouping when filtered by one category
    const map = new Map<string, SpaService[]>();
    for (const s of filteredServices) {
      const catKey = s.categoryName ?? 'Uncategorized';
      const arr = map.get(catKey);
      if (arr) {
        arr.push(s);
      } else {
        map.set(catKey, [s]);
      }
    }
    return map.size > 1 ? map : null;
  }, [filteredServices, selectedCategory]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg border border-border bg-surface"
          />
        ))}
      </div>
    );
  }

  const renderServiceCard = (service: SpaService) => {
    const isSelected = selectedServiceId === service.id;
    return (
      <button
        key={service.id}
        type="button"
        onClick={() => onSelect(service.id)}
        className={`w-full text-left rounded-lg border p-4 transition-colors ${
          isSelected
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-border bg-surface hover:bg-accent'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-medium ${
                isSelected ? 'text-indigo-400' : 'text-foreground'
              }`}
            >
              {service.name}
            </p>
            {service.description && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                {service.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatDuration(service.durationMinutes)}
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {formatMoney(service.priceCents)}
            </span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Search + category filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={serviceSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search services..."
            className="w-full rounded-lg border border-input bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Service list */}
      {filteredServices.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-border bg-surface py-8">
          <Sparkles
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            No services found.
          </p>
        </div>
      ) : grouped ? (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([catName, catServices]) => (
            <div key={catName}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {catName}
              </p>
              <div className="space-y-2">
                {catServices.map(renderServiceCard)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredServices.map(renderServiceCard)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 2 — Provider Selection
// ═══════════════════════════════════════════════════════════════════

function ProviderStep({
  providers,
  isLoading,
  selectedProviderId,
  onSelect,
  selectedServiceId,
}: {
  providers: SpaProvider[];
  isLoading: boolean;
  selectedProviderId: string;
  onSelect: (id: string) => void;
  selectedServiceId: string;
}) {
  // Filter providers to those offering the selected service (if they have serviceIds)
  const availableProviders = useMemo(() => {
    if (!selectedServiceId) return providers;
    return providers.filter(
      (p) =>
        p.serviceIds.length === 0 ||
        p.serviceIds.includes(selectedServiceId),
    );
  }, [providers, selectedServiceId]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-lg border border-border bg-surface"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* "Any Available" option */}
      <button
        type="button"
        onClick={() => onSelect('')}
        className={`w-full text-left rounded-lg border p-3 transition-colors ${
          selectedProviderId === ''
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-border bg-surface hover:bg-accent'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/10">
            <Users className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          </div>
          <div>
            <p
              className={`text-sm font-medium ${
                selectedProviderId === '' ? 'text-indigo-400' : 'text-foreground'
              }`}
            >
              Any Available Provider
            </p>
            <p className="text-xs text-muted-foreground">
              First available will be assigned
            </p>
          </div>
        </div>
      </button>

      {availableProviders.map((provider) => {
        const isSelected = selectedProviderId === provider.id;
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => onSelect(provider.id)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              isSelected
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-border bg-surface hover:bg-accent'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface border border-border">
                <User
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    isSelected ? 'text-indigo-400' : 'text-foreground'
                  }`}
                >
                  {provider.displayName}
                </p>
                {provider.specialties.length > 0 && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {provider.specialties.join(', ')}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {availableProviders.length === 0 && (
        <div className="flex flex-col items-center rounded-lg border border-border bg-surface py-6">
          <User
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            No providers available for this service.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 3 — Date & Time Selection
// ═══════════════════════════════════════════════════════════════════

function DateTimeStep({
  selectedDate,
  onDateChange,
  selectedTime,
  onTimeChange,
  slots,
  isLoadingSlots,
  serviceId,
}: {
  selectedDate: string;
  onDateChange: (v: string) => void;
  selectedTime: string;
  onTimeChange: (slot: AvailableSlot) => void;
  slots: AvailableSlot[];
  isLoadingSlots: boolean;
  serviceId: string;
}) {
  const today = getTodayString();

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div>
        <label
          htmlFor="booking-date"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Date
        </label>
        <input
          id="booking-date"
          type="date"
          value={selectedDate}
          min={today}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      {/* Time slots */}
      {selectedDate && serviceId && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            Available Times
          </p>

          {isLoadingSlots ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-surface py-8">
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading available slots...
              </span>
            </div>
          ) : slots.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-border bg-surface py-8">
              <Calendar
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                No available slots on this date.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try selecting a different date or provider.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {slots.map((slot) => {
                const isSelected = selectedTime === slot.startTime;
                return (
                  <button
                    key={`${slot.providerId}-${slot.startTime}`}
                    type="button"
                    onClick={() => onTimeChange(slot)}
                    className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-border bg-surface text-foreground hover:bg-accent'
                    }`}
                  >
                    {formatSlotTime(slot.startTime)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Show slot provider info when a slot is selected */}
          {selectedTime && (
            <div className="mt-2">
              {(() => {
                const slot = slots.find((s) => s.startTime === selectedTime);
                if (!slot) return null;
                return (
                  <p className="text-xs text-muted-foreground">
                    {slot.providerName
                      ? `Provider: ${slot.providerName}`
                      : 'Provider will be assigned'}
                    {' \u00B7 '}
                    {formatSlotTime(slot.startTime)} &ndash;{' '}
                    {formatSlotTime(slot.endTime)}
                  </p>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Step 4 — Customer Info
// ═══════════════════════════════════════════════════════════════════

function CustomerStep({
  isGuest,
  onToggleGuest,
  customerName,
  onCustomerNameChange,
  customerEmail,
  onCustomerEmailChange,
  customerPhone,
  onCustomerPhoneChange,
  guestName,
  onGuestNameChange,
  notes,
  onNotesChange,
}: {
  isGuest: boolean;
  onToggleGuest: (v: boolean) => void;
  customerName: string;
  onCustomerNameChange: (v: string) => void;
  customerEmail: string;
  onCustomerEmailChange: (v: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (v: string) => void;
  guestName: string;
  onGuestNameChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center rounded-lg border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => onToggleGuest(false)}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            !isGuest
              ? 'bg-indigo-600 text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserCheck className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
          Existing Customer
        </button>
        <button
          type="button"
          onClick={() => onToggleGuest(true)}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isGuest
              ? 'bg-indigo-600 text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <User className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
          Guest
        </button>
      </div>

      {!isGuest ? (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="customer-name"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              id="customer-name"
              type="text"
              value={customerName}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              placeholder="Enter customer name"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="customer-email"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="customer-email"
              type="email"
              value={customerEmail}
              onChange={(e) => onCustomerEmailChange(e.target.value)}
              placeholder="customer@example.com"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="customer-phone"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Phone
            </label>
            <input
              id="customer-phone"
              type="tel"
              value={customerPhone}
              onChange={(e) => onCustomerPhoneChange(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="guest-name"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Guest Name <span className="text-red-500">*</span>
            </label>
            <input
              id="guest-name"
              type="text"
              value={guestName}
              onChange={(e) => onGuestNameChange(e.target.value)}
              placeholder="Enter guest name"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="guest-phone"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Phone (optional)
            </label>
            <input
              id="guest-phone"
              type="tel"
              value={customerPhone}
              onChange={(e) => onCustomerPhoneChange(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label
          htmlFor="booking-notes"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Notes (optional)
        </label>
        <textarea
          id="booking-notes"
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Special requests, preferences, allergies..."
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Booking Summary Sidebar
// ═══════════════════════════════════════════════════════════════════

function BookingSummary({
  selectedService,
  selectedProvider,
  selectedDate,
  selectedTime,
  selectedSlot,
  customerName,
  guestName,
  isGuest,
  isSubmitting,
  canSubmit,
  onSubmit,
  errorMessage,
}: {
  selectedService: SpaService | null;
  selectedProvider: SpaProvider | null;
  selectedDate: string;
  selectedTime: string;
  selectedSlot: AvailableSlot | null;
  customerName: string;
  guestName: string;
  isGuest: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  errorMessage: string | null;
}) {
  const displayName = isGuest ? guestName : customerName;
  const providerDisplay = selectedSlot?.providerName
    || selectedProvider?.displayName
    || 'Any Available';

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">
          Booking Summary
        </h2>
      </div>

      <div className="px-5 py-4">
        <div className="divide-y divide-border">
          {/* Service */}
          <div className="flex items-start justify-between py-2.5">
            <span className="text-sm text-muted-foreground">Service</span>
            <span className="text-sm font-medium text-foreground text-right max-w-[60%]">
              {selectedService?.name ?? '\u2014'}
            </span>
          </div>

          {/* Duration */}
          {selectedService && (
            <div className="flex items-start justify-between py-2.5">
              <span className="text-sm text-muted-foreground">Duration</span>
              <span className="text-sm text-foreground">
                {formatDuration(selectedService.durationMinutes)}
              </span>
            </div>
          )}

          {/* Provider */}
          <div className="flex items-start justify-between py-2.5">
            <span className="text-sm text-muted-foreground">Provider</span>
            <span className="text-sm text-foreground">
              {selectedService ? providerDisplay : '\u2014'}
            </span>
          </div>

          {/* Date & Time */}
          <div className="flex items-start justify-between py-2.5">
            <span className="text-sm text-muted-foreground">Date</span>
            <span className="text-sm text-foreground text-right">
              {selectedDate ? formatDisplayDate(selectedDate) : '\u2014'}
            </span>
          </div>

          <div className="flex items-start justify-between py-2.5">
            <span className="text-sm text-muted-foreground">Time</span>
            <span className="text-sm tabular-nums text-foreground">
              {selectedTime ? formatSlotTime(selectedTime) : '\u2014'}
            </span>
          </div>

          {/* Customer */}
          <div className="flex items-start justify-between py-2.5">
            <span className="text-sm text-muted-foreground">
              {isGuest ? 'Guest' : 'Customer'}
            </span>
            <span className="text-sm text-foreground text-right max-w-[60%]">
              {displayName || '\u2014'}
            </span>
          </div>

          {/* Total */}
          {selectedService && (
            <div className="flex items-start justify-between py-3">
              <span className="text-sm font-semibold text-foreground">
                Total
              </span>
              <span className="text-base font-semibold tabular-nums text-foreground">
                {formatMoney(selectedService.priceCents)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="mx-5 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-500">{errorMessage}</p>
        </div>
      )}

      {/* Submit button */}
      <div className="border-t border-border px-5 py-4">
        <button
          type="button"
          disabled={!canSubmit || isSubmitting}
          onClick={onSubmit}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Booking...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              Book Appointment
            </>
          )}
        </button>

        {!canSubmit && !isSubmitting && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Complete all required fields to book.
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Content
// ═══════════════════════════════════════════════════════════════════

export default function NewAppointmentContent() {
  const router = useRouter();

  // ── Form state ──────────────────────────────────────────────────
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Data hooks ──────────────────────────────────────────────────
  const { items: services, isLoading: isLoadingServices } = useSpaServices({
    status: 'active',
  });
  const { items: providers, isLoading: isLoadingProviders } = useSpaProviders();
  const { data: categories } = useSpaServiceCategories();
  const createAppointment = useCreateAppointment();

  // Only fetch slots when service + date are set
  const slotsParams = useMemo(() => {
    if (!selectedServiceId || !selectedDate) return null;
    return {
      serviceId: selectedServiceId,
      providerId: selectedProviderId || undefined,
      date: selectedDate,
    };
  }, [selectedServiceId, selectedProviderId, selectedDate]);

  const { data: slots, isLoading: isLoadingSlots } =
    useSpaAvailableSlots(slotsParams);

  // ── Derived state ───────────────────────────────────────────────
  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name })),
    [categories],
  );

  // ── Step completion checks ──────────────────────────────────────
  const step1Complete = !!selectedServiceId;
  const step2Complete = true; // provider is optional ("Any Available" is valid)
  const step3Complete = !!selectedDate && !!selectedTime;
  const step4Complete = isGuest ? !!guestName.trim() : !!customerName.trim();

  const canSubmit =
    step1Complete && step2Complete && step3Complete && step4Complete;

  // ── Handlers ────────────────────────────────────────────────────
  const handleServiceSelect = useCallback((id: string) => {
    setSelectedServiceId(id);
    // Reset downstream selections when service changes
    setSelectedTime('');
    setSelectedSlot(null);
    setErrorMessage(null);
  }, []);

  const handleProviderSelect = useCallback((id: string) => {
    setSelectedProviderId(id);
    // Reset time when provider changes (slots may differ)
    setSelectedTime('');
    setSelectedSlot(null);
    setErrorMessage(null);
  }, []);

  const handleDateChange = useCallback((date: string) => {
    setSelectedDate(date);
    // Reset time when date changes
    setSelectedTime('');
    setSelectedSlot(null);
    setErrorMessage(null);
  }, []);

  const handleTimeSelect = useCallback((slot: AvailableSlot) => {
    setSelectedTime(slot.startTime);
    setSelectedSlot(slot);
    setErrorMessage(null);
  }, []);

  const handleToggleGuest = useCallback((guest: boolean) => {
    setIsGuest(guest);
    setErrorMessage(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    setErrorMessage(null);

    // Build input aligned with the useCreateAppointment mutation signature.
    // The mutation expects startTime (ISO string) and providerId.
    // Use the slot's providerId if one was assigned by the availability engine,
    // otherwise fall back to the user's explicit selection.
    const resolvedProviderId =
      selectedSlot?.providerId || selectedProviderId || '';

    const input: Record<string, unknown> = {
      serviceId: selectedServiceId,
      providerId: resolvedProviderId,
      startTime: selectedTime,
      notes: notes.trim() || undefined,
    };

    // Pass customer info as extra fields — the API may accept these
    // or the backend resolves customers separately. Included for
    // forward-compatibility with the booking endpoint contract.
    if (isGuest) {
      input.guestName = guestName.trim();
      if (customerPhone.trim()) {
        input.customerPhone = customerPhone.trim();
      }
    } else {
      input.customerName = customerName.trim();
      if (customerEmail.trim()) {
        input.customerEmail = customerEmail.trim();
      }
      if (customerPhone.trim()) {
        input.customerPhone = customerPhone.trim();
      }
    }

    createAppointment.mutate(input as Parameters<typeof createAppointment.mutate>[0], {
      onSuccess: (data) => {
        router.push(`/spa/appointments/${data.id}`);
      },
      onError: (err) => {
        const msg =
          err instanceof Error ? err.message : 'Failed to book appointment.';
        setErrorMessage(msg);
      },
    });
  }, [
    canSubmit,
    selectedServiceId,
    selectedProviderId,
    selectedSlot,
    selectedTime,
    notes,
    isGuest,
    guestName,
    customerName,
    customerEmail,
    customerPhone,
    createAppointment,
    router,
  ]);

  // ── Back navigation ─────────────────────────────────────────────
  const handleBack = useCallback(() => {
    router.push('/spa/appointments');
  }, [router]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center justify-center rounded-lg border border-border bg-surface p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to appointments"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            New Appointment
          </h1>
          <p className="text-sm text-muted-foreground">
            Schedule a new spa appointment
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Form steps */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1 — Select Service */}
          <div className="rounded-lg border border-border bg-surface p-5">
            <StepHeader
              stepNumber={1}
              title="Select Service"
              subtitle="Choose the service for this appointment"
              isComplete={step1Complete}
              isActive={!step1Complete}
            />
            <ServiceStep
              services={services}
              isLoading={isLoadingServices}
              selectedServiceId={selectedServiceId}
              onSelect={handleServiceSelect}
              serviceSearch={serviceSearch}
              onSearchChange={setServiceSearch}
              categories={categoryOptions}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          </div>

          {/* Step 2 — Select Provider (visible after service selected) */}
          {step1Complete && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <StepHeader
                stepNumber={2}
                title="Select Provider"
                subtitle="Choose a provider or let us assign one"
                isComplete={step1Complete && step2Complete}
                isActive={step1Complete && !step3Complete}
              />
              <ProviderStep
                providers={providers}
                isLoading={isLoadingProviders}
                selectedProviderId={selectedProviderId}
                onSelect={handleProviderSelect}
                selectedServiceId={selectedServiceId}
              />
            </div>
          )}

          {/* Step 3 — Date & Time (visible after service selected) */}
          {step1Complete && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <StepHeader
                stepNumber={3}
                title="Select Date & Time"
                subtitle="Pick an available time slot"
                isComplete={step3Complete}
                isActive={step1Complete && !step3Complete}
              />
              <DateTimeStep
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                selectedTime={selectedTime}
                onTimeChange={handleTimeSelect}
                slots={slots}
                isLoadingSlots={isLoadingSlots}
                serviceId={selectedServiceId}
              />
            </div>
          )}

          {/* Step 4 — Customer Info (visible after time selected) */}
          {step3Complete && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <StepHeader
                stepNumber={4}
                title="Customer Information"
                subtitle="Enter the customer or guest details"
                isComplete={step4Complete}
                isActive={step3Complete && !step4Complete}
              />
              <CustomerStep
                isGuest={isGuest}
                onToggleGuest={handleToggleGuest}
                customerName={customerName}
                onCustomerNameChange={setCustomerName}
                customerEmail={customerEmail}
                onCustomerEmailChange={setCustomerEmail}
                customerPhone={customerPhone}
                onCustomerPhoneChange={setCustomerPhone}
                guestName={guestName}
                onGuestNameChange={setGuestName}
                notes={notes}
                onNotesChange={setNotes}
              />
            </div>
          )}
        </div>

        {/* Right column — Summary */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <BookingSummary
            selectedService={selectedService}
            selectedProvider={selectedProvider}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            selectedSlot={selectedSlot}
            customerName={customerName}
            guestName={guestName}
            isGuest={isGuest}
            isSubmitting={createAppointment.isPending}
            canSubmit={canSubmit}
            onSubmit={handleSubmit}
            errorMessage={errorMessage}
          />
        </div>
      </div>
    </div>
  );
}
