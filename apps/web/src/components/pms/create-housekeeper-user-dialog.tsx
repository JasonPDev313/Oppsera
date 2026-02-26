'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface CreateHousekeeperUserDialogProps {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  onCreate: (input: {
    propertyId: string;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    password?: string;
    phone?: string;
  }) => Promise<void>;
}

export function CreateHousekeeperUserDialog({
  open,
  onClose,
  propertyId,
  onCreate,
}: CreateHousekeeperUserDialogProps) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setUsername('');
    setPassword('');
    setPhone('');
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // Auto-generate username from email
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (!username || username === email.split('@')[0]) {
      setUsername(value.split('@')[0] || '');
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Invalid email';
    if (!username.trim()) newErrors.username = 'Username is required';
    else if (username.length < 3) newErrors.username = 'Username must be at least 3 characters';
    if (password && password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        propertyId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        username: username.trim(),
        password: password || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success(`${firstName} ${lastName} has been created as a housekeeper.`);
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create housekeeper';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-50 w-full max-w-lg rounded-lg bg-surface border border-gray-200/50 shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/30">
          <h2 className="text-lg font-semibold">Create New Housekeeper</h2>
          <button onClick={handleClose} className="p-1 rounded hover:bg-gray-200/50" aria-label="Close">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a new user account with the housekeeper role.
          </p>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">First Name *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-gray-300/50 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                autoFocus
              />
              {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-gray-300/50 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300/50 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium mb-1">Username *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300/50 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to send invite"
              className="w-full px-3 py-2 rounded-md border border-gray-300/50 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            <p className="text-xs text-muted-foreground mt-1">If blank, an invite email will be sent.</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300/50 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Role badge */}
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 text-sm">
              Housekeeper
            </div>
            <p className="text-xs text-muted-foreground mt-1">This user will be assigned the housekeeper role automatically.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200/30">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300/50 hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-4 h-4" />
            {isSubmitting ? 'Creating...' : 'Create Housekeeper'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
