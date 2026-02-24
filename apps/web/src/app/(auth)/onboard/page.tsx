'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UtensilsCrossed,
  ShoppingBag,
  Flag,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthContext } from '@/components/auth-provider';
import { BUSINESS_TYPES, type BusinessTypeKey } from '@oppsera/shared';

const ICON_MAP: Record<string, LucideIcon> = {
  UtensilsCrossed,
  ShoppingBag,
  Flag,
  Building2,
};

const AVAILABLE_MODULES = [
  { key: 'catalog', name: 'Product Catalog', description: 'Items, categories, pricing' },
  { key: 'pos_retail', name: 'Retail POS', description: 'Orders, line items, payments' },
  { key: 'pos_fnb', name: 'F&B POS', description: 'Tables, tabs, coursing, kitchen tickets, server management' },
  { key: 'payments', name: 'Payments', description: 'Cash, card, split payments' },
  { key: 'inventory', name: 'Inventory', description: 'Stock tracking, receiving' },
  { key: 'customers', name: 'Customers', description: 'Customer profiles, history' },
  { key: 'reporting', name: 'Reports', description: 'Sales reports, analytics' },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
];

const STEP_LABELS = ['Business Type', 'Company', 'Location', 'Modules', 'Review'];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEP_LABELS.map((label, index) => {
        const stepNum = index + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;

        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  isCompleted
                    ? 'bg-indigo-600 text-white'
                    : isCurrent
                      ? 'border-2 border-indigo-600 bg-indigo-50 text-indigo-600'
                      : 'border-2 border-gray-300 text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`mt-1 text-xs ${
                  isCurrent ? 'font-medium text-indigo-600' : 'text-gray-400'
                }`}
              >
                {label}
              </span>
            </div>
            {index < STEP_LABELS.length - 1 && (
              <div
                className={`mb-5 h-0.5 w-8 ${
                  stepNum < currentStep ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardPage() {
  const router = useRouter();
  const auth = useAuthContext();

  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState<BusinessTypeKey | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [locationName, setLocationName] = useState('Main');
  const [timezone, setTimezone] = useState('America/New_York');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  function validateStep(): boolean {
    setError('');

    switch (step) {
      case 1:
        if (!businessType) {
          setError('Please select a business type to continue.');
          return false;
        }
        return true;
      case 2:
        if (!companyName.trim()) {
          setError('Company name is required.');
          return false;
        }
        return true;
      case 3:
        if (!locationName.trim()) {
          setError('Location name is required.');
          return false;
        }
        if (!timezone) {
          setError('Timezone is required.');
          return false;
        }
        return true;
      case 4:
        if (modules.length === 0) {
          setError('Please select at least one module.');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  function handleNext() {
    if (!validateStep()) return;

    if (step === 3) {
      // Pre-select recommended modules when entering Step 4
      const selectedType = BUSINESS_TYPES.find((bt) => bt.key === businessType);
      if (selectedType && modules.length === 0) {
        const recommended = selectedType.recommendedModules.filter((m) =>
          AVAILABLE_MODULES.some((am) => am.key === m),
        );
        setModules(recommended as string[]);
      }
    }

    setError('');
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError('');
    setStep((s) => s - 1);
  }

  function toggleModule(key: string) {
    setModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  }

  async function handleLaunch() {
    if (!validateStep()) return;

    setIsSubmitting(true);
    setError('');

    try {
      await apiFetch('/api/v1/onboard', {
        method: 'POST',
        body: JSON.stringify({
          businessType,
          companyName,
          locationName,
          timezone,
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          zip: zip || undefined,
          modules,
        }),
      });
      // Refresh auth state so tenant is populated before navigating.
      // Without this, dashboard layout sees needsOnboarding=true and
      // redirects back to /onboard, creating an infinite loop.
      await auth.fetchMe();
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function getBusinessTypeName(): string {
    const bt = BUSINESS_TYPES.find((b) => b.key === businessType);
    return bt?.name ?? '';
  }

  function getModuleNames(): string[] {
    return modules
      .map((key) => AVAILABLE_MODULES.find((m) => m.key === key)?.name)
      .filter((name): name is string => Boolean(name));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-2xl rounded-xl bg-surface p-8 shadow-lg">
        {/* Step Indicator */}
        <StepIndicator currentStep={step} />

        {/* Step Content */}
        <div className="mt-8">
          {/* Step 1: Business Type */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">What type of business do you run?</h1>
              <p className="mt-2 text-sm text-gray-600">
                This helps us configure the best experience for you.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-4">
                {BUSINESS_TYPES.map((bt) => {
                  const Icon = ICON_MAP[bt.icon];
                  const isSelected = businessType === bt.key;

                  return (
                    <button
                      key={bt.key}
                      type="button"
                      onClick={() => setBusinessType(bt.key)}
                      className={`flex flex-col items-center rounded-lg border-2 p-6 text-center transition-colors ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-200 bg-surface hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {Icon && (
                        <Icon
                          className={`h-8 w-8 ${isSelected ? 'text-indigo-600' : 'text-gray-400'}`}
                        />
                      )}
                      <span
                        className={`mt-3 text-sm font-semibold ${
                          isSelected ? 'text-indigo-900' : 'text-gray-900'
                        }`}
                      >
                        {bt.name}
                      </span>
                      <span className="mt-1 text-xs text-gray-500">{bt.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Company Details */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Company Details</h1>
              <p className="mt-2 text-sm text-gray-600">Tell us about your company.</p>

              <div className="mt-6">
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                  Company Name
                </label>
                <input
                  id="companyName"
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                />
              </div>
            </div>
          )}

          {/* Step 3: Location Details */}
          {step === 3 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Location Details</h1>
              <p className="mt-2 text-sm text-gray-600">
                Set up your first location. You can add more later.
              </p>

              <div className="mt-6 space-y-5">
                <div>
                  <label htmlFor="locationName" className="block text-sm font-medium text-gray-700">
                    Location Name
                  </label>
                  <input
                    id="locationName"
                    type="text"
                    required
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Main"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
                    Timezone
                  </label>
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                      Address
                    </label>
                    <input
                      id="address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Main St"
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                      City
                    </label>
                    <input
                      id="city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Springfield"
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                        State
                      </label>
                      <input
                        id="state"
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="IL"
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="zip" className="block text-sm font-medium text-gray-700">
                        Zip
                      </label>
                      <input
                        id="zip"
                        type="text"
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        placeholder="62701"
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Modules */}
          {step === 4 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Select Modules</h1>
              <p className="mt-2 text-sm text-gray-600">
                Choose the features you need. We've pre-selected the recommended modules for your
                business type.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {AVAILABLE_MODULES.map((mod) => {
                  const isSelected = modules.includes(mod.key);

                  return (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => toggleModule(mod.key)}
                      className={`flex flex-col rounded-lg border-2 p-4 text-left transition-colors ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-200 bg-surface hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className={`text-sm font-semibold ${
                          isSelected ? 'text-indigo-900' : 'text-gray-900'
                        }`}
                      >
                        {mod.name}
                      </span>
                      <span className="mt-1 text-xs text-gray-500">{mod.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5: Review & Launch */}
          {step === 5 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Review & Launch</h1>
              <p className="mt-2 text-sm text-gray-600">
                Everything look good? Hit Launch to get started.
              </p>

              <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-6">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Business Type
                  </span>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{getBusinessTypeName()}</p>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Company Name
                  </span>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{companyName}</p>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Location
                  </span>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{locationName}</p>
                  <p className="text-sm text-gray-500">
                    {TIMEZONES.find((tz) => tz.value === timezone)?.label ?? timezone}
                  </p>
                  {(address || city || state || zip) && (
                    <p className="mt-1 text-sm text-gray-500">
                      {[address, city, [state, zip].filter(Boolean).join(' ')]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Modules
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {getModuleNames().map((name) => (
                      <span
                        key={name}
                        className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-8 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLaunch}
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
            >
              {isSubmitting ? 'Launching...' : 'Launch'}
            </button>
          )}
        </div>

        {/* Start over option for stuck users */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Wrong account?{' '}
          <button
            type="button"
            onClick={async () => {
              await auth.logout();
              router.replace('/login');
            }}
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            Sign out &amp; start over
          </button>
        </p>
      </div>
    </div>
  );
}
