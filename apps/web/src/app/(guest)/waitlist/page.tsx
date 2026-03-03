import { redirect } from 'next/navigation';

export default function WaitlistIndexPage() {
  redirect('/waitlist/join');
}
