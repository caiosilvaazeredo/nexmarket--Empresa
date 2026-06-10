import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const AXIS = { fontSize: 12, fill: '#94A3B8' };

const tooltipStyle = {
  borderRadius: 14,
  border: '2px solid #E2E8F0',
  fontSize: 13,
  fontWeight: 600,
  boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
};

export interface Series {
  key: string;
  color: string;
  label?: string;
}

export function AreaTrend({
  data,
  xKey,
  series,
  height = 280,
  formatY,
}: {
  data: any[];
  xKey: string;
  series: Series[];
  height?: number;
  formatY?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient id={`grad-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={formatY} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => (formatY ? formatY(Number(v)) : v)} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label || s.key}
            stroke={s.color}
            strokeWidth={3}
            fill={`url(#grad-${s.key})`}
            dot={false}
            activeDot={{ r: 5 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({
  data,
  xKey,
  barKey,
  color = '#58CC02',
  height = 260,
  formatY,
}: {
  data: any[];
  xKey: string;
  barKey: string;
  color?: string;
  height?: number;
  formatY?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={formatY} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
        <Bar dataKey={barKey} fill={color} radius={[8, 8, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  height = 240,
}: {
  data: { name: string; value: number; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="85%"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
