"""Database access for harvest seasons: loads specs and reports and feeds them to `seasons`."""
import datetime
from collections import defaultdict

from django.db.models import Count, OuterRef, Q, Subquery
from django.db.models.functions import ExtractMonth
from django.utils import timezone

from fruit.models import Fruit, Kind
from herbarium.models import Season

from . import seasons
from .models import RipenessReport

# Older observations say little about today's climate and the plant's current state.
REPORT_HISTORY_YEARS = 5


def today():
    return timezone.localdate()


def specs_by_kind():
    """{kind_id: [SeasonSpec, ...]} for all kinds having a typical season in herbarium."""
    result = defaultdict(list)
    for season in Season.objects.select_related("herb").order_by("start"):
        result[season.herb.kind_id].append(seasons.SeasonSpec(season.part, season.start, season.duration))
    return dict(result)


def specs_for_kind(kind):
    return [
        seasons.SeasonSpec(season.part, season.start, season.duration)
        for season in Season.objects.filter(herb__kind=kind).order_by("start")
    ]


def _report_history_start(day):
    return datetime.date(day.year - REPORT_HISTORY_YEARS, 1, 1)


def reports_for_fruits(fruit_ids, day):
    """{fruit_id: [seasons.Report, ...]} of the recent history."""
    result = defaultdict(list)
    rows = RipenessReport.objects.filter(
        fruit_id__in=list(fruit_ids),
        observed_on__gte=_report_history_start(day),
        observed_on__lte=day,
    ).values_list("fruit_id", "observed_on", "state", "author_id")
    for fruit_id, observed_on, state, author_id in rows:
        result[fruit_id].append(seasons.Report(observed_on, state, author_id))
    return dict(result)


def fruit_season(fruit, day=None):
    """Season overview of one plant for the API."""
    day = day or today()
    specs = specs_for_kind(fruit.kind)
    reports = reports_for_fruits([fruit.id], day).get(fruit.id, [])
    window = seasons.predicted_window(specs, reports, day)
    fresh_from = day - datetime.timedelta(days=seasons.REPORT_VALID_DAYS)

    return {
        "status": seasons.status(window, reports, day),
        "predicted": window.as_dict() if window else None,
        "typical": [
            {"part": spec.part, "start": spec.start, "duration": spec.duration, "months": spec.months} for spec in specs
        ],
        "observed": seasons.observed_windows(reports),
        "recent_votes": {
            state_name: len(
                {
                    report.author_id
                    for report in reports
                    if report.observed_on >= fresh_from and report.state == getattr(RipenessReport.STATE, state_name)
                }
            )
            for state_name in RipenessReport.STATE.names
        },
    }


def filter_in_month(queryset, month):
    """Plants whose kind typically ripens in the month (1–12)."""
    return queryset.filter(kind_id__in=seasons.kinds_in_month(specs_by_kind(), month))


def filter_reported_ripe(queryset, day=None):
    """Plants whose latest report from the last days says they are ripe."""
    day = day or today()
    latest_state = (
        RipenessReport.objects.filter(
            fruit=OuterRef("pk"),
            observed_on__gte=day - datetime.timedelta(days=seasons.REPORT_VALID_DAYS),
            observed_on__lte=day,
        )
        .order_by("-observed_on", "-state")
        .values("state")[:1]
    )
    return queryset.annotate(latest_ripeness=Subquery(latest_state)).filter(latest_ripeness=seasons.RIPE)


def fruit_in_area(area, kinds=None):
    queryset = Fruit.objects.valid().filter(position__within=area)
    if kinds:
        queryset = queryset.filter(kind__in=kinds)
    return queryset


def area_overview(area, kinds=None, day=None):
    """Kinds mapped in an area with their plant counts and next (or running) harvest windows."""
    day = day or today()
    fruit_ids_by_kind = defaultdict(list)
    for fruit_id, kind_id in fruit_in_area(area, kinds).values_list("id", "kind_id"):
        fruit_ids_by_kind[kind_id].append(fruit_id)

    all_specs = specs_by_kind()
    reports = reports_for_fruits([fid for ids in fruit_ids_by_kind.values() for fid in ids], day)
    overview = []
    for kind in Kind.objects.valid().filter(id__in=fruit_ids_by_kind.keys()):
        windows = seasons.area_windows(all_specs.get(kind.id, []), reports, fruit_ids_by_kind[kind.id], day)
        overview.append({"kind": kind, "count": len(fruit_ids_by_kind[kind.id]), "windows": windows})

    return sorted(overview, key=lambda row: (row["windows"][0].start if row["windows"] else datetime.date.max))


def calendar(area=None, day=None):
    """Typical months and monthly counts of ripe reports per kind, optionally limited to an area."""
    day = day or today()
    fruit = Fruit.objects.valid()
    if area is not None:
        fruit = fruit.filter(position__within=area)

    counts = dict(fruit.order_by().values("kind_id").annotate(n=Count("id")).values_list("kind_id", "n"))

    ripe_by_month = defaultdict(lambda: [0] * 12)
    ripe_reports = (
        RipenessReport.objects.filter(
            fruit__in=fruit,
            state=seasons.RIPE,
            observed_on__gte=_report_history_start(day),
        )
        .annotate(month=ExtractMonth("observed_on"))
        .order_by()
        .values("fruit__kind_id", "month")
        .annotate(n=Count("id"))
    )
    for row in ripe_reports:
        ripe_by_month[row["fruit__kind_id"]][row["month"] - 1] = row["n"]

    all_specs = specs_by_kind()
    kinds = Kind.objects.valid().filter(Q(id__in=all_specs.keys()) | Q(id__in=counts.keys()))
    return [
        {
            "kind": kind,
            "count": counts.get(kind.id, 0),
            "typical": all_specs.get(kind.id, []),
            "ripe_reports_by_month": ripe_by_month[kind.id],
        }
        for kind in kinds
    ]
