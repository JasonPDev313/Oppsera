'use client';

import {
  ClipboardCheck,
  FileText,
  HeartPulse,
  PenLine,
  Send,
} from 'lucide-react';

const FEATURES = [
  {
    title: 'Form Builder',
    description: 'Drag-and-drop builder for custom intake questionnaires',
    icon: FileText,
  },
  {
    title: 'Health Questionnaires',
    description: 'Pre-built medical and allergy forms for spa safety compliance',
    icon: HeartPulse,
  },
  {
    title: 'Digital Signatures',
    description: 'Capture legally binding electronic signatures on waivers',
    icon: PenLine,
  },
  {
    title: 'Pre-Visit Forms',
    description: 'Send forms automatically before appointments via email or SMS',
    icon: Send,
  },
];

export default function IntakeContent() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Intake Forms</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Design and manage client intake and health questionnaires
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
          <ClipboardCheck className="h-8 w-8 text-indigo-500" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          Coming Soon
        </h2>
        <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
          This feature is currently under development and will be available in an
          upcoming release.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">
          Planned Features
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                  <feature.icon className="h-5 w-5 text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {feature.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
