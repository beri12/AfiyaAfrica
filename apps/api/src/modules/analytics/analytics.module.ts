import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  analyticsRangeQuerySchema,
  type AnalyticsRangeQuery,
  type AppointmentAnalytics,
  type OverviewMetrics,
} from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodQuery } from '../../common/pipes/zod';
import { addDays, zonedDateString, zonedDayBounds } from '../../common/time';
import { Errors } from '../../common/http/errors';

const MAX_RANGE_DAYS = 366;

/** Operational analytics only. Nothing here measures or implies clinical outcomes. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private range(tz: string, q: AnalyticsRangeQuery) {
    const today = zonedDateString(new Date(), tz);
    const to = q.to ?? today;
    const from = q.from ?? addDays(to, -29);
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
    if (days > MAX_RANGE_DAYS) throw Errors.badRequest('RANGE_TOO_LARGE', `Maximum range is ${MAX_RANGE_DAYS} days`);
    return { from, to, start: zonedDayBounds(from, tz).start, end: zonedDayBounds(to, tz).end, days };
  }

  private dateSeries(from: string, days: number): string[] {
    return Array.from({ length: days }, (_, i) => addDays(from, i));
  }

  async overview(t: TenantContext): Promise<OverviewMetrics> {
    const tz = t.clinicTimezone;
    const today = zonedDateString(new Date(), tz);
    const { start: dayStart, end: dayEnd } = zonedDayBounds(today, tz);
    const monthStart = zonedDayBounds(`${today.slice(0, 7)}-01`, tz).start;
    const clinicId = t.clinicId;
    const todayDate = new Date(`${today}T00:00:00Z`);

    const [totalPatients, newPatientsThisMonth, todaysAppointments, completedToday, pendingAppointments, activeDoctors, openFollowUps, overdueFollowUps, trend, recent] =
      await Promise.all([
        this.prisma.patient.count({ where: { clinicId, deletedAt: null } }),
        this.prisma.patient.count({ where: { clinicId, deletedAt: null, createdAt: { gte: monthStart } } }),
        this.prisma.appointment.count({ where: { clinicId, startAt: { gte: dayStart, lt: dayEnd }, status: { not: 'CANCELLED' } } }),
        this.prisma.appointment.count({ where: { clinicId, startAt: { gte: dayStart, lt: dayEnd }, status: 'COMPLETED' } }),
        this.prisma.appointment.count({ where: { clinicId, status: 'PENDING', startAt: { gte: new Date() } } }),
        this.prisma.clinicMembership.count({ where: { clinicId, role: 'DOCTOR', status: 'ACTIVE', deletedAt: null } }),
        this.prisma.followUp.count({ where: { clinicId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        this.prisma.followUp.count({ where: { clinicId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: todayDate } } }),
        this.appointmentsByDay(clinicId, tz, zonedDayBounds(addDays(today, -13), tz).start, dayEnd),
        this.prisma.auditLog.findMany({
          where: { clinicId, NOT: { action: { endsWith: '.viewed' } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, action: true, entityType: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } },
        }),
      ]);

    const byDate = new Map(trend.map((r) => [r.date, r]));
    return {
      totalPatients,
      newPatientsThisMonth,
      todaysAppointments,
      completedToday,
      pendingAppointments,
      activeDoctors,
      openFollowUps,
      overdueFollowUps,
      appointmentTrend: this.dateSeries(addDays(today, -13), 14).map((date) => ({
        date,
        total: byDate.get(date)?.total ?? 0,
        completed: byDate.get(date)?.completed ?? 0,
      })),
      recentActivity: recent.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        actorName: r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : 'System',
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private async appointmentsByDay(clinicId: string, tz: string, start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<{ date: string; total: bigint; completed: bigint; cancelled: bigint; no_show: bigint }[]>`
      SELECT to_char(("startAt" AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS date,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
             COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
             COUNT(*) FILTER (WHERE status = 'NO_SHOW') AS no_show
      FROM "Appointment"
      WHERE "clinicId" = ${clinicId}::uuid AND "startAt" >= ${start} AND "startAt" < ${end}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => ({
      date: r.date,
      total: Number(r.total),
      completed: Number(r.completed),
      cancelled: Number(r.cancelled),
      noShow: Number(r.no_show),
    }));
  }

  async appointments(t: TenantContext, q: AnalyticsRangeQuery): Promise<AppointmentAnalytics & { from: string; to: string }> {
    const r = this.range(t.clinicTimezone, q);
    const [rows, grouped] = await Promise.all([
      this.appointmentsByDay(t.clinicId, t.clinicTimezone, r.start, r.end),
      this.prisma.appointment.groupBy({ by: ['status'], where: { clinicId: t.clinicId, startAt: { gte: r.start, lt: r.end } }, _count: true }),
    ]);
    const count = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
    const totals = {
      total: grouped.reduce((a, g) => a + g._count, 0),
      completed: count('COMPLETED'),
      cancelled: count('CANCELLED'),
      noShow: count('NO_SHOW'),
      pending: count('PENDING'),
      confirmed: count('CONFIRMED'),
    };
    // Rates are computed over appointments whose outcome is known.
    const resolved = totals.completed + totals.noShow;
    const byDate = new Map(rows.map((x) => [x.date, x]));
    const rate = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
    return {
      from: r.from,
      to: r.to,
      byDay: this.dateSeries(r.from, r.days).map((date) => byDate.get(date) ?? { date, total: 0, completed: 0, cancelled: 0, noShow: 0 }),
      totals,
      completionRate: rate(totals.completed, resolved),
      noShowRate: rate(totals.noShow, resolved),
      cancellationRate: rate(totals.cancelled, totals.total),
    };
  }

  async patients(t: TenantContext, q: AnalyticsRangeQuery) {
    const r = this.range(t.clinicTimezone, q);
    const rows = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE ${t.clinicTimezone}), 'YYYY-MM-DD') AS date, COUNT(*) AS count
      FROM "Patient"
      WHERE "clinicId" = ${t.clinicId}::uuid AND "deletedAt" IS NULL AND "createdAt" >= ${r.start} AND "createdAt" < ${r.end}
      GROUP BY 1 ORDER BY 1`;
    const byDate = new Map(rows.map((x) => [x.date, Number(x.count)]));
    const series = this.dateSeries(r.from, r.days).map((date) => ({ date, registrations: byDate.get(date) ?? 0 }));
    return { from: r.from, to: r.to, series, total: series.reduce((a, s) => a + s.registrations, 0) };
  }

  async services(t: TenantContext, q: AnalyticsRangeQuery) {
    const r = this.range(t.clinicTimezone, q);
    const rows = await this.prisma.$queryRaw<{ service_id: string; name: string; total: bigint; completed: bigint }[]>`
      SELECT s.id AS service_id, s.name, COUNT(a.id) AS total, COUNT(a.id) FILTER (WHERE a.status = 'COMPLETED') AS completed
      FROM "ClinicService" s
      LEFT JOIN "Appointment" a ON a."serviceId" = s.id AND a."startAt" >= ${r.start} AND a."startAt" < ${r.end}
      WHERE s."clinicId" = ${t.clinicId}::uuid AND s."deletedAt" IS NULL
      GROUP BY s.id, s.name ORDER BY total DESC`;
    return {
      from: r.from,
      to: r.to,
      services: rows.map((x) => ({ serviceId: x.service_id, name: x.name, total: Number(x.total), completed: Number(x.completed) })),
    };
  }

  async activity(t: TenantContext, q: AnalyticsRangeQuery) {
    const r = this.range(t.clinicTimezone, q);
    const rows = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where: { clinicId: t.clinicId, createdAt: { gte: r.start, lt: r.end } },
      _count: true,
      orderBy: { _count: { action: 'desc' } },
      take: 20,
    });
    return { from: r.from, to: r.to, actions: rows.map((x) => ({ action: x.action, count: x._count })) };
  }
}

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermissions('analytics:read')
  overview(@Tenant() t: TenantContext) {
    return this.analytics.overview(t);
  }

  @Get('appointments')
  @RequirePermissions('analytics:read')
  appointments(@Tenant() t: TenantContext, @ZodQuery(analyticsRangeQuerySchema) q: AnalyticsRangeQuery) {
    return this.analytics.appointments(t, q);
  }

  @Get('patients')
  @RequirePermissions('analytics:read')
  patients(@Tenant() t: TenantContext, @ZodQuery(analyticsRangeQuerySchema) q: AnalyticsRangeQuery) {
    return this.analytics.patients(t, q);
  }

  @Get('services')
  @RequirePermissions('analytics:read')
  services(@Tenant() t: TenantContext, @ZodQuery(analyticsRangeQuerySchema) q: AnalyticsRangeQuery) {
    return this.analytics.services(t, q);
  }

  @Get('activity')
  @RequirePermissions('analytics:read')
  activity(@Tenant() t: TenantContext, @ZodQuery(analyticsRangeQuerySchema) q: AnalyticsRangeQuery) {
    return this.analytics.activity(t, q);
  }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
