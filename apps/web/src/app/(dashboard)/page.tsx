import { DollarSign, ShoppingCart, AlertTriangle, Users } from 'lucide-react';

const metrics = [
  { name: 'Total Sales', value: '--', icon: DollarSign, color: 'text-green-600 bg-green-50' },
  { name: 'Orders Today', value: '--', icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
  { name: 'Low Stock Items', value: '--', icon: AlertTriangle, color: 'text-amber-600 bg-amber-50' },
  { name: 'Active Customers', value: '--', icon: Users, color: 'text-indigo-600 bg-indigo-50' },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Welcome to OppsEra</h1>
      <p className="mt-1 text-sm text-gray-600">
        Here is an overview of your business at a glance.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.name}
            className="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-gray-950/5"
          >
            <div className="flex items-center gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${metric.color}`}>
                <metric.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{metric.name}</p>
                <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
