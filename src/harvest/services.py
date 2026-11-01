"""Database access for harvest seasons: loads specs and reports and feeds them to `seasons`."""
import datetime
from collections import defaultdict

from django.db.models import Count, Exists, OuterRef, Q, Subquery
from django.db.models.functions import ExtractMonth
from django.utils import timezone

from fruit.models import Fruit, Kind
from herbarium.models import Season

from . import seasons
from .models import RipenessReport

# Older observations say little about today's climate and the plant's current state.
REPORT_HISTORY_YEARS = 5

NEWS_PHASES = (seasons.PHASE_STARTED, seasons.PHASE_SOON, seasons.PHASE_RUNNING, seasons.PHASE_ENDING)


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
    """Plants whose kind typically ripens in the month (1–12) or that people reported ripe in that month."""
    reported = RipenessReport.objects.filter(
        fruit=OuterRef("pk"),
        state=seasons.RIPE,
        observed_on__month=month,
        observed_on__gte=_report_history_start(today()),
    )
    return queryset.annotate(reported_in_month=Exists(reported)).filter(
        Q(kind_id__in=seasons.kinds_in_month(specs_by_kind(), month)) | Q(reported_in_month=True)
    )


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


def kind_windows(day=None):
    """Running or next season windows per kind over the whole map, refined by people's reports."""
    day = day or today()
    reports_by_fruit = defaultdict(list)
    fruit_ids_by_kind = defaultdict(set)
    rows = RipenessReport.objects.filter(
        fruit__in=Fruit.objects.valid(),
        observed_on__gte=_report_history_start(day),
        observed_on__lte=day,
    ).values_list("fruit_id", "fruit__kind_id", "observed_on", "state", "author_id")
    for fruit_id, kind_id, observed_on, state, author_id in rows:
        reports_by_fruit[fruit_id].append(seasons.Report(observed_on, state, author_id))
        fruit_ids_by_kind[kind_id].add(fruit_id)

    return {
        kind_id: seasons.area_windows(specs, reports_by_fruit, fruit_ids_by_kind[kind_id], day)
        for kind_id, specs in specs_by_kind().items()
    }


def season_news(day=None, lead_days=30, kinds=None):
    """What starts, runs and ends now: kinds grouped by the phase of their season.

    Each item: kind, its window, number of mapped places and of ripe reports from the last days.
    `kinds` limits the news to followed kinds (None = all).
    """
    day = day or today()
    places = dict(
        Fruit.objects.valid().order_by().values("kind_id").annotate(n=Count("id")).values_list("kind_id", "n")
    )
    ripe_recent = dict(
        RipenessReport.objects.filter(
            fruit__in=Fruit.objects.valid(),
            state=seasons.RIPE,
            observed_on__gte=day - datetime.timedelta(days=seasons.REPORT_VALID_DAYS),
            observed_on__lte=day,
        )
        .order_by()
        .values("fruit__kind_id")
        .annotate(n=Count("id"))
        .values_list("fruit__kind_id", "n")
    )
    followed = {kind.id for kind in kinds} if kinds else None
    by_id = {kind.id: kind for kind in Kind.objects.valid()}

    news = {phase: [] for phase in NEWS_PHASES}
    for kind_id, windows in kind_windows(day).items():
        kind = by_id.get(kind_id)
        if kind is None or not places.get(kind_id) or (followed is not None and kind_id not in followed):
            continue
        for window in windows:
            phase = seasons.season_phase(window, day, lead_days)
            if phase:
                news[phase].append(
                    {
                        "kind": kind,
                        "window": window,
                        "count": places[kind_id],
                        "ripe_reports": ripe_recent.get(kind_id, 0),
                    }
                )
                break
    for items in news.values():
        items.sort(key=lambda item: (item["window"].start, item["kind"].name))

    news["ripe_now"] = sorted(
        (
            {"kind": by_id[kind_id], "window": None, "count": places.get(kind_id, 0), "ripe_reports": count}
            for kind_id, count in ripe_recent.items()
            if kind_id in by_id and (followed is None or kind_id in followed)
        ),
        key=lambda item: -item["ripe_reports"],
    )
    return news


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
