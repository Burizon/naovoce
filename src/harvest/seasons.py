"""Harvest season arithmetic without database access.

Two sources describe when a plant can be harvested:

* typical seasons per kind from herbarium (month ranges of a ripening plant part in Czechia),
* ripeness reports of users on concrete plants (exact days, varying by year, place and variety).

Reports of past years predict this year's window of the very same plant; without them
the typical season of its kind is used.
"""
import calendar
import datetime
from collections import defaultdict
from dataclasses import dataclass
from statistics import median

RIPE = 2000
OVER = 3000
UNRIPE = 1000

# A report describes the plant's current state only for a limited time.
REPORT_VALID_DAYS = 10
# Window shorter than this is extended; a single ripe report still means a few days of harvest.
MIN_OBSERVED_DAYS = 7
# Season starting within this many days is "soon".
UPCOMING_DAYS = 30

STATUS_RIPE = "ripe"
STATUS_OVER = "over"
STATUS_UNRIPE = "unripe"
STATUS_IN_SEASON = "in_season"
STATUS_SOON = "soon"
STATUS_OFF = "off"
STATUS_UNKNOWN = "unknown"

SOURCE_TYPICAL = "typical"
SOURCE_OBSERVED = "observed"
SOURCE_REPORTED = "reported"


@dataclass(frozen=True)
class SeasonSpec:
    """Typical season of one plant part: starting month and duration in months."""

    part: str
    start: int
    duration: int

    @property
    def months(self):
        return season_months(self.start, self.duration)


@dataclass(frozen=True)
class Window:
    """Concrete harvest window in dates."""

    part: str
    start: datetime.date
    end: datetime.date
    source: str

    def contains(self, day):
        return self.start <= day <= self.end

    def as_dict(self):
        return {
            "part": self.part,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "source": self.source,
        }


@dataclass(frozen=True)
class Report:
    """Minimal ripeness report data the arithmetic needs."""

    observed_on: datetime.date
    state: int
    author_id: int


def season_months(start, duration):
    """Months (1–12) covered by a season, wrapping over the New Year."""
    duration = max(1, min(duration, 12))
    return [(start - 1 + offset) % 12 + 1 for offset in range(duration)]


def typical_window(spec, year):
    """Dates of the typical season occurrence starting in `year`."""
    duration = max(1, min(spec.duration, 12))
    last_month_index = spec.start - 1 + duration - 1
    end_year = year + last_month_index // 12
    end_month = last_month_index % 12 + 1
    end = datetime.date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])
    return Window(spec.part, datetime.date(year, spec.start, 1), end, SOURCE_TYPICAL)


def current_or_next_window(spec, day):
    """The typical occurrence running on `day`, or the next one."""
    for year in (day.year - 1, day.year, day.year + 1):
        window = typical_window(spec, year)
        if window.end >= day:
            return window
    raise AssertionError("A season occurrence always ends within two years.")  # pragma: no cover


# Days are compared within a common non-leap year so that 10 June is the same day every year.
_COMMON_YEAR = 2001


def _season_day(day):
    """Day of a common year (1–365) with the same month and day; 29 February counts as the 28th."""
    return datetime.date(_COMMON_YEAR, day.month, min(day.day, 28) if day.month == 2 else day.day).timetuple().tm_yday


def _from_season_day(year, season_day):
    common = datetime.date(_COMMON_YEAR, 1, 1) + datetime.timedelta(days=int(season_day) - 1)
    return common.replace(year=year)


def ripe_dates_by_year(reports):
    by_year = defaultdict(list)
    for report in reports:
        if report.state == RIPE:
            by_year[report.observed_on.year].append(report.observed_on)
    return {year: sorted(dates) for year, dates in by_year.items()}


def observed_windows(reports):
    """Per year: first and last day the plant was reported ripe and how many people reported it."""
    reporters = defaultdict(set)
    for report in reports:
        if report.state == RIPE:
            reporters[report.observed_on.year].add(report.author_id)

    return [
        {
            "year": year,
            "first_ripe": dates[0].isoformat(),
            "last_ripe": dates[-1].isoformat(),
            "reports": len(dates),
            "reporters": len(reporters[year]),
        }
        for year, dates in sorted(ripe_dates_by_year(reports).items())
    ]


def _matching_part(specs, dates):
    """Name of the typical season the reported dates belong to (the one covering most of them)."""
    if not specs:
        return ""

    def score(spec):
        return sum(date.month in spec.months for date in dates)

    return max(specs, key=score).part


def predicted_window(specs, reports, day):
    """This year's window of a concrete plant.

    Precedence: ripe reports of this year, then the median of past years' windows, then the
    typical season of the kind (running now or next). Returns None when nothing is known.
    """
    by_year = ripe_dates_by_year(reports)
    past = {year: dates for year, dates in by_year.items() if year < day.year}
    current = by_year.get(day.year)

    if past:
        starts = [_season_day(dates[0]) for dates in past.values()]
        ends = [_season_day(dates[-1]) for dates in past.values()]
        start_day = median(starts)
        end_day = min(max(median(ends), start_day + MIN_OBSERVED_DAYS - 1), 365)
        start = _from_season_day(day.year, start_day)
        end = _from_season_day(day.year, end_day)
        part = _matching_part(specs, [date for dates in past.values() for date in dates])
        base = Window(part, start, end, SOURCE_OBSERVED)
    elif specs:
        typical = sorted((current_or_next_window(spec, day) for spec in specs), key=lambda w: w.start)
        base = typical[0]
        if current:
            part = _matching_part(specs, current)
            base = next((w for w in typical if w.part == part), base)
    else:
        base = None

    if not current:
        return base

    start = current[0]
    end = max(current[-1], start + datetime.timedelta(days=MIN_OBSERVED_DAYS - 1))
    part = base.part if base else _matching_part(specs, current)
    if base and base.start.year == day.year and base.end > end:
        end = base.end
    return Window(part, start, end, SOURCE_REPORTED)


def latest_report(reports):
    return max(reports, key=lambda report: report.observed_on, default=None)


def status(window, reports, day):
    """Harvest status of a plant on `day`.

    A fresh report wins over predictions: people standing under the tree know best.
    """
    fresh = [
        report
        for report in reports
        if report.observed_on <= day and (day - report.observed_on).days <= REPORT_VALID_DAYS
    ]
    if fresh:
        newest_day = max(report.observed_on for report in fresh)
        states = {report.state for report in fresh if report.observed_on == newest_day}
        if RIPE in states:
            return STATUS_RIPE
        if OVER in states:
            return STATUS_OVER
        return STATUS_UNRIPE

    if window is None:
        return STATUS_UNKNOWN
    if window.contains(day):
        return STATUS_IN_SEASON
    if 0 < (window.start - day).days <= UPCOMING_DAYS:
        return STATUS_SOON
    return STATUS_OFF


def kinds_in_month(specs_by_kind, month):
    """Kind ids whose typical season covers the month."""
    return {kind_id for kind_id, specs in specs_by_kind.items() if any(month in spec.months for spec in specs)}


def area_windows(specs, reports_by_fruit, fruit_ids, day):
    """Earliest upcoming or running window per plant part over all plants of one kind in an area.

    Used by harvest alerts: the season "starts in the area" when the first observed plant there
    ripens. Plants nobody reported on do not count, they would always win with the coarse typical
    season starting on the first day of a month; the typical season covers parts without reports.
    """
    windows = {}
    for fruit_id in fruit_ids:
        if not (reports := reports_by_fruit.get(fruit_id)):
            continue
        window = predicted_window(specs, reports, day)
        if window is None or window.end < day:
            continue
        known = windows.get(window.part)
        if known is None or window.start < known.start:
            windows[window.part] = window

    for spec in specs:
        if spec.part not in windows:
            windows[spec.part] = current_or_next_window(spec, day)

    return sorted(windows.values(), key=lambda window: window.start)
