'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const AXIS = { fontSize: 12, fill: '#5b6b80' };
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export interface SeriesDef { key: string; label: string; color: string }

/** Time series as a stacked-free area chart. Data keys are dates (YYYY-MM-DD). */
export function TrendChart({ data, series, height = 260 }: { data: Record<string, number | string>[]; series: SeriesDef[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`Chart of ${series.map((s) => s.label).join(', ')} over time`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#e3e8ef" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(l) => shortDate(String(l))} contentStyle={{ borderRadius: 12, border: '1px solid #e3e8ef', fontSize: 13 }} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.2} fill={`url(#fill-${s.key})`} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, xKey, series, height = 260, horizontal = false }: { data: Record<string, number | string>[]; xKey: string; series: SeriesDef[]; height?: number; horizontal?: boolean }) {
  return (
    <div style={{ height }} role="img" aria-label={`Bar chart of ${series.map((s) => s.label).join(', ')}`}>
      <ResponsiveContainer>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 24 : -16, bottom: 0 }}>
          <CartesianGrid stroke="#e3e8ef" horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} width={150} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tickFormatter={(v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? shortDate(String(v)) : String(v))} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            </>
          )}
          <Tooltip cursor={{ fill: '#eef5fc' }} contentStyle={{ borderRadius: 12, border: '1px solid #e3e8ef', fontSize: 13 }} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
