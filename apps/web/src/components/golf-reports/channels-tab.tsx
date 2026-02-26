'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useChannelKpis } from '@/hooks/use-golf-reports';
import { formatBasisPoints, formatRoundCount } from '@/lib/golf-formatters';

interface ChannelsTabProps {
  dateFrom: string;
  dateTo: string;
  courseId?: string;
  locationId?: string;
}

const CHANNEL_COLORS = {
  online: '#6366f1',
  proshop: '#22c55e',
  phone: '#f59e0b',
};

const PLAYER_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f97316'];

export function ChannelsTab({ dateFrom, dateTo, courseId, locationId }: ChannelsTabProps) {
  const channels = useChannelKpis({ dateFrom, dateTo, courseId, locationId });

  if (channels.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg bg-surface p-3 ring-1 ring-gray-950/5">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-5 w-12 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="h-[300px] animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!channels.data) return null;

  const channelBars = [
    { name: 'Online', value: channels.data.onlineSlots, fill: CHANNEL_COLORS.online },
    { name: 'Pro Shop', value: channels.data.proshopSlots, fill: CHANNEL_COLORS.proshop },
    { name: 'Phone', value: channels.data.phoneSlots, fill: CHANNEL_COLORS.phone },
  ];

  const playerMix = [
    { name: 'Member', value: channels.data.memberRounds },
    { name: 'Public', value: channels.data.publicRounds },
    { name: 'League', value: channels.data.leagueRounds },
    { name: 'Outing', value: channels.data.outingRounds },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* KPI Mini Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniCard label="Online Booking" value={formatBasisPoints(channels.data.onlinePctBps)} />
        <MiniCard label="Member Rounds" value={formatRoundCount(channels.data.memberRounds)} />
        <MiniCard label="Last-Minute" value={formatRoundCount(channels.data.lastMinuteCount)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Channel Distribution Chart */}
        <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Booking Channels</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={channelBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number | undefined) => formatRoundCount(value ?? null)}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar dataKey="value" name="Slots">
                {channelBars.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Player Mix Pie */}
        {playerMix.length > 0 && (
          <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">Player Mix</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={playerMix}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {playerMix.map((_, idx) => (
                    <Cell key={idx} fill={PLAYER_COLORS[idx % PLAYER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => formatRoundCount(value ?? null)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniCard label="Total Bookings" value={formatRoundCount(channels.data.bookingCount)} />
        <MiniCard label="Avg Lead Time" value={`${channels.data.avgLeadTimeHours.toFixed(1)}h`} />
        <MiniCard label="Advanced" value={formatRoundCount(channels.data.advancedCount)} />
        <MiniCard label="Advanced %" value={formatBasisPoints(channels.data.advancedPctBps)} />
      </div>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface p-3 ring-1 ring-gray-950/5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
