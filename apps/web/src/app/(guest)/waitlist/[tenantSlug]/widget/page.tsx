import type { Metadata } from 'next';
import WidgetContent from './widget-content';

export const metadata: Metadata = {
  title: 'Join Waitlist',
  robots: 'noindex',
};

export default function WaitlistWidgetPage() {
  return <WidgetContent />;
}
