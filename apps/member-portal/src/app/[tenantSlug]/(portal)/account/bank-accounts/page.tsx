import { redirect } from 'next/navigation';

export default function BankAccountsRedirect({
  params,
}: {
  params: { tenantSlug: string };
}) {
  redirect(`/${params.tenantSlug}/account/payment-methods`);
}
